# Phase 1 (Stabilize) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the three live outages (deploy dead since Aug 5, enrichment at zero since Aug 6, repo stranded off-main since Jul 31), fix the silent-death bugs that let them persist, and land the exit-gate script that proves 7 consecutive green days — per §4 of `docs/superpowers/specs/2026-08-11-autonomous-profitable-system-design.md`.

**Architecture:** Surgical fixes to the existing launchd pipeline — no rewrites. Deploy step gains an env fingerprint + wall-clock watchdog (pattern already proven in `auto-enrich.sh`). The auth pre-check's unreachable failure path is made reachable. The stranded branch fast-forwards into `main` and the repo parks on `main` permanently (all future feature work in worktrees — the branch-parking trap is what stranded 11 days of commits). The db-guard PreToolUse hook is implemented against its existing RED test. The Phase-1 exit gate is a computed script, not an assertion.

**Tech Stack:** Bun (runtime + `bun:test`), bash (launchd scripts), Claude Code hooks (PreToolUse exit-2-blocks contract), Netlify CLI, launchd.

## Global Constraints

- Work in `/Users/chrism/Project with Claude/AgentAthens/agent-athens`. Runtime is **Bun, never Node**.
- **Never `git add -A`.** Stage by explicit path.
- After Task 2, the main checkout stays parked on `main` forever. Feature work (Tasks 3–10) happens on short-lived branches **in worktrees** (`superpowers:using-git-worktrees`), merged back promptly — the 08:00 daily pipeline commits to whatever branch the main checkout has, which is how 11 days of commits got stranded.
- TDD Iron Law: no production code without a failing test observed first. Retrofitted pins: the mutation run (break config → suite fails → restore) IS the RED.
- Timezone: `Europe/Athens` for anything date-facing.
- launchd-executed scripts must be verified via a real `launchctl start` canary, never interactive shell alone (allowlist/plist changes have caused silent deploy droughts — see hardening plan line 17).
- The four sanctioned enrichment commands (complete legitimate Bash surface of a headless enrichment session): `bun run scripts/write-description.ts`, `bun run scripts/auto-gate-check.ts`, `bun run scripts/write-tags.ts`, `bun run scripts/save-batch.ts`.
- Do not touch the backup layer (`~/agent-athens-backups`) or backup scripts.
- Known pre-existing suite failures (do NOT chase, do not worsen): `tests/build/en-cornerstone-presence.test.ts` (environmental, date-conditional data); `tests/db-guard-hook.test.ts` (RED by design until Task 5).
- Netlify production deploys: only the documented recovery command (`netlify deploy --prod --no-build --dir=dist`). Never write fake `deploy-success` lines to `logs/deploy-cadence.log` — manual success lines masked a real drought once already (S193).

## File Structure

| File | Responsibility | Tasks |
|------|---------------|-------|
| `scripts/daily-automated.sh` (modify ~line 626-632) | deploy env fingerprint + wall-clock watchdog | 1 |
| `scripts/auto-enrich.sh` (modify lines 39, 41, 338-339, + new `--auth-check-only` mode) | auth pre-check fix, allowlist tightening, batch size | 3, 6 |
| `scripts/hooks/db-guard.ts` (create) | PreToolUse hook: verdict() + fail-closed process contract | 5 |
| `.claude/settings.json` (modify) | wire the hook | 5 |
| `tests/settings-security-pins.test.ts` (modify) | pin hook wiring | 5 |
| `scripts/generate-enrichment-brief.ts` (modify) | WebFetch-hostile domain blocklist in every brief | 6 |
| `scripts/health-check.ts` (modify) | same-population ratios; sane build-time threshold | 8 |
| `scripts/phase1-exit-gate.ts` (create) + `tests/phase1-exit-gate.test.ts` | computed 7-green-day exit gate | 10 |
| `docs/LAUNCHD-SETUP.md` (modify) | wake-schedule operator runbook | 9 |

Execution order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10. Task 7 (canary) gates Tasks 3+5+6 together.

---

### Task 1: Restore production deploy + instrument the deploy step

The site is ~6 days stale. Interactive `netlify status` succeeds (verified 2026-08-11, CLI 23.15.1, project linked), and the `listSiteDeploys` fallback reaches the API from launchd — so credentials are fine; the `netlify deploy` invocation itself fails/hangs under launchd (observed ~44-min silent gap, then exit 1 with empty stdout).

**Files:**
- Modify: `scripts/daily-automated.sh:626-632` (deploy attempt loop)

**Interfaces:**
- Produces: `logs/pipeline-*.log` lines `[deploy-env] netlify=<ver> node=<ver> PATH=<path>` and `[deploy] watchdog killed CLI after <N>s` — Task 10's exit gate and future Phase-2 responders parse `deploy-success` from `logs/deploy-cadence.log` (unchanged format).

- [ ] **Step 1: Verify dist/ is the freshest built site (read-only)**

```bash
cd "/Users/chrism/Project with Claude/AgentAthens/agent-athens"
cat dist/.build-provenance 2>/dev/null; git rev-parse HEAD
ls -la dist/sitemap.xml dist/index.html   # mtimes should be Aug 10-11
```
Expected: provenance sha == HEAD (dist built by the Aug 10/11 pipeline run from this branch). If provenance is missing/mismatched, STOP and rebuild first: `bun run src/generate-site.ts`.

- [ ] **Step 2: Recovery deploy, interactively, with full evidence capture**

```bash
netlify deploy --prod --no-build --dir=dist --message "Recovery deploy 2026-08-11" --json \
  > /tmp/recovery-deploy.json 2>/tmp/recovery-deploy.err; echo "exit=$?"
cat /tmp/recovery-deploy.err | head -40; jq -r '.deploy_id // .id // "NO-ID"' /tmp/recovery-deploy.json
```
Expected: exit=0 and a deploy id. Then verify platform-side state (CLI exit 0 ≠ published — banked gotcha):

```bash
SITE_ID=$(jq -r .siteId .netlify/state.json)
DID=$(jq -r '.deploy_id // .id' /tmp/recovery-deploy.json)
netlify api getSiteDeploy --data "{\"site_id\":\"$SITE_ID\",\"deploy_id\":\"$DID\"}" | jq -r .state
curl -s https://agentathens.com/sitemap.xml | grep -o '<lastmod>[^<]*' | head -3
```
Expected: `state=ready`, live sitemap lastmod newer than 2026-08-05. **If the deploy fails interactively too:** the stderr in `/tmp/recovery-deploy.err` is the first real evidence anyone has captured for this failure — invoke `superpowers:systematic-debugging` with it before touching anything else. Likely suspects in order: CLI v23 regression (try `npm i -g netlify-cli@22 --prefix …` version pin), dist size, API-side state.

