import { useQuery } from '@tanstack/react-query';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';

type Member = { id: string; name: string | null; email: string };
type Company = { id: string; name: string };
type Contact = { id: string; firstName: string; lastName: string };

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
    <div className="space-y-1.5">
      <Label>公司</Label>
      <Select name={name} defaultValue={defaultValue ?? ''} disabled={disabled}>
        <option value="">（未指定）</option>
        {(q.data?.companies ?? []).map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </Select>
    </div>
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
    <div className="space-y-1.5">
      <Label>聯絡人</Label>
      <Select name={name} defaultValue={defaultValue ?? ''} disabled={disabled}>
        <option value="">（未指定）</option>
        {(q.data?.contacts ?? []).map((c) => (
          <option key={c.id} value={c.id}>
            {c.lastName}
            {c.firstName}
          </option>
        ))}
      </Select>
    </div>
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
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Select name={name} defaultValue={defaultValue ?? ''} disabled={disabled}>
        {allowEmpty ? <option value="">（未指定）</option> : null}
        {(q.data?.members ?? []).map((m) => (
          <option key={m.id} value={m.id}>
            {m.name || m.email}
          </option>
        ))}
      </Select>
    </div>
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
    <div className="space-y-1.5">
      <Label>商機</Label>
      <Select name={name} defaultValue={defaultValue ?? ''} disabled={disabled}>
        <option value="">（未指定）</option>
        {(q.data?.opportunities ?? []).map((o) => (
          <option key={o.id} value={o.id}>
            {o.title}
          </option>
        ))}
      </Select>
    </div>
  );
}

export function emptyToNull(value: FormDataEntryValue | null) {
  const s = String(value ?? '').trim();
  return s ? s : null;
}
