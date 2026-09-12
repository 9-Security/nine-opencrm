'use client';

import Link from 'next/link';
import { FormEvent, use, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  PRIORITIES,
  PRIORITY_LABELS,
  SCHEDULE_STATUS_LABELS,
  SCHEDULE_TYPE_LABELS,
  TICKET_STATUS_LABELS,
  allowedTicketTransitions,
  type Priority,
  type ScheduleStatus,
  type ScheduleType,
  type TicketStatus,
} from '@crm/shared';
import { PageHeader } from '@/components/app-shell';
import {
  CompanySelect,
  ContactSelect,
  MemberSelect,
  OpportunitySelect,
  emptyToNull,
} from '@/components/entity-selects';
import { StatusBadge } from '@/components/status-badge';
import { TransitionButtons } from '@/components/transition-buttons';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

type TicketPayload = {
  ticket: {
    id: string;
    title: string;
    description: string | null;
    status: TicketStatus;
    priority: Priority;
    companyId: string | null;
    contactId: string | null;
    opportunityId: string | null;
    assigneeMembershipId: string | null;
    comments: Array<{
      id: string;
      body: string;
      isInternal: boolean;
      createdAt: string;
      author: { user: { name: string | null; email: string } };
    }>;
    scheduleLinks: Array<{
      id: string;
      scheduleId: string;
      schedule: {
        id: string;
        title: string;
        status: ScheduleStatus;
        type: ScheduleType;
        startAt: string;
        endAt: string;
      };
    }>;
  };
  canWrite: boolean;
  canSeeInternal: boolean;
};

