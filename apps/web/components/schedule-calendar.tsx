'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  SCHEDULE_STATUS_LABELS,
  SCHEDULE_TYPE_LABELS,
  type ScheduleStatus,
  type ScheduleType,
} from '@crm/shared';
import { PageHeader } from '@/components/app-shell';
import { EmptyState } from '@/components/empty-state';
import { StatusBadge } from '@/components/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

type Row = {
  id: string;
  title: string;
  type: ScheduleType;
  status: ScheduleStatus;
  startAt: string;
  endAt: string;
  assignee: { user: { name: string | null; email: string } } | null;
};

function startOfWeek(d: Date) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(d: Date, n: number) {
  const next = new Date(d);
  next.setDate(next.getDate() + n);
  return next;
}

const TYPE_BAR: Record<ScheduleType, string> = {
  field_work: 'bg-blue-500',
  booking: 'bg-violet-500',
};

export function ScheduleCalendar({ canWrite }: { canWrite: boolean }) {
  const [view, setView] = useState<'week' | 'list'>('week');
  const [cursor, setCursor] = useState(() => startOfWeek(new Date()));
  const from = cursor;
  const to = addDays(cursor, 7);

  const query = useQuery({
    queryKey: ['schedules', from.toISOString(), to.toISOString()],
    queryFn: async () => {
      const params = new URLSearchParams({
        from: from.toISOString(),
        to: to.toISOString(),
      });
      const res = await fetch(`/api/schedules?${params}`);
      if (!res.ok) throw new Error('failed');
      return res.json() as Promise<{ schedules: Row[] }>;
    },
  });
  const rows = query.data?.schedules ?? [];
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(from, i)),
    [from],
  );
  const byDay = useMemo(() => {
    const events = query.data?.schedules ?? [];
    return days.map((day) => {
      const next = addDays(day, 1);
      return events.filter((r) => {
        const start = new Date(r.startAt);
        return start >= day && start < next;
      });
    });
  }, [days, query.data?.schedules]);

  return (
    <div>
      <PageHeader
        title="排程"
        description="週曆為預設；時間衝突只警告、不擋儲存"
        actions={
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant={view === 'week' ? 'default' : 'outline'}
              onClick={() => setView('week')}
            >
              週曆
            </Button>
            <Button
              type="button"
              size="sm"
              variant={view === 'list' ? 'default' : 'outline'}
              onClick={() => setView('list')}
            >
              列表
            </Button>
            {canWrite ? (
              <Link href="/schedules/new">
                <Button size="sm">新建排程</Button>
              </Link>
            ) : (
              <Badge>唯讀</Badge>
            )}
          </div>
        }
      />
      <div className="mb-4 flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setCursor(addDays(cursor, -7))}
        >
          上一週
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setCursor(startOfWeek(new Date()))}
        >
          本週
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setCursor(addDays(cursor, 7))}
        >
          下一週
        </Button>
        <span className="text-sm text-slate-600">
          {from.toLocaleDateString()} – {addDays(to, -1).toLocaleDateString()}
        </span>
      </div>
      {query.isLoading ? (
        <p className="text-sm text-slate-500">載入中…</p>
      ) : rows.length === 0 && view === 'list' ? (
        <EmptyState
          title="本週尚無排程"
          description="建立出勤或預約；若與既有行程重疊會顯示黃色警告。"
          actionHref={canWrite ? '/schedules/new' : undefined}
          actionLabel={canWrite ? '新建排程' : undefined}
        />
      ) : view === 'list' ? (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">標題</th>
                <th className="px-4 py-3 font-medium">類型</th>
                <th className="px-4 py-3 font-medium">狀態</th>
                <th className="px-4 py-3 font-medium">開始</th>
                <th className="px-4 py-3 font-medium">人員</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">
                    <Link
                      href={`/schedules/${s.id}`}
                      className="font-medium hover:text-accent"
                    >
                      {s.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge value={s.type} label={SCHEDULE_TYPE_LABELS[s.type]} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge
                      value={s.status}
                      label={SCHEDULE_STATUS_LABELS[s.status]}
                    />
                  </td>
                  <td className="px-4 py-3">{new Date(s.startAt).toLocaleString()}</td>
                  <td className="px-4 py-3">
                    {s.assignee?.user.name || s.assignee?.user.email || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-7 gap-2">
          {days.map((day, i) => (
            <div
              key={day.toISOString()}
              className="min-h-[220px] rounded-2xl bg-slate-100/80 p-2"
            >
              <div className="mb-2 text-xs font-medium text-slate-600">
                {day.toLocaleDateString(undefined, {
                  weekday: 'short',
                  month: 'numeric',
                  day: 'numeric',
                })}
              </div>
              <div className="space-y-2">
                {byDay[i]?.map((s) => (
                  <Link
                    key={s.id}
                    href={`/schedules/${s.id}`}
                    className="block rounded-lg bg-white p-2 text-xs shadow-sm hover:border-accent/40"
                  >
                    <span
                      className={`mb-1 inline-block h-1.5 w-8 rounded ${TYPE_BAR[s.type]}`}
                    />
                    <div className="font-medium text-slate-900">{s.title}</div>
                    <div className="text-slate-500">
                      {new Date(s.startAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                    <StatusBadge
                      value={s.status}
                      label={SCHEDULE_STATUS_LABELS[s.status]}
                    />
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
