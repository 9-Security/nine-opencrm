#!/usr/bin/env node
/**
 * Diagnose Resend + Cloudflare for invite mail.
 * Does not print secrets. Does not send mail or mutate DNS unless --apply is passed
 * and the Cloudflare token has Zone.DNS Edit.
 */
import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
config({ path: resolve(root, '.env') });

const apply = process.argv.includes('--apply');
const domain =
  process.env.MAIL_DOMAIN?.trim() ||
  extractDomain(process.env.RESEND_FROM) ||
  'nine-security.com';

function extractDomain(from) {
  const match = String(from ?? '').match(/@([^>\s]+)/);
  return match?.[1]?.trim().toLowerCase() || '';
}

async function jsonFetch(url, headers) {
  const res = await fetch(url, { headers });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text.slice(0, 200) };
  }
  return { status: res.status, body };
}

function errorMessages(body) {
  if (!body || typeof body !== 'object') return [];
  if (Array.isArray(body.errors)) {
    return body.errors.map((e) => e.message || String(e.code || e));
  }
  if (body.message) return [body.message];
  if (body.name) return [body.name];
  return [];
}

async function main() {
  const resendKey = process.env.RESEND_API_KEY?.trim();
  const cfToken = process.env.CLOUDFLARE_API_TOKEN?.trim();
  const from = process.env.RESEND_FROM?.trim();

  console.log(`Sending domain: ${domain}`);
  console.log(`RESEND_FROM set: ${Boolean(from)}`);
  console.log(`Resend API key present: ${Boolean(resendKey)}`);
  console.log(`Cloudflare token present: ${Boolean(cfToken)}`);

  if (resendKey) {
    const probe = await jsonFetch('https://api.resend.com/domains', {
      Authorization: `Bearer ${resendKey}`,
    });
    if (probe.status === 401 && probe.body?.name === 'restricted_api_key') {
      console.log(
        'Resend: send-only key (expected). Verify nine-security.com in the Resend dashboard; this app will POST /emails.',
      );
    } else if (probe.status === 200) {
      const names = (probe.body?.data ?? []).map((d) => `${d.name}:${d.status}`);
      console.log(`Resend domains: ${names.join(', ') || '(none)'}`);
    } else {
      console.log(
        `Resend domains probe HTTP ${probe.status}: ${errorMessages(probe.body).join('; ') || 'unknown'}`,
      );
    }
  }

  if (!cfToken) {
    console.log('Cloudflare: skipped (no token).');
    return;
  }

  const zones = await jsonFetch(
    `https://api.cloudflare.com/client/v4/zones?name=${encodeURIComponent(domain)}`,
    { Authorization: `Bearer ${cfToken}` },
  );
  const zone = zones.body?.result?.[0];
  if (!zone) {
    console.log(
      `Cloudflare: could not read zone ${domain} (HTTP ${zones.status}). ${errorMessages(zones.body).join('; ')}`,
    );
    return;
  }
  console.log(`Cloudflare zone: ${zone.name} (${zone.status})`);

  const dns = await jsonFetch(
    `https://api.cloudflare.com/client/v4/zones/${zone.id}/dns_records?per_page=5`,
    { Authorization: `Bearer ${cfToken}` },
  );
  if (dns.status === 403 || dns.body?.success === false) {
    console.log(
      'Cloudflare DNS: token cannot list/edit records. Add Zone.DNS Edit if you want this script to upsert Resend MX/SPF/DKIM. Until then, add those records in the Cloudflare dashboard after Resend shows them.',
    );
    if (apply) {
      console.log('--apply ignored because DNS permission is missing.');
    }
    return;
  }
  console.log(
    `Cloudflare DNS: readable (${dns.body?.result_info?.total_count ?? '?'} records).`,
  );
  if (!apply) {
    console.log(
      'Re-run with --apply only after Resend returns DKIM/MX values (full-access API key).',
    );
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : 'setup failed');
  process.exit(1);
});
