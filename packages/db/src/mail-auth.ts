import { connect as tlsConnect } from 'node:tls';
import { once } from 'node:events';
import { BlockList, isIP } from 'node:net';
import { lookup } from 'node:dns/promises';

export type MailProtocol = 'imap' | 'pop3';

export type MailTarget = {
  protocol: MailProtocol;
  host: string;
  port: number;
};

export type MailAuthRequest = MailTarget & {
  username: string;
  password: string;
};

const DEFAULT_TIMEOUT_MS = 8_000;
const MAX_MAIL_TARGETS = 3;

const blockedNets = new BlockList();
blockedNets.addSubnet('0.0.0.0', 8, 'ipv4');
blockedNets.addSubnet('10.0.0.0', 8, 'ipv4');
blockedNets.addSubnet('100.64.0.0', 10, 'ipv4');
blockedNets.addSubnet('127.0.0.0', 8, 'ipv4');
blockedNets.addSubnet('169.254.0.0', 16, 'ipv4');
blockedNets.addSubnet('172.16.0.0', 12, 'ipv4');
blockedNets.addSubnet('192.0.0.0', 24, 'ipv4');
blockedNets.addSubnet('192.168.0.0', 16, 'ipv4');
blockedNets.addSubnet('198.18.0.0', 15, 'ipv4');
blockedNets.addSubnet('224.0.0.0', 4, 'ipv4');
blockedNets.addAddress('::1', 'ipv6');
blockedNets.addAddress('::', 'ipv6');
blockedNets.addSubnet('fc00::', 7, 'ipv6');
blockedNets.addSubnet('fe80::', 10, 'ipv6');
blockedNets.addSubnet('ff00::', 8, 'ipv6');

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'metadata.google.internal',
  'metadata.google.com',
  'instance-data',
]);

function allowPrivateMailHosts() {
  return process.env.MAIL_AUTH_ALLOW_PRIVATE === 'true';
}

function normalizeHost(host: string) {
  return host
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '');
}

export function stripMailCredential(value: string) {
  return value.replace(/[\0\r\n]/g, '');
}

export function isBlockedIp(address: string) {
  const type = isIP(address);
  if (type === 4) return blockedNets.check(address, 'ipv4');
  if (type === 6) {
    const lower = address.toLowerCase();
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped?.[1]) return blockedNets.check(mapped[1], 'ipv4');
    return blockedNets.check(address, 'ipv6');
  }
  return true;
}

export function isBlockedMailHost(host: string) {
  const normalized = normalizeHost(host);
  if (!normalized) return false;
  if (BLOCKED_HOSTNAMES.has(normalized)) return true;
  if (
    normalized.endsWith('.localhost') ||
    normalized.endsWith('.local') ||
    normalized.endsWith('.internal')
  ) {
    return true;
  }
  if (isIP(normalized)) return isBlockedIp(normalized);
  return false;
}

export async function mailHostIsSafe(host: string): Promise<boolean> {
  if (allowPrivateMailHosts()) return true;
  const normalized = normalizeHost(host);
  if (!normalized) return false;
  if (isBlockedMailHost(normalized)) return false;
  if (isIP(normalized)) return true;
  try {
    const addrs = await lookup(normalized, { all: true });
    if (addrs.length === 0) return false;
    return !addrs.some((entry) => isBlockedIp(entry.address));
  } catch {
    return false;
  }
}

