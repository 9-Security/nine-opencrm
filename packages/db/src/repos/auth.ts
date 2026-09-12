import { createHash, randomBytes } from 'node:crypto';
import { compare } from 'bcryptjs';
import { prisma } from '../client';
import {
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '../errors';
import {
  envMailTargets,
  filterMailTargets,
  isBlockedMailHost,
  mailAuthenticator,
  type MailTarget,
} from '../mail-auth';
import {
  clearRateLimit,
  FIRST_FACTOR_LIMIT,
  FIRST_FACTOR_WINDOW_MS,
  peekRateLimit,
  rateLimitKey,
  recordRateLimitHit,
} from '../rate-limit';
import { decryptSecret, encryptSecret } from '../secret-box';
import {
  consumeBackupCode,
  generateBackupCodes,
  generateTotpSecret,
  verifyTotpCode,
} from '../totp';

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const UNKNOWN_USER_HASH = '$2b$10$Dsn1/po2ZILJSrlTnD.94e/BQrYPVXk4v6GUGWU2xxQuYaR5iKAmm';

export type FirstFactor = 'password' | 'imap' | 'pop3';

function hashToken(raw: string) {
  return createHash('sha256').update(raw).digest('hex');
}

function tenantTargets(tenant: {
  mailAuthEnabled: boolean;
  mailImapHost: string | null;
  mailImapPort: number;
  mailPop3Host: string | null;
  mailPop3Port: number;
}): MailTarget[] {
  if (!tenant.mailAuthEnabled) return [];
  const targets: MailTarget[] = [];
  if (tenant.mailImapHost?.trim() && !isBlockedMailHost(tenant.mailImapHost)) {
    targets.push({
      protocol: 'imap',
      host: tenant.mailImapHost.trim(),
      port: tenant.mailImapPort || 993,
    });
  }
  if (tenant.mailPop3Host?.trim() && !isBlockedMailHost(tenant.mailPop3Host)) {
    targets.push({
      protocol: 'pop3',
      host: tenant.mailPop3Host.trim(),
      port: tenant.mailPop3Port || 995,
    });
  }
  return targets;
}

export async function verifyFirstFactor(email: string, password: string) {
  const normalized = email.trim().toLowerCase();
  if (!normalized || !password) return null;
  const limitKey = rateLimitKey(['verify-first-factor', normalized]);
  const limited = !peekRateLimit(limitKey, FIRST_FACTOR_LIMIT);

  const user = await prisma.user.findUnique({
    where: { email: normalized },
    include: {
      memberships: {
        where: { status: 'active' },
        include: {
          tenant: {
            select: {
              mailAuthEnabled: true,
              mailImapHost: true,
              mailImapPort: true,
              mailPop3Host: true,
              mailPop3Port: true,
              require2fa: true,
            },
          },
        },
      },
    },
  });
  if (!user) {
    await compare(password, UNKNOWN_USER_HASH);
    if (!limited) recordRateLimitHit(limitKey, FIRST_FACTOR_WINDOW_MS);
    return null;
  }

  const passwordOk = await compare(password, user.passwordHash);
  if (passwordOk) {
    clearRateLimit(limitKey);
    return { user, firstFactor: 'password' as const };
  }

  if (limited) return null;

  const targets = filterMailTargets([
    ...envMailTargets(),
    ...user.memberships.flatMap((membership) => tenantTargets(membership.tenant)),
  ]);
  const auth = mailAuthenticator();
  for (const target of targets) {
    const ok = await auth({
      ...target,
      username: normalized,
      password,
    });
    if (ok) {
      clearRateLimit(limitKey);
      return {
        user,
        firstFactor: (target.protocol === 'imap' ? 'imap' : 'pop3') as FirstFactor,
      };
    }
  }
  recordRateLimitHit(limitKey, FIRST_FACTOR_WINDOW_MS);
  return null;
}

export async function completePasswordLogin(email: string, password: string) {
  const result = await verifyFirstFactor(email, password);
  if (!result) return null;
  if (result.user.totpEnabled) return null;
  return result.user;
}

export async function createLoginChallenge(userId: string, firstFactor: FirstFactor) {
  const raw = randomBytes(32).toString('hex');
  await prisma.loginChallenge.deleteMany({ where: { userId } });
  await prisma.loginChallenge.create({
    data: {
      userId,
      tokenHash: hashToken(raw),
      firstFactor,
      expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
    },
  });
  return raw;
}

export async function invalidateLoginChallenge(rawToken: string) {
  await prisma.loginChallenge.updateMany({
    where: { tokenHash: hashToken(rawToken), consumedAt: null },
    data: { consumedAt: new Date() },
  });
}

export async function getChallengeUser(rawToken: string) {
  const row = await prisma.loginChallenge.findUnique({
    where: { tokenHash: hashToken(rawToken) },
    include: { user: true },
  });
  if (!row || row.consumedAt) return null;
  if (row.expiresAt.getTime() < Date.now()) return null;
  return row;
}

export async function markChallengeTotpVerified(rawToken: string) {
  const tokenHash = hashToken(rawToken);
  const updated = await prisma.loginChallenge.updateMany({
    where: {
      tokenHash,
      consumedAt: null,
      expiresAt: { gt: new Date() },
    },
    data: { totpVerified: true },
  });
  if (updated.count !== 1) {
    throw new UnauthorizedError('Login challenge expired');
  }
}

export async function consumeLoginChallenge(rawToken: string) {
  const tokenHash = hashToken(rawToken);
  const row = await prisma.loginChallenge.findUnique({
    where: { tokenHash },
    include: { user: true },
  });
  if (!row || row.consumedAt) return null;
  if (row.expiresAt.getTime() < Date.now()) return null;
  if (row.user.totpEnabled && !row.totpVerified) return null;

  const consumed = await prisma.loginChallenge.updateMany({
    where: {
      id: row.id,
      tokenHash,
      consumedAt: null,
      expiresAt: { gt: new Date() },
      ...(row.user.totpEnabled ? { totpVerified: true } : {}),
    },
    data: { consumedAt: new Date() },
  });
  if (consumed.count !== 1) return null;
  return row.user;
}

export function userRequiresTwoFactor(user: {
  totpEnabled: boolean;
  memberships?: Array<{ tenant: { require2fa: boolean } }>;
}) {
  if (user.totpEnabled) return true;
  return Boolean(user.memberships?.some((m) => m.tenant.require2fa));
}

export function isAccountTwoFactorApi(pathname: string) {
  return pathname === '/api/account/2fa' || pathname.startsWith('/api/account/2fa/');
}

export function apiBlockedForMissing2fa(params: {
  require2fa: boolean;
  totpEnabled: boolean;
  pathname: string;
}) {
  return (
    params.require2fa && !params.totpEnabled && !isAccountTwoFactorApi(params.pathname)
  );
}

export async function verifySecondFactor(rawToken: string, code: string) {
  const row = await getChallengeUser(rawToken);
  if (!row) throw new UnauthorizedError('Login challenge expired');
  if (!row.user.totpEnabled) {
    throw new ValidationError('Two-factor authentication is not enabled');
  }
  const secret = row.user.totpSecretEnc ? decryptSecret(row.user.totpSecretEnc) : '';
  if (secret && verifyTotpCode(secret, code)) {
    await markChallengeTotpVerified(rawToken);
    return { ok: true as const };
  }
  const remaining = await consumeBackupCode(row.user.totpBackupHashes, code);
  if (remaining) {
    await prisma.user.update({
      where: { id: row.user.id },
      data: { totpBackupHashes: remaining },
    });
    await markChallengeTotpVerified(rawToken);
    return { ok: true as const };
  }
  throw new ValidationError('Invalid authentication code');
}

export function beginTotpEnrollment(email: string) {
  return generateTotpSecret(email);
}

export async function verifyCurrentTwoFactorIfEnabled(
  userId: string,
  code: string | undefined,
) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.totpEnabled) return;
  if (!code) {
    throw new ValidationError('Current authentication code is required');
  }
  const secret = user.totpSecretEnc ? decryptSecret(user.totpSecretEnc) : '';
  if (secret && verifyTotpCode(secret, code)) return;
  const remaining = await consumeBackupCode(user.totpBackupHashes, code);
  if (!remaining) {
    throw new ValidationError('Invalid authentication code');
  }
  await prisma.user.update({
    where: { id: userId },
    data: { totpBackupHashes: remaining },
  });
}

