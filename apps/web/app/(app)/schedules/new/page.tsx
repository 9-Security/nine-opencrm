import { redirect } from 'next/navigation';
import { canWriteAnySchedule } from '@crm/shared';
import { NewScheduleForm } from '@/components/new-schedule-form';
import { requireTenant } from '@/lib/tenant';

export default async function NewSchedulePage() {
  const ctx = await requireTenant();
  if (!canWriteAnySchedule(ctx.role)) redirect('/?error=forbidden');
  return <NewScheduleForm />;
}
