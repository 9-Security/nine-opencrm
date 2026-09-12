import { NextResponse } from 'next/server';
import { z } from 'zod';
import QRCode from 'qrcode';
import { authRepo } from '@crm/db';
import { apiError, loadApiTenant } from '@/lib/api';
import {
  clearTotpEnrollCookie,
  readTotpEnrollCookie,
  setTotpEnrollCookie,
} from '@/lib/auth-cookies';

const confirmSchema = z.object({ code: z.string().min(6).max(20) });

export async function GET() {
  try {
    const ctx = await loadApiTenant();
    const status = await authRepo.getUserAuthStatus(ctx.userId);
    return NextResponse.json(status);
  } catch (err) {
    return apiError(err);
  }
}

export async function POST() {
  try {
    const ctx = await loadApiTenant();
    const started = authRepo.beginTotpEnrollment(ctx.email);
    await setTotpEnrollCookie(started.secret);
    const qrDataUrl = await QRCode.toDataURL(started.otpauthUrl, {
      margin: 1,
      width: 192,
    });
    return NextResponse.json({
      otpauthUrl: started.otpauthUrl,
      qrDataUrl,
    });
  } catch (err) {
    return apiError(err);
  }
}

export async function PUT(req: Request) {
  try {
    const ctx = await loadApiTenant();
    const secret = await readTotpEnrollCookie();
    if (!secret) {
      return NextResponse.json({ error: '請重新開始綁定' }, { status: 400 });
    }
    const body = confirmSchema.parse(await req.json());
    const backupCodes = await authRepo.confirmTotpEnrollment(
      ctx.userId,
      secret,
      body.code,
    );
    await clearTotpEnrollCookie();
    return NextResponse.json({ backupCodes });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    }
    return apiError(err);
  }
}

export async function DELETE(req: Request) {
  try {
    const ctx = await loadApiTenant();
    const body = confirmSchema.parse(await req.json());
    await authRepo.disableTotp(ctx.userId, body.code);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    }
    return apiError(err);
  }
}
