import { describe, expect, it, afterEach } from 'vitest';
import {
  authRepo,
  prisma,
  setMailAuthenticator,
  verifyTotpCode,
  generateTotpSecret,
  tenantsRepo,
  UnauthorizedError,
  ValidationError,
  peekRateLimit,
  recordRateLimitHit,
  resetAllRateLimits,
  FIRST_FACTOR_LIMIT,
} from '@crm/db';
import { Secret, TOTP } from 'otpauth';
import { createTenantUser } from './helpers';

afterEach(() => {
  setMailAuthenticator(null);
  resetAllRateLimits();
});

function currentCode(secretBase32: string) {
  return new TOTP({
    secret: Secret.fromBase32(secretBase32),
    digits: 6,
    period: 30,
    algorithm: 'SHA1',
  }).generate();
}

describe('mail + 2FA login', () => {
  it('accepts local password as first factor', async () => {
    const a = await createTenantUser('admin');
    const result = await authRepo.verifyFirstFactor(a.user.email, 'Password123!');
    expect(result?.firstFactor).toBe('password');
    expect(result?.user.id).toBe(a.user.id);
  });

  it('accepts IMAPS authenticator when local password does not match', async () => {
    const a = await createTenantUser('admin');
    await prisma.tenant.update({
      where: { id: a.tenant.id },
      data: {
        mailAuthEnabled: true,
        mailImapHost: 'mail.example.test',
        mailImapPort: 993,
      },
    });
    setMailAuthenticator(async (req) => {
      return (
        req.protocol === 'imap' &&
        req.host === 'mail.example.test' &&
        req.username === a.user.email &&
        req.password === 'MailboxPass!'
      );
    });
    const result = await authRepo.verifyFirstFactor(a.user.email, 'MailboxPass!');
    expect(result?.firstFactor).toBe('imap');
  });

  it('rejects unknown mailbox credentials with the same null result', async () => {
    const a = await createTenantUser('admin');
    setMailAuthenticator(async () => false);
    await expect(authRepo.verifyFirstFactor(a.user.email, 'nope')).resolves.toBeNull();
    await expect(
      authRepo.verifyFirstFactor('missing@test.local', 'Password123!'),
    ).resolves.toBeNull();
  });

  it('does not probe private mail hosts even if the authenticator would accept them', async () => {
    const a = await createTenantUser('admin');
    await prisma.tenant.update({
      where: { id: a.tenant.id },
      data: {
        mailAuthEnabled: true,
        mailImapHost: '127.0.0.1',
        mailImapPort: 993,
      },
    });
    let called = false;
    setMailAuthenticator(async () => {
      called = true;
      return true;
    });
    await expect(
      authRepo.verifyFirstFactor(a.user.email, 'MailboxPass!'),
    ).resolves.toBeNull();
    expect(called).toBe(false);
  });

  it('stops probing mail after repeated first-factor failures', async () => {
    const a = await createTenantUser('admin');
    await prisma.tenant.update({
      where: { id: a.tenant.id },
      data: {
        mailAuthEnabled: true,
        mailImapHost: 'mail.example.test',
        mailImapPort: 993,
      },
    });
    let called = 0;
    setMailAuthenticator(async () => {
      called += 1;
      return false;
    });
    for (let i = 0; i < FIRST_FACTOR_LIMIT; i += 1) {
      await expect(
        authRepo.verifyFirstFactor(a.user.email, 'MailboxPass!'),
      ).resolves.toBeNull();
    }
    const probed = called;
    expect(probed).toBe(FIRST_FACTOR_LIMIT);
    await expect(
      authRepo.verifyFirstFactor(a.user.email, 'MailboxPass!'),
    ).resolves.toBeNull();
    expect(called).toBe(probed);
    const recovered = await authRepo.verifyFirstFactor(a.user.email, 'Password123!');
    expect(recovered?.firstFactor).toBe('password');
  });

  it('requires TOTP after first factor when 2FA is enabled', async () => {
    const a = await createTenantUser('admin');
    const { secret } = generateTotpSecret(a.user.email);
    const code = currentCode(secret);
    expect(verifyTotpCode(secret, code)).toBe(true);
    await authRepo.confirmTotpEnrollment(a.user.id, secret, code);

    const first = await authRepo.verifyFirstFactor(a.user.email, 'Password123!');
    expect(first?.user.totpEnabled).toBe(true);
    const ticket = await authRepo.createLoginChallenge(a.user.id, 'password');
    await expect(authRepo.consumeLoginChallenge(ticket)).resolves.toBeNull();
    await authRepo.verifySecondFactor(ticket, currentCode(secret));
    const user = await authRepo.consumeLoginChallenge(ticket);
    expect(user?.id).toBe(a.user.id);
    await expect(authRepo.consumeLoginChallenge(ticket)).resolves.toBeNull();
  });

  it('uses a backup code once', async () => {
    const a = await createTenantUser('admin');
    const { secret } = generateTotpSecret(a.user.email);
    const backups = await authRepo.confirmTotpEnrollment(
      a.user.id,
      secret,
      currentCode(secret),
    );
    const ticket = await authRepo.createLoginChallenge(a.user.id, 'password');
    await authRepo.verifySecondFactor(ticket, backups[0]!);
    const user = await authRepo.consumeLoginChallenge(ticket);
    expect(user?.id).toBe(a.user.id);
    const ticket2 = await authRepo.createLoginChallenge(a.user.id, 'password');
    await expect(authRepo.verifySecondFactor(ticket2, backups[0]!)).rejects.toThrow(
      /Invalid authentication code/,
    );
  });
});