export async function confirmTotpEnrollment(
  userId: string,
  secret: string,
  code: string,
  currentCode?: string,
) {
  await verifyCurrentTwoFactorIfEnabled(userId, currentCode);
  if (!verifyTotpCode(secret, code)) {
    throw new ValidationError('Invalid authentication code');
  }
  const backups = await generateBackupCodes();
  await prisma.user.update({
    where: { id: userId },
    data: {
      totpSecretEnc: encryptSecret(secret),
      totpEnabled: true,
      totpBackupHashes: backups.hashes,
    },
  });
  return backups.codes;
}

export async function disableTotp(userId: string, code: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.totpEnabled || !user.totpSecretEnc) {
    throw new ValidationError('Two-factor authentication is not enabled');
  }
  const required = await tenantRequires2fa(userId);
  if (required) {
    throw new ForbiddenError('Your organization requires 2FA');
  }
  const secret = decryptSecret(user.totpSecretEnc);
  const totpOk = verifyTotpCode(secret, code);
  const remaining = totpOk
    ? user.totpBackupHashes
    : await consumeBackupCode(user.totpBackupHashes, code);
  if (!totpOk && !remaining) {
    throw new ValidationError('Invalid authentication code');
  }
  await prisma.user.update({
    where: { id: userId },
    data: {
      totpEnabled: false,
      totpSecretEnc: null,
      totpBackupHashes: [],
    },
  });
}

export async function tenantRequires2fa(userId: string) {
  const memberships = await prisma.membership.findMany({
    where: { userId, status: 'active' },
    include: { tenant: { select: { require2fa: true } } },
  });
  return memberships.some((m) => m.tenant.require2fa);
}

export async function getUserAuthStatus(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { totpEnabled: true },
  });
  if (!user) throw new NotFoundError('User not found');
  return {
    totpEnabled: user.totpEnabled,
    require2fa: await tenantRequires2fa(userId),
  };
}
