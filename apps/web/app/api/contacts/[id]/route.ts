import { NextResponse } from 'next/server';
import { contactsRepo } from '@crm/db';
import { z } from 'zod';
import { apiError, loadApiTenant } from '@/lib/api';
import { logRequest } from '@/lib/log';
import { canWriteContacts } from '@crm/shared';

const patchSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  email: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  companyId: z.string().optional().nullable(),
  ownerMembershipId: z.string().optional().nullable(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const requestId = req.headers.get('x-request-id') ?? crypto.randomUUID();
  try {
    const tenant = await loadApiTenant();
    const { id } = await ctx.params;
    const contact = await contactsRepo.getContactOrThrow(tenant.tenantId, id);
    logRequest({
      requestId,
      message: 'contacts.get',
      tenant_id: tenant.tenantId,
      user_id: tenant.userId,
    });
    return NextResponse.json({ contact, canWrite: canWriteContacts(tenant.role) });
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
    const contact = await contactsRepo.updateContact(
      tenant.tenantId,
      tenant.role,
      id,
      body,
    );
    logRequest({
      requestId,
      message: 'contacts.patch',
      tenant_id: tenant.tenantId,
      user_id: tenant.userId,
    });
    return NextResponse.json({ contact });
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
    await contactsRepo.deleteContact(tenant.tenantId, tenant.role, id);
    logRequest({
      requestId,
      message: 'contacts.delete',
      tenant_id: tenant.tenantId,
      user_id: tenant.userId,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err, { requestId });
  }
}
