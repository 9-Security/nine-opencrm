import { describe, expect, it } from 'vitest';
import { ForbiddenError, NotFoundError, companiesRepo, tagsRepo } from '@crm/db';
import { createTenantUser } from './helpers';

describe('company tags', () => {
  it('sets tags on update and filters list by tag', async () => {
    const a = await createTenantUser('admin');
    const vip = await companiesRepo.createCompany(a.tenant.id, 'admin', {
      name: 'VIP Co',
      tags: ['VIP', '北區'],
    });
    await companiesRepo.createCompany(a.tenant.id, 'admin', {
      name: 'Plain Co',
      tags: ['南區'],
    });
    expect(vip.tags.sort()).toEqual(['VIP', '北區']);

    const listed = await companiesRepo.listCompanies(a.tenant.id, { tag: 'VIP' });
    expect(listed.map((c) => c.name)).toEqual(['VIP Co']);

    const names = await tagsRepo.listTags(a.tenant.id);
    expect(names.map((t) => t.name).sort()).toEqual(['VIP', '北區', '南區'].sort());
  });

  it('does not leak tags or tagged companies across tenants', async () => {
    const a = await createTenantUser('admin');
    const b = await createTenantUser('admin');
    const company = await companiesRepo.createCompany(a.tenant.id, 'admin', {
      name: 'Secret',
      tags: ['內部'],
    });
    const bList = await companiesRepo.listCompanies(b.tenant.id, { tag: '內部' });
    expect(bList).toEqual([]);
    expect(await tagsRepo.listTags(b.tenant.id)).toEqual([]);
    await expect(
      companiesRepo.updateCompany(b.tenant.id, 'admin', company.id, {
        tags: ['hacked'],
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('support cannot tag companies', async () => {
    const support = await createTenantUser('support');
    await expect(
      companiesRepo.createCompany(support.tenant.id, 'support', {
        name: 'Nope',
        tags: ['x'],
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
