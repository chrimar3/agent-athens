/**
 * tests/path-guard.test.ts — the required `path-guard` PR check.
 *
 * The guard's whole job is to FAIL CLOSED: an unreachable GitHub API, a
 * truncated file list or an unreadable glob list must never be reported as a
 * clean PR. These tests drive .github/scripts/path-guard.sh through a fake
 * `gh` (a bash 3.2 script in a temp dir, like tests/yield-canary.test.ts) that
 * logs its argv and serves canned API payloads. The fake runs the script's own
 * `--jq` filter through real jq, so the filter itself is under test and not
 * re-implemented by the fixture. GitHub is never touched.
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, chmodSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { parse as parseYaml } from 'yaml';

const ROOT = join(import.meta.dir, '..');
const SCRIPT = join(ROOT, '.github', 'scripts', 'path-guard.sh');
const CONFIG = join(ROOT, '.github', 'path-guard.json');
const WORKFLOW = join(ROOT, '.github', 'workflows', 'path-guard.yml');

const REPO = 'chrimar3/agent-athens';
const PR = '77';
const BASE = 'main';

type ChangedFile = { filename: string; previous_filename?: string };

type GhFixture = {
  /** Protected globs served as the BASE branch's .github/path-guard.json. */
  globs?: string[];
  /** Raw decoded text for the contents payload — overrides `globs` (non-JSON cases). */
  contentsDecoded?: string;
  files?: ChangedFile[];
  /** What the PR metadata claims; defaults to files.length. */
  changedFiles?: number;
  failContents?: boolean;
  failMeta?: boolean;
  failFiles?: boolean;
};

let work: string;
beforeAll(() => { work = mkdtempSync(join(tmpdir(), 'aa-path-guard-')); });
afterAll(() => { rmSync(work, { recursive: true, force: true }); });

let seq = 0;

/**
 * Fake `gh`: logs each call (flattened to one line) and answers the three API
 * reads plus `pr comment` / `pr edit`. `--jq FILTER` is applied with real jq
 * over the canned raw payload, exactly as gh would.
 */
function fakeGh(fx: GhFixture): { gh: string; log: string; dir: string } {
  const dir = join(work, `gh-${seq++}`);
  const { mkdirSync } = require('fs') as typeof import('fs');
  mkdirSync(dir, { recursive: true });
  const gh = join(dir, 'fake-gh');
  const log = join(dir, 'gh-calls.log');

  const decoded = fx.contentsDecoded ?? JSON.stringify({ protected: fx.globs ?? [] });
  writeFileSync(join(dir, 'contents.json'), JSON.stringify({ content: Buffer.from(decoded, 'utf-8').toString('base64') }));
  const files = fx.files ?? [];
  writeFileSync(join(dir, 'files.json'), JSON.stringify(files.map((f) => ({
    filename: f.filename,
    ...(f.previous_filename === undefined ? {} : { previous_filename: f.previous_filename }),
  }))));
  writeFileSync(join(dir, 'meta.json'), JSON.stringify({ number: Number(PR), changed_files: fx.changedFiles ?? files.length }));
  if (fx.failContents) writeFileSync(join(dir, 'fail-contents'), '');
  if (fx.failMeta) writeFileSync(join(dir, 'fail-meta'), '');
  if (fx.failFiles) writeFileSync(join(dir, 'fail-files'), '');

  writeFileSync(gh, `#!/bin/bash
D="${dir}"
printf '%s' "$*" | tr '\\n' ' ' >> "$D/gh-calls.log"; printf '\\n' >> "$D/gh-calls.log"
FILTER=''
prev=''
for a in "$@"; do
  if [ "$prev" = "--jq" ]; then FILTER="$a"; fi
  prev="$a"
done
serve() {
  if [ -n "$FILTER" ]; then jq -r "$FILTER" < "$1"; else cat "$1"; fi
}
case "$*" in
  *"contents/.github/path-guard.json"*)
    if [ -f "$D/fail-contents" ]; then echo "gh: HTTP 404 Not Found (contents)" >&2; exit 1; fi
    serve "$D/contents.json"; exit 0;;
  *"/files"*)
    if [ -f "$D/fail-files" ]; then echo "gh: HTTP 502 Bad Gateway (files)" >&2; exit 1; fi
    serve "$D/files.json"; exit 0;;
  "api repos/"*"/pulls/"*)
    if [ -f "$D/fail-meta" ]; then echo "gh: HTTP 500 Internal Server Error (meta)" >&2; exit 1; fi
    serve "$D/meta.json"; exit 0;;
  "pr comment"*) echo "https://github.com/x/y/pull/77#issuecomment-1"; exit 0;;
  "pr edit"*) exit 0;;
esac
echo "fake-gh: unexpected call: $*" >&2; exit 64
`);
  chmodSync(gh, 0o755);
  return { gh, log, dir };
}

