import { NextResponse } from 'next/server';
import { ticketsRepo } from '@crm/db';
import { PRIORITIES } from '@crm/shared';
import { z } from 'zod';
import { apiError, loadApiTenant } from '@/lib/api';
import { logRequest } from '@/lib/log';
import { canSeeInternalComments, canWriteTickets } from '@crm/shared';

const patchSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  priority: z.enum(PRIORITIES).optional(),
  companyId: z.string().optional().nullable(),
  contactId: z.string().optional().nullable(),
  opportunityId: z.string().optional().nullable(),
  assigneeMembershipId: z.string().optional().nullable(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const requestId = req.headers.get('x-request-id') ?? crypto.randomUUID();
  try {
    const tenant = await loadApiTenant();
    const { id } = await ctx.params;
    const ticket = await ticketsRepo.getTicketOrThrow(
      tenant.tenantId,
      id,
      tenant.role,
      tenant.membershipId,
    );
    logRequest({
      requestId,
      message: 'tickets.get',
      tenant_id: tenant.tenantId,
      user_id: tenant.userId,
    });
    return NextResponse.json({
      ticket,
      canWrite: canWriteTickets(tenant.role),
      canSeeInternal: canSeeInternalComments(tenant.role),
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
    const ticket = await ticketsRepo.updateTicket(tenant.tenantId, tenant.role, id, body);
    logRequest({
      requestId,
      message: 'tickets.patch',
      tenant_id: tenant.tenantId,
      user_id: tenant.userId,
    });
    return NextResponse.json({ ticket });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    }
    return apiError(err, { requestId });
  }
}
