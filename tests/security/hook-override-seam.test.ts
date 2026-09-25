/**
 * Security loop round 6 — DB_GUARD_HOOK_OVERRIDE works only in tests and
 * interactive runs.
 *
 * scripts/auto-enrich.sh and scripts/phase3-weekly.sh start every unattended
 * claude session with a guard self-test that runs the db-guard hook directly.
 * DB_GUARD_HOOK_OVERRIDE points that self-test at ANOTHER file (the test seam
 * in tests/auto-enrich-guard-selftest.test.ts and tests/phase3-weekly-guard.test.ts).
 * A scheduled run that inherited it would pass the self-test against a stub
 * while the sessions use the real hook, so the seam is refused (the self-test
 * fails, nothing starts) inside the container (AA_CONTAINER=1) and in a
 * launchd job (XPC_SERVICE_NAME=com.agentathens.*). The stub hooks below record
 * every call, so the tests also show the overridden file never ran.
 */
import { describe, expect, test, afterAll } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const ROOT = join(import.meta.dir, '..', '..');
const AUTO_ENRICH = join(ROOT, 'scripts', 'auto-enrich.sh');
const PHASE3 = join(ROOT, 'scripts', 'phase3-weekly.sh');

const cleanup: string[] = [];
afterAll(() => { for (const d of cleanup) rmSync(d, { recursive: true, force: true }); });
function tmp(prefix: string): string {
  const d = mkdtempSync(join(tmpdir(), prefix));
  cleanup.push(d);
  return d;
}

/** A hook that records that it ran, then allows everything. */
function recordingStub(): { hook: string; ran: () => boolean } {
  const dir = tmp('aa-seam-hook-');
  const trace = join(dir, 'ran.log');
  const hook = join(dir, 'stub-hook.ts');
  writeFileSync(hook, `require('fs').appendFileSync(${JSON.stringify(trace)}, 'ran\\n');\nprocess.exit(0);\n`);
  return { hook, ran: () => existsSync(trace) && readFileSync(trace, 'utf-8').length > 0 };
}

function baseEnv(extra: Record<string, string>): Record<string, string> {
  const env: Record<string, string> = { ...(process.env as Record<string, string>) };
  for (const k of ['AA_CONTAINER', 'XPC_SERVICE_NAME', 'AA_ENRICHMENT_SESSION', 'AA_UNATTENDED_SESSION', 'DB_GUARD_HOOK_OVERRIDE']) delete env[k];
  return { ...env, ...extra };
}

function runAutoEnrich(env: Record<string, string>) {
  const r = Bun.spawnSync(['bash', AUTO_ENRICH, '--guard-selftest-only'], {
    cwd: ROOT,
    env: baseEnv({ LOG_DIR_OVERRIDE: join(tmp('aa-seam-logs-'), 'logs'), ...env }),
  });
  return { code: r.exitCode, out: r.stdout.toString() + r.stderr.toString() };
}

function runPhase3(env: Record<string, string>) {
  const wt = tmp('aa-seam-wt-');
  mkdirSync(join(wt, '.claude'), { recursive: true });
  writeFileSync(join(wt, '.claude', 'settings.json'), JSON.stringify({
    hooks: { PreToolUse: [{ matcher: '*', hooks: [{ type: 'command', command: 'bun "$CLAUDE_PROJECT_DIR/scripts/hooks/db-guard.ts"' }] }] },
  }));
  const r = Bun.spawnSync(['bash', PHASE3, '--guard-selftest-only'], {
    cwd: ROOT,
    env: baseEnv({ PHASE3_WT_OVERRIDE: wt, PHASE3_LOG_DIR_OVERRIDE: tmp('aa-seam-logs-'), ...env }),
  });
  return { code: r.exitCode, out: r.stdout.toString() + r.stderr.toString() };
}

