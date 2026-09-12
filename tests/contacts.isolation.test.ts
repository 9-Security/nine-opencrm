import { describe, expect, it } from 'vitest';
import {
  ForbiddenError,
  NotFoundError,
  TenantIsolationError,
  contactsRepo,
} from '@crm/db';
import { createTenantUser } from './helpers';

describe('contact tenant isolation', () => {
  it('tenant B cannot GET/PATCH/DELETE tenant A contact (looks like 404)', async () => {
    const a = await createTenantUser('admin');
    const b = await createTenantUser('admin');
    const contact = await contactsRepo.createContact(a.tenant.id, 'admin', {
      firstName: 'Ada',
      lastName: 'Lin',
    });

    await expect(
      contactsRepo.getContactOrThrow(b.tenant.id, contact.id),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      contactsRepo.updateContact(b.tenant.id, 'admin', contact.id, {
        firstName: 'Hacked',
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      contactsRepo.deleteContact(b.tenant.id, 'admin', contact.id),
    ).rejects.toBeInstanceOf(NotFoundError);

    const still = await contactsRepo.getContactOrThrow(a.tenant.id, contact.id);
    expect(still.firstName).toBe('Ada');
  });

  it('rejects cross-tenant company association', async () => {
    const a = await createTenantUser('admin');
    const b = await createTenantUser('admin');
    const { companiesRepo } = await import('@crm/db');
    const foreign = await companiesRepo.createCompany(b.tenant.id, 'admin', {
      name: 'Other Co',
    });
    await expect(
      contactsRepo.createContact(a.tenant.id, 'admin', {
        firstName: 'Bad',
        lastName: 'Link',
        companyId: foreign.id,
      }),
    ).rejects.toBeInstanceOf(TenantIsolationError);
  });

  it('support cannot write contacts', async () => {
    const support = await createTenantUser('support');
    await expect(
      contactsRepo.createContact(support.tenant.id, 'support', {
        firstName: 'No',
        lastName: 'pe',
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('lists contact-scoped activities and rejects cross-tenant links', async () => {
    const a = await createTenantUser('admin');
    const b = await createTenantUser('admin');
    const contact = await contactsRepo.createContact(a.tenant.id, 'admin', {
      firstName: 'Ada',
      lastName: 'Lin',
    });
    const { opportunitiesRepo } = await import('@crm/db');
    await opportunitiesRepo.createActivity(a.tenant.id, 'admin', {
      title: 'Follow up',
      contactId: contact.id,
    });
    const loaded = await contactsRepo.getContactOrThrow(a.tenant.id, contact.id);
    expect(loaded.activities.map((row) => row.title)).toContain('Follow up');
    await expect(
      opportunitiesRepo.createActivity(b.tenant.id, 'admin', {
        title: 'Hacked',
        contactId: contact.id,
      }),
    ).rejects.toBeInstanceOf(TenantIsolationError);
  });
});
