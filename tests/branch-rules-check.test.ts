/**
 * tests/branch-rules-check.test.ts — the weekly ruleset check
 * (.github/scripts/check-branch-rules.sh, run by .github/workflows/repo-settings.yml).
 *
 * The review design (required ci / path-guard / secret-scan / dependency-audit
 * / shellcheck / analyze (CodeQL) checks, changes only through a PR with
 * code-owner review — round 6 added the last two checks and made missing
 * code-owner review a failure) is a GitHub setting, not a file. The
 * script reads GET /repos/{owner}/{repo}/rules/branches/main and must FAIL
 * CLOSED: a missing check, a missing PR rule, no ruleset at all, or an API
 * error is a red run, never a pass. A fake `gh` runs the script's own --jq
 * filter through real jq over canned payloads.
 *
 * Round 7: the PR rule must also dismiss stale approvals on push and require
 * approval of the last push, and no ruleset behind the rules may list a bypass
 * actor. Bypass actors are only visible through GET
 * /repos/{owner}/{repo}/rulesets/{id}, and only to a token that can administer
 * the repository: absent → fail closed naming the permission. The fake `gh`
 * serves those per-ruleset payloads too and records which token read them.
 *
 * Round 8: private vulnerability reporting, secret scanning and push
 * protection must be enabled (read with the same admin-read token, failing
 * closed when hidden), and the token lives in the `repo-settings` environment.
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync, chmodSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { readFileSync } from 'fs';
import { parse as parseYaml } from 'yaml';

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
const PR_PARAMS = { required_approving_review_count: 0, require_code_owner_review: true, dismiss_stale_reviews_on_push: true, require_last_push_approval: true };
const PR_RULE = { type: 'pull_request', ruleset_id: 1, parameters: PR_PARAMS };
const REQUIRED = ['ci', 'path-guard', 'secret-scan', 'dependency-audit', 'shellcheck', 'analyze'];
const FULL = [PR_RULE, checks(...REQUIRED), { type: 'deletion', ruleset_id: 1 }];

/** Per-ruleset payloads for GET repos/{repo}/rulesets/{id}. Unlisted ids get
 *  `{ id, bypass_actors: [] }` (what an admin-capable token sees for a clean
 *  ruleset); a value of 'fail' makes that read fail like a 403. */
type Rulesets = Record<string, unknown>;

/** Round 8: the security-settings payloads. 'fail' makes that read fail like a 403. */
type Settings = { pvr?: unknown; repo?: unknown };
const SA_ON = { secret_scanning: { status: 'enabled' }, secret_scanning_push_protection: { status: 'enabled' } };
const SETTINGS_OK: Settings = { pvr: { enabled: true }, repo: { full_name: REPO, security_and_analysis: SA_ON } };

function fakeGh(payload: unknown, fail = false, rulesets: Rulesets = {}, settings: Settings = {}) {
  const dir = join(work, `gh-${seq++}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'rules.json'), JSON.stringify(payload));
  const st = { ...SETTINGS_OK, ...settings };
  for (const [name, body] of Object.entries(st)) {
    if (body === 'fail') writeFileSync(join(dir, `${name}.fail`), '');
    else writeFileSync(join(dir, `${name}.json`), JSON.stringify(body));
  }
  for (const [id, body] of Object.entries(rulesets)) {
    if (body === 'fail') writeFileSync(join(dir, `ruleset-${id}.fail`), '');
    else writeFileSync(join(dir, `ruleset-${id}.json`), JSON.stringify(body));
  }
  const gh = join(dir, 'fake-gh');
  writeFileSync(gh, `#!/bin/bash
printf '%s\\n' "$*" >> "${dir}/calls.log"
${fail ? 'echo "gh: HTTP 403 Resource not accessible" >&2; exit 1' : ''}
FILTER=''; prev=''
for a in "$@"; do [ "$prev" = "--jq" ] && FILTER="$a"; prev="$a"; done
case "$*" in
  "api repos/${REPO}/rules/branches/main"*) if [ -n "$FILTER" ]; then jq -r "$FILTER" < "${dir}/rules.json"; else cat "${dir}/rules.json"; fi; exit $?;;
  "api repos/${REPO}/rulesets/"*)
    id="\${2##*/}"
    printf '%s %s\\n' "$id" "\${GH_TOKEN:-<unset>}" >> "${dir}/ruleset-tokens.log"
    if [ -e "${dir}/ruleset-$id.fail" ]; then echo "gh: HTTP 404 Not Found" >&2; exit 1; fi
    if [ -e "${dir}/ruleset-$id.json" ]; then cat "${dir}/ruleset-$id.json"; else printf '{"id":%s,"enforcement":"active","bypass_actors":[]}\\n' "$id"; fi
    exit 0;;
  "api repos/${REPO}/private-vulnerability-reporting")
    printf 'pvr %s\\n' "\${GH_TOKEN:-<unset>}" >> "${dir}/settings-tokens.log"
    if [ -e "${dir}/pvr.fail" ]; then echo "gh: HTTP 403 Resource not accessible by personal access token" >&2; exit 1; fi
    cat "${dir}/pvr.json"; exit 0;;
  "api repos/${REPO}")
    printf 'repo %s\\n' "\${GH_TOKEN:-<unset>}" >> "${dir}/settings-tokens.log"
    if [ -e "${dir}/repo.fail" ]; then echo "gh: HTTP 403 Resource not accessible by personal access token" >&2; exit 1; fi
    cat "${dir}/repo.json"; exit 0;;
