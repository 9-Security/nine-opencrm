import { NextResponse } from 'next/server';
import { opportunitiesRepo } from '@crm/db';
import { z } from 'zod';
import { apiError, loadApiTenant } from '@/lib/api';
import { logRequest } from '@/lib/log';

const schema = z.object({
  title: z.string().min(1),
  dueAt: z.string().optional().nullable(),
  companyId: z.string().optional().nullable(),
  contactId: z.string().optional().nullable(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const requestId = req.headers.get('x-request-id') ?? crypto.randomUUID();
  try {
    const tenant = await loadApiTenant();
    const { id } = await ctx.params;
    await opportunitiesRepo.getOpportunityOrThrow(tenant.tenantId, id);
    const body = schema.parse(await req.json());
    const activity = await opportunitiesRepo.createActivity(
      tenant.tenantId,
      tenant.role,
      {
        ...body,
        opportunityId: id,
        ownerMembershipId: tenant.membershipId,
      },
    );
    logRequest({
      requestId,
      message: 'opportunities.activity.create',
      tenant_id: tenant.tenantId,
      user_id: tenant.userId,
    });
    return NextResponse.json({ activity }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    }
    return apiError(err, { requestId });
  }
}
