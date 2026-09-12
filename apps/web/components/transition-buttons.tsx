import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/status-badge';

export function TransitionButtons({
  current,
  allowed,
  labels,
  pending,
  onPick,
}: {
  current: string;
  allowed: string[];
  labels: Record<string, string>;
  pending?: boolean;
  onPick: (to: string) => void;
}) {
  if (allowed.length === 0) {
    return <p className="text-sm text-slate-500">已是終態，沒有可執行的轉換。</p>;
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <StatusBadge value={current} label={labels[current] ?? current} />
      {allowed.map((to) => (
        <Button
          key={to}
          type="button"
          size="sm"
          variant={to === 'lost' || to === 'cancelled' ? 'danger' : 'outline'}
          disabled={pending}
          title={`轉換為 ${labels[to] ?? to}`}
          onClick={() => onPick(to)}
        >
          {labels[to] ?? to}
        </Button>
      ))}
    </div>
  );
}
