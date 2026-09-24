import { describe, test, expect } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, readFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { planResponse, executeActions, lastKnownGoodDeploy, type ResponderState } from '../src/watchdog/responders';
import type { DeadmanResult } from '../src/watchdog/classifier';

const HOUR = 3_600_000;
const now = 1_700_000_000_000;
const fresh: ResponderState = { lastActionMs: {} };
const result = (status: string, reasons: string[] = []): DeadmanResult =>
  ({ status, reasons }) as DeadmanResult;
const GOOD_ID = '64f0c0ffee0123456789abcd';
const GOOD_HASH = 'cd'.repeat(32);

describe('planResponse', () => {
  test('STALE_DEPLOY plans a restore of the last host-verified deploy — never a redeploy of dist/', () => {
    const a = planResponse(result('STALE_DEPLOY'), fresh, now);
    expect(a.map((x) => x.kind)).toEqual(['RESTORE_KNOWN_GOOD']);
    expect(a[0].summary).not.toMatch(/current dist/);
  });

  test('STALE_ENRICH plans an auth check, never a deploy action', () => {
    const a = planResponse(result('STALE_ENRICH'), fresh, now);
    expect(a.map((x) => x.kind)).toContain('AUTH_CHECK');
    expect(a.map((x) => x.kind)).not.toContain('RESTORE_KNOWN_GOOD');
  });

  test('SOURCE_DEAD plans quarantine proposals per source named in reasons', () => {
    const a = planResponse(
      result('SOURCE_DEAD', ['source: clubber returned 0 events / failed for ≥3 consecutive runs (SOURCE_DEAD)']),
      fresh,
      now,
    );
    const q = a.find((x) => x.kind === 'QUARANTINE_SOURCE');
    expect(q?.target).toBe('clubber');
  });

  test('DB_MISSING plans NO automated action (restore is human-only) but a queue entry', () => {
    const a = planResponse(result('DB_MISSING'), fresh, now);
    expect(a.map((x) => x.kind)).not.toContain('RESTORE_KNOWN_GOOD');
    expect(a.map((x) => x.kind)).toContain('QUEUE_ENTRY');
  });

  test('cooldown: same action within 12h is suppressed', () => {
    const state: ResponderState = { lastActionMs: { RESTORE_KNOWN_GOOD: now - 2 * HOUR } };
    expect(planResponse(result('STALE_DEPLOY'), state, now)).toEqual([]);
  });

  test('cooldown expired (>12h) → action planned again', () => {
    const state: ResponderState = { lastActionMs: { RESTORE_KNOWN_GOOD: now - 13 * HOUR } };
    expect(planResponse(result('STALE_DEPLOY'), state, now).length).toBeGreaterThan(0);
  });

  test('OK plans nothing', () => {
    expect(planResponse(result('OK'), fresh, now)).toEqual([]);
  });
});

describe('lastKnownGoodDeploy (host-only deploys.log)', () => {
  const file = (body: string) => {
    const d = mkdtempSync(join(tmpdir(), 'aa-deploys-'));
    writeFileSync(join(d, 'deploys.log'), body);
    return join(d, 'deploys.log');
  };

  test('returns the most recent well-formed line', () => {
    const p = file(`2026-09-20T08:00:00Z aaaaaaaaaaaaaaaaaaaaaaaa ${'ab'.repeat(32)}\n2026-09-21T08:00:00Z ${GOOD_ID} ${GOOD_HASH}\n\n`);
    expect(lastKnownGoodDeploy(p)).toEqual({ at: '2026-09-21T08:00:00Z', deployId: GOOD_ID, distHash: GOOD_HASH });
  });

  test('missing or empty file → null', () => {
    expect(lastKnownGoodDeploy(join(tmpdir(), 'no-such-dir-aa', 'deploys.log'))).toBeNull();
    expect(lastKnownGoodDeploy(file(''))).toBeNull();
  });

  test('restore records written by docker/aa-run.sh restore are skipped (round 6)', () => {
    const p = file(`2026-09-21T08:00:00Z ${GOOD_ID} ${GOOD_HASH}\n2026-09-22T09:00:00Z ${GOOD_ID} restore\n`);
    expect(lastKnownGoodDeploy(p)).toEqual({ at: '2026-09-21T08:00:00Z', deployId: GOOD_ID, distHash: GOOD_HASH });
    // A malformed "restore" line is not a restore record: still null.
    expect(lastKnownGoodDeploy(file(`2026-09-21T08:00:00Z ${GOOD_ID} ${GOOD_HASH}\n2026-09-22T09:00:00Z ../x restore\n`))).toBeNull();
  });

  test('a malformed LAST line → null (never silently falls back to an older entry)', () => {
    expect(lastKnownGoodDeploy(file(`2026-09-21T08:00:00Z ${GOOD_ID} ${GOOD_HASH}\ngarbage line\n`))).toBeNull();
    expect(lastKnownGoodDeploy(file(`2026-09-21T08:00:00Z ../../x ${GOOD_HASH}\n`))).toBeNull();
    expect(lastKnownGoodDeploy(file(`2026-09-21T08:00:00Z ${GOOD_ID} nothex\n`))).toBeNull();
  });
});

