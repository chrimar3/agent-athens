/**
 * tests/dependency-audit.test.ts — the blocking `dependency-audit` job.
 *
 * .github/scripts/dependency-audit.sh runs `bun audit --audit-level=high` with
 * one --ignore per entry of .github/audit-ignore.json. Every ignore must carry
 * a package, a reason and a review_by date; a malformed or expired entry fails
 * the job BEFORE the audit runs, so an ignore cannot quietly outlive its
 * reason. A fake `bun` (BUN_BIN) records its argv and exits as told; the real
 * audit needs the registry and is not run here.
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync, chmodSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const ROOT = join(import.meta.dir, '..');
const SCRIPT = join(ROOT, '.github', 'scripts', 'dependency-audit.sh');
const SHIPPED = join(ROOT, '.github', 'audit-ignore.json');

let work: string;
beforeAll(() => { work = mkdtempSync(join(tmpdir(), 'aa-dep-audit-')); });
afterAll(() => { rmSync(work, { recursive: true, force: true }); });
let seq = 0;

const ENTRY = {
  id: 'GHSA-jmr9-qjv8-65gv', package: 'extract-zip', severity: 'high',
  reason: 'No patched release exists; reached only when puppeteer unpacks its own browser download.',
  review_by: '2026-12-31',
};

function setup(list: unknown, bunExit = 0) {
  const dir = join(work, `t-${seq++}`);
  require('fs').mkdirSync(dir, { recursive: true });
  const ignore = join(dir, 'audit-ignore.json');
  writeFileSync(ignore, typeof list === 'string' ? list : JSON.stringify(list));
  const bun = join(dir, 'fake-bun');
  const log = join(dir, 'argv.log');
  writeFileSync(bun, `#!/bin/bash\nprintf '%s\\n' "$@" > "${log}"\nexit ${bunExit}\n`);
  chmodSync(bun, 0o755);
  return { ignore, bun, log };
}

function run(s: { ignore: string; bun: string }, today = '2026-09-23') {
  const r = Bun.spawnSync(['bash', SCRIPT], {
    cwd: ROOT,
    env: { PATH: process.env.PATH ?? '/usr/bin:/bin', BUN_BIN: s.bun, AUDIT_IGNORE_FILE: s.ignore, AUDIT_TODAY: today },
  });
  const dec = (b: Uint8Array) => new TextDecoder().decode(b);
  return { code: r.exitCode, out: dec(r.stdout), err: dec(r.stderr) };
}

const argv = (log: string) => (existsSync(log) ? readFileSync(log, 'utf-8').split('\n').filter(Boolean) : []);

describe('dependency-audit.sh', () => {
  test('runs bun audit at level high with one --ignore per listed advisory, and passes its exit code through', () => {
    const s = setup({ ignore: [ENTRY, { ...ENTRY, id: 'GHSA-7pqw-9j4j-h8q3' }] });
    const r = run(s);
    expect(r.code).toBe(0);
    expect(argv(s.log)).toEqual(['audit', '--audit-level=high', '--ignore=GHSA-jmr9-qjv8-65gv', '--ignore=GHSA-7pqw-9j4j-h8q3']);
    const failing = setup({ ignore: [ENTRY] }, 1);
    const f = run(failing);
    expect(f.code).toBe(1);
    expect(f.err).toContain('high or critical advisories');
  });

  test('an empty ignore list runs the plain blocking audit', () => {
    const s = setup({ ignore: [] });
    expect(run(s).code).toBe(0);
    expect(argv(s.log)).toEqual(['audit', '--audit-level=high']);
  });

  test('an entry without a real reason, package or review date is refused before the audit runs', () => {
    for (const bad of [{ ...ENTRY, reason: '' }, { ...ENTRY, reason: 'wontfix' }, { ...ENTRY, package: '' }, { ...ENTRY, review_by: 'soon' }]) {
      const s = setup({ ignore: [bad] });
      const r = run(s);
      expect(r.code).toBe(1);
      expect(argv(s.log)).toEqual([]);
    }
  });

  test('an expired ignore fails the job (re-review, do not let it rot)', () => {
    const s = setup({ ignore: [ENTRY] });
    const r = run(s, '2027-01-01');
    expect(r.code).toBe(1);
    expect(r.err).toContain('expired');
    expect(argv(s.log)).toEqual([]);
  });

  test('ids must be GHSA or CVE ids (no flag or shell smuggling)', () => {
    for (const id of ['--audit-level=critical', 'GHSA-jmr9 --x', 'x']) {
      const s = setup({ ignore: [{ ...ENTRY, id }] });
      expect(run(s).code).toBe(1);
      expect(argv(s.log)).toEqual([]);
    }
  });

  test('an unreadable ignore file fails closed', () => {
    const s = setup('{not json');
    expect(run(s).code).toBe(1);
    expect(argv(s.log)).toEqual([]);
  });
});

describe('.github/audit-ignore.json — the shipped list', () => {
  const list = JSON.parse(readFileSync(SHIPPED, 'utf-8')) as { ignore: Array<Record<string, string>> };

  test('every entry names the advisory, package and severity, and says why and until when', () => {
    for (const e of list.ignore) {
      expect(e.id).toMatch(/^(GHSA(-[23456789cfghjmpqrvwx]{4}){3}|CVE-\d{4}-\d{4,})$/);
      expect(e.package.length).toBeGreaterThan(0);
      expect(['high', 'critical']).toContain(e.severity);
      expect(e.reason.length).toBeGreaterThan(40);
      expect(e.review_by).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  // Expiry is deliberately NOT checked here: a review_by date passing must fail
  // the weekly dependency-audit job, not every unrelated PR's ci run.
  test('the shipped list passes the script\'s own shape validation', () => {
    const s = setup(readFileSync(SHIPPED, 'utf-8'));
    const r = run(s, '2000-01-01');
    expect(r.err).not.toContain('REFUSED');
    expect(r.code).toBe(0);
  });
});
