import { Secret, TOTP } from 'otpauth';
import { randomBytes } from 'node:crypto';
import { hash, compare } from 'bcryptjs';

export function generateTotpSecret(label: string, issuer = 'Nine CRM') {
  const secret = new Secret({ size: 20 });
  const totp = new TOTP({
    issuer,
    label,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret,
  });
  return { secret: secret.base32, otpauthUrl: totp.toString() };
}

export function verifyTotpCode(secretBase32: string, code: string) {
  const trimmed = code.replace(/\s+/g, '');
  if (!/^\d{6}$/.test(trimmed)) return false;
  const totp = new TOTP({
    issuer: 'Nine CRM',
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(secretBase32),
  });
  const delta = totp.validate({ token: trimmed, window: 1 });
  return delta !== null;
}

export async function generateBackupCodes(count = 10) {
  const codes: string[] = [];
  const hashes: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const code = randomBytes(5).toString('hex').slice(0, 10);
    codes.push(code);
    hashes.push(await hash(code, 10));
  }
  return { codes, hashes };
}

export async function consumeBackupCode(hashes: string[], code: string) {
  const trimmed = code.trim().toLowerCase();
  for (let i = 0; i < hashes.length; i += 1) {
    if (await compare(trimmed, hashes[i]!)) {
      return hashes.filter((_, idx) => idx !== i);
    }
  }
  return null;
}
