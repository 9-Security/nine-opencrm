'use client';

import Link from 'next/link';
import { FormEvent, use, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  SCHEDULE_STATUS_LABELS,
  SCHEDULE_TYPE_LABELS,
  SCHEDULE_TYPES,
  TICKET_STATUS_LABELS,
  allowedScheduleTransitions,
  type ScheduleStatus,
  type ScheduleType,
  type TicketStatus,
} from '@crm/shared';
import { PageHeader } from '@/components/app-shell';
import { MemberSelect, emptyToNull } from '@/components/entity-selects';
import { StatusBadge } from '@/components/status-badge';
import { TransitionButtons } from '@/components/transition-buttons';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

function toLocalInput(value: string) {
  const d = new Date(value);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

type Payload = {
  schedule: {
    id: string;
    title: string;
    type: ScheduleType;
    status: ScheduleStatus;
    startAt: string;
    endAt: string;
    notes: string | null;
    cancelReason: string | null;
    assigneeMembershipId: string | null;
    ticketLinks: Array<{
      ticket: { id: string; title: string; status: TicketStatus };
    }>;
  };
  canWrite: boolean;
};

export default function ScheduleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const qc = useQueryClient();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  const query = useQuery({
    queryKey: ['schedule', id],
    queryFn: async () => {
      const res = await fetch(`/api/schedules/${id}`);
      if (res.status === 404) throw new Error('not-found');
      if (!res.ok) throw new Error('failed');
      return res.json() as Promise<Payload>;
    },
  });

  if (query.isError) {
    return <p className="text-sm text-slate-600">找不到這個排程（或你沒有權限查看）。</p>;
  }
  if (!query.data) return <p className="text-sm text-slate-500">載入中…</p>;
  const { schedule: s, canWrite } = query.data;

  async function refresh() {
    await qc.invalidateQueries({ queryKey: ['schedule', id] });
    await qc.invalidateQueries({ queryKey: ['schedules'] });
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const form = new FormData(e.currentTarget);
    const res = await fetch(`/api/schedules/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: form.get('title'),
        type: form.get('type'),
        startAt: new Date(String(form.get('startAt'))).toISOString(),
        endAt: new Date(String(form.get('endAt'))).toISOString(),
        assigneeMembershipId: emptyToNull(form.get('assigneeMembershipId')),
        notes: emptyToNull(form.get('notes')),
      }),
    });
    const body = await res.json().catch(() => ({}));
    setPending(false);
    if (!res.ok) {
      setError(body.error ?? '儲存失敗');
      return;
    }
    if (body.warnings?.length) {
      toast.warning(body.warnings.map((w: { message: string }) => w.message).join('；'));
    }
    toast.success('已儲存');
    await refresh();
  }

  async function transition(to: string) {
    if (to === 'cancelled' && !cancelReason.trim()) {
      toast.error('取消需要填寫原因');
      return;
    }
    setPending(true);
    const res = await fetch(`/api/schedules/${id}/transition`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to,
        cancelReason: to === 'cancelled' ? cancelReason : null,
        notes: s.notes,
      }),
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

  return (
    <div className="space-y-6">
      <PageHeader title={s.title} description="排程詳情 · 與工單鬆耦合" />
      <Card>
        <CardBody className="space-y-3">
          <p className="text-sm font-medium">狀態</p>
          {canWrite ? (
            <>
              <TransitionButtons
                current={s.status}
                allowed={allowedScheduleTransitions(s.status)}
                labels={SCHEDULE_STATUS_LABELS}
                pending={pending}
                onPick={transition}
              />
              {allowedScheduleTransitions(s.status).includes('cancelled') ? (
                <div className="max-w-md space-y-1.5">
                  <Label>取消原因</Label>
                  <Input
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                  />
                </div>
              ) : null}
            </>
          ) : (
            <StatusBadge value={s.status} label={SCHEDULE_STATUS_LABELS[s.status]} />
          )}
          {s.cancelReason ? (
            <p className="text-sm text-slate-500">取消原因：{s.cancelReason}</p>
          ) : null}
        </CardBody>
      </Card>
      <Card className="max-w-xl">
        <CardBody>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label>標題</Label>
              <Input name="title" defaultValue={s.title} disabled={!canWrite} required />
            </div>
            <div className="space-y-1.5">
              <Label>類型</Label>
              <Select name="type" defaultValue={s.type} disabled={!canWrite}>
                {SCHEDULE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {SCHEDULE_TYPE_LABELS[t]}
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>開始</Label>
                <Input
                  name="startAt"
                  type="datetime-local"
                  defaultValue={toLocalInput(s.startAt)}
                  disabled={!canWrite}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>結束</Label>
                <Input
                  name="endAt"
                  type="datetime-local"
                  defaultValue={toLocalInput(s.endAt)}
                  disabled={!canWrite}
                  required
                />
              </div>
            </div>
            <MemberSelect
              name="assigneeMembershipId"
              label="出勤人員"
              defaultValue={s.assigneeMembershipId}
              disabled={!canWrite}
            />
            <div className="space-y-1.5">
              <Label>完成備註</Label>
              <Textarea name="notes" defaultValue={s.notes ?? ''} disabled={!canWrite} />
            </div>
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            {canWrite ? <Button disabled={pending}>儲存</Button> : null}
          </form>
        </CardBody>
      </Card>
      <Card>
        <CardHeader>
          <h2 className="font-semibold">關聯工單</h2>
        </CardHeader>
        <CardBody className="space-y-2 text-sm">
          {s.ticketLinks.length === 0 ? (
            <p className="text-slate-500">尚未關聯工單。請從工單詳情頁連結。</p>
          ) : (
            s.ticketLinks.map((link) => (
              <Link
                key={link.ticket.id}
                href={`/tickets/${link.ticket.id}`}
                className="flex justify-between"
              >
                <span>{link.ticket.title}</span>
                <StatusBadge
                  value={link.ticket.status}
                  label={TICKET_STATUS_LABELS[link.ticket.status]}
                />
              </Link>
            ))
          )}
        </CardBody>
      </Card>
    </div>
  );
}
