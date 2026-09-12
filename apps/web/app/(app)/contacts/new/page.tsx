import { redirect } from 'next/navigation';
import { canWriteContacts } from '@crm/shared';
import { NewContactForm } from '@/components/new-contact-form';
import { requireTenant } from '@/lib/tenant';

export default async function NewContactPage() {
  const ctx = await requireTenant();
  if (!canWriteContacts(ctx.role)) {
    redirect('/?error=forbidden');
  }
  return <NewContactForm />;
}
