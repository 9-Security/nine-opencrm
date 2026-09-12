import { NextResponse } from 'next/server';
import { schedulesRepo } from '@crm/db';
import { SCHEDULE_TYPES } from '@crm/shared';
import { z } from 'zod';
import { apiError, loadApiTenant } from '@/lib/api';
import { logRequest } from '@/lib/log';
import { canWriteAnySchedule } from '@crm/shared';

const patchSchema = z.object({
  title: z.string().min(1).optional(),
  type: z.enum(SCHEDULE_TYPES).optional(),
  startAt: z.string().optional(),
  endAt: z.string().optional(),
  assigneeMembershipId: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const requestId = req.headers.get('x-request-id') ?? crypto.randomUUID();
  try {
    const tenant = await loadApiTenant();
    const { id } = await ctx.params;
    const schedule = await schedulesRepo.getScheduleOrThrow(
      tenant.tenantId,
      id,
      tenant.role,
      tenant.membershipId,
    );
    logRequest({
      requestId,
      message: 'schedules.get',
      tenant_id: tenant.tenantId,
      user_id: tenant.userId,
    });
    return NextResponse.json({
      schedule,
      canWrite: canWriteAnySchedule(tenant.role),
    });
  } catch (err) {
    return apiError(err, { requestId });
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
  const requestId = req.headers.get('x-request-id') ?? crypto.randomUUID();
  try {
    const tenant = await loadApiTenant();
    const { id } = await ctx.params;
    const body = patchSchema.parse(await req.json());
    const result = await schedulesRepo.updateSchedule(
      tenant.tenantId,
      tenant.role,
      tenant.membershipId,
      id,
      body,
    );
    logRequest({
      requestId,
      message: 'schedules.patch',
      tenant_id: tenant.tenantId,
      user_id: tenant.userId,
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    }
    return apiError(err, { requestId });
  }
}