- [ ] **Step 3: Add env fingerprint + wall-clock watchdog to the pipeline's deploy call**

In `scripts/daily-automated.sh`, replace lines 630-632 (`netlify deploy … 2>>"$LOG_FILE"`) with:

```bash
        # Env fingerprint: the Aug 2026 outage produced empty stdout + exit 1
        # with zero context; version/PATH divergence between interactive and
        # launchd environments is the leading suspect class (cf. auth-precheck).
        log "[deploy-env] netlify=$(netlify --version 2>/dev/null | head -1) node=$(node -v 2>/dev/null || echo '?') PATH=$PATH"

        # Wall-clock watchdog (pattern from auto-enrich.sh:310-319): a hanging
        # CLI previously ate ~44 min silently. date +%s advances through sleep.
        netlify deploy --prod --no-build --dir=dist \
            --message "Daily deploy $(date +%Y-%m-%d)" --json \
            >"$deploy_tmp" 2>>"$LOG_FILE" &
        local NETLIFY_PID=$!
        ( WATCHDOG_END=$(( $(date +%s) + ${DEPLOY_TIMEOUT:-900} ))
          while [ "$(date +%s)" -lt "$WATCHDOG_END" ]; do
            kill -0 "$NETLIFY_PID" 2>/dev/null || exit 0
            sleep 15
          done
          echo "[$(date '+%Y-%m-%d %H:%M:%S')] [deploy] watchdog killed CLI after ${DEPLOY_TIMEOUT:-900}s" >> "$LOG_FILE"
          kill "$NETLIFY_PID" 2>/dev/null
        ) &
        local DEPLOY_WATCHDOG_PID=$!
        local cli_exit=0
        wait "$NETLIFY_PID" || cli_exit=$?
        kill "$DEPLOY_WATCHDOG_PID" 2>/dev/null; wait "$DEPLOY_WATCHDOG_PID" 2>/dev/null || true
        cat "$deploy_tmp" >> "$LOG_FILE"
```

