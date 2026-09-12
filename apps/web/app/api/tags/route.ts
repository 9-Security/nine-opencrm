import { NextResponse } from 'next/server';
import { tagsRepo } from '@crm/db';
import { apiError, loadApiTenant } from '@/lib/api';

export async function GET(req: Request) {
  const requestId = req.headers.get('x-request-id') ?? crypto.randomUUID();
  try {
    const ctx = await loadApiTenant();
    const tags = await tagsRepo.listTags(ctx.tenantId);
    return NextResponse.json({ tags });
  } catch (err) {
    return apiError(err, { requestId });
  }
}
