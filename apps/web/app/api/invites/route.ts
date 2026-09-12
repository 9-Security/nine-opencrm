import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ROLES, canAccessSettings } from '@crm/shared';
import { ForbiddenError, invitesRepo } from '@crm/db';
import { apiError, loadApiTenant } from '@/lib/api';
import { inviteJoinUrl } from '@/lib/app-origin';
import { sendInviteEmail } from '@/lib/invite-mail';
import { logRequest } from '@/lib/log';

const schema = z.object({
  email: z.string().email(),
  role: z.enum(ROLES),
});

export async function POST(req: Request) {
  const requestId = req.headers.get('x-request-id') ?? crypto.randomUUID();
  try {
    const ctx = await loadApiTenant();
    if (!canAccessSettings(ctx.role)) {
      throw new ForbiddenError('Admin only');
    }
    const body = schema.parse(await req.json());
    const { invite, rawToken } = await invitesRepo.createInvite({
      tenantId: ctx.tenantId,
      email: body.email,
      role: body.role,
      createdByMembershipId: ctx.membershipId,
    });
    const inviteUrl = inviteJoinUrl(req, rawToken);
    const emailed = await sendInviteEmail({
      tenantName: ctx.tenantName,
      role: body.role,
      inviteUrl,
      to: body.email,
    });
    logRequest({
      requestId,
      message: 'invite.created',
      tenant_id: ctx.tenantId,
      user_id: ctx.userId,
      invite_email: body.email,
      emailed: emailed.sent,
      email_reason: emailed.sent ? undefined : emailed.reason,
    });
    return NextResponse.json({
      invite: { id: invite.id, email: invite.email, role: invite.role },
      inviteUrl,
      emailed: emailed.sent,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    }
    return apiError(err, { requestId });
  }
}
