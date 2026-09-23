/**
 * tests/branch-rules-check.test.ts — the weekly ruleset check
 * (.github/scripts/check-branch-rules.sh, run by .github/workflows/repo-settings.yml).
 *
 * The review design (required ci / path-guard / secret-scan / dependency-audit
 * checks, changes only through a PR) is a GitHub setting, not a file. The
 * script reads GET /repos/{owner}/{repo}/rules/branches/main and must FAIL
 * CLOSED: a missing check, a missing PR rule, no ruleset at all, or an API
 * error is a red run, never a pass. A fake `gh` runs the script's own --jq
 * filter through real jq over canned payloads.
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync, chmodSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const ROOT = join(import.meta.dir, '..');
const SCRIPT = join(ROOT, '.github', 'scripts', 'check-branch-rules.sh');
const REPO = 'chrimar3/agent-athens';

let work: string;
beforeAll(() => { work = mkdtempSync(join(tmpdir(), 'aa-branch-rules-')); });
afterAll(() => { rmSync(work, { recursive: true, force: true }); });
let seq = 0;

const checks = (...names: string[]) => ({
  type: 'required_status_checks',
  ruleset_id: 1,
  parameters: { strict_required_status_checks_policy: false, required_status_checks: names.map((context) => ({ context })) },
});
const PR_RULE = { type: 'pull_request', ruleset_id: 1, parameters: { required_approving_review_count: 0, require_code_owner_review: false } };
const FULL = [PR_RULE, checks('ci', 'path-guard', 'secret-scan', 'dependency-audit'), { type: 'deletion', ruleset_id: 1 }];

function fakeGh(payload: unknown, fail = false) {
  const dir = join(work, `gh-${seq++}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'rules.json'), JSON.stringify(payload));
  const gh = join(dir, 'fake-gh');
  writeFileSync(gh, `#!/bin/bash
printf '%s\\n' "$*" >> "${dir}/calls.log"
${fail ? 'echo "gh: HTTP 403 Resource not accessible" >&2; exit 1' : ''}
FILTER=''; prev=''
for a in "$@"; do [ "$prev" = "--jq" ] && FILTER="$a"; prev="$a"; done
case "$*" in
  "api repos/${REPO}/rules/branches/main"*) if [ -n "$FILTER" ]; then jq -r "$FILTER" < "${dir}/rules.json"; else cat "${dir}/rules.json"; fi; exit $?;;
esac
echo "fake-gh: unexpected call: $*" >&2; exit 64
`);
  chmodSync(gh, 0o755);
  return gh;
}

function run(gh: string, env: Record<string, string> = {}) {
  const r = Bun.spawnSync(['bash', SCRIPT], { cwd: ROOT, env: { PATH: process.env.PATH ?? '/usr/bin:/bin', REPO, BRANCH: 'main', GH_BIN: gh, ...env } });
  const dec = (b: Uint8Array) => new TextDecoder().decode(b);
  return { code: r.exitCode, out: dec(r.stdout), err: dec(r.stderr) };
}

describe('check-branch-rules.sh', () => {
  test('a ruleset with the PR rule and all four required checks passes', () => {
    const r = run(fakeGh(FULL));
    expect(r.err).toBe('');
    expect(r.code).toBe(0);
    expect(r.out).toContain('branch-rules: PASS');
  });

  test('checks spread across two rulesets still count', () => {
    const r = run(fakeGh([PR_RULE, checks('ci', 'path-guard'), checks('secret-scan', 'dependency-audit')]));
    expect(r.code).toBe(0);
  });

  test('each missing required check fails the run and is named', () => {
    for (const missing of ['ci', 'path-guard', 'secret-scan', 'dependency-audit']) {
      const names = ['ci', 'path-guard', 'secret-scan', 'dependency-audit'].filter((n) => n !== missing);
      const r = run(fakeGh([PR_RULE, checks(...names)]));
      expect(r.code).toBe(1);
      expect(r.err).toContain(`required status check '${missing}' is missing`);
    }
  });

  test('a check with a similar name does not count (exact context match)', () => {
    const r = run(fakeGh([PR_RULE, checks('ci-extra', 'path-guard', 'secret-scan', 'dependency-audit')]));
    expect(r.code).toBe(1);
    expect(r.err).toContain("'ci' is missing");
  });

  test('no pull_request rule fails the run', () => {
    const r = run(fakeGh([checks('ci', 'path-guard', 'secret-scan', 'dependency-audit')]));
    expect(r.code).toBe(1);
    expect(r.err).toContain('pull_request');
  });

  test('no ruleset at all (empty list, e.g. only classic protection) fails with the setup hint', () => {
    const r = run(fakeGh([]));
    expect(r.code).toBe(1);
    expect(r.err).toContain('ruleset');
  });

  test('an API error or a non-array payload fails closed', () => {
    expect(run(fakeGh(FULL, true)).code).toBe(1);
    expect(run(fakeGh({ message: 'Not Found' })).code).toBe(1);
  });

  test('missing REPO or BRANCH is refused', () => {
    const gh = fakeGh(FULL);
    expect(run(gh, { REPO: '' }).code).toBe(1);
    expect(run(gh, { BRANCH: '' }).code).toBe(1);
  });
});
