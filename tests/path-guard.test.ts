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
  /** Round 8: the PR head the API reports (default HEAD). */
  headSha?: string;
  /** Round 8: head SHAs served by successive PR-metadata calls (overrides headSha per call). */
  headShaSequence?: string[];
  /** Round 8: the default branch's .github/CODEOWNERS (default: `* @chrimar3`). */
  codeowners?: string;
  /** Round 8: the PR's reviews, as the reviews API returns them. */
  reviews?: Review[];
  failCodeowners?: boolean;
  failReviews?: boolean;
};

type Review = { id: number; user: { login: string; type: string }; state: string; commit_id: string };

/** Round 8: the PR head the event names, and an older commit of the same PR. */
const HEAD = 'a'.repeat(40);
const OLD = 'b'.repeat(40);
let reviewId = 1000;
function review(login: string, state: string, commit_id: string = HEAD, type = 'User'): Review {
  return { id: reviewId++, user: { login, type }, state, commit_id };
}

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
  const meta = (sha: string) => JSON.stringify({ number: Number(PR), changed_files: fx.changedFiles ?? files.length, head: { sha } });
  writeFileSync(join(dir, 'meta.json'), meta(fx.headSha ?? HEAD));
  (fx.headShaSequence ?? []).forEach((sha, i) => writeFileSync(join(dir, `meta-${i + 1}.json`), meta(sha)));
  writeFileSync(join(dir, 'codeowners.json'), JSON.stringify({ content: Buffer.from(fx.codeowners ?? '* @chrimar3\n', 'utf-8').toString('base64') }));
  writeFileSync(join(dir, 'reviews.json'), JSON.stringify(fx.reviews ?? []));
  if (fx.failContents) writeFileSync(join(dir, 'fail-contents'), '');
  if (fx.failMeta) writeFileSync(join(dir, 'fail-meta'), '');
  if (fx.failFiles) writeFileSync(join(dir, 'fail-files'), '');
  if (fx.failCodeowners) writeFileSync(join(dir, 'fail-codeowners'), '');
  if (fx.failReviews) writeFileSync(join(dir, 'fail-reviews'), '');

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
  *"contents/.github/CODEOWNERS"*)
    if [ -f "$D/fail-codeowners" ]; then echo "gh: HTTP 404 Not Found (codeowners)" >&2; exit 1; fi
    serve "$D/codeowners.json"; exit 0;;
  *"/files"*)
    if [ -f "$D/fail-files" ]; then echo "gh: HTTP 502 Bad Gateway (files)" >&2; exit 1; fi
    serve "$D/files.json"; exit 0;;
  *"/reviews"*)
    if [ -f "$D/fail-reviews" ]; then echo "gh: HTTP 502 Bad Gateway (reviews)" >&2; exit 1; fi
    serve "$D/reviews.json"; exit 0;;
  "api repos/"*"/pulls/"*)
    if [ -f "$D/fail-meta" ]; then echo "gh: HTTP 500 Internal Server Error (meta)" >&2; exit 1; fi
    n=$(( $(cat "$D/meta-count" 2>/dev/null || echo 0) + 1 )); echo "$n" > "$D/meta-count"
    if [ -f "$D/meta-$n.json" ]; then serve "$D/meta-$n.json"; else serve "$D/meta.json"; fi
    exit 0;;
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
    env: { ...process.env, REPO, PR, BASE, GLOBS_REF: 'main', HEAD_SHA: HEAD, GH_BIN: gh, ...env },
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
    // Round 3: the comment names the matched globs (default-branch content) and
    // a count; the filenames themselves are attacker-chosen and stay in the log.
    expect(comments[0]).not.toContain('config/athens-venues.json');
    expect(comments[0]).toContain('config/**');
    expect(comments[0]).toContain('1 protected path');
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

