export function publicAppOrigin(req: Request): string {
  const authUrl = process.env.AUTH_URL?.trim();
  if (authUrl) {
    try {
      return new URL(authUrl).origin;
    } catch {
      // fall through to request headers
    }
  }
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

function firstHeaderValue(value: string | null): string | undefined {
  const first = value?.split(',')[0]?.trim();
  return first || undefined;
}
