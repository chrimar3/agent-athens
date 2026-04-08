# Fix Plan F2 — Battery Skip + AC Sleep Assertion

**Status:** PLAN — not yet implemented. This document is a spec to be reviewed before any code changes.
**Created:** 2026-04-08
**Diagnostic source:** [`specs/claude-hang-diagnostic.md`](claude-hang-diagnostic.md), specifically Sections 5, 7, 8 R1, 8 R2.
**Empirical input:** R1.A test on 2026-04-08 measured `caffeinate -i sleep 300` at **753s elapsed** on battery with 8-minute clamshell — confirmed FAIL.

---

## Problem statement (one paragraph)

`auto-enrich.sh` uses `caffeinate -i sleep $TIMEOUT` as a watchdog. The `-i` flag prevents idle sleep but **does not** prevent Clamshell Sleep on battery. When the user closes the lid mid-batch on battery, the bash `sleep` is suspended along with the entire script process tree, the watchdog timer never accumulates enough wake time to fire, and the `claude -p` invocation hangs indefinitely. This caused the Apr 7 19h 42m hang. Switching `-i` to `-s` only fixes the AC case (`man caffeinate`: `-s` is "valid only when system is running on AC power"). The battery case has no caffeinate-flag solution, so we **avoid** it instead of fighting it: skip the entire enrichment run when on battery and let the next launchd cycle retry when the user is back on AC.

---

## Decision: Option F2

| Option considered | Decision |
|---|---|
| F1 — caffeinate -s -w only (AC fix only) | Rejected: leaves battery+lid case broken |
| **F2 — caffeinate -s + battery precondition skip** | **Chosen** |
| F3 — caffeinate -s + lid-state ioreg check | Rejected: ioreg parsing more fragile than pmset |
| F4 — F2 + F3 combined | Rejected as initial fix: complexity not justified vs F2; can add F3 later if needed |

**Why F2 wins**: minimal code change (~12 lines of bash, 2 inline edits), no new tool dependencies, eliminates the failure mode entirely (does not just reduce probability), composes cleanly with the existing Session 70 lock-mtime check, and is fully recoverable (next launchd cycle retries automatically). The trade-off is that the pipeline now runs *only when plugged in*, which is the user's normal pattern anyway.

---

## Goal & success criteria

1. **Eliminate the Apr 7 failure mode.** After this fix, no future run can hang because of clamshell sleep — either it skips early (battery case) or it survives the lid-close (AC case via `-s` assertion).
2. **No silent regressions.** All existing happy paths (AC, lid open, queue ≥ 3) must continue to work identically.
3. **Observable in logs.** The skip path must leave a clear log line so a future investigator can distinguish "skipped because battery" from "skipped because queue too small" from "skipped because network down".
4. **Empirically validated.** Before declaring the fix done, re-run the R1.A test on AC and verify a new battery test (R1.A.battery) shows the expected skip.

---

## Changes to `scripts/auto-enrich.sh`

### Change 1 — Add battery precondition check

**Location:** After the orphan-cleanup block (current line 95, after the `fi` that closes the orphan loop), **before** the lock file block (current line 97). Rationale: orphan cleanup is harmless either way and should run regardless. The battery check should run before the lock file is taken so a battery skip doesn't consume a lock cycle.

**New code (insert at line 96):**

```bash
# ============================================================================
# Battery precondition — defer enrichment when on battery power
# ----------------------------------------------------------------------------
# Why: caffeinate -s only prevents system sleep on AC power (per `man caffeinate`).
# On battery, lid-close (Clamshell Sleep) suspends the entire bash process tree
# including the watchdog timer, causing indefinite hangs. Apr 7 2026 incident
# confirmed this empirically — see specs/claude-hang-diagnostic.md Section 5.
#
# Skip strategy: exit 0 (success) so daily-automated.sh treats this as a
# normal "nothing to do" outcome. The next launchd cycle will retry; the user
# can also manually run when plugged in.
# ============================================================================

POWER_SOURCE=$(pmset -g batt 2>/dev/null | head -1)
case "$POWER_SOURCE" in
    *"Battery Power"*)
        log "On battery power — deferring enrichment to next AC cycle"
        log "  (rationale: clamshell sleep on battery would suspend the watchdog;"
        log "   see specs/claude-hang-diagnostic.md Section 5 for details)"
        exit 0
        ;;
    *"AC Power"*)
        : # proceed
        ;;
    *)
        log "Power source unknown ('$POWER_SOURCE') — proceeding (fail-open)"
        ;;
esac
```

