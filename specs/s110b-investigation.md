# S110b — Investigation Findings (Reverted)

**Date:** 2026-05-04
**Outcome:** First-fire verification produced 0 saves. Per the approved plan's "0 saves → revert" clause, `scripts/auto-enrich.sh` was restored to its prior state (`git checkout`); no commit landed.

## TL;DR

The temp-descriptions cleanup hypothesis was correct for *yesterday's* (S110) failure but does not address *today's* (S110b verification) failure. Today's failure has a different signature — heavy research with long silent thinking gaps that exceed the wrapper's `STDOUT_IDLE_CAP=120s` even after partial-messages emit deltas. The cleanup change itself was mechanically correct and forward-protective, but solving the wrong problem for the present moment.

## What was tried

`scripts/auto-enrich.sh` line 245 (post-temp-briefs-cleanup) had this addition (reverted):

```bash
rm -rf "$PROJECT_DIR"/temp-descriptions/batch-*/ 2>/dev/null || true
```

Plus an inline classification comment block. Pre-flight verified `$PROJECT_DIR` is set unconditionally at line 27 (`PROJECT_DIR="$(dirname "$SCRIPT_DIR")"`) — not the failure cause.

Pre-fire manual prime: `rm -rf temp-descriptions/batch-*/` cleared 10 stale batch subdirs; loose top-level files (`audit-sample.json`, `batch-121-review.md`, `rewrite-1/` etc.) preserved as designed.

## What happened

Slot fired 2026-05-04 14:48:42. Both batches launched within ~22s (warm-up + auth pre-check normal). Both streamed at healthy rates initially (~245KB at 90s, ~370KB at 3.5min). Then the wrapper killed:

- **batch-1**: idle=125s, elapsed=347s. Killed at 14:54:47.
- **batch-2**: idle=123s, elapsed=513s. Killed at 14:57:33.
- **0 saves total.**

## Diagnostic — what the agents were actually doing

Read the killed BATCH_OUT tails for both batches:

**batch-1 last assistant text:**
> *"I have enough research. Let me check the write-description script signature briefly."*

**batch-2 last assistant text:**
> *"Let me verify whether Simon Zhu plays the Il Cannone Guarneri at this specific concert."*

Tool usage (entire run):

| Tool | batch-1 count | batch-2 count |
|---|---|---|
| `WebFetch` | 12 | 12 |
| `WebSearch` | 10 | 18 |
| `Read` | 6 | 10 |
| `Bash` | 8 | 4 |
| `TodoWrite` | 4 | 2 |

Heavy WebFetch + WebSearch usage (research). Read calls are a normal part of the agent's setup (loading docs/MASTER-ENRICHMENT-TEMPLATE.md, etc.), not fact-checking existing description files. The grep for "fact-check existing" / "prior content" / "already have" returned only 1 hit per batch — likely from the brief content itself, not the agent's reasoning.

**Verdict:** the agents were *not* fact-checking existing files. They were doing legitimate research and were about to start writing fresh descriptions. The cleanup-as-intended worked. The failure mode is different.

## Why this matters

The chained-cause story we built across S101 → S101a → S110 was:
> Failed runs leave partial files → next run downshifts to fact-check → exhausts timeout → 0 saves → goto 1

