import { describe, expect, it, afterEach } from 'vitest';
import {
  authRepo,
  prisma,
  setMailAuthenticator,
  verifyTotpCode,
  generateTotpSecret,
} from '@crm/db';
import { Secret, TOTP } from 'otpauth';
import { createTenantUser } from './helpers';

afterEach(() => {
  setMailAuthenticator(null);
});

function currentCode(secretBase32: string) {
  return new TOTP({
    secret: Secret.fromBase32(secretBase32),
    digits: 6,
    period: 30,
    algorithm: 'SHA1',
  }).generate();
}

describe('mail + 2FA login', () => {
  it('accepts local password as first factor', async () => {
    const a = await createTenantUser('admin');
    const result = await authRepo.verifyFirstFactor(a.user.email, 'Password123!');
    expect(result?.firstFactor).toBe('password');
    expect(result?.user.id).toBe(a.user.id);
  });

  it('accepts IMAPS authenticator when local password does not match', async () => {
    const a = await createTenantUser('admin');
    await prisma.tenant.update({
      where: { id: a.tenant.id },
      data: {
        mailAuthEnabled: true,
        mailImapHost: 'mail.example.test',
        mailImapPort: 993,
      },
    });
    setMailAuthenticator(async (req) => {
      return (
        req.protocol === 'imap' &&
        req.host === 'mail.example.test' &&
        req.username === a.user.email &&
        req.password === 'MailboxPass!'
      );
    });
    const result = await authRepo.verifyFirstFactor(a.user.email, 'MailboxPass!');
    expect(result?.firstFactor).toBe('imap');
  });

  it('rejects unknown mailbox credentials with the same null result', async () => {
    const a = await createTenantUser('admin');
    setMailAuthenticator(async () => false);
    await expect(authRepo.verifyFirstFactor(a.user.email, 'nope')).resolves.toBeNull();
    await expect(
      authRepo.verifyFirstFactor('missing@test.local', 'Password123!'),
    ).resolves.toBeNull();
  });

  it('requires TOTP after first factor when 2FA is enabled', async () => {
    const a = await createTenantUser('admin');
    const { secret } = generateTotpSecret(a.user.email);
    const code = currentCode(secret);
    expect(verifyTotpCode(secret, code)).toBe(true);
    await authRepo.confirmTotpEnrollment(a.user.id, secret, code);

    const first = await authRepo.verifyFirstFactor(a.user.email, 'Password123!');
    expect(first?.user.totpEnabled).toBe(true);
    const ticket = await authRepo.createLoginChallenge(a.user.id, 'password');
    await expect(authRepo.consumeLoginChallenge(ticket)).resolves.toBeNull();
    await authRepo.verifySecondFactor(ticket, currentCode(secret));
    const user = await authRepo.consumeLoginChallenge(ticket);
    expect(user?.id).toBe(a.user.id);
    await expect(authRepo.consumeLoginChallenge(ticket)).resolves.toBeNull();
  });

  it('uses a backup code once', async () => {
    const a = await createTenantUser('admin');
    const { secret } = generateTotpSecret(a.user.email);
    const backups = await authRepo.confirmTotpEnrollment(
      a.user.id,
      secret,
      currentCode(secret),
    );
    const ticket = await authRepo.createLoginChallenge(a.user.id, 'password');
    await authRepo.verifySecondFactor(ticket, backups[0]!);
    const user = await authRepo.consumeLoginChallenge(ticket);
    expect(user?.id).toBe(a.user.id);
    const ticket2 = await authRepo.createLoginChallenge(a.user.id, 'password');
    await expect(authRepo.verifySecondFactor(ticket2, backups[0]!)).rejects.toThrow(
      /Invalid authentication code/,
    );
  });
});
