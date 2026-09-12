import { connect as tlsConnect } from 'node:tls';
import { once } from 'node:events';

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
  try {
    return await withTls(req, async (reader, write) => {
      const greet = await reader.readLine(DEFAULT_TIMEOUT_MS);
      if (!greet.startsWith('*')) return false;
      write(`a1 LOGIN ${imapQuote(req.username)} ${imapQuote(req.password)}\r\n`);
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
  try {
    return await withTls(req, async (reader, write) => {
      const greet = await reader.readLine(DEFAULT_TIMEOUT_MS);
      if (!greet.startsWith('+OK')) return false;
      write(`USER ${req.username}\r\n`);
      const userRes = await reader.readLine(DEFAULT_TIMEOUT_MS);
      if (!userRes.startsWith('+OK')) return false;
      write(`PASS ${req.password}\r\n`);
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