describe('executeActions', () => {
  // Security loop round 5: RESTORE_KNOWN_GOOD no longer needs a Netlify login
  // on the host. It runs the container job `bash docker/aa-run.sh restore <id>`
  // (exit 0 = restored and verified by the job) and stays alert-only when that
  // wrapper is not installed.
  interface Stub { dir: string; statePath: string; stateDir: string; bin: string; calls: string; netlifyCalls: string; sentinel: string }
  /** Stub project + host state dir. The project carries a scripts/redeploy.sh
   *  that drops a sentinel if anything ever runs it, a decoy
   *  .netlify/state.json (container-writable), optionally a fake
   *  docker/aa-run.sh that logs its argv, and a fake `netlify` on PATH that
   *  logs if the host CLI is ever called. */
  function stubProject(opts: { aaRun?: boolean; aaRunRc?: number; aaRunSleep?: number } = {}): Stub {
    const dir = mkdtempSync(join(tmpdir(), 'aa-resp-'));
    for (const d of ['config', 'scripts', '.netlify', 'bin']) mkdirSync(join(dir, d), { recursive: true });
    const sentinel = join(dir, 'REDEPLOY-RAN');
    writeFileSync(join(dir, 'scripts', 'redeploy.sh'), `#!/bin/bash\ntouch "${sentinel}"\nexit 0\n`);
    chmodSync(join(dir, 'scripts', 'redeploy.sh'), 0o755);
    writeFileSync(join(dir, '.netlify', 'state.json'), '{"siteId":"decoy-site"}\n');
    const stateDir = join(dir, 'host-state');
    mkdirSync(stateDir);
    const calls = join(dir, 'aa-run-calls.log');
    if (opts.aaRun ?? true) {
      mkdirSync(join(dir, 'docker'));
      writeFileSync(join(dir, 'docker', 'aa-run.sh'), `#!/bin/bash
printf '%s\\n' "$*" >> "${calls}"
${opts.aaRunSleep ? `sleep ${opts.aaRunSleep}` : ''}
echo "hostile <b>output</b> from the container" >&2
exit ${opts.aaRunRc ?? 0}
`);
    }
    const bin = join(dir, 'bin');
    const netlifyCalls = join(dir, 'netlify-calls.log');
    writeFileSync(join(bin, 'netlify'), `#!/bin/bash\necho "$*" >> "${netlifyCalls}"\necho '{}'\n`);
    chmodSync(join(bin, 'netlify'), 0o755);
    return { dir, statePath: join(stateDir, 'responder-state.json'), stateDir, bin, calls, netlifyCalls, sentinel };
  }
  const record = (s: Stub, body = `2026-09-21T08:00:00Z ${GOOD_ID} ${GOOD_HASH}\n`) =>
    writeFileSync(join(s.stateDir, 'deploys.log'), body);
  const callsOf = (s: Stub) => (existsSync(s.calls) ? readFileSync(s.calls, 'utf8') : '');
  /** Runs with the stub's bin first on PATH, so a host `netlify` call would be logged. */
  async function withPath<T>(s: Stub, fn: () => Promise<T>): Promise<T> {
    const prev = process.env.PATH;
    process.env.PATH = `${s.bin}:${prev}`;
    try { return await fn(); } finally { process.env.PATH = prev; }
  }
  const exec = (s: Stub, extra: { restoreTimeoutMs?: number } = {}) =>
    withPath(s, () => executeActions([{ kind: 'RESTORE_KNOWN_GOOD', summary: 's' }], {
      dryRun: false, statePath: s.statePath, projectDir: s.dir, stateDir: s.stateDir, ...extra,
    }));
  const noHostNetlify = (s: Stub) => expect(existsSync(s.netlifyCalls)).toBe(false);

  test('dry-run: nothing executes, outcomes say planned', async () => {
    const s = stubProject();
    const out = await executeActions(
      [{ kind: 'QUARANTINE_SOURCE', target: 'clubber', summary: 's' }],
      { dryRun: true, statePath: s.statePath, projectDir: s.dir },
    );
    expect(out[0].ran).toBe(false);
    expect(out[0].ok).toBeNull();
    expect(existsSync(join(s.dir, 'config', 'quarantined-sources.json'))).toBe(false);
  });

  test('QUARANTINE_SOURCE writes the registry entry and records cooldown state', async () => {
    const s = stubProject();
    const out = await executeActions(
      [{ kind: 'QUARANTINE_SOURCE', target: 'clubber', summary: 's' }],
      { dryRun: false, statePath: s.statePath, projectDir: s.dir },
    );
    expect(out[0].ok).toBe(true);
    const q = JSON.parse(readFileSync(join(s.dir, 'config', 'quarantined-sources.json'), 'utf8'));
    expect(q.sources.clubber.reason).toContain('SOURCE_DEAD');
    const state = JSON.parse(readFileSync(s.statePath, 'utf8'));
    expect(state.lastActionMs.QUARANTINE_SOURCE).toBeGreaterThan(0);
  });

  test('cooldown state file is created even when its directory does not exist yet', async () => {
    const s = stubProject();
    const statePath = join(s.stateDir, 'nested', 'responder-state.json');
    await executeActions([{ kind: 'QUEUE_ENTRY', summary: 's' }], { dryRun: false, statePath, projectDir: s.dir });
    expect(JSON.parse(readFileSync(statePath, 'utf8')).lastActionMs.QUEUE_ENTRY).toBeGreaterThan(0);
  });

  test('no host record → ALERT ONLY with the manual command; aa-run, netlify and redeploy.sh never run', async () => {
    const s = stubProject();
    const out = await exec(s);
    expect(out[0].ran).toBe(true);
    expect(out[0].ok).toBe(false);
    expect(out[0].detail).toContain('alert only');
    expect(out[0].detail).toContain('docker/aa-run.sh restore');
    expect(callsOf(s)).toBe('');
    noHostNetlify(s);
    expect(existsSync(s.sentinel)).toBe(false);
  });

  test('a record → runs exactly `docker/aa-run.sh restore <RECORDED id>` (container job); no host netlify call', async () => {
    const s = stubProject();
    record(s);
    const out = await exec(s);
    expect(out[0].ok).toBe(true);
    expect(out[0].detail).toContain(GOOD_ID);
    expect(out[0].detail).toContain('docker/aa-run.sh restore');
    expect(callsOf(s)).toBe(`restore ${GOOD_ID}\n`);
    noHostNetlify(s);
    expect(existsSync(s.sentinel)).toBe(false);
  });

  test('the restore uses the NEWEST record only', async () => {
    const s = stubProject();
    const older = 'aa'.repeat(12);
    record(s, `2026-09-20T08:00:00Z ${older} ${GOOD_HASH}\n2026-09-21T08:00:00Z ${GOOD_ID} ${GOOD_HASH}\n`);
    await exec(s);
    expect(callsOf(s)).toBe(`restore ${GOOD_ID}\n`);
  });

  test('docker/aa-run.sh not installed → ALERT ONLY naming it; nothing runs (no host netlify fallback)', async () => {
    const s = stubProject({ aaRun: false });
    record(s);
    const out = await exec(s);
    expect(out[0].ok).toBe(false);
    expect(out[0].detail).toContain('alert only');
    expect(out[0].detail).toContain('docker/aa-run.sh');
    expect(out[0].detail).toContain(GOOD_ID);
    noHostNetlify(s);
    expect(existsSync(s.sentinel)).toBe(false);
  });

  test('a recorded id that is not 24-40 lowercase hex → ALERT ONLY; the wrapper never sees it', async () => {
    for (const id of ['abc', 'ZZ0c0ffee0123456789abcdX', 'a'.repeat(41), '64F0C0FFEE0123456789ABCD']) {
      const s = stubProject();
      record(s, `2026-09-21T08:00:00Z ${id} ${GOOD_HASH}\n`);
      const out = await exec(s);
      expect(out[0].ok).toBe(false);
      expect(out[0].detail).toContain('alert only');
      expect(callsOf(s)).toBe('');
    }
  });

  test('malformed last record → alert only, the wrapper never runs', async () => {
    const s = stubProject();
    record(s, 'not a record\n');
    const out = await exec(s);
    expect(out[0].ok).toBe(false);
    expect(callsOf(s)).toBe('');
  });

  test('the container job failing → a failed outcome naming the exit code, without echoing its output', async () => {
    const s = stubProject({ aaRunRc: 5 });
    record(s);
    const out = await exec(s);
    expect(out[0].ok).toBe(false);
    expect(out[0].detail).toContain('exit 5');
    expect(out[0].detail).not.toContain('hostile');
    expect(existsSync(s.sentinel)).toBe(false);
  });

  test('a hung container job is killed at the timeout → failed outcome, never throws', async () => {
    const s = stubProject({ aaRunSleep: 20 });
    record(s);
    const t0 = Date.now();
    const out = await exec(s, { restoreTimeoutMs: 500 });
    expect(Date.now() - t0).toBeLessThan(10_000);
    expect(out[0].ok).toBe(false);
    expect(out[0].detail.length).toBeGreaterThan(0);
  });

  test('a missing project dir degrades to an alert-only outcome (fault isolation)', async () => {
    const s = stubProject();
    record(s);
    const out = await executeActions([{ kind: 'RESTORE_KNOWN_GOOD', summary: 's' }], {
      dryRun: false, statePath: s.statePath, projectDir: '/nonexistent-project-dir', stateDir: s.stateDir,
    });
    expect(out[0].ok).toBe(false);
    expect(out[0].detail.length).toBeGreaterThan(0);
  });

  test('the whole STALE_DEPLOY path (plan → execute) never runs redeploy.sh, whatever the record says', async () => {
    for (const setup of [(s: Stub) => s, (s: Stub) => { record(s); return s; }]) {
      const s = setup(stubProject());
      const plan = planResponse(result('STALE_DEPLOY'), fresh, now);
      await withPath(s, () => executeActions(plan, { dryRun: false, statePath: s.statePath, projectDir: s.dir, stateDir: s.stateDir }));
      expect(existsSync(s.sentinel)).toBe(false);
      noHostNetlify(s);
    }
  });
});

