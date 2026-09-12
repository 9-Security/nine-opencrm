import type { Priority, Role, TicketStatus } from '@crm/shared';
import {
  assertTicketTransition,
  canSeeInternalComments,
  canWriteTickets,
} from '@crm/shared';
import { prisma } from '../client';
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
  requireTenantId,
} from '../errors';
import { assertOptionalRelations, assertScheduleInTenant } from './tenant-guard';

export type TicketInput = {
  title: string;
  description?: string | null;
  priority?: Priority;
  companyId?: string | null;
  contactId?: string | null;
  opportunityId?: string | null;
  assigneeMembershipId?: string | null;
};

const include = {
  company: { select: { id: true, name: true } },
  contact: { select: { id: true, firstName: true, lastName: true } },
  opportunity: { select: { id: true, title: true } },
  assignee: {
    select: { id: true, role: true, user: { select: { name: true, email: true } } },
  },
} as const;

function assertWrite(role: Role) {
  if (!canWriteTickets(role)) {
    throw new ForbiddenError('You cannot modify tickets');
  }
}

export async function listTickets(
  tenantId: string,
  opts?: {
    engineeringDefault?: boolean;
    membershipId?: string;
    status?: TicketStatus;
    priority?: Priority;
    q?: string;
  },
) {
  requireTenantId(tenantId);
  return prisma.ticket.findMany({
    where: {
      tenantId,
      ...(opts?.status ? { status: opts.status } : {}),
      ...(opts?.priority ? { priority: opts.priority } : {}),
      ...(opts?.q ? { title: { contains: opts.q, mode: 'insensitive' } } : {}),
      ...(opts?.engineeringDefault && opts.membershipId
        ? {
            OR: [
              { assigneeMembershipId: null },
              { assigneeMembershipId: opts.membershipId },
            ],
          }
        : {}),
    },
    orderBy: { updatedAt: 'desc' },
    include,
  });
}

export async function getTicket(tenantId: string, id: string, role: Role) {
  requireTenantId(tenantId);
  const ticket = await prisma.ticket.findFirst({
    where: { tenantId, id },
    include: {
      ...include,
      comments: {
        ...(canSeeInternalComments(role) ? {} : { where: { isInternal: false } }),
        orderBy: { createdAt: 'asc' },
        include: {
          author: { select: { user: { select: { name: true, email: true } } } },
        },
      },
      scheduleLinks: {
        include: {
          schedule: {
            include: {
              assignee: { select: { user: { select: { name: true, email: true } } } },
            },
          },
        },
      },
    },
  });
  return ticket;
}

export async function getTicketOrThrow(tenantId: string, id: string, role: Role) {
  const ticket = await getTicket(tenantId, id, role);
  if (!ticket) throw new NotFoundError('Ticket not found');
  return ticket;
}

export async function createTicket(tenantId: string, role: Role, input: TicketInput) {
  requireTenantId(tenantId);
  assertWrite(role);
  const title = input.title.trim();
  if (!title) throw new ValidationError('Title is required');
  await assertOptionalRelations(tenantId, {
    companyId: input.companyId,
    contactId: input.contactId,
    opportunityId: input.opportunityId,
    membershipId: input.assigneeMembershipId,
  });
  return prisma.ticket.create({
    data: {
      tenantId,
      title,
      description: input.description?.trim() || null,
      priority: input.priority ?? 'medium',
      companyId: input.companyId || null,
      contactId: input.contactId || null,
      opportunityId: input.opportunityId || null,
      assigneeMembershipId: input.assigneeMembershipId || null,
    },
    include,
  });
}

export async function updateTicket(
  tenantId: string,
  role: Role,
  id: string,
  input: Partial<TicketInput>,
) {
  requireTenantId(tenantId);
  assertWrite(role);
  await getTicketOrThrow(tenantId, id, role);
  await assertOptionalRelations(tenantId, {
    companyId: input.companyId,
    contactId: input.contactId,
    opportunityId: input.opportunityId,
    membershipId: input.assigneeMembershipId,
  });
  return prisma.ticket.update({
    where: { id },
    data: {
      ...(input.title !== undefined ? { title: input.title.trim() } : {}),
      ...(input.description !== undefined
        ? { description: input.description?.trim() || null }
        : {}),
      ...(input.priority !== undefined ? { priority: input.priority } : {}),
      ...(input.companyId !== undefined ? { companyId: input.companyId || null } : {}),
      ...(input.contactId !== undefined ? { contactId: input.contactId || null } : {}),
      ...(input.opportunityId !== undefined
        ? { opportunityId: input.opportunityId || null }
        : {}),
      ...(input.assigneeMembershipId !== undefined
        ? { assigneeMembershipId: input.assigneeMembershipId || null }
        : {}),
    },
    include,
  });
}

export async function transitionTicket(
  tenantId: string,
  role: Role,
  id: string,
  to: TicketStatus,
  actorMembershipId: string,
) {
  requireTenantId(tenantId);
  assertWrite(role);
  const current = await prisma.ticket.findFirst({ where: { tenantId, id } });
  if (!current) throw new NotFoundError('Ticket not found');
  assertTicketTransition(current.status, to);
  const [row] = await prisma.$transaction([
    prisma.ticket.update({ where: { id }, data: { status: to }, include }),
    prisma.statusEvent.create({
      data: {
        tenantId,
        entityType: 'ticket',
        entityId: id,
        fromStatus: current.status,
        toStatus: to,
        actorMembershipId,
      },
    }),
  ]);
  return row;
}

export async function addComment(
  tenantId: string,
  role: Role,
  ticketId: string,
  authorMembershipId: string,
  body: string,
  isInternal: boolean,
) {
  requireTenantId(tenantId);
  assertWrite(role);
  await getTicketOrThrow(tenantId, ticketId, role);
  const text = body.trim();
  if (!text) throw new ValidationError('Comment is required');
  return prisma.ticketComment.create({
    data: {
      tenantId,
      ticketId,
      authorMembershipId,
      body: text,
      isInternal,
    },
    include: {
      author: { select: { user: { select: { name: true, email: true } } } },
    },
  });
}

export async function linkSchedule(
  tenantId: string,
  role: Role,
  ticketId: string,
  scheduleId: string,
) {
  requireTenantId(tenantId);
  assertWrite(role);
  await getTicketOrThrow(tenantId, ticketId, role);
  await assertScheduleInTenant(tenantId, scheduleId);
  return prisma.ticketScheduleLink.upsert({
    where: { ticketId_scheduleId: { ticketId, scheduleId } },
    update: {},
    create: { tenantId, ticketId, scheduleId },
    include: {
      schedule: {
        include: {
          assignee: { select: { user: { select: { name: true, email: true } } } },
        },
      },
    },
  });
}

export async function unlinkSchedule(
  tenantId: string,
  role: Role,
  ticketId: string,
  scheduleId: string,
) {
  requireTenantId(tenantId);
  assertWrite(role);
  await getTicketOrThrow(tenantId, ticketId, role);
  const link = await prisma.ticketScheduleLink.findFirst({
    where: { tenantId, ticketId, scheduleId },
  });
  if (!link) throw new NotFoundError('Link not found');
  await prisma.ticketScheduleLink.delete({ where: { id: link.id } });
}
