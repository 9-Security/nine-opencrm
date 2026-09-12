import { redirect } from 'next/navigation';
import { canWriteTickets } from '@crm/shared';
import { NewTicketForm } from '@/components/new-ticket-form';
import { requireTenant } from '@/lib/tenant';

export default async function NewTicketPage() {
  const ctx = await requireTenant();
  if (!canWriteTickets(ctx.role)) redirect('/?error=forbidden');
  return <NewTicketForm />;
}
