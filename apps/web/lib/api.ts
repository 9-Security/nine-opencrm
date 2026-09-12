import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import {
  authRepo,
  ConflictError,
  ForbiddenError,
  InviteError,
  NotFoundError,
  TenantIsolationError,
  UnauthorizedError as DbUnauthorizedError,
  ValidationError,
} from '@crm/db';
import { IllegalTransitionError } from '@crm/shared';
import { getTenantContext, type TenantContext } from './tenant';
import { logRequest } from './log';

export class UnauthorizedError extends Error {
  constructor(message = 'Unauthorized') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

export async function loadApiTenant(): Promise<TenantContext> {
  const result = await getTenantContext();
  if (!result) throw new UnauthorizedError();
  if (!result.ctx) throw new ForbiddenError('No tenant membership');
  const pathname = (await headers()).get('x-pathname') ?? '';
  if (
    authRepo.apiBlockedForMissing2fa({
      require2fa: result.ctx.require2fa,
      totpEnabled: result.ctx.totpEnabled,
      pathname,
    })
  ) {
    throw new ForbiddenError('Two-factor authentication is required');
  }
  return result.ctx;
}

export function apiError(err: unknown, extra?: Record<string, unknown>) {
  if (err instanceof UnauthorizedError || err instanceof DbUnauthorizedError) {
    return NextResponse.json(
      { error: err instanceof DbUnauthorizedError ? err.message : 'Unauthorized' },
      { status: 401 },
    );
  }
  if (err instanceof NotFoundError || err instanceof TenantIsolationError) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (err instanceof ForbiddenError) {
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
  if (err instanceof IllegalTransitionError || err instanceof ConflictError) {
    return NextResponse.json({ error: err.message }, { status: 409 });
  }
  if (err instanceof InviteError || err instanceof ValidationError) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
  if (err instanceof Error && err.message === 'NEXT_REDIRECT') {
    throw err;
  }
  logRequest({
    level: 'error',
    message: 'unhandled_api_error',
    error: err instanceof Error ? err.message : 'unknown',
    ...extra,
  });
  return NextResponse.json({ error: 'Internal error' }, { status: 500 });
}

export function requestIdFrom(headers: Headers): string {
  return headers.get('x-request-id') ?? crypto.randomUUID();
}