function runGuard(gh: string, env: Record<string, string> = {}) {
  const r = Bun.spawnSync(['bash', SCRIPT], {
    cwd: ROOT,
    stdout: 'pipe',
    stderr: 'pipe',
    env: { ...process.env, REPO, PR, BASE, GH_BIN: gh, ...env },
  });
  const dec = (b: Uint8Array) => new TextDecoder().decode(b);
  return { code: r.exitCode, out: dec(r.stdout), err: dec(r.stderr) };
}

function calls(log: string): string[] {
  if (!existsSync(log)) return [];
  return readFileSync(log, 'utf-8').split('\n').filter((l) => l.length > 0);
}

const GLOBS = ['config/**', 'data/**', '.github/**', 'scripts/hooks/**', '.env*'];

describe('path-guard.sh — clean PRs pass', () => {
  test('(a) no protected path touched → exit 0, PASS line, no comment and no label', () => {
    const { gh, log } = fakeGh({ globs: GLOBS, files: [{ filename: 'src/app.ts' }, { filename: 'README.md' }] });
    const r = runGuard(gh);
    expect(r.err).toBe('');
    expect(r.code).toBe(0);
    expect(r.out.trim()).toBe('path-guard: PASS — 2 changed file(s), none protected');
    const c = calls(log);
    expect(c.filter((l) => l.startsWith('pr comment'))).toHaveLength(0);
    expect(c.filter((l) => l.startsWith('pr edit'))).toHaveLength(0);
  });
});

describe('path-guard.sh — protected touches are refused', () => {
  test('(b) a protected path → exit 1, ONE comment naming path+glob, needs-input label', () => {
    const { gh, log } = fakeGh({ globs: GLOBS, files: [{ filename: 'src/app.ts' }, { filename: 'config/athens-venues.json' }] });
    const r = runGuard(gh);
    expect(r.code).toBe(1);
    expect(r.out).not.toContain('PASS');
    expect(r.err).toContain('path-guard: REFUSED');
    expect(r.err).toContain('config/athens-venues.json');
    expect(r.err).toContain('config/**');

    const comments = calls(log).filter((l) => l.startsWith('pr comment'));
    expect(comments).toHaveLength(1);
    expect(comments[0]).toContain('config/athens-venues.json');
    expect(comments[0]).toContain('config/**');
    const labels = calls(log).filter((l) => l.startsWith('pr edit'));
    expect(labels).toHaveLength(1);
    expect(labels[0]).toContain('--add-label needs-input');
  });

  test('(c) rename OUT of a protected dir (new name unprotected) → exit 1', () => {
    const { gh, log } = fakeGh({
      globs: GLOBS,
      files: [{ filename: 'misc/athens-venues.json', previous_filename: 'config/athens-venues.json' }],
    });
    const r = runGuard(gh);
    expect(r.code).toBe(1);
    expect(r.out).not.toContain('PASS');
    expect(r.err).toContain('config/athens-venues.json');
    expect(calls(log).filter((l) => l.startsWith('pr comment'))).toHaveLength(1);
  });

  test('(d) rename INTO a protected dir → exit 1', () => {
    const { gh } = fakeGh({
      globs: GLOBS,
      files: [{ filename: 'config/smuggled.json', previous_filename: 'misc/smuggled.json' }],
    });
    const r = runGuard(gh);
    expect(r.code).toBe(1);
    expect(r.err).toContain('config/smuggled.json');
  });

  test('(h) a protected filename containing a space is matched as one path', () => {
    const { gh, log } = fakeGh({
      globs: GLOBS,
      files: [{ filename: 'docs/my notes.md' }, { filename: 'config/my venues.json' }],
    });
    const r = runGuard(gh);
    expect(r.code).toBe(1);
    expect(r.err).toContain('config/my venues.json');
    expect(r.err).not.toContain('docs/my notes.md');
    // One hit, not two halves of a split name.
    expect(r.err).toContain('1 protected path(s) touched');
    expect(calls(log).filter((l) => l.startsWith('pr comment'))).toHaveLength(1);
  });
});

