import { NextResponse } from 'next/server';
import { z } from 'zod';
import { canAccessSettings } from '@crm/shared';
import {
  ForbiddenError,
  invitesRepo,
  isBlockedMailHost,
  prisma,
  tenantsRepo,
} from '@crm/db';
import { apiError, loadApiTenant } from '@/lib/api';
import { getSessionUser } from '@/lib/tenant';
import { setTenantCookie } from '@/lib/tenant-cookie';
import { logRequest } from '@/lib/log';

const createSchema = z.object({ name: z.string().min(1) });
const hostSchema = z
  .string()
  .regex(/^[A-Za-z0-9.-]*$/)
  .max(253)
  .optional()
  .nullable()
  .refine((value) => !value || !isBlockedMailHost(value), 'Mail host is not allowed');

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  timezone: z.string().min(1).optional(),
  workdays: z.array(z.number().int().min(0).max(6)).min(1).max(7).optional(),
  mailAuthEnabled: z.boolean().optional(),
  mailImapHost: hostSchema,
  mailImapPort: z.number().int().min(1).max(65535).optional(),
  mailPop3Host: hostSchema,
  mailPop3Port: z.number().int().min(1).max(65535).optional(),
  require2fa: z.boolean().optional(),
});

export async function GET(req: Request) {
  const requestId = req.headers.get('x-request-id') ?? crypto.randomUUID();
  try {
    const ctx = await loadApiTenant();
    if (!canAccessSettings(ctx.role)) {
      throw new ForbiddenError('Admin only');
    }
    const [members, invites, tenant] = await Promise.all([
      tenantsRepo.listTenantMembers(ctx.tenantId),
      invitesRepo.listInvites(ctx.tenantId),
      prisma.tenant.findUniqueOrThrow({ where: { id: ctx.tenantId } }),
    ]);
    logRequest({
      requestId,
      message: 'tenants.get',
      tenant_id: ctx.tenantId,
      user_id: ctx.userId,
    });
    return NextResponse.json({
      tenant: {
        name: tenant.name,
        timezone: tenant.timezone,
        slug: tenant.slug,
        workdays: tenantsRepo.parseWorkdays(tenant.workdays),
        mailAuthEnabled: tenant.mailAuthEnabled,
        mailImapHost: tenant.mailImapHost,
        mailImapPort: tenant.mailImapPort,
        mailPop3Host: tenant.mailPop3Host,
        mailPop3Port: tenant.mailPop3Port,
        require2fa: tenant.require2fa,
      },
      members,
      invites,
    });
  } catch (err) {
    return apiError(err, { requestId });
  }
}

export async function POST(req: Request) {
  const requestId = req.headers.get('x-request-id') ?? crypto.randomUUID();
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const body = createSchema.parse(await req.json());
    const created = await tenantsRepo.createTenantForUser({
      userId: user.id,
      name: body.name,
    });
    await setTenantCookie(created.tenant.id);
    logRequest({
      requestId,
      message: 'tenants.create',
      tenant_id: created.tenant.id,
      user_id: user.id,
    });
    return NextResponse.json({ tenant: created.tenant }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    }
    return apiError(err, { requestId });
  }
}

export async function PATCH(req: Request) {
  const requestId = req.headers.get('x-request-id') ?? crypto.randomUUID();
  try {
    const ctx = await loadApiTenant();
    if (!canAccessSettings(ctx.role)) {
      throw new ForbiddenError('Admin only');
    }
    const body = patchSchema.parse(await req.json());
    const tenant = await tenantsRepo.updateTenantSettings(ctx.tenantId, {
      ...body,
      workdays: body.workdays ? tenantsRepo.parseWorkdays(body.workdays) : undefined,
    });
    return NextResponse.json({ tenant });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    }
    return apiError(err, { requestId });
  }
}
