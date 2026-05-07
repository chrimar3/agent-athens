# S110g — Empirical silence-duration distribution

**Date:** 2026-05-07 (Step 2 of S110g)
**Source data:** `logs/auto-enrich-*.log`, all dated 2026-04-23 → 2026-05-07
**Methodology constraints:** see "Methodology limits" section below — preserved logs do *not* contain per-event timestamps, so the original plan's intra-event silence pipeline (awk over `content_block_start.thinking → content_block_stop` pairs) is unworkable. This document uses kill-event data as right-censored lower bounds.

---

## Headline finding

The current `STDOUT_IDLE_CAP=120` is killing the **median** of natural agent silence. Mode of stdout-idle kills is at 122s (idle distribution mode); 76/90 (84%) of all real kills happen in the 120–134s polling-overshoot window.

**Recommendation:** Fix A at cap = 600s + Fix C-revised. The dominant failure mode (first-event silence before any save) is solvable by Fix A alone. Fix C-revised adds inter-event coverage as defense-in-depth.

---

## Distribution: stdout-idle kill events (right-censored)

**Total stdout-idle kills:** n = 98
- vs 27 wrapper-wall-clock kills (stdout-idle dominates 4:1)

After segmenting by elapsed-vs-idle gap:

| Population | n | Idle range | Interpretation |
|---|---|---|---|
| At-cap kills | 76 | 120–134s (mode 122) | Agent silent for ≥120s from batch start; cap fires within 15s of crossing threshold. Natural intra-event silence near current cap. |
| Mid-cap real silences | 14 | 143–404s | Silences exceeding the polling-overshoot window. Mix of full-batch silences (`elapsed ≈ idle`, n=10) and mid-run silences (`elapsed >> idle`, n=4). |
| **Suspected laptop-sleep artifacts** | 8 | **555–893s** (`elapsed == idle`) | Excluded from intra-event analysis. macOS clamshell sleep advances `date +%s` and `stat -f %m` but not `sleep N`; on wake, the polling loop sees a huge accumulated idle. See `auto-enrich.sh:371-372` comment. |

**Real intra-event silence distribution** (excluding sleep artifacts, n = 90):
- min: 120s
- mode: 122s
- p50: 122s
- p95: 133s
- max: 404s (right-censored — actual silence would have been longer if not killed)

### Tail observations (mid-cap, n=14)

Sorted by idle ascending:

```
elapsed=143s idle=143s  (full-batch silence; agent silent from launch)
elapsed=143s idle=143s
elapsed=157s idle=157s
elapsed=157s idle=157s
elapsed=184s idle=184s
elapsed=184s idle=184s
elapsed=416s idle=185s  (231s of activity before silence — clear mid-run case)
elapsed=393s idle=192s  (201s of activity before silence)
elapsed=238s idle=213s  (25s before silence)
elapsed=237s idle=236s
elapsed=237s idle=237s
elapsed=416s idle=319s  (97s of activity before silence — agent saved event-1, then silent on event-2)
elapsed=404s idle=404s
elapsed=404s idle=404s
```

**Insight:** The mid-run cases (`elapsed >> idle`, n=4) are operationally meaningful: they prove the agent finishes some work (likely an event save), then thinks silently for 100–300s on the next event. Fix C-revised can intercept these because the prior save advances `temp-descriptions/<id>.md` mtime. Fix A alone handles them via cap raise.

---

## Distribution: successful batch durations

**n = 14 successful batches** (5 events each; logged as `batch-N OK: 5 events saved in Ts`):

```
295s, 435s, 665s, 910s, 932s, 938s, 939s, 1019s, 1019s, 1300s, 1551s, 1637s, 1637s, 1824s
```

- min: 295s (59s/event)
- p50: 939s (188s/event)
- max: 1824s (365s/event) — exceeds current `BATCH_TIMEOUT=900`; would be wall-clock-killed today

Per-event averages span 59s to 365s. The wide range suggests difficulty per event varies heavily — some events think briefly, others think hard.

---

## Methodology limits (read this before using the numbers)

### What we cannot extract from preserved logs

1. **Intra-event silence durations (uncensored).** Stream-json events are dumped into `LOG_FILE` via `cat "$BATCH_OUT" >> "$LOG_FILE"` *after* batch completion (`auto-enrich.sh:437`). They appear without per-event wrapper timestamps. The only timing field inside the JSON is `ttft_ms` on `message_start` (single value per message). The original plan's awk pipeline (pairing `content_block_start.thinking → content_block_stop` via wrapper line prefixes) cannot work — the prefixes don't exist on stream events.

2. **Inter-event save cadence within a batch.** `save-batch.ts` per-event log lines (e.g., `✓ <id>` from `scripts/save-batch.ts:339-371`) appear inside agent stdout, which goes to BATCH_OUT as raw JSON `tool_result` content. They have no wrapper timestamps. The wrapper logs only the per-batch summary (`batch-N OK: M events saved in Ts`).

