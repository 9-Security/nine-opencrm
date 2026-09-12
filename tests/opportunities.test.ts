import { describe, expect, it } from 'vitest';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  TenantIsolationError,
  opportunitiesRepo,
  prisma,
} from '@crm/db';
import { IllegalTransitionError } from '@crm/shared';
import { createTenantUser } from './helpers';

describe('opportunities', () => {
  it('hides foreign opportunities as 404', async () => {
    const a = await createTenantUser('admin');
    const b = await createTenantUser('admin');
    const opp = await opportunitiesRepo.createOpportunity(a.tenant.id, 'admin', {
      title: 'Alpha deal',
    });
    await expect(
      opportunitiesRepo.getOpportunityOrThrow(b.tenant.id, opp.id),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      opportunitiesRepo.transitionOpportunity(
        b.tenant.id,
        'admin',
        opp.id,
        'negotiating',
        b.membership.id,
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('writes status_events on legal transition and rejects illegal ones', async () => {
    const a = await createTenantUser('admin');
    const opp = await opportunitiesRepo.createOpportunity(a.tenant.id, 'admin', {
      title: 'Pipeline',
    });
    const moved = await opportunitiesRepo.transitionOpportunity(
      a.tenant.id,
      'admin',
      opp.id,
      'negotiating',
      a.membership.id,
    );
    expect(moved.stage).toBe('negotiating');
    const events = await prisma.statusEvent.findMany({
      where: { tenantId: a.tenant.id, entityId: opp.id },
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.toStatus).toBe('negotiating');

    await expect(
      opportunitiesRepo.transitionOpportunity(
        a.tenant.id,
        'admin',
        opp.id,
        'won',
        a.membership.id,
      ),
    ).rejects.toBeInstanceOf(IllegalTransitionError);
  });

  it('rejects cross-tenant company on create', async () => {
    const a = await createTenantUser('admin');
    const b = await createTenantUser('admin');
    const { companiesRepo } = await import('@crm/db');
    const foreign = await companiesRepo.createCompany(b.tenant.id, 'admin', {
      name: 'X',
    });
    await expect(
      opportunitiesRepo.createOpportunity(a.tenant.id, 'admin', {
        title: 'Bad',
        companyId: foreign.id,
      }),
    ).rejects.toBeInstanceOf(TenantIsolationError);
  });

  it('engineering cannot write opportunities', async () => {
    const eng = await createTenantUser('engineering');
    await expect(
      opportunitiesRepo.createOpportunity(eng.tenant.id, 'engineering', {
        title: 'Nope',
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('PATCH/update does not change stage', async () => {
    const a = await createTenantUser('admin');
    const opp = await opportunitiesRepo.createOpportunity(a.tenant.id, 'admin', {
      title: 'Stay lead',
    });
    const updated = await opportunitiesRepo.updateOpportunity(
      a.tenant.id,
      'admin',
      opp.id,
      { title: 'Renamed' },
    );
    expect(updated.title).toBe('Renamed');
    expect(updated.stage).toBe('lead');
  });

  it('concurrent legal transitions keep a single winning state', async () => {
    const a = await createTenantUser('admin');
    const opp = await opportunitiesRepo.createOpportunity(a.tenant.id, 'admin', {
      title: 'Race',
    });
    const results = await Promise.allSettled([
      opportunitiesRepo.transitionOpportunity(
        a.tenant.id,
        'admin',
        opp.id,
        'negotiating',
        a.membership.id,
      ),
      opportunitiesRepo.transitionOpportunity(
        a.tenant.id,
        'admin',
        opp.id,
        'lost',
        a.membership.id,
      ),
    ]);
    const ok = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter((r) => r.status === 'rejected');
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(1);
    const reason = (failed[0] as PromiseRejectedResult).reason;
    expect(
      reason instanceof ConflictError || reason instanceof IllegalTransitionError,
    ).toBe(true);
    const final = await opportunitiesRepo.getOpportunityOrThrow(a.tenant.id, opp.id);
    expect(['negotiating', 'lost']).toContain(final.stage);
    const events = await prisma.statusEvent.findMany({
      where: { tenantId: a.tenant.id, entityId: opp.id },
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.toStatus).toBe(final.stage);
  });
});
