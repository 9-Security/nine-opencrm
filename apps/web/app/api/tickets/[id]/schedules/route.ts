import { NextResponse } from 'next/server';
import { schedulesRepo, ticketsRepo } from '@crm/db';
import { z } from 'zod';
import { apiError, loadApiTenant } from '@/lib/api';
import { logRequest } from '@/lib/log';

const schema = z.object({
  scheduleId: z.string().optional(),
  create: z
    .object({
      title: z.string().min(1),
      startAt: z.string(),
      endAt: z.string(),
      type: z.enum(['field_work', 'booking']).optional(),
      assigneeMembershipId: z.string().optional().nullable(),
    })
    .optional(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const requestId = req.headers.get('x-request-id') ?? crypto.randomUUID();
  try {
    const tenant = await loadApiTenant();
    const { id } = await ctx.params;
    const body = schema.parse(await req.json());
    let scheduleId = body.scheduleId;
    let warnings: unknown[] = [];
    if (!scheduleId && body.create) {
      const created = await schedulesRepo.createSchedule(
        tenant.tenantId,
        tenant.role,
        tenant.membershipId,
        body.create,
      );
      scheduleId = created.schedule.id;
      warnings = created.warnings;
    }
    if (!scheduleId) {
      return NextResponse.json(
        { error: 'scheduleId or create is required' },
        { status: 400 },
      );
    }
    const link = await ticketsRepo.linkSchedule(
      tenant.tenantId,
      tenant.role,
      id,
      scheduleId,
    );
    logRequest({
      requestId,
      message: 'tickets.link_schedule',
      tenant_id: tenant.tenantId,
      user_id: tenant.userId,
    });
    return NextResponse.json({ link, warnings }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    }
    return apiError(err, { requestId });
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  const requestId = req.headers.get('x-request-id') ?? crypto.randomUUID();
  try {
    const tenant = await loadApiTenant();
    const { id } = await ctx.params;
    const url = new URL(req.url);
    const scheduleId = url.searchParams.get('scheduleId');
    if (!scheduleId) {
      return NextResponse.json({ error: 'scheduleId is required' }, { status: 400 });
    }
    await ticketsRepo.unlinkSchedule(tenant.tenantId, tenant.role, id, scheduleId);
    logRequest({
      requestId,
      message: 'tickets.unlink_schedule',
      tenant_id: tenant.tenantId,
      user_id: tenant.userId,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err, { requestId });
  }
}
