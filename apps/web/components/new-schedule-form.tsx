'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { SCHEDULE_TYPE_LABELS, SCHEDULE_TYPES } from '@crm/shared';
import { PageHeader } from '@/components/app-shell';
import { MemberSelect, emptyToNull } from '@/components/entity-selects';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

export function NewScheduleForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const form = new FormData(e.currentTarget);
    const res = await fetch('/api/schedules', {
      method: 'POST',
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
      setError(body.error ?? '無法建立');
      return;
    }
    if (body.warnings?.length) {
      toast.warning(body.warnings.map((w: { message: string }) => w.message).join('；'));
    }
    router.push(`/schedules/${body.schedule.id}`);
    router.refresh();
  }

  return (
    <div>
      <PageHeader title="新建排程" description="時間衝突會警告，仍可儲存" />
      <Card className="max-w-xl">
        <CardBody>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label>標題</Label>
              <Input name="title" required />
            </div>
            <div className="space-y-1.5">
              <Label>類型</Label>
              <Select name="type" defaultValue="booking">
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
                <Input name="startAt" type="datetime-local" required />
              </div>
              <div className="space-y-1.5">
                <Label>結束</Label>
                <Input name="endAt" type="datetime-local" required />
              </div>
            </div>
            <MemberSelect name="assigneeMembershipId" label="出勤人員" />
            <div className="space-y-1.5">
              <Label>備註</Label>
              <Textarea name="notes" />
            </div>
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            <div className="flex gap-2">
              <Button disabled={pending}>{pending ? '儲存中…' : '建立'}</Button>
              <Button type="button" variant="outline" onClick={() => router.back()}>
                取消
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
