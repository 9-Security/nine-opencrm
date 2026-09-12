import { AppShell } from '@/components/app-shell';
import { requireTenant } from '@/lib/tenant';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireTenant();
  const pathname = (await headers()).get('x-pathname') ?? '';
  if (ctx.require2fa && !ctx.totpEnabled && pathname !== '/account/security') {
    redirect('/account/security?required=1');
  }
  return <AppShell ctx={ctx}>{children}</AppShell>;
}
