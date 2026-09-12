type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export const FIRST_FACTOR_LIMIT = 5;
export const FIRST_FACTOR_WINDOW_MS = 15 * 60 * 1000;
export const TOTP_VERIFY_LIMIT = 8;
export const TOTP_VERIFY_WINDOW_MS = 15 * 60 * 1000;

export function peekRateLimit(key: string, limit: number) {
  const bucket = buckets.get(key);
  if (!bucket) return true;
  if (bucket.resetAt <= Date.now()) {
    buckets.delete(key);
    return true;
  }
  return bucket.count < limit;
}

export function recordRateLimitHit(key: string, windowMs: number) {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  bucket.count += 1;
}

export function clearRateLimit(key: string) {
  buckets.delete(key);
}

export function resetAllRateLimits() {
  buckets.clear();
}

export function rateLimitKey(parts: string[]) {
  return parts.map((part) => part.trim().toLowerCase()).join(':');
}
