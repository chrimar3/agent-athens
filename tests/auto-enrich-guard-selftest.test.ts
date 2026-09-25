/**
 * auto-enrich.sh --guard-selftest-only (security loop round 1).
 *
 * Before any unattended enrichment session starts, the wrapper runs the
 * db-guard hook DIRECTLY (not through claude) on a known-bad sqlite3
 * writefile command and a known-bad Read of .env, with the enrichment env
 * set, and aborts if either is allowed. A hook that crashes exits non-zero but
 * not 2, which Claude Code treats as a NON-blocking error (the tool runs), so
 * the self-test demands exit 2 exactly — and a known-good call must exit 0,
 * proving the hook ran rather than failed.
 *
 * DB_GUARD_HOOK_OVERRIDE is the test seam: it points the self-test at a stub
 * hook, so the failure path is exercised without touching the real one.
 */
import { describe, test, expect } from 'bun:test';
import { mkdtempSync, writeFileSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

const ROOT = resolve(import.meta.dir, '..');
const SCRIPT = join(ROOT, 'scripts', 'auto-enrich.sh');

function runSelfTest(hookOverride?: string) {
  const dir = mkdtempSync(join(tmpdir(), 'aa-guard-selftest-'));
  const logDir = join(dir, 'logs');
  const env: Record<string, string> = { ...(process.env as Record<string, string>), LOG_DIR_OVERRIDE: logDir };
  delete env.AA_ENRICHMENT_SESSION;
  if (hookOverride) env.DB_GUARD_HOOK_OVERRIDE = hookOverride;
  const r = Bun.spawnSync(['bash', SCRIPT, '--guard-selftest-only'], { cwd: ROOT, env });
  const out = new TextDecoder().decode(r.stdout) + new TextDecoder().decode(r.stderr);
  return { code: r.exitCode, out, dir };
}

function stubHook(dir: string, body: string): string {
  const p = join(dir, 'stub-hook.ts');
  writeFileSync(p, body);
  return p;
}

describe('auto-enrich --guard-selftest-only', () => {
  test('script advertises the mode and calls the self-test in the main flow (precondition)', () => {
    const src = readFileSync(SCRIPT, 'utf8');
    expect(src).toContain('--guard-selftest-only');
    expect(src).toContain('run_guard_selftest || exit 1');
  });

  test('the shipped hook passes: bad calls exit 2, the good call exits 0', () => {
    const r = runSelfTest();
    expect(r.out).toContain('Guard self-test passed');
    expect(r.code).toBe(0);
  });

  test('a permissive hook (allows everything) aborts the run with a clear message', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aa-guard-stub-'));
    const r = runSelfTest(stubHook(dir, 'process.exit(0);\n'));
    expect(r.code).not.toBe(0);
    expect(r.out).toContain('Guard self-test FAILED');
    expect(r.out).toContain('writefile');
  });

  test('a hook that allows only the .env read still aborts (each probe is checked on its own)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aa-guard-stub-'));
    const body =
      "const t = await new Response(Bun.stdin.stream()).text();\n" +
      "process.exit(t.includes('\"Read\"') ? 0 : (t.includes('db-read.ts') ? 0 : 2));\n";
    const r = runSelfTest(stubHook(dir, body));
    expect(r.code).not.toBe(0);
    expect(r.out).toContain('.env');
  });

  test('a crashing hook (exit 1: non-blocking in Claude Code) aborts the run', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aa-guard-stub-'));
    const r = runSelfTest(stubHook(dir, 'throw new Error("boom");\n'));
    expect(r.code).not.toBe(0);
    expect(r.out).toContain('Guard self-test FAILED');
  });

  test('a hook that blocks everything aborts too (enrichment could not write)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aa-guard-stub-'));
    const r = runSelfTest(stubHook(dir, 'process.exit(2);\n'));
    expect(r.code).not.toBe(0);
    expect(r.out).toContain('Guard self-test FAILED');
  });
});
