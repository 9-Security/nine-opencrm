import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  authRepo,
  clearRateLimit,
  peekRateLimit,
  rateLimitKey,
  recordRateLimitHit,
  TOTP_VERIFY_LIMIT,
  TOTP_VERIFY_WINDOW_MS,
  ValidationError,
} from '@crm/db';
import { apiError } from '@/lib/api';
import { readLoginChallengeCookie } from '@/lib/auth-cookies';
import { clientIp } from '@/lib/request-ip';

const schema = z.object({ code: z.string().min(6).max(20) });

export async function POST(req: Request) {
  const requestId = req.headers.get('x-request-id') ?? crypto.randomUUID();
  try {
    const ticket = await readLoginChallengeCookie();
    if (!ticket) {
      return NextResponse.json({ error: '登入已過期，請重新輸入密碼' }, { status: 401 });
    }
    const ticketHash = createHash('sha256').update(ticket).digest('hex').slice(0, 16);
    const limitKey = rateLimitKey(['2fa', clientIp(req), ticketHash]);
    if (!peekRateLimit(limitKey, TOTP_VERIFY_LIMIT)) {
      return NextResponse.json({ error: '嘗試次數過多，請稍後再試' }, { status: 429 });
    }
    const body = schema.parse(await req.json());
    try {
      await authRepo.verifySecondFactor(ticket, body.code);
    } catch (err) {
      if (err instanceof ValidationError) {
        recordRateLimitHit(limitKey, TOTP_VERIFY_WINDOW_MS);
      }
      throw err;
    }
    clearRateLimit(limitKey);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    }
    return apiError(err, { requestId });
  }
}
