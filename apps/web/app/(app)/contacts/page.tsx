import { canWriteContacts } from '@crm/shared';
import { ContactList } from '@/components/contact-list';
import { requireTenant } from '@/lib/tenant';

export default async function ContactsPage() {
  const ctx = await requireTenant();
  return <ContactList canWrite={canWriteContacts(ctx.role)} />;
}
