import type { Role, ScheduleStatus, ScheduleType } from '@crm/shared';
import {
  assertScheduleTransition,
  canManageAllSchedules,
  canWriteAnySchedule,
} from '@crm/shared';
import { prisma } from '../client';
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
  requireTenantId,
} from '../errors';
import { runAtomicTransition } from './atomic-transition';
import { assertMembershipInTenant } from './tenant-guard';

export type ScheduleInput = {
  title: string;
  type?: ScheduleType;
  startAt: string | Date;
  endAt: string | Date;
  assigneeMembershipId?: string | null;
  notes?: string | null;
};

const include = {
  assignee: {
    select: { id: true, role: true, user: { select: { name: true, email: true } } },
  },
  ticketLinks: {
    include: { ticket: { select: { id: true, title: true, status: true } } },
  },
} as const;

function assertCanWrite(role: Role) {
  if (!canWriteAnySchedule(role)) {
    throw new ForbiddenError('You cannot modify schedules');
  }
}

function assertCanMutate(
  role: Role,
  membershipId: string,
  assigneeMembershipId: string | null,
) {
  assertCanWrite(role);
  if (canManageAllSchedules(role)) return;
  if (assigneeMembershipId === membershipId) return;
  throw new ForbiddenError('You can only modify your own schedules');
}

function parseRange(startAt: string | Date, endAt: string | Date) {
  const start = new Date(startAt);
  const end = new Date(endAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new ValidationError('Invalid schedule time');
  }
  if (end <= start) {
    throw new ValidationError('End time must be after start time');
  }
  return { start, end };
}

export async function findConflicts(
  tenantId: string,
  assigneeMembershipId: string | null | undefined,
  start: Date,
  end: Date,
  excludeId?: string,
) {
  if (!assigneeMembershipId) return [];
  return prisma.schedule.findMany({
    where: {
      tenantId,
      assigneeMembershipId,
      status: { not: 'cancelled' },
      ...(excludeId ? { id: { not: excludeId } } : {}),
      startAt: { lt: end },
      endAt: { gt: start },
    },
    select: { id: true, title: true, startAt: true, endAt: true },
    orderBy: { startAt: 'asc' },
  });
}

export async function listSchedules(
  tenantId: string,
  opts: {
    role: Role;
    membershipId: string;
    from?: Date;
    to?: Date;
    assigneeMembershipId?: string;
    q?: string;
    take?: number;
  },
) {
  requireTenantId(tenantId);
  const selfOnly = !canManageAllSchedules(opts.role) && canWriteAnySchedule(opts.role);
  const bounded = Boolean(opts.from && opts.to);
  const take = opts.take ?? (bounded ? undefined : opts.q ? 20 : 100);
  return prisma.schedule.findMany({
    where: {
      tenantId,
      ...(selfOnly ? { assigneeMembershipId: opts.membershipId } : {}),
      ...(opts.assigneeMembershipId && !selfOnly
        ? { assigneeMembershipId: opts.assigneeMembershipId }
        : {}),
      ...(opts.from && opts.to
        ? { startAt: { lt: opts.to }, endAt: { gt: opts.from } }
        : {}),
      ...(opts.q ? { title: { contains: opts.q, mode: 'insensitive' } } : {}),
    },
    ...(take ? { take } : {}),
    orderBy: { startAt: 'asc' },
    include,
  });
}

export async function getSchedule(
  tenantId: string,
  id: string,
  role: Role,
  membershipId: string,
) {
  requireTenantId(tenantId);
  const row = await prisma.schedule.findFirst({
    where: { tenantId, id },
    include,
  });
  if (!row) return null;
  if (!canManageAllSchedules(role) && row.assigneeMembershipId !== membershipId) {
    return null;
  }
  return row;
}

export async function getScheduleOrThrow(
  tenantId: string,
  id: string,
  role: Role,
  membershipId: string,
) {
  const row = await getSchedule(tenantId, id, role, membershipId);
  if (!row) throw new NotFoundError('Schedule not found');
  return row;
}

export async function prepareCreate(
  tenantId: string,
  role: Role,
  membershipId: string,
  input: ScheduleInput,
) {
  requireTenantId(tenantId);
  assertCanWrite(role);
  const title = input.title.trim();
  if (!title) throw new ValidationError('Title is required');
  const { start, end } = parseRange(input.startAt, input.endAt);
  let assigneeMembershipId = input.assigneeMembershipId || membershipId;
  if (!canManageAllSchedules(role)) {
    assigneeMembershipId = membershipId;
  } else if (input.assigneeMembershipId) {
    await assertMembershipInTenant(tenantId, input.assigneeMembershipId);
  }
  const warnings = await conflictWarnings(tenantId, assigneeMembershipId, start, end);
  return {
    warnings,
    data: {
      tenantId,
      title,
      type: input.type ?? ('booking' as const),
      startAt: start,
      endAt: end,
      assigneeMembershipId,
      notes: input.notes?.trim() || null,
    },
  };
}

