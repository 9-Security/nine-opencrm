import { prisma } from '../client';
import { TenantIsolationError, requireTenantId } from '../errors';

export async function assertMembershipInTenant(
  tenantId: string,
  membershipId: string,
): Promise<void> {
  requireTenantId(tenantId);
  const membership = await prisma.membership.findFirst({
    where: { id: membershipId, tenantId, status: 'active' },
    select: { id: true },
  });
  if (!membership) {
    throw new TenantIsolationError('Membership does not belong to this tenant');
  }
}

export async function assertCompanyInTenant(
  tenantId: string,
  companyId: string,
): Promise<void> {
  requireTenantId(tenantId);
  const company = await prisma.company.findFirst({
    where: { id: companyId, tenantId, deletedAt: null },
    select: { id: true },
  });
  if (!company) {
    throw new TenantIsolationError('Related company is not in this tenant');
  }
}

export async function assertContactInTenant(
  tenantId: string,
  contactId: string,
): Promise<void> {
  requireTenantId(tenantId);
  const contact = await prisma.contact.findFirst({
    where: { id: contactId, tenantId },
    select: { id: true },
  });
  if (!contact) {
    throw new TenantIsolationError('Related contact is not in this tenant');
  }
}

export async function assertOpportunityInTenant(
  tenantId: string,
  opportunityId: string,
): Promise<void> {
  requireTenantId(tenantId);
  const opportunity = await prisma.opportunity.findFirst({
    where: { id: opportunityId, tenantId },
    select: { id: true },
  });
  if (!opportunity) {
    throw new TenantIsolationError('Related opportunity is not in this tenant');
  }
}

export async function assertTicketInTenant(
  tenantId: string,
  ticketId: string,
): Promise<void> {
  requireTenantId(tenantId);
  const ticket = await prisma.ticket.findFirst({
    where: { id: ticketId, tenantId },
    select: { id: true },
  });
  if (!ticket) {
    throw new TenantIsolationError('Related ticket is not in this tenant');
  }
}

export async function assertScheduleInTenant(
  tenantId: string,
  scheduleId: string,
): Promise<void> {
  requireTenantId(tenantId);
  const schedule = await prisma.schedule.findFirst({
    where: { id: scheduleId, tenantId },
    select: { id: true },
  });
  if (!schedule) {
    throw new TenantIsolationError('Related schedule is not in this tenant');
  }
}

export async function assertOptionalRelations(
  tenantId: string,
  ids: {
    companyId?: string | null;
    contactId?: string | null;
    opportunityId?: string | null;
    membershipId?: string | null;
  },
): Promise<void> {
  if (ids.companyId) await assertCompanyInTenant(tenantId, ids.companyId);
  if (ids.contactId) await assertContactInTenant(tenantId, ids.contactId);
  if (ids.opportunityId) await assertOpportunityInTenant(tenantId, ids.opportunityId);
  if (ids.membershipId) await assertMembershipInTenant(tenantId, ids.membershipId);
}
