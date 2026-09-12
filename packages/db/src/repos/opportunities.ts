import type { OpportunityStage, Role } from '@crm/shared';
import {
  assertActivityTransition,
  assertOpportunityTransition,
  canWriteOpportunities,
} from '@crm/shared';
import { prisma } from '../client';
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
  requireTenantId,
} from '../errors';
import { money } from '../serialize';
import { assertOptionalRelations } from './tenant-guard';

export type OpportunityInput = {
  title: string;
  amount?: string | number | null;
  companyId?: string | null;
  contactId?: string | null;
  ownerMembershipId?: string | null;
};

const include = {
  company: { select: { id: true, name: true } },
  contact: { select: { id: true, firstName: true, lastName: true, email: true } },
  owner: {
    select: { id: true, role: true, user: { select: { name: true, email: true } } },
  },
} as const;

function assertWrite(role: Role) {
  if (!canWriteOpportunities(role)) {
    throw new ForbiddenError('You cannot modify opportunities');
  }
}

function parseAmount(value: string | number | null | undefined) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  if (Number.isNaN(n)) throw new ValidationError('Invalid amount');
  return n;
}

export function serializeOpportunity<T extends { amount: { toString(): string } | null }>(
  row: T,
) {
  return { ...row, amount: money(row.amount) };
}

export async function listOpportunities(
  tenantId: string,
  opts?: { stage?: OpportunityStage; q?: string },
) {
  requireTenantId(tenantId);
  const rows = await prisma.opportunity.findMany({
    where: {
      tenantId,
      ...(opts?.stage ? { stage: opts.stage } : {}),
      ...(opts?.q ? { title: { contains: opts.q, mode: 'insensitive' } } : {}),
    },
    orderBy: { updatedAt: 'desc' },
    include,
  });
  return rows.map(serializeOpportunity);
}

export async function getOpportunity(tenantId: string, id: string) {
  requireTenantId(tenantId);
  const row = await prisma.opportunity.findFirst({
    where: { tenantId, id },
    include: {
      ...include,
      activities: { orderBy: { createdAt: 'desc' } },
      tickets: {
        orderBy: { updatedAt: 'desc' },
        take: 20,
        select: { id: true, title: true, status: true, priority: true },
      },
    },
  });
  return row ? serializeOpportunity(row) : null;
}

export async function getOpportunityOrThrow(tenantId: string, id: string) {
  const row = await getOpportunity(tenantId, id);
  if (!row) throw new NotFoundError('Opportunity not found');
  return row;
}

export async function createOpportunity(
  tenantId: string,
  role: Role,
  input: OpportunityInput,
) {
  requireTenantId(tenantId);
  assertWrite(role);
  const title = input.title.trim();
  if (!title) throw new ValidationError('Title is required');
  await assertOptionalRelations(tenantId, {
    companyId: input.companyId,
    contactId: input.contactId,
    membershipId: input.ownerMembershipId,
  });
  const row = await prisma.opportunity.create({
    data: {
      tenantId,
      title,
      amount: parseAmount(input.amount) ?? null,
      companyId: input.companyId || null,
      contactId: input.contactId || null,
      ownerMembershipId: input.ownerMembershipId || null,
    },
    include,
  });
  return serializeOpportunity(row);
}

export async function updateOpportunity(
  tenantId: string,
  role: Role,
  id: string,
  input: Partial<OpportunityInput>,
) {
  requireTenantId(tenantId);
  assertWrite(role);
  await getOpportunityOrThrow(tenantId, id);
  await assertOptionalRelations(tenantId, {
    companyId: input.companyId,
    contactId: input.contactId,
    membershipId: input.ownerMembershipId,
  });
  const amount = parseAmount(input.amount);
  const row = await prisma.opportunity.update({
    where: { id },
    data: {
      ...(input.title !== undefined ? { title: input.title.trim() } : {}),
      ...(amount !== undefined ? { amount } : {}),
      ...(input.companyId !== undefined ? { companyId: input.companyId || null } : {}),
      ...(input.contactId !== undefined ? { contactId: input.contactId || null } : {}),
      ...(input.ownerMembershipId !== undefined
        ? { ownerMembershipId: input.ownerMembershipId || null }
        : {}),
    },
    include,
  });
  return serializeOpportunity(row);
}

export async function transitionOpportunity(
  tenantId: string,
  role: Role,
  id: string,
  to: OpportunityStage,
  actorMembershipId: string,
) {
  requireTenantId(tenantId);
  assertWrite(role);
  const current = await prisma.opportunity.findFirst({ where: { tenantId, id } });
  if (!current) throw new NotFoundError('Opportunity not found');
  assertOpportunityTransition(current.stage, to);
  const [row] = await prisma.$transaction([
    prisma.opportunity.update({
      where: { id },
      data: { stage: to },
      include,
    }),
    prisma.statusEvent.create({
      data: {
        tenantId,
        entityType: 'opportunity',
        entityId: id,
        fromStatus: current.stage,
        toStatus: to,
        actorMembershipId,
      },
    }),
  ]);
  return serializeOpportunity(row);
}

export async function listStatusEvents(
  tenantId: string,
  entityType: string,
  entityId: string,
) {
  requireTenantId(tenantId);
  return prisma.statusEvent.findMany({
    where: { tenantId, entityType, entityId },
    orderBy: { createdAt: 'desc' },
    include: {
      actor: { select: { user: { select: { name: true, email: true } } } },
    },
  });
}

export async function createActivity(
  tenantId: string,
  role: Role,
  input: {
    title: string;
    dueAt?: string | Date | null;
    companyId?: string | null;
    contactId?: string | null;
    opportunityId?: string | null;
    ownerMembershipId?: string | null;
  },
) {
  requireTenantId(tenantId);
  assertWrite(role);
  const title = input.title.trim();
  if (!title) throw new ValidationError('Title is required');
  await assertOptionalRelations(tenantId, {
    companyId: input.companyId,
    contactId: input.contactId,
    opportunityId: input.opportunityId,
    membershipId: input.ownerMembershipId,
  });
  return prisma.activity.create({
    data: {
      tenantId,
      title,
      dueAt: input.dueAt ? new Date(input.dueAt) : null,
      companyId: input.companyId || null,
      contactId: input.contactId || null,
      opportunityId: input.opportunityId || null,
      ownerMembershipId: input.ownerMembershipId || null,
    },
  });
}

export async function transitionActivity(
  tenantId: string,
  role: Role,
  id: string,
  to: 'todo' | 'done',
  actorMembershipId: string,
) {
  requireTenantId(tenantId);
  assertWrite(role);
  const current = await prisma.activity.findFirst({ where: { tenantId, id } });
  if (!current) throw new NotFoundError('Activity not found');
  assertActivityTransition(current.status, to);
  const [row] = await prisma.$transaction([
    prisma.activity.update({ where: { id }, data: { status: to } }),
    prisma.statusEvent.create({
      data: {
        tenantId,
        entityType: 'activity',
        entityId: id,
        fromStatus: current.status,
        toStatus: to,
        actorMembershipId,
      },
    }),
  ]);
  return row;
}
