import { canWriteAnySchedule } from '@crm/shared';
import { ScheduleCalendar } from '@/components/schedule-calendar';
import { requireTenant } from '@/lib/tenant';

export default async function SchedulesPage() {
  const ctx = await requireTenant();
  return (
    <ScheduleCalendar canWrite={canWriteAnySchedule(ctx.role)} workdays={ctx.workdays} />
  );
}