// ---------------------------------------------------------------------------
// Round 5: matching ignores case. The owner's Mac (APFS default) is
// case-insensitive, so `.Claude/settings.json` in a PR IS .claude/settings.json
// once checked out there, and `SCRIPTS/hooks/x` lands in scripts/hooks/.
// ---------------------------------------------------------------------------
describe('path-guard.sh — case-insensitive matching (round 5)', () => {
  const shipped: string[] = JSON.parse(readFileSync(CONFIG, 'utf-8')).protected;

  for (const filename of ['.Claude/settings.json', 'SCRIPTS/hooks/x', 'Scripts/Deploy-Gate.sh', '.GITHUB/workflows/ci.yml', 'Netlify.toml', '.ENV']) {
    test(`${filename} is refused by the shipped glob list`, () => {
      const { gh } = fakeGh({ globs: shipped, files: [{ filename }] });
      const r = runGuard(gh);
      expect(r.code).toBe(1);
      expect(r.out).not.toContain('PASS');
      expect(r.err).toContain(filename);
    });
  }

  test('a rename out of a protected dir spelled in another case is refused', () => {
    const { gh } = fakeGh({ globs: shipped, files: [{ filename: 'misc/db-guard.ts', previous_filename: 'Scripts/Hooks/db-guard.ts' }] });
    const r = runGuard(gh);
    expect(r.code).toBe(1);
    expect(r.err).toContain('renamed out of protected');
  });

  test('case folding does not widen the list: unrelated paths still pass', () => {
    const { gh } = fakeGh({ globs: shipped, files: [{ filename: 'SRC/app.ts' }, { filename: 'Docs/notes.md' }] });
    const r = runGuard(gh);
    expect(r.err).toBe('');
    expect(r.code).toBe(0);
  });

  test('case folding is scoped to the match loop (the PR-number check still rejects letters)', () => {
    const src = readFileSync(SCRIPT, 'utf-8');
    const on = src.indexOf('shopt -s nocasematch');
    const off = src.indexOf('shopt -u nocasematch');
    expect(on).toBeGreaterThan(src.indexOf("case \"$PR\" in"));
    expect(off).toBeGreaterThan(on);
    expect(src.slice(on, off)).toContain('[[ "$f" == $g ]]');
  });
});

