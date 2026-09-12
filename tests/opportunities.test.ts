import { describe, expect, it } from 'vitest';
import {
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
});
