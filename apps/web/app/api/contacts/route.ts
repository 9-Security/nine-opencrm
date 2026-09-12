import { NextResponse } from 'next/server';
import { contactsRepo } from '@crm/db';
import { z } from 'zod';
import { apiError, loadApiTenant } from '@/lib/api';
import { logRequest } from '@/lib/log';
import { canWriteContacts } from '@crm/shared';

const createSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  companyId: z.string().optional().nullable(),
  ownerMembershipId: z.string().optional().nullable(),
});

export async function GET(req: Request) {
  const requestId = req.headers.get('x-request-id') ?? crypto.randomUUID();
  try {
    const ctx = await loadApiTenant();
    const url = new URL(req.url);
    const contacts = await contactsRepo.listContacts(ctx.tenantId, {
      q: url.searchParams.get('q') ?? undefined,
      companyId: url.searchParams.get('companyId') ?? undefined,
    });
    logRequest({
      requestId,
      message: 'contacts.list',
      tenant_id: ctx.tenantId,
      user_id: ctx.userId,
    });
    return NextResponse.json({ contacts, canWrite: canWriteContacts(ctx.role) });
  } catch (err) {
    return apiError(err, { requestId });
  }
}

export async function POST(req: Request) {
  const requestId = req.headers.get('x-request-id') ?? crypto.randomUUID();
  try {
    const ctx = await loadApiTenant();
    const body = createSchema.parse(await req.json());
    const contact = await contactsRepo.createContact(ctx.tenantId, ctx.role, body);
    logRequest({
      requestId,
      message: 'contacts.create',
      tenant_id: ctx.tenantId,
      user_id: ctx.userId,
    });
    return NextResponse.json({ contact }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    }
    return apiError(err, { requestId });
  }
}
