'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/app-shell';
import { CustomersTabs } from '@/components/customers-tabs';
import { EmptyState } from '@/components/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Row = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  company: { name: string } | null;
};

export function ContactList({ canWrite }: { canWrite: boolean }) {
  const [q, setQ] = useState('');
  const query = useQuery({
    queryKey: ['contacts', q],
    queryFn: async () => {
      const sp = q.trim() ? `?q=${encodeURIComponent(q.trim())}` : '';
      const res = await fetch(`/api/contacts${sp}`);
      if (!res.ok) throw new Error('failed');
      return res.json() as Promise<{ contacts: Row[] }>;
    },
  });
  const data = query.data?.contacts ?? [];

  return (
    <div>
      <PageHeader
        title="客戶"
        description="公司與聯絡人"
        actions={
          canWrite ? (
            <Link href="/contacts/new">
              <Button>新建聯絡人</Button>
            </Link>
          ) : (
            <Badge>唯讀</Badge>
          )
        }
      />
      <CustomersTabs active="contacts" />
      <div className="mb-4">
        <Input
          className="max-w-xs"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜尋姓名或 Email"
        />
      </div>
      {query.isLoading ? (
        <p className="text-sm text-slate-500">載入中…</p>
      ) : data.length === 0 ? (
        <EmptyState
          title="尚無聯絡人"
          description="建立聯絡人並關聯到公司。"
          actionHref={canWrite ? '/contacts/new' : undefined}
          actionLabel={canWrite ? '新建聯絡人' : undefined}
        />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-card">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">姓名</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">電話</th>
                <th className="px-4 py-3 font-medium">公司</th>
              </tr>
            </thead>
            <tbody>
              {data.map((c) => (
                <tr key={c.id} className="border-t border-slate-100 hover:bg-slate-50/80">
                  <td className="px-4 py-3">
                    <Link
                      href={`/contacts/${c.id}`}
                      className="font-medium text-slate-900 hover:text-accent"
                    >
                      {c.lastName}
                      {c.firstName}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{c.email || '—'}</td>
                  <td className="px-4 py-3 text-slate-700">{c.phone || '—'}</td>
                  <td className="px-4 py-3 text-slate-700">{c.company?.name || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
