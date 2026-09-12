import { NextResponse } from 'next/server';
import { z } from 'zod';
import { canAccessSettings } from '@crm/shared';
import { ForbiddenError, invitesRepo } from '@crm/db';
import { apiError, loadApiTenant } from '@/lib/api';
import { logRequest } from '@/lib/log';

const schema = z.object({ inviteId: z.string().min(1) });

export async function POST(req: Request) {
  const requestId = req.headers.get('x-request-id') ?? crypto.randomUUID();
  try {
    const ctx = await loadApiTenant();
    if (!canAccessSettings(ctx.role)) {
      throw new ForbiddenError('Admin only');
    }
    const body = schema.parse(await req.json());
    const { invite, rawToken } = await invitesRepo.rotateInvite({
      tenantId: ctx.tenantId,
      inviteId: body.inviteId,
      createdByMembershipId: ctx.membershipId,
    });
    const origin = new URL(req.url).origin;
    const inviteUrl = `${origin}/invites/${rawToken}`;
    logRequest({
      requestId,
      message: 'invite.rotated',
      tenant_id: ctx.tenantId,
      user_id: ctx.userId,
      invite_email: invite.email,
    });
    return NextResponse.json({
      invite: { id: invite.id, email: invite.email, role: invite.role },
      inviteUrl,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    }
    return apiError(err, { requestId });
  }
}
