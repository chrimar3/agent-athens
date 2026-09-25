/**
 * Deadman signals prefer host-only records; container-writable logs are
 * untrusted (security loop round 7).
 *
 * The deadman runs on the Mac; the repo's logs/ is written by pipeline
 * containers. A compromised run could forge `deploy-success` lines in
 * logs/deploy-cadence.log to keep STALE_DEPLOY quiet, or plant a symlink/FIFO
 * there. Contract (src/watchdog/signal-sources.ts, scripts/deadman-watchdog.ts):
 *   - deploy freshness = newest non-restore line of
 *     ${AA_STATE_DIR}/deploys.log when that file exists (a malformed newest
 *     line = missing → stale; never a fallback to container logs);
 *   - without deploys.log: logs/deploy-cadence.log, labelled "from
 *     container-writable logs" in every alert;
 *   - every logs/ read bounded, symlink/non-regular refused, strict parsing,
 *     control characters stripped from quoted text.
 */
import { afterAll, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Database } from 'bun:sqlite';
import {
  LOG_READ_MAX_BYTES, authPrecheckFromLog, buildFailureCauseFromLog, deployFreshness, lastCadenceSuccessMs, readTailBounded, stripControl,
} from '../../src/watchdog/signal-sources';
import { classifyDeadman } from '../../src/watchdog/classifier';

const ROOT = join(import.meta.dir, '..', '..');
const tmpDirs: string[] = [];
afterAll(() => { for (const d of tmpDirs) rmSync(d, { recursive: true, force: true }); });
const tmp = (p = 'aa-deadman-src-') => { const d = mkdtempSync(join(tmpdir(), p)); tmpDirs.push(d); return d; };

const HASH = 'ab'.repeat(32);
const ID1 = '5f1e2d3c4b5a69788796a5b4';
const ID2 = '6a7b8c9d0e1f2a3b4c5d6e7f';

describe('deployFreshness — host record first', () => {
  test('deploys.log exists → its newest deploy line is the last deploy; a fresher forged cadence line is ignored', () => {
    const state = tmp();
    const logs = tmp();
    writeFileSync(join(state, 'deploys.log'), `2026-09-20T08:00:00Z ${ID1} ${HASH}\n2026-09-21T08:00:00Z ${ID2} ${HASH}\n`);
    writeFileSync(join(logs, 'deploy-cadence.log'), '2026-09-24T08:00:00Z deploy-success\n');
    const sig = deployFreshness(state, join(logs, 'deploy-cadence.log'));
    expect(sig.source).toBe('host-record');
    expect(sig.ms).toBe(Date.parse('2026-09-21T08:00:00Z'));
    expect(sig.label).toContain(join(state, 'deploys.log'));
    expect(sig.label).not.toContain('container-writable');
  });

  test('restore lines are not new deploys: the newest NON-restore line counts', () => {
    const state = tmp();
    writeFileSync(join(state, 'deploys.log'), `2026-09-20T08:00:00Z ${ID1} ${HASH}\n2026-09-23T09:00:00Z ${ID1} restore\n`);
    const sig = deployFreshness(state, join(tmp(), 'absent.log'));
    expect(sig.ms).toBe(Date.parse('2026-09-20T08:00:00Z'));
  });

  test('a malformed newest line (or only restores, or an empty file) → missing (stale); no fallback to the container log', () => {
    for (const body of [`2026-09-20T08:00:00Z ${ID1} ${HASH}\ngarbage\n`, `2026-09-23T09:00:00Z ${ID1} restore\n`, '']) {
      const state = tmp();
      const logs = tmp();
      writeFileSync(join(state, 'deploys.log'), body);
      writeFileSync(join(logs, 'deploy-cadence.log'), '2026-09-24T08:00:00Z deploy-success\n');
      const sig = deployFreshness(state, join(logs, 'deploy-cadence.log'));
      expect(sig.source).toBe('host-record');
      expect(sig.ms).toBeNull();
      expect(sig.label).toContain('no readable deploy line');
    }
  });

  test('no deploys.log (container setup not installed) → the cadence log, labelled as container-writable', () => {
    const logs = tmp();
    writeFileSync(join(logs, 'deploy-cadence.log'), '2026-09-22T08:00:00Z deploy-success\nnoise\n');
    const sig = deployFreshness(tmp(), join(logs, 'deploy-cadence.log'));
    expect(sig.source).toBe('container-logs');
    expect(sig.ms).toBe(Date.parse('2026-09-22T08:00:00Z'));
    expect(sig.label).toContain('from container-writable logs');
  });

  test('fallback: a symlinked cadence log is not followed (null, and the label says why)', () => {
    const logs = tmp();
    const target = join(logs, 'elsewhere.log');
    writeFileSync(target, '2026-09-22T08:00:00Z deploy-success\n');
    symlinkSync(target, join(logs, 'deploy-cadence.log'));
    const sig = deployFreshness(tmp(), join(logs, 'deploy-cadence.log'));
    expect(sig.ms).toBeNull();
    expect(sig.label).toContain('symlink');
  });

  test('the classifier quotes the source in the deploy reason', () => {
    const now = Date.parse('2026-09-24T12:00:00Z');
    const base = { lastEnrichMs: now, pipelineHealthy: true, authPrecheckOk: true, dbRowCount: 10, nowMs: now, thresholds: { deployStaleHours: 36, enrichStaleHours: 36 } };
    const stale = classifyDeadman({ ...base, lastDeployMs: now - 48 * 3_600_000, deploySource: 'logs/deploy-cadence.log — from container-writable logs' });
    expect(stale.reasons[0]).toContain('[source: logs/deploy-cadence.log — from container-writable logs]');
    const missing = classifyDeadman({ ...base, lastDeployMs: null, deploySource: 'host record /s/deploys.log: no readable deploy line' });
    expect(missing.reasons[0]).toBe('deploy: no deploy-success signal found (host record /s/deploys.log: no readable deploy line)');
    // Unchanged wording without a label (older callers):
    expect(classifyDeadman({ ...base, lastDeployMs: null }).reasons[0]).toContain('logs/deploy-cadence.log missing/empty');
  });
});