**Design choices to confirm with the user before implementing:**

1. **Exit code on skip:** Plan uses `exit 0` (success). Alternative is `exit 0` with a special sentinel (no — there's no sentinel mechanism). Or `exit 2` to mean "deferred" — but `daily-automated.sh` would then log "Auto-enrichment failed" which is wrong because nothing actually failed. **Recommendation: exit 0.**

2. **Fail-open vs fail-closed on unknown power source:** If `pmset -g batt` returns unexpected output (very unlikely), should we proceed (current plan) or skip? Plan uses fail-open because the original script behaviour was always-proceed, and an unknown-power-source skip would be a behaviour change in an unrelated edge case. **Recommendation: fail-open with a log warning.**

3. **Log message wording:** The plan's log message is verbose (3 lines) to make the skip self-explanatory in the daily logs. Could be 1 line if you prefer terser logs. **Recommendation: keep verbose — daily logs are infrequent enough that 3 lines per skip is not noisy.**

### Change 2 — Replace `caffeinate -i` with `caffeinate -s` at warmup

**Location:** Line 239 (in the warmup block).

**Current code:**
```bash
( caffeinate -i sleep 120 && kill "$WARMUP_PID" 2>/dev/null ) &
```

**New code:**
```bash
( caffeinate -s sleep 120 && kill "$WARMUP_PID" 2>/dev/null ) &
```

**Why this works:** by the time we reach this line, the battery check has already run and we're guaranteed to be on AC. `caffeinate -s` is valid on AC and prevents both idle sleep AND clamshell sleep (the macOS clamshell-sleep policy treats `-s`-asserted AC sessions as "do not sleep on lid close" by default).

### Change 3 — Replace `caffeinate -i` with `caffeinate -s` at the per-batch watchdog

**Location:** Line 267 (in the per-batch loop).

**Current code:**
```bash
( caffeinate -i sleep "$BATCH_TIMEOUT" && kill "$CLAUDE_PID" 2>/dev/null && log_error "$BATCH_NAME timed out after ${BATCH_TIMEOUT}s (killed PID $CLAUDE_PID)" ) &
```

**New code:**
```bash
( caffeinate -s sleep "$BATCH_TIMEOUT" && kill "$CLAUDE_PID" 2>/dev/null && log_error "$BATCH_NAME timed out after ${BATCH_TIMEOUT}s (killed PID $CLAUDE_PID)" ) &
```

**Why this works:** same reason as Change 2 — guaranteed AC, `-s` is valid.

### Change 4 — Update the comment block above the watchdog

**Location:** Lines 264-266.

**Current code:**
```bash
    # Start watchdog timer in background.
    # caffeinate -i prevents idle system sleep so the timer survives lid-close/sleep events.
    # Without this, plain sleep pauses during system suspend and a 30-min timeout can stretch to days.
```

**New code:**
```bash
    # Start watchdog timer in background.
    # caffeinate -s asserts no-system-sleep so the timer survives lid-close on AC power.
    # On battery, the precondition check at the top of this script causes early exit,
    # so we are guaranteed to be on AC by this point.
    # Empirical: caffeinate -i was insufficient (R1.A test 2026-04-08 measured 753s for
    # `caffeinate -i sleep 300` on battery+clamshell). See specs/claude-hang-diagnostic.md.
```

**Why:** the comment was the source of the previous false confidence. Updating it to reflect the empirical finding prevents the next maintainer from making the same mistake.

### Optional Change 5 — Same comment update for warmup

**Location:** Lines 235-236.

**Current code:**
```bash
# macOS lacks GNU timeout — use background process with watchdog.
# caffeinate -i prevents idle system sleep so the timer survives lid-close/sleep events.
```

**New code:**
```bash
# macOS lacks GNU timeout — use background process with watchdog.
# caffeinate -s asserts no-system-sleep on AC power. Battery case is filtered
# by the precondition check at the top of this script.
```

---

## What does NOT change

- **Lock file logic** (lines 101-130): unchanged. The Session 70 lock-mtime check stays as the safety net of last resort.
- **Orphan cleanup** (lines 64-95): unchanged. Still runs before any decision-making.
- **Network pre-check** (lines 162-167): unchanged. Still exits 0 on network unavailable.
- **Queue size check** (lines 169-186): unchanged.
- **Brief generation, save-batch, and the per-batch loop logic**: unchanged except for the `-i` → `-s` substitutions and comment updates.
- **`daily-automated.sh`**: not modified. The "deferred (battery)" exit 0 will appear as a normal completion in the parent wrapper's logs.

---

## Test plan (post-fix verification)

### Test 1 — Battery skip (NEW; ~30 seconds)

**Goal:** Verify the precondition check exits cleanly on battery without taking the lock or running enrichment.

**Procedure:**
1. Unplug the laptop (confirm `pmset -g batt | head -1` shows `Battery Power`).
2. Run: `./scripts/auto-enrich.sh`
3. Check the daily log file for the new lines.

**Expected:**
- Script exits within 1 second
- Log contains:
  ```
  [TIMESTAMP] === Auto-enrichment starting ===
  [TIMESTAMP] On battery power — deferring enrichment to next AC cycle
  [TIMESTAMP]   (rationale: clamshell sleep on battery would suspend the watchdog;
  [TIMESTAMP]    see specs/claude-hang-diagnostic.md Section 5 for details)
  ```
- **No** lock file created (`ls .auto-enrich.lock` should fail)
- Exit code: `echo $?` returns 0
- No `temp-briefs/` modification

### Test 2 — R1.A re-run on AC (validates `caffeinate -s` survives clamshell on AC; ~10 minutes)

**Goal:** Confirm `caffeinate -s sleep 300` survives an 8-minute clamshell window on AC power.

**Procedure:**
1. Plug in the power adapter (confirm `pmset -g batt | head -1` shows `AC Power`).
2. From a terminal (NOT Claude Code), run:

   ```bash
   START=$(date +%s); caffeinate -s sleep 300; END=$(date +%s); ELAPSED=$((END-START)); echo "Elapsed: ${ELAPSED}s — PASS if ~300, FAIL if >450"
   ```

3. Wait 10 seconds, close the lid, set phone timer for 8 minutes, walk away.
4. After 8 minutes, open the lid.

**Expected:** `Elapsed: ~300s` (within ±30s).

**If FAIL:** F2 is incomplete. The `-s` flag does not survive AC clamshell on this macOS version. Escalate: would need pmset-level override or option F4.

### Test 3 — Full pipeline test on AC + lid close (~40 minutes; only after Tests 1+2 pass)

**Goal:** End-to-end validation of the fix in the actual production environment.

**Procedure:**
1. On AC. Make sure the queue has ≥3 events (`sqlite3 data/events.db "..."`).
2. Manually trigger `./scripts/auto-enrich.sh` from a terminal you can leave running.
3. As soon as `Enriching batch-1...` appears in the log, **close the lid**.
4. Wait 35 minutes.
5. Open lid, check the daily log.

**Expected:**
- Log shows `batch-1 completed in NNNs` (success path) OR `ERROR: batch-1 timed out after 1800s (killed PID NNNN)` (watchdog fired). Both are valid F2 PASS results.
- Log does NOT stop at `Enriching batch-1...` with no further output.

**If FAIL** (log stops at Enriching batch-1): same as Test 2 FAIL — F2 is incomplete on AC clamshell.

### Test 4 — Smoke test for normal happy path (~15 minutes)

**Goal:** Make sure the fix didn't break anything for the AC + lid-open case.

**Procedure:**
1. On AC, lid open.
2. Run `./scripts/auto-enrich.sh` and let it complete.

**Expected:** Identical behaviour to before the fix. All 3 batches complete with `batch-N completed in NNNs` lines and `Batches: 3 succeeded, 0 failed` at the end.

---

## Rollback plan

If any test fails or the fix introduces an unexpected regression:

1. `git diff scripts/auto-enrich.sh` → review what changed
2. `git checkout scripts/auto-enrich.sh` → restore the previous version
3. Note in `specs/claude-hang-fix-plan-f2.md` what failed and why
4. The Session 70 lock-mtime check remains in place either way, so the worst case stays "Apr 7-style hang recoverable within 7200s".

The fix is small enough (~15 lines of net change) that rollback is trivial.

---

## What F2 does NOT cover (known follow-ups)

These are intentional gaps, not bugs:

1. **AC → battery transition mid-run.** If the user starts on AC, the script proceeds, then the user unplugs, the `caffeinate -s` assertion is dropped (per `man caffeinate`). At that point the script becomes vulnerable to clamshell suspension. **Mitigation:** lock-mtime check still recovers within 7200s. **Future work:** could add a periodic AC-state check inside the per-batch loop, but that's complexity beyond the Apr 7 root cause.

2. **Mode C (mass-fast-fail) from the diagnostic Section 1.** F2 doesn't address the 9 days of `exit 1 @ 2s` failures from Mar 21-31. Tracked as R3 in the diagnostic.

3. **Pipeline scheduling.** The 6h gap between web scraping start and enrichment start (which puts enrichment in the user-walk-away window) is unaddressed. F2 makes the gap less risky (battery skip avoids the failure mode) but doesn't shrink the gap. Tracked as R2d in the diagnostic.

4. **CI/headless machines without a battery.** `pmset -g batt` should return `AC Power` on machines with no battery, so the fail-open branch handles this. Untested. Worth a one-line check if you ever run this on a Mac mini or Mac Studio.

5. **Future macOS versions.** The `man caffeinate` text could change. If a future macOS gives `-s` battery semantics (or adds a `-c` clamshell flag), F2's battery skip becomes overly conservative. Worth re-checking `man caffeinate` after every macOS major upgrade.

---

## Implementation checklist

Estimated total time: **15-20 minutes** for implementation + **~1 hour** for full test suite (Tests 1-4).

- [ ] Read this plan end-to-end
- [ ] Confirm the three "Design choices to confirm" decisions in Change 1
- [ ] Edit `scripts/auto-enrich.sh`:
  - [ ] Insert battery precondition check (Change 1) at line 96
  - [ ] Replace `-i` with `-s` at line 239 (Change 2)
  - [ ] Replace `-i` with `-s` at line 267 (Change 3)
  - [ ] Update watchdog comment (Change 4)
  - [ ] Update warmup comment (Change 5, optional)
- [ ] Run Test 1 (battery skip) — should take ~30 seconds
- [ ] Run Test 2 (R1.A re-run on AC) — should take ~10 minutes
- [ ] Run Test 4 (smoke test happy path) — should take ~15 minutes
- [ ] Optionally: Run Test 3 (full pipeline + lid close) — should take ~40 minutes
- [ ] If all tests pass: commit with message describing the fix and linking to this spec + the diagnostic
- [ ] Update the diagnostic doc R2 status from "MUST-FIX-NEXT" to "FIXED in <commit-hash>"
- [ ] Archive this fix plan to `specs/archive/` after a few clean runs in production

---

*End of fix plan F2. Cross-references: [diagnostic](claude-hang-diagnostic.md), [auto-enrich postmortem](auto-enrich-postmortem.md), `scripts/auto-enrich.sh:267`.*