// ---------------------------------------------------------------------------
// Round 3: the bot comment must not reflect attacker-chosen filenames. A fork PR
// controls every changed path, and a name holding a backtick breaks out of a
// code span — the project's bot would then post the attacker's markdown (a
// phishing link, an @mention). The comment carries a count, the matched globs
// (read from the default branch, so not PR-controlled) and a link to the job
// log; the names go to the log only, with control characters replaced so a
// name holding a newline cannot start a `::workflow-command::` line.
// ---------------------------------------------------------------------------
describe('path-guard.sh — the bot comment reflects no PR-controlled text', () => {
  // Round 8: the comment now names the code owner (`@chrimar3`, from the
  // default branch's CODEOWNERS), so the planted mention is someone else.
  const HOSTILE = 'data/x` [Security fix required](https://evil.example/login) @victim-user `y.md';

  test('a filename with backticks, a markdown link and an @mention never reaches the comment', () => {
    const { gh, log } = fakeGh({ globs: GLOBS, files: [{ filename: HOSTILE }] });
    const r = runGuard(gh, { GITHUB_SERVER_URL: 'https://github.com', GITHUB_RUN_ID: '123456' });
    expect(r.code).toBe(1);
    const comments = calls(log).filter((l) => l.startsWith('pr comment'));
    expect(comments).toHaveLength(1);
    for (const piece of ['evil.example', 'Security fix required', '@victim-user', 'x`', '](https://evil']) expect(comments[0]).not.toContain(piece);
    expect(comments[0]).toContain('1 protected path');
    expect(comments[0]).toContain('`data/**`');
    expect(comments[0]).toContain(`https://github.com/${REPO}/actions/runs/123456`);
    // The job log still names the file, for the reviewer.
    expect(r.err).toContain('evil.example');
  });

  test('a rename out of a protected dir is described by count and glob, not by either name', () => {
    const { gh, log } = fakeGh({ globs: GLOBS, files: [{ filename: 'misc/[click](https://evil.example).json', previous_filename: 'config/a.json' }] });
    const r = runGuard(gh);
    expect(r.code).toBe(1);
    const comment = calls(log).find((l) => l.startsWith('pr comment'))!;
    expect(comment).not.toContain('evil.example');
    expect(comment).not.toContain('config/a.json');
    expect(comment).toContain('`config/**`');
  });

  test('without a run id the comment points to the job log in words (no half-built URL)', () => {
    const { gh, log } = fakeGh({ globs: GLOBS, files: [{ filename: 'config/a.json' }] });
    const r = runGuard(gh, { GITHUB_RUN_ID: '' });
    expect(r.code).toBe(1);
    const comment = calls(log).find((l) => l.startsWith('pr comment'))!;
    expect(comment).toContain('path-guard job log');
    expect(comment).not.toContain('/actions/runs/');
  });

  test('a filename holding a newline cannot inject a workflow command into the log', () => {
    const { gh } = fakeGh({ globs: GLOBS, files: [{ filename: 'config/a\n::error title=pwn::injected.json' }] });
    const r = runGuard(gh);
    expect(r.code).toBe(1);
    for (const line of `${r.out}\n${r.err}`.split('\n')) expect(line.startsWith('::')).toBe(false);
    expect(r.err).toContain('injected.json');
  });

  test('two hits under one glob are counted, and the glob is listed once', () => {
    const { gh, log } = fakeGh({ globs: GLOBS, files: [{ filename: 'config/a.json' }, { filename: 'config/b.json' }, { filename: '.github/x.yml' }] });
    runGuard(gh);
    const comment = calls(log).find((l) => l.startsWith('pr comment'))!;
    expect(comment).toContain('3 protected path');
    expect(comment.split('`config/**`').length - 1).toBe(1);
    expect(comment).toContain('`.github/**`');
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

  test('missing PR/REPO/BASE/GLOBS_REF env → exit 1, REFUSED', () => {
    const { gh } = fakeGh({ globs: GLOBS, files: [{ filename: 'src/app.ts' }] });
    for (const blank of ['REPO', 'PR', 'BASE', 'GLOBS_REF']) {
      const r = runGuard(gh, { [blank]: '' });
      expect(r.code).toBe(1);
      expect(r.err).toContain('path-guard: REFUSED');
    }
  });
});

describe('path-guard.sh — the glob list comes from the default branch', () => {
  test('a PR against an older side branch is judged by the default branch\'s list (ref=GLOBS_REF, never ref=BASE)', () => {
    const { gh, log } = fakeGh({ globs: GLOBS, files: [{ filename: 'src/app.ts' }] });
    const r = runGuard(gh, { BASE: 'old-side-branch', GLOBS_REF: 'main' });
    expect(r.code).toBe(0);
    const contents = calls(log).filter((l) => l.includes('contents/.github/path-guard.json'));
    expect(contents).toHaveLength(1);
    expect(contents[0]).toContain('ref=main');
    expect(contents[0]).not.toContain('old-side-branch');
  });
});

// ---------------------------------------------------------------------------
// Round 8: code-owner approval. A protected-path PR passes only when a code
// owner (default branch's CODEOWNERS, users only) has APPROVED the PR's
// CURRENT head, counting each reviewer's latest review only.
// ---------------------------------------------------------------------------
describe('path-guard.sh — code-owner approval on the current head (round 8)', () => {
  const touch = [{ filename: 'src/app.ts' }, { filename: 'config/athens-venues.json' }];

  test('the owner approved the current head → exit 0, PASS names the approval and the sha, no comment, no label', () => {
    const { gh, log } = fakeGh({ globs: GLOBS, files: touch, reviews: [review('chrimar3', 'APPROVED')] });
    const r = runGuard(gh);
    expect(r.err).toBe('');
    expect(r.code).toBe(0);
    expect(r.out).toContain('path-guard: PASS — 1 protected path(s) touched, approved by a code owner (@chrimar3) on aaaaaaa');
    expect(r.out).toContain('config/athens-venues.json (protected by config/**)');
    const c = calls(log);
    expect(c.filter((l) => l.startsWith('pr comment'))).toHaveLength(0);
    expect(c.filter((l) => l.startsWith('pr edit'))).toHaveLength(0);
    // CODEOWNERS and the reviews come from the API, CODEOWNERS from the default branch.
    expect(c.some((l) => l.includes('contents/.github/CODEOWNERS?ref=main'))).toBe(true);
    expect(c.some((l) => l.includes(`pulls/${PR}/reviews`))).toBe(true);
  });

  test('a push after the approval dismisses it: approval on an older commit → REFUSED, comment names the current head', () => {
    const { gh, log } = fakeGh({ globs: GLOBS, files: touch, reviews: [review('chrimar3', 'APPROVED', OLD)] });
    const r = runGuard(gh);
    expect(r.code).toBe(1);
    expect(r.out).not.toContain('PASS');
    expect(r.err).toContain('no approval by a code owner on the current head aaaaaaa');
    const comment = calls(log).find((l) => l.startsWith('pr comment'))!;
    expect(comment).toContain('`@chrimar3`');
    expect(comment).toContain('`aaaaaaa`');
    expect(comment).not.toContain('bbbbbbb');
    expect(calls(log).filter((l) => l.startsWith('pr edit'))).toHaveLength(1);
  });

  test('no review at all → REFUSED (the pre-round-8 behaviour for unapproved PRs)', () => {
    const { gh } = fakeGh({ globs: GLOBS, files: touch });
    const r = runGuard(gh);
    expect(r.code).toBe(1);
    expect(r.err).toContain('path-guard: REFUSED — 1 protected path(s) touched');
  });

  test('an approval by someone who is not the code owner → REFUSED', () => {
    const { gh } = fakeGh({ globs: GLOBS, files: touch, reviews: [review('helpful-stranger', 'APPROVED')] });
    const r = runGuard(gh);
    expect(r.code).toBe(1);
    expect(r.out).not.toContain('PASS');
  });

  test('owner logins compare case-insensitively (GitHub logins do)', () => {
    const { gh } = fakeGh({ globs: GLOBS, files: touch, codeowners: '* @ChriMar3\n', reviews: [review('chrimar3', 'APPROVED')] });
    expect(runGuard(gh).code).toBe(0);
  });

  test('a Bot account with the owner\'s login does not count', () => {
    const { gh } = fakeGh({ globs: GLOBS, files: touch, reviews: [review('chrimar3', 'APPROVED', HEAD, 'Bot')] });
    expect(runGuard(gh).code).toBe(1);
  });

  for (const later of ['COMMENTED', 'CHANGES_REQUESTED', 'DISMISSED']) {
    test(`only the latest review per reviewer counts: APPROVED then ${later} → REFUSED`, () => {
      const approved = review('chrimar3', 'APPROVED');
      const after = review('chrimar3', later);
      // Served newest-first to prove the order comes from the review id, not the array.
      const { gh } = fakeGh({ globs: GLOBS, files: touch, reviews: [after, approved] });
      const r = runGuard(gh);
      expect(r.code).toBe(1);
      expect(r.out).not.toContain('PASS');
    });
  }

  test('CHANGES_REQUESTED then APPROVED on the head → PASS; a pending review is ignored', () => {
    const cr = review('chrimar3', 'CHANGES_REQUESTED');
    const ok = review('chrimar3', 'APPROVED');
    const pending = review('chrimar3', 'PENDING');
    const { gh } = fakeGh({ globs: GLOBS, files: touch, reviews: [ok, cr, pending] });
    expect(runGuard(gh).code).toBe(0);
  });

  test('an approval with a malformed commit id or login is not counted', () => {
    for (const bad of [review('chrimar3', 'APPROVED', 'A'.repeat(40)), review('chrimar3', 'APPROVED', `${HEAD}\n`), review('chrimar3`x', 'APPROVED')]) {
      const { gh } = fakeGh({ globs: GLOBS, files: touch, codeowners: '* @chrimar3\n', reviews: [bad] });
      expect(runGuard(gh).code).toBe(1);
    }
  });

  test('last matching CODEOWNERS rule wins, per protected path', () => {
    const co = '*            @alice\n/config/     @chrimar3\n/.github/    @bob\n';
    // config/ is owned by chrimar3 only: alice's approval is not enough.
    let { gh } = fakeGh({ globs: GLOBS, files: touch, codeowners: co, reviews: [review('alice', 'APPROVED')] });
    expect(runGuard(gh).code).toBe(1);
    ({ gh } = fakeGh({ globs: GLOBS, files: touch, codeowners: co, reviews: [review('chrimar3', 'APPROVED')] }));
    expect(runGuard(gh).code).toBe(0);
    // Two protected paths with different owners need both owners.
    const two = [{ filename: 'config/a.json' }, { filename: '.github/x.yml' }];
    ({ gh } = fakeGh({ globs: GLOBS, files: two, codeowners: co, reviews: [review('chrimar3', 'APPROVED')] }));
    const r = runGuard(gh);
    expect(r.code).toBe(1);
    expect(r.err).toContain('for 1 protected name(s)');
    ({ gh } = fakeGh({ globs: GLOBS, files: two, codeowners: co, reviews: [review('chrimar3', 'APPROVED'), review('bob', 'APPROVED')] }));
    expect(runGuard(gh).code).toBe(0);
  });

  test('a rename out of a protected folder needs the owner of the OLD path', () => {
    const co = '* @alice\n/config/ @chrimar3\n';
    const files = [{ filename: 'misc/a.json', previous_filename: 'config/a.json' }];
    let { gh } = fakeGh({ globs: GLOBS, files, codeowners: co, reviews: [review('alice', 'APPROVED')] });
    expect(runGuard(gh).code).toBe(1);
    ({ gh } = fakeGh({ globs: GLOBS, files, codeowners: co, reviews: [review('chrimar3', 'APPROVED')] }));
    expect(runGuard(gh).code).toBe(0);
  });

  test('pattern semantics: anchored and unanchored names, one-level `*`, `**`, folders cover their contents', () => {
    const cases: Array<[string, string, boolean]> = [
      // [CODEOWNERS pattern owned by chrimar3 (the rest by alice), protected path, owned by chrimar3?]
      ['/config/', 'config/deep/x.json', true],
      ['/config/', 'x/config/a.json', false],
      ['config/', 'x/config/a.json', true], // only a trailing slash: unanchored, any folder named config
      ['*.json', 'config/deep/x.json', true],
      ['/config/*.json', 'config/deep/x.json', false],
      ['/config/**/x.json', 'config/a/b/x.json', true],
      ['/config/**', 'config/a/b/x.json', true],
      ['/.github/CODEOWNERS', '.github/codeowners', true],
      ['/config', 'config/a.json', true],
      ['/con?ig/', 'config/a.json', true],
    ];
    for (const [pat, path, owned] of cases) {
      const co = `* @alice\n${pat} @chrimar3\n`;
      const { gh } = fakeGh({ globs: ['**'], files: [{ filename: path }], codeowners: co, reviews: [review('chrimar3', 'APPROVED')] });
      const r = runGuard(gh);
      expect(`${pat} ${path} → ${r.code}`).toBe(`${pat} ${path} → ${owned ? 0 : 1}`);
    }
  });

  test('a team owner fails closed with a message (only user approvals can be verified)', () => {
    const { gh, log } = fakeGh({ globs: GLOBS, files: touch, codeowners: '* @chrimar3\n/config/ @chrimar3 @acme/maintainers\n', reviews: [review('chrimar3', 'APPROVED')] });
    const r = runGuard(gh);
    expect(r.code).toBe(1);
    expect(r.out).not.toContain('PASS');
    expect(r.err).toContain('names a team');
    expect(r.err).toContain('failing closed');
    expect(calls(log).filter((l) => l.startsWith('pr comment'))).toHaveLength(0);
  });

  test('a team on a rule that does not decide the touched path does not matter', () => {
    const { gh } = fakeGh({ globs: GLOBS, files: touch, codeowners: '/docs/ @acme/writers\n* @chrimar3\n', reviews: [review('chrimar3', 'APPROVED')] });
    expect(runGuard(gh).code).toBe(0);
  });

  test('an email owner, a rule with no owner, an uncovered path and an unsupported pattern each fail closed', () => {
    const bad: Array<[string, string]> = [
      ['* owner@example.com\n', 'not a @user login'],
      ['* @chrimar3\n/config/\n', 'names no owner'],
      ['/docs/ @chrimar3\n', 'no rule in'],
      ['* @chrimar3\n/config/[ab].json @chrimar3\n', 'cannot evaluate'],
      ['# only a comment\n', 'has no rules'],
    ];
    for (const [co, msg] of bad) {
      const { gh } = fakeGh({ globs: GLOBS, files: touch, codeowners: co, reviews: [review('chrimar3', 'APPROVED')] });
      const r = runGuard(gh);
      expect(r.code).toBe(1);
      expect(r.out).not.toContain('PASS');
      expect(r.err).toContain(msg);
    }
  });

  test('the head moving between the reads → REFUSED (the files, the approval and the checked commit must be one commit)', () => {
    // meta call 1 = changed_files, 2 = head before the reviews, 3 = head after them.
    const { gh } = fakeGh({ globs: GLOBS, files: touch, headShaSequence: [HEAD, HEAD, OLD], reviews: [review('chrimar3', 'APPROVED')] });
    const r = runGuard(gh);
    expect(r.code).toBe(1);
    expect(r.out).not.toContain('PASS');
    expect(r.err).toContain('moved to bbbbbbb');
  });

  test('the event head differing from the API head → REFUSED', () => {
    const { gh } = fakeGh({ globs: GLOBS, files: touch, headSha: OLD, reviews: [review('chrimar3', 'APPROVED', OLD)] });
    const r = runGuard(gh);
    expect(r.code).toBe(1);
    expect(r.err).toContain('moved to');
  });

  test('HEAD_SHA missing or malformed with a protected path touched → REFUSED; not needed for a clean PR', () => {
    for (const h of ['', 'A'.repeat(40), 'abc', `${HEAD}x`]) {
      const { gh } = fakeGh({ globs: GLOBS, files: touch, reviews: [review('chrimar3', 'APPROVED')] });
      const r = runGuard(gh, { HEAD_SHA: h });
      expect(r.code).toBe(1);
      expect(r.err).toContain('HEAD_SHA');
    }
    const { gh } = fakeGh({ globs: GLOBS, files: [{ filename: 'src/app.ts' }] });
    expect(runGuard(gh, { HEAD_SHA: '' }).code).toBe(0);
  });

  test('the reviews API or the CODEOWNERS read failing → REFUSED, never PASS, no comment', () => {
    for (const fx of [{ failReviews: true }, { failCodeowners: true }]) {
      const { gh, log } = fakeGh({ globs: GLOBS, files: touch, reviews: [review('chrimar3', 'APPROVED')], ...fx });
      const r = runGuard(gh);
      expect(r.code).toBe(1);
      expect(`${r.out}${r.err}`).not.toContain('PASS');
      expect(r.err).toContain('failing closed');
      expect(calls(log).filter((l) => l.startsWith('pr comment'))).toHaveLength(0);
    }
  });

  test('the shipped CODEOWNERS names a user owner for every protected path, so the owner\'s approval clears the shipped list', () => {
    const shipped: string[] = JSON.parse(readFileSync(CONFIG, 'utf-8')).protected;
    const codeowners = readFileSync(join(ROOT, '.github', 'CODEOWNERS'), 'utf-8');
    const files = ['.claude/settings.json', 'scripts/hooks/db-guard.ts', 'config/athens-venues.json', '.github/workflows/ci.yml', 'package.json', 'netlify.toml', 'src/watchdog/untrusted-db.ts', 'tests/security/x.test.ts', 'com.agentathens.daily.plist']
      .map((filename) => ({ filename }));
    let { gh } = fakeGh({ globs: shipped, files, codeowners, reviews: [review('chrimar3', 'APPROVED')] });
    const r = runGuard(gh);
    expect(r.err).toBe('');
    expect(r.code).toBe(0);
    ({ gh } = fakeGh({ globs: shipped, files, codeowners, reviews: [review('chrimar3', 'APPROVED', OLD)] }));
    expect(runGuard(gh).code).toBe(1);
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
    // Agent instructions loaded by sessions (slash commands, skills, subagents).
    '.claude/commands/pre-enrich-check.md',
    '.claude/skills/claude-code-mastery/SKILL.md',
    '.claude/agents/reviewer.md',
    // Code deployed to production with the site (round 5: the unused go.ts
    // click redirect was removed; any future function is still protected).
    'netlify/functions/any-future-function.ts',
    'netlify/edge-functions/any-future-edge-function.ts',
    'docker/Dockerfile',
    // Disclosure channel and review routing.
    'SECURITY.md',
    '.github/CODEOWNERS',
    '.github/dependabot.yml',
    '.github/gitleaks.toml',
    // Security tests: a PR weakening a guard must not also edit its test.
    'tests/db-guard-hook.test.ts',
    'tests/settings-security-pins.test.ts',
    'tests/path-guard.test.ts',
    'tests/netlify-headers.test.ts',
    'tests/workflow-security.test.ts',
    'scripts/__tests__/deploy-gate.test.ts',
    'scripts/db-read.ts',
    'tests/db-read.test.ts',
    'tests/auto-enrich-guard-selftest.test.ts',
    // Round 2: the enrichment chain the unattended session runs, and the guards
    // those scripts rely on (a PR that loosens one needs the owner's review).
    'scripts/save-batch.ts',
    'scripts/write-description.ts',
    'scripts/write-tags.ts',
    'scripts/auto-gate-check.ts',
    'scripts/generate-enrichment-brief.ts',
    'src/utils/batch-output-path.ts',
    'src/utils/outbound-url.ts',
    'src/utils/safe-url.ts',
    'src/ingest/allowed-senders.ts',
    'src/validators/published-artifacts.ts',
    'scripts/lib/chrome-path.ts',
    'tests/generate-enrichment-brief.test.ts',
    'tests/phase3-weekly-guard.test.ts',
    'tests/trusted-issue-thread.test.ts',
    '.github/scripts/trusted-issue-thread.sh',
    '.github/audit-ignore.json',
    // Security loop round 3: code that decides or performs production deploys.
    'src/watchdog/responders.ts',
    'src/watchdog/classifier.ts',
    'scripts/deadman-watchdog.ts',
    'scripts/check-published-artifacts.ts',
    'src/utils/build-provenance.ts',
    'tests/watchdog-responders.test.ts',
    'tests/daily-pipeline-deferred-publish.test.ts',
    'tests/daily-pipeline-staging.test.ts',
    // Round 4: output-safety modules the published site depends on, build state
    // read back from container-writable folders, URL-column writes, container CLIs.
    'src/validators/inline-script-allowlist.ts',
    'src/generators/security-headers.ts',
    'src/utils/html-escape.ts',
    'src/utils/html-json.ts',
    'src/validators/persisted-state.ts',
    'scripts/lib/url-columns.ts',
    'docker/cli/package.json',
    'docker/cli/package-lock.json',
    'src/watchdog/notify.ts',
    'src/watchdog/host-files.ts',
    'tests/security/osascript-argv.test.ts',
    'tests/security/host-log-symlink.test.ts',
    'tests/security/dependabot-container-cli.test.ts',
    'tests/host-run-guard.test.ts',
    // Round 5: the ci test-report check and its floor, and the new security tests.
    '.github/scripts/test-report-check.sh',
    '.github/scripts/test-report-floor.json',
    'tests/security/ci-test-report.test.ts',
    'tests/security/monitoring-labels.test.ts',
    'tests/security/no-click-redirect.test.ts',
    'config/monitoring.json',
    // Round 7: the security-alert CLI, its email transport, the deadman's
    // signal sources and the round-7 tests.
    'scripts/security-alert.ts',
    'src/watchdog/email.ts',
    'src/watchdog/signal-sources.ts',
    'tests/security/security-alert.test.ts',
    'tests/security/deadman-host-signals.test.ts',
    'tests/security/unattended-disallowed-tools.test.ts',
    // Round 8: the publish-trust modules and the publish-trust roots' direct
    // imports, the host jobs that read events.db through the untrusted-DB
    // reader and its CLI, the default-branch config reader, round-8 tests.
    'src/validators/verification-allowlist.ts',
    'src/config/analytics.ts',
    'src/ticketing/ticket-trust.ts',
    'src/ticketing/validator.ts',
    'src/ticketing/venue-registry.ts',
    'src/utils/ticket-source-classifier.ts',
    'src/db/url-columns.ts',
    'src/config/site-url.ts',
    'src/utils/tag-filter.ts',
    'src/enrichment/quality-gates.ts',
    'src/enrichment/word-counter.ts',
    'src/enrichment/description-generator.ts',
    'src/enrichment/enrichment-matrix.ts',
    'scripts/untrusted-db-query.ts',
    'scripts/daily-enrichment-check.sh',
    'scripts/weekly-digest.ts',
    'scripts/monitor-search-visibility.ts',
    '.github/scripts/default-branch-file.sh',
    'tests/branch-rules-check.test.ts',
    'src/watchdog/untrusted-db.ts',
    'src/watchdog/untrusted-db-runner.ts',
    '.github/scripts/live-site-check.sh',
    '.github/workflows/live-site-check.yml',
    'tests/security/untrusted-db.test.ts',
    'tests/security/publish-trust-protected.test.ts',
    // Round 9.
    'scripts/run-tests.sh',
    'scripts/phase1-exit-gate.ts',
    '.github/scripts/live-page-content.ts',
    'tests/security/test-discovery.test.ts',
    'tests/security/weekly-digest-host.test.ts',
  ];
  /** Listed by name in path-guard.json even where a broader glob already covers
   *  them, so narrowing that glob later cannot silently drop them. */
  const MUST_LIST_EXPLICITLY = [
    '.claude/commands/**',
    '.claude/skills/**',
    '.claude/agents/**',
    'netlify/**',
    'docker/**',
    'SECURITY.md',
    '.github/CODEOWNERS',
    'tests/db-guard-hook.test.ts',
    'tests/settings-security-pins.test.ts',
    'tests/path-guard.test.ts',
    'tests/netlify-headers.test.ts',
    'tests/workflow-security.test.ts',
    'scripts/__tests__/deploy-gate.test.ts',
    'scripts/db-read.ts',
    'tests/db-read.test.ts',
    'tests/auto-enrich-guard-selftest.test.ts',
    'tests/docker-hardening.test.ts',
    'tests/security/**',
    'scripts/save-batch.ts',
    'scripts/write-description.ts',
    'scripts/write-tags.ts',
    'scripts/auto-gate-check.ts',
    'scripts/generate-enrichment-brief.ts',
    'src/utils/batch-output-path.ts',
    'src/utils/outbound-url.ts',
    'src/utils/safe-url.ts',
    'src/ingest/allowed-senders.ts',
    'src/validators/published-artifacts.ts',
    'scripts/lib/chrome-path.ts',
    'tests/generate-enrichment-brief.test.ts',
    'tests/phase3-weekly-guard.test.ts',
    'tests/trusted-issue-thread.test.ts',
    'src/watchdog/**',
    'scripts/deadman-watchdog.ts',
    'scripts/check-published-artifacts.ts',
    'src/utils/build-provenance.ts',
    'tests/watchdog-responders.test.ts',
    'tests/daily-pipeline-deferred-publish.test.ts',
    'tests/daily-pipeline-staging.test.ts',
    'src/validators/inline-script-allowlist.ts',
    'src/generators/security-headers.ts',
    'src/utils/html-escape.ts',
    'src/utils/html-json.ts',
    'src/validators/persisted-state.ts',
    'scripts/lib/url-columns.ts',
    'docker/cli/**',
    'tests/host-run-guard.test.ts',
    '.github/scripts/test-report-check.sh',
    '.github/scripts/test-report-floor.json',
    'tests/security/ci-test-report.test.ts',
    'tests/security/monitoring-labels.test.ts',
    'tests/security/no-click-redirect.test.ts',
    'scripts/security-alert.ts',
    'src/validators/verification-allowlist.ts',
    'src/config/analytics.ts',
    'src/ticketing/ticket-trust.ts',
    'src/ticketing/validator.ts',
    'src/ticketing/venue-registry.ts',
    'src/utils/ticket-source-classifier.ts',
    'src/db/url-columns.ts',
    'src/config/site-url.ts',
    'src/utils/tag-filter.ts',
    'src/enrichment/quality-gates.ts',
    'src/enrichment/word-counter.ts',
    'src/enrichment/description-generator.ts',
    'src/enrichment/enrichment-matrix.ts',
    'scripts/untrusted-db-query.ts',
    'scripts/daily-enrichment-check.sh',
    'scripts/weekly-digest.ts',
    'scripts/monitor-search-visibility.ts',
    '.github/scripts/default-branch-file.sh',
    'tests/branch-rules-check.test.ts',
    'scripts/run-tests.sh',
    'scripts/phase1-exit-gate.ts',
    '.github/scripts/live-page-content.ts',
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
    // .claude/agents/ and docker/ do not exist yet; they are protected ahead of
    // first use. SECURITY.md may land in a separate PR. The round-2 guard
    // modules below exist on the regular branch but not in this one; they are
    // listed now so the list is right when the branches meet.
    const allowMissing = new Set([
      'data/events.db', '.env', '.claude/settings.local.json', 'config/athens-venues.json',
      '.claude/agents/reviewer.md', 'docker/Dockerfile', 'SECURITY.md',
      'src/utils/outbound-url.ts', 'src/utils/safe-url.ts', 'src/ingest/allowed-senders.ts', 'scripts/lib/chrome-path.ts',
      // Round 4: exist on the regular branch only (docker/ included).
      'src/validators/inline-script-allowlist.ts', 'src/generators/security-headers.ts',
      'src/validators/persisted-state.ts', 'scripts/lib/url-columns.ts',
      'docker/cli/package.json', 'docker/cli/package-lock.json',
      // Round 5: stands for any function added later (go.ts was removed).
      'netlify/functions/any-future-function.ts',
      // Round 8: likewise for edge functions (edge-probe.ts was removed).
      'netlify/edge-functions/any-future-edge-function.ts',
      // Round 8: publish-trust modules that exist on the regular branch only.
      'src/validators/verification-allowlist.ts', 'src/ticketing/ticket-trust.ts', 'src/db/url-columns.ts',
    ]);
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

  test('the guard, publishing and security-test paths are listed by name', () => {
    for (const g of MUST_LIST_EXPLICITLY) expect(shipped).toContain(g);
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

  test('round 8: re-runs on reviews (submitted, dismissed); pull_request_target only for PRs into main', () => {
    const triggers = wf.on ?? wf[true as unknown as string];
    expect(triggers.pull_request_target.branches).toEqual(['main']);
    expect(triggers.pull_request_target.types).toEqual(['opened', 'synchronize', 'reopened', 'edited']);
    expect([...triggers.pull_request_review.types].sort()).toEqual(['dismissed', 'submitted']);
    // The review event has no branch filter: the job itself runs only for PRs into the default branch.
    expect(wf.jobs['path-guard'].if).toBe('github.event.pull_request.base.ref == github.event.repository.default_branch');
  });

  test('workflow-level token is read-only; only the path-guard job may comment and label', () => {
    expect(wf.permissions).toEqual({ contents: 'read' });
    const jp = wf.jobs['path-guard'].permissions;
    expect(jp['pull-requests']).toBe('write');
    expect(jp.issues).toBe('write');
    expect(jp.contents).toBe('read');
  });

  test('the job runs the unit-tested script with REPO/PR/BASE/GLOBS_REF in env', () => {
    const steps = wf.jobs['path-guard'].steps;
    const runStep = steps.find((s: { run?: string }) => typeof s.run === 'string' && s.run.includes('path-guard.sh'));
    expect(runStep).toBeDefined();
    expect(runStep.run).toContain('.github/scripts/path-guard.sh');
    expect(runStep.env.REPO).toContain('github.repository');
    expect(runStep.env.PR).toContain('pull_request.number');
    expect(runStep.env.BASE).toContain('base.ref');
    expect(runStep.env.GLOBS_REF).toContain('repository.default_branch');
    expect(runStep.env.HEAD_SHA).toBe('${{ github.event.pull_request.head.sha }}');
    expect(runStep.env.GH_TOKEN).toContain('github.token');
  });

  test('no step checks out the PR head, and no checkout persists the write token (pull_request_target)', () => {
    const steps = wf.jobs['path-guard'].steps;
    const checkouts = steps.filter((s: { uses?: string }) => typeof s.uses === 'string' && s.uses.startsWith('actions/checkout'));
    expect(checkouts.length).toBeGreaterThan(0); // precondition: the assertions below cannot go vacuous
    for (const s of checkouts) {
      const ref = s.with?.ref;
      // Round 8: the default branch, named explicitly — under pull_request_review
      // the implicit ref is the PR's merge commit (PR code).
      expect(String(ref)).toBe('${{ github.event.repository.default_branch }}');
      // The job runs with pull-requests/issues write; the checked-out tree must
      // not carry that token for anything that runs afterwards to find.
      const pc = s.with?.['persist-credentials'];
      expect(pc === false || String(pc) === 'false').toBe(true);
    }
  });
});
