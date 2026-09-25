/**
 * tests/shellcheck-gate.test.ts — the `shellcheck` CI job (security loop round 3).
 *
 * Most of the pipeline's gates are bash (daily-automated.sh, deploy-gate.sh,
 * auto-enrich.sh, the .github/scripts checks, the docker/ wrappers), so a
 * quoting or exit-code regression there is a gate regression. The job runs
 * .github/scripts/shellcheck.sh with a pinned, checksum-verified ShellCheck at
 * severity `warning` over scripts/*.sh, docker/*.sh and .github/scripts/*.sh.
 * Findings that predate the gate in files owned by other work are excused per
 * FILE and per CODE in .github/shellcheck-excludes.json, each with a reason —
 * so the same code in another file, or a new code in the same file, still fails.
 *
 * These tests drive the script with a fake `shellcheck` (it reports the
 * `# FINDING SCnnnn` markers in a file unless that code is passed with -e) in a
 * throwaway tree, so the scoping, the fail-closed paths and the `--norc` flag
 * (a PR must not be able to add a .shellcheckrc that disables everything) are
 * under test. The last block runs the REAL binary over the real repo when one
 * is named in SHELLCHECK_BIN; CI's shellcheck job runs it with the pinned binary.
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, chmodSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { tmpdir } from 'os';

const ROOT = join(import.meta.dir, '..');
const SCRIPT = join(ROOT, '.github', 'scripts', 'shellcheck.sh');
const EXCLUDES = join(ROOT, '.github', 'shellcheck-excludes.json');

let work: string;
beforeAll(() => { work = mkdtempSync(join(tmpdir(), 'aa-shellcheck-gate-')); });
afterAll(() => { rmSync(work, { recursive: true, force: true }); });

let seq = 0;

type Excl = { codes: string[]; reason: string; may_be_absent?: boolean };
type Tree = { files: Record<string, string>; excludes?: Record<string, Excl> | string; toolError?: boolean };

const REASON = 'pre-existing finding in a file owned by other work; fix in a follow-up';

/** A fake shellcheck: logs argv, prints one gcc-format line per `# FINDING SCnnnn`
 *  marker not excluded with -e/--exclude, exits 1 when it printed anything. */
function fakeShellcheck(dir: string, toolError = false): { bin: string; log: string } {
  const bin = join(dir, 'fake-shellcheck');
  const log = join(dir, 'sc-calls.log');
  writeFileSync(bin, `#!/bin/bash
printf '%s\\n' "$*" >> "${log}"
[ "$1" = "--version" ] && { echo "version: 0.0.0-fake"; exit 0; }
${toolError ? 'echo "shellcheck: internal error" >&2; exit 2' : ''}
EXCL=""; FILE=""; prev=""
for a in "$@"; do
  case "$a" in
    --exclude=*) EXCL="\${a#--exclude=}";;
  esac
  if [ "$prev" = "-e" ]; then EXCL="$a"; fi
  prev="$a"; FILE="$a"
done
[ -f "$FILE" ] || { echo "$FILE: does not exist" >&2; exit 2; }
out=0
while IFS= read -r code; do
  case ",$EXCL," in *",$code,"*) continue;; esac
  echo "$FILE:1:1: warning: fake finding [$code]"; out=1
done < <(grep -o 'FINDING SC[0-9]*' "$FILE" | sed 's/FINDING //')
exit $out
`);
  chmodSync(bin, 0o755);
  return { bin, log };
}

function tree(t: Tree) {
  const dir = join(work, `t-${seq++}`);
  mkdirSync(dir, { recursive: true });
  for (const [p, body] of Object.entries(t.files)) {
    mkdirSync(dirname(join(dir, p)), { recursive: true });
    writeFileSync(join(dir, p), body);
  }
  mkdirSync(join(dir, '.github'), { recursive: true });
  const ex = t.excludes ?? {};
  writeFileSync(join(dir, '.github', 'shellcheck-excludes.json'), typeof ex === 'string' ? ex : JSON.stringify({ files: ex }));
  const { bin, log } = fakeShellcheck(dir, t.toolError);
  return { dir, bin, log };
}

function run(dir: string, bin: string, env: Record<string, string> = {}) {
  const r = Bun.spawnSync(['bash', SCRIPT], {
    cwd: dir, stdout: 'pipe', stderr: 'pipe',
    env: { ...process.env, SHELLCHECK_BIN: bin, ...env },
  });
  const dec = (b: Uint8Array) => new TextDecoder().decode(b);
  return { code: r.exitCode, out: dec(r.stdout), err: dec(r.stderr) };
}

const calls = (log: string) => (existsSync(log) ? readFileSync(log, 'utf-8').split('\n').filter(Boolean) : []);

