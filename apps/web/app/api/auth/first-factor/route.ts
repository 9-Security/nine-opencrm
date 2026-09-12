import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  authRepo,
  clearRateLimit,
  FIRST_FACTOR_LIMIT,
  FIRST_FACTOR_WINDOW_MS,
  peekRateLimit,
  rateLimitKey,
  recordRateLimitHit,
} from '@crm/db';
import { apiError } from '@/lib/api';
import { logRequest } from '@/lib/log';
import {
  clearLoginChallengeCookie,
  readLoginChallengeCookie,
  setLoginChallengeCookie,
} from '@/lib/auth-cookies';
import { clientIp } from '@/lib/request-ip';

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: Request) {
  const requestId = req.headers.get('x-request-id') ?? crypto.randomUUID();
  try {
    const body = schema.parse(await req.json());
    const email = body.email.trim().toLowerCase();
    const limitKey = rateLimitKey(['first-factor', clientIp(req), email]);
    if (!(await peekRateLimit(limitKey, FIRST_FACTOR_LIMIT))) {
      return NextResponse.json({ error: '嘗試次數過多，請稍後再試' }, { status: 429 });
    }
    const result = await authRepo.verifyFirstFactor(email, body.password);
    if (!result) {
      await recordRateLimitHit(limitKey, FIRST_FACTOR_WINDOW_MS);
      logRequest({ requestId, message: 'auth.first_factor_failed' });
      return NextResponse.json({ error: 'Email 或密碼不正確' }, { status: 401 });
    }
    await clearRateLimit(limitKey);
    const leftover = await readLoginChallengeCookie();
    if (leftover) await authRepo.invalidateLoginChallenge(leftover);
    const raw = await authRepo.createLoginChallenge(result.user.id, result.firstFactor);
    await setLoginChallengeCookie(raw);
    logRequest({
      requestId,
      message: 'auth.first_factor_ok',
      user_id: result.user.id,
      first_factor: result.firstFactor,
    });
    return NextResponse.json({
      requires2fa: result.user.totpEnabled,
      mailboxAuth: result.firstFactor !== 'password',
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    }
    return apiError(err, { requestId });
  }
}

export async function DELETE() {
  const ticket = await readLoginChallengeCookie();
  if (ticket) await authRepo.invalidateLoginChallenge(ticket);
  await clearLoginChallengeCookie();
  return NextResponse.json({ ok: true });
}
