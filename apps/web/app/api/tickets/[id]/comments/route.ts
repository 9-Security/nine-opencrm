import { NextResponse } from 'next/server';
import { ticketsRepo } from '@crm/db';
import { z } from 'zod';
import { apiError, loadApiTenant } from '@/lib/api';
import { logRequest } from '@/lib/log';

const schema = z.object({
  body: z.string().min(1),
  isInternal: z.boolean().optional(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const requestId = req.headers.get('x-request-id') ?? crypto.randomUUID();
  try {
    const tenant = await loadApiTenant();
    const { id } = await ctx.params;
    const body = schema.parse(await req.json());
    const comment = await ticketsRepo.addComment(
      tenant.tenantId,
      tenant.role,
      id,
      tenant.membershipId,
      body.body,
      Boolean(body.isInternal),
    );
    logRequest({
      requestId,
      message: 'tickets.comment',
      tenant_id: tenant.tenantId,
      user_id: tenant.userId,
    });
    return NextResponse.json({ comment }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    }
    return apiError(err, { requestId });
  }
}
