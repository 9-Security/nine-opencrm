type LogFields = Record<string, unknown>;

const SENSITIVE_KEY =
  /password|token|secret|authorization|cookie|backup|invite_url|inviteurl/;

function looksLikeInviteUrl(value: string): boolean {
  return /\/invites\/[a-zA-Z0-9_-]{16,}/.test(value);
}

function scrubValue(key: string, value: unknown): unknown {
  const lowered = key.toLowerCase();
  if (SENSITIVE_KEY.test(lowered) || lowered === 'url') {
    return '[redacted]';
  }
  if (typeof value === 'string' && looksLikeInviteUrl(value)) {
    return '[redacted]';
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return scrub(value as LogFields);
  }
  return value;
}

function scrub(fields: LogFields): LogFields {
  const out: LogFields = {};
  for (const [k, v] of Object.entries(fields)) {
    out[k] = scrubValue(k, v);
  }
  return out;
}

export function logRequest(fields: LogFields) {
  const line = {
    ts: new Date().toISOString(),
    ...scrub(fields),
  };
  if (fields.level === 'error') {
    console.error(JSON.stringify(line));
  } else {
    console.info(JSON.stringify(line));
  }
}

export { scrub as scrubLogFields };
