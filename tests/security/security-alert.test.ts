/**
 * scripts/security-alert.ts — one security alert through the deadman's email
 * and notification path (security loop round 7).
 *
 * The regular branch's docker/integrity-check.sh calls
 *   bun run scripts/security-alert.ts -- "<message>"
 * from the repo root on the Mac, best-effort. Contract pinned here:
 *   - the message comes from argv only, control characters stripped, capped;
 *   - subject "[agent-athens security] …", one line, no header injection;
 *   - msmtp gets the account and recipient as argv and the mail on stdin;
 *   - the notification goes through osascriptNotificationArgv (argv, never
 *     AppleScript source);
 *   - exit 0 when sent or when email is disabled/not configured (reason
 *     printed), 1 when delivery failed, 2 when no message was given.
 *
 * End-to-end runs use stub `msmtp` and `osascript` on PATH and a temp HOME
 * (for ~/.msmtprc); unit runs inject the config and the transport.
 */
import { afterAll, describe, expect, test } from 'bun:test';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { messageFromArgv, runSecurityAlert, MAX_MESSAGE, SUBJECT_PREFIX, type AlertConfig } from '../../scripts/security-alert';
import { sendEmail } from '../../src/watchdog/email';

const ROOT = join(import.meta.dir, '..', '..');
const tmpDirs: string[] = [];
afterAll(() => { for (const d of tmpDirs) rmSync(d, { recursive: true, force: true }); });
const tmp = (p: string) => { const d = mkdtempSync(join(tmpdir(), p)); tmpDirs.push(d); return d; };
const CONFIG = JSON.parse(readFileSync(join(ROOT, 'config', 'monitoring.json'), 'utf8')) as AlertConfig;

/** Temp HOME (+ optional ~/.msmtprc) and a bin dir with recording stubs. */
function sandbox(opts: { msmtprc?: boolean; msmtpExit?: number } = {}) {
  const dir = tmp('aa-secalert-');
  const home = join(dir, 'home');
  const bin = join(dir, 'bin');
  mkdirSync(home);
  mkdirSync(bin);
  if (opts.msmtprc !== false) writeFileSync(join(home, '.msmtprc'), 'account gmail\n');
  writeFileSync(join(bin, 'msmtp'), `#!/bin/bash
for a in "$@"; do printf '%s\\0' "$a"; done > "${dir}/msmtp-argv"
cat > "${dir}/msmtp-stdin"
${opts.msmtpExit ? `echo "msmtp: authentication failed" >&2; exit ${opts.msmtpExit}` : 'exit 0'}
`);
  writeFileSync(join(bin, 'osascript'), `#!/bin/bash
{ for a in "$@"; do printf '%s\\0' "$a"; done; printf 'END\\0'; } >> "${dir}/osascript-calls"
`);
  chmodSync(join(bin, 'msmtp'), 0o755);
  chmodSync(join(bin, 'osascript'), 0o755);
  const read = (f: string) => (existsSync(join(dir, f)) ? readFileSync(join(dir, f), 'utf8') : null);
  return {
    dir, home, bin,
    msmtpArgv: () => read('msmtp-argv')?.split('\0').filter(Boolean) ?? null,
    msmtpStdin: () => read('msmtp-stdin'),
    /** One entry per osascript call: its arguments (argv[0] excluded). */
    notifications: () => (read('osascript-calls') ?? '').split('END\0').filter(Boolean).map((c) => c.split('\0').filter((x) => x !== '')),
  };
}

/** Exactly how docker/integrity-check.sh invokes it: from the repo root. */
function runCli(sb: ReturnType<typeof sandbox>, args: string[]) {
  const r = Bun.spawnSync(['bun', 'run', 'scripts/security-alert.ts', '--', ...args], {
    cwd: ROOT,
    env: { PATH: `${sb.bin}:${process.env.PATH}`, HOME: sb.home },
  });
  const dec = (b: Uint8Array) => new TextDecoder().decode(b);
  return { code: r.exitCode, out: dec(r.stdout), err: dec(r.stderr) };
}

