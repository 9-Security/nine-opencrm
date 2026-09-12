import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { InviteError, NotFoundError, invitesRepo, prisma } from '@crm/db';
import { createTenantUser } from './helpers';

describe('invites', () => {
  it('accepts a token once, then rejects reuse', async () => {
    const admin = await createTenantUser('admin');
    const email = `newbie-${randomUUID().slice(0, 8)}@test.local`;
    const { rawToken } = await invitesRepo.createInvite({
      tenantId: admin.tenant.id,
      email,
      role: 'sales',
      createdByMembershipId: admin.membership.id,
    });

    const newbie = await prisma.user.create({
      data: {
        email,
        name: 'Newbie',
        passwordHash: 'x',
      },
    });

    const first = await invitesRepo.acceptInvite(rawToken, newbie.id);
    expect(first.membership.tenantId).toBe(admin.tenant.id);
    expect(first.membership.role).toBe('sales');

    await expect(invitesRepo.acceptInvite(rawToken, newbie.id)).rejects.toBeInstanceOf(
      InviteError,
    );
  });

  it('rejects expired tokens', async () => {
    const admin = await createTenantUser('admin');
    const email = `late-${randomUUID().slice(0, 8)}@test.local`;
    const { invite, rawToken } = await invitesRepo.createInvite({
      tenantId: admin.tenant.id,
      email,
      role: 'support',
      createdByMembershipId: admin.membership.id,
    });
    await prisma.invite.update({
      where: { id: invite.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const late = await prisma.user.create({
      data: { email, name: 'Late', passwordHash: 'x' },
    });
    await expect(invitesRepo.acceptInvite(rawToken, late.id)).rejects.toMatchObject({
      message: 'Invite expired',
    });
  });

  it('rotates a pending invite so the old token stops working', async () => {
    const admin = await createTenantUser('admin');
    const email = `rotate-${randomUUID().slice(0, 8)}@test.local`;
    const created = await invitesRepo.createInvite({
      tenantId: admin.tenant.id,
      email,
      role: 'sales',
      createdByMembershipId: admin.membership.id,
    });
    const rotated = await invitesRepo.rotateInvite({
      tenantId: admin.tenant.id,
      inviteId: created.invite.id,
      createdByMembershipId: admin.membership.id,
    });
    const user = await prisma.user.create({
      data: { email, name: 'Rotate', passwordHash: 'x' },
    });
    await expect(
      invitesRepo.acceptInvite(created.rawToken, user.id),
    ).rejects.toBeInstanceOf(InviteError);
    const accepted = await invitesRepo.acceptInvite(rotated.rawToken, user.id);
    expect(accepted.membership.role).toBe('sales');
  });

  it('does not rotate invites from another tenant', async () => {
    const a = await createTenantUser('admin');
    const b = await createTenantUser('admin');
    const created = await invitesRepo.createInvite({
      tenantId: a.tenant.id,
      email: `iso-${randomUUID().slice(0, 8)}@test.local`,
      role: 'sales',
      createdByMembershipId: a.membership.id,
    });
    await expect(
      invitesRepo.rotateInvite({
        tenantId: b.tenant.id,
        inviteId: created.invite.id,
        createdByMembershipId: b.membership.id,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rejects creator membership from another tenant', async () => {
    const a = await createTenantUser('admin');
    const b = await createTenantUser('admin');
    await expect(
      invitesRepo.createInvite({
        tenantId: a.tenant.id,
        email: 'x@test.local',
        role: 'sales',
        createdByMembershipId: b.membership.id,
      }),
    ).rejects.toBeInstanceOf(InviteError);
  });
});
