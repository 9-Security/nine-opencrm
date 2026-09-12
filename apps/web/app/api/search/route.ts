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
      companiesRepo.listCompanies(ctx.tenantId, { q, take: 8 }),
      contactsRepo.listContacts(ctx.tenantId, { q, take: 8 }),
      ticketsRepo.listTickets(ctx.tenantId, { q, take: 8 }),
    ]);
    return NextResponse.json({
      companies: companies.map((c) => ({ id: c.id, name: c.name })),
      contacts: contacts.map((c) => ({
        id: c.id,
        name: `${c.lastName}${c.firstName}`,
        company: c.company?.name ?? null,
      })),
      tickets: tickets.map((t) => ({ id: t.id, title: t.title, status: t.status })),
    });
  } catch (err) {
    return apiError(err, { requestId });
  }
}
