import { NextResponse } from 'next/server';
import { companiesRepo, contactsRepo, ticketsRepo } from '@crm/db';
import { apiError, loadApiTenant } from '@/lib/api';

export async function GET(req: Request) {
  const requestId = req.headers.get('x-request-id') ?? crypto.randomUUID();
  try {
    const ctx = await loadApiTenant();
    const q = new URL(req.url).searchParams.get('q')?.trim() ?? '';
    if (q.length < 2) {
      return NextResponse.json({ companies: [], contacts: [], tickets: [] });
    }
    const [companies, contacts, tickets] = await Promise.all([
      companiesRepo.listCompanies(ctx.tenantId),
      contactsRepo.listContacts(ctx.tenantId, { q }),
      ticketsRepo.listTickets(ctx.tenantId, { q }),
    ]);
    const qLower = q.toLowerCase();
    return NextResponse.json({
      companies: companies
        .filter((c) => c.name.toLowerCase().includes(qLower))
        .slice(0, 8)
        .map((c) => ({ id: c.id, name: c.name })),
      contacts: contacts.slice(0, 8).map((c) => ({
        id: c.id,
        name: `${c.lastName}${c.firstName}`,
        company: c.company?.name ?? null,
      })),
      tickets: tickets
        .slice(0, 8)
        .map((t) => ({ id: t.id, title: t.title, status: t.status })),
    });
  } catch (err) {
    return apiError(err, { requestId });
  }
}
