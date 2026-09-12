import { describe, expect, it } from 'vitest';
import {
  authenticateImaps,
  authenticatePop3s,
  isBlockedMailHost,
  stripMailCredential,
} from '@crm/db';

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

  it('rejects private, link-local, and metadata mail hosts', () => {
    expect(isBlockedMailHost('127.0.0.1')).toBe(true);
    expect(isBlockedMailHost('10.1.2.3')).toBe(true);
    expect(isBlockedMailHost('192.168.0.8')).toBe(true);
    expect(isBlockedMailHost('169.254.169.254')).toBe(true);
    expect(isBlockedMailHost('localhost')).toBe(true);
    expect(isBlockedMailHost('metadata.google.internal')).toBe(true);
    expect(isBlockedMailHost('mail.example.test')).toBe(false);
    expect(isBlockedMailHost('imap.gmail.com')).toBe(false);
  });

  it('strips CR/LF from mailbox credentials', () => {
    expect(stripMailCredential('user\r\nPASS injected')).toBe('userPASS injected');
    expect(stripMailCredential('pw\nQUIT')).toBe('pwQUIT');
  });
});
