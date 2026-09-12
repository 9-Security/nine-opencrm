'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { PageHeader } from '@/components/app-shell';
import { CustomersTabs } from '@/components/customers-tabs';
import { EmptyState } from '@/components/empty-state';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';

type CompanyRow = {
  id: string;
  name: string;
  website: string | null;
  phone: string | null;
  tags: string[];
  owner: { user: { name: string | null; email: string } } | null;
  updatedAt: string;
};

const col = createColumnHelper<CompanyRow>();

const columns = [
  col.accessor('name', {
    header: '公司',
    cell: (info) => (
      <Link
        href={`/companies/${info.row.original.id}`}
        className="font-medium text-slate-900 hover:text-accent"
      >
        {info.getValue()}
      </Link>
    ),
  }),
  col.accessor('tags', {
    header: '標籤',
    cell: (info) => {
      const tags = info.getValue() ?? [];
      if (tags.length === 0) return '—';
      return (
        <span className="flex flex-wrap gap-1">
          {tags.map((tag) => (
            <Badge key={tag}>{tag}</Badge>
          ))}
        </span>
      );
    },
  }),
  col.accessor('website', {
    header: '網站',
    cell: (info) => info.getValue() || '—',
  }),
  col.accessor('phone', {
    header: '電話',
    cell: (info) => info.getValue() || '—',
  }),
  col.accessor('owner', {
    header: '負責人',
    cell: (info) => {
      const owner = info.getValue();
      return owner?.user.name || owner?.user.email || '—';
    },
  }),
];

export function CompanyList({ canWrite }: { canWrite: boolean }) {
  const [q, setQ] = useState('');
  const [tag, setTag] = useState('');
  const params = useMemo(() => {
    const sp = new URLSearchParams();
    if (q.trim()) sp.set('q', q.trim());
    if (tag) sp.set('tag', tag);
    const qs = sp.toString();
    return qs ? `?${qs}` : '';
  }, [q, tag]);

  const query = useQuery({
    queryKey: ['companies', params],
    queryFn: async () => {
      const res = await fetch(`/api/companies${params}`);
      if (!res.ok) throw new Error('failed');
      return (await res.json()) as { companies: CompanyRow[] };
    },
  });
  const tagsQuery = useQuery({
    queryKey: ['tags'],
    queryFn: async () => {
      const res = await fetch('/api/tags');
      if (!res.ok) throw new Error('failed');
      return (await res.json()) as { tags: Array<{ id: string; name: string }> };
    },
  });

  const data = query.data?.companies ?? [];
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div>
      <PageHeader
        title="客戶"
        description="公司與聯絡人"
        actions={
          canWrite ? (
            <Link href="/companies/new">
              <Button>新建公司</Button>
            </Link>
          ) : (
            <Badge>唯讀</Badge>
          )
        }
      />
      <CustomersTabs active="companies" />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input
          className="max-w-xs"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜尋公司名稱"
        />
        {(tagsQuery.data?.tags ?? []).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTag((cur) => (cur === t.name ? '' : t.name))}
            className={
              tag === t.name
                ? 'rounded-full bg-accent px-3 py-1 text-xs font-medium text-white'
                : 'rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600 hover:bg-slate-200'
            }
          >
            {t.name}
          </button>
        ))}
      </div>
      {query.isLoading ? (
        <p className="text-sm text-slate-500">載入中…</p>
      ) : data.length === 0 ? (
        <EmptyState
          title="尚無公司"
          description="建立第一間公司，作為商機與工單的關聯對象。"
          actionHref={canWrite ? '/companies/new' : undefined}
          actionLabel={canWrite ? '新建公司' : undefined}
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id}>
                  {hg.headers.map((h) => (
                    <th key={h.id} className="px-4 py-3 font-medium">
                      {flexRender(h.column.columnDef.header, h.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-t border-slate-100 hover:bg-slate-50/80"
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-3 text-slate-700">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
