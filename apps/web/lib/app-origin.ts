const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);

export function publicAppOrigin(req: Request): string {
  const fromEnv = originFromAuthUrl();
  if (fromEnv) return fromEnv;
  const proto = firstHeaderValue(req.headers.get('x-forwarded-proto'));
  const host =
    firstHeaderValue(req.headers.get('x-forwarded-host')) ??
    firstHeaderValue(req.headers.get('host'));
  if (proto && host) {
    return `${proto}://${host}`;
  }
  return new URL(req.url).origin;
}

export function inviteJoinUrl(req: Request, rawToken: string): string {
  return `${publicAppOrigin(req)}/invites/${rawToken}`;
}

function originFromAuthUrl(): string | null {
  const authUrl = process.env.AUTH_URL?.trim();
  if (!authUrl) return null;
  try {
    const url = new URL(authUrl);
    if (isLoopbackHostname(url.hostname)) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function isLoopbackHostname(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  return LOOPBACK_HOSTS.has(host) || host.endsWith('.localhost');
}

function firstHeaderValue(value: string | null): string | undefined {
  const first = value?.split(',')[0]?.trim();
  return first || undefined;
}
