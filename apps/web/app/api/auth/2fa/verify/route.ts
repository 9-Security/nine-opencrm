import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authRepo } from '@crm/db';
import { apiError } from '@/lib/api';
import { readLoginChallengeCookie } from '@/lib/auth-cookies';

const schema = z.object({ code: z.string().min(6).max(20) });

export async function POST(req: Request) {
  const requestId = req.headers.get('x-request-id') ?? crypto.randomUUID();
  try {
    const ticket = await readLoginChallengeCookie();
    if (!ticket) {
      return NextResponse.json({ error: '登入已過期，請重新輸入密碼' }, { status: 401 });
    }
    const body = schema.parse(await req.json());
    await authRepo.verifySecondFactor(ticket, body.code);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    }
    return apiError(err, { requestId });
  }
}