describe('login challenge hardening', () => {
  it('ignores a leftover challenge when another user signs in with a password', async () => {
    const previous = await createTenantUser('admin');
    const next = await createTenantUser('sales');
    const leftover = await authRepo.createLoginChallenge(previous.user.id, 'password');
    const loggedIn = await authRepo.completePasswordLogin(
      next.user.email,
      'Password123!',
    );
    expect(loggedIn?.id).toBe(next.user.id);
    const stillPrevious = await authRepo.consumeLoginChallenge(leftover);
    expect(stillPrevious?.id).toBe(previous.user.id);
  });

  it('does not complete a password login when the account has 2FA enabled', async () => {
    const a = await createTenantUser('admin');
    const { secret } = generateTotpSecret(a.user.email);
    await authRepo.confirmTotpEnrollment(a.user.id, secret, currentCode(secret));
    await expect(
      authRepo.completePasswordLogin(a.user.email, 'Password123!'),
    ).resolves.toBeNull();
  });

  it('replaces outstanding challenges for the same user', async () => {
    const a = await createTenantUser('admin');
    const first = await authRepo.createLoginChallenge(a.user.id, 'password');
    const second = await authRepo.createLoginChallenge(a.user.id, 'password');
    await expect(authRepo.consumeLoginChallenge(first)).resolves.toBeNull();
    const user = await authRepo.consumeLoginChallenge(second);
    expect(user?.id).toBe(a.user.id);
  });

  it('consumes a challenge at most once under concurrent callers', async () => {
    const a = await createTenantUser('admin');
    const ticket = await authRepo.createLoginChallenge(a.user.id, 'password');
    const [one, two] = await Promise.all([
      authRepo.consumeLoginChallenge(ticket),
      authRepo.consumeLoginChallenge(ticket),
    ]);
    const winners = [one, two].filter(Boolean);
    expect(winners).toHaveLength(1);
    expect(winners[0]?.id).toBe(a.user.id);
  });

  it('returns 401-class error for an expired challenge', async () => {
    const a = await createTenantUser('admin');
    const { secret } = generateTotpSecret(a.user.email);
    await authRepo.confirmTotpEnrollment(a.user.id, secret, currentCode(secret));
    const ticket = await authRepo.createLoginChallenge(a.user.id, 'password');
    await prisma.loginChallenge.updateMany({
      where: { userId: a.user.id },
      data: { expiresAt: new Date(0) },
    });
    await expect(
      authRepo.verifySecondFactor(ticket, currentCode(secret)),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });
});

describe('2FA enrollment and tenant require2fa', () => {
  it('blocks API access until TOTP is enrolled when the tenant requires 2FA', () => {
    expect(
      authRepo.apiBlockedForMissing2fa({
        require2fa: true,
        totpEnabled: false,
        pathname: '/api/companies',
      }),
    ).toBe(true);
    expect(
      authRepo.apiBlockedForMissing2fa({
        require2fa: true,
        totpEnabled: false,
        pathname: '/api/account/2fa',
      }),
    ).toBe(false);
    expect(
      authRepo.apiBlockedForMissing2fa({
        require2fa: true,
        totpEnabled: true,
        pathname: '/api/tickets',
      }),
    ).toBe(false);
  });

  it('requires the current factor before replacing an authenticator', async () => {
    const a = await createTenantUser('admin');
    const first = generateTotpSecret(a.user.email);
    await authRepo.confirmTotpEnrollment(
      a.user.id,
      first.secret,
      currentCode(first.secret),
    );
    const next = generateTotpSecret(a.user.email);
    await expect(
      authRepo.confirmTotpEnrollment(a.user.id, next.secret, currentCode(next.secret)),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      authRepo.verifyCurrentTwoFactorIfEnabled(a.user.id, undefined),
    ).rejects.toThrow(/Current authentication code is required/);
    const codes = await authRepo.confirmTotpEnrollment(
      a.user.id,
      next.secret,
      currentCode(next.secret),
      currentCode(first.secret),
    );
    expect(codes.length).toBeGreaterThan(0);
  });

  it('rejects private mail hosts when saving tenant settings', async () => {
    const a = await createTenantUser('admin');
    await expect(
      tenantsRepo.updateTenantSettings(a.tenant.id, { mailImapHost: '169.254.169.254' }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('in-memory rate limit', () => {
  it('blocks after the configured number of hits', () => {
    const key = 'first-factor:test:user@example.com';
    for (let i = 0; i < FIRST_FACTOR_LIMIT; i += 1) {
      expect(peekRateLimit(key, FIRST_FACTOR_LIMIT)).toBe(true);
      recordRateLimitHit(key, 60_000);
    }
    expect(peekRateLimit(key, FIRST_FACTOR_LIMIT)).toBe(false);
  });
});
