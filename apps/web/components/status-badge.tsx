import { cn } from '@/lib/utils';

const COLORS: Record<string, string> = {
  lead: 'bg-slate-100 text-slate-700',
  negotiating: 'bg-sky-100 text-sky-800',
  quoted: 'bg-amber-100 text-amber-800',
  won: 'bg-emerald-100 text-emerald-800',
  lost: 'bg-slate-200 text-slate-600',
  open: 'bg-sky-100 text-sky-800',
  in_progress: 'bg-amber-100 text-amber-800',
  pending_reply: 'bg-violet-100 text-violet-800',
  resolved: 'bg-emerald-100 text-emerald-800',
  closed: 'bg-slate-200 text-slate-600',
  scheduled: 'bg-sky-100 text-sky-800',
  completed: 'bg-emerald-100 text-emerald-800',
  cancelled: 'bg-slate-200 text-slate-600',
  todo: 'bg-amber-100 text-amber-800',
  done: 'bg-emerald-100 text-emerald-800',
  low: 'bg-slate-100 text-slate-600',
  medium: 'bg-sky-100 text-sky-800',
  high: 'bg-amber-100 text-amber-800',
  critical: 'bg-red-100 text-red-800',
  field_work: 'bg-blue-100 text-blue-800',
  booking: 'bg-violet-100 text-violet-800',
};

export function StatusBadge({
  value,
  label,
  className,
}: {
  value: string;
  label: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        COLORS[value] ?? 'bg-slate-100 text-slate-700',
        className,
      )}
    >
      {label}
    </span>
  );
}
