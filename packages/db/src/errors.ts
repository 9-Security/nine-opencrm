export class TenantIsolationError extends Error {
  constructor(message = 'Cross-tenant access denied') {
    super(message);
    this.name = 'TenantIsolationError';
  }
}

export class NotFoundError extends Error {
  constructor(message = 'Not found') {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class ForbiddenError extends Error {
  constructor(message = 'Forbidden') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

export class UnauthorizedError extends Error {
  constructor(message = 'Unauthorized') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

export class InviteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InviteError';
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class ConflictError extends Error {
  constructor(message = 'Conflict') {
    super(message);
    this.name = 'ConflictError';
  }
}

/** tenantId is required — never optional — to prevent unscoped queries. */
export function requireTenantId(tenantId: string): string {
  if (!tenantId || tenantId.trim() === '') {
    throw new TenantIsolationError('tenant_id is required');
  }
  return tenantId;
}
