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

  test('a malformed LAST line → null (never silently falls back to an older entry)', () => {
    expect(lastKnownGoodDeploy(file(`2026-09-21T08:00:00Z ${GOOD_ID} ${GOOD_HASH}\ngarbage line\n`))).toBeNull();
    expect(lastKnownGoodDeploy(file(`2026-09-21T08:00:00Z ../../x ${GOOD_HASH}\n`))).toBeNull();
    expect(lastKnownGoodDeploy(file(`2026-09-21T08:00:00Z ${GOOD_ID} nothex\n`))).toBeNull();
  });
});

describe('executeActions', () => {
  interface Stub { dir: string; statePath: string; stateDir: string; netlify: string; calls: string; sentinel: string }
  /** Stub project + host state dir + fake netlify CLI. The project carries a
   *  scripts/redeploy.sh that drops a sentinel if anything ever runs it, and a
   *  decoy .netlify/state.json (container-writable) naming another site. */
  function stubProject(opts: { published?: string; recordedState?: string; netlifyRc?: number } = {}): Stub {
    const dir = mkdtempSync(join(tmpdir(), 'aa-resp-'));
    mkdirSync(join(dir, 'config'), { recursive: true });
    mkdirSync(join(dir, 'scripts'), { recursive: true });
    mkdirSync(join(dir, '.netlify'), { recursive: true });
    const sentinel = join(dir, 'REDEPLOY-RAN');
    writeFileSync(join(dir, 'scripts', 'redeploy.sh'), `#!/bin/bash\ntouch "${sentinel}"\nexit 0\n`);
    chmodSync(join(dir, 'scripts', 'redeploy.sh'), 0o755);
    writeFileSync(join(dir, '.netlify', 'state.json'), '{"siteId":"decoy-site"}\n');
    const stateDir = join(dir, 'host-state');
    mkdirSync(stateDir);
    const calls = join(dir, 'netlify-calls.log');
    const publishedFile = join(dir, 'published');
    writeFileSync(publishedFile, opts.published ?? 'live-deploy-000000000000');
    const netlify = join(dir, 'fake-netlify');
    writeFileSync(netlify, `#!/bin/bash
echo "$*" >> "${calls}"
[[ "${opts.netlifyRc ?? 0}" != 0 ]] && { echo "boom" >&2; exit ${opts.netlifyRc ?? 0}; }
case "$2" in
  getDeploy) echo '{"id":"${GOOD_ID}","site_id":"site-real","state":"${opts.recordedState ?? 'ready'}"}' ;;
  getSite) printf '{"id":"site-real","published_deploy":{"id":"%s"}}\\n' "$(cat "${publishedFile}")" ;;
  restoreSiteDeploy) echo "${GOOD_ID}" > "${publishedFile}"; echo '{"id":"${GOOD_ID}","state":"ready"}' ;;
  *) echo '{}' ;;
esac
`);
    chmodSync(netlify, 0o755);
    return { dir, statePath: join(stateDir, 'responder-state.json'), stateDir, netlify, calls, sentinel };
  }
  const record = (s: Stub, body = `2026-09-21T08:00:00Z ${GOOD_ID} ${GOOD_HASH}\n`) =>
    writeFileSync(join(s.stateDir, 'deploys.log'), body);
  const callsOf = (s: Stub) => (existsSync(s.calls) ? readFileSync(s.calls, 'utf8') : '');
  const exec = (s: Stub) =>
    executeActions([{ kind: 'RESTORE_KNOWN_GOOD', summary: 's' }], {
      dryRun: false, statePath: s.statePath, projectDir: s.dir, stateDir: s.stateDir, netlifyCmd: s.netlify,
    });

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

  test('no host record → ALERT ONLY with the manual command; netlify and redeploy.sh never run', async () => {
    const s = stubProject();
    const out = await exec(s);
    expect(out[0].ran).toBe(true);
    expect(out[0].ok).toBe(false);
    expect(out[0].detail).toContain('alert only');
    expect(out[0].detail).toContain('restoreSiteDeploy');
    expect(callsOf(s)).toBe('');
    expect(existsSync(s.sentinel)).toBe(false);
  });

  test('live site differs from the last verified deploy → restoreSiteDeploy with the RECORDED id and the site Netlify reports for it', async () => {
    const s = stubProject({ published: 'something-else-000000000' });
    record(s);
    const out = await exec(s);
    expect(out[0].ok).toBe(true);
    expect(out[0].detail).toContain(GOOD_ID);
    const calls = callsOf(s);
    expect(calls).toContain(`api getDeploy --data {"deploy_id":"${GOOD_ID}"}`);
    expect(calls).toContain(`api restoreSiteDeploy --data {"site_id":"site-real","deploy_id":"${GOOD_ID}"}`);
    expect(calls).not.toContain('decoy-site');                  // never trusts container-writable .netlify/state.json
    expect(calls).not.toMatch(/^deploy /m);                      // never a forward deploy
    expect(existsSync(s.sentinel)).toBe(false);
  });

  test('live site already serves the last verified deploy → nothing restored, ok', async () => {
    const s = stubProject({ published: GOOD_ID });
    record(s);
    const out = await exec(s);
    expect(out[0].ok).toBe(true);
    expect(out[0].detail).toContain('nothing restored');
    expect(callsOf(s)).not.toContain('restoreSiteDeploy');
  });

  test('recorded deploy is not state=ready on Netlify → alert only, no restore', async () => {
    const s = stubProject({ published: 'something-else-000000000', recordedState: 'error' });
    record(s);
    const out = await exec(s);
    expect(out[0].ok).toBe(false);
    expect(out[0].detail).toContain('alert only');
    expect(callsOf(s)).not.toContain('restoreSiteDeploy');
  });

  test('malformed last record → alert only, netlify never called', async () => {
    const s = stubProject();
    record(s, 'not a record\n');
    const out = await exec(s);
    expect(out[0].ok).toBe(false);
    expect(callsOf(s)).toBe('');
  });

  test('netlify CLI failure degrades to a failed outcome, never throws', async () => {
    const s = stubProject({ netlifyRc: 1 });
    record(s);
    const out = await exec(s);
    expect(out[0].ok).toBe(false);
    expect(out[0].detail.length).toBeGreaterThan(0);
    expect(existsSync(s.sentinel)).toBe(false);
  });

  test('a missing netlify binary degrades to a failed outcome (fault isolation)', async () => {
    const s = stubProject();
    record(s);
    const out = await executeActions([{ kind: 'RESTORE_KNOWN_GOOD', summary: 's' }], {
      dryRun: false, statePath: s.statePath, projectDir: '/nonexistent-project-dir', stateDir: s.stateDir,
      netlifyCmd: '/nonexistent/netlify',
    });
    expect(out[0].ok).toBe(false);
    expect(out[0].detail.length).toBeGreaterThan(0);
  });

  test('the whole STALE_DEPLOY path (plan → execute) never runs redeploy.sh, whatever the record says', async () => {
    for (const setup of [(s: Stub) => s, (s: Stub) => { record(s); return s; }]) {
      const s = setup(stubProject({ published: 'something-else-000000000' }));
      const plan = planResponse(result('STALE_DEPLOY'), fresh, now);
      await executeActions(plan, { dryRun: false, statePath: s.statePath, projectDir: s.dir, stateDir: s.stateDir, netlifyCmd: s.netlify });
      expect(existsSync(s.sentinel)).toBe(false);
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
});
