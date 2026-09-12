import { NextResponse } from 'next/server';
import { ticketsRepo } from '@crm/db';
import { PRIORITIES, TICKET_STATUSES } from '@crm/shared';
import { z } from 'zod';
import { apiError, loadApiTenant } from '@/lib/api';
import { logRequest } from '@/lib/log';
import { canWriteTickets } from '@crm/shared';

const createSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  priority: z.enum(PRIORITIES).optional(),
  companyId: z.string().optional().nullable(),
  contactId: z.string().optional().nullable(),
  opportunityId: z.string().optional().nullable(),
  assigneeMembershipId: z.string().optional().nullable(),
});

export async function GET(req: Request) {
  const requestId = req.headers.get('x-request-id') ?? crypto.randomUUID();
  try {
    const ctx = await loadApiTenant();
    const url = new URL(req.url);
    const status = url.searchParams.get('status');
    const priority = url.searchParams.get('priority');
    const all = url.searchParams.get('all') === '1';
    const tickets = await ticketsRepo.listTickets(ctx.tenantId, {
      q: url.searchParams.get('q') ?? undefined,
      status:
        status && (TICKET_STATUSES as readonly string[]).includes(status)
          ? (status as (typeof TICKET_STATUSES)[number])
          : undefined,
      priority:
        priority && (PRIORITIES as readonly string[]).includes(priority)
          ? (priority as (typeof PRIORITIES)[number])
          : undefined,
      engineeringDefault: ctx.role === 'engineering' && !all,
      membershipId: ctx.membershipId,
    });
    logRequest({
      requestId,
      message: 'tickets.list',
      tenant_id: ctx.tenantId,
      user_id: ctx.userId,
    });
    return NextResponse.json({ tickets, canWrite: canWriteTickets(ctx.role) });
  } catch (err) {
    return apiError(err, { requestId });
  }
}

export async function POST(req: Request) {
  const requestId = req.headers.get('x-request-id') ?? crypto.randomUUID();
  try {
    const ctx = await loadApiTenant();
    const body = createSchema.parse(await req.json());
    const ticket = await ticketsRepo.createTicket(ctx.tenantId, ctx.role, body);
    logRequest({
      requestId,
      message: 'tickets.create',
      tenant_id: ctx.tenantId,
      user_id: ctx.userId,
    });
    return NextResponse.json({ ticket }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    }
    return apiError(err, { requestId });
  }
}
