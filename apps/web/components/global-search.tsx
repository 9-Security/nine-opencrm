'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

type Result = {
  companies: Array<{ id: string; name: string }>;
  contacts: Array<{ id: string; name: string; company: string | null }>;
  tickets: Array<{ id: string; title: string; status: string }>;
};

export function GlobalSearch() {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const query = useQuery({
    queryKey: ['search', q],
    enabled: q.trim().length >= 2,
    queryFn: async () => {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q.trim())}`);
      if (!res.ok) throw new Error('failed');
      return res.json() as Promise<Result>;
    },
  });

  useEffect(() => {
    if (q.trim().length < 2) setOpen(false);
    else setOpen(true);
  }, [q]);

  const data = query.data;
  const empty =
    data &&
    data.companies.length === 0 &&
    data.contacts.length === 0 &&
    data.tickets.length === 0;

  return (
    <div className="relative w-full max-w-md">
      <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => q.trim().length >= 2 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="搜尋公司、聯絡人、工單"
        className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm outline-none focus:border-accent focus:bg-white"
      />
      {open ? (
        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white py-2 shadow-card">
          {query.isFetching ? (
            <p className="px-3 py-2 text-sm text-slate-500">搜尋中…</p>
          ) : empty ? (
            <p className="px-3 py-2 text-sm text-slate-500">沒有符合的結果</p>
          ) : (
            <>
              {data?.companies.map((c) => (
                <Link
                  key={c.id}
                  href={`/companies/${c.id}`}
                  className="block px-3 py-1.5 text-sm hover:bg-slate-50"
                >
                  <span className="text-xs text-slate-400">公司</span> {c.name}
                </Link>
              ))}
              {data?.contacts.map((c) => (
                <Link
                  key={c.id}
                  href={`/contacts/${c.id}`}
                  className="block px-3 py-1.5 text-sm hover:bg-slate-50"
                >
                  <span className="text-xs text-slate-400">聯絡人</span> {c.name}
                </Link>
              ))}
              {data?.tickets.map((t) => (
                <Link
                  key={t.id}
                  href={`/tickets/${t.id}`}
                  className="block px-3 py-1.5 text-sm hover:bg-slate-50"
                >
                  <span className="text-xs text-slate-400">工單</span> {t.title}
                </Link>
              ))}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
