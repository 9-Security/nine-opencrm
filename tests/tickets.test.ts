import { describe, expect, it } from 'vitest';
import {
  ForbiddenError,
  NotFoundError,
  TenantIsolationError,
  ticketsRepo,
  prisma,
} from '@crm/db';
import { IllegalTransitionError } from '@crm/shared';
import { createTenantUser } from './helpers';

describe('tickets', () => {
  it('cross-tenant GET looks like 404', async () => {
    const a = await createTenantUser('admin');
    const b = await createTenantUser('admin');
    const ticket = await ticketsRepo.createTicket(a.tenant.id, 'admin', {
      title: 'A ticket',
    });
    await expect(
      ticketsRepo.getTicketOrThrow(b.tenant.id, ticket.id, 'admin'),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      ticketsRepo.transitionTicket(
        b.tenant.id,
        'admin',
        ticket.id,
        'in_progress',
        b.membership.id,
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('hides internal comments from sales', async () => {
    const admin = await createTenantUser('admin');
    const sales = await createTenantUser('sales', { tenantId: admin.tenant.id });
    const ticket = await ticketsRepo.createTicket(admin.tenant.id, 'admin', {
      title: 'Visible',
    });
    await ticketsRepo.addComment(
      admin.tenant.id,
      'admin',
      ticket.id,
      admin.membership.id,
      'public note',
      false,
    );
    await ticketsRepo.addComment(
      admin.tenant.id,
      'admin',
      ticket.id,
      admin.membership.id,
      'secret',
      true,
    );
    const asSales = await ticketsRepo.getTicketOrThrow(
      admin.tenant.id,
      ticket.id,
      'sales',
    );
    expect(asSales.comments.map((c) => c.body)).toEqual(['public note']);
    const asAdmin = await ticketsRepo.getTicketOrThrow(
      admin.tenant.id,
      ticket.id,
      'admin',
    );
    expect(asAdmin.comments).toHaveLength(2);
    expect(sales.membership.role).toBe('sales');
  });

  it('rejects illegal ticket transitions and records legal ones', async () => {
    const a = await createTenantUser('support');
    const ticket = await ticketsRepo.createTicket(a.tenant.id, 'support', {
      title: 'Flow',
    });
    await expect(
      ticketsRepo.transitionTicket(
        a.tenant.id,
        'support',
        ticket.id,
        'closed',
        a.membership.id,
      ),
    ).rejects.toBeInstanceOf(IllegalTransitionError);
    const moved = await ticketsRepo.transitionTicket(
      a.tenant.id,
      'support',
      ticket.id,
      'in_progress',
      a.membership.id,
    );
    expect(moved.status).toBe('in_progress');
    const events = await prisma.statusEvent.findMany({
      where: { tenantId: a.tenant.id, entityId: ticket.id },
    });
    expect(events[0]?.toStatus).toBe('in_progress');
  });

  it('unlink schedule does not delete either entity', async () => {
    const a = await createTenantUser('admin');
    const { schedulesRepo } = await import('@crm/db');
    const ticket = await ticketsRepo.createTicket(a.tenant.id, 'admin', { title: 'T' });
    const { schedule } = await schedulesRepo.createSchedule(
      a.tenant.id,
      'admin',
      a.membership.id,
      {
        title: 'S',
        startAt: new Date('2030-01-01T10:00:00Z'),
        endAt: new Date('2030-01-01T11:00:00Z'),
      },
    );
    await ticketsRepo.linkSchedule(a.tenant.id, 'admin', ticket.id, schedule.id);
    await ticketsRepo.unlinkSchedule(a.tenant.id, 'admin', ticket.id, schedule.id);
    await expect(
      ticketsRepo.getTicketOrThrow(a.tenant.id, ticket.id, 'admin'),
    ).resolves.toBeTruthy();
    await expect(
      schedulesRepo.getScheduleOrThrow(
        a.tenant.id,
        schedule.id,
        'admin',
        a.membership.id,
      ),
    ).resolves.toBeTruthy();
    const links = await prisma.ticketScheduleLink.findMany({
      where: { tenantId: a.tenant.id },
    });
    expect(links).toHaveLength(0);
  });

  it('rejects linking a foreign schedule', async () => {
    const a = await createTenantUser('admin');
    const b = await createTenantUser('admin');
    const { schedulesRepo } = await import('@crm/db');
    const ticket = await ticketsRepo.createTicket(a.tenant.id, 'admin', { title: 'T' });
    const { schedule } = await schedulesRepo.createSchedule(
      b.tenant.id,
      'admin',
      b.membership.id,
      {
        title: 'Other',
        startAt: new Date('2030-02-01T10:00:00Z'),
        endAt: new Date('2030-02-01T11:00:00Z'),
      },
    );
    await expect(
      ticketsRepo.linkSchedule(a.tenant.id, 'admin', ticket.id, schedule.id),
    ).rejects.toBeInstanceOf(TenantIsolationError);
  });

  it('sales cannot write tickets', async () => {
    const sales = await createTenantUser('sales');
    await expect(
      ticketsRepo.createTicket(sales.tenant.id, 'sales', { title: 'Nope' }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('does not leak other members schedules to sales via ticket GET', async () => {
    const admin = await createTenantUser('admin');
    const sales = await createTenantUser('sales', { tenantId: admin.tenant.id });
    const { schedulesRepo } = await import('@crm/db');
    const ticket = await ticketsRepo.createTicket(admin.tenant.id, 'admin', {
      title: 'Shared ticket',
    });
    const { schedule } = await schedulesRepo.createSchedule(
      admin.tenant.id,
      'admin',
      admin.membership.id,
      {
        title: 'Admin only visit',
        startAt: new Date('2030-06-01T10:00:00Z'),
        endAt: new Date('2030-06-01T11:00:00Z'),
        assigneeMembershipId: admin.membership.id,
      },
    );
    await ticketsRepo.linkSchedule(admin.tenant.id, 'admin', ticket.id, schedule.id);
    const { schedule: salesSched } = await schedulesRepo.createSchedule(
      admin.tenant.id,
      'sales',
      sales.membership.id,
      {
        title: 'Sales visit',
        startAt: new Date('2030-06-01T12:00:00Z'),
        endAt: new Date('2030-06-01T13:00:00Z'),
      },
    );
    await ticketsRepo.linkSchedule(admin.tenant.id, 'admin', ticket.id, salesSched.id);

    const asSales = await ticketsRepo.getTicketOrThrow(
      admin.tenant.id,
      ticket.id,
      'sales',
      sales.membership.id,
    );
    expect(asSales.scheduleLinks.map((l) => l.schedule.title)).toEqual(['Sales visit']);

    const asAdmin = await ticketsRepo.getTicketOrThrow(
      admin.tenant.id,
      ticket.id,
      'admin',
      admin.membership.id,
    );
    expect(asAdmin.scheduleLinks.map((l) => l.schedule.title).sort()).toEqual([
      'Admin only visit',
      'Sales visit',
    ]);
  });

  it('engineering default list is unassigned plus mine', async () => {
    const admin = await createTenantUser('admin');
    const eng = await createTenantUser('engineering', { tenantId: admin.tenant.id });
    await ticketsRepo.createTicket(admin.tenant.id, 'admin', {
      title: 'Unassigned',
    });
    await ticketsRepo.createTicket(admin.tenant.id, 'admin', {
      title: 'Admin owned',
      assigneeMembershipId: admin.membership.id,
    });
    await ticketsRepo.createTicket(admin.tenant.id, 'admin', {
      title: 'Eng owned',
      assigneeMembershipId: eng.membership.id,
    });
    const listed = await ticketsRepo.listTickets(admin.tenant.id, {
      engineeringDefault: true,
      membershipId: eng.membership.id,
    });
    const titles = listed.map((t) => t.title).sort();
    expect(titles).toEqual(['Eng owned', 'Unassigned']);
  });
});
