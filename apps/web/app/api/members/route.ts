import { NextResponse } from 'next/server';
import { tenantsRepo } from '@crm/db';
import { apiError, loadApiTenant } from '@/lib/api';

export async function GET(req: Request) {
  const requestId = req.headers.get('x-request-id') ?? crypto.randomUUID();
  try {
    const ctx = await loadApiTenant();
    const members = await tenantsRepo.listTenantMembers(ctx.tenantId);
    return NextResponse.json({
      members: members
        .filter((m) => m.status === 'active')
        .map((m) => ({
          id: m.id,
          role: m.role,
          name: m.user.name,
          email: m.user.email,
        })),
    });
  } catch (err) {
    return apiError(err, { requestId });
  }
}