export async function createSchedule(
  tenantId: string,
  role: Role,
  membershipId: string,
  input: ScheduleInput,
) {
  const prepared = await prepareCreate(tenantId, role, membershipId, input);
  const schedule = await prisma.schedule.create({
    data: prepared.data,
    include,
  });
  return { schedule, warnings: prepared.warnings };
}

export async function updateSchedule(
  tenantId: string,
  role: Role,
  membershipId: string,
  id: string,
  input: Partial<ScheduleInput>,
) {
  requireTenantId(tenantId);
  const current = await getScheduleOrThrow(tenantId, id, role, membershipId);
  assertCanMutate(role, membershipId, current.assigneeMembershipId);
  let assigneeMembershipId = input.assigneeMembershipId;
  if (assigneeMembershipId !== undefined) {
    if (!canManageAllSchedules(role)) {
      assigneeMembershipId = membershipId;
    } else if (assigneeMembershipId) {
      await assertMembershipInTenant(tenantId, assigneeMembershipId);
    }
  }
  const start = input.startAt ? new Date(input.startAt) : current.startAt;
  const end = input.endAt ? new Date(input.endAt) : current.endAt;
  if (input.startAt || input.endAt) {
    parseRange(start, end);
  }
  const effectiveAssignee =
    assigneeMembershipId !== undefined
      ? assigneeMembershipId
      : current.assigneeMembershipId;
  const warnings = await conflictWarnings(tenantId, effectiveAssignee, start, end, id);
  const updated = await prisma.schedule.updateMany({
    where: { id, tenantId },
    data: {
      ...(input.title !== undefined ? { title: input.title.trim() } : {}),
      ...(input.type !== undefined ? { type: input.type } : {}),
      ...(input.startAt !== undefined ? { startAt: start } : {}),
      ...(input.endAt !== undefined ? { endAt: end } : {}),
      ...(assigneeMembershipId !== undefined ? { assigneeMembershipId } : {}),
      ...(input.notes !== undefined ? { notes: input.notes?.trim() || null } : {}),
    },
  });
  if (updated.count === 0) throw new NotFoundError('Schedule not found');
  const schedule = await prisma.schedule.findFirstOrThrow({
    where: { id, tenantId },
    include,
  });
  return { schedule, warnings };
}

export async function transitionSchedule(
  tenantId: string,
  role: Role,
  membershipId: string,
  id: string,
  to: ScheduleStatus,
  actorMembershipId: string,
  extra?: { cancelReason?: string | null; notes?: string | null },
) {
  requireTenantId(tenantId);
  const current = await getScheduleOrThrow(tenantId, id, role, membershipId);
  assertCanMutate(role, membershipId, current.assigneeMembershipId);
  assertScheduleTransition(current.status, to);
  if (to === 'cancelled' && !extra?.cancelReason?.trim()) {
    throw new ValidationError('Cancel reason is required');
  }
  return runAtomicTransition({
    tenantId,
    id,
    entityType: 'schedule',
    toStatus: to,
    actorMembershipId,
    notFoundMessage: 'Schedule not found',
    load: async (tx) => {
      const row = await tx.schedule.findFirst({ where: { tenantId, id } });
      if (!row) return null;
      assertCanMutate(role, membershipId, row.assigneeMembershipId);
      return { from: row.status };
    },
    assert: (from) => assertScheduleTransition(from as ScheduleStatus, to),
    apply: (tx, from) =>
      tx.schedule
        .updateMany({
          where: { id, tenantId, status: from as ScheduleStatus },
          data: {
            status: to,
            ...(to === 'cancelled' ? { cancelReason: extra?.cancelReason?.trim() } : {}),
            ...(extra?.notes !== undefined ? { notes: extra.notes?.trim() || null } : {}),
          },
        })
        .then((r) => r.count),
    reload: (tx) => tx.schedule.findFirstOrThrow({ where: { id, tenantId }, include }),
  });
}

async function conflictWarnings(
  tenantId: string,
  assigneeMembershipId: string | null,
  start: Date,
  end: Date,
  excludeId?: string,
) {
  const conflicts = await findConflicts(
    tenantId,
    assigneeMembershipId,
    start,
    end,
    excludeId,
  );
  return conflicts.map((c) => ({
    code: 'schedule_conflict' as const,
    message: `與「${c.title}」時間重疊`,
    scheduleId: c.id,
    startAt: c.startAt,
    endAt: c.endAt,
  }));
}