describe('container-writable logs are read as untrusted', () => {
  test('readTailBounded: missing → null; symlink → null; FIFO → null without blocking; directory → null', () => {
    const d = tmp();
    expect(readTailBounded(join(d, 'none'))).toBeNull();
    writeFileSync(join(d, 'real'), 'x\n');
    symlinkSync(join(d, 'real'), join(d, 'link'));
    expect(readTailBounded(join(d, 'link'))).toBeNull();
    const mk = Bun.spawnSync(['mkfifo', join(d, 'fifo')]);
    if (mk.exitCode === 0) expect(readTailBounded(join(d, 'fifo'))).toBeNull();
    expect(readTailBounded(d)).toBeNull();
  });

  test('readTailBounded reads only the last LOG_READ_MAX_BYTES and drops the partial first line', () => {
    const d = tmp();
    const f = join(d, 'big.log');
    const old = '2026-01-01T00:00:00Z deploy-success\n';
    const filler = 'y'.repeat(99) + '\n';
    writeFileSync(f, old + filler.repeat(Math.ceil((LOG_READ_MAX_BYTES * 2) / filler.length)) + '2026-09-22T08:00:00Z deploy-success\n');
    const text = readTailBounded(f)!;
    expect(Buffer.byteLength(text)).toBeLessThanOrEqual(LOG_READ_MAX_BYTES);
    expect(text.startsWith('y'.repeat(99) + '\n')).toBe(true);
    expect(lastCadenceSuccessMs(text)).toBe(Date.parse('2026-09-22T08:00:00Z'));
    // A success line outside the window is not seen.
    writeFileSync(f, old + filler.repeat(Math.ceil((LOG_READ_MAX_BYTES * 2) / filler.length)));
    expect(lastCadenceSuccessMs(readTailBounded(f)!)).toBeNull();
  });

  test('cadence parsing is strict: prefixes, suffixes and look-alikes do not count', () => {
    for (const line of [
      'x 2026-09-22T08:00:00Z deploy-success', '2026-09-22T08:00:00Z deploy-success now', '2026-09-22 08:00:00 deploy-success',
      '2026-09-22T08:00:00Z deploy-successful', '2026-13-45T99:99:99Z deploy-success',
    ]) {
      expect(lastCadenceSuccessMs(line + '\n')).toBeNull();
    }
  });

  test('build-failure cause: control characters stripped, capped, labelled; older than the last deploy → none', () => {
    const d = tmp();
    const f = join(d, 'build-outcome.log');
    writeFileSync(f, `2026-09-22T08:00:00Z build-failure error: gate F2b\u001b[2J\u0007 failed\u2028Bcc: x ${'z'.repeat(1000)}\n`);
    const cause = buildFailureCauseFromLog(f, Date.parse('2026-09-21T00:00:00Z'))!;
    expect(cause).toStartWith('error: gate F2b[2J failed Bcc: x');
    expect(cause).toEndWith('(from container-writable logs)');
    expect(cause).not.toMatch(/[\u0000-\u001f\u007f\u2028]/);
    expect(cause.length).toBeLessThan(400);
    expect(buildFailureCauseFromLog(f, Date.parse('2026-09-23T00:00:00Z'))).toBeNull();
    symlinkSync(f, join(d, 'link.log'));
    expect(buildFailureCauseFromLog(join(d, 'link.log'), null)).toBeNull();
  });

  test('auth pre-check: only an exact `exit=N` line counts', () => {
    const d = tmp();
    const f = join(d, 'auth.log');
    writeFileSync(f, '=== auth ===\nexit=1\n');
    expect(authPrecheckFromLog(f)).toBe(false);
    writeFileSync(f, 'exit=1\nexit=0\n');
    expect(authPrecheckFromLog(f)).toBe(true);
    writeFileSync(f, 'exit=0 but not really\nexit=0x\n');
    expect(authPrecheckFromLog(f)).toBeNull();
    expect(authPrecheckFromLog(join(d, 'none'))).toBeNull();
  });

  test('stripControl removes C0/C1, bidi and zero-width characters and caps length', () => {
    expect(stripControl('a\nb\tc\r\nd')).toBe('a b c d');
    expect(stripControl('x\u0000\u001b\u009b\u202e\u2066\u200b\ufeffy')).toBe('xy');
    expect(Array.from(stripControl('é'.repeat(50), 10)).length).toBe(10);
  });
});