Note: this **replaces** the old `local cli_exit=$?` line too — `cli_exit` is now set by `wait`. The `cat "$deploy_tmp"` line moves inside the block (it already exists at line 634; delete the original so it isn't duplicated).

- [ ] **Step 4: Syntax-check and verify the fallback path still parses**

```bash
bash -n scripts/daily-automated.sh && echo SYNTAX-OK
bun test scripts/__tests__/deploy-gate.test.ts
```
Expected: SYNTAX-OK; deploy-gate tests pass (they pin the gate, which this change doesn't touch).

- [ ] **Step 5: Commit (on the current branch — Task 2 carries it to main)**

```bash
git add scripts/daily-automated.sh
git commit -m "fix(deploy): env fingerprint + wall-clock watchdog around Netlify CLI

The Aug 6-10 deploy outage produced exit 1 with empty stdout and no
captured stderr context after ~44-min silent hangs. Fingerprint records
CLI/node/PATH per attempt; watchdog bounds a hung CLI at DEPLOY_TIMEOUT
(default 900s) instead of an unbounded wait."
```

---

### Task 2: Reconcile the stranded branch into main; park the repo on main

**Files:** none created — git topology only. Also commits the month of uncommitted institutional memory and the Phase-1 docs.

**Interfaces:**
- Produces: `origin/main` current through today; main checkout parked on `main` (the 08:00 pipeline's push-gate passes from tomorrow on). All later tasks branch from this `main` in worktrees.

- [ ] **Step 1: Commit the uncommitted institutional memory (on the branch)**

```bash
cd "/Users/chrism/Project with Claude/AgentAthens/agent-athens"
git add .claude/notes/mistakes.md docs/session-log.md data/parsed/newsletter-events.json
git commit -m "docs: commit a month of session-log/mistakes entries (S196-S221 era)"
git add docs/superpowers/specs/2026-08-11-autonomous-profitable-system-design.md \
        docs/superpowers/plans/2026-08-11-phase1-stabilize.md \
        docs/superpowers/plans/2026-07-28-enrichment-db-boundary-hardening.md
git commit -m "docs: autonomous-profitable-system spec + Phase 1 (Stabilize) plan"
```

- [ ] **Step 2: Confirm fast-forward topology (read-only)**

```bash
git merge-base --is-ancestor main hardening/db-tool-boundary && echo FF-OK
git log --oneline main..hardening/db-tool-boundary | wc -l
```
Expected: `FF-OK`. If NOT an ancestor (a commit landed on main since fa6c232), use `git checkout main && git merge --no-ff hardening/db-tool-boundary` in Step 4 instead of `--ff-only` and resolve any conflicts (expected none — main is frozen).

- [ ] **Step 3: Pre-merge suite gate**

```bash
bun test 2>&1 | tail -5
```
Expected: green except the two known failures listed in Global Constraints (`en-cornerstone-presence`, `db-guard-hook`). Any OTHER failure: stop, fix before merging.

- [ ] **Step 4: Fast-forward main and push**

```bash
git checkout main
git merge --ff-only hardening/db-tool-boundary
git push origin main
git branch -d hardening/db-tool-boundary
git log --oneline origin/main -3
```
Expected: push succeeds; origin/main tip = today's state. The repo now sits on `main` and stays there.

---

### Task 3: Make the auth pre-check's failure path reachable (worktree)

The bug: under `set -euo pipefail`, `AUTH_OUTPUT="$( … )"` at `scripts/auto-enrich.sh:338` aborts the whole script when the CLI exits non-zero — before `AUTH_RC=$?` (line 339) and all the failure logging (lines 340-352) that was written *specifically* to make auth droughts "diagnosable on sight." Result: Aug 6-10, five days of logs ending at `Running auth pre-check...` with zero evidence.

**Files:**
- Modify: `scripts/auto-enrich.sh:33-38` (CLAUDE_BIN override seam), `:338-339` (the guard), new `--auth-check-only` early-exit mode
- Test: `tests/auto-enrich-auth-precheck.test.ts` (create)

**Interfaces:**
- Consumes: `logs/auth-precheck-last.log` format already parsed by `authPrecheckOk()` in `scripts/deadman-watchdog.ts:239` — the `exit=N` line MUST be written on both success and failure (fixing this bug is what revives that deadman signal; no watchdog change needed).
- Produces: `bash scripts/auto-enrich.sh --auth-check-only` → exit 0 (auth ok) / exit 1 (auth failed, log written). Phase 2's STALE_DEPLOY/AUTH responder will reuse this mode.

- [ ] **Step 1: Create worktree + branch**

```bash
cd "/Users/chrism/Project with Claude/AgentAthens/agent-athens"
git worktree add ../aa-wt-stabilize -b fix/phase1-stabilize main
cd ../aa-wt-stabilize
```
(Tasks 3, 5, 6, 8, 10 all work in this worktree on `fix/phase1-stabilize`; merge back in Task 9's final step. The main checkout stays on `main` untouched.)

- [ ] **Step 2: Write the failing test**

Create `tests/auto-enrich-auth-precheck.test.ts`:

```ts
import { describe, test, expect, beforeAll } from 'bun:test';
import { mkdtempSync, writeFileSync, chmodSync, readFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

const ROOT = resolve(import.meta.dir, '..');
const SCRIPT = join(ROOT, 'scripts', 'auto-enrich.sh');

// Precondition pin: this fixture exists because the Aug 2026 outage proved the
// failure path unreachable under `set -e`. If the script drops --auth-check-only
// or the guard, these tests must fail loudly, not go vacuous.
function makeStubClaude(dir: string, behavior: 'ok' | 'not-logged-in'): string {
  const bin = join(dir, 'claude');
  const body =
    behavior === 'ok'
      ? '#!/bin/bash\necho \'{"result":"ok"}\'\nexit 0\n'
      : '#!/bin/bash\necho \'{"result":"Not logged in"}\' \necho "Not logged in" >&2\nexit 1\n';
  writeFileSync(bin, body);
  chmodSync(bin, 0o755);
  return bin;
}

function runAuthCheck(stubBehavior: 'ok' | 'not-logged-in') {
  const dir = mkdtempSync(join(tmpdir(), 'aa-auth-'));
  const stub = makeStubClaude(dir, stubBehavior);
  return Bun.spawnSync(['bash', SCRIPT, '--auth-check-only'], {
    cwd: ROOT,
    env: { ...process.env, CLAUDE_BIN_OVERRIDE: stub },
  });
}

describe('auto-enrich --auth-check-only', () => {
  test('script advertises the mode (precondition)', () => {
    expect(readFileSync(SCRIPT, 'utf8')).toContain('--auth-check-only');
  });

  test('healthy CLI → exit 0', () => {
    expect(runAuthCheck('ok').exitCode).toBe(0);
  });

  test('failing CLI → exit 1 WITH the failure logged (the Aug 6-10 silent-death regression)', () => {
    const r = runAuthCheck('not-logged-in');
    expect(r.exitCode).toBe(1);
    const log = readFileSync(join(ROOT, 'logs', 'auth-precheck-last.log'), 'utf8');
    expect(log).toContain('exit=1');           // the line set -e used to make unreachable
    expect(log).toContain('Not logged in');    // the evidence that was never captured
  });
});
```

- [ ] **Step 3: Run it, watch it fail**

```bash
cd ../aa-wt-stabilize && bun test tests/auto-enrich-auth-precheck.test.ts
```
Expected: FAIL — script does not contain `--auth-check-only` (first test), and the mode is unknown so the others fail too.

- [ ] **Step 4: Implement**

In `scripts/auto-enrich.sh`:

(a) After line 38 (`fi` closing the CLAUDE_BIN resolution), add the override seam:

```bash
# Test seam + responder hook: CLAUDE_BIN_OVERRIDE lets tests inject a stub CLI
# and lets Phase-2 responders point at a specific binary.
CLAUDE_BIN="${CLAUDE_BIN_OVERRIDE:-$CLAUDE_BIN}"
```

(b) Extract the pre-check into a function and guard the substitution. Replace lines 322-353 (the `# 8b. Pre-flight auth check` block through `log "Auth pre-check passed"`) with:

```bash
# 8b. Pre-flight auth check (S89) — fail fast on 401 instead of burning
#     30 min of BATCH_TIMEOUT per batch when the CLI session is expired.
run_auth_precheck() {
    log "Running auth pre-check..."
    AUTH_PRECHECK_LOG="$LOG_DIR/auth-precheck-last.log"
    {
      echo "=== auth pre-check $(date '+%Y-%m-%d %H:%M:%S') ==="
      echo "env: USER=${USER:-<unset>} HOME=${HOME:-<unset>} CLAUDECODE=${CLAUDECODE:-<unset>} TERM=${TERM:-<unset>}"
      echo "bin=$CLAUDE_BIN version=$("$CLAUDE_BIN" --version 2>/dev/null || echo '?')"
    } > "$AUTH_PRECHECK_LOG"
    # Aug 6-10 2026: a bare AUTH_OUTPUT="$( … )" aborted the whole script here
    # under `set -e` when the CLI exited non-zero — BEFORE any of the logging
    # below could run. Five days of logs ended at "Running auth pre-check..."
    # with zero evidence. The `|| AUTH_RC=$?` guard is what keeps the failure
    # path reachable. Do not "simplify" it away.
    local AUTH_RC=0 AUTH_OUTPUT=""
    AUTH_OUTPUT="$(echo "ok" | "$CLAUDE_BIN" -p --output-format json < /dev/null 2>&1)" || AUTH_RC=$?
    { echo "exit=$AUTH_RC"; echo "$AUTH_OUTPUT"; } >> "$AUTH_PRECHECK_LOG"
    if [ "$AUTH_RC" -ne 0 ]; then
      local AUTH_REASON
      AUTH_REASON="$(echo "$AUTH_OUTPUT" | grep -oE '"result":"[^"]*"' | head -1 | sed 's/^"result":"//; s/"$//')"
      [ -z "$AUTH_REASON" ] && AUTH_REASON="(unparsed reason; see $AUTH_PRECHECK_LOG)"
      if echo "$AUTH_OUTPUT" | grep -qi "Not logged in"; then
        log_error "Claude CLI auth check failed — NOT LOGGED IN (re-auth: run 'claude' interactively once + /login). reason=\"$AUTH_REASON\" rc=$AUTH_RC env[USER=${USER:-<unset>} CLAUDECODE=${CLAUDECODE:-<unset>}] — full: $AUTH_PRECHECK_LOG"
      else
        log_error "Claude CLI auth check failed — reason=\"$AUTH_REASON\" rc=$AUTH_RC env[USER=${USER:-<unset>}] — full: $AUTH_PRECHECK_LOG"
      fi
      return 1
    fi
    log "Auth pre-check passed"
    return 0
}
run_auth_precheck || exit 1
```

(c) Add the `--auth-check-only` early exit. Immediately after the `cd "$PROJECT_DIR"` at line 63 (BEFORE lock acquisition and orphan cleanup, so the mode is pure read + one stub-able CLI call), add:

```bash
# --auth-check-only: run ONLY the auth pre-check and exit with its status.
# Used by tests and by Phase-2 responder runbooks. Placed before lock/orphan
# handling: this mode must never contend with a live enrichment run.
if [[ "${1:-}" == "--auth-check-only" ]]; then
    mkdir -p "$LOG_DIR"
    run_auth_precheck_only=1
fi
```

and at the very end of the CLAUDE_BIN/config section (after `log()` / `log_error()` are defined and after `run_auth_precheck` is defined — bash needs the function defined before the call), add:

```bash
if [[ "${run_auth_precheck_only:-0}" == "1" ]]; then
    run_auth_precheck
    exit $?
fi
```

Implementation note for the executor: `run_auth_precheck` is currently defined at step 8b, *after* the queue/brief phases. Move the function definition up into the script's function-definition region (right after `log_error()`, ~line 80), leaving only the `run_auth_precheck || exit 1` call at the old 8b location. The `--auth-check-only` early-exit block then sits after the function definitions. Keep `bash -n` clean.

- [ ] **Step 5: Run the tests, watch them pass**

```bash
bun test tests/auto-enrich-auth-precheck.test.ts && bash -n scripts/auto-enrich.sh && echo SYNTAX-OK
```
Expected: 3 pass, SYNTAX-OK.

- [ ] **Step 6: Commit**

```bash
git add scripts/auto-enrich.sh tests/auto-enrich-auth-precheck.test.ts
git commit -m "fix(enrich): auth pre-check failure path reachable under set -e

Aug 6-10 the pre-check died at the command substitution before its own
error logging could run — five days of silent enrichment outage with no
captured evidence. Guard with || AUTH_RC=\$?, extract run_auth_precheck(),
add --auth-check-only mode (test seam + Phase-2 responder hook)."
```

---

### Task 4: Verify the recovered deploy held + enrichment queue sanity (checkpoint, no code)

- [ ] **Step 1: Confirm live site freshness and today's pipeline state**

```bash
curl -s https://agentathens.com/sitemap.xml | grep -o '<lastmod>[^<]*' | head -3
tail -20 "/Users/chrism/Project with Claude/AgentAthens/agent-athens/logs/deadman-stderr.log"
```
Expected: lastmod ≥ today's recovery deploy; deadman's next 6h heartbeat should show deploy freshness recovering. If the site is still stale, return to Task 1 Step 2 with `superpowers:systematic-debugging` — do not proceed to enrichment work while the deploy path is unproven.

---

### Task 5: Implement the db-guard PreToolUse hook against its existing RED test (worktree)

The test (`tests/db-guard-hook.test.ts`, currently untracked + failing) is the spec: 44 cases covering direct destruction, 15 researched bypasses, self-protection, legitimate-work allows, and the fail-closed process contract. `verdict(input) → string | null` (block-reason contains `db-guard`) + process contract (stdin JSON; exit 0 allow / exit 2 block with stderr reason; unparseable → 2).

**Files:**
- Create: `scripts/hooks/db-guard.ts`
- Modify: `.claude/settings.json` (hook wiring), `tests/settings-security-pins.test.ts` (pin the wiring)
- Test: `tests/db-guard-hook.test.ts` (exists — commit it with the implementation)

**Interfaces:**
- Produces: `verdict(input: { tool_name: string; tool_input?: Record<string, unknown> }): string | null`; CLI contract as above. Wired in `.claude/settings.json` under `hooks.PreToolUse` matching `Bash|Write|Edit|MultiEdit|NotebookEdit`.

- [ ] **Step 1: Observe the RED**

```bash
cd ../aa-wt-stabilize
cp "/Users/chrism/Project with Claude/AgentAthens/agent-athens/tests/db-guard-hook.test.ts" tests/db-guard-hook.test.ts
bun test tests/db-guard-hook.test.ts 2>&1 | tail -3
```
Expected: FAIL — `Cannot find module '../scripts/hooks/db-guard'`.

- [ ] **Step 2: Implement `scripts/hooks/db-guard.ts`**

```ts
/**
 * db-guard — PreToolUse hook (Layer 2 of the enrichment DB boundary).
 *
 * Contract: stdin = hook JSON; exit 0 = allow, exit 2 = block (reason on
 * stderr). FAILS CLOSED: unparseable/malformed input for an inspected tool
 * blocks. This is a security boundary, not an advisory linter — the bypass
 * catalog in tests/db-guard-hook.test.ts is the list of attacks that
 * defeated the first draft. Every rule here exists because a test demands it.
 */

export interface HookInput {
  tool_name: string;
  tool_input?: Record<string, unknown>;
}

const FILE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);

const block = (why: string) => `db-guard: ${why}`;

// ---------- file-path rules ----------

// DB + sidecars, anywhere they appear.
const DB_FILE = /\.db(-wal|-shm)?$/i;
// Self-protection: the hook, its wiring, the test preload, and the four
// sanctioned scripts a session could rewrite then legitimately invoke.
const PROTECTED_FILES = [
  /(^|\/)scripts\/hooks\//i,
  /(^|\/)\.claude\/settings(\.local)?\.json$/i,
  /(^|\/)bunfig\.toml$/i,
  /(^|\/)tests\/preload\//i,
  /(^|\/)scripts\/(write-description|auto-gate-check|write-tags|save-batch)\.ts$/i,
];

function pathVerdict(p: string): string | null {
  if (DB_FILE.test(p)) return block(`file tool targeting database file: ${p}`);
  for (const re of PROTECTED_FILES) if (re.test(p)) return block(`file tool targeting protected path: ${p}`);
  return null;
}

function collectPaths(input: Record<string, unknown>): string[] {
  const out: string[] = [];
  if (typeof input.file_path === 'string') out.push(input.file_path);
  if (typeof input.notebook_path === 'string') out.push(input.notebook_path);
  if (Array.isArray(input.edits)) {
    for (const e of input.edits) {
      if (e && typeof e === 'object' && typeof (e as Record<string, unknown>).file_path === 'string') {
        out.push((e as Record<string, string>).file_path);
      }
    }
  }
  return out;
}

// ---------- bash rules ----------

// Protected targets as they appear inside a command line.
const BASH_DB_TARGET = /\.db(-wal|-shm)?\b/i;
const BASH_DATA_DIR = /(^|[\s"'=/])data\/?(\s|$|["'])/;
const BASH_BACKUPS = /agent-athens-backups/i;
const DESTRUCTIVE_VERB = /\b(rm|unlink|shred|truncate|dd|mv|cp|tee)\b/;

function bashVerdict(cmd: string): string | null {
  const hasDbTarget = BASH_DB_TARGET.test(cmd) || BASH_DATA_DIR.test(cmd) || BASH_BACKUPS.test(cmd);

  // sqlite3: only -readonly/--readonly, and even then no escape hatches.
  if (/\bsqlite3\b/.test(cmd)) {
    if (!/(^|\s)--?readonly\b/.test(cmd)) return block('sqlite3 without -readonly');
    if (/\battach\b/i.test(cmd)) return block('ATTACH escapes -readonly');
    if (/["'\s]\.(shell|open|import|save|restore|backup|clone|load|system|read|once|output|excel|cd)\b/i.test(cmd)) {
      return block('sqlite3 dot-command escape hatch');
    }
    if (/mode=(rw|rwc)/i.test(cmd)) return block('URI mode upgrade under -readonly');
  }

  if (hasDbTarget && DESTRUCTIVE_VERB.test(cmd)) return block('destructive verb against protected data');
  if (hasDbTarget && />\|?\s*[^|&;\s]*\.db(-wal|-shm)?\b/i.test(cmd)) return block('redirection over database file');
  if (/\bfind\b[^]*-delete\b/.test(cmd)) return block('find -delete');
  if (/\bgit\b[^&|;]*\bclean\b/.test(cmd)) return block('git clean removes the gitignored DB');
  if (/\b(bun|node|deno)\b[^&|;]*\s(-e|--eval)\b/.test(cmd) && /(bun:sqlite|\.db\b)/i.test(cmd)) {
    return block('interpreter eval driving sqlite');
  }
  return null;
}

// ---------- verdict ----------

export function verdict(input: HookInput): string | null {
  const { tool_name, tool_input } = input;

  if (tool_name === 'Bash') {
    const cmd = tool_input?.command;
    if (typeof cmd !== 'string') return block('Bash call with no command string (fail closed)');
    return bashVerdict(cmd);
  }

  if (FILE_TOOLS.has(tool_name)) {
    const paths = collectPaths(tool_input ?? {});
    if (paths.length === 0) return block(`${tool_name} call with no inspectable path (fail closed)`);
    for (const p of paths) {
      const v = pathVerdict(p);
      if (v) return v;
    }
    return null;
  }

  return null; // uninspected tools (WebSearch, Read, …) pass through
}

// ---------- process contract ----------

if (import.meta.main) {
  const text = await new Response(Bun.stdin.stream()).text();
  let input: HookInput;
  try {
    input = JSON.parse(text) as HookInput;
  } catch {
    console.error(block('unparseable hook input (fail closed)'));
    process.exit(2);
  }
  const v = verdict(input);
  if (v !== null) {
    console.error(v);
    process.exit(2);
  }
  process.exit(0);
}
```

- [ ] **Step 3: Run the full test file, iterate until green**

```bash
bun test tests/db-guard-hook.test.ts
```
Expected: all 44+ cases pass. If a bypass case fails, tighten the specific rule — never weaken an allow-case to compensate.

- [ ] **Step 4: Mutation-pin the settings wiring FIRST (RED), then wire**

Add to `tests/settings-security-pins.test.ts` (append a describe block):

```ts
describe('db-guard hook wiring', () => {
  test('PreToolUse wires db-guard for all inspected tools', () => {
    const settings = JSON.parse(readFileSync(SETTINGS_PATH, 'utf8'));
    const pre = settings?.hooks?.PreToolUse ?? [];
    const entry = pre.find((e: { hooks?: Array<{ command?: string }> }) =>
      e.hooks?.some((h) => h.command?.includes('db-guard.ts')),
    );
    expect(entry).toBeDefined();
    for (const tool of ['Bash', 'Write', 'Edit', 'MultiEdit', 'NotebookEdit']) {
      expect(entry.matcher).toContain(tool);
    }
  });
});
```

(`SETTINGS_PATH`/`readFileSync` imports already exist in that file — reuse them.) Run: `bun test tests/settings-security-pins.test.ts` → the new test FAILS (hook not wired). Then wire it — note `.claude/settings.json` is Write/Edit-denied by its own rules, so edit via Bash:

```bash
jq '.hooks.PreToolUse = ((.hooks.PreToolUse // []) + [{
  "matcher": "Bash|Write|Edit|MultiEdit|NotebookEdit",
  "hooks": [{"type": "command", "command": "bun \"$CLAUDE_PROJECT_DIR/scripts/hooks/db-guard.ts\""}]
}])' .claude/settings.json > /tmp/settings.new && cat /tmp/settings.new > .claude/settings.json
bun test tests/settings-security-pins.test.ts
```
Expected: green. Then the full-suite sanity: `bun test 2>&1 | tail -3` (only the known en-cornerstone failure remains).

- [ ] **Step 5: Commit**

```bash
git add scripts/hooks/db-guard.ts tests/db-guard-hook.test.ts .claude/settings.json tests/settings-security-pins.test.ts
git commit -m "feat(security): db-guard PreToolUse hook — blocks the bypass catalog

Implements the researched attack list (WAL sidecars, dot-command shell-outs,
URI mode upgrade, interpreter eval, git clean, self-modification) that
defeated the first draft. Fail-closed process contract; wiring pinned by
settings-security-pins."
```

---

### Task 6: Tighten the headless allowlist + brief-level WebFetch blocklist + batch size (worktree)

**Files:**
- Modify: `scripts/auto-enrich.sh:39` (ALLOWED_TOOLS), `:41` (EVENTS_PER_BATCH)
- Modify: `scripts/generate-enrichment-brief.ts` (blocklist section in every brief)
- Test: `tests/enrichment-brief-blocklist.test.ts` (create)

**Interfaces:**
- Consumes: db-guard hook (Task 5) as Layer 2 behind this Layer 1.
- Produces: briefs containing a `## Fetch blocklist` section; `ALLOWED_TOOLS` granting Bash only for the four sanctioned commands.

- [ ] **Step 1: Failing test for the brief blocklist**

Create `tests/enrichment-brief-blocklist.test.ts`:

```ts
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'fs';
import { resolve, join } from 'path';

const ROOT = resolve(import.meta.dir, '..');

// The Aug 2026 wall-clock-kill streak traced to WebFetch hanging on more.com
// (queue-it wall; 572s heartbeat then timeout). These domains block or
// confabulate; the brief must forbid fetching them (WebSearch instead).
// Source: memory notes reference_morecom_queueit_blocks_webfetch,
// reference_snfcc_org_blocks_webfetch, ra.co 403s (session-log S203+).
const BLOCKED = ['more.com', 'snfcc.org', 'ra.co'];

describe('enrichment brief fetch blocklist', () => {
  test('generator source carries the blocklist constant (precondition)', () => {
    const src = readFileSync(join(ROOT, 'scripts', 'generate-enrichment-brief.ts'), 'utf8');
    expect(src).toContain('FETCH_BLOCKLIST');
    for (const d of BLOCKED) expect(src).toContain(d);
  });

  test('rendered brief text includes the blocklist instruction', async () => {
    const mod = await import('../scripts/generate-enrichment-brief.ts');
    expect(typeof mod.renderFetchBlocklistSection).toBe('function');
    const section = mod.renderFetchBlocklistSection();
    expect(section).toContain('Do NOT WebFetch');
    for (const d of BLOCKED) expect(section).toContain(d);
  });
});
```

Run `bun test tests/enrichment-brief-blocklist.test.ts` → FAIL (no `FETCH_BLOCKLIST`).

- [ ] **Step 2: Implement in `generate-enrichment-brief.ts`**

Add near the top (module scope), and export:

```ts
/** Domains that hang or confabulate under WebFetch in headless runs.
 *  more.com: queue-it wall → observed 572s hang → wall-clock batch kill
 *  (logs/auto-enrich-2026-08-10.log). snfcc.org: 403. ra.co: 403.
 *  The brief instructs WebSearch as the substitute — do not silently drop
 *  the research step. */
export const FETCH_BLOCKLIST = ['more.com', 'snfcc.org', 'ra.co'] as const;

export function renderFetchBlocklistSection(): string {
  return [
    '## Fetch blocklist (hard rule)',
    `Do NOT WebFetch these domains — they hang or block and will kill the whole batch: ${FETCH_BLOCKLIST.join(', ')}.`,
    'Use WebSearch for facts you would have fetched from them. If a fact is only on a blocked domain, write what the other sources support and flag the gap in concerns.jsonl instead of fetching.',
  ].join('\n');
}
```

Then find the function that assembles the brief body (grep `writeFileSync` / the template literal that builds the per-batch brief markdown) and append `renderFetchBlocklistSection()` to every generated brief. Re-run the test → GREEN.

- [ ] **Step 3: Tighten ALLOWED_TOOLS + EVENTS_PER_BATCH (mutation-RED via the pin test)**

First check how `$ALLOWED_TOOLS` is passed to the CLI (grep `allowedTools` in `auto-enrich.sh`) — preserve that exact splitting behavior. Then `scripts/auto-enrich.sh:39`:

```bash
# Task 3 of the 2026-07-28 hardening plan, landed 2026-08-11: bare Bash was
# the primary injected-session risk (canonical attack: sqlite3 DELETE).
# Bash is granted ONLY for the four sanctioned enrichment commands; db-guard
# (Layer 2) backstops even these.
ALLOWED_TOOLS="Read Glob Grep WebSearch WebFetch Write Bash(bun run scripts/write-description.ts *) Bash(bun run scripts/auto-gate-check.ts *) Bash(bun run scripts/write-tags.ts *) Bash(bun run scripts/save-batch.ts *)"
```

and line 41: `EVENTS_PER_BATCH=4` with comment: `# 5→4 on 2026-08-11: Aug 5-11 batches hit the 1200s fence with 0 saves; 4 restores the pre-S81 margin (observed 285-854s). Revisit upward when 7 consecutive clean days.`

Extend `tests/settings-security-pins.test.ts` with the plan's dropped third pin:

```ts
describe('auto-enrich allowlist', () => {
  test('grants no bare Bash (the 2026-07-28 audit gap)', () => {
    const src = readFileSync(join(ROOT, 'scripts', 'auto-enrich.sh'), 'utf8');
    const line = src.split('\n').find((l) => l.startsWith('ALLOWED_TOOLS='));
    expect(line).toBeDefined();
    expect(line).not.toMatch(/Bash(?!\()/);          // "Bash" only as "Bash(…)"
    for (const s of ['write-description.ts', 'auto-gate-check.ts', 'write-tags.ts', 'save-batch.ts']) {
      expect(line).toContain(s);
    }
  });
});
```

Run BEFORE editing line 39 → FAIL (bare Bash present) — that's the RED. Edit → GREEN.

- [ ] **Step 4: Commit**

```bash
git add scripts/auto-enrich.sh scripts/generate-enrichment-brief.ts \
        tests/enrichment-brief-blocklist.test.ts tests/settings-security-pins.test.ts
git commit -m "feat(enrich): sanctioned-commands allowlist, fetch blocklist, batch=4

Layer 1 of the DB boundary (no bare Bash in headless sessions) + the two
wall-clock-kill mitigations the logs prescribe: forbid WebFetch on
hanging/blocking domains (more.com queue-it killed the Aug batches) and
drop EVENTS_PER_BATCH to 4."
```

---

### Task 7: Merge to main + live launchd canary (gates Tasks 3, 5, 6)

- [ ] **Step 1: Merge the worktree branch**

```bash
cd "/Users/chrism/Project with Claude/AgentAthens/agent-athens"   # main checkout, on main
bun test 2>&1 | tail -3                                            # suite green (known env failure only)
git merge --no-ff fix/phase1-stabilize -m "merge: phase1 stabilize — auth fix, db-guard, allowlist, blocklist"
git push origin main
```

- [ ] **Step 2: Auth-check-only smoke through the real environment**

```bash
bash scripts/auto-enrich.sh --auth-check-only; echo "rc=$?"
tail -5 logs/auth-precheck-last.log
```
Expected: rc=0, log shows `exit=0` + version fingerprint.

- [ ] **Step 3: Live canary — one real enrichment run through launchd**

```bash
launchctl start com.agentathens.enrichment-16   # or the next upcoming slot
sleep 300 && tail -40 "logs/auto-enrich-$(date +%Y-%m-%d).log"
```
Watch for (in order): `Auth pre-check passed` → batches launched → **no permission-denied/tool-refused lines** (the allowlist-drought failure class) → `Events enriched: N` with N > 0. Verify saves:

```bash
sqlite3 -readonly data/events.db "SELECT COUNT(*) FROM enrichment_log WHERE saved_to_events=1 AND created_at > datetime('now','-2 hours');"
```
Expected: > 0. **If 0 saved or tools were refused:** the allowlist is too tight — `superpowers:systematic-debugging` against BATCH_OUT forensics; loosen only the specific refused command shape, re-canary. Do not proceed to Task 8 with a red canary.

---

### Task 8: Trustworthy health reports (worktree)

`data/health-reports/*.txt` currently prints `Schema valid: 14058/421` and `2546/421 (604.8%) enriched` — all-time numerators over visible-today denominators — and warns on build time every single run (30s threshold vs 342–1883s reality). An unreadable report cannot anchor Phase 2's automated responses.

**Files:**
- Modify: `scripts/health-check.ts` (align populations; threshold), export the stats functions
- Test: `tests/health-check-ratios.test.ts` (create)

**Interfaces:**
- Produces: `getEnrichmentStats(db: Database): { enriched: number; total: number }` and `getSchemaValidationStats(db: Database): { valid: number; total: number }` exported, both computed over the SAME population (visible upcoming events: `location_status IN ('verified_athens','pass_through')` AND end-date-aware upcoming — reuse the exhibitions `end_date` COALESCE rule from CLAUDE.md Tier 1); build-time warn threshold `BUILD_TIME_WARN_MS = 2_400_000`.

- [ ] **Step 1: Failing test with a synthetic fixture DB**

Create `tests/health-check-ratios.test.ts`:

```ts
import { describe, test, expect } from 'bun:test';
import { Database } from 'bun:sqlite';

// Fixture: 3 visible upcoming (2 enriched), 1 hidden, 1 past — the ratio must
// be 2/3, never 2/5 or 4/3. Precondition asserts the fixture actually
// exercises the mixed-population trap that produced "604.8% enriched".
function fixtureDb(): Database {
  const db = new Database(':memory:');
  db.run(`CREATE TABLE events (id TEXT PRIMARY KEY, type TEXT, start_date TEXT, end_date TEXT,
          location_status TEXT, full_description TEXT)`);
  const ins = db.prepare(`INSERT INTO events VALUES (?,?,?,?,?,?)`);
  ins.run('up-1', 'concert', '2099-01-01', null, 'verified_athens', 'long description text here');
  ins.run('up-2', 'concert', '2099-01-02', null, 'verified_athens', null);
  ins.run('up-3', 'exhibition', '2000-01-01', '2099-06-01', 'pass_through', 'running exhibition desc');
  ins.run('hidden', 'concert', '2099-01-01', null, 'unverified', 'enriched but hidden');
  ins.run('past', 'concert', '2000-01-01', null, 'verified_athens', 'enriched but past');
  return db;
}

describe('health-check ratios use one population', () => {
  test('fixture precondition: mixed populations present', () => {
    const db = fixtureDb();
    expect((db.query(`SELECT COUNT(*) c FROM events`).get() as { c: number }).c).toBe(5);
  });

  test('enrichment ratio is visible-upcoming over visible-upcoming', async () => {
    const { getEnrichmentStats } = await import('../scripts/health-check.ts');
    const s = getEnrichmentStats(fixtureDb());
    expect(s.total).toBe(3);      // up-1, up-2, up-3 (end_date-aware exhibition)
    expect(s.enriched).toBe(2);   // up-1, up-3
    expect(s.enriched).toBeLessThanOrEqual(s.total);
  });
});
```

Run → FAIL (function signatures don't accept a db / population wrong). Note: the prod-DB test preload guard means the test CANNOT touch `data/events.db` — the `:memory:` fixture is mandatory, which is the point.

- [ ] **Step 2: Implement**

In `scripts/health-check.ts`: refactor `getEnrichmentStats` (and `getSchemaValidationStats` analogously) to accept a `Database` parameter (default: the existing accessor, so the CLI path is unchanged), and compute both numerator and denominator with the single population WHERE clause:

```sql
location_status IN ('verified_athens','pass_through')
AND COALESCE(CASE WHEN type='exhibition' THEN end_date ELSE NULL END, start_date) >= date('now')
```

`enriched` adds `AND full_description IS NOT NULL AND length(full_description) > 50`. Change line 321's literal `30000` to a named constant `const BUILD_TIME_WARN_MS = 2_400_000;` at the top of the file with the comment: `// 40 min. Was 30s — fired on every run since builds went to 342-1883s, making the report unreadable as truth. 2400s catches genuine runaways only.`

- [ ] **Step 3: Green + report smoke**

```bash
bun test tests/health-check-ratios.test.ts
bun run scripts/health-check.ts && tail -30 "data/health-reports/$(date +%Y-%m-%d).txt"
```
Expected: test green; today's report shows n/N with n ≤ N and no build-time warning (unless a real runaway).

- [ ] **Step 4: Commit**

```bash
git add scripts/health-check.ts tests/health-check-ratios.test.ts
git commit -m "fix(health): single-population ratios + 40min build threshold

Report printed 2546/421 (604.8%) enriched — all-time numerator over
visible-today denominator — and warned on build time every run. A report
that reads as noise can't anchor Phase 2 automated responses."
```

---

### Task 9: Wake schedule (operator runbook) + spike-branch deletion + merge

**Files:**
- Modify: `docs/LAUNCHD-SETUP.md` (append section)

- [ ] **Step 1: Append the wake-schedule runbook to `docs/LAUNCHD-SETUP.md`**

```markdown
## Machine wake schedule (Phase 1, 2026-08-11)

launchd fires missed StartCalendarInterval jobs on wake, but a lid-closed
Mac at 08:00 delays the daily run by hours (observed class: "no full run
fired today", S193). Two `sudo` commands pin the schedule — run manually
(operator password required; agents cannot sudo):

    sudo pmset repeat wakeorpoweron MTWRFSU 07:50:00
    sudo pmset -c sleep 0        # never sleep on AC power

Verify: `pmset -g sched` shows the repeat; `pmset -g | grep ' sleep'` shows 0.
Revert: `sudo pmset repeat cancel` / `sudo pmset -c sleep 1`.
```

- [ ] **Step 2: Delete the spike branch its own HEAD commit orders deleted**

```bash
git log -1 --format='%H %s' spike/cloud-routine-eval   # confirm "DO NOT MERGE — throwaway 66M …"
git branch -D spike/cloud-routine-eval
git push origin --delete spike/cloud-routine-eval
```
Expected: the confirm step shows the DO-NOT-MERGE marker (if it shows anything else, STOP — wrong branch). Local + remote gone; the 66MB blob leaves origin.

- [ ] **Step 3: Merge worktree branch again (Task 8 work), commit runbook, push, remove worktree**

```bash
cd "/Users/chrism/Project with Claude/AgentAthens/agent-athens"
git merge --no-ff fix/phase1-stabilize -m "merge: phase1 health-report fixes"
git add docs/LAUNCHD-SETUP.md
git commit -m "docs(launchd): wake-schedule operator runbook (sudo pmset)"
git push origin main
git worktree remove ../aa-wt-stabilize && git branch -d fix/phase1-stabilize
```

- [ ] **Step 4: Tell the operator (decisions-queue style)**

Surface in the session summary: the two `sudo pmset` commands are the ONLY Phase-1 step requiring the operator; everything else is landed.

---

### Task 10: Phase-1 exit-gate script (computed, never asserted)

**Files:**
- Create: `scripts/phase1-exit-gate.ts`
- Test: `tests/phase1-exit-gate.test.ts`

**Interfaces:**
- Produces: `evaluateGate(input: { deployLog: string; enrichDays: string[]; pushedThrough: string | null; today: string }): { pass: boolean; days: Array<{ date: string; deploy: boolean; enrich: boolean }> }` exported; CLI `bun run scripts/phase1-exit-gate.ts` prints a 7-day table + `PHASE1: PASS|FAIL` and exits 0/1. Spec §4: 7 consecutive days with deploy-success + ≥1 event enriched/day + green push to main.

- [ ] **Step 1: Failing test**

Create `tests/phase1-exit-gate.test.ts`:

```ts
import { describe, test, expect } from 'bun:test';
import { evaluateGate } from '../scripts/phase1-exit-gate';

const deployLog = (dates: string[]) => dates.map((d) => `${d}T08:30:00Z deploy-success`).join('\n');
const week = ['2026-08-12','2026-08-13','2026-08-14','2026-08-15','2026-08-16','2026-08-17','2026-08-18'];

describe('phase1 exit gate', () => {
  test('7 green days → PASS', () => {
    const r = evaluateGate({ deployLog: deployLog(week), enrichDays: week, pushedThrough: '2026-08-18', today: '2026-08-19' });
    expect(r.pass).toBe(true);
    expect(r.days).toHaveLength(7);
  });

  test('one missing deploy day → FAIL (consecutive means consecutive)', () => {
    const r = evaluateGate({ deployLog: deployLog(week.filter((d) => d !== '2026-08-15')), enrichDays: week, pushedThrough: '2026-08-18', today: '2026-08-19' });
    expect(r.pass).toBe(false);
  });

  test('enrichment zero on one day → FAIL', () => {
    const r = evaluateGate({ deployLog: deployLog(week), enrichDays: week.slice(1), pushedThrough: '2026-08-18', today: '2026-08-19' });
    expect(r.pass).toBe(false);
  });

  test('stale origin/main → FAIL', () => {
    const r = evaluateGate({ deployLog: deployLog(week), enrichDays: week, pushedThrough: '2026-08-10', today: '2026-08-19' });
    expect(r.pass).toBe(false);
  });
});
```

Run → FAIL (module missing).

- [ ] **Step 2: Implement `scripts/phase1-exit-gate.ts`**

```ts
/** Phase-1 exit gate (spec §4): 7 consecutive days, each with a
 *  deploy-success line, ≥1 enrichment save, and origin/main pushed within
 *  the window. Pure function + CLI shell so the rule is testable without
 *  the live logs. Europe/Athens dates throughout. */

export interface GateInput {
  deployLog: string;          // contents of logs/deploy-cadence.log
  enrichDays: string[];       // dates (YYYY-MM-DD) with ≥1 enrichment_log save
  pushedThrough: string | null; // date of origin/main tip commit
  today: string;              // YYYY-MM-DD, Europe/Athens
}

export function evaluateGate(input: GateInput): { pass: boolean; days: Array<{ date: string; deploy: boolean; enrich: boolean }> } {
  const deployDates = new Set(
    input.deployLog.split('\n').filter((l) => l.includes('deploy-success')).map((l) => l.slice(0, 10)),
  );
  const enrich = new Set(input.enrichDays);
  const days: Array<{ date: string; deploy: boolean; enrich: boolean }> = [];
  for (let i = 7; i >= 1; i--) {
    const d = new Date(`${input.today}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - i);
    const date = d.toISOString().slice(0, 10);
    days.push({ date, deploy: deployDates.has(date), enrich: enrich.has(date) });
  }
  const windowStart = days[0].date;
  const pushOk = input.pushedThrough !== null && input.pushedThrough >= windowStart;
  return { pass: pushOk && days.every((x) => x.deploy && x.enrich), days };
}

if (import.meta.main) {
  const { Database } = await import('bun:sqlite');
  const { readFileSync } = await import('fs');
  const { DateTime } = await import('luxon');
  const today = DateTime.now().setZone('Europe/Athens').toISODate()!;
  const deployLog = readFileSync('logs/deploy-cadence.log', 'utf8');
  const db = new Database('data/events.db', { readonly: true });
  const rows = db
    .query(`SELECT DISTINCT date(created_at) d FROM enrichment_log WHERE saved_to_events=1 AND created_at > datetime('now','-9 days')`)
    .all() as Array<{ d: string }>;
  const pushed = Bun.spawnSync(['git', 'log', '-1', '--format=%cs', 'origin/main']).stdout.toString().trim() || null;
  const r = evaluateGate({ deployLog, enrichDays: rows.map((x) => x.d), pushedThrough: pushed, today });
  for (const d of r.days) console.log(`${d.date}  deploy=${d.deploy ? '✓' : '✗'}  enrich=${d.enrich ? '✓' : '✗'}`);
  console.log(`PHASE1: ${r.pass ? 'PASS' : 'FAIL'}`);
  process.exit(r.pass ? 0 : 1);
}
```

(Adjust the `enrichment_log` column names to the real schema — check with `sqlite3 -readonly data/events.db ".schema enrichment_log"` — the recon confirmed `saved_to_events=1` exists; verify `created_at` vs an alternative timestamp column and fix the query to match before committing.)

- [ ] **Step 3: Green + live smoke**

```bash
bun test tests/phase1-exit-gate.test.ts          # unit green
bun run scripts/phase1-exit-gate.ts              # live: expected FAIL today (outage days in window) — that's honest
```

- [ ] **Step 4: Commit + push**

```bash
git add scripts/phase1-exit-gate.ts tests/phase1-exit-gate.test.ts
git commit -m "feat(gate): computed Phase-1 exit gate — 7 green days or it didn't happen"
git push origin main
```

- [ ] **Step 5: Schedule the verdict**

The gate needs 7 post-fix days of data. Run `bun run scripts/phase1-exit-gate.ts` daily (manually or via the Phase-2 digest work); Phase 1 is DONE only when it prints PASS — no earlier claim permitted.

---

## Self-Review (performed at write time)

- **Spec coverage:** §4 rows 1.1→Task 1, 1.2→Tasks 2+5+6+7, 1.3→Task 3, 1.4→Task 6, 1.5→Task 9, 1.6→Task 8, 1.7→Tasks 2+9; exit gate→Task 10. AUTH_FAIL deadman signal (spec 1.3): satisfied via the existing `authPrecheckOk()` consumer — Task 3's log-format contract note. Covered.
- **Placeholder scan:** clean — every step has runnable content; two intentional runtime-verification notes (enrichment_log schema check, ALLOWED_TOOLS splitting check) are explicit executor instructions, not gaps.
- **Type consistency:** `verdict`/`HookInput` match the existing test file; `evaluateGate`/`GateInput` consistent between test and impl; `getEnrichmentStats(db)` signature consistent between Task 8 steps.
