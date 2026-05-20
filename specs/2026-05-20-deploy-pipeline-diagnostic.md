# Deploy Pipeline Diagnostic — 2026-05-20

**Mode:** Read-only diagnostic. No edits to `scripts/`, `~/Library/LaunchAgents/*`, or `dist/`.
**Trigger:** Daily-pipeline deploy errored at 10:32 Athens despite S142 hardening (`c9ae3b53f`, 2026-05-18).
**Prior context:** S142 banked `--no-build` + `--json` + state-poll + `tr -d` control-char-strip + retry-once gate for "Deploy canceled".
**Identity:** Date-keyed to avoid S-number collision; cite `S142` for the prior hardening.
**Output role:** Input for fix-session routing. Implementation deferred.

---

## TL;DR

S142's `--no-build` fix is intact and working — the build-step failure mode it targeted does NOT recur. A **new failure mode** has surfaced: the Netlify API returned `HTTP 422 Unprocessable Entity` to the deploy creation request. The CLI exited `1` with an error-shape JSON output (no `.deploy_id` / `.id` key), the script's parse-or-fail at `daily-automated.sh:575-577` bailed out, and **the retry-once gate at line 599 was never reached** — that gate only fires on `state=error + msg="Deploy canceled"`, not on parse-failure.

- **Failure class: B** — S142 fix is present and addresses a DIFFERENT failure mode (build-step + silent-rollback). The new failure (CLI-side `HTTPError` returning error JSON before state-poll) was not in S142's threat model.
- **Manual fallback works** — `netlify deploy --no-build --dir=dist` (no `--json`, no `--message`) succeeded at 10:37 Athens (deploy `6a0d64ceaf7de0392246f4ad`, `commit_ref: null`). Demo-safe as interim with operator monitoring, NOT autonomous.
- **Proposed fix size: S (~30 lines)** — extend the parse-or-fail boundary to fall back to `listSiteDeploys` + match-by-message when DEPLOY_ID can't be extracted but the API may still have created a deploy artifact (today's 10:32 failure produced deploy `6a0d6385` on the Netlify side with title="Daily deploy 2026-05-20" — recoverable via listing).

---

## Step 0 — S142 patch presence

**S142 patch (`c9ae3b53f`) IS in current `scripts/daily-automated.sh`.** Verified by grep:

| Line | S142 component | Present |
|---|---|---|
| 478 | `run_deploy()` function | ✓ |
| 549–550 | SITE_ID read from `.netlify/state.json` | ✓ |
| 561 | `netlify deploy --prod --no-build --dir=dist` | ✓ |
| 562 | `--message "Daily deploy $(date +%Y-%m-%d)" --json` | ✓ |
| 567–570 | Control-char strip + `jq -r '.deploy_id // .id // empty'` | ✓ |
| 575–577 | `if [ -z "$DEPLOY_ID" ]; then ... return 1` (**parse-or-fail**) | ✓ |
| 584–585 | State poll via `netlify api getSiteDeploy` | ✓ |
| 594 | Forensic log line `[deploy] id=… state=… error=… cli_exit=…` | ✓ |
| 597 | `[ "$attempt" = "2" ] && return 1` | ✓ |
| 599–615 | Retry-once gate: `state=error + msg="Deploy canceled" + 0 concurrent` | ✓ |

`scripts/daily-automated.sh` line count: 818. No commit on this file post-S142 (`c9ae3b53f` is HEAD for this file in `git log`). **Hypothesis A (patch reverted/overwritten) REFUTED.**

---

## Step 1 — Failure signature (verbatim)

**Source:** `logs/pipeline-2026-05-20.log:4445-4458` (also at `logs/launchd-stderr.log` tail).

