'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  PRIORITY_LABELS,
  PRIORITIES,
  TICKET_STATUS_LABELS,
  TICKET_STATUSES,
  type Priority,
  type TicketStatus,
} from '@crm/shared';
import { PageHeader } from '@/components/app-shell';
import { EmptyState } from '@/components/empty-state';
import { StatusBadge } from '@/components/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';

type Row = {
  id: string;
  title: string;
  status: TicketStatus;
  priority: Priority;
  company: { name: string } | null;
  assignee: { user: { name: string | null; email: string } } | null;
};

export function TicketList({
  canWrite,
  isEngineering,
}: {
  canWrite: boolean;
  isEngineering: boolean;
}) {
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [all, setAll] = useState(!isEngineering);
  const query = useQuery({
    queryKey: ['tickets', status, priority, all],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      if (priority) params.set('priority', priority);
      if (all) params.set('all', '1');
      const res = await fetch(`/api/tickets?${params}`);
      if (!res.ok) throw new Error('failed');
      return res.json() as Promise<{ tickets: Row[] }>;
    },
  });
  const rows = query.data?.tickets ?? [];

  return (
    <div>
      <PageHeader
        title="工單"
        description={
          isEngineering && !all ? '工程預設：未指派 + 指派給我' : '狀態流、留言與關聯排程'
        }
        actions={
          canWrite ? (
            <Link href="/tickets/new">
              <Button>新建工單</Button>
            </Link>
          ) : (
            <Badge>唯讀</Badge>
          )
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="w-40"
        >
          <option value="">全部狀態</option>
          {TICKET_STATUSES.map((s) => (
            <option key={s} value={s}>
              {TICKET_STATUS_LABELS[s]}
            </option>
          ))}
        </Select>
        <Select
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
          className="w-40"
        >
          <option value="">全部優先級</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABELS[p]}
            </option>
          ))}
        </Select>
        {isEngineering ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setAll((v) => !v)}
          >
            {all ? '只看未指派與我的' : '顯示全部'}
          </Button>
        ) : null}
      </div>
      {query.isLoading ? (
        <p className="text-sm text-slate-500">載入中…</p>
      ) : rows.length === 0 ? (
        <EmptyState
          title="尚無工單"
          description="建立工單後可指派、留言並手動關聯排程。"
          actionHref={canWrite ? '/tickets/new' : undefined}
          actionLabel={canWrite ? '新建工單' : undefined}
        />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-card">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">標題</th>
                <th className="px-4 py-3 font-medium">狀態</th>
                <th className="px-4 py-3 font-medium">優先級</th>
                <th className="px-4 py-3 font-medium">公司</th>
                <th className="px-4 py-3 font-medium">負責人</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">
                    <Link
                      href={`/tickets/${t.id}`}
                      className="font-medium hover:text-accent"
                    >
                      {t.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge
                      value={t.status}
                      label={TICKET_STATUS_LABELS[t.status]}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge value={t.priority} label={PRIORITY_LABELS[t.priority]} />
                  </td>
                  <td className="px-4 py-3">{t.company?.name ?? '—'}</td>
                  <td className="px-4 py-3">
                    {t.assignee?.user.name || t.assignee?.user.email || '未指派'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
