import { NextResponse } from 'next/server';
import { opportunitiesRepo } from '@crm/db';
import { OPPORTUNITY_STAGES } from '@crm/shared';
import { z } from 'zod';
import { apiError, loadApiTenant } from '@/lib/api';
import { logRequest } from '@/lib/log';
import { canWriteOpportunities } from '@crm/shared';

const createSchema = z.object({
  title: z.string().min(1),
  amount: z.union([z.string(), z.number()]).optional().nullable(),
  companyId: z.string().optional().nullable(),
  contactId: z.string().optional().nullable(),
  ownerMembershipId: z.string().optional().nullable(),
});

export async function GET(req: Request) {
  const requestId = req.headers.get('x-request-id') ?? crypto.randomUUID();
  try {
    const ctx = await loadApiTenant();
    const url = new URL(req.url);
    const stage = url.searchParams.get('stage');
    const opportunities = await opportunitiesRepo.listOpportunities(ctx.tenantId, {
      q: url.searchParams.get('q') ?? undefined,
      stage:
        stage && (OPPORTUNITY_STAGES as readonly string[]).includes(stage)
          ? (stage as (typeof OPPORTUNITY_STAGES)[number])
          : undefined,
    });
    logRequest({
      requestId,
      message: 'opportunities.list',
      tenant_id: ctx.tenantId,
      user_id: ctx.userId,
    });
    return NextResponse.json({
      opportunities,
      canWrite: canWriteOpportunities(ctx.role),
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
    const opportunity = await opportunitiesRepo.createOpportunity(
      ctx.tenantId,
      ctx.role,
      body,
    );
    logRequest({
      requestId,
      message: 'opportunities.create',
      tenant_id: ctx.tenantId,
      user_id: ctx.userId,
    });
    return NextResponse.json({ opportunity }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    }
    return apiError(err, { requestId });
  }
}