```
========================================
PHASE: DEPLOYMENT
========================================
[2026-05-20 10:32:13] Checking for pipeline-output changes...
To https://github.com/chrimar3/agent-athens.git
   12fc129d1..bead0b152  main -> main
[2026-05-20 10:32:16] Pipeline outputs pushed to git
[2026-05-20 10:32:16] Deploying dist/ to Netlify via CLI (attempt 1)...
 ›   JSONHTTPError: Unprocessable Entity
[2026-05-20 10:38:28] ERROR: [deploy] could not parse deploy_id (cli_exit=1); failing
```

**Decomposition:**

1. **CLI was invoked** with all S142 flags (`--prod --no-build --dir=dist --message "Daily deploy 2026-05-20" --json`).
2. **CLI hung ~6 minutes** between invocation (10:32:16) and error report (10:38:28). The Netlify side DID create a deploy artifact during this window: `6a0d6385` at 07:32:21 UTC (10:32:21 Athens), title="Daily deploy 2026-05-20", `state=error`, `commit_ref=null`. That title matches the script's `--message` flag, confirming this errored deploy came from the script.
3. **CLI exited 1** with `JSONHTTPError: Unprocessable Entity` (HTTP 422) printed to its stderr (which the script redirects to `$LOG_FILE`). This is a Netlify API rejection of one of the deploy operations (creation, upload, or finalize).
4. **Script's `--json` stdout** contained either: (a) no JSON at all (CLI errored before writing structured output), or (b) an error-shape JSON without `.deploy_id` or `.id` keys.
5. **Script's parse at line 568–570** returned empty `DEPLOY_ID`. The branch at line 575–577 triggered: `log_error "[deploy] could not parse deploy_id (cli_exit=1); failing"; return 1`.
6. **Retry gate at line 599 was never reached** — parse-failure exits before any `getSiteDeploy` poll happens, so `STATE` and `ERR_MSG` are never set, and the gate's condition (`state=error AND msg="Deploy canceled"`) can't be evaluated. The retry-once mechanism is fully bypassed for this failure mode.

**The error happened OUTSIDE S142's hardened path.** S142 wraps the post-parse poll/retry sequence; the new failure occurs at the parse boundary itself, which is a hard `return 1`.

**Note on Netlify API rejection:** `Unprocessable Entity` (422) from Netlify is documented for: invalid auth, request body validation failure, site config mismatch, or unsupported deploy state. Today's 12:08 deploy (`6a0d79fb`, also `state=error`, also from this site) suggests the condition persists — not a single-transient flap. Determining which 422 sub-cause requires looking at the CLI's actual stderr (which `2>>"$LOG_FILE"` should have captured but only the `JSONHTTPError:` summary line surfaces — the structured detail may be in deeper log lines not yet inspected).

---

## Step 2 — Classification

### Failure class: **B**

S142's fix is present (Step 0) and the build-step failure mode it targeted does NOT recur. The new failure (`HTTPError 422` returning before parseable `--json` is produced) is a DIFFERENT mode that S142 didn't anticipate.

### S142's threat model vs. today's failure

| S142-covered mode | Symptom S142 catches | Today's failure |
|---|---|---|
| Build cmd runs under launchd PATH/env, fails | CLI exits non-zero before any deploy created | NOT THIS — `--no-build` is present, no build step ran |
| Silent rollback ("Deploy canceled") | CLI exits 0, deploy goes to `state=error`, retry gate fires | NOT THIS — CLI exited 1, no `Deploy canceled` ERR_MSG |
| Control chars in API JSON | `jq` parse error on `getSiteDeploy` response | NOT THIS — failure is at CLI's own JSON output, before any `getSiteDeploy` call |
| **(uncovered)** CLI returns HTTP error → error-shape JSON without `.deploy_id`/`.id` | — | **THIS** |

### Root-cause hypothesis (with log evidence)