describe('deadman-watchdog.ts wiring', () => {
  const src = readFileSync(join(ROOT, 'scripts', 'deadman-watchdog.ts'), 'utf8');

  test('deploy, build-failure and auth signals go through signal-sources (no raw reads of logs/)', () => {
    expect(src).toContain('deployFreshness(hostStateDir(), DEPLOY_LOG)');
    expect(src).toContain('buildFailureCauseFromLog(');
    expect(src).toContain('authPrecheckFromLog(AUTH_LOG)');
    const raw = /readFileSync\((DEPLOY_LOG|AUTH_LOG|join\(ROOT, "logs")/.test(src);
    expect(raw).toBe(false);
    expect(src).toContain('deploySource: deploy.label');
  });

  test('every reason is sanitized before delivery', () => {
    expect(src).toContain('reasons: classified.reasons.map((r) => stripControl(r, 1000))');
  });

  test('dry run end to end: with a host record the signal line says "host record" and never touches the network', () => {
    const state = tmp();
    const now = new Date();
    const at = new Date(now.getTime() - 2 * 3_600_000).toISOString().replace(/\.\d+Z$/, 'Z');
    writeFileSync(join(state, 'deploys.log'), `${at} ${ID1} ${HASH}\n`);
    mkdirSync(join(state, 'logs'));
    const dbDir = tmp();
    const dbFile = join(dbDir, 'events.db');
    const db = new Database(dbFile);
    const local = new Date(now.getTime() - 3_600_000).toISOString().slice(0, 19).replace('T', ' ');
    db.run('CREATE TABLE events (enriched_at TEXT)');
    db.run('INSERT INTO events (enriched_at) VALUES (?)', [local]);
    db.close();
    const r = Bun.spawnSync(['bun', join(ROOT, 'scripts', 'deadman-watchdog.ts')], {
      cwd: ROOT,
      env: {
        PATH: process.env.PATH ?? '/usr/bin:/bin',
        HOME: state,
        AA_STATE_DIR: state,
        DEADMAN_DRY_RUN: '1',
        DEADMAN_DB_PATH: dbFile,
        // Any accidental fetch fails fast instead of reaching the internet.
        HTTPS_PROXY: 'http://127.0.0.1:9', HTTP_PROXY: 'http://127.0.0.1:9',
      },
    });
    const out = new TextDecoder().decode(r.stdout);
    expect(out).toContain('(host record)');
    expect(out).toMatch(/deploy=2\.\dh \(host record\)/);
  });
});
