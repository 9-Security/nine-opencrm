import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authRepo } from '@crm/db';
import { apiError } from '@/lib/api';
import { logRequest } from '@/lib/log';
import { setLoginChallengeCookie } from '@/lib/auth-cookies';

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: Request) {
  const requestId = req.headers.get('x-request-id') ?? crypto.randomUUID();
  try {
    const body = schema.parse(await req.json());
    const result = await authRepo.verifyFirstFactor(body.email, body.password);
    if (!result) {
      logRequest({ requestId, message: 'auth.first_factor_failed' });
      return NextResponse.json({ error: 'Email 或密碼不正確' }, { status: 401 });
    }
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
      firstFactor: result.firstFactor,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    }
    return apiError(err, { requestId });
  }
}