3. **Composite metric** ("longest stretch where neither BATCH_OUT nor any `temp-descriptions/<id>.md` advanced") — requires per-event creation timestamps for `temp-descriptions/<id>.md`. Preserved batch directories show *final* mtimes only (one mtime per file, set at write time, but we'd need real-time observations to construct intervals). Cannot be computed from this dataset.

### What we have instead

- **Right-censored kill data.** Every `KILL_CAUSE: stdout-idle idle=N` is an exact measurement of how long BATCH_OUT had been silent at the moment of kill. Actual silence ≥ idle (would have been longer if not killed). n=98 observations, of which 90 are usable after excluding suspected laptop-sleep artifacts.
- **Successful batch durations.** Per-batch totals only (n=14). Useful as "the system can succeed at these timings" signal.

### What this dataset cannot tell us

- The *true* p99 of intra-event silence. The cap clips observations at 120s; the right-censored max is 404s; actual p99 could be anywhere ≥ 404s.
- Whether silences over 600s are common in production or a rare tail event.
- How often Fix C-revised's `temp-descriptions/` second signal would actually save a batch — needs observation under a permissive cap.

### Permissive-cap fire as the only way to get uncensored data

If higher confidence in the threshold is needed, the standing fallback is: run one fire with `STDOUT_IDLE_CAP=1800` and `BATCH_TIMEOUT=2700` to capture clean silence durations without truncation. This is documented in the plan as Step 2's contingency. It is not strictly required to make a defensible Step 3 decision — the conservative recommendation below stands without it — but it would convert "right-censored max 404s" into "actual max N" for the next iteration.

---

## Step 3 decision input — synthesis

### What Fix A (raise cap) handles

- **All 76 at-cap kills** (idle 120–134s) → resolved by any cap > 134s.
- **All 14 mid-cap real silences** (idle 143–404s) → resolved by cap > 404s.
- **At cap = 600s**, ~50% safety margin over right-censored max. Resolves 100% of observed real kills.

### What Fix C-revised (`temp-descriptions/*.md` second signal) handles

- **Inter-event silences** (cases where the agent has already saved at least one event, then thinks silently on the next). The 4 mid-run cases (`elapsed >> idle`, idle 185–319s) are the empirical examples. Fix C-revised intercepts these via the prior save's mtime.
- **Does NOT handle:** the dominant failure mode (first-event silence before any save). The 76 at-cap kills happen *before* `temp-descriptions/<id>.md` exists. Fix C-revised cannot save them because there's no second mtime to observe yet.

### What Fix B-tee handles

- All silence cases, including first-event silence, by inserting a heartbeat byte to BATCH_OUT during silence. The "agent thought before any output" case still produces mtime updates via the heartbeat process.
- **Trace status: Incomplete** (per plan Step 3 adoption gate). Open questions: pipe vs `>` redirect, PID-handling under `claude | tee` (kill at line 394 targets `$!`, which becomes the tee PID, not Claude's).

### Recommendation

**Fix A at cap = 600s + Fix C-revised.** Rationale:

- Fix A at 600s resolves 100% of observed real kills (76 at-cap + 14 mid-cap, max 404s with 50% buffer).
- Fix C-revised adds inter-event coverage (the 4 `elapsed >> idle` cases) and resets the watchdog on every save — even if a future hard event silences for 600s on iteration 2 of a batch, the prior save advances the timer.
- Both fixes have Complete (Fix A) or Partial-near-Complete (Fix C-revised) trace status. Fix B-tee is reserved as escalation if verification fire still kills.

**Threshold justification for cap = 600s:**
- Conservative: max real observed × 1.5 = 404 × 1.5 = 606s, rounded to 600s.
- Above the suspected-sleep threshold (no real silence > 500s observed; 600s is the natural cliff).
- Below the 900s `BATCH_TIMEOUT` so wall-clock kill remains the outer fence.
- Within the 1200s ceiling the plan allows for "without Fix B-tee."

### What this recommendation does NOT cover

- Genuine silences > 404s (right-censored — they could exist). If verification fire shows kills above 600s with `elapsed >> idle` (i.e., real mid-run silence beyond cap), escalate to Fix B-tee.
- Laptop-sleep events. The 8 sleep artifacts are not cap-related; they're a separate issue (caffeinate doesn't prevent lid-close sleep per S89 / `specs/claude-hang-diagnostic.md`). Out of scope for S110g.

---

## Source citations

- Kill data: `grep '^\[20.*\] ERROR: KILL_CAUSE: stdout-idle' logs/auto-enrich-*.log` — full pipeline in this session's working notes.
- Successful batches: `grep '^\[20.*\] batch-[0-9]+ OK: [0-9]+ events saved' logs/auto-enrich-*.log`.
- Sleep-artifact filter: `idle ≥ 500 AND |elapsed - idle| ≤ 60`.
- Wrapper code: `scripts/auto-enrich.sh` lines 47–48 (caps), 376–399 (watchdog poll), 437 (BATCH_OUT → LOG_FILE), 371–372 (sleep-clamshell comment).