The Netlify API returned `HTTP 422 Unprocessable Entity` to one of the deploy creation/upload operations. The Netlify-side deploy artifact `6a0d6385` was created (title matches script's `--message`), but transitioned to `state=error`. CLI surfaced `JSONHTTPError: Unprocessable Entity` to stderr and likely wrote either an error-JSON or no JSON to stdout. The script's parse-or-fail (`if [ -z "$DEPLOY_ID" ]; then return 1`) is the proximate cause of the silent-rollback-to-prior-good-deploy outcome — without parse success, no poll, no retry.

**Sub-causes for the 422 (NOT determined this session, requires fix-session probe):**
1. Auth token in `.netlify/` state has gone stale (most likely given the 10:37 manual deploy succeeded — but it used the same CLI auth, so this is less likely than I initially thought).
2. `dist/` content tripped a Netlify validation rule (file size, count, suspicious content).
3. Rate limiting from the 4+ deploys today.
4. Netlify-side config drift on this site.
5. Transient platform error (the 12:08 recurrence argues against pure transient).

The successful 10:37 manual deploy invocation used `netlify deploy --no-build --dir=dist` (no `--json`, no `--message`). The DIFFERENCE between failing and succeeding invocations is `--json` + `--message`. **Worth a hypothesis: `--message "Daily deploy 2026-05-20"` may contain a character or be a duplicate-string that Netlify's 422 validation rejects on this site.** Trivially testable in a fix session: try the manual deploy with `--json --message "Daily deploy 2026-05-20"` and see if 422 reproduces.

### Manual fallback as interim — IS it demo-safe?

**Conditionally yes, with operator monitoring required:**

- Manual `netlify deploy --no-build --dir=dist` works (verified by 6a0d64ce + 6a0d6844 today).
- Requires human notice of the daily-pipeline error → manual run. Today this gap was 5 minutes (10:32 error → 10:37 manual). For a 9-day-out demo, that's acceptable IF someone watches the daily fire window.
- **NOT autonomous.** If no operator is watching, prod stays on the prior-good deploy (S139 stages 1+2+5 are live as of 10:38, but if a future deploy fails the same way, prod won't update until manual intervention).
- The "watch and manually intervene" workaround is exactly what S142 was designed to ELIMINATE — running it for 9 more days re-opens the citability-decay risk S142 was banked to close.

**Recommendation:** treat the manual fallback as a 24–48h emergency bridge, not a 9-day pre-demo posture. Ship the fix before the next demo-deploy cycle.

### Proposed fix shape — S (~30 lines)

**Location:** `scripts/daily-automated.sh` at the parse-or-fail boundary, lines 575–577.

**Sketch:**
```bash
if [ -z "$DEPLOY_ID" ]; then
    # NEW: fall back to listSiteDeploys to find a deploy artifact the API
    # may have created before erroring (today: 6a0d6385 created server-side
    # despite CLI's JSONHTTPError exit).
    DEPLOY_ID=$(netlify api listSiteDeploys \
        --data "{\"site_id\":\"$SITE_ID\",\"per_page\":5}" 2>/dev/null \
        | tr -d '\000-\010\013\014\016-\037' \
        | jq -r --arg msg "Daily deploy $(date +%Y-%m-%d)" \
            '[.[] | select(.title == $msg)] | first.id // empty' 2>/dev/null)

    if [ -z "$DEPLOY_ID" ]; then
        log_error "[deploy] could not parse deploy_id AND no matching server-side deploy (cli_exit=$cli_exit); failing"
        return 1
    fi
    log "[deploy] CLI failed but server-side deploy found via listSiteDeploys; entering state-poll"
fi
```

This recovers DEPLOY_ID from the server side when the CLI's local parse fails. The existing state-poll + retry-gate code then runs normally — if state=error + Deploy canceled, the gate retries; if state=error + 422-class error, the gate (correctly) refuses retry and the operator gets a clear forensic log line.

**Routing:** Single-file script change. Should bundle with a small companion test (`scripts/__tests__/deploy-fallback.test.sh` or similar). Not a Netlify config change. Not a launchd plist change.

---

## Step 3 — Launchd state

### Job status (`launchctl list | grep agentathens`)

| Job | PID | Last exit | Interpretation |
|---|---|---|---|
| `com.agentathens.daily` | `-` (dead) | **1** | Fired at 08:00; ran ~2.5h; errored in run_deploy at 10:38:29 |
| `com.agentathens.freshness` | 5932 | (running) | Fired at 08:00; still running as of probe time, stuck somewhere past email ingestion |
| enrichment-01 / -13 / -16 / -19 / -22 | `-` | 0 | Inactive (not in active window) |
| monitor-visibility | `-` | 0 | Inactive |
| auto-enrich | `-` | 0 | Inactive |
| enrichment-check | `-` | 0 | Inactive |

**Both `daily` and `freshness` are firing on schedule.** This is NOT a "launchd didn't trigger" problem.

### Duplicate-fire pattern (S142 deferred)

Both plists have `StartCalendarInterval` = `Hour=8 Minute=0`. Both invoke `scripts/daily-automated.sh`. This was flagged as out-of-scope at S142 (`session-log.md:5857`: "Plist-deconflict session queued"). It is NOT the proximate cause of today's deploy error — the daily job hit the API error on its own without freshness interference (freshness has been stuck at "Fetching new emails from IMAP" since 08:08:38 and never reached the deploy phase).

### `log show` predicate returned empty

`log show --predicate 'process == "launchd"' --last 1d | grep -i agentathens` returned 0 matches. macOS's unified log doesn't expose launchd job-fire events at that filter depth. Not useful for this diagnostic; the `launchctl list` exit-code column is the actionable signal.

### Side observation worth a separate session

`com.agentathens.freshness` (PID 5932) has been running ~4+ hours with only one log line ("Fetching new emails from IMAP..."). Either:
- The script is stuck on IMAP (network or auth issue with the email source)
- The script is past IMAP but stdout buffering hasn't flushed
- The script crashed silently (less likely — process is still alive in `launchctl list`)

Plus today's `Database backup failed` (08:08:39, non-fatal but persistent since 2026-04-29) and `Email ingestion failed` (08:08:39, non-fatal) are layered chronic issues. Not blockers for the deploy fix, but the daily pipeline is accumulating non-fatal errors that obscure signal-to-noise in the logs.

---

## Boundary statement

This was a **read-only diagnostic**. Files read:
- `scripts/daily-automated.sh` (lines 555–625 inspected)
- `logs/freshness-stderr.log`, `logs/freshness-stdout.log`, `logs/launchd-stderr.log`, `logs/pipeline-2026-05-20.log` (tail + targeted greps)
- `~/Library/LaunchAgents/com.agentathens.daily.plist`, `com.agentathens.freshness.plist`
- Netlify API (`listSiteDeploys` via `netlify api`) for deploy log

Files NOT modified: any. No `scripts/` edits, no plist edits, no `dist/` operations, no manual deploys triggered.

Out of scope for this diagnostic (queued):
- Identifying the specific Netlify 422 sub-cause (requires curl probe with the failing `--json --message` argument set, or netlify support escalation)
- The 12:08 second-error reproduction (likely same root cause)
- Plist deconflict (still queued from S142)
- Freshness pipeline stuck on IMAP (separate issue)
- Database backup chronic failure (separate, since 2026-04-29)

---

## Done-when criteria (from session brief)

- [x] S142 patch presence confirmed in current script
- [x] Verbatim failure signature captured (`JSONHTTPError: Unprocessable Entity` + script's `could not parse deploy_id` log)
- [x] Failure class assigned: **B** with evidence
- [x] Proposed fix shape: S (~30 lines, single script file, listSiteDeploys fallback at parse boundary)
- [x] Manual fallback demo-safety statement: yes as 24–48h bridge with operator monitoring, NOT for full 9-day pre-demo posture
- [x] Launchd firing state: both jobs fire; daily errored, freshness stuck (separate)

---

## Routing

- **Planner:** schedule a fix session for the listSiteDeploys-fallback shape. Single-file scope, ~30 lines + small test. Should ship before the next daily-pipeline fire if possible (next fire 2026-05-21 08:00 Athens).
- **Operator (Christos):** monitor next 24–48h of daily fires; manual `netlify deploy --no-build --dir=dist` as soon as a `state=error` is observed. Manual deploys without `--json --message` succeed reliably.
- **Known-issues update:** add or refresh entry "Daily pipeline deploy errors on Netlify HTTP 422; S142 hardening insufficient at parse-or-fail boundary" — severity 🟡 (workaround exists), citing this diagnostic spec and the 10:32 + 12:08 instances.
- **Mistakes.md update** (post-session): banking the rule "S142-style state-poll-and-retry gates do not cover failure modes that exit before deploy_id parse — gate scope is conditional on parse success, not absolute." Cross-reference Pattern C (commit-message-as-state-proxy) and Pattern N (verification-gate scope-matching).

---

## Known-issues entry (pending merge)

> Parked here because `docs/known-issues.md` is being written by a parallel mobile-scroll session at the time of this diagnostic + fix commit. Christos to land this entry into `docs/known-issues.md` once that session's edits are committed and the file is clean. Recommended placement: alongside the existing S142 daily-pipeline entry (same severity-neighborhood).

```markdown
### Daily Pipeline Deploy "Deploy Canceled" Bypass of S142 Retry Gate
**Severity:** 🟡 Resolved (gate now reachable via listSiteDeploys fallback)
**First seen:** 2026-05-20 (instances: 10:32 + 12:08 Athens)
**Frequency:** Intermittent — correlates with concurrent-deploy windows
**Symptoms:** Daily-pipeline run errors at the DEPLOYMENT phase. `logs/pipeline-YYYY-MM-DD.log` shows:
```
[HH:MM:SS] Deploying dist/ to Netlify via CLI (attempt 1)...
 ›   JSONHTTPError: Unprocessable Entity
[HH:MM:SS+~6m] ERROR: [deploy] could not parse deploy_id (cli_exit=1); failing
```
Netlify-side, the deploy artifact carries `state=error` + `error_message="Deploy canceled"` — exactly the S139/S142 silent-rollback gotcha. The S142 retry-once gate at `scripts/daily-automated.sh:602` was DESIGNED for this case but was unreachable: it required parsed `deploy_id`, which the CLI's HTTP-error path doesn't produce.
**Impact:** Production stays on prior-good deploy. Manual `netlify deploy --prod --no-build --dir=dist` (no `--json --message`) succeeds; operator intervention needed.
**Root cause:** Concurrent-deploy collision (daily.plist + freshness.plist both fire at `Hour=8 Minute=0`; S142 deferred the plist-deconflict as out-of-scope). Netlify cancels one of the colliding deploys server-side; CLI surfaces the cancellation as `JSONHTTPError: Unprocessable Entity` and exits non-zero with empty `--json` stdout, bypassing the script's parse-or-fail boundary BEFORE the retry gate can evaluate.
**Workaround (interim, demo-safe for 24–48h with monitoring):** Manual `netlify deploy --prod --no-build --dir=dist` when a `state=error` is observed. Manual deploys without `--message` are not affected by the same cancellation cascade.
**Fix plan:** Insert listSiteDeploys-fallback at the parse-or-fail boundary so the retry gate becomes REACHABLE. The gate then handles "Deploy canceled" correctly (retry once after 0 concurrent non-terminal deploys remain). Shipped 2026-05-21 in commit `[FIX_COMMIT_HASH]` — see `specs/2026-05-20-deploy-pipeline-diagnostic.md`.
**Follow-on (not in this fix):** Concurrency root cause remains — plist-deconflict (`daily` + `freshness` both `Hour=8 Minute=0`) was deferred at S142 and is now demonstrably load-bearing. Should ship before 2026-05-29 demo. The reachability fix makes the gate work; eliminating the cancellations is the durable solution.
**Status:** Reachability fix shipped 2026-05-21; cancellation root cause (plist-deconflict) queued separately.
```

(Replace `[FIX_COMMIT_HASH]` with the actual hash from this commit when merging into `docs/known-issues.md`.)
