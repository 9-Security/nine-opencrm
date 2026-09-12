import { NextResponse } from 'next/server';
import { schedulesRepo } from '@crm/db';
import { SCHEDULE_TYPES } from '@crm/shared';
import { z } from 'zod';
import { apiError, loadApiTenant } from '@/lib/api';
import { logRequest } from '@/lib/log';
import { canWriteAnySchedule } from '@crm/shared';

const createSchema = z.object({
  title: z.string().min(1),
  type: z.enum(SCHEDULE_TYPES).optional(),
  startAt: z.string(),
  endAt: z.string(),
  assigneeMembershipId: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export async function GET(req: Request) {
  const requestId = req.headers.get('x-request-id') ?? crypto.randomUUID();
  try {
    const ctx = await loadApiTenant();
    const url = new URL(req.url);
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    const q = url.searchParams.get('q') ?? undefined;
    const limitRaw = url.searchParams.get('limit');
    const take = limitRaw ? Math.min(Math.max(Number(limitRaw) || 0, 1), 50) : undefined;
    const schedules = await schedulesRepo.listSchedules(ctx.tenantId, {
      role: ctx.role,
      membershipId: ctx.membershipId,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      assigneeMembershipId: url.searchParams.get('assigneeId') ?? undefined,
      q,
      take,
    });
    logRequest({
      requestId,
      message: 'schedules.list',
      tenant_id: ctx.tenantId,
      user_id: ctx.userId,
    });
    return NextResponse.json({
      schedules,
      canWrite: canWriteAnySchedule(ctx.role),
    });
  } catch (err) {
    return apiError(err, { requestId });
  }
}

export async function POST(req: Request) {
  const requestId = req.headers.get('x-request-id') ?? crypto.randomUUID();
  try {
    const ctx = await loadApiTenant();
    const body = createSchema.parse(await req.json());
    const result = await schedulesRepo.createSchedule(
      ctx.tenantId,
      ctx.role,
      ctx.membershipId,
      body,
    );
    logRequest({
      requestId,
      message: 'schedules.create',
      tenant_id: ctx.tenantId,
      user_id: ctx.userId,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    }
    return apiError(err, { requestId });
  }
}
