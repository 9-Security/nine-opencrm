import { hash } from 'bcryptjs';
import { prisma } from '../client';
import { ConflictError, ForbiddenError, ValidationError } from '../errors';
import { isBlockedMailHost } from '../mail-auth';

function slugify(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  return base || 'tenant';
}

export async function createTenantForUser(params: { userId: string; name: string }) {
  const name = params.name.trim();
  if (!name) {
    throw new Error('Tenant name is required');
  }
  const slugBase = slugify(name);
  let slug = slugBase;
  let n = 1;
  while (await prisma.tenant.findUnique({ where: { slug } })) {
    n += 1;
    slug = `${slugBase}-${n}`;
  }

  return prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({ data: { name, slug } });
    const membership = await tx.membership.create({
      data: {
        tenantId: tenant.id,
        userId: params.userId,
        role: 'admin',
        status: 'active',
      },
    });
    return { tenant, membership };
  });
}

export async function listMembershipsForUser(userId: string) {
  return prisma.membership.findMany({
    where: { userId, status: 'active' },
    include: { tenant: true, user: { select: { id: true, email: true, name: true } } },
    orderBy: { createdAt: 'asc' },
  });
}

export async function getActiveMembership(userId: string, tenantId: string) {
  return prisma.membership.findFirst({
    where: { userId, tenantId, status: 'active' },
    include: { tenant: true, user: { select: { id: true, email: true, name: true } } },
  });
}

export async function registerUser(params: {
  email: string;
  password: string;
  name?: string;
}) {
  const email = params.email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new ConflictError('這個 Email 已經註冊，請直接登入');
  }
  if (params.password.length < 8) {
    throw new Error('Password must be at least 8 characters');
  }
  const passwordHash = await hash(params.password, 12);
  return prisma.user.create({
    data: {
      email,
      name: params.name?.trim() || email.split('@')[0],
      passwordHash,
    },
  });
}

export async function listTenantMembers(tenantId: string) {
  return prisma.membership.findMany({
    where: { tenantId },
    include: { user: { select: { id: true, email: true, name: true } } },
    orderBy: { createdAt: 'asc' },
  });
}

export async function updateMemberRole(
  tenantId: string,
  membershipId: string,
  role: 'admin' | 'sales' | 'support' | 'engineering',
) {
  const membership = await prisma.membership.findFirst({
    where: { id: membershipId, tenantId },
  });
  if (!membership) {
    return null;
  }
  return prisma.membership.update({
    where: { id: membershipId },
    data: { role },
  });
}

export async function updateTenantSettings(
  tenantId: string,
  data: {
    name?: string;
    timezone?: string;
    workdays?: number[];
    mailAuthEnabled?: boolean;
    mailImapHost?: string | null;
    mailImapPort?: number;
    mailPop3Host?: string | null;
    mailPop3Port?: number;
    require2fa?: boolean;
  },
) {
  const mailImapHost =
    data.mailImapHost === undefined ? undefined : normalizeMailHost(data.mailImapHost);
  const mailPop3Host =
    data.mailPop3Host === undefined ? undefined : normalizeMailHost(data.mailPop3Host);

  return prisma.tenant.update({
    where: { id: tenantId },
    data: {
      ...(data.name !== undefined ? { name: data.name.trim() } : {}),
      ...(data.timezone !== undefined ? { timezone: data.timezone.trim() } : {}),
      ...(data.workdays !== undefined ? { workdays: data.workdays } : {}),
      ...(data.mailAuthEnabled !== undefined
        ? { mailAuthEnabled: data.mailAuthEnabled }
        : {}),
      ...(mailImapHost !== undefined ? { mailImapHost } : {}),
      ...(data.mailImapPort !== undefined ? { mailImapPort: data.mailImapPort } : {}),
      ...(mailPop3Host !== undefined ? { mailPop3Host } : {}),
      ...(data.mailPop3Port !== undefined ? { mailPop3Port: data.mailPop3Port } : {}),
      ...(data.require2fa !== undefined ? { require2fa: data.require2fa } : {}),
    },
  });
}

function normalizeMailHost(host: string | null) {
  const trimmed = host?.trim() || null;
  if (trimmed && isBlockedMailHost(trimmed)) {
    throw new ValidationError('Mail host is not allowed');
  }
  return trimmed;
}

export function parseWorkdays(value: unknown): number[] {
  if (!Array.isArray(value)) return [1, 2, 3, 4, 5];
  const days = value
    .map((n) => Number(n))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
  const unique = [...new Set(days)].sort((a, b) => a - b);
  return unique.length > 0 ? unique : [1, 2, 3, 4, 5];
}
