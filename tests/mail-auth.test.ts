import { describe, expect, it } from 'vitest';
import { authenticateImaps, authenticatePop3s } from '@crm/db';

describe('mail auth helpers', () => {
  it('returns false when host is unreachable', async () => {
    await expect(
      authenticateImaps({
        protocol: 'imap',
        host: '127.0.0.1',
        port: 1,
        username: 'a@b.c',
        password: 'x',
      }),
    ).resolves.toBe(false);
    await expect(
      authenticatePop3s({
        protocol: 'pop3',
        host: '127.0.0.1',
        port: 1,
        username: 'a@b.c',
        password: 'x',
      }),
    ).resolves.toBe(false);
  });
});
