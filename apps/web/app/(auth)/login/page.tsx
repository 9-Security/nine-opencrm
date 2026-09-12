'use client';

import { FormEvent, useState } from 'react';
import { signIn } from 'next-auth/react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [step, setStep] = useState<'password' | 'totp'>('password');
  const [factorHint, setFactorHint] = useState<string | null>(null);

  async function completeSignIn() {
    const res = await signIn('credentials', {
      challenge: 'cookie',
      redirect: false,
    });
    if (!res || res.error) {
      setError('無法完成登入，請重試');
      return false;
    }
    router.push(params.get('from') || '/');
    router.refresh();
    return true;
  }

  async function onPassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const res = await fetch('/api/auth/first-factor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: String(form.get('email') ?? ''),
        password: String(form.get('password') ?? ''),
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setPending(false);
      setError(body.error ?? 'Email 或密碼不正確');
      return;
    }
    if (body.mailboxAuth) setFactorHint('已通過公司信箱認證');
    if (body.requires2fa) {
      setPending(false);
      setStep('totp');
      return;
    }
    const ok = await completeSignIn();
    if (!ok) setPending(false);
  }

  async function onTotp(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const res = await fetch('/api/auth/2fa/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: String(form.get('code') ?? '') }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setPending(false);
      setError(body.error ?? '驗證碼不正確');
      return;
    }
    const ok = await completeSignIn();
    if (!ok) setPending(false);
  }

  return (
    <AuthCard
      title={step === 'totp' ? '兩步驟驗證' : '登入 Nine CRM'}
      subtitle={
        step === 'totp'
          ? '輸入驗證器 App 的 6 位數代碼，或備用碼'
          : '使用 Email 與密碼登入。若管理員有開通信箱認證，也可用信箱密碼。'
      }
    >
      {step === 'password' ? (
        <form onSubmit={onPassword} className="space-y-4">
          <Field label="Email" name="email" type="email" autoComplete="email" required />
          <Field
            label="密碼"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <Button className="w-full" disabled={pending}>
            {pending ? '驗證中…' : '繼續'}
          </Button>
        </form>
      ) : (
        <form onSubmit={onTotp} className="space-y-4">
          {factorHint ? <p className="text-sm text-slate-600">{factorHint}</p> : null}
          <Field
            label="驗證碼"
            name="code"
            type="text"
            autoComplete="one-time-code"
            required
          />
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <Button className="w-full" disabled={pending}>
            {pending ? '登入中…' : '登入'}
          </Button>
          <button
            type="button"
            className="w-full text-sm text-slate-500 hover:text-slate-700"
            onClick={async () => {
              await fetch('/api/auth/first-factor', { method: 'DELETE' });
              setStep('password');
              setError(null);
              setFactorHint(null);
            }}
          >
            改用其他帳號
          </button>
        </form>
      )}
      <p className="mt-4 text-center text-sm text-slate-500">
        還沒有帳號？{' '}
        <Link href="/register" className="font-medium text-accent hover:underline">
          註冊並建立租戶
        </Link>
      </p>
    </AuthCard>
  );
}

function AuthCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-950 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-card">
        <div className="mb-6">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
            Nine CRM
          </div>
          <h1 className="mt-2 text-xl font-semibold text-slate-900">{title}</h1>
          <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field(props: {
  label: string;
  name: string;
  type: string;
  required?: boolean;
  autoComplete?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={props.name}>{props.label}</Label>
      <Input id={props.name} {...props} />
    </div>
  );
}
