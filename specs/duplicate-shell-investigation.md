# Duplicate auto-enrich.sh investigation (parked, post-S110f)

**Status:** Parked. Not in S110f scope. Plan as separate hygiene session after S110f ships.
**Discovered:** 2026-05-07 during S110f Step 0 pre-flight check.
**Severity:** Low-but-real. Two shells acquired the lock simultaneously; only the wrapper's downstream behavior prevented data corruption (and the run still failed for a different reason).

## What was observed

S110f Step 0 pre-flight surfaced three running processes at ~01:00–01:08 Athens time on 2026-05-07:

```
PID    PPID   ETIME   COMMAND
26522  ?      ?       /bin/bash ./scripts/auto-enrich.sh
26686  ?      ?       /bin/bash ./scripts/auto-enrich.sh
26685  ?      ?       claude -p # Enrichment Brief — Batch 2 ...
```

Two distinct `auto-enrich.sh` shells, plus one `claude -p` agent that was a child of one of them. The run terminated at 01:08:05 with:

```
[2026-05-07 01:08:05] ERROR: batch-2 ERROR: subprocess failed (exit 143) and no events saved (468s)
RUN_ID: 1778104817-26522
Batches: 0 succeeded, 2 failed
Events enriched: 0
```

Exit 143 = SIGTERM. Run length 468s (~7.8 min). Zero events saved. The kill happened mid-WebFetch-result-processing on event 2 of batch 2 (Giannis Parios @ Pallas Theater) — see "Failure-mode notes" below.

## Lock mechanism — the bug

`scripts/auto-enrich.sh` lines 140–172 implement a PID-based lock at `$PROJECT_DIR/.auto-enrich.lock` (NOT `/tmp/agent-athens-enrich*.lock` as some pre-flight checks assume — see "Plan correction" below). The check-then-create sequence is:

```bash
LOCK_FILE="$PROJECT_DIR/.auto-enrich.lock"
LOCK_MAX_AGE=7200  # 2 hours

if [[ -f "$LOCK_FILE" ]]; then        # CHECK
    # ... validate age, validate PID liveness, exit if held
fi
echo $$ > "$LOCK_FILE"                # CREATE
trap 'rm -f "$LOCK_FILE"' EXIT
```

This is a classic **check-then-create race**. If two shells start within milliseconds:

1. Shell A: `[[ -f "$LOCK_FILE" ]]` → false (no lock)
2. Shell B: `[[ -f "$LOCK_FILE" ]]` → false (no lock)
3. Shell A: `echo $$ > "$LOCK_FILE"` → writes its PID
4. Shell B: `echo $$ > "$LOCK_FILE"` → overwrites with its PID
5. Both proceed. Both believe they hold the lock.

The trap on EXIT only matters at shutdown; both shells run to completion (or kill) thinking they own the lock.

## Why two shells fired simultaneously

`launchctl list | grep agentathens` shows the smoking gun:

```
com.agentathens.daily
com.agentathens.enrichment           # the "main" slot
com.agentathens.enrichment-01        # 01:00 hourly slot
com.agentathens.enrichment-13        # 13:00 hourly slot
com.agentathens.enrichment-16        # 16:00 hourly slot
com.agentathens.enrichment-19        # 19:00 hourly slot
com.agentathens.enrichment-22        # 22:00 hourly slot
com.agentathens.enrichment-check
com.agentathens.auto-enrich          # separate slot, possibly redundant
com.agentathens.freshness
com.agentathens.monitor-visibility
```

Eleven loaded plists, including five hourly enrichment slots and one un-suffixed `enrichment` plus a separate `auto-enrich`. The 01:00 fire likely overlapped with another slot (most plausible: `com.agentathens.auto-enrich` running on its own schedule, or `com.agentathens.enrichment` firing alongside `enrichment-01`). The user's memory index already flags "22:00/01:00 plist memory drift" as a parked hygiene item — same general territory.

## Failure-mode notes (relevant to S110f, not to this fix)

