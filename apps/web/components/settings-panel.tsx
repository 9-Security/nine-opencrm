'use client';

import { FormEvent, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ROLE_LABELS, ROLES, type Role } from '@crm/shared';
import { PageHeader } from '@/components/app-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

type Member = {
  id: string;
  role: Role;
  status: string;
  user: { email: string; name: string | null };
};

type Invite = {
  id: string;
  email: string;
  role: Role;
  acceptedAt: string | null;
  expiresAt: string;
  createdAt: string;
};

const WORKDAYS = [
  { value: 1, label: '一' },
  { value: 2, label: '二' },
  { value: 3, label: '三' },
  { value: 4, label: '四' },
  { value: 5, label: '五' },
  { value: 6, label: '六' },
  { value: 0, label: '日' },
];

export function SettingsPanel() {
  const qc = useQueryClient();
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

  const settings = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const res = await fetch('/api/tenants');
      if (!res.ok) throw new Error('failed');
      return res.json() as Promise<{
        tenant: {
          name: string;
          timezone: string;
          workdays: number[];
          mailAuthEnabled: boolean;
          mailImapHost: string | null;
          mailImapPort: number;
          mailPop3Host: string | null;
          mailPop3Port: number;
          require2fa: boolean;
        };
        members: Member[];
        invites: Invite[];
      }>;
    },
  });

  async function saveTenant(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const payload: Record<string, unknown> = {};
    if (form.has('name')) {
      payload.name = form.get('name');
      payload.timezone = form.get('timezone');
      payload.workdays = Array.from(form.getAll('workdays')).map((v) => Number(v));
    }
    if (form.has('mailImapHost')) {
      payload.mailAuthEnabled = form.get('mailAuthEnabled') === 'on';
      payload.mailImapHost = String(form.get('mailImapHost') ?? '');
      payload.mailImapPort = Number(form.get('mailImapPort') || 993);
      payload.mailPop3Host = String(form.get('mailPop3Host') ?? '');
      payload.mailPop3Port = Number(form.get('mailPop3Port') || 995);
      payload.require2fa = form.get('require2fa') === 'on';
    }
    const res = await fetch('/api/tenants', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      toast.error('無法儲存租戶設定');
      return;
    }
    toast.success('已儲存');
    await qc.invalidateQueries({ queryKey: ['settings'] });
  }

  async function invite(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const res = await fetch('/api/invites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: form.get('email'),
        role: form.get('role'),
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(body.error ?? '邀請失敗');
      return;
    }
    setInviteUrl(body.inviteUrl);
    toast.success('已建立邀請，請複製連結傳給對方');
    (e.target as HTMLFormElement).reset();
    await qc.invalidateQueries({ queryKey: ['settings'] });
  }

  async function copyInvite(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      toast.success('已複製邀請連結');
    } catch {
      toast.error('無法複製，請手動選取連結');
    }
  }

  async function rotateInvite(inviteId: string) {
    const res = await fetch('/api/invites/rotate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inviteId }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(body.error ?? '無法重新產生連結');
      return;
    }
    setInviteUrl(body.inviteUrl);
    toast.success('已產生新連結，舊連結失效');
    await qc.invalidateQueries({ queryKey: ['settings'] });
  }

  async function changeRole(membershipId: string, role: Role) {
    const res = await fetch(`/api/tenants/members/${membershipId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    });
    if (!res.ok) {
      toast.error('無法變更角色');
      return;
    }
    toast.success('角色已更新');
    await qc.invalidateQueries({ queryKey: ['settings'] });
  }

  if (!settings.data) {
    return <p className="text-sm text-slate-500">載入設定…</p>;
  }

  const { tenant, members, invites } = settings.data;

  return (
    <div className="space-y-6">
      <PageHeader title="設定" description="公司／時區、成員與邀請" />
      <Card>
        <CardHeader>
          <h2 className="font-semibold">租戶資料</h2>
        </CardHeader>
        <CardBody>
          <form onSubmit={saveTenant} className="grid max-w-lg gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">名稱</Label>
              <Input id="name" name="name" defaultValue={tenant.name} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="timezone">時區</Label>
              <Input
                id="timezone"
                name="timezone"
                defaultValue={tenant.timezone}
                required
              />
            </div>
            <fieldset className="space-y-1.5">
              <legend className="text-sm font-medium">工作日</legend>
              <div className="flex flex-wrap gap-3 text-sm">
                {WORKDAYS.map((d) => (
                  <label key={d.value} className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      name="workdays"
                      value={d.value}
                      defaultChecked={tenant.workdays.includes(d.value)}
                    />
                    {d.label}
                  </label>
                ))}
              </div>
            </fieldset>
            <Button type="submit" className="w-fit">
              儲存
            </Button>
          </form>
          <p className="mt-4 text-xs text-slate-400">方案資訊（佔位）— MVP 不計費</p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="font-semibold">登入認證</h2>
        </CardHeader>
        <CardBody>
          <form onSubmit={saveTenant} className="grid max-w-lg gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="mailAuthEnabled"
                defaultChecked={tenant.mailAuthEnabled}
              />
              允許以公司信箱 IMAPS / POP3S 認證登入（密碼不會被存成信箱密碼）
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="mailImapHost">IMAPS 主機</Label>
                <Input
                  id="mailImapHost"
                  name="mailImapHost"
                  defaultValue={tenant.mailImapHost ?? ''}
                  placeholder="mail.example.com"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mailImapPort">埠</Label>
                <Input
                  id="mailImapPort"
                  name="mailImapPort"
                  type="number"
                  defaultValue={tenant.mailImapPort}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mailPop3Host">POP3S 主機</Label>
                <Input
                  id="mailPop3Host"
                  name="mailPop3Host"
                  defaultValue={tenant.mailPop3Host ?? ''}
                  placeholder="mail.example.com"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mailPop3Port">埠</Label>
                <Input
                  id="mailPop3Port"
                  name="mailPop3Port"
                  type="number"
                  defaultValue={tenant.mailPop3Port}
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="require2fa"
                defaultChecked={tenant.require2fa}
              />
              要求成員啟用 TOTP 兩步驟驗證
            </label>
            <p className="text-xs text-slate-400">
              IMAPS 預設 993、POP3S 預設 995，皆為 TLS。亦可設環境變數 MAIL_AUTH_IMAP_HOST
              / MAIL_AUTH_POP3_HOST 作為全域信箱登入。
            </p>
            <Button type="submit" className="w-fit">
              儲存登入設定
            </Button>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="font-semibold">成員</h2>
        </CardHeader>
        <CardBody className="space-y-3">
          {members.map((m) => (
            <div
              key={m.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2"
            >
              <div>
                <div className="text-sm font-medium">{m.user.name || m.user.email}</div>
                <div className="text-xs text-slate-500">{m.user.email}</div>
              </div>
              <select
                className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm"
                defaultValue={m.role}
                onChange={(e) => changeRole(m.id, e.target.value as Role)}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="font-semibold">邀請成員</h2>
        </CardHeader>
        <CardBody>
          <form onSubmit={invite} className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input name="email" type="email" required />
            </div>
            <div className="space-y-1.5">
              <Label>角色</Label>
              <select
                name="role"
                className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm"
                defaultValue="sales"
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit">送出邀請</Button>
          </form>
          <p className="mt-3 text-xs text-slate-500">
            目前不會寄出邀請信。請把連結傳給對方，對方用同一個 Email 註冊或登入即可加入。
          </p>
          {inviteUrl ? (
            <div className="mt-3 rounded-lg bg-accent-50 px-3 py-2 text-sm text-accent-700">
              <p className="break-all">{inviteUrl}</p>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="mt-2"
                onClick={() => copyInvite(inviteUrl)}
              >
                複製連結
              </Button>
            </div>
          ) : null}
          <div className="mt-4 space-y-2">
            {invites.length === 0 ? (
              <p className="text-sm text-slate-500">尚無邀請。</p>
            ) : (
              invites.map((inv) => (
                <div
                  key={inv.id}
                  className="flex items-center justify-between gap-2 text-sm"
                >
                  <span>
                    {inv.email} · {ROLE_LABELS[inv.role]}
                  </span>
                  <span className="flex items-center gap-2">
                    <Badge>
                      {inv.acceptedAt
                        ? '已接受'
                        : new Date(inv.expiresAt) < new Date()
                          ? '已過期'
                          : '待接受'}
                    </Badge>
                    {!inv.acceptedAt ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => rotateInvite(inv.id)}
                      >
                        重新產生連結
                      </Button>
                    ) : null}
                  </span>
                </div>
              ))
            )}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
