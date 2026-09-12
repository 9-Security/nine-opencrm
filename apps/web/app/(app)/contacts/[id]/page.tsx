'use client';

import Link from 'next/link';
import { FormEvent, use, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/app-shell';
import { CompanySelect, MemberSelect, emptyToNull } from '@/components/entity-selects';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  OPPORTUNITY_STAGE_LABELS,
  PRIORITY_LABELS,
  TICKET_STATUS_LABELS,
  type OpportunityStage,
  type Priority,
  type TicketStatus,
} from '@crm/shared';

type ContactPayload = {
  contact: {
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
    companyId: string | null;
    ownerMembershipId: string | null;
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
};

export default function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const query = useQuery({
    queryKey: ['contact', id],
    queryFn: async () => {
      const res = await fetch(`/api/contacts/${id}`);
      if (res.status === 404) throw new Error('not-found');
      if (!res.ok) throw new Error('failed');
      return res.json() as Promise<ContactPayload>;
    },
  });

  if (query.isError) {
    return (
      <p className="text-sm text-slate-600">找不到這位聯絡人（或你沒有權限查看）。</p>
    );
  }
  if (!query.data) return <p className="text-sm text-slate-500">載入中…</p>;

  const { contact, canWrite } = query.data;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canWrite) return;
    setPending(true);
    const form = new FormData(e.currentTarget);
    const res = await fetch(`/api/contacts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lastName: form.get('lastName'),
        firstName: form.get('firstName'),
        email: emptyToNull(form.get('email')),
        phone: emptyToNull(form.get('phone')),
        companyId: emptyToNull(form.get('companyId')),
        ownerMembershipId: emptyToNull(form.get('ownerMembershipId')),
      }),
    });
    const body = await res.json().catch(() => ({}));
    setPending(false);
    if (!res.ok) {
      setError(body.error ?? '儲存失敗');
      return;
    }
    await qc.invalidateQueries({ queryKey: ['contact', id] });
    await qc.invalidateQueries({ queryKey: ['contacts'] });
  }

  async function onDelete() {
    setPending(true);
    const res = await fetch(`/api/contacts/${id}`, { method: 'DELETE' });
    setPending(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? '無法刪除');
      return;
    }
    window.location.href = '/contacts';
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${contact.lastName}${contact.firstName}`}
        description="聯絡人詳情"
      />
      <Card className="max-w-xl">
        <CardBody>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="lastName">姓</Label>
                <Input
                  id="lastName"
                  name="lastName"
                  defaultValue={contact.lastName}
                  disabled={!canWrite}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="firstName">名</Label>
                <Input
                  id="firstName"
                  name="firstName"
                  defaultValue={contact.firstName}
                  disabled={!canWrite}
                  required
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                defaultValue={contact.email ?? ''}
                disabled={!canWrite}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">電話</Label>
              <Input
                id="phone"
                name="phone"
                defaultValue={contact.phone ?? ''}
                disabled={!canWrite}
              />
            </div>
            <CompanySelect
              name="companyId"
              defaultValue={contact.companyId}
              disabled={!canWrite}
            />
            <MemberSelect
              name="ownerMembershipId"
              defaultValue={contact.ownerMembershipId}
              disabled={!canWrite}
            />
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
                    刪除聯絡人
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="danger"
                    disabled={pending}
                    onClick={onDelete}
                  >
                    確認刪除
                  </Button>
                )}
              </div>
            ) : (
              <p className="text-sm text-slate-500">你的角色為唯讀，無法編輯或刪除。</p>
            )}
          </form>
        </CardBody>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <h2 className="font-semibold">相關商機</h2>
          </CardHeader>
          <CardBody className="space-y-2 text-sm">
            {contact.opportunities.length === 0 ? (
              <p className="text-slate-500">尚無商機</p>
            ) : (
              contact.opportunities.map((o) => (
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
          <CardHeader>
            <h2 className="font-semibold">相關工單</h2>
          </CardHeader>
          <CardBody className="space-y-2 text-sm">
            {contact.tickets.length === 0 ? (
              <p className="text-slate-500">尚無工單</p>
            ) : (
              contact.tickets.map((t) => (
                <Link
                  key={t.id}
                  href={`/tickets/${t.id}`}
                  className="flex justify-between"
                >
                  <span>{t.title}</span>
                  <span className="flex gap-1">
                    <StatusBadge
                      value={t.status}
                      label={TICKET_STATUS_LABELS[t.status]}
                    />
                    <StatusBadge value={t.priority} label={PRIORITY_LABELS[t.priority]} />
                  </span>
                </Link>
              ))
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
