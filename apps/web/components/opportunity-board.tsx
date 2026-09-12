'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  OPPORTUNITY_STAGE_LABELS,
  OPPORTUNITY_STAGES,
  type OpportunityStage,
} from '@crm/shared';
import { PageHeader } from '@/components/app-shell';
import { EmptyState } from '@/components/empty-state';
import { StatusBadge } from '@/components/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

type Row = {
  id: string;
  title: string;
  amount: string | null;
  stage: OpportunityStage;
  company: { name: string } | null;
};

export function OpportunityBoard({ canWrite }: { canWrite: boolean }) {
  const [view, setView] = useState<'board' | 'list'>('board');
  const query = useQuery({
    queryKey: ['opportunities'],
    queryFn: async () => {
      const res = await fetch('/api/opportunities');
      if (!res.ok) throw new Error('failed');
      return res.json() as Promise<{ opportunities: Row[] }>;
    },
  });
  const rows = query.data?.opportunities ?? [];
  const byStage = useMemo(() => {
    const map = Object.fromEntries(
      OPPORTUNITY_STAGES.map((s) => [s, [] as Row[]]),
    ) as Record<OpportunityStage, Row[]>;
    for (const row of query.data?.opportunities ?? []) map[row.stage].push(row);
    return map;
  }, [query.data?.opportunities]);

  return (
    <div>
      <PageHeader
        title="商機"
        description="列表或看板；階段操作在詳情頁"
        actions={
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant={view === 'board' ? 'default' : 'outline'}
              onClick={() => setView('board')}
            >
              看板
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
              <Link href="/opportunities/new">
                <Button size="sm">新建商機</Button>
              </Link>
            ) : (
              <Badge>唯讀</Badge>
            )}
          </div>
        }
      />
      {query.isLoading ? (
        <p className="text-sm text-slate-500">載入中…</p>
      ) : rows.length === 0 ? (
        <EmptyState
          title="尚無商機"
          description="建立商機後即可推進階段、標記成交或失單。"
          actionHref={canWrite ? '/opportunities/new' : undefined}
          actionLabel={canWrite ? '新建商機' : undefined}
        />
      ) : view === 'list' ? (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">標題</th>
                <th className="px-4 py-3 font-medium">階段</th>
                <th className="px-4 py-3 font-medium">金額</th>
                <th className="px-4 py-3 font-medium">公司</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">
                    <Link
                      href={`/opportunities/${o.id}`}
                      className="font-medium hover:text-accent"
                    >
                      {o.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge
                      value={o.stage}
                      label={OPPORTUNITY_STAGE_LABELS[o.stage]}
                    />
                  </td>
                  <td className="px-4 py-3">{o.amount ?? '—'}</td>
                  <td className="px-4 py-3">{o.company?.name ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-5">
          {OPPORTUNITY_STAGES.map((stage) => (
            <div key={stage} className="rounded-2xl bg-slate-100/80 p-3">
              <div className="mb-2 flex items-center justify-between text-sm font-medium">
                <span>{OPPORTUNITY_STAGE_LABELS[stage]}</span>
                <span className="text-xs text-slate-500">{byStage[stage].length}</span>
              </div>
              <div className="space-y-2">
                {byStage[stage].map((o) => (
                  <Link
                    key={o.id}
                    href={`/opportunities/${o.id}`}
                    className="block rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-sm hover:border-accent/40"
                  >
                    <div className="font-medium text-slate-900">{o.title}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      {o.company?.name ?? '未關聯公司'}
                      {o.amount ? ` · ${o.amount}` : ''}
                    </div>
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
