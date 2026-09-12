import { prisma } from './client';

export const FIRST_FACTOR_LIMIT = 5;
export const FIRST_FACTOR_WINDOW_MS = 15 * 60 * 1000;
export const TOTP_VERIFY_LIMIT = 8;
export const TOTP_VERIFY_WINDOW_MS = 15 * 60 * 1000;

export async function peekRateLimit(key: string, limit: number) {
  const row = await prisma.rateLimitBucket.findUnique({ where: { key } });
  if (!row) return true;
  if (row.resetAt.getTime() <= Date.now()) {
    await prisma.rateLimitBucket.deleteMany({ where: { key } });
    return true;
  }
  return row.count < limit;
}

export async function recordRateLimitHit(key: string, windowMs: number) {
  const now = Date.now();
  const resetAt = new Date(now + windowMs);
  await prisma.$transaction(async (tx) => {
    const row = await tx.rateLimitBucket.findUnique({ where: { key } });
    if (!row || row.resetAt.getTime() <= now) {
      await tx.rateLimitBucket.upsert({
        where: { key },
        create: { key, count: 1, resetAt },
        update: { count: 1, resetAt },
      });
      return;
    }
    await tx.rateLimitBucket.update({
      where: { key },
      data: { count: { increment: 1 } },
    });
  });
}

export async function clearRateLimit(key: string) {
  await prisma.rateLimitBucket.deleteMany({ where: { key } });
}

export async function resetAllRateLimits() {
  await prisma.rateLimitBucket.deleteMany();
}

export function rateLimitKey(parts: string[]) {
  return parts.map((part) => part.trim().toLowerCase()).join(':');
}
