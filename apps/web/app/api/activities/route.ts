import { NextResponse } from 'next/server';
import { opportunitiesRepo } from '@crm/db';
import { apiError, loadApiTenant } from '@/lib/api';

export async function GET(req: Request) {
  const requestId = req.headers.get('x-request-id') ?? crypto.randomUUID();
  try {
    const ctx = await loadApiTenant();
    const url = new URL(req.url);
    const activities = await opportunitiesRepo.listActivities(ctx.tenantId, {
      inbox: url.searchParams.get('inbox') === '1',
      status:
        url.searchParams.get('status') === 'done'
          ? 'done'
          : url.searchParams.get('status') === 'todo'
            ? 'todo'
            : undefined,
      take: 20,
    });
    return NextResponse.json({ activities });
  } catch (err) {
    return apiError(err, { requestId });
  }
}
