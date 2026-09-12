import type { Role } from '@crm/shared';
import { canWriteContacts } from '@crm/shared';
import { prisma } from '../client';
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
  requireTenantId,
} from '../errors';
import { assertOptionalRelations } from './tenant-guard';

export type ContactInput = {
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  companyId?: string | null;
  ownerMembershipId?: string | null;
};

const include = {
  company: { select: { id: true, name: true } },
  owner: {
    select: { id: true, role: true, user: { select: { name: true, email: true } } },
  },
} as const;

function assertWrite(role: Role) {
  if (!canWriteContacts(role)) {
    throw new ForbiddenError('You cannot modify contacts');
  }
}

export async function listContacts(
  tenantId: string,
  opts?: { q?: string; companyId?: string },
) {
  requireTenantId(tenantId);
  return prisma.contact.findMany({
    where: {
      tenantId,
      ...(opts?.companyId ? { companyId: opts.companyId } : {}),
      ...(opts?.q
        ? {
            OR: [
              { firstName: { contains: opts.q, mode: 'insensitive' } },
              { lastName: { contains: opts.q, mode: 'insensitive' } },
              { email: { contains: opts.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    orderBy: { updatedAt: 'desc' },
    include,
  });
}

export async function getContact(tenantId: string, id: string) {
  requireTenantId(tenantId);
  const contact = await prisma.contact.findFirst({
    where: { tenantId, id },
    include: {
      ...include,
      opportunities: {
        orderBy: { updatedAt: 'desc' },
        take: 20,
        select: { id: true, title: true, stage: true, amount: true },
      },
      tickets: {
        orderBy: { updatedAt: 'desc' },
        take: 20,
        select: { id: true, title: true, status: true, priority: true },
      },
      activities: { orderBy: { updatedAt: 'desc' }, take: 20 },
    },
  });
  if (!contact) return null;
  return {
    ...contact,
    opportunities: contact.opportunities.map((o) => ({
      ...o,
      amount: o.amount?.toString() ?? null,
    })),
  };
}

export async function getContactOrThrow(tenantId: string, id: string) {
  const contact = await getContact(tenantId, id);
  if (!contact) throw new NotFoundError('Contact not found');
  return contact;
}

export async function createContact(tenantId: string, role: Role, input: ContactInput) {
  requireTenantId(tenantId);
  assertWrite(role);
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  if (!firstName || !lastName) {
    throw new ValidationError('First and last name are required');
  }
  await assertOptionalRelations(tenantId, {
    companyId: input.companyId,
    membershipId: input.ownerMembershipId,
  });
  return prisma.contact.create({
    data: {
      tenantId,
      firstName,
      lastName,
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null,
      companyId: input.companyId || null,
      ownerMembershipId: input.ownerMembershipId || null,
    },
    include,
  });
}

export async function updateContact(
  tenantId: string,
  role: Role,
  id: string,
  input: Partial<ContactInput>,
) {
  requireTenantId(tenantId);
  assertWrite(role);
  await getContactOrThrow(tenantId, id);
  await assertOptionalRelations(tenantId, {
    companyId: input.companyId,
    membershipId: input.ownerMembershipId,
  });
  return prisma.contact.update({
    where: { id },
    data: {
      ...(input.firstName !== undefined ? { firstName: input.firstName.trim() } : {}),
      ...(input.lastName !== undefined ? { lastName: input.lastName.trim() } : {}),
      ...(input.email !== undefined ? { email: input.email?.trim() || null } : {}),
      ...(input.phone !== undefined ? { phone: input.phone?.trim() || null } : {}),
      ...(input.companyId !== undefined ? { companyId: input.companyId || null } : {}),
      ...(input.ownerMembershipId !== undefined
        ? { ownerMembershipId: input.ownerMembershipId || null }
        : {}),
    },
    include,
  });
}

export async function deleteContact(tenantId: string, role: Role, id: string) {
  requireTenantId(tenantId);
  assertWrite(role);
  await getContactOrThrow(tenantId, id);
  await prisma.contact.delete({ where: { id } });
}