export function filterMailTargets(targets: MailTarget[]): MailTarget[] {
  const seen = new Set<string>();
  const out: MailTarget[] = [];
  for (const target of targets) {
    const host = target.host.trim();
    if (!host) continue;
    if (!allowPrivateMailHosts() && isBlockedMailHost(host)) continue;
    const key = `${target.protocol}:${host.toLowerCase()}:${target.port}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...target, host });
    if (out.length >= MAX_MAIL_TARGETS) break;
  }
  return out;
}

function tlsInsecure() {
  return process.env.MAIL_AUTH_TLS_INSECURE === 'true';
}

function imapQuote(value: string) {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

class LineReader {
  private buf = '';
  constructor(private readonly socket: NodeJS.ReadableStream) {}

  async readLine(timeoutMs: number): Promise<string> {
    if (this.buf.includes('\n')) {
      return this.takeLine();
    }
    return new Promise((resolve, reject) => {
      const onData = (chunk: Buffer) => {
        this.buf += chunk.toString('utf8');
        if (this.buf.includes('\n')) {
          cleanup();
          resolve(this.takeLine());
        }
      };
      const onErr = (err: Error) => {
        cleanup();
        reject(err);
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('mail auth timeout'));
      }, timeoutMs);
      const cleanup = () => {
        clearTimeout(timer);
        this.socket.off('data', onData);
        this.socket.off('error', onErr);
      };
      this.socket.on('data', onData);
      this.socket.on('error', onErr);
    });
  }

  private takeLine() {
    const idx = this.buf.indexOf('\n');
    const line = this.buf.slice(0, idx);
    this.buf = this.buf.slice(idx + 1);
    return line.replace(/\r$/, '');
  }
}

async function withTls<T>(
  target: MailTarget,
  fn: (reader: LineReader, write: (s: string) => void) => Promise<T>,
): Promise<T> {
  const socket = tlsConnect({
    host: target.host,
    port: target.port,
    servername: target.host,
    rejectUnauthorized: !tlsInsecure(),
  });
  socket.setTimeout(DEFAULT_TIMEOUT_MS);
  try {
    await Promise.race([
      once(socket, 'secureConnect'),
      once(socket, 'timeout').then(() => {
        throw new Error('mail auth timeout');
      }),
    ]);
    const reader = new LineReader(socket);
    const write = (s: string) => {
      socket.write(s);
    };
    return await fn(reader, write);
  } finally {
    socket.destroy();
  }
}

export async function authenticateImaps(req: MailAuthRequest): Promise<boolean> {
  if (!(await mailHostIsSafe(req.host))) return false;
  const username = stripMailCredential(req.username);
  const password = stripMailCredential(req.password);
  if (!username || !password) return false;
  try {
    return await withTls(req, async (reader, write) => {
      const greet = await reader.readLine(DEFAULT_TIMEOUT_MS);
      if (!greet.startsWith('*')) return false;
      write(`a1 LOGIN ${imapQuote(username)} ${imapQuote(password)}\r\n`);
      for (;;) {
        const line = await reader.readLine(DEFAULT_TIMEOUT_MS);
        if (line.startsWith('a1 ')) {
          return /\ba1 OK\b/i.test(line);
        }
      }
    });
  } catch {
    return false;
  }
}

export async function authenticatePop3s(req: MailAuthRequest): Promise<boolean> {
  if (!(await mailHostIsSafe(req.host))) return false;
  const username = stripMailCredential(req.username);
  const password = stripMailCredential(req.password);
  if (!username || !password) return false;
  try {
    return await withTls(req, async (reader, write) => {
      const greet = await reader.readLine(DEFAULT_TIMEOUT_MS);
      if (!greet.startsWith('+OK')) return false;
      write(`USER ${username}\r\n`);
      const userRes = await reader.readLine(DEFAULT_TIMEOUT_MS);
      if (!userRes.startsWith('+OK')) return false;
      write(`PASS ${password}\r\n`);
      const passRes = await reader.readLine(DEFAULT_TIMEOUT_MS);
      write('QUIT\r\n');
      return passRes.startsWith('+OK');
    });
  } catch {
    return false;
  }
}

export async function authenticateMail(req: MailAuthRequest): Promise<boolean> {
  if (!req.host || !req.username || !req.password) return false;
  if (req.protocol === 'imap') return authenticateImaps(req);
  return authenticatePop3s(req);
}

export type MailAuthenticator = (req: MailAuthRequest) => Promise<boolean>;

let override: MailAuthenticator | null = null;

export function setMailAuthenticator(fn: MailAuthenticator | null) {
  override = fn;
}

export function mailAuthenticator(): MailAuthenticator {
  return override ?? authenticateMail;
}

export function envMailTargets(): MailTarget[] {
  const targets: MailTarget[] = [];
  const imapHost = process.env.MAIL_AUTH_IMAP_HOST?.trim();
  const popHost = process.env.MAIL_AUTH_POP3_HOST?.trim();
  if (imapHost) {
    targets.push({
      protocol: 'imap',
      host: imapHost,
      port: Number(process.env.MAIL_AUTH_IMAP_PORT) || 993,
    });
  }
  if (popHost) {
    targets.push({
      protocol: 'pop3',
      host: popHost,
      port: Number(process.env.MAIL_AUTH_POP3_PORT) || 995,
    });
  }
  return targets;
}