export default function TicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const qc = useQueryClient();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [internal, setInternal] = useState(false);
  const [scheduleQ, setScheduleQ] = useState('');

  const query = useQuery({
    queryKey: ['ticket', id],
    queryFn: async () => {
      const res = await fetch(`/api/tickets/${id}`);
      if (res.status === 404) throw new Error('not-found');
      if (!res.ok) throw new Error('failed');
      return res.json() as Promise<TicketPayload>;
    },
  });
  const schedules = useQuery({
    queryKey: ['schedules-picker', scheduleQ],
    enabled: scheduleQ.trim().length >= 2,
    queryFn: async () => {
      const res = await fetch(
        `/api/schedules?q=${encodeURIComponent(scheduleQ.trim())}&limit=8`,
      );
      if (!res.ok) throw new Error('failed');
      return res.json() as Promise<{
        schedules: Array<{ id: string; title: string; startAt: string }>;
      }>;
    },
  });
  const linkedIds = useMemo(
    () => new Set(query.data?.ticket.scheduleLinks.map((l) => l.scheduleId) ?? []),
    [query.data?.ticket.scheduleLinks],
  );

  if (query.isError) {
    return <p className="text-sm text-slate-600">找不到這個工單（或你沒有權限查看）。</p>;
  }
  if (!query.data) return <p className="text-sm text-slate-500">載入中…</p>;
  const { ticket: t, canWrite, canSeeInternal } = query.data;

  async function refresh() {
    await qc.invalidateQueries({ queryKey: ['ticket', id] });
    await qc.invalidateQueries({ queryKey: ['tickets'] });
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const form = new FormData(e.currentTarget);
    const res = await fetch(`/api/tickets/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: form.get('title'),
        description: emptyToNull(form.get('description')),
        priority: form.get('priority'),
        companyId: emptyToNull(form.get('companyId')),
        contactId: emptyToNull(form.get('contactId')),
        opportunityId: emptyToNull(form.get('opportunityId')),
        assigneeMembershipId: emptyToNull(form.get('assigneeMembershipId')),
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
    const res = await fetch(`/api/tickets/${id}/transition`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to }),
    });
    const body = await res.json().catch(() => ({}));
    setPending(false);
    if (!res.ok) {
      toast.error(body.error ?? '無法轉換狀態');
      return;
    }
    toast.success('狀態已更新');
    await refresh();
  }

  async function addComment(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const res = await fetch(`/api/tickets/${id}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: form.get('body'), isInternal: internal }),
    });
    if (!res.ok) {
      toast.error('無法留言');
      return;
    }
    (e.target as HTMLFormElement).reset();
    setInternal(false);
    await refresh();
  }

  async function linkExisting(scheduleId: string) {
    const res = await fetch(`/api/tickets/${id}/schedules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scheduleId }),
    });
    if (!res.ok) {
      toast.error('無法關聯排程');
      return;
    }
    toast.success('已關聯排程（工單完成不會自動完成排程）');
    await refresh();
  }

  async function createAndLink(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const res = await fetch(`/api/tickets/${id}/schedules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        create: {
          title: form.get('title'),
          startAt: form.get('startAt'),
          endAt: form.get('endAt'),
          type: form.get('type'),
        },
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(body.error ?? '無法建立排程');
      return;
    }
    if (body.warnings?.length) {
      toast.warning(body.warnings.map((w: { message: string }) => w.message).join('；'));
    }
    toast.success('已建立並關聯排程');
    (e.target as HTMLFormElement).reset();
    await refresh();
  }

  async function unlink(scheduleId: string) {
    const res = await fetch(
      `/api/tickets/${id}/schedules?scheduleId=${encodeURIComponent(scheduleId)}`,
      { method: 'DELETE' },
    );
    if (!res.ok) {
      toast.error('無法解除關聯');
      return;
    }
    toast.success('已解除關聯（排程與工單皆保留）');
    await refresh();
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t.title} description="工單詳情 · 與排程鬆耦合" />
      <Card>
        <CardBody className="space-y-3">
          <p className="text-sm font-medium">狀態</p>
          {canWrite ? (
            <TransitionButtons
              current={t.status}
              allowed={allowedTicketTransitions(t.status)}
              labels={TICKET_STATUS_LABELS}
              pending={pending}
              onPick={transition}
            />
          ) : (
            <StatusBadge value={t.status} label={TICKET_STATUS_LABELS[t.status]} />
          )}
        </CardBody>
      </Card>
      <Card className="max-w-xl">
        <CardBody>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label>標題</Label>
              <Input name="title" defaultValue={t.title} disabled={!canWrite} required />
            </div>
            <div className="space-y-1.5">
              <Label>描述</Label>
              <Textarea
                name="description"
                defaultValue={t.description ?? ''}
                disabled={!canWrite}
              />
            </div>
            <div className="space-y-1.5">
              <Label>優先級</Label>
              <Select name="priority" defaultValue={t.priority} disabled={!canWrite}>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABELS[p]}
                  </option>
                ))}
              </Select>
            </div>
            <CompanySelect
              name="companyId"
              defaultValue={t.companyId}
              disabled={!canWrite}
            />
            <ContactSelect
              name="contactId"
              defaultValue={t.contactId}
              disabled={!canWrite}
            />
            <OpportunitySelect
              name="opportunityId"
              defaultValue={t.opportunityId}
              disabled={!canWrite}
            />
            <MemberSelect
              name="assigneeMembershipId"
              label="指派給"
              defaultValue={t.assigneeMembershipId}
              disabled={!canWrite}
            />
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            {canWrite ? <Button disabled={pending}>儲存</Button> : null}
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="font-semibold">留言</h2>
        </CardHeader>
        <CardBody className="space-y-4">
          <ul className="space-y-3">
            {t.comments.map((c) => (
              <li
                key={c.id}
                className={
                  c.isInternal
                    ? 'rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm'
                    : 'rounded-xl border border-slate-100 px-3 py-2 text-sm'
                }
              >
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>{c.author.user.name || c.author.user.email}</span>
                  <span>{new Date(c.createdAt).toLocaleString()}</span>
                </div>
                {c.isInternal ? (
                  <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                    僅內部
                  </p>
                ) : null}
                <p className="mt-1 whitespace-pre-wrap">{c.body}</p>
              </li>
            ))}
          </ul>
          {canWrite ? (
            <form onSubmit={addComment} className="space-y-2">
              <Textarea name="body" required placeholder="寫下留言…" />
              {canSeeInternal ? (
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={internal}
                    onChange={(e) => setInternal(e.target.checked)}
                  />
                  內部備註（業務角色看不到切換）
                </label>
              ) : null}
              <Button type="submit" size="sm">
                送出留言
              </Button>
            </form>
          ) : null}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="font-semibold">關聯排程</h2>
          <p className="text-xs text-slate-500">完成工單不會自動完成排程，反之亦然。</p>
        </CardHeader>
        <CardBody className="space-y-4">
          <ul className="space-y-2 text-sm">
            {t.scheduleLinks.length === 0 ? (
              <li className="text-slate-500">尚未關聯排程</li>
            ) : (
              t.scheduleLinks.map((link) => (
                <li
                  key={link.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2"
                >
                  <Link
                    href={`/schedules/${link.schedule.id}`}
                    className="hover:text-accent"
                  >
                    {link.schedule.title}
                  </Link>
                  <span className="flex items-center gap-2">
                    <StatusBadge
                      value={link.schedule.type}
                      label={SCHEDULE_TYPE_LABELS[link.schedule.type]}
                    />
                    <StatusBadge
                      value={link.schedule.status}
                      label={SCHEDULE_STATUS_LABELS[link.schedule.status]}
                    />
                    {canWrite ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => unlink(link.schedule.id)}
                      >
                        解除連結
                      </Button>
                    ) : null}
                  </span>
                </li>
              ))
            )}
          </ul>
          {canWrite ? (
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label>搜尋既有排程</Label>
                <Input
                  className="mt-1.5"
                  value={scheduleQ}
                  onChange={(e) => setScheduleQ(e.target.value)}
                  placeholder="標題關鍵字"
                />
                <ul className="mt-2 space-y-1 text-sm">
                  {(schedules.data?.schedules ?? [])
                    .filter((s) => !linkedIds.has(s.id))
                    .slice(0, 6)
                    .map((s) => (
                      <li key={s.id} className="flex items-center justify-between">
                        <span>{s.title}</span>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => linkExisting(s.id)}
                        >
                          連結
                        </Button>
                      </li>
                    ))}
                </ul>
              </div>
              <form onSubmit={createAndLink} className="space-y-2">
                <Label>新建排程並連結</Label>
                <Input name="title" required placeholder="排程標題" />
                <Select name="type" defaultValue="booking">
                  <option value="booking">預約</option>
                  <option value="field_work">出勤</option>
                </Select>
                <Input name="startAt" type="datetime-local" required />
                <Input name="endAt" type="datetime-local" required />
                <Button type="submit" size="sm">
                  建立並連結
                </Button>
              </form>
            </div>
          ) : null}
        </CardBody>
      </Card>
    </div>
  );
}
