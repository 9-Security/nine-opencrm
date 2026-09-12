import { ROLE_LABELS, type Role } from '@crm/shared';
import { sendEmail, type SendEmailResult } from './mail';

export function buildInviteEmail(params: {
  tenantName: string;
  role: Role;
  inviteUrl: string;
  to: string;
}) {
  const role = ROLE_LABELS[params.role];
  const tenant = params.tenantName.trim() || 'Nine CRM';
  const subject = `邀請你加入 ${tenant}（Nine CRM）`;
  const text = [
    `你被邀請以「${role}」身分加入 ${tenant}。`,
    '',
    '請用這個 Email 開啟連結，註冊或登入後即可加入（連結 7 天內有效）：',
    params.inviteUrl,
    '',
    '若不是你本人，請忽略這封信。',
  ].join('\n');
  const html = `<!doctype html>
<html lang="zh-Hant">
  <body style="font-family: ui-sans-serif, system-ui, sans-serif; color: #0f172a; line-height: 1.5;">
    <p>你被邀請以「${escapeHtml(role)}」身分加入 <strong>${escapeHtml(tenant)}</strong>。</p>
    <p>請用這個 Email 開啟連結，註冊或登入後即可加入（連結 7 天內有效）：</p>
    <p><a href="${escapeHtml(params.inviteUrl)}">${escapeHtml(params.inviteUrl)}</a></p>
    <p style="color:#64748b;font-size:13px;">若不是你本人，請忽略這封信。</p>
  </body>
</html>`;
  return { to: params.to, subject, html, text };
}

export async function sendInviteEmail(params: {
  tenantName: string;
  role: Role;
  inviteUrl: string;
  to: string;
}): Promise<SendEmailResult> {
  return sendEmail(buildInviteEmail(params));
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