describe('security-alert CLI (end to end, stub msmtp + osascript)', () => {
  test('sends one email: subject prefixed, account + recipient as argv, message on stdin; exit 0', () => {
    const sb = sandbox();
    const r = runCli(sb, ['integrity check: refs/heads/main moved during the freshness job']);
    expect(r.code).toBe(0);
    expect(r.out).toContain('security-alert: email sent');
    expect(sb.msmtpArgv()).toEqual(['-a', CONFIG.email!.msmtp_account, CONFIG.email!.recipient]);
    const mail = sb.msmtpStdin()!;
    expect(mail).toContain(`Subject: ${SUBJECT_PREFIX} integrity check: refs/heads/main moved during the freshness job\n`);
    expect(mail).toContain('\n\nintegrity check: refs/heads/main moved during the freshness job\n');
    const notes = sb.notifications();
    expect(notes.length).toBe(1);
    expect(notes[0].slice(0, 3)).toEqual(['-e', 'on run argv', '-e']);
    expect(notes[0].slice(4, 7)).toEqual(['-e', 'end run', '--']);
    expect(notes[0]).toContain('integrity check: refs/heads/main moved during the freshness job');
    expect(notes[0]).toContain('Security alert');
  });

  test('several argv words are joined; the "--" separator is not part of the message', () => {
    const sb = sandbox();
    expect(runCli(sb, ['quarantined:', 'pipeline-data', 'moved']).code).toBe(0);
    expect(sb.msmtpStdin()).toContain(`Subject: ${SUBJECT_PREFIX} quarantined: pipeline-data moved\n`);
  });

  test('hostile text: no header injection, control characters stripped, shell/AppleScript text inert', () => {
    const sb = sandbox();
    const hostile = 'x\nBcc: attacker@example.com\r\nSubject: fake\u0007\u001b[31m $(touch /tmp/aa-pwned) `id` " & (do shell script "id") & "\u202e';
    const r = runCli(sb, [hostile]);
    expect(r.code).toBe(0);
    const mail = sb.msmtpStdin()!;
    const headerBlock = mail.slice(0, mail.indexOf('\n\n'));
    expect(headerBlock.split('\n').map((l) => l.split(':')[0])).toEqual(['To', 'From', 'Subject']);
    expect(mail).not.toMatch(/[\u0000-\u0008\u000b-\u001f\u007f\u202e]/);
    expect(mail).not.toContain('\nBcc:');
    expect(mail).toContain('$(touch /tmp/aa-pwned)');         // delivered as data, not run
    expect(existsSync('/tmp/aa-pwned')).toBe(false);
    for (const item of sb.notifications()[0]) expect(item).not.toMatch(/[\u0000-\u001f\u202e]/);
  });

  test('the message is capped at MAX_MESSAGE characters, the subject at one short line', () => {
    const sb = sandbox();
    expect(runCli(sb, ['A'.repeat(10_000)]).code).toBe(0);
    const mail = sb.msmtpStdin()!;
    const subject = mail.split('\n').find((l) => l.startsWith('Subject: '))!;
    expect(subject.length).toBeLessThanOrEqual('Subject: '.length + SUBJECT_PREFIX.length + 1 + 120);
    const body = mail.slice(mail.indexOf('\n\n') + 2);
    expect(body.split('\n')[0].length).toBe(MAX_MESSAGE);
  });

  test('no ~/.msmtprc (email not set up) → exit 0, says why, msmtp never run; the notification still fires', () => {
    const sb = sandbox({ msmtprc: false });
    const r = runCli(sb, ['something happened']);
    expect(r.code).toBe(0);
    expect(r.out).toContain('email not sent — ~/.msmtprc absent');
    expect(r.out).toContain('Alert: something happened');
    expect(sb.msmtpArgv()).toBeNull();
    expect(sb.notifications().length).toBe(1);
  });

  test('msmtp fails → exit 1, EMAIL DELIVERY FAILED on stderr, a second (escalation) notification', () => {
    const sb = sandbox({ msmtpExit: 78 });
    const r = runCli(sb, ['something happened']);
    expect(r.code).toBe(1);
    expect(r.err).toContain('EMAIL DELIVERY FAILED');
    expect(r.err).toContain('msmtp exit 78');
    const notes = sb.notifications();
    expect(notes.length).toBe(2);
    expect(notes[1].join(' ')).toContain('EMAIL DELIVERY FAILED');
  });

  test('no message (or only control characters) → exit 2, nothing sent', () => {
    for (const args of [[], [''], ['\n\t\u0007']]) {
      const sb = sandbox();
      const r = runCli(sb, args);
      expect(r.code).toBe(2);
      expect(r.err).toContain('usage');
      expect(sb.msmtpArgv()).toBeNull();
      expect(sb.notifications()).toEqual([]);
    }
  });
});

