'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/app-shell';
import {
  CompanySelect,
  ContactSelect,
  MemberSelect,
  emptyToNull,
} from '@/components/entity-selects';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function NewOpportunityForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const form = new FormData(e.currentTarget);
    const res = await fetch('/api/opportunities', {
      method: 'POST',
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
      setError(body.error ?? '無法建立');
      return;
    }
    router.push(`/opportunities/${body.opportunity.id}`);
    router.refresh();
  }

  return (
    <div>
      <PageHeader title="新建商機" />
      <Card className="max-w-xl">
        <CardBody>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="title">標題</Label>
              <Input id="title" name="title" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="amount">金額</Label>
              <Input id="amount" name="amount" type="number" step="0.01" />
            </div>
            <CompanySelect name="companyId" />
            <ContactSelect name="contactId" />
            <MemberSelect name="ownerMembershipId" />
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
