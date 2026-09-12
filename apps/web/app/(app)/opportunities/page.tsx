import { canWriteOpportunities } from '@crm/shared';
import { OpportunityBoard } from '@/components/opportunity-board';
import { requireTenant } from '@/lib/tenant';

export default async function OpportunitiesPage() {
  const ctx = await requireTenant();
  return <OpportunityBoard canWrite={canWriteOpportunities(ctx.role)} />;
}
