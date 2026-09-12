'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PRIORITIES, PRIORITY_LABELS } from '@crm/shared';
import { PageHeader } from '@/components/app-shell';
import {
  CompanySelect,
  ContactSelect,
  MemberSelect,
  OpportunitySelect,
  emptyToNull,
} from '@/components/entity-selects';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

export function NewTicketForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const form = new FormData(e.currentTarget);
    const res = await fetch('/api/tickets', {
      method: 'POST',
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
      setError(body.error ?? '無法建立');
      return;
    }
    router.push(`/tickets/${body.ticket.id}`);
    router.refresh();
  }

  return (
    <div>
      <PageHeader title="新建工單" />
      <Card className="max-w-xl">
        <CardBody>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label>標題</Label>
              <Input name="title" required />
            </div>
            <div className="space-y-1.5">
              <Label>描述</Label>
              <Textarea name="description" />
            </div>
            <div className="space-y-1.5">
              <Label>優先級</Label>
              <Select name="priority" defaultValue="medium">
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABELS[p]}
                  </option>
                ))}
              </Select>
            </div>
            <CompanySelect name="companyId" />
            <ContactSelect name="contactId" />
            <OpportunitySelect name="opportunityId" />
            <MemberSelect name="assigneeMembershipId" label="指派給" />
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
