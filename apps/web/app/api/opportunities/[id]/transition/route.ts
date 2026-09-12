import { NextResponse } from 'next/server';
import { opportunitiesRepo } from '@crm/db';
import { OPPORTUNITY_STAGES } from '@crm/shared';
import { z } from 'zod';
import { apiError, loadApiTenant } from '@/lib/api';
import { logRequest } from '@/lib/log';

const schema = z.object({
  to: z.enum(OPPORTUNITY_STAGES),
});

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const requestId = req.headers.get('x-request-id') ?? crypto.randomUUID();
  try {
    const tenant = await loadApiTenant();
    const { id } = await ctx.params;
    const body = schema.parse(await req.json());
    const opportunity = await opportunitiesRepo.transitionOpportunity(
      tenant.tenantId,
      tenant.role,
      id,
      body.to,
      tenant.membershipId,
    );
    logRequest({
      requestId,
      message: 'opportunities.transition',
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