describe('runSecurityAlert (injected config and transport)', () => {
  const quiet = { out: () => {}, err: () => {} };

  test('email disabled in config → exit 0 and the reason is printed; transport never called', () => {
    const lines: string[] = [];
    let spawned = 0;
    const code = runSecurityAlert(['--', 'x'], {
      config: () => ({ notify: { enabled: false }, email: { enabled: false, recipient: 'a@b.co', msmtp_account: 'gmail' } }),
      email: { msmtprc: '/nonexistent', spawn: () => { spawned++; return { exitCode: 0, stderr: '' }; } },
      out: (l) => lines.push(l),
      err: () => {},
    });
    expect(code).toBe(0);
    expect(lines.join('\n')).toContain('email disabled in config');
    expect(spawned).toBe(0);
  });

  test('unreadable config → exit 0 ("not configured"), notification still sent', () => {
    const notes: string[][] = [];
    const lines: string[] = [];
    const code = runSecurityAlert(['x'], {
      config: () => { throw new SyntaxError('bad json'); },
      notify: (argv) => notes.push(argv),
      out: (l) => lines.push(l),
      err: () => {},
    });
    expect(code).toBe(0);
    expect(lines.join('\n')).toContain('config/monitoring.json unreadable');
    expect(notes.length).toBe(1);
  });

  test('a recipient or account msmtp could read as an option is "not configured", never passed to msmtp', () => {
    for (const email of [
      { enabled: true, recipient: '-X/tmp/log', msmtp_account: 'gmail' },
      { enabled: true, recipient: 'a@b.co', msmtp_account: '--read-envelope-from' },
      { enabled: true, recipient: 'a@b.co\nBcc: c@d.co', msmtp_account: 'gmail' },
    ]) {
      let spawned = 0;
      const code = runSecurityAlert(['x'], {
        config: () => ({ notify: { enabled: false }, email }),
        email: { msmtprc: import.meta.path, spawn: () => { spawned++; return { exitCode: 0, stderr: '' }; } },
        ...quiet,
      });
      expect(code).toBe(0);
      expect(spawned).toBe(0);
    }
  });

  test('notify.enabled=false → no notification; the email still goes', () => {
    const notes: string[][] = [];
    let stdin = '';
    const code = runSecurityAlert(['x'], {
      config: () => ({ notify: { enabled: false }, email: { enabled: true, recipient: 'a@b.co', msmtp_account: 'gmail' } }),
      notify: (argv) => notes.push(argv),
      email: { msmtprc: import.meta.path, spawn: (_argv, s) => { stdin = s.toString(); return { exitCode: 0, stderr: '' }; } },
      ...quiet,
    });
    expect(code).toBe(0);
    expect(notes).toEqual([]);
    expect(stdin).toContain(`Subject: ${SUBJECT_PREFIX} x\n`);
  });

  test('a transport that throws (msmtp not installed) → exit 1, never a crash', () => {
    const code = runSecurityAlert(['x'], {
      config: () => ({ notify: { enabled: false }, email: { enabled: true, recipient: 'a@b.co', msmtp_account: 'gmail' } }),
      email: { msmtprc: import.meta.path, spawn: () => { throw new Error('ENOENT'); } },
      ...quiet,
    });
    expect(code).toBe(1);
  });

  test('messageFromArgv strips a leading "--" only', () => {
    expect(messageFromArgv(['--', 'a', 'b'])).toBe('a b');
    expect(messageFromArgv(['a', '--', 'b'])).toBe('a -- b');
  });
});

describe('one email transport (the deadman and security-alert share it)', () => {
  test('the deadman sends through src/watchdog/email.ts and no longer spawns msmtp itself', () => {
    const deadman = readFileSync(join(ROOT, 'scripts', 'deadman-watchdog.ts'), 'utf8');
    expect(deadman).toContain('from "../src/watchdog/email"');
    expect(deadman).not.toMatch(/["']msmtp["']/);
    const alert = readFileSync(join(ROOT, 'scripts', 'security-alert.ts'), 'utf8');
    expect(alert).not.toMatch(/["']msmtp["']/);
  });

  test('sendEmail keeps the deadman contract: disabled → skipped, no rc → skipped', () => {
    expect(sendEmail({ enabled: false, recipient: 'a@b.co', msmtp_account: 'gmail' }, 's', 'b')).toEqual({ ok: false, skipped: true, detail: 'email disabled in config' });
    expect(sendEmail({ enabled: true, recipient: 'a@b.co', msmtp_account: 'gmail' }, 's', 'b', { msmtprc: '/nonexistent/.msmtprc' }).skipped).toBe(true);
  });

  test('the path-guard lists the CLI (it sends mail as the owner)', () => {
    const guard = JSON.parse(readFileSync(join(ROOT, '.github', 'path-guard.json'), 'utf8')) as { protected: string[] };
    expect(guard.protected).toContain('scripts/security-alert.ts');
  });
});