esac
echo "fake-gh: unexpected call: $*" >&2; exit 64
`);
  chmodSync(gh, 0o755);
  return gh;
}
const ghDir = (gh: string) => gh.replace(/\/fake-gh$/, '');

function run(gh: string, env: Record<string, string> = {}) {
  const r = Bun.spawnSync(['bash', SCRIPT], { cwd: ROOT, env: { PATH: process.env.PATH ?? '/usr/bin:/bin', REPO, BRANCH: 'main', GH_BIN: gh, ...env } });
  const dec = (b: Uint8Array) => new TextDecoder().decode(b);
  return { code: r.exitCode, out: dec(r.stdout), err: dec(r.stderr) };
}

describe('check-branch-rules.sh', () => {
  test('a ruleset with the PR rule (code-owner review) and all six required checks passes', () => {
    const r = run(fakeGh(FULL));
    expect(r.err).toBe('');
    expect(r.code).toBe(0);
    expect(r.out).toContain('branch-rules: PASS');
  });

  test('checks spread across two rulesets still count', () => {
    const r = run(fakeGh([PR_RULE, checks('ci', 'path-guard', 'shellcheck'), checks('secret-scan', 'dependency-audit', 'analyze')]));
    expect(r.code).toBe(0);
  });

  test('each missing required check fails the run and is named', () => {
    for (const missing of REQUIRED) {
      const names = REQUIRED.filter((n) => n !== missing);
      const r = run(fakeGh([PR_RULE, checks(...names)]));
      expect(r.code).toBe(1);
      expect(r.err).toContain(`required status check '${missing}' is missing`);
    }
  });

  test('a check with a similar name does not count (exact context match)', () => {
    const r = run(fakeGh([PR_RULE, checks('ci-extra', ...REQUIRED.filter((n) => n !== 'ci'))]));
    expect(r.code).toBe(1);
    expect(r.err).toContain("'ci' is missing");
  });

  // Round 6: CONTRIBUTING.md promises code-owner review; the ruleset must enforce it.
  test('a PR rule without code-owner review fails the run (false, or the parameter absent)', () => {
    for (const parameters of [{ ...PR_PARAMS, require_code_owner_review: false }, { required_approving_review_count: 1, dismiss_stale_reviews_on_push: true, require_last_push_approval: true }]) {
      const r = run(fakeGh([{ type: 'pull_request', ruleset_id: 1, parameters }, checks(...REQUIRED)]));
      expect(r.code).toBe(1);
      expect(r.err).toContain('code-owner review is not required');
      expect(r.out).not.toContain('PASS');
    }
  });

  test('code-owner review set in any ruleset\'s PR rule counts', () => {
    const noOwners = { type: 'pull_request', ruleset_id: 2, parameters: { ...PR_PARAMS, require_code_owner_review: false } };
    const r = run(fakeGh([noOwners, PR_RULE, checks(...REQUIRED)]));
    expect(r.code).toBe(0);
    expect(r.out).toContain('code-owner review');
  });

  test('a truthy non-boolean is not "required" (exact true only)', () => {
    const r = run(fakeGh([{ type: 'pull_request', ruleset_id: 1, parameters: { ...PR_PARAMS, require_code_owner_review: 'true' } }, checks(...REQUIRED)]));
    expect(r.code).toBe(1);
  });

  // Round 7: an approval must not cover commits pushed after it.
  test('a PR rule that keeps stale approvals, or lets the last pusher approve, fails the run (false, absent or non-boolean)', () => {
    for (const [param, msg] of [
      ['dismiss_stale_reviews_on_push', 'stale approvals are not dismissed on push'],
      ['require_last_push_approval', 'the most recent push does not need approval'],
    ] as const) {
      for (const value of [false, undefined, 'true']) {
        const parameters: Record<string, unknown> = { ...PR_PARAMS, [param]: value };
        if (value === undefined) delete parameters[param];
        const r = run(fakeGh([{ type: 'pull_request', ruleset_id: 1, parameters }, checks(...REQUIRED)]));
        expect(r.code).toBe(1);
        expect(r.err).toContain(msg);
        expect(r.err).toContain(param);
        expect(r.out).not.toContain('PASS');
      }
    }
  });

  test('stale-review dismissal and last-push approval may come from different rulesets\' PR rules', () => {
    const a = { type: 'pull_request', ruleset_id: 1, parameters: { ...PR_PARAMS, require_last_push_approval: false } };
    const b = { type: 'pull_request', ruleset_id: 2, parameters: { ...PR_PARAMS, dismiss_stale_reviews_on_push: false } };
    expect(run(fakeGh([a, b, checks(...REQUIRED)])).code).toBe(0);
  });

  test('the PASS line names every guarantee', () => {
    const r = run(fakeGh(FULL));
    expect(r.out).toContain('stale-approval dismissal and last-push approval');
    expect(r.out).toContain('no ruleset has bypass actors');
  });
});

describe('check-branch-rules.sh — bypass actors (round 7)', () => {
  test('each ruleset behind the rules is read once, with RULESET_TOKEN when it is set', () => {
    const gh = fakeGh([PR_RULE, checks('ci', 'path-guard', 'shellcheck'), { ...checks('secret-scan', 'dependency-audit', 'analyze'), ruleset_id: 7 }]);
    const r = run(gh, { GH_TOKEN: 'job-token', RULESET_TOKEN: 'admin-token' });
    expect(r.code).toBe(0);
    expect(readFileSync(join(ghDir(gh), 'ruleset-tokens.log'), 'utf-8')).toBe('1 admin-token\n7 admin-token\n');
  });

  test('without RULESET_TOKEN the ruleset reads use the job token (and fail closed if it cannot see the list)', () => {
    const gh = fakeGh(FULL, false, { 1: { id: 1, enforcement: 'active' } });
    const r = run(gh, { GH_TOKEN: 'job-token' });
    expect(readFileSync(join(ghDir(gh), 'ruleset-tokens.log'), 'utf-8')).toBe('1 job-token\n');
    expect(r.code).toBe(1);
    expect(r.err).toContain('ruleset 1: its bypass list is not visible to this token');
    expect(r.err).toContain("'Administration' repository permission");
    expect(r.err).toContain('RULESET_READ_TOKEN');
    expect(r.out).not.toContain('PASS');
  });

  test('any bypass actor fails the run, naming it; so does bypass_actors that is not a list', () => {
    const actors = [
      [{ actor_id: 5, actor_type: 'RepositoryRole', bypass_mode: 'always' }],
      [{ actor_id: null, actor_type: 'OrganizationAdmin', bypass_mode: 'pull_request' }],
      [{ actor_id: 99, actor_type: 'Integration', bypass_mode: 'always' }, { actor_id: 1, actor_type: 'Team', bypass_mode: 'always' }],
    ];
    for (const list of actors) {
      const r = run(fakeGh(FULL, false, { 1: { id: 1, bypass_actors: list } }));
      expect(r.code).toBe(1);
      expect(r.err).toContain('ruleset 1 lists bypass actors');
      expect(r.err).toContain(String(list[0].actor_type));
      expect(r.out).not.toContain('PASS');
    }
    const odd = run(fakeGh(FULL, false, { 1: { id: 1, bypass_actors: 'none' } }));
    expect(odd.code).toBe(1);
    expect(odd.err).toContain('not visible');
  });

  test('a bypass actor on a second ruleset fails even when the first is clean', () => {
    const r = run(fakeGh([PR_RULE, { ...checks(...REQUIRED), ruleset_id: 2 }], false, { 2: { id: 2, bypass_actors: [{ actor_id: 3, actor_type: 'Integration', bypass_mode: 'always' }] } }));
    expect(r.code).toBe(1);
    expect(r.err).toContain('ruleset 2 lists bypass actors (Integration:3(always))');
  });

  test('a failed ruleset read fails closed with the permission hint; so does a non-object payload', () => {
    const r = run(fakeGh(FULL, false, { 1: 'fail' }));
    expect(r.code).toBe(1);
    expect(r.err).toContain('could not read ruleset 1');
    expect(r.err).toContain("'Administration'");
    const arr = run(fakeGh(FULL, false, { 1: [] }));
    expect(arr.code).toBe(1);
    expect(arr.err).toContain('did not return an object');
  });

  test('a rule without a numeric ruleset_id fails closed (the id goes into the API path)', () => {
    for (const bad of [undefined, '1/../../x', 'abc']) {
      const rules = FULL.map((r) => ({ ...r, ruleset_id: bad }));
      const r = run(fakeGh(rules));
      expect(r.code).toBe(1);
      expect(r.out).not.toContain('PASS');
    }
  });

  test('no pull_request rule fails the run', () => {
    const r = run(fakeGh([checks(...REQUIRED)]));
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

// Round 6: the names the checker requires must be real job names (the check
// contexts GitHub reports), or the ruleset could never be satisfied — or be
// satisfied by a renamed job the checker no longer knows about.
describe('REQUIRED_CHECKS matches the workflows', () => {
  const src = readFileSync(SCRIPT, 'utf-8');
  const required = (src.match(/^REQUIRED_CHECKS=\(([^)]*)\)/m)?.[1] ?? '').trim().split(/\s+/);
  const jobs = (file: string) => {
    const wf = parseYaml(readFileSync(join(ROOT, '.github', 'workflows', file), 'utf-8')) as { jobs: Record<string, { name?: string }> };
    return Object.entries(wf.jobs).map(([id, j]) => j.name ?? id);
  };

  test('the script requires exactly the six checks the tests use', () => {
    expect(required).toEqual(REQUIRED);
  });

  test('each is a job (check context) of the workflow that runs it on pull requests', () => {
    expect(jobs('ci.yml')).toEqual(expect.arrayContaining(['ci', 'shellcheck']));
    expect(jobs('path-guard.yml')).toContain('path-guard');
    expect(jobs('security.yml')).toEqual(expect.arrayContaining(['secret-scan', 'dependency-audit']));
    expect(jobs('codeql.yml')).toContain('analyze');
    const all = ['ci.yml', 'path-guard.yml', 'security.yml', 'codeql.yml'].flatMap(jobs);
    for (const c of required) expect(all).toContain(c);
  });

  test('the workflow and contributor docs list the same checks', () => {
    const wf = readFileSync(join(ROOT, '.github', 'workflows', 'repo-settings.yml'), 'utf-8');
    const contrib = readFileSync(join(ROOT, 'CONTRIBUTING.md'), 'utf-8');
    for (const c of required) {
      expect(wf).toContain(c);
      expect(contrib).toContain(`\`${c}\``);
    }
    expect(wf).toContain('Require review from Code Owners');
    // Round 7:
    const wfText = wf.replace(/\n#\s*/g, ' '); // comment lines wrap
    expect(wfText).toContain('Dismiss stale pull request approvals when new commits are pushed');
    expect(wfText).toContain('Require approval of the most recent reviewable push');
    expect(contrib).toContain('dismisses earlier approvals');
    expect(contrib).toContain('no bypass actors');
  });

  test('the workflow passes the admin-capable token only as RULESET_TOKEN, beside the job token', () => {
    const wf = parseYaml(readFileSync(join(ROOT, '.github', 'workflows', 'repo-settings.yml'), 'utf-8')) as {
      jobs: Record<string, { steps: Array<{ run?: string; env?: Record<string, string> }> }>;
    };
    const step = Object.values(wf.jobs).flatMap((j) => j.steps).find((st) => (st.run ?? '').includes('check-branch-rules.sh'))!;
    expect(step.env?.GH_TOKEN).toBe('${{ github.token }}');
    expect(step.env?.RULESET_TOKEN).toBe('${{ secrets.RULESET_READ_TOKEN }}');
  });

  // Round 8: the admin-read token is an environment secret, reachable from main only.
  test('only the branch-rules job names the repo-settings environment, and only it reads RULESET_READ_TOKEN', () => {
    const raw = readFileSync(join(ROOT, '.github', 'workflows', 'repo-settings.yml'), 'utf-8');
    const wf = parseYaml(raw) as { jobs: Record<string, { environment?: unknown; steps: Array<{ env?: Record<string, string> }> }> };
    expect(wf.jobs['branch-rules'].environment).toBe('repo-settings');
    for (const [name, job] of Object.entries(wf.jobs)) {
      const usesToken = job.steps.some((st) => Object.values(st.env ?? {}).some((v) => v.includes('RULESET_READ_TOKEN')));
      if (usesToken) expect(`${name}:${String(job.environment)}`).toBe(`${name}:repo-settings`);
    }
    const header = raw.replace(/\n#\s*/g, ' ');
    expect(header).toContain('deployment branches');
    expect(header).toMatch(/Administration = Read-only/);
    expect(header).toContain('never Read and write');
  });

  test('no message suggests a read-write Administration token', () => {
    const src = readFileSync(SCRIPT, 'utf-8');
    expect(src).not.toMatch(/if bypass actors stay hidden, Read and write/);
    expect(src).toContain("set to Read-only (never Read and write)");
  });
});

