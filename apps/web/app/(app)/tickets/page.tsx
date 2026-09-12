import { canWriteTickets } from '@crm/shared';
import { TicketList } from '@/components/ticket-list';
import { requireTenant } from '@/lib/tenant';

export default async function TicketsPage() {
  const ctx = await requireTenant();
  return (
    <TicketList
      canWrite={canWriteTickets(ctx.role)}
      isEngineering={ctx.role === 'engineering'}
    />
  );
}