const CLEAN = '#!/bin/bash\necho ok\n';

describe('shellcheck.sh — scope and flags', () => {
  test('clean tree → exit 0, PASS, every file checked once with --norc at severity warning', () => {
    const { dir, bin, log } = tree({ files: { 'scripts/a.sh': CLEAN, 'scripts/b.sh': CLEAN, '.github/scripts/c.sh': CLEAN, 'docker/d.sh': CLEAN, 'scripts/not-shell.ts': 'x' } });
    const r = run(dir, bin);
    expect(r.err).toBe('');
    expect(r.code).toBe(0);
    expect(r.out).toContain('shellcheck: PASS — 4 file(s)');
    const c = calls(log).filter((l) => !l.includes('--version'));
    expect(c).toHaveLength(4);
    for (const l of c) {
      expect(l).toContain('--norc');
      expect(l).toContain('--severity=warning');
    }
    for (const f of ['scripts/a.sh', 'scripts/b.sh', '.github/scripts/c.sh', 'docker/d.sh']) expect(c.some((l) => l.endsWith(f))).toBe(true);
    expect(c.some((l) => l.includes('not-shell.ts'))).toBe(false);
  });

  test('an absent docker/ directory is tolerated (it exists only on the regular branch)', () => {
    const { dir, bin } = tree({ files: { 'scripts/a.sh': CLEAN } });
    const r = run(dir, bin);
    expect(r.code).toBe(0);
    expect(r.out).toContain('1 file(s)');
  });

  test('a finding → exit 1 naming file and code, never PASS', () => {
    const { dir, bin } = tree({ files: { 'scripts/a.sh': CLEAN, 'scripts/bad.sh': '#!/bin/bash\n# FINDING SC2086\n' } });
    const r = run(dir, bin);
    expect(r.code).toBe(1);
    expect(`${r.out}${r.err}`).not.toContain('PASS');
    expect(r.err).toContain('scripts/bad.sh');
    expect(r.err).toContain('SC2086');
  });

  test('a finding in docker/*.sh is caught too', () => {
    const { dir, bin } = tree({ files: { 'scripts/a.sh': CLEAN, 'docker/run.sh': '# FINDING SC2045\n' } });
    const r = run(dir, bin);
    expect(r.code).toBe(1);
    expect(r.err).toContain('docker/run.sh');
  });
});

describe('shellcheck.sh — per-file, per-code exclusions', () => {
  test('an excluded code in its own file passes, and only that file gets the -e list', () => {
    const { dir, bin, log } = tree({
      files: { 'scripts/old.sh': '# FINDING SC2155\n# FINDING SC2034\n', 'scripts/new.sh': CLEAN },
      excludes: { 'scripts/old.sh': { codes: ['SC2155', 'SC2034'], reason: REASON } },
    });
    const r = run(dir, bin);
    expect(r.err).toBe('');
    expect(r.code).toBe(0);
    const c = calls(log);
    expect(c.find((l) => l.endsWith('scripts/old.sh'))).toContain('SC2155,SC2034');
    expect(c.find((l) => l.endsWith('scripts/new.sh'))).not.toContain('SC2155');
  });

  test('the same code in ANOTHER file still fails', () => {
    const { dir, bin } = tree({
      files: { 'scripts/old.sh': '# FINDING SC2155\n', 'scripts/new.sh': '# FINDING SC2155\n' },
      excludes: { 'scripts/old.sh': { codes: ['SC2155'], reason: REASON } },
    });
    const r = run(dir, bin);
    expect(r.code).toBe(1);
    expect(r.err).toContain('scripts/new.sh');
    expect(r.err).not.toContain('scripts/old.sh:');
  });

  test('a NEW code in an excluded file still fails', () => {
    const { dir, bin } = tree({
      files: { 'scripts/old.sh': '# FINDING SC2155\n# FINDING SC2086\n' },
      excludes: { 'scripts/old.sh': { codes: ['SC2155'], reason: REASON } },
    });
    const r = run(dir, bin);
    expect(r.code).toBe(1);
    expect(r.err).toContain('SC2086');
  });

  test('an entry without a real reason → REFUSED', () => {
    const { dir, bin } = tree({ files: { 'scripts/a.sh': CLEAN }, excludes: { 'scripts/a.sh': { codes: ['SC2155'], reason: 'legacy' } } });
    const r = run(dir, bin);
    expect(r.code).toBe(1);
    expect(r.err).toContain('REFUSED');
    expect(r.err).toContain('reason');
  });

  test('an entry with a malformed or empty code list → REFUSED (no "all" wildcard)', () => {
    for (const codes of [['all'], ['2155'], [], ['SC2155,SC2086']]) {
      const { dir, bin } = tree({ files: { 'scripts/a.sh': CLEAN }, excludes: { 'scripts/a.sh': { codes, reason: REASON } } });
      const r = run(dir, bin);
      expect(r.code).toBe(1);
      expect(r.err).toContain('REFUSED');
    }
  });

  test('an entry naming a file that no longer exists → REFUSED (stale entries cannot pile up)', () => {
    const { dir, bin } = tree({ files: { 'scripts/a.sh': CLEAN }, excludes: { 'scripts/gone.sh': { codes: ['SC2155'], reason: REASON } } });
    const r = run(dir, bin);
    expect(r.code).toBe(1);
    expect(r.err).toContain('scripts/gone.sh');
  });

  test('…unless it is marked may_be_absent (listed ahead of a branch merge)', () => {
    const { dir, bin } = tree({ files: { 'scripts/a.sh': CLEAN }, excludes: { 'docker/aa-run.sh': { codes: ['SC2045'], reason: REASON, may_be_absent: true } } });
    const r = run(dir, bin);
    expect(r.code).toBe(0);
  });

  test('an entry for a file outside the scanned globs → REFUSED', () => {
    const { dir, bin } = tree({ files: { 'scripts/a.sh': CLEAN, 'src/x.sh': CLEAN }, excludes: { 'src/x.sh': { codes: ['SC2155'], reason: REASON } } });
    const r = run(dir, bin);
    expect(r.code).toBe(1);
    expect(r.err).toContain('src/x.sh');
  });
});

