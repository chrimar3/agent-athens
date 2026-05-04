# S101 — Enrichment Drought Diagnostic

**Date:** 2026-05-03
**Session:** S101 (latest spec was s100a; this is the next integer)
**Mode:** Diagnostic-only (per brief: verify-assumptions / don't-implement-yet / diagnostic-before-method / conditional-continuation)
**Classification:** **Class G — Novel** (signature closest to B, but B's prescribed fix is wrong)
**Outcome:** **STOP and escalate.** No fix applied this session.

---

## TL;DR

Every Claude CLI subprocess invoked by `auto-enrich.sh` since approximately 2026-04-28 produces **zero bytes of stdout** before being killed at the wrapper's 121s `stdout-idle` gate. Confirmed by 10+ preserved `logs/.batch-*.out` files, all 0 bytes. The wrapper is functioning as designed. The hang is upstream of any wrapper logic. Reverting the wrapper (the brief's Class B fix) would convert "killed at 121s" into "hangs forever," which is strictly worse — it must not be done.

The fix requires a separate session that investigates the Claude CLI v2.1.122+ inference call in launchd context.

---

## Brief-vs-reality mismatches (flagged per `feedback_verify_paths_in_briefs.md`)

| Brief assumption | Reality |
|---|---|
| `.claude/notes/session-log.md` exists for session number lookup | File does not exist. Used `specs/` filenames (latest s100a) to derive S101. |
| 22:00 / 01:00 slots are unloaded per memory | Both `com.agentathens.enrichment-22` and `enrichment-01` are currently loaded (`launchctl list`). Memory or earlier decision is stale on this point. Not modified. |
| Possible Class C: "CLI moved again post-v2.1.121 upgrade" | CLI resolves at `/Users/chrism/.local/bin/claude` v2.1.126 in *both* interactive shell and launchd-style minimal env. Not a path issue. |

---

## Step 0 — Drought confirmation (verbatim)

```
$ sqlite3 data/events.db "SELECT MAX(enriched_at), COUNT(*) FROM events WHERE enriched_at >= datetime('now','-7 days');"
2026-04-28 07:16:31|45

$ sqlite3 data/events.db "SELECT date(enriched_at), COUNT(*) FROM events WHERE enriched_at >= datetime('now','-10 days') GROUP BY d ORDER BY d;"
2026-04-24|19
2026-04-27|35
2026-04-28|10
   (no rows for 04-29 through 05-03)

$ tail data/search-visibility-log.csv | tail
2026-04-27,...,STALE_ENRICHMENT,0,
2026-04-28,...,35,0,
2026-04-29,...,10,0,
2026-04-30,...,0,0,
2026-05-01,...,STALE_ENRICHMENT,0,
2026-05-02,...,0,0,
2026-05-03,...,STALE_ENRICHMENT,0,
```

**Verdict:** 5-day drought is real. Last save 2026-04-28 07:16:31. Total enriched ever: 690.

---

## Step 1 — launchd inventory

All 11 services loaded. Last-exit-status = 0 for every slot. Plists last touched 2026-04-28 (7 of them) — no recent plist edits coinciding with drought start.

```
- 0  com.agentathens.daily
- 0  com.agentathens.enrichment-19
- 0  com.agentathens.monitor-visibility
- 0  com.agentathens.enrichment-01
- 0  com.agentathens.enrichment-13
- 0  com.agentathens.freshness
- 0  com.agentathens.auto-enrich
- 0  com.agentathens.enrichment-16
- 0  com.agentathens.enrichment-check
- 0  com.agentathens.enrichment-22
- 0  com.agentathens.enrichment
```

Recent log mtimes confirm slots ARE firing:
- `enrichment-19-stdout.log` — 2026-05-03 19:02
- `enrichment-16-stdout.log` — 2026-05-03 16:49
- `enrichment-13-stdout.log` — 2026-05-03 13:03
- `enrichment-01-stdout.log` — 2026-05-03 01:02
- `auto-enrich-2026-05-03.log` — 2026-05-03 19:02 (4 separate runs today)

**Rules out Class F (launchd not firing).**

---

## Step 2 — Failure signature

Identical signature in every batch since 2026-04-29:

```
[2026-05-03 19:02:16] ERROR: KILL_CAUSE: stdout-idle pid=53646 elapsed=121s idle=121s exit=125 batch=batch-1
[2026-05-03 19:02:16] ERROR: KILL_CAUSE: stdout-idle pid=53661 elapsed=121s idle=121s exit=125 batch=batch-2
[2026-05-03 19:02:16] ERROR: batch-1 ERROR: subprocess failed (exit 143) and no events saved (121s)
[2026-05-03 19:02:16] ERROR: batch-2 ERROR: subprocess failed (exit 143) and no events saved (121s)
```

Note: `elapsed == idle` always. The subprocess never produced any stdout. Exit 125 = wrapper SIGTERM signal; subprocess exits 143 (128+15).

Two adjacent anomalies bracketing the drought start:
- **2026-04-29 19:09** — Claude CLI warm-up phase took **71 minutes** (19:09:28 → 20:20:50), then auth-pre-check failed and run aborted entirely.
- **2026-05-02 19:01** — Warm-up took **16 minutes** (19:01:09 → 19:17:20), then standard 121s stdout-idle kill.

But on most runs (including today 19:00:04), warm-up and auth-pre-check complete in <10s; only the *real batch invocation* hangs.

Also: the slot-19 stderr file shows "Auto-enrichment failed (non-fatal, continuing...)" entries dating back to **2026-04-18** — slot 19 has been failing for 2+ weeks. Earlier saves (04-24=19, 04-27=35, 04-28=10) must have come from other slots (13/16/22/01). All slots stopped producing saves on 04-29.

---

## Step 3 — Lock files / stuck processes

```
$ ls /tmp/agent-athens-enrich*.lock      → no matches
$ ps aux | grep -E 'auto-enrich|claude -p|run-enrichment'   → no matching processes
```

**Rules out Class A (stuck lock).** **Rules out Class E (geocoding lock contention)** — no enrichment-related processes are alive holding any lock.

---

## Step 4 — Claude CLI path resolution

```
$ which claude
/Users/chrism/.local/bin/claude
$ claude --version
2.1.126 (Claude Code)

$ env -i HOME="$HOME" PATH="/usr/bin:/bin:/usr/sbin:/sbin:/Users/chrism/.local/bin:/Users/chrism/.npm-global/bin" \
    bash -c 'command -v claude && claude --version'
/Users/chrism/.local/bin/claude
2.1.126 (Claude Code)
```

CLI resolves and runs in launchd-style minimal env. **Rules out Class C.**

---

## Step 5 — `auto-enrich.sh` history + S99 wrapper

Most recent wrapper-relevant commit:
```
050150ed6 feat(auto-enrich): stream-idle wrapper + T1 KILL_CAUSE tagging (S99 Step 3)
```

Wrapper invariants (lines 50–55, 320–360):
- `CLAUDE_STREAM_IDLE_TIMEOUT_MS=300000` — server-side stream-idle (5 min)
- Wrapper local `STDOUT_IDLE_CAP=120` — local stdout-idle gate (2 min)
- `BATCH_TIMEOUT=900` (default) — wall-clock cap (15 min)
- Polls via `kill -0`, `date +%s`, and `stat -f %m` — all advance through clamshell sleep (this is correct for macOS).
- caffeinate explicitly removed in S89 (comment line 350): "caffeinate does NOT prevent lid-close sleep so it stays removed."

Exact CLI invocation (line 340):
```bash
"$CLAUDE_BIN" -p "$BRIEF_CONTENT" \
    --output-format text \
    --allowedTools "$ALLOWED_TOOLS" \
    > "$BATCH_OUT" 2>&1 &
```

Note: stdin not explicitly redirected (no `< /dev/null`). Could be relevant — see Hypotheses.

---

## Definitive evidence — preserved BATCH_OUT files

The wrapper preserves per-batch output for forensics on failure:

```
$ ls -lt logs/.batch-* | head -10
-rw-r--r-- ... 0 May  3 19:00 logs/.batch-batch-2-1777824015-53514.out
-rw-r--r-- ... 0 May  3 19:00 logs/.batch-batch-1-1777824015-53514.out
-rw-r--r-- ... 0 May  3 16:42 logs/.batch-batch-2-1777815728-50397.out
-rw-r--r-- ... 0 May  3 16:42 logs/.batch-batch-1-1777815728-50397.out
-rw-r--r-- ... 0 May  3 13:00 logs/.batch-batch-2-1777802425-46153.out
-rw-r--r-- ... 0 May  3 13:00 logs/.batch-batch-1-1777802425-46153.out
-rw-r--r-- ... 0 May  3 10:00 logs/.batch-batch-2-1777791639-39742.out
-rw-r--r-- ... 0 May  3 10:00 logs/.batch-batch-1-1777791639-39742.out
-rw-r--r-- ... 0 May  3 08:13 logs/.batch-batch-2-1777785189-36095.out
-rw-r--r-- ... 0 May  3 08:13 logs/.batch-batch-1-1777785189-36095.out
```

**Every preserved file is 0 bytes.** Across all four slots that fired today (08:13, 10:00, 13:00, 16:42) plus 19:00. Across both batch-1 and batch-2 (different prompt content).

This is the keystone evidence. It rules out:
- "Slow inference" (would emit *some* tokens)
- "Network slowdown" (would emit at least the start of the stream)
- "Output buffering of partial output" (`2>&1` would still capture stderr)
- "Wrapper too aggressive" (wrapper waits for any non-zero mtime advance; got none)

The CLI subprocess is hanging *before emitting first byte to stdout or stderr*.

---

## Classification

| Class | Match | Why |
|---|---|---|
| A — Stuck lock | ❌ | No locks, no processes (Step 3). |
| B — Clamshell sleep | 🟡 partial | Signature ("no progress for >TIMEOUT, no error") matches. **But brief's prescribed fix (revert wrapper to caffeinate -s) is wrong** — wrapper is detector, not cause. Reverting would let processes hang forever. |
| C — CLI path | ❌ | CLI resolves & runs in both contexts (Step 4). |
| D — Quality gate | ❌ | Batches never reach the save step. No score-vs-threshold comparison occurs. |
| E — Geocoding lock | ❌ | No enrichment processes alive (Step 3). |
| F — launchd not firing | ❌ | Slots fired 4× today (Step 1). |
| **G — Novel** | **✅** | Best fit: Claude CLI inference call hangs at byte 0 in launchd context, post-warm-up, post-auth-check. No prior known fix. |

**Final: Class G.**

Per brief: "If classification is Class B, D, E, or G → STOP. Write findings... report back. These need a separate fix session because each has nontrivial regression risk." → **STOP. No Step 7 fix applied.**

---

## Hypotheses (NOT verified — for the fix session to investigate)

Listed roughly in order of plausibility based on evidence. Each is a hypothesis only.

1. **stdin handling regression in CLI v2.1.122+**: invocation lacks `< /dev/null`. In launchd context the inherited stdin may be a special pipe; if the CLI now reads stdin until EOF before responding (when `-p` provides prompt-on-arg), it could hang indefinitely. Easy A/B test: add `< /dev/null` to the invocation and re-fire one slot manually.
2. **`--output-format text` buffers entire response**: would explain 0-byte output if response not yet complete at 121s. But warm-up uses `--output-format json` and finishes in 5s — so `text` mode buffering specifically would have to differ. Test by switching the real invocation to `--output-format stream-json` and check whether incremental tokens land in BATCH_OUT.
3. **MCP / tool init blocking on resource not available in launchd context**: `--allowedTools "$ALLOWED_TOOLS"` could be triggering MCP server load that blocks on terminal/keychain/network call that hangs in non-interactive context. Test by reducing allowedTools to a minimal set or removing the flag.
4. **Auth token refresh blocking on keychain UI prompt**: keychain access in launchd may silently block waiting for UI consent. But auth-pre-check uses the same CLI 5s earlier and succeeds — partial evidence against, not conclusive.
5. **Output produced but going to a different fd (not 1 or 2)**: would explain `2>&1` capturing nothing. Less likely with `--output-format text` but worth verifying with `dtrace`/`fs_usage` on the running process during a hang.

---

## Recommended next session

**S101a — Enrichment hang root-cause investigation.** Suggested approach:

1. Manually fire one slot interactively (not via launchd) with the same env to confirm whether the hang reproduces in foreground. This narrows interactive-vs-launchd as the determinant.
2. If reproduces in foreground: A/B-test the four hypotheses above one at a time (cheapest first: `< /dev/null` redirect).
3. If only reproduces under launchd: capture `dtrace`/`fs_usage` on the hung pid during a fresh run and look for blocking syscalls.
4. While investigating, **do not load any additional slots and do not change the wrapper.** The current wrapper at least bounds the damage.

This jumps ahead of S101a-cornerstone-schema (per brief's note: every day of continued drought is real coverage debt before May 29).

---

## What this session deliberately did NOT touch

- `scripts/auto-enrich.sh` — read only.
- `~/Library/LaunchAgents/com.agentathens.*.plist` — read only.
- `data/events.db` — read-only `SELECT` queries.
- Any source code under `src/`.
- The 22:00 / 01:00 slot loaded-state — flagged as brief/memory mismatch but not modified.
