'use client';

import Image from 'next/image';
import { FormEvent, Suspense, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { PageHeader } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function AccountSecurityPage() {
  return (
    <Suspense fallback={<p className="text-sm text-slate-500">載入中…</p>}>
      <AccountSecurityForm />
    </Suspense>
  );
}

function AccountSecurityForm() {
  const qc = useQueryClient();
  const required = useSearchParams().get('required') === '1';
  const [qr, setQr] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [pending, setPending] = useState(false);
  const [currentCode, setCurrentCode] = useState('');

  const status = useQuery({
    queryKey: ['account-2fa'],
    queryFn: async () => {
      const res = await fetch('/api/account/2fa');
      if (!res.ok) throw new Error('failed');
      return res.json() as Promise<{ totpEnabled: boolean; require2fa: boolean }>;
    },
  });

  async function startEnroll(code?: string) {
    setPending(true);
    const res = await fetch('/api/account/2fa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(code ? { currentCode: code } : {}),
    });
    const body = await res.json().catch(() => ({}));
    setPending(false);
    if (!res.ok) {
      toast.error(body.error ?? '無法開始綁定');
      return;
    }
    setQr(body.qrDataUrl);
    setBackupCodes(null);
  }

  async function confirm(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const form = new FormData(e.currentTarget);
    const res = await fetch('/api/account/2fa', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: form.get('code'),
        currentCode: currentCode || undefined,
      }),
    });
    const body = await res.json().catch(() => ({}));
    setPending(false);
    if (!res.ok) {
      toast.error(body.error ?? '驗證碼不正確');
      return;
    }
    setQr(null);
    setBackupCodes(body.backupCodes);
    toast.success('已啟用兩步驟驗證');
    await qc.invalidateQueries({ queryKey: ['account-2fa'] });
  }

  async function disable(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const form = new FormData(e.currentTarget);
    const res = await fetch('/api/account/2fa', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: form.get('code') }),
    });
    const body = await res.json().catch(() => ({}));
    setPending(false);
    if (!res.ok) {
      toast.error(body.error ?? '無法關閉 2FA');
      return;
    }
    toast.success('已關閉兩步驟驗證');
    await qc.invalidateQueries({ queryKey: ['account-2fa'] });
  }

  const enabled = status.data?.totpEnabled ?? false;
  const mustKeep = status.data?.require2fa ?? false;

  return (
    <div className="space-y-6">
      <PageHeader title="帳號安全" description="兩步驟驗證（TOTP）與登入方式" />
      {required ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          你的租戶要求啟用 2FA，請先完成綁定才能繼續使用。
        </p>
      ) : null}
      <Card className="max-w-xl">
        <CardHeader>
          <h2 className="font-semibold">兩步驟驗證</h2>
        </CardHeader>
        <CardBody className="space-y-4">
          <p className="text-sm text-slate-600">
            使用 Authenticator App（如 Google Authenticator、1Password）產生 6
            位數代碼。登入時在密碼或信箱認證之後還要輸入此代碼。
          </p>
          <p className="text-sm">
            狀態：{enabled ? '已啟用' : '未啟用'}
            {mustKeep ? '（租戶強制）' : ''}
          </p>
          {!enabled && !qr ? (
            <Button type="button" onClick={() => void startEnroll()} disabled={pending}>
              開始綁定
            </Button>
          ) : null}
          {enabled && !qr ? (
            <form
              className="space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                const code = String(
                  new FormData(e.currentTarget).get('currentCode') ?? '',
                );
                setCurrentCode(code);
                void startEnroll(code);
              }}
            >
              <Label>輸入目前驗證碼以重新綁定</Label>
              <Input name="currentCode" required autoComplete="one-time-code" />
              <Button type="submit" variant="secondary" disabled={pending}>
                重新綁定驗證器
              </Button>
            </form>
          ) : null}
          {qr ? (
            <form onSubmit={confirm} className="space-y-3">
              <Image
                src={qr}
                alt="TOTP QR code"
                width={192}
                height={192}
                unoptimized
                className="h-48 w-48 rounded-lg border"
              />
              <div className="space-y-1.5">
                <Label>驗證器代碼</Label>
                <Input name="code" required autoComplete="one-time-code" />
              </div>
              <Button disabled={pending}>確認啟用</Button>
            </form>
          ) : null}
          {backupCodes ? (
            <div className="rounded-xl bg-slate-50 p-3 text-sm">
              <p className="font-medium">請立即抄下備用碼（只顯示一次）</p>
              <ul className="mt-2 grid grid-cols-2 gap-1 font-mono text-xs">
                {backupCodes.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {enabled && !mustKeep && !qr ? (
            <form onSubmit={disable} className="space-y-2">
              <Label>輸入驗證碼以關閉 2FA</Label>
              <Input name="code" required autoComplete="one-time-code" />
              <Button type="submit" variant="danger" disabled={pending}>
                關閉兩步驟驗證
              </Button>
            </form>
          ) : null}
        </CardBody>
      </Card>
    </div>
  );
}