That story is correct *for the failures we observed yesterday* (S110's killed BATCH_OUTs explicitly contained "All 5 files already have prior content within target word ranges. Let me read each, fact-check..." — verbatim).

But today's failures show a *different* mode:
> Heavy Tier 1 research (10–18 WebSearch + 12 WebFetch per batch) → long thinking gaps between tool calls → 120s `STDOUT_IDLE_CAP` fires → 0 saves

These are two distinct failure modes producing the same observable symptom (0 saves). The cleanup fix is correct for the first; today's run hit the second.

## What the cleanup fix would have done if committed

- **Forward-protective**: prevents the deadlock failure mode from re-emerging as files accumulate from future failed runs.
- **No regression**: removes only `temp-descriptions/batch-*/` subdirs, which the agent never reads from intentionally (per the brief, which instructs `write-description.ts <event-id>`, not `read-existing`).
- **Insufficient for today**: doesn't address the silent-thinking-gap kill pattern.

## Why we reverted

The plan's "0 saves → revert" clause was conservative-by-design: don't ship code that didn't visibly help. Strictly applied. The reversion preserves git-history clarity — no one will grep for "S110b temp-descriptions fix" and find a commit whose runtime never produced a save. If we later confirm the cleanup is needed, it can be re-shipped after the silent-gap issue is resolved.

## What the silent-gap issue likely is (hypotheses, not verified)

The wrapper's `STDOUT_IDLE_CAP=120s` measures stdout file mtime advancement. With `--include-partial-messages`, deltas should fire every few tokens during text generation. The 120-130s gaps observed today imply:

1. **Long silent thinking between tool calls.** The agent decides "I have enough research" → pauses to plan write phase → no stream output during planning. If planning takes >120s, the gate fires.
2. **Cache invalidation moments.** Between cached and uncached prompts, the model may pause to refill context. The `cache_creation_input_tokens` field showed values up to 7670 in some events — substantial cache rebuilds.
3. **Tier 1 events are research-intensive by their nature.** Concerts requiring 400-600w descriptions with insider venue intel + artist research take more model thinking than dj_set events (120-180w, less context).

## Recommended next session (S110c — silent-gap mitigation)

Investigate and address the silent-thinking-gap kill pattern. Options in priority order (cheapest first):

1. **Lower `EVENTS_PER_BATCH` from 5 to 3.** Smaller batches = fewer events to research = less total thinking time. Single-flag config change in `scripts/auto-enrich.sh:41`. Cheapest hypothesis to falsify.
2. **Raise `STDOUT_IDLE_CAP` from 120 to 240 or 300.** The wrapper's 2-min gate is more aggressive than the server-side 5-min stream-idle. Bringing them in line would let real thinking gaps complete without false kills.
3. **Add a periodic stream activity beat.** If the agent could be encouraged to emit a short status comment every minute during long thinking phases, the mtime would advance. This is an agent-prompt change, not a wrapper change. Higher cost, harder to test.
4. **Investigate whether the prompt cache configuration is causing the gap.** `cache_creation_input_tokens=7670` events are visible in the stream. If cache rebuilds are happening mid-task, restructuring the prompt to keep more context in the persistent cache might reduce thinking gaps.

**Option 1 is the right first move** — single-line change, easily reversed, and directly tests whether batch size is a primary lever.

## What S110b leaves on the table

- The cleanup fix is *not lost* — its rationale is preserved here, in `.claude/notes/decisions.md` (S110b classification entry — TBD), and in this investigation file. If the silent-gap issue is fixed and the deadlock failure mode re-emerges, the cleanup is one Edit away.
- The per-temp-dir classification table is documented (here + plan file `/Users/chrism/.claude/plans/purrfect-yawning-rossum.md`) so the next debugger doesn't have to re-derive `temp-research/` is unused vs cleanup-eligible.

## Process retrospective (institutional memory)

The S101 → S101a → S110 → S110b chain shipped two real fixes (CLI flags, queue ordering) that each moved real metrics. Neither addressed today's failure mode. Each session reasoned correctly from the evidence available at the time. The failure was that the evidence at each stage was insufficient to surface the actual *silent-gap* problem until S110's verification accidentally exposed it AND today's verification disambiguated deadlock-vs-silent-gap.

Generalizable lessons:
1. **Stacking correct-but-incomplete fixes can create the appearance of progress while leaving the actual root cause intact.** Each fix reduces the failure surface; none guarantees zero failures.
2. **0-save runs may have multiple distinct causes.** Treating "0 saves" as a single failure mode is wrong — diagnose by reading the agent's actual output, not by counting bytes or checking kill signatures.
3. **The diagnostic that broke S110b open** was reading the agent's last assistant text in the killed BATCH_OUT and matching it against expected behavior. That's a faster diagnostic than examining wrapper logs alone — and was the missing step in S101's original diagnosis.

## Status

S110b: investigated and reverted. Code unchanged on `main`. Investigation findings here. Recommended follow-up: S110c silent-gap mitigation, starting with `EVENTS_PER_BATCH=3` test.