describe('path-guard.sh — fails closed on every error path', () => {
  test('(e) the files API failing → exit 1, REFUSED, never PASS, no comment', () => {
    const { gh, log } = fakeGh({ globs: GLOBS, files: [{ filename: 'src/app.ts' }], failFiles: true });
    const r = runGuard(gh);
    expect(r.code).toBe(1);
    expect(`${r.out}${r.err}`).not.toContain('PASS');
    expect(r.err).toContain('path-guard: REFUSED');
    // Cause-specific: only the files-API guard itself can print this line, so
    // deleting that guard cannot be satisfied by a downstream count mismatch.
    expect(r.err).toContain('could not list the files changed in PR #');
    expect(r.err).toContain('failing closed');
    expect(calls(log).filter((l) => l.startsWith('pr comment'))).toHaveLength(0);
  });

  test('the contents API failing → exit 1, REFUSED, never PASS', () => {
    const { gh } = fakeGh({ globs: GLOBS, files: [{ filename: 'src/app.ts' }], failContents: true });
    const r = runGuard(gh);
    expect(r.code).toBe(1);
    expect(`${r.out}${r.err}`).not.toContain('PASS');
    expect(r.err).toContain('path-guard: REFUSED');
    expect(r.err).toContain('could not read .github/path-guard.json from');
  });

  test('the PR metadata failing → exit 1, REFUSED, never PASS', () => {
    const { gh } = fakeGh({ globs: GLOBS, files: [{ filename: 'src/app.ts' }], failMeta: true });
    const r = runGuard(gh);
    expect(r.code).toBe(1);
    expect(`${r.out}${r.err}`).not.toContain('PASS');
    expect(r.err).toContain('path-guard: REFUSED');
    expect(r.err).toContain('could not read PR #');
    expect(r.err).toContain('metadata');
  });

  test('the files API failing on a PR whose metadata says 0 changed files → still REFUSED (the count check cannot stand in for the guard)', () => {
    const { gh } = fakeGh({ globs: GLOBS, files: [], changedFiles: 0, failFiles: true });
    const r = runGuard(gh);
    expect(r.code).toBe(1);
    expect(r.out).not.toContain('PASS');
    expect(r.err).toContain('could not list the files changed in PR #');
  });

  test('(f) changed_files says 3 but the files API returns 2 → exit 1, REFUSED', () => {
    const { gh, log } = fakeGh({
      globs: GLOBS,
      files: [{ filename: 'src/a.ts' }, { filename: 'src/b.ts' }],
      changedFiles: 3,
    });
    const r = runGuard(gh);
    expect(r.code).toBe(1);
    expect(`${r.out}${r.err}`).not.toContain('PASS');
    expect(r.err).toContain('path-guard: REFUSED');
    expect(r.err).toContain('2');
    expect(r.err).toContain('3');
    expect(calls(log).filter((l) => l.startsWith('pr comment'))).toHaveLength(0);
  });

  test('a PR over the 3000-file API cap → exit 1, REFUSED', () => {
    const { gh } = fakeGh({ globs: GLOBS, files: [{ filename: 'src/a.ts' }], changedFiles: 3001 });
    const r = runGuard(gh);
    expect(r.code).toBe(1);
    expect(`${r.out}${r.err}`).not.toContain('PASS');
    expect(r.err).toContain('3000');
  });

  test('(g) an empty protected-glob list → exit 1, REFUSED', () => {
    const { gh } = fakeGh({ globs: [], files: [{ filename: 'src/app.ts' }] });
    const r = runGuard(gh);
    expect(r.code).toBe(1);
    expect(`${r.out}${r.err}`).not.toContain('PASS');
    expect(r.err).toContain('path-guard: REFUSED');
  });

  test('a non-JSON path-guard.json → exit 1, REFUSED', () => {
    const { gh } = fakeGh({ contentsDecoded: '<<< not json at all >>>', files: [{ filename: 'src/app.ts' }] });
    const r = runGuard(gh);
    expect(r.code).toBe(1);
    expect(`${r.out}${r.err}`).not.toContain('PASS');
    expect(r.err).toContain('path-guard: REFUSED');
  });

  test('missing PR/REPO/BASE env → exit 1, REFUSED', () => {
    const { gh } = fakeGh({ globs: GLOBS, files: [{ filename: 'src/app.ts' }] });
    for (const blank of ['REPO', 'PR', 'BASE']) {
      const r = runGuard(gh, { [blank]: '' });
      expect(r.code).toBe(1);
      expect(r.err).toContain('path-guard: REFUSED');
    }
  });
});