describe('check-branch-rules.sh — security settings (round 8)', () => {
  test('both settings are read with RULESET_TOKEN when it is set', () => {
    const gh = fakeGh(FULL);
    const r = run(gh, { GH_TOKEN: 'job-token', RULESET_TOKEN: 'admin-token' });
    expect(r.code).toBe(0);
    expect(r.out).toContain('private vulnerability reporting, secret scanning and push protection are enabled');
    expect(readFileSync(join(ghDir(gh), 'settings-tokens.log'), 'utf-8')).toBe('pvr admin-token\nrepo admin-token\n');
  });

  test('private vulnerability reporting disabled → FAILED, named', () => {
    const r = run(fakeGh(FULL, false, {}, { pvr: { enabled: false } }));
    expect(r.code).toBe(1);
    expect(r.err).toContain('private vulnerability reporting is disabled');
    expect(r.out).not.toContain('PASS');
  });

  test('private vulnerability reporting unreadable or malformed → fails closed with the permission hint', () => {
    for (const pvr of ['fail', { enabled: 'yes' }, [], { message: 'Not Found' }]) {
      const r = run(fakeGh(FULL, false, {}, { pvr }));
      expect(r.code).toBe(1);
      expect(r.err).toContain('failing closed');
      expect(r.err).toContain("'Administration' repository permission set to Read-only");
      expect(r.out).not.toContain('PASS');
    }
  });

  test('secret scanning or push protection disabled (or absent) → FAILED, each named', () => {
    for (const feature of ['secret_scanning', 'secret_scanning_push_protection']) {
      for (const value of [{ status: 'disabled' }, undefined]) {
        const sa: Record<string, unknown> = { ...SA_ON, [feature]: value };
        if (value === undefined) delete sa[feature];
        const r = run(fakeGh(FULL, false, {}, { repo: { full_name: REPO, security_and_analysis: sa } }));
        expect(r.code).toBe(1);
        expect(r.err).toContain(`${feature} is not enabled`);
        expect(r.out).not.toContain('PASS');
      }
    }
  });

  test('security_and_analysis hidden from the token, or the repo read failing → fails closed with the permission hint', () => {
    for (const repo of ['fail', { full_name: REPO }, { full_name: REPO, security_and_analysis: null }]) {
      const r = run(fakeGh(FULL, false, {}, { repo }));
      expect(r.code).toBe(1);
      expect(r.err).toContain('failing closed');
      expect(r.err).toContain('RULESET_READ_TOKEN');
      expect(r.out).not.toContain('PASS');
    }
  });
});
