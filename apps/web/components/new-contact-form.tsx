'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/app-shell';
import { CompanySelect, MemberSelect, emptyToNull } from '@/components/entity-selects';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { usePrefillParam } from '@/lib/use-prefill';

export function NewContactForm() {
  const router = useRouter();
  const companyId = usePrefillParam('companyId');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const form = new FormData(e.currentTarget);
    const res = await fetch('/api/contacts', {
      method: 'POST',
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
      setError(body.error ?? '無法建立');
      return;
    }
    router.push(`/contacts/${body.contact.id}`);
    router.refresh();
  }

  return (
    <div>
      <PageHeader title="新建聯絡人" description="僅管理員與業務可寫入" />
      <Card className="max-w-xl">
        <CardBody>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="lastName">姓</Label>
                <Input id="lastName" name="lastName" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="firstName">名</Label>
                <Input id="firstName" name="firstName" required />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">電話</Label>
              <Input id="phone" name="phone" />
            </div>
            <CompanySelect name="companyId" defaultValue={companyId} />
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
