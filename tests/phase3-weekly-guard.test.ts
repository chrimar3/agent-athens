/**
 * tests/phase3-weekly-guard.test.ts — the Phase-3 weekly headless session's boundary.
 *
 * scripts/phase3-weekly.sh runs `claude -p` on the host over third-party
 * measurement output (Perplexity probe answers, DB-derived diagnostics). Two
 * things keep an injection in that text from becoming code execution:
 *
 * 1. PHASE3_ALLOWED_TOOLS is an explicit list: named scripts only (no
 *    `Bash(bun run *)` / `Bash(bun test *)`, which run any file), no Task, no web
 *    tools, no git verb that writes single files from any commit (checkout,
 *    restore, reset: they could put back an older guard file), and
 *    no acceptEdits (its auto-approved filesystem commands are not needed: Write,
 *    Edit and MultiEdit are granted by name).
 * 2. A fail-closed startup self-test runs the db-guard hook the session will use
 *    (the Phase-3 worktree's copy) directly on known-bad calls under the same
 *    AA_UNATTENDED_SESSION env, and aborts before any claude call unless each is
 *    refused with exit 2 and each known-good call exits 0.
 *
 * Seams (as in tests/auto-enrich-guard-selftest.test.ts): DB_GUARD_HOOK_OVERRIDE
 * points the self-test at a stub hook, PHASE3_WT_OVERRIDE at a temp worktree
 * (for the settings-wiring check), PHASE3_LOG_DIR_OVERRIDE at a temp log dir.
 */
import { describe, test, expect } from 'bun:test';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

const ROOT = resolve(import.meta.dir, '..');
const SCRIPT = join(ROOT, 'scripts', 'phase3-weekly.sh');
const src = readFileSync(SCRIPT, 'utf8');

// ---------------------------------------------------------------------------
// 1. The allowlist
// ---------------------------------------------------------------------------

const allowLine = src.split('\n').find((l) => l.startsWith('PHASE3_ALLOWED_TOOLS='));
const allowed = (allowLine ?? '').replace(/^PHASE3_ALLOWED_TOOLS="/, '').replace(/"\s*$/, '').split(',');
const bashRules = allowed.filter((t) => t.startsWith('Bash('));
const invocation = src.split('\n').find((l) => l.includes('"$CLAUDE_BIN" -p "$PROMPT"')) ?? '';

