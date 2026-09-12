import { describe, expect, it } from 'vitest';
import { companiesRepo, opportunitiesRepo, reportsRepo, ticketsRepo } from '@crm/db';
import { createTenantUser } from './helpers';

describe('reports and activity inbox', () => {
  it('dashboard and report summaries stay tenant scoped', async () => {
    const a = await createTenantUser('admin');
    const b = await createTenantUser('admin');
    await companiesRepo.createCompany(a.tenant.id, 'admin', { name: 'Only A' });
    await ticketsRepo.createTicket(a.tenant.id, 'admin', { title: 'Open A' });
    await opportunitiesRepo.createOpportunity(a.tenant.id, 'admin', {
      title: 'Deal A',
    });

    const dashA = await reportsRepo.dashboardSummary(a.tenant.id);
    const dashB = await reportsRepo.dashboardSummary(b.tenant.id);
    expect(dashA.companyCount).toBeGreaterThanOrEqual(1);
    expect(dashA.openTickets).toBeGreaterThanOrEqual(1);
    expect(dashB.companyCount).toBe(0);
    expect(dashB.openTickets).toBe(0);

    const reportB = await reportsRepo.reportSummary(b.tenant.id);
    expect(reportB.ticketOpen).toBe(0);
    expect(reportB.funnel.reduce((n, row) => n + row._count._all, 0)).toBe(0);
  });

  it('inbox lists overdue and today todos only for this tenant', async () => {
    const a = await createTenantUser('admin');
    const b = await createTenantUser('admin');
    const due = new Date();
    due.setHours(12, 0, 0, 0);
    await opportunitiesRepo.createActivity(a.tenant.id, 'admin', {
      title: 'Call A',
      dueAt: due,
    });
    await opportunitiesRepo.createActivity(b.tenant.id, 'admin', {
      title: 'Call B',
      dueAt: due,
    });
    const inbox = await opportunitiesRepo.listActivities(a.tenant.id, {
      inbox: true,
    });
    expect(inbox.map((row) => row.title)).toEqual(['Call A']);
  });
});