describe('auto-enrich.sh: DB_GUARD_HOOK_OVERRIDE', () => {
  test('control: in an interactive/test run the seam is honoured (the stub hook runs)', () => {
    const s = recordingStub();
    runAutoEnrich({ DB_GUARD_HOOK_OVERRIDE: s.hook, AA_ALLOW_HOST_RUN: '1' });
    expect(s.ran()).toBe(true);
  });

  test('refused inside the container: non-zero, names the seam and the fix, the stub never runs', () => {
    const s = recordingStub();
    const r = runAutoEnrich({ DB_GUARD_HOOK_OVERRIDE: s.hook, AA_CONTAINER: '1' });
    expect(r.code).not.toBe(0);
    expect(r.out).toContain('Guard self-test REFUSED');
    expect(r.out).toContain('DB_GUARD_HOOK_OVERRIDE');
    expect(r.out).toMatch(/Next: remove DB_GUARD_HOOK_OVERRIDE/);
    expect(s.ran()).toBe(false);
  });

  test('refused in a launchd job (XPC_SERVICE_NAME=com.agentathens.docker.enrichment): the stub never runs', () => {
    const s = recordingStub();
    // On the host the round-6 host guard refuses the launchd override first (exit 9)…
    const r = runAutoEnrich({ DB_GUARD_HOOK_OVERRIDE: s.hook, AA_ALLOW_HOST_RUN: '1', XPC_SERVICE_NAME: 'com.agentathens.docker.enrichment' });
    expect(r.code).not.toBe(0);
    expect(s.ran()).toBe(false);
    // …and the self-test block refuses the seam on its own too.
    const src = readFileSync(AUTO_ENRICH, 'utf-8');
    const m = src.match(/# hook-override-guard:begin[^\n]*\n([\s\S]*?)\n\s*# hook-override-guard:end/);
    expect(m).not.toBeNull();
    const snippet = `log_error() { echo "ERR: $*"; }\nf() {\n${m![1]}\necho SEAM-HONOURED\n}\nf; echo "rc=$?"`;
    const run = (env: Record<string, string>) => {
      const x = Bun.spawnSync(['bash', '-c', snippet], { env: { PATH: process.env.PATH ?? '/usr/bin:/bin', DB_GUARD_HOOK_OVERRIDE: '/tmp/stub.ts', ...env } });
      return x.stdout.toString();
    };
    const launchd = run({ XPC_SERVICE_NAME: 'com.agentathens.docker.enrichment' });
    expect(launchd).toContain('Guard self-test REFUSED');
    expect(launchd).toContain('rc=1');
    expect(launchd).not.toContain('SEAM-HONOURED');
    expect(run({ XPC_SERVICE_NAME: 'application.com.apple.Terminal.1' })).toContain('SEAM-HONOURED');
    expect(run({})).toContain('SEAM-HONOURED');
  });
});

describe('phase3-weekly.sh: DB_GUARD_HOOK_OVERRIDE', () => {
  test('control: in an interactive/test run the seam is honoured (the stub hook runs)', () => {
    const s = recordingStub();
    runPhase3({ DB_GUARD_HOOK_OVERRIDE: s.hook });
    expect(s.ran()).toBe(true);
  });

  test('refused inside the container: non-zero, names the seam and the fix, the stub never runs', () => {
    const s = recordingStub();
    const r = runPhase3({ DB_GUARD_HOOK_OVERRIDE: s.hook, AA_CONTAINER: '1' });
    expect(r.code).not.toBe(0);
    expect(r.out).toContain('Guard self-test REFUSED');
    expect(r.out).toMatch(/Next: remove DB_GUARD_HOOK_OVERRIDE/);
    expect(s.ran()).toBe(false);
  });

  test('refused in a launchd job (XPC_SERVICE_NAME=com.agentathens.docker.enrichment): the stub never runs', () => {
    const s = recordingStub();
    const r = runPhase3({ DB_GUARD_HOOK_OVERRIDE: s.hook, XPC_SERVICE_NAME: 'com.agentathens.docker.enrichment' });
    expect(r.code).not.toBe(0);
    expect(r.out).toContain('Guard self-test REFUSED');
    expect(s.ran()).toBe(false);
  });

  test('the refusal sits at the top of the self-test, before the hook path is resolved', () => {
    const src = readFileSync(PHASE3, 'utf-8');
    const fn = src.indexOf('run_guard_selftest() {');
    expect(src.indexOf('# hook-override-guard:begin', fn)).toBeGreaterThan(fn);
    expect(src.indexOf('# hook-override-guard:begin', fn)).toBeLessThan(src.indexOf('local hook="${DB_GUARD_HOOK_OVERRIDE', fn));
  });
});
