/** The one email path for host alerts: msmtp with the account named in
 *  config/monitoring.json (email.msmtp_account) and the app password in
 *  ~/.msmtprc. Shared by scripts/deadman-watchdog.ts and
 *  scripts/security-alert.ts (security loop round 7) so there is still exactly
 *  one SMTP transport.
 *
 *  The message goes to msmtp on stdin and the recipient and account as
 *  separate argv entries; nothing is interpolated into a shell. The subject is
 *  forced onto one line so text in it cannot add a header, and a recipient or
 *  account that is not a plain address/name (e.g. one starting with "-", which
 *  msmtp would read as an option) is treated as not configured. */
import { existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

export interface EmailConfig {
  enabled: boolean;
  recipient: string;
  msmtp_account: string;
}

export interface SendResult {
  ok: boolean;
  /** true = not attempted (disabled or not configured); `detail` says why. */
  skipped: boolean;
  detail: string;
}

const RECIPIENT_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/;
const ACCOUNT_RE = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,63}$/;

export interface EmailDeps {
  /** Path of the msmtp config holding the app password (default ~/.msmtprc). */
  msmtprc?: string;
  /** Runs msmtp; tests pass a stub. Default: Bun.spawnSync. */
  spawn?: (argv: string[], stdin: Buffer) => { exitCode: number | null; stderr: string };
}

function defaultSpawn(argv: string[], stdin: Buffer): { exitCode: number | null; stderr: string } {
  // Bounded (security loop round 8): the deadman's wall clock cannot fire
  // while a sync call blocks, so msmtp gets its own limit.
  const p = Bun.spawnSync(argv, { stdin, stdout: 'ignore', stderr: 'pipe', timeout: 60_000, killSignal: 'SIGKILL' });
  return { exitCode: p.exitCode, stderr: new TextDecoder().decode(p.stderr).trim() };
}

/** Send one message. Never throws. */
export function sendEmail(email: EmailConfig | undefined, subject: string, body: string, deps: EmailDeps = {}): SendResult {
  const rc = deps.msmtprc ?? join(homedir(), '.msmtprc');
  if (!email?.enabled) return { ok: false, skipped: true, detail: 'email disabled in config' };
  if (!RECIPIENT_RE.test(String(email.recipient ?? '')) || !ACCOUNT_RE.test(String(email.msmtp_account ?? ''))) {
    return { ok: false, skipped: true, detail: 'email recipient or msmtp_account in config/monitoring.json is not a plain address/account name' };
  }
  if (!existsSync(rc)) return { ok: false, skipped: true, detail: '~/.msmtprc absent (app-password not set up)' };
  const oneLine = subject.replace(/[\r\n]+/g, ' ');
  const headers = `To: ${email.recipient}\nFrom: ${email.recipient}\nSubject: ${oneLine}\n\n`;
  try {
    const proc = (deps.spawn ?? defaultSpawn)(['msmtp', '-a', email.msmtp_account, email.recipient], Buffer.from(headers + body));
    if (proc.exitCode === 0) return { ok: true, skipped: false, detail: 'sent' };
    return { ok: false, skipped: false, detail: `msmtp exit ${proc.exitCode}: ${proc.stderr}` };
  } catch (e) {
    return { ok: false, skipped: false, detail: `msmtp could not be run: ${e instanceof Error ? e.message : String(e)}` };
  }
}