describe('shellcheck.sh — fails closed', () => {
  test('a shellcheck tool error (exit 2) → REFUSED, never PASS', () => {
    const { dir, bin } = tree({ files: { 'scripts/a.sh': CLEAN }, toolError: true });
    const r = run(dir, bin);
    expect(r.code).toBe(1);
    expect(`${r.out}${r.err}`).not.toContain('PASS');
    expect(r.err).toContain('REFUSED');
  });

  test('no shell files found (wrong working directory) → REFUSED', () => {
    const { dir, bin } = tree({ files: {} });
    const r = run(dir, bin);
    expect(r.code).toBe(1);
    expect(r.err).toContain('REFUSED');
  });

  test('a non-JSON exclusions file → REFUSED', () => {
    const { dir, bin } = tree({ files: { 'scripts/a.sh': CLEAN }, excludes: '<<not json>>' });
    const r = run(dir, bin);
    expect(r.code).toBe(1);
    expect(r.err).toContain('REFUSED');
  });

  test('a missing shellcheck binary → REFUSED', () => {
    const { dir } = tree({ files: { 'scripts/a.sh': CLEAN } });
    const r = run(dir, join(dir, 'no-such-shellcheck'));
    expect(r.code).toBe(1);
    expect(r.err).toContain('REFUSED');
  });
});

describe('.github/shellcheck-excludes.json — the shipped list', () => {
  const cfg = JSON.parse(readFileSync(EXCLUDES, 'utf-8')) as { files: Record<string, Excl> };

  test('every entry names a scanned file, real codes and a reason', () => {
    const entries = Object.entries(cfg.files);
    expect(entries.length).toBeGreaterThan(0);
    for (const [f, e] of entries) {
      expect(f).toMatch(/^(scripts|docker|\.github\/scripts)\/[^/]+\.sh$/);
      expect(e.codes.length).toBeGreaterThan(0);
      for (const c of e.codes) expect(c).toMatch(/^SC\d{4}$/);
      expect(e.reason.length).toBeGreaterThanOrEqual(20);
      if (!e.may_be_absent) expect(existsSync(join(ROOT, f))).toBe(true);
    }
  });

  test('the .github/scripts gates themselves carry no exclusions (they are fixed inline or clean)', () => {
    for (const f of Object.keys(cfg.files)) expect(f.startsWith('.github/')).toBe(false);
  });
});

// The real binary over the real tree. CI's shellcheck job runs this check with
// the pinned binary; here it runs only when SHELLCHECK_BIN names one explicitly
// (not whatever `shellcheck` is on PATH: GitHub's runner image ships its own,
// unpinned version, whose findings can differ from the pinned one's).
const REAL = process.env.SHELLCHECK_BIN || '';
describe.skipIf(!REAL)('shellcheck.sh — the real tree with the real binary', () => {
  test('passes at severity warning with the shipped exclusions', () => {
    const r = Bun.spawnSync(['bash', SCRIPT], { cwd: ROOT, stdout: 'pipe', stderr: 'pipe', env: { ...process.env, SHELLCHECK_BIN: REAL } });
    const err = new TextDecoder().decode(r.stderr);
    expect(err).toBe('');
    expect(r.exitCode).toBe(0);
  });
});
