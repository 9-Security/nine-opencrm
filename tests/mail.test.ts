import { afterEach, describe, expect, it, vi } from 'vitest';
import { inviteJoinUrl, publicAppOrigin } from '@/lib/app-origin';
import { buildInviteEmail } from '@/lib/invite-mail';
import { scrubLogFields } from '@/lib/log';
import { mailConfigured, sendEmail } from '@/lib/mail';
import { clientIp } from '@/lib/request-ip';

const originalEnv = {
  AUTH_URL: process.env.AUTH_URL,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  RESEND_FROM: process.env.RESEND_FROM,
};

afterEach(() => {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('invite mail helpers', () => {
  it('builds invite links from AUTH_URL instead of the request origin', () => {
    process.env.AUTH_URL = 'https://crm.nine-security.com';
    const req = new Request('http://127.0.0.1:3000/api/invites');
    expect(publicAppOrigin(req)).toBe('https://crm.nine-security.com');
    expect(inviteJoinUrl(req, 'abc123abc123abc123abc123abc123ab')).toBe(
      'https://crm.nine-security.com/invites/abc123abc123abc123abc123abc123ab',
    );
  });

  it('skips Resend when no API key is configured', async () => {
    delete process.env.RESEND_API_KEY;
    expect(mailConfigured()).toBe(false);
    await expect(
      sendEmail({ to: 'a@example.com', subject: 'Hi', html: '<p>Hi</p>', text: 'Hi' }),
    ).resolves.toEqual({ sent: false, reason: 'not_configured' });
  });

  it('posts invite mail to Resend without throwing on HTTP errors', async () => {
    process.env.RESEND_API_KEY = 're_test_key';
    process.env.RESEND_FROM = 'Nine CRM <no-reply@nine-security.com>';
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ id: 'email_1' }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const payload = buildInviteEmail({
      tenantName: 'Acme <test>',
      role: 'sales',
      inviteUrl: 'https://crm.example/invites/abcd1234abcd1234abcd1234abcd1234',
      to: 'new@example.com',
    });
    await expect(sendEmail(payload)).resolves.toEqual({ sent: true, id: 'email_1' });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({ method: 'POST' }),
    );
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(init.body));
    expect(body.to).toEqual(['new@example.com']);
    expect(body.html).toContain('Acme &lt;test&gt;');
    expect(body.html).not.toContain('Acme <test>');
  });

  it('redacts invite URLs and tokens in request logs', () => {
    const scrubbed = scrubLogFields({
      message: 'invite.created',
      invite_email: 'new@example.com',
      invite_url: 'https://crm.example/invites/abcd1234abcd1234abcd1234abcd1234',
      note: 'open https://crm.example/invites/abcd1234abcd1234abcd1234abcd1234',
      token: 'raw-token',
    });
    expect(scrubbed.invite_email).toBe('new@example.com');
    expect(scrubbed.invite_url).toBe('[redacted]');
    expect(scrubbed.note).toBe('[redacted]');
    expect(scrubbed.token).toBe('[redacted]');
  });

  it('prefers Cloudflare connecting IP over a spoofed forwarded chain', () => {
    const req = new Request('http://localhost/api/auth/first-factor', {
      headers: {
        'x-forwarded-for': '1.1.1.1, 10.0.0.1',
        'cf-connecting-ip': '9.9.9.9',
      },
    });
    expect(clientIp(req)).toBe('9.9.9.9');
    const noCf = new Request('http://localhost/api/auth/first-factor', {
      headers: { 'x-forwarded-for': '1.1.1.1, 10.0.0.1' },
    });
    expect(clientIp(noCf)).toBe('10.0.0.1');
  });
});
