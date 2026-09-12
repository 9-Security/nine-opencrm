import { describe, expect, it } from 'vitest';
import { NotFoundError, schedulesRepo } from '@crm/db';
import { createTenantUser } from './helpers';

describe('schedules', () => {
  it('sales only sees own schedules (foreign looks like 404)', async () => {
    const admin = await createTenantUser('admin');
    const sales = await createTenantUser('sales', { tenantId: admin.tenant.id });
    const { schedule: adminSched } = await schedulesRepo.createSchedule(
      admin.tenant.id,
      'admin',
      admin.membership.id,
      {
        title: 'Admin only',
        startAt: new Date('2030-03-01T09:00:00Z'),
        endAt: new Date('2030-03-01T10:00:00Z'),
        assigneeMembershipId: admin.membership.id,
      },
    );
    const listed = await schedulesRepo.listSchedules(admin.tenant.id, {
      role: 'sales',
      membershipId: sales.membership.id,
    });
    expect(listed.some((s) => s.id === adminSched.id)).toBe(false);
    await expect(
      schedulesRepo.getScheduleOrThrow(
        admin.tenant.id,
        adminSched.id,
        'sales',
        sales.membership.id,
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('returns conflict warnings but still saves', async () => {
    const a = await createTenantUser('admin');
    const start = new Date('2030-04-01T10:00:00Z');
    const end = new Date('2030-04-01T12:00:00Z');
    await schedulesRepo.createSchedule(a.tenant.id, 'admin', a.membership.id, {
      title: 'First',
      startAt: start,
      endAt: end,
      assigneeMembershipId: a.membership.id,
    });
    const second = await schedulesRepo.createSchedule(
      a.tenant.id,
      'admin',
      a.membership.id,
      {
        title: 'Overlap',
        startAt: new Date('2030-04-01T11:00:00Z'),
        endAt: new Date('2030-04-01T13:00:00Z'),
        assigneeMembershipId: a.membership.id,
      },
    );
    expect(second.schedule.title).toBe('Overlap');
    expect(second.warnings.length).toBeGreaterThan(0);
    expect(second.warnings[0]?.code).toBe('schedule_conflict');
  });

  it('tenant B cannot read tenant A schedules', async () => {
    const a = await createTenantUser('admin');
    const b = await createTenantUser('admin');
    const { schedule } = await schedulesRepo.createSchedule(
      a.tenant.id,
      'admin',
      a.membership.id,
      {
        title: 'Secret',
        startAt: new Date('2030-05-01T10:00:00Z'),
        endAt: new Date('2030-05-01T11:00:00Z'),
      },
    );
    await expect(
      schedulesRepo.getScheduleOrThrow(
        b.tenant.id,
        schedule.id,
        'admin',
        b.membership.id,
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
