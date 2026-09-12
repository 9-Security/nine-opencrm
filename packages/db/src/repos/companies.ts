import type { Role } from '@crm/shared';
import { canWriteCompanies } from '@crm/shared';
import { prisma } from '../client';
import { ForbiddenError, NotFoundError, requireTenantId } from '../errors';
import { attachTags, entityIdsForTag, replaceTags } from './tags';
import { assertMembershipInTenant } from './tenant-guard';

export type CompanyInput = {
  name: string;
  website?: string | null;
  phone?: string | null;
  notes?: string | null;
  ownerMembershipId?: string | null;
  tags?: string[];
};

function scoped(tenantId: string) {
  return { tenantId: requireTenantId(tenantId), deletedAt: null };
}

export async function listCompanies(
  tenantId: string,
  opts?: { q?: string; take?: number; tag?: string; ownerMembershipId?: string },
) {
  requireTenantId(tenantId);
  let ids: string[] | undefined;
  if (opts?.tag?.trim()) {
    ids = await entityIdsForTag(tenantId, 'company', opts.tag);
    if (ids.length === 0) return [];
  }
  const rows = await prisma.company.findMany({
    where: {
      ...scoped(tenantId),
      ...(opts?.q ? { name: { contains: opts.q, mode: 'insensitive' } } : {}),
      ...(opts?.ownerMembershipId ? { ownerMembershipId: opts.ownerMembershipId } : {}),
      ...(ids ? { id: { in: ids } } : {}),
    },
    ...(opts?.take ? { take: opts.take } : {}),
    orderBy: { updatedAt: 'desc' },
    include: {
      owner: {
        select: { id: true, role: true, user: { select: { name: true, email: true } } },
      },
    },
  });
  return attachTags(tenantId, 'company', rows);
}

export async function getCompany(tenantId: string, id: string) {
  const company = await prisma.company.findFirst({
    where: { ...scoped(tenantId), id },
    include: {
      owner: {
        select: { id: true, role: true, user: { select: { name: true, email: true } } },
      },
      contacts: {
        orderBy: { updatedAt: 'desc' },
        take: 20,
        select: { id: true, firstName: true, lastName: true, email: true, phone: true },
      },
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
    },
  });
  return company
    ? {
        ...company,
        opportunities: company.opportunities.map((o) => ({
          ...o,
          amount: o.amount?.toString() ?? null,
        })),
        tags: (await attachTags(tenantId, 'company', [company]))[0]?.tags ?? [],
      }
    : null;
}

/** Cross-tenant reads must look like missing rows (404), never 403. */
export async function getCompanyOrThrow(tenantId: string, id: string) {
  const company = await getCompany(tenantId, id);
  if (!company) {
    throw new NotFoundError('Company not found');
  }
  return company;
}

function assertWrite(role: Role) {
  if (!canWriteCompanies(role)) {
    throw new ForbiddenError('You cannot modify companies');
  }
}

export async function createCompany(tenantId: string, role: Role, input: CompanyInput) {
  requireTenantId(tenantId);
  assertWrite(role);
  const name = input.name.trim();
  if (!name) {
    throw new Error('Company name is required');
  }
  if (input.ownerMembershipId) {
    await assertMembershipInTenant(tenantId, input.ownerMembershipId);
  }
  const company = await prisma.company.create({
    data: {
      tenantId,
      name,
      website: input.website?.trim() || null,
      phone: input.phone?.trim() || null,
      notes: input.notes?.trim() || null,
      ownerMembershipId: input.ownerMembershipId || null,
    },
  });
  if (input.tags) {
    await replaceTags(tenantId, 'company', company.id, input.tags);
  }
  return getCompanyOrThrow(tenantId, company.id);
}

export async function updateCompany(
  tenantId: string,
  role: Role,
  id: string,
  input: Partial<CompanyInput>,
) {
  requireTenantId(tenantId);
  assertWrite(role);
  await getCompanyOrThrow(tenantId, id);
  if (input.ownerMembershipId) {
    await assertMembershipInTenant(tenantId, input.ownerMembershipId);
  }
  const updated = await prisma.company.updateMany({
    where: { id, tenantId, deletedAt: null },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.website !== undefined ? { website: input.website?.trim() || null } : {}),
      ...(input.phone !== undefined ? { phone: input.phone?.trim() || null } : {}),
      ...(input.notes !== undefined ? { notes: input.notes?.trim() || null } : {}),
      ...(input.ownerMembershipId !== undefined
        ? { ownerMembershipId: input.ownerMembershipId || null }
        : {}),
    },
  });
  if (updated.count === 0) {
    throw new NotFoundError('Company not found');
  }
  if (input.tags) {
    await replaceTags(tenantId, 'company', id, input.tags);
  }
  return getCompanyOrThrow(tenantId, id);
}

export async function softDeleteCompany(tenantId: string, role: Role, id: string) {
  requireTenantId(tenantId);
  assertWrite(role);
  await getCompanyOrThrow(tenantId, id);
  const updated = await prisma.company.updateMany({
    where: { id, tenantId, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  if (updated.count === 0) {
    throw new NotFoundError('Company not found');
  }
  return prisma.company.findFirst({ where: { id, tenantId } });
}
