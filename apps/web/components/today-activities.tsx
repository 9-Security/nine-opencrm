'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { StatusBadge } from '@/components/status-badge';
import { ACTIVITY_STATUS_LABELS } from '@crm/shared';

export type InboxActivity = {
  id: string;
  title: string;
  status: 'todo' | 'done';
  dueAt: string | null;
  company: { id: string; name: string } | null;
  opportunity: { id: string; title: string } | null;
};

export function TodayActivities({
  activities,
  canWrite,
}: {
  activities: InboxActivity[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);

  async function toggle(id: string, to: 'todo' | 'done') {
    setPendingId(id);
    const res = await fetch(`/api/activities/${id}/transition`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to }),
    });
    setPendingId(null);
    if (!res.ok) {
      toast.error('無法更新待辦');
      return;
    }
    toast.success(to === 'done' ? '已完成' : '已重開');
    router.refresh();
  }

  return (
    <Card className="mt-6">
      <CardHeader>
        <h2 className="text-sm font-semibold text-slate-800">今日／逾期待辦</h2>
      </CardHeader>
      <CardBody>
        {activities.length === 0 ? (
          <p className="text-sm text-slate-500">沒有到期或逾期的待辦。</p>
        ) : (
          <ul className="space-y-2">
            {activities.map((a) => {
              const due = a.dueAt ? new Date(a.dueAt) : null;
              const overdue = Boolean(due && due < startOfDay);
              return (
                <li
                  key={a.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2 text-sm"
                >
                  <div>
                    <div className="font-medium">{a.title}</div>
                    <div className="text-xs text-slate-500">
                      {due ? due.toLocaleString() : '無到期日'}
                      {overdue ? ' · 逾期' : ''}
                      {a.company ? (
                        <>
                          {' · '}
                          <Link
                            href={`/companies/${a.company.id}`}
                            className="hover:text-accent"
                          >
                            {a.company.name}
                          </Link>
                        </>
                      ) : null}
                      {a.opportunity ? (
                        <>
                          {' · '}
                          <Link
                            href={`/opportunities/${a.opportunity.id}`}
                            className="hover:text-accent"
                          >
                            {a.opportunity.title}
                          </Link>
                        </>
                      ) : null}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={!canWrite || pendingId === a.id}
                    onClick={() => toggle(a.id, a.status === 'todo' ? 'done' : 'todo')}
                  >
                    <StatusBadge
                      value={a.status}
                      label={ACTIVITY_STATUS_LABELS[a.status]}
                    />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
