import { NextResponse } from 'next/server';
import { opportunitiesRepo } from '@crm/db';
import { z } from 'zod';
import { apiError, loadApiTenant } from '@/lib/api';
import { logRequest } from '@/lib/log';
import { canWriteOpportunities } from '@crm/shared';

const patchSchema = z.object({
  title: z.string().min(1).optional(),
  amount: z.union([z.string(), z.number()]).optional().nullable(),
  companyId: z.string().optional().nullable(),
  contactId: z.string().optional().nullable(),
  ownerMembershipId: z.string().optional().nullable(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const requestId = req.headers.get('x-request-id') ?? crypto.randomUUID();
  try {
    const tenant = await loadApiTenant();
    const { id } = await ctx.params;
    const opportunity = await opportunitiesRepo.getOpportunityOrThrow(
      tenant.tenantId,
      id,
    );
    const statusEvents = await opportunitiesRepo.listStatusEvents(
      tenant.tenantId,
      'opportunity',
      id,
    );
    logRequest({
      requestId,
      message: 'opportunities.get',
      tenant_id: tenant.tenantId,
      user_id: tenant.userId,
    });
    return NextResponse.json({
      opportunity,
      statusEvents,
      canWrite: canWriteOpportunities(tenant.role),
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
    const opportunity = await opportunitiesRepo.updateOpportunity(
      tenant.tenantId,
      tenant.role,
      id,
      body,
    );
    logRequest({
      requestId,
      message: 'opportunities.patch',
      tenant_id: tenant.tenantId,
      user_id: tenant.userId,
    });
    return NextResponse.json({ opportunity });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    }
    return apiError(err, { requestId });
  }
}