The run that died at 01:08:05 was killed mid-thinking after receiving a WebFetch result that contradicted the source data:

- DB event: Giannis Parios «Όλη η ζωή μου» @ Theatro Pallas, dated `2026-05-21T21:00:00`
- pallastheater.com: "This event has passed" — actual performances were Jan 21–22 and Feb 4–5, **2025**, not May 2026

Log timeline:
1. 01:05 — agent finished writing event 1 description (`f00bc4a26a4e1681.md`, 781 bytes — file survived in `temp-descriptions/batch-2/` per S110e BATCH_OUT preservation)
2. 01:06 — agent called WebFetch on pallastheater.com for event 2; result returned in 4.5s
3. 01:06–01:08 — agent emitted a `message_start` and a `content_block_start` for a `thinking` block, then went silent
4. 01:08:05 — wrapper killed with SIGTERM (468s elapsed)

The kill came **after** the contradictory data arrived but **before** any visible reasoning was streamed. Best inference: STDOUT_IDLE_CAP fired during a long thinking block while the agent deliberated on the date conflict. This is consistent with the parked S110c finding ("STDOUT_IDLE_CAP recalibration with un-truncated samples").

This means S110f's value lands in two ways relevant to this failure mode:
- §3 (deterministic save) reduces "ask the operator" branches → shorter deliberation
- §4 (concern taxonomy) lets the agent flag `date-conflict-or-unparseable` deterministically instead of deliberating
- §6 (Rule 25 incomplete-write) forces a save with minimum-schema fallback when stuck

So S110f may incidentally relieve the IDLE_CAP-trigger pressure, but the wrapper's IDLE_CAP itself remains parked for a separate session.

## What a follow-up session needs to do

**Investigation:**
- Replace check-then-create with atomic acquisition. Two viable approaches:
  - `mkdir "$LOCK_DIR"` (atomic on POSIX): succeeds for exactly one process, all others fail. Cleanup via `rmdir` in EXIT trap.
  - `flock -n -x 9` on a file descriptor: idiomatic, but adds a dependency check (`flock` is not in macOS by default — would need `brew install flock` or fall back to `mkdir`).
- Audit launchd plists. Eleven slots is a lot. Determine which are obsolete (`com.agentathens.auto-enrich` vs `com.agentathens.enrichment`, the various hourly slots). Consolidate.
- Add a startup-time guard that detects multiple live `auto-enrich.sh` parents of `claude -p` processes and self-aborts the second one as a belt-and-suspenders safety net.

**Verification:**
- Before/after: artificially trigger two `launchctl start` calls within a 100ms window and confirm only one shell proceeds past the lock check.
- Re-run the launchd plist audit after consolidation. Target ≤4 active enrichment slots (one main + check + monitor + freshness, or similar).

**Scope:**
- This is **NOT** in S110f. S110f is locked to validator + filter + monitoring + brief revision + kill switch.
- Follow-up session label suggestion: `S111-lock-hygiene`. Estimated 30–45 min.

## Plan correction (S110f Step 0)

S110f's plan file at `/Users/chrism/.claude/plans/here-is-the-complete-parsed-micali.md` has a pre-flight check that uses the wrong lock-file path:

```bash
ls /tmp/agent-athens-enrich*.lock 2>/dev/null   # WRONG — never matches
```

The actual lock is at `$PROJECT_DIR/.auto-enrich.lock`. Future pre-flights should use:

```bash
ls .auto-enrich.lock 2>/dev/null   # correct, relative to repo root
```

This isn't blocking S110f (today's pre-flight check happened to be empty by both criteria after the batch died), but the assertion was vacuously true. Worth correcting in the plan and in any future pre-flight checks elsewhere.

## Status

- **Investigation:** complete; root cause identified (check-then-create race + 11 launchd slots + likely overlapping fires).
- **Fix:** parked. Suggested follow-up label `S111-lock-hygiene`.
- **S110f impact:** zero. Today's pre-flight is clean by both `ps` and lock-file checks. Proceed with Step 1 when greenlit.
