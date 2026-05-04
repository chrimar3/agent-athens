# S110c — Calibration Results (Reverted)

**Date:** 2026-05-04
**Outcome:** `STDOUT_IDLE_CAP=180` was applied, validated via one launchctl-fired run, and **reverted** when the run produced 0 saves with the new gate firing at idle=192s. Working tree restored. No commit landed.

## TL;DR

The empirical n=19 distribution (median=125s, range=120–134s) was **truncated by the very gate it was sampled from** — a survivor-distribution-bias error. Once the gate was raised to 180s, naturally longer thinking gaps that previously couldn't be observed (because they'd been killed at 120s) became visible: the verification run hit a 192s idle gap and was killed at the new gate. The 13:07 historical 319s outlier was *not* a poll-loop artifact — it was part of the real distribution we'd systematically under-sampled.

## What was tried

`scripts/auto-enrich.sh:48` had `STDOUT_IDLE_CAP=120` raised to `STDOUT_IDLE_CAP=180`, with a 7-line calibration comment block above documenting the data point. Pre-flight verified plists set `CLAUDE_STREAM_IDLE_TIMEOUT_MS=300000` and `BATCH_TIMEOUT=900` (no plist override of `STDOUT_IDLE_CAP`). Manual prime: `rm -rf temp-descriptions/batch-*/` to remove the deadlock failure mode as a confounder.

Slot fired 2026-05-04 15:44:09. Both batches launched at 15:44:23 (warm-up + auth pre-check normal, ~14s).

## What happened

| Batch | Outcome | Detail |
|---|---|---|
| **batch-1** | **Clean exit, 0 saves, 48s** | New failure mode. Agent exited cleanly without writing any files (`temp-descriptions/batch-1/` empty post-run). Wrapper logged `WARN: subprocess reported success but no events saved (48s) — possible new failure class`. BATCH_OUT was deleted on clean exit; root cause not directly observable. |
| **batch-2** | **Killed at idle=192s, elapsed=393s** | The S110c gate=180 fired (with 12s poll-loop slack). Confirms STDOUT_IDLE_CAP=180 IS being applied — kills now happen at 180–195s, not 120–135s. |

`grep KILL_CAUSE` final state:
```
[2026-05-04 15:50:56] ERROR: KILL_CAUSE: stdout-idle pid=13107 elapsed=393s idle=192s exit=125 batch=batch-2
[2026-05-04 15:50:57] === Auto-enrichment complete ===
[2026-05-04 15:50:57] Batches: 0 succeeded, 2 failed
[2026-05-04 15:50:57] Events enriched: 0
```

## The methodological error: survivor-distribution bias

The n=19 distribution we calibrated against was sampled *from kills*, which means every observation was an idle value *below* the gate. We essentially measured `min(true_idle, gate_value)` and inferred properties of `true_idle` from it. When we raised the gate to 180s, longer thinking gaps that were previously invisible (because they'd been clipped to 120s by being killed) became visible.

**The 13:07 outlier (319s idle) wasn't poll-loop artifact.** It was a real natural-distribution data point — we just didn't have enough of them to recognize the pattern, because the gate was actively suppressing them.

**Better calibration approach:** sample idle gaps from *successful* runs (where the agent's full natural pacing is preserved). The S101a successful run (818s elapsed, 122s final idle, 5 saves) is one un-truncated data point — but n=1. Need more. Either:
- Run with a deliberately permissive cap (300s+) to collect a richer un-truncated sample, then re-calibrate.
- Or use `BATCH_TIMEOUT` as the only gate (rely on server-side `CLAUDE_STREAM_IDLE_TIMEOUT_MS=300s` for stuck-detection, accept that 120s idle gate was wrong premise).

## Why we reverted

Per the plan's literal "Zero saves at idle≈180" decision row → revert + pivot. Even though the gate at 180 demonstrably worked mechanically (kills moved from idle=125 to idle=192), it didn't translate to saves. Shipping a non-helping change buries a useful diff under noise; better to keep main clean and re-approach with corrected methodology.

## What this leaves on the table

- The reverted change is *not lost* — its rationale and the corrected methodology are preserved here. If a future session re-attempts a cap raise, the survivor-bias warning + recommended sampling approach are documented.
- batch-1's clean-exit-with-0-saves anomaly is **a new failure mode**, separate from the gate-calibration issue. Worth its own investigation. Symptoms: temp-descriptions/batch-1/ empty post-run, 48s elapsed, wrapper's "possible new failure class" warning. Could be: agent saw something problematic in the brief and bailed early; CLI startup error that exited cleanly; some edge case in claude-p invocation.

## Recommended next session — S110d

**EVENTS_PER_BATCH=5 → 3** in `scripts/auto-enrich.sh:41`. Single-flag config change, easily reversed.

Reasoning given today's data:
- Smaller batches finish faster → fewer events per run = lower wall-clock + idle exposure
- The 5-event Tier 1 batches we've been running take 8-15+ minutes. 3-event batches should be 5-9 minutes — well under `BATCH_TIMEOUT=900`.
- Smaller batches have fewer between-event thinking gaps, reducing exposure to the natural distribution's longer tail.
- Has precedent: S78–S81 tuned this multiple times (5→4→3→4→5).

Side benefits:
- 6 batches/day instead of 4 (2 batches × 3 daytime slots) — actually wait, batches are parallel within a slot; tuning batch size doesn't change slot count. So throughput math: 4 slots × 2 batches × 3 events × hypothetical 80% success = 19 events/day. With 5 events × 50% it was 20/day, so EVENTS_PER_BATCH=3 is throughput-neutral or slight loss IF success rate doesn't improve. The bet is success rate goes from ~0% (today) to >50% with shorter batches.
- Reduces blast radius of any single batch failure.

Note: separately investigate batch-1's clean-exit-with-0-saves anomaly. Could be a side effect of EVENTS_PER_BATCH=3 if the brief includes the problematic-event that triggered today's bail. Or could be unrelated.

## Status

S110c: investigated, reverted. Code unchanged on `main`. Working tree clean. Findings here. Recommended follow-up: **S110d** (EVENTS_PER_BATCH=5→3) + **S110e** (investigate batch-1 clean-exit anomaly).
