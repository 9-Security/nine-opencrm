'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';

type Member = { id: string; name: string | null; email: string };
type Company = { id: string; name: string };
type Contact = { id: string; firstName: string; lastName: string };

function BoundSelect({
  name,
  label,
  defaultValue,
  disabled,
  allowEmpty = true,
  emptyLabel = '（未指定）',
  options,
  loading,
}: {
  name: string;
  label: string;
  defaultValue?: string | null;
  disabled?: boolean;
  allowEmpty?: boolean;
  emptyLabel?: string;
  options: Array<{ value: string; label: string }>;
  loading?: boolean;
}) {
  const [value, setValue] = useState(defaultValue ?? '');
  useEffect(() => {
    setValue(defaultValue ?? '');
  }, [defaultValue]);

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Select
        name={name}
        value={value}
        disabled={disabled || loading}
        onChange={(e) => setValue(e.target.value)}
      >
        {allowEmpty ? <option value="">{loading ? '載入中…' : emptyLabel}</option> : null}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    </div>
  );
}

export function CompanySelect({
  name,
  defaultValue,
  disabled,
}: {
  name: string;
  defaultValue?: string | null;
  disabled?: boolean;
}) {
  const q = useQuery({
    queryKey: ['companies'],
    queryFn: async () => {
      const res = await fetch('/api/companies');
      if (!res.ok) throw new Error('failed');
      return res.json() as Promise<{ companies: Company[] }>;
    },
  });
  return (
    <BoundSelect
      name={name}
      label="公司"
      defaultValue={defaultValue}
      disabled={disabled}
      loading={q.isLoading}
      options={(q.data?.companies ?? []).map((c) => ({ value: c.id, label: c.name }))}
    />
  );
}

export function ContactSelect({
  name,
  defaultValue,
  disabled,
}: {
  name: string;
  defaultValue?: string | null;
  disabled?: boolean;
}) {
  const q = useQuery({
    queryKey: ['contacts'],
    queryFn: async () => {
      const res = await fetch('/api/contacts');
      if (!res.ok) throw new Error('failed');
      return res.json() as Promise<{ contacts: Contact[] }>;
    },
  });
  return (
    <BoundSelect
      name={name}
      label="聯絡人"
      defaultValue={defaultValue}
      disabled={disabled}
      loading={q.isLoading}
      options={(q.data?.contacts ?? []).map((c) => ({
        value: c.id,
        label: `${c.lastName}${c.firstName}`,
      }))}
    />
  );
}

export function MemberSelect({
  name,
  defaultValue,
  disabled,
  label = '負責人',
  allowEmpty = true,
}: {
  name: string;
  defaultValue?: string | null;
  disabled?: boolean;
  label?: string;
  allowEmpty?: boolean;
}) {
  const q = useQuery({
    queryKey: ['members'],
    queryFn: async () => {
      const res = await fetch('/api/members');
      if (!res.ok) throw new Error('failed');
      return res.json() as Promise<{ members: Member[] }>;
    },
  });
  return (
    <BoundSelect
      name={name}
      label={label}
      defaultValue={defaultValue}
      disabled={disabled}
      allowEmpty={allowEmpty}
      loading={q.isLoading}
      options={(q.data?.members ?? []).map((m) => ({
        value: m.id,
        label: m.name || m.email,
      }))}
    />
  );
}

export function OpportunitySelect({
  name,
  defaultValue,
  disabled,
}: {
  name: string;
  defaultValue?: string | null;
  disabled?: boolean;
}) {
  const q = useQuery({
    queryKey: ['opportunities'],
    queryFn: async () => {
      const res = await fetch('/api/opportunities');
      if (!res.ok) throw new Error('failed');
      return res.json() as Promise<{
        opportunities: Array<{ id: string; title: string }>;
      }>;
    },
  });
  return (
    <BoundSelect
      name={name}
      label="商機"
      defaultValue={defaultValue}
      disabled={disabled}
      loading={q.isLoading}
      options={(q.data?.opportunities ?? []).map((o) => ({
        value: o.id,
        label: o.title,
      }))}
    />
  );
}

export function emptyToNull(value: FormDataEntryValue | null) {
  const s = String(value ?? '').trim();
  return s ? s : null;
}
