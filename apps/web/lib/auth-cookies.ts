import { cookies } from 'next/headers';

export const LOGIN_CHALLENGE_COOKIE = 'crm-login-challenge';
export const TOTP_ENROLL_COOKIE = 'crm-2fa-enroll';

export async function setLoginChallengeCookie(raw: string) {
  const jar = await cookies();
  jar.set(LOGIN_CHALLENGE_COOKIE, raw, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 5 * 60,
  });
}

export async function clearLoginChallengeCookie() {
  const jar = await cookies();
  jar.delete(LOGIN_CHALLENGE_COOKIE);
}

export async function readLoginChallengeCookie() {
  const jar = await cookies();
  return jar.get(LOGIN_CHALLENGE_COOKIE)?.value ?? null;
}

export async function setTotpEnrollCookie(secret: string) {
  const jar = await cookies();
  jar.set(TOTP_ENROLL_COOKIE, secret, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 10 * 60,
  });
}

export async function readTotpEnrollCookie() {
  const jar = await cookies();
  return jar.get(TOTP_ENROLL_COOKIE)?.value ?? null;
}

export async function clearTotpEnrollCookie() {
  const jar = await cookies();
  jar.delete(TOTP_ENROLL_COOKIE);
}
