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

// ---------------------------------------------------------------------------
// 3. Round 7: the session refuses risky tools whatever the worktree's settings
//    allow (full suite: tests/security/unattended-disallowed-tools.test.ts)
// ---------------------------------------------------------------------------

describe('phase3-weekly — --disallowedTools on the session invocation (round 7)', () => {
  test('the exact invocation carries the deny list next to the allow list', () => {
    expect(invocation).toContain('--disallowedTools "$PHASE3_DISALLOWED_TOOLS"');
    const deny = src.split('\n').find((l) => l.startsWith('PHASE3_DISALLOWED_TOOLS="')) ?? '';
    for (const t of ['WebFetch', 'WebSearch', 'Bash(cat *)', 'Bash(curl *)', 'Bash(printenv *)', 'Read(.env*)', 'Read(//proc/**)']) {
      expect(deny).toContain(t);
    }
  });
});

// ---------------------------------------------------------------------------
// 4. Round 7: layer 1 does not move a ref while a container job runs
// ---------------------------------------------------------------------------

describe('phase3-weekly — layer 1 waits for agent-athens-* containers before its first git write (round 7)', () => {
  const BEGIN = '# container-wait:begin';
  const END = '# container-wait:end';
  const fn = src.slice(src.indexOf('\n', src.indexOf(BEGIN)) + 1, src.indexOf(END));

  /** Run wait_for_container_jobs with a stub docker (or none) and an instant
   *  sleep. `dockerBody` runs as the stub (bash builtins only: PATH holds just
   *  the stubs); it can read/advance a counter file. */
  function runWait(dockerBody: string | null, env: Record<string, string> = {}) {
    const bin = mkdtempSync(join(tmpdir(), 'aa-phase3-wait-'));
    const calls = join(bin, 'calls.log');
    writeFileSync(join(bin, 'sleep'), `#!/bin/bash\necho "sleep $*" >> "${calls}"\n`, { mode: 0o755 });
    if (dockerBody !== null) {
      writeFileSync(join(bin, 'docker'), `#!/bin/bash\necho "docker $*" >> "${calls}"\n${dockerBody}\n`, { mode: 0o755 });
    }
    const harness = [
      'BENCH=/tmp/bench',
      'log(){ echo "$*"; }',
      fn,
      'if wait_for_container_jobs; then echo RESULT=0; else echo RESULT=1; fi',
    ].join('\n');
    writeFileSync(join(bin, 'h.sh'), harness);
    // PATH is ONLY the stub dir: a real docker on the machine is never reached.
    const r = Bun.spawnSync(['/bin/bash', join(bin, 'h.sh')], { env: { PATH: bin, COUNTER: join(bin, 'n'), ...env } });
    let log = '';
    try { log = readFileSync(calls, 'utf8'); } catch { /* no calls */ }
    return { out: new TextDecoder().decode(r.stdout) + new TextDecoder().decode(r.stderr), calls: log };
  }
  const count = (s: string, needle: string) => s.split('\n').filter((l) => l === needle).length;
  const RUNNING = 'echo 3f2a1b0c9d8e';

  test('no container running → proceeds at once, one docker ps with the exact name filter, no sleep', () => {
    const r = runWait('exit 0');
    expect(r.out).toContain('RESULT=0');
    expect(r.calls).toBe('docker ps -q --filter name=^/agent-athens-\n');
  });

  test('no docker CLI on PATH → proceeds, saying why', () => {
    const r = runWait(null);
    expect(r.out).toContain('RESULT=0');
    expect(r.out).toContain('no docker CLI on PATH');
    expect(r.calls).toBe('');
  });

  test('docker not running (docker ps fails) → proceeds, saying why', () => {
    const r = runWait('echo "Cannot connect to the Docker daemon" >&2; exit 1');
    expect(r.out).toContain('RESULT=0');
    expect(r.out).toContain('docker is not running');
  });

  test('a running job → polls every 30s until it is gone, then proceeds', () => {
    const r = runWait('n=0; [ -f "$COUNTER" ] && n=$(<"$COUNTER"); echo $((n+1)) > "$COUNTER"; [ "$n" -lt 3 ] && echo 3f2a1b0c9d8e; exit 0');
    expect(r.out).toContain('RESULT=0');
    expect(count(r.calls, 'sleep 30')).toBe(3);
    expect(count(r.calls, 'docker ps -q --filter name=^/agent-athens-')).toBe(4);
    expect(r.out).toContain('waiting for it before committing');
    expect(r.out).toContain('proceeding');
  });

  test('still running at the limit → gives up with a clear line and returns non-zero (AA_PHASE3_WAIT_MIN=1: 2 polls)', () => {
    const r = runWait(RUNNING, { AA_PHASE3_WAIT_MIN: '1' });
    expect(r.out).toContain('RESULT=1');
    expect(r.out).toContain('GAVE UP');
    expect(r.out).toContain('did NOT commit');
    expect(count(r.calls, 'sleep 30')).toBe(2);
  });

  test('the default limit is 3h: 360 polls of 30s', () => {
    const r = runWait(RUNNING);
    expect(r.out).toContain('RESULT=1');
    expect(r.out).toContain('after 180 min');
    expect(count(r.calls, 'sleep 30')).toBe(360);
  });

  test('AA_PHASE3_WAIT_MIN=0 checks once and gives up at once if a job runs', () => {
    const r = runWait(RUNNING, { AA_PHASE3_WAIT_MIN: '0' });
    expect(r.out).toContain('RESULT=1');
    expect(count(r.calls, 'sleep 30')).toBe(0);
  });

  test('a non-numeric AA_PHASE3_WAIT_MIN is refused (non-zero, no docker call)', () => {
    for (const bad of ['abc', '-5', '1.5', '10m', '$(id)']) {
      const r = runWait(RUNNING, { AA_PHASE3_WAIT_MIN: bad });
      expect(r.out).toContain('RESULT=1');
      expect(r.out).toContain('is not a whole number of minutes');
      expect(r.calls).toBe('');
    }
  });

  test('placement: the wait gates layer 1 before its first git write, and a give-up exits 1 before any commit', () => {
    const l1 = src.indexOf('# ---------- layer 1');
    const gate = src.indexOf('if ! wait_for_container_jobs; then', l1);
    const firstGit = src.indexOf('git -C "$BASELINE_WT"', l1);
    expect(gate).toBeGreaterThan(l1);
    expect(gate).toBeLessThan(firstGit);
    expect(gate).toBeLessThan(src.indexOf('>> "$BENCH/PHASE3-LOG.md"', l1));
    const branch = src.slice(gate, src.indexOf('\nfi\n', gate));
    expect(branch).toContain('exit 1');
    expect(branch).not.toContain('git ');
  });
});
