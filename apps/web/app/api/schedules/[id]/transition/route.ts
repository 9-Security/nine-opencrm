import { NextResponse } from 'next/server';
import { schedulesRepo } from '@crm/db';
import { SCHEDULE_STATUSES } from '@crm/shared';
import { z } from 'zod';
import { apiError, loadApiTenant } from '@/lib/api';
import { logRequest } from '@/lib/log';

const schema = z.object({
  to: z.enum(SCHEDULE_STATUSES),
  cancelReason: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const requestId = req.headers.get('x-request-id') ?? crypto.randomUUID();
  try {
    const tenant = await loadApiTenant();
    const { id } = await ctx.params;
    const body = schema.parse(await req.json());
    const schedule = await schedulesRepo.transitionSchedule(
      tenant.tenantId,
      tenant.role,
      tenant.membershipId,
      id,
      body.to,
      tenant.membershipId,
      { cancelReason: body.cancelReason, notes: body.notes },
    );
    logRequest({
      requestId,
      message: 'schedules.transition',
      tenant_id: tenant.tenantId,
      user_id: tenant.userId,
    });
    return NextResponse.json({ schedule });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    }
    return apiError(err, { requestId });
  }
}
