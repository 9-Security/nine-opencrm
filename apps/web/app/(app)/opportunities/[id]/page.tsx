'use client';

import Link from 'next/link';
import { FormEvent, use, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ACTIVITY_STATUS_LABELS,
  OPPORTUNITY_STAGE_LABELS,
  TICKET_STATUS_LABELS,
  allowedOpportunityTransitions,
  type ActivityStatus,
  type OpportunityStage,
  type TicketStatus,
} from '@crm/shared';
import { PageHeader } from '@/components/app-shell';
import {
  CompanySelect,
  ContactSelect,
  MemberSelect,
  emptyToNull,
} from '@/components/entity-selects';
import { StatusBadge } from '@/components/status-badge';
import { TransitionButtons } from '@/components/transition-buttons';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Payload = {
  opportunity: {
    id: string;
    title: string;
    amount: string | null;
    stage: OpportunityStage;
    companyId: string | null;
    contactId: string | null;
    ownerMembershipId: string | null;
    activities: Array<{
      id: string;
      title: string;
      status: ActivityStatus;
      dueAt: string | null;
      createdAt: string;
    }>;
    tickets: Array<{
      id: string;
      title: string;
      status: TicketStatus;
    }>;
  };
  statusEvents: Array<{
    id: string;
    fromStatus: string | null;
    toStatus: string;
    createdAt: string;
    actor: { user: { name: string | null; email: string } } | null;
  }>;
  canWrite: boolean;
};

export default function OpportunityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const qc = useQueryClient();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['opportunity', id],
    queryFn: async () => {
      const res = await fetch(`/api/opportunities/${id}`);
      if (res.status === 404) throw new Error('not-found');
      if (!res.ok) throw new Error('failed');
      return res.json() as Promise<Payload>;
    },
  });

  if (query.isError) {
    return <p className="text-sm text-slate-600">找不到這個商機（或你沒有權限查看）。</p>;
  }
  if (!query.data) return <p className="text-sm text-slate-500">載入中…</p>;
  const { opportunity: o, statusEvents, canWrite } = query.data;

  async function refresh() {
    await qc.invalidateQueries({ queryKey: ['opportunity', id] });
    await qc.invalidateQueries({ queryKey: ['opportunities'] });
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const form = new FormData(e.currentTarget);
    const res = await fetch(`/api/opportunities/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: form.get('title'),
        amount: emptyToNull(form.get('amount')),
        companyId: emptyToNull(form.get('companyId')),
        contactId: emptyToNull(form.get('contactId')),
        ownerMembershipId: emptyToNull(form.get('ownerMembershipId')),
      }),
    });
    const body = await res.json().catch(() => ({}));
    setPending(false);
    if (!res.ok) {
      setError(body.error ?? '儲存失敗');
      return;
    }
    toast.success('已儲存');
    await refresh();
  }

  async function transition(to: string) {
    setPending(true);
    const res = await fetch(`/api/opportunities/${id}/transition`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to }),
    });
    const body = await res.json().catch(() => ({}));
    setPending(false);
    if (!res.ok) {
      toast.error(body.error ?? '無法轉換階段');
      return;
    }
    toast.success('階段已更新');
    await refresh();
  }

  async function addActivity(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const res = await fetch(`/api/opportunities/${id}/activities`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: form.get('title'),
        dueAt: emptyToNull(form.get('dueAt')),
      }),
    });
    if (!res.ok) {
      toast.error('無法新增活動');
      return;
    }
    (e.target as HTMLFormElement).reset();
    await refresh();
  }

  async function toggleActivity(activityId: string, to: ActivityStatus) {
    const res = await fetch(`/api/activities/${activityId}/transition`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to }),
    });
    if (!res.ok) toast.error('無法更新活動');
    await refresh();
  }

  return (
    <div className="space-y-6">
      <PageHeader title={o.title} description="商機詳情與階段操作" />
      <Card>
        <CardBody className="space-y-3">
          <p className="text-sm font-medium text-slate-700">階段</p>
          {canWrite ? (
            <TransitionButtons
              current={o.stage}
              allowed={allowedOpportunityTransitions(o.stage)}
              labels={OPPORTUNITY_STAGE_LABELS}
              pending={pending}
              onPick={transition}
            />
          ) : (
            <StatusBadge value={o.stage} label={OPPORTUNITY_STAGE_LABELS[o.stage]} />
          )}
        </CardBody>
      </Card>
      <Card className="max-w-xl">
        <CardBody>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label>標題</Label>
              <Input name="title" defaultValue={o.title} disabled={!canWrite} required />
            </div>
            <div className="space-y-1.5">
              <Label>金額</Label>
              <Input
                name="amount"
                type="number"
                step="0.01"
                defaultValue={o.amount ?? ''}
                disabled={!canWrite}
              />
            </div>
            <CompanySelect
              name="companyId"
              defaultValue={o.companyId}
              disabled={!canWrite}
            />
            <ContactSelect
              name="contactId"
              defaultValue={o.contactId}
              disabled={!canWrite}
            />
            <MemberSelect
              name="ownerMembershipId"
              defaultValue={o.ownerMembershipId}
              disabled={!canWrite}
            />
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            {canWrite ? <Button disabled={pending}>儲存</Button> : null}
          </form>
        </CardBody>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <h2 className="font-semibold">活動時間線</h2>
          </CardHeader>
          <CardBody className="space-y-4">
            {canWrite ? (
              <form onSubmit={addActivity} className="flex flex-wrap items-end gap-2">
                <div className="space-y-1.5">
                  <Label>待辦</Label>
                  <Input name="title" required placeholder="跟進電話…" />
                </div>
                <div className="space-y-1.5">
                  <Label>到期</Label>
                  <Input name="dueAt" type="datetime-local" />
                </div>
                <Button type="submit" size="sm">
                  新增
                </Button>
              </form>
            ) : null}
            <ul className="space-y-2 text-sm">
              {o.activities.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2"
                >
                  <div>
                    <div className="font-medium">{a.title}</div>
                    <div className="text-xs text-slate-500">
                      {a.dueAt ? new Date(a.dueAt).toLocaleString() : '無到期日'}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={!canWrite}
                    onClick={() =>
                      toggleActivity(a.id, a.status === 'todo' ? 'done' : 'todo')
                    }
                  >
                    <StatusBadge
                      value={a.status}
                      label={ACTIVITY_STATUS_LABELS[a.status]}
                    />
                  </button>
                </li>
              ))}
              {statusEvents.map((ev) => (
                <li key={ev.id} className="text-xs text-slate-500">
                  {new Date(ev.createdAt).toLocaleString()} ·{' '}
                  {ev.actor?.user.name || ev.actor?.user.email || '系統'}：
                  {ev.fromStatus
                    ? `${OPPORTUNITY_STAGE_LABELS[ev.fromStatus as OpportunityStage] ?? ev.fromStatus} → `
                    : ''}
                  {OPPORTUNITY_STAGE_LABELS[ev.toStatus as OpportunityStage] ??
                    ev.toStatus}
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
        <Card>
          <CardHeader>
            <h2 className="font-semibold">相關工單</h2>
          </CardHeader>
          <CardBody className="space-y-2 text-sm">
            {o.tickets.length === 0 ? (
              <p className="text-slate-500">尚無工單</p>
            ) : (
              o.tickets.map((t) => (
                <Link
                  key={t.id}
                  href={`/tickets/${t.id}`}
                  className="flex justify-between"
                >
                  <span>{t.title}</span>
                  <StatusBadge value={t.status} label={TICKET_STATUS_LABELS[t.status]} />
                </Link>
              ))
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
