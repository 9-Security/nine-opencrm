import { redirect } from 'next/navigation';
import { canWriteOpportunities } from '@crm/shared';
import { NewOpportunityForm } from '@/components/new-opportunity-form';
import { requireTenant } from '@/lib/tenant';

export default async function NewOpportunityPage() {
  const ctx = await requireTenant();
  if (!canWriteOpportunities(ctx.role)) redirect('/?error=forbidden');
  return <NewOpportunityForm />;
}
