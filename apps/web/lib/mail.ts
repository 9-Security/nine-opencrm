export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export type SendEmailResult =
  { sent: true; id: string } | { sent: false; reason: 'not_configured' | 'failed' };

const DEFAULT_FROM = 'Nine CRM <no-reply@nine-security.com>';

export function mailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

export function mailFromAddress(): string {
  return process.env.RESEND_FROM?.trim() || DEFAULT_FROM;
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    return { sent: false, reason: 'not_configured' };
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: mailFromAddress(),
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
    });
    if (!res.ok) {
      return { sent: false, reason: 'failed' };
    }
    const body = (await res.json().catch(() => ({}))) as { id?: string };
    return { sent: true, id: body.id ?? 'unknown' };
  } catch {
    return { sent: false, reason: 'failed' };
  }
}