describe('phase3-weekly — PHASE3_ALLOWED_TOOLS is an explicit list', () => {
  test('precondition: the allowlist and the session invocation exist', () => {
    expect(allowLine).toBeDefined();
    expect(allowed.length).toBeGreaterThan(5);
    expect(invocation).toContain('--allowedTools "$PHASE3_ALLOWED_TOOLS"');
  });

  test('no wildcard bun/bunx grant: every script the session may run is named', () => {
    for (const r of bashRules.filter((r) => /^Bash\(bunx? /.test(r))) {
      expect(r).not.toContain('*');
    }
    expect(bashRules).not.toContain('Bash(bun run *)');
    expect(bashRules).not.toContain('Bash(bun test *)');
    expect(bashRules).not.toContain('Bash(bunx tsc *)');
  });

  test('the bun commands are exactly the gates the Phase-3 law needs (build, test, typecheck)', () => {
    expect(bashRules.filter((r) => /^Bash\(bunx? /.test(r)).sort()).toEqual(
      ['Bash(bun run src/generate-site.ts)', 'Bash(bun test)', 'Bash(bunx tsc --noEmit -p .)'].sort(),
    );
  });

  test('git is limited to local, non-restoring verbs', () => {
    const git = bashRules.filter((r) => r.startsWith('Bash(git'));
    expect(git.length).toBeGreaterThan(0);
    for (const r of git) {
      expect(r).toMatch(/^Bash\(git (status|diff|log|show|add|commit|merge|switch|branch|rev-parse)( \*)?\)$/);
    }
    // checkout/restore/reset can write an older scripts/hooks/db-guard.ts into
    // the worktree mid-session; push/-C/config/remote reach beyond it.
    for (const verb of ['checkout', 'restore', 'reset', 'stash', 'push', 'pull', 'fetch', '-C', '-c', 'config', 'remote', 'worktree', 'clean', 'rebase']) {
      expect(git.some((r) => r.startsWith(`Bash(git ${verb}`))).toBe(false);
    }
  });

  test('every other Bash rule is a known read-only convenience', () => {
    const rest = bashRules.filter((r) => !/^Bash\((bunx?|git) /.test(r) && r !== 'Bash(bun test)');
    for (const r of rest) expect(['Bash(ls *)', 'Bash(wc *)']).toContain(r);
  });

  test('no bare Bash, no Task/Agent fan-out, no web tools, no notebook tools', () => {
    for (const t of allowed) {
      expect(t).not.toBe('Bash');
      expect(['Task', 'Agent', 'WebFetch', 'WebSearch', 'NotebookEdit', 'Skill']).not.toContain(t.replace(/\(.*$/, ''));
    }
  });

  test('file tools are granted by name, so acceptEdits (and bypass modes) are not used', () => {
    for (const t of ['Read', 'Glob', 'Grep', 'Write', 'Edit', 'MultiEdit']) expect(allowed).toContain(t);
    expect(src).not.toMatch(/--permission-mode (acceptEdits|bypassPermissions)/);
    expect(src).not.toContain('--dangerously-skip-permissions');
    expect(invocation).toContain('--permission-mode default');
  });

  test('the session runs under the unattended hook profile with the benchmark dir as its only extra root', () => {
    expect(invocation).toContain('AA_UNATTENDED_SESSION=phase3');
    expect(invocation).toContain('AA_SESSION_EXTRA_ROOTS="$BENCH"');
  });
});

// ---------------------------------------------------------------------------
// 2. The fail-closed self-test
// ---------------------------------------------------------------------------

describe('phase3-weekly — guard self-test placement', () => {
  test('the script has a --guard-selftest-only mode, handled before layer 1', () => {
    const mode = src.indexOf('"--guard-selftest-only"');
    expect(mode).toBeGreaterThan(-1);
    expect(mode).toBeLessThan(src.indexOf('# ---------- layer 1'));
  });

  test('the self-test gates layer 2 before ANY claude call (the auth pre-check is a claude call too)', () => {
    const l2 = src.indexOf('# ---------- layer 2');
    const gate = src.indexOf('if ! run_guard_selftest; then', l2);
    expect(gate).toBeGreaterThan(l2);
    const firstClaude = src.indexOf('"$CLAUDE_BIN"', l2);
    expect(gate).toBeLessThan(firstClaude);
  });

  test('the probes cover out-of-repo bun run, a key read, the sqlite3 file functions and a web tool', () => {
    expect(src).toContain('bun run /tmp/x.ts');
    expect(src).toContain('~/.ssh/id_rsa');
    expect(src).toMatch(/writefile\(/);
    expect(src).toContain('\\"tool_name\\":\\"WebFetch\\"');
  });
});

function worktree(settings?: object): string {
  const wt = mkdtempSync(join(tmpdir(), 'aa-phase3-wt-'));
  mkdirSync(join(wt, '.claude'), { recursive: true });
  const wired = settings ?? {
    hooks: { PreToolUse: [{ matcher: '*', hooks: [{ type: 'command', command: 'bun "$CLAUDE_PROJECT_DIR/scripts/hooks/db-guard.ts"' }] }] },
  };
  writeFileSync(join(wt, '.claude', 'settings.json'), JSON.stringify(wired));
  return wt;
}

function stub(body: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'aa-phase3-hook-'));
  const p = join(dir, 'stub-hook.ts');
  writeFileSync(p, body);
  return p;
}

function runSelfTest(hook: string, wt = worktree()) {
  const logDir = mkdtempSync(join(tmpdir(), 'aa-phase3-logs-'));
  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    DB_GUARD_HOOK_OVERRIDE: hook,
    PHASE3_WT_OVERRIDE: wt,
    PHASE3_LOG_DIR_OVERRIDE: logDir,
    // The wrapper must set the profile itself, whatever the caller's env says.
    AA_ENRICHMENT_SESSION: '1',
  };
  delete env.AA_UNATTENDED_SESSION;
  const r = Bun.spawnSync(['bash', SCRIPT, '--guard-selftest-only'], { cwd: ROOT, env });
  return { code: r.exitCode, out: new TextDecoder().decode(r.stdout) + new TextDecoder().decode(r.stderr) };
}

// A hook that behaves like the unattended profile the owner patch must provide:
// only when AA_UNATTENDED_SESSION is set (and the stricter enrichment profile is
// NOT) does it refuse the bad probes; it allows the build and a write under the
// declared extra root.
const CORRECT = `
const j = JSON.parse(await new Response(Bun.stdin.stream()).text());
const env = process.env;
if (env.AA_UNATTENDED_SESSION !== 'phase3' || env.AA_ENRICHMENT_SESSION || !env.AA_SESSION_EXTRA_ROOTS) process.exit(0);
const t = j.tool_name, i = j.tool_input ?? {};
if (t === 'Bash') process.exit(['bun run src/generate-site.ts', 'bun test'].includes(i.command) ? 0 : 2);
if (t === 'Write') process.exit(String(i.file_path).startsWith(env.AA_SESSION_EXTRA_ROOTS + '/') ? 0 : 2);
process.exit(2);
`;

describe('phase3-weekly --guard-selftest-only — behaviour', () => {
  test('a hook that enforces the unattended profile passes: bad calls exit 2, good calls exit 0', () => {
    const r = runSelfTest(stub(CORRECT));
    expect(r.out).toContain('Guard self-test passed');
    expect(r.code).toBe(0);
  });

  test('a permissive hook (allows everything) aborts, naming each probe it let through', () => {
    const r = runSelfTest(stub('process.exit(0);\n'));
    expect(r.code).not.toBe(0);
    expect(r.out).toContain('Guard self-test FAILED');
    expect(r.out).toContain('bun run outside the repo');
    expect(r.out).toContain('Read ~/.ssh/id_rsa');
    expect(r.out).toContain('sqlite3 writefile');
  });

  test('a hook that refuses everything except an out-of-repo bun run still aborts (each probe is checked)', () => {
    const body = CORRECT.replace("['bun run src/generate-site.ts', 'bun test']", "['bun run src/generate-site.ts', 'bun test', 'bun run /tmp/x.ts']");
    const r = runSelfTest(stub(body));
    expect(r.code).not.toBe(0);
    expect(r.out).toContain('bun run outside the repo');
  });

  test('a crashing hook (exit 1: non-blocking in Claude Code) aborts', () => {
    const r = runSelfTest(stub('throw new Error("boom");\n'));
    expect(r.code).not.toBe(0);
    expect(r.out).toContain('Guard self-test FAILED');
  });

  test('a hook that blocks everything aborts too (the session could not build or log)', () => {
    const r = runSelfTest(stub('process.exit(2);\n'));
    expect(r.code).not.toBe(0);
    expect(r.out).toContain('Guard self-test FAILED');
  });

  test('a worktree whose settings do not wire the hook aborts', () => {
    const r = runSelfTest(stub(CORRECT), worktree({ hooks: {} }));
    expect(r.code).not.toBe(0);
    expect(r.out).toContain('settings wiring');
  });

  test('a matcher that does not route Read (or web tools) to the hook aborts', () => {
    const narrow = { hooks: { PreToolUse: [{ matcher: 'Bash|Write|Edit|MultiEdit', hooks: [{ type: 'command', command: 'bun "$CLAUDE_PROJECT_DIR/scripts/hooks/db-guard.ts"' }] }] } };
    const r = runSelfTest(stub(CORRECT), worktree(narrow));
    expect(r.code).not.toBe(0);
    expect(r.out).toContain('settings wiring');
  });
});
