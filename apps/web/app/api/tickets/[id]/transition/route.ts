import { NextResponse } from 'next/server';
import { ticketsRepo } from '@crm/db';
import { TICKET_STATUSES } from '@crm/shared';
import { z } from 'zod';
import { apiError, loadApiTenant } from '@/lib/api';
import { logRequest } from '@/lib/log';

const schema = z.object({ to: z.enum(TICKET_STATUSES) });

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const requestId = req.headers.get('x-request-id') ?? crypto.randomUUID();
  try {
    const tenant = await loadApiTenant();
    const { id } = await ctx.params;
    const body = schema.parse(await req.json());
    const ticket = await ticketsRepo.transitionTicket(
      tenant.tenantId,
      tenant.role,
      id,
      body.to,
      tenant.membershipId,
    );
    logRequest({
      requestId,
      message: 'tickets.transition',
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
