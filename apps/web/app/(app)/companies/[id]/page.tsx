'use client';

import Link from 'next/link';
import { FormEvent, use, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  OPPORTUNITY_STAGE_LABELS,
  PRIORITY_LABELS,
  type OpportunityStage,
  type Priority,
  type TicketStatus,
} from '@crm/shared';
import { PageHeader } from '@/components/app-shell';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export default function CompanyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const query = useQuery({
    queryKey: ['company', id],
    queryFn: async () => {
      const res = await fetch(`/api/companies/${id}`);
      if (res.status === 404) throw new Error('not-found');
      if (!res.ok) throw new Error('failed');
      return res.json() as Promise<{
        company: {
          id: string;
          name: string;
          website: string | null;
          phone: string | null;
          notes: string | null;
          tags: string[];
          contacts: Array<{
            id: string;
            firstName: string;
            lastName: string;
            email: string | null;
          }>;
          opportunities: Array<{
            id: string;
            title: string;
            stage: OpportunityStage;
            amount: string | null;
          }>;
          tickets: Array<{
            id: string;
            title: string;
            status: TicketStatus;
            priority: Priority;
          }>;
        };
        canWrite: boolean;
        canWriteContacts?: boolean;
        canWriteOpportunities?: boolean;
        canWriteTickets?: boolean;
      }>;
    },
  });

  if (query.isError) {
    return <p className="text-sm text-slate-600">找不到這間公司（或你沒有權限查看）。</p>;
  }
  if (!query.data) {
    return <p className="text-sm text-slate-500">載入中…</p>;
  }

  const { company, canWrite } = query.data;
  const canWriteContacts = query.data.canWriteContacts ?? canWrite;
  const canWriteOpportunities = query.data.canWriteOpportunities ?? canWrite;
  const canWriteTickets = query.data.canWriteTickets ?? canWrite;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canWrite) return;
    setPending(true);
    const form = new FormData(e.currentTarget);
    const res = await fetch(`/api/companies/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.get('name'),
        website: form.get('website'),
        phone: form.get('phone'),
        notes: form.get('notes'),
        tags: String(form.get('tags') ?? '')
          .split(/[,，]/)
          .map((t) => t.trim())
          .filter(Boolean),
      }),
    });
    const body = await res.json().catch(() => ({}));
    setPending(false);
    if (!res.ok) {
      setError(body.error ?? '儲存失敗');
      return;
    }
    await qc.invalidateQueries({ queryKey: ['company', id] });
    await qc.invalidateQueries({ queryKey: ['companies'] });
    await qc.invalidateQueries({ queryKey: ['tags'] });
    router.refresh();
  }

  async function onDelete() {
    setPending(true);
    const res = await fetch(`/api/companies/${id}`, { method: 'DELETE' });
    setPending(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? '無法刪除');
      return;
    }
    router.push('/companies');
    router.refresh();
  }

  return (
    <div>
      <PageHeader title={company.name} description="公司詳情、聯絡人、商機與工單" />
      <Card className="max-w-xl">
        <CardBody>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">公司名稱</Label>
              <Input
                id="name"
                name="name"
                defaultValue={company.name}
                disabled={!canWrite}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="website">網站</Label>
              <Input
                id="website"
                name="website"
                defaultValue={company.website ?? ''}
                disabled={!canWrite}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">電話</Label>
              <Input
                id="phone"
                name="phone"
                defaultValue={company.phone ?? ''}
                disabled={!canWrite}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tags">標籤</Label>
              <Input
                id="tags"
                name="tags"
                defaultValue={(company.tags ?? []).join(', ')}
                disabled={!canWrite}
                placeholder="VIP, 北區（逗號分隔）"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="notes">備註</Label>
              <Textarea
                id="notes"
                name="notes"
                defaultValue={company.notes ?? ''}
                disabled={!canWrite}
              />
            </div>
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            {canWrite ? (
              <div className="flex flex-wrap gap-2">
                <Button disabled={pending}>{pending ? '儲存中…' : '儲存'}</Button>
                {!confirming ? (
                  <Button
                    type="button"
                    variant="danger"
                    onClick={() => setConfirming(true)}
                  >
                    刪除公司
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="danger"
                    disabled={pending}
                    onClick={onDelete}
                  >
                    確認刪除（軟刪）
                  </Button>
                )}
              </div>
            ) : (
              <p className="text-sm text-slate-500">你的角色為唯讀，無法編輯或刪除。</p>
            )}
          </form>
        </CardBody>
      </Card>
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <h2 className="font-semibold">聯絡人</h2>
            {canWriteContacts ? (
              <Link
                href={`/contacts/new?companyId=${company.id}`}
                className="text-sm font-medium text-accent hover:underline"
              >
                新增
              </Link>
            ) : null}
          </CardHeader>
          <CardBody className="space-y-2 text-sm">
            {(company.contacts ?? []).length === 0 ? (
              <p className="text-slate-500">尚無聯絡人</p>
            ) : (
              company.contacts.map((c) => (
                <Link
                  key={c.id}
                  href={`/contacts/${c.id}`}
                  className="block hover:text-accent"
                >
                  {c.lastName}
                  {c.firstName}
                  {c.email ? ` · ${c.email}` : ''}
                </Link>
              ))
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <h2 className="font-semibold">商機</h2>
            {canWriteOpportunities ? (
              <Link
                href={`/opportunities/new?companyId=${company.id}`}
                className="text-sm font-medium text-accent hover:underline"
              >
                新增
              </Link>
            ) : null}
          </CardHeader>
          <CardBody className="space-y-2 text-sm">
            {(company.opportunities ?? []).length === 0 ? (
              <p className="text-slate-500">尚無商機</p>
            ) : (
              company.opportunities.map((o) => (
                <Link
                  key={o.id}
                  href={`/opportunities/${o.id}`}
                  className="flex justify-between"
                >
                  <span>{o.title}</span>
                  <StatusBadge
                    value={o.stage}
                    label={OPPORTUNITY_STAGE_LABELS[o.stage]}
                  />
                </Link>
              ))
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <h2 className="font-semibold">工單</h2>
            {canWriteTickets ? (
              <Link
                href={`/tickets/new?companyId=${company.id}`}
                className="text-sm font-medium text-accent hover:underline"
              >
                新增
              </Link>
            ) : null}
          </CardHeader>
          <CardBody className="space-y-2 text-sm">
            {(company.tickets ?? []).length === 0 ? (
              <p className="text-slate-500">尚無工單</p>
            ) : (
              company.tickets.map((t) => (
                <Link
                  key={t.id}
                  href={`/tickets/${t.id}`}
                  className="flex justify-between"
                >
                  <span>{t.title}</span>
                  <StatusBadge value={t.priority} label={PRIORITY_LABELS[t.priority]} />
                </Link>
              ))
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