// ---------------------------------------------------------------------------
// (i) The glob list actually shipped in .github/path-guard.json, judged by the
// real matcher in the script — not by a re-implementation in this test.
// ---------------------------------------------------------------------------
describe('.github/path-guard.json — the shipped glob list', () => {
  const MUST_PROTECT = [
    '.claude/settings.json',
    '.claude/settings.local.json',
    '.claude/CLAUDE.md',
    '.claude/worker.md',
    '.claude/analyst-triage.md',
    'scripts/hooks/db-guard.ts',
    'bunfig.toml',
    'tests/preload/prod-db-guard.preload.ts',
    'scripts/daily-automated.sh',
    'scripts/deploy-gate.sh',
    'scripts/auto-enrich.sh',
    'scripts/precommit-tsc.sh',
    'scripts/install-hooks.sh',
    'scripts/redeploy.sh',
    'scripts/phase3-weekly.sh',
    'package.json',
    'tsconfig.json',
    'bun.lock',
    'netlify.toml',
    'com.agentathens.daily.plist',
    'com.agentathens.phase3-weekly.plist',
    'src/config/active-source-ids.ts',
    'config/athens-venues.json',
    'data/events.db',
    '.github/workflows/ci.yml',
    '.github/path-guard.json',
    '.github/scripts/path-guard.sh',
    'docs/INTENT.md',
    'docs/MASTER-ENRICHMENT-TEMPLATE.md',
    '.env',
  ];
  const MUST_NOT_PROTECT = [
    '.claude/notes/ledger.md',
    '.claude/analyst-playbook.md',
    'exemplars/proposals/x.md',
  ];

  const shipped: string[] = JSON.parse(readFileSync(CONFIG, 'utf-8')).protected;

  test('fixture precondition: every must-protect path names a file that exists (or a known local-only path)', () => {
    expect(shipped.length).toBeGreaterThan(10);
    // Gitignored or generated files that a fresh checkout (CI, a scratch clone)
    // does not have. They stay on MUST_PROTECT because the glob list must still
    // refuse them; only the existence precondition skips them.
    const allowMissing = new Set(['data/events.db', '.env', '.claude/settings.local.json', 'config/athens-venues.json']);
    for (const p of MUST_PROTECT) {
      if (allowMissing.has(p)) continue;
      expect(existsSync(join(ROOT, p))).toBe(true);
    }
  });

  test('every must-protect path is refused by the shipped glob list', () => {
    const { gh } = fakeGh({ globs: shipped, files: MUST_PROTECT.map((filename) => ({ filename })) });
    const r = runGuard(gh);
    expect(r.code).toBe(1);
    for (const p of MUST_PROTECT) expect(r.err).toContain(p);
    expect(r.err).toContain(`${MUST_PROTECT.length} protected path(s) touched`);
  });

  test('the deliberately-unprotected paths still pass', () => {
    const { gh, log } = fakeGh({ globs: shipped, files: MUST_NOT_PROTECT.map((filename) => ({ filename })) });
    const r = runGuard(gh);
    expect(r.err).toBe('');
    expect(r.code).toBe(0);
    expect(r.out).toContain('none protected');
    expect(calls(log).filter((l) => l.startsWith('pr comment'))).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// The workflow is the only thing branch protection can see: its job NAME is the
// required check, and the trigger must stay pull_request_target with no
// checkout of PR code.
// ---------------------------------------------------------------------------
describe('.github/workflows/path-guard.yml — the required check wiring', () => {
  const wf = parseYaml(readFileSync(WORKFLOW, 'utf-8'));

  test('job is named path-guard and triggers on pull_request_target', () => {
    expect(Object.keys(wf.jobs)).toContain('path-guard');
    // YAML 1.1 folds a bare `on:` key to boolean true; accept either spelling.
    const triggers = wf.on ?? wf[true as unknown as string];
    expect(Object.keys(triggers)).toContain('pull_request_target');
  });

  test('permissions allow commenting and labelling', () => {
    expect(wf.permissions['pull-requests']).toBe('write');
    expect(wf.permissions.issues).toBe('write');
  });

  test('the job runs the unit-tested script with REPO/PR/BASE in env', () => {
    const steps = wf.jobs['path-guard'].steps;
    const runStep = steps.find((s: { run?: string }) => typeof s.run === 'string' && s.run.includes('path-guard.sh'));
    expect(runStep).toBeDefined();
    expect(runStep.run).toContain('.github/scripts/path-guard.sh');
    expect(runStep.env.REPO).toContain('github.repository');
    expect(runStep.env.PR).toContain('pull_request.number');
    expect(runStep.env.BASE).toContain('base.ref');
    expect(runStep.env.GH_TOKEN).toContain('github.token');
  });

  test('no step checks out the PR head, and no checkout persists the write token (pull_request_target)', () => {
    const steps = wf.jobs['path-guard'].steps;
    const checkouts = steps.filter((s: { uses?: string }) => typeof s.uses === 'string' && s.uses.startsWith('actions/checkout'));
    expect(checkouts.length).toBeGreaterThan(0); // precondition: the assertions below cannot go vacuous
    for (const s of checkouts) {
      const ref = s.with?.ref;
      // Default (no ref) is the BASE branch under pull_request_target — safe.
      expect(ref === undefined || String(ref).includes('base.ref')).toBe(true);
      // The job runs with pull-requests/issues write; the checked-out tree must
      // not carry that token for anything that runs afterwards to find.
      const pc = s.with?.['persist-credentials'];
      expect(pc === false || String(pc) === 'false').toBe(true);
    }
  });
});