describe('deadman wiring pin', () => {
  const src = readFileSync(join(import.meta.dir, '..', 'scripts', 'deadman-watchdog.ts'), 'utf8');
  const responders = readFileSync(join(import.meta.dir, '..', 'src', 'watchdog', 'responders.ts'), 'utf8');

  test('deadman-watchdog invokes the responder layer', () => {
    expect(src).toContain('planResponse(');
    expect(src).toContain('executeActions(');
    expect(src).toContain('responder-state.json');
  });

  test('responder cooldown state lives in the host state dir, not in container-writable data/', () => {
    expect(src).not.toMatch(/join\(ROOT, "data", "responder-state\.json"\)/);
    expect(src).toContain('hostStateDir()');
    expect(src).toContain('responderStatePath()');
  });

  test('the responder module never spawns a forward deploy or redeploy.sh', () => {
    expect(responders).not.toMatch(/spawn[^\n]*redeploy/);
    expect(responders).not.toContain("'--prod'");
    expect(responders).not.toMatch(/\[\s*netlifyCmd\s*,\s*'deploy'/);
  });

  test('round 5: the responder never calls the host netlify CLI; the restore runs docker/aa-run.sh restore', () => {
    expect(responders).not.toContain('netlifyCmd');
    expect(responders).not.toMatch(/spawn(Sync)?\(\s*\[\s*['"]netlify['"]/);
    expect(responders).not.toMatch(/\[[^\]\n]*'api'/);
    expect(responders).toContain("'restore'");
    expect(responders).toContain("join(projectDir, 'docker', 'aa-run.sh')");
  });
});
