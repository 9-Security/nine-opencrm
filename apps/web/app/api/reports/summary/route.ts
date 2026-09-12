import { NextResponse } from 'next/server';
import { reportsRepo } from '@crm/db';
import { apiError, loadApiTenant } from '@/lib/api';
import { logRequest } from '@/lib/log';

export async function GET(req: Request) {
  const requestId = req.headers.get('x-request-id') ?? crypto.randomUUID();
  try {
    const ctx = await loadApiTenant();
    const summary = await reportsRepo.reportSummary(ctx.tenantId);
    logRequest({
      requestId,
      message: 'reports.summary',
      tenant_id: ctx.tenantId,
      user_id: ctx.userId,
    });
    return NextResponse.json({ summary });
  } catch (err) {
    return apiError(err, { requestId });
  }
}
