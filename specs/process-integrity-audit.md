# Process-Integrity Audit — planner → relay → executor loop

**Date:** 2026-06-16
**Scope:** Read-only audit. Ground truth for the A3 guard-trio design.
**Iron rule honored:** No source/config/notes/DB changes. This report is the only file written.
**Branch:** `main`

---

## Step 0 — Discovery (artifact verification)

Planner-asserted paths were verified before trusting them. One correction:

| Artifact | Asserted | Actual | Status |
|---|---|---|---|
| `.claude/notes/mistakes.md` | present | 276 KB, mtime 2026-06-14 | ✓ |
| `.claude/notes/patterns.md` | present | 487 KB, mtime 2026-06-16 | ✓ |
| `.claude/notes/decisions.md` | present | 485 KB, mtime 2026-06-15 | ✓ |
| `docs/session-log.md` | present | 7,068 lines / 712 KB, mtime 2026-06-14 | ✓ |
| `scripts/daily-automated.sh` | present | 30 KB, mtime 2026-05-23 | ✓ |
| `CLAUDE.md` | **project root** | **`.claude/CLAUDE.md`** (root has none) | ⚠ relocated |
| branch | `main` | `main` | ✓ |

**Note:** The CLAUDE.md the planner expected at the project root does not exist there; the live project config is `.claude/CLAUDE.md`. The root-level `/Users/chrism/CLAUDE.md` loaded into session context is a generic React/TS template and does **not** describe this Bun/TS project. Step 5 used `.claude/CLAUDE.md`. Core notes files all present → audit proceeded.

---

## Step 1 — Recurrence ledger ("verify-the-premise")

**Finding.** The brief asked to resolve "planner says 11, governance baseline says 9 — which is true." **Neither is true.** The metric has *no single source of truth*: it is tracked in at least three stores with four divergent values, drifting independently. This is count fragmentation, not a miscount.

**Evidence.**

| Store | Value(s) found | Citation |
|---|---|---|
| `patterns.md` — formal numbered series | 7 (pre-S135) → **9** (S135) → "holds at 9" (S141) → **#10** (S165) → "unchanged" (S180) | patterns.md:4074, 5120, 5400, 5502 |
| `patterns.md` — *separate* executor-side framing-gap ledger | **10** (S143), explicitly "counted separately… do NOT conflate" | patterns.md:5122, 5138 |
| `docs/session-log.md` — running prose ledger | "now 13" (L440), "Now 10" (L2593), "recurrence #10" (L6678), **"now 14"** (L6652, latest) | session-log.md:440, 2593, 6652, 6678 |
| `MEMORY.md` — planner ledger | **"ledger 13"** (S188, 2026-06-12) | MEMORY.md (planner store) |
| Brief assertion | planner = 11, baseline = 9 | this session's brief |

- **The value `11` appears in none of the stores.** `9` is the S135-era value, stale since S141.
- **Latest increment by store:** session-log = **14**; patterns.md formal series = **10** (frozen at S165, S180 confirms unchanged); planner memory = **13**.
- **Pattern A vs B split** (patterns.md:4052, 4074): Pattern A (dominant) = brief asserts a wrong path / a current-state defect that does not exist. Pattern B (rarer) = the deliverable *already shipped* (refutation). Pre-S135 = 7 instances, all Pattern A. S135 added one A + one B.
- **Last 3 formal increments** (patterns.md series): S135 (→9, +1 A +1 B), S165 (→#10, genre-emission, Pattern A), S180 (unchanged — QID fabrications ruled a data-integrity class, not a brief-premise failure).

**Verdict: LEAKS.** Four divergent live values (9 / 10 / 13 / 14) for one metric, across three stores, each incrementing on its own cadence. The guard-trio design cannot consume a ground-truth count that does not exist as a single number.

---

## Step 2 — Guard adherence

**Finding.** Process-guard discipline is strong. Exactly **one** hard, self-labeled process-guard *violation* exists in the entire 7,068-line session-log; the remaining "violation" hits are **domain** violations (terminology, schema), which must not be conflated with process guards. Guards are overwhelmingly cited as *working*.

**Evidence.**

- **The one process-guard violation:** Guard 3 (session-log.md:1801, 1813) — *"Executor implemented all 4 fixes without reporting diagnosis first. Plan explicitly said 'DO NOT FIX ANYTHING YET.'"* Documented in mistakes.md + postmortem. This is the **don't-implement-yet** failure mode — the same one this audit session was guarded against.
- **Conflation trap avoided:** every other `violation` hit is a *domain* violation — Tier-1 terminology ("δωρεάν"/"free", L567/1113/1184), entity-locking (L1484/1516), sitemap-301 (L6230/6248). These are content/schema defects, **not** process-loop guard breaches.
- **Guard mention frequency** (whole log): Guard 6 = 15, Guard 1 = 6, Guard 3 = 2, Guard 2 = 2, Guard 7 = 1, Guard 4 = 1. Guard 6 (shotgun-surgery) dominates and is mostly cited as *"worked as intended"* (L1940, 2362, 2420, 5398, 6327).
- **Soft-leak pattern (caught, not violated):** Guard 1 repeatedly fired *late* — "discovered during implementation, not Step 0" (L1673, 1920, 1923). This drove the mitigation rule "Step 0 must be explicitly blocking: run these commands AND REPORT before Step 1."
- **Clustering:** none. The single hard violation is isolated (≈S101/S102 era); no recurrence after the blocking-Step-0 rule.

**Verdict: HOLDS.** One historical Guard 3 violation, isolated and since mitigated. The leakiest guard *by soft near-miss* is Guard 1 (late Step-0 discovery); the most-invoked guard (Guard 6) works as designed.

---

## Step 3 — Plan-vs-execution divergence

**Finding.** Execution diverges from plan in the large majority of *instrumented* sessions — but the divergence instrument itself (`**Surprises:**`) covers only about a third of planned sessions, so the true rate cannot be computed and is almost certainly under-recorded.

**Evidence.**

- `**Plan:**` fields: **204**. `**Surprises:**` fields: **71**. → the divergence instrument is present in only **~35%** of planned sessions.
- Of the 71 sessions with a Surprises field, only **6** read "None." → **65/71 = 92%** recorded a real divergence.
- **Top 3 divergence types** (keyword frequency across log):
  1. **Pivot / reframe — 34** (e.g. "EN-hub bug" reframed to "sitewide Bing-indexability bug," L6230/6267).
  2. **Scope expansion / over-delivery — 9** (Guard 6 enumeration widening the fix surface, L6230 "fixed the site, not just the page").
  3. **Already-implemented discovery — 8** (brief target already shipped; Pattern-B refutation, L372/801/1920).

**Verdict: LEAKS (instrument coverage).** A 92% divergence rate among instrumented sessions is not itself a failure — it shows the loop honestly surfacing reality vs. plan. The leak is that ~65% of planned sessions carry no Surprises field, so divergence is structurally under-measured; any rate derived from the log is a floor, not a true value.

---

## Step 4 — Commit + deploy discipline

**Finding.** Commit discipline is good and improving; the cross-stream contamination risk is structurally guarded; no bare automated deploy exists. One documented contamination commit and one documented deploy-convention slip persist as historical artifacts.

**Evidence.**

- **Conventional-commit adherence (last 200):** docs 63, fix 41, chore 38, feat 29, refactor 5 = **176/200 ≈ 88%**. The 24 non-conventional are older `S###:`-prefixed commits (`S2:`, `S114:`, `S132:`, `S134:`, `S155:`); recent history is fully conventional.
- **Broadest commits (last 45 days):** `bb735c003` (19–20 files, F2b lifecycle — legitimate feature), `733ad3f87` (18–19, S134 offers refactor — legitimate). **WIP-contamination signal:** `ae0f0d5f1` "S2: taxonomy hygiene" (16–17 files) — the **already-documented** S116 `git add -A` cross-stream bundling that swept staged `sameAs` into a taxonomy commit (mistakes.md:394–398). No *new* contamination commit surfaced.
- **Pipeline allow-list guard: PRESENT and enforced.** `scripts/daily-automated.sh:488–508` — `PIPELINE_ALLOWLIST` array replacing the prior `git add -A`, staged via `git add -- "${PIPELINE_ALLOWLIST[@]}"` with a post-stage verification loop. Comment cites `specs/daily-pipeline-staging-audit.md` (2026-05-04).
- **Bare `netlify deploy`:** none in the active automated path. `daily-automated.sh` contains **no** netlify-deploy call (deploy is manual CLI per `agent_athens_deploy_workflow.md`). Matches for `netlify deploy --prod --dir=dist` without `--no-build` are confined to **archived** scripts (`scripts/_archive/update-site.sh:134`, `_archive/daily-workflow.sh:261`), a `console.log` NEXT-step hint (`scripts/fix-urls-and-prices.ts:492`), and session-log prose. None of these are live. The `--no-build` flag is absent from all invocations, but the active manual deploys upload a prebuilt `dist/` and the location hard-stop is build-time (runs before the upload).
- **Deploy-convention slip (documented):** session-log.md:5327 — a plan used `git push origin main` as the deploy mechanism; production did not update for 5+ min (CLI-only convention). Logged to mistakes.md.

**Verdict: HOLDS.** Allow-list guard present; commit hygiene 88% and trending clean; no live bare deploy. The two blemishes (contamination commit, push-as-deploy slip) are historical and already logged.

---

## Step 5 — Documentation health

**Finding.** The documentation layer is fresh and within budget. The recurring-theme counts are high but mostly reflect a ledger tracking a bug *class* after a structural fix shipped, not the same unfixed bug re-breaking. One contradiction check could not be completed within read budget and is flagged as not-assessed rather than asserted.

**Evidence.**

- **CLAUDE.md token estimate:** `.claude/CLAUDE.md` = 6,929 bytes ≈ **1,732 tokens** vs **2,500** budget (69%). Within budget.
- **Staleness:** no notes/log doc is >30 days old. patterns.md 2026-06-16, decisions.md 06-15, mistakes.md 06-14, session-log 06-14, known-issues 06-09, `.claude/CLAUDE.md` 06-05.
- **Repeat-entry signal:** line-level `uniq` surfaced only markdown table boilerplate (57 identical `| Mistake | What Happened | … |` header rows = ~57 mistake tables); no duplicate *bug-content* lines. Theme-level recurrence (mention counts in mistakes.md): timeout/OOM/batch = 49, geo/streetAddress/address = 46, deploy/netlify/push = 30, `git add -A`/contamination = 18, verify-the-premise/stale-premise = 13. These are heavily-recurring **classes** — but each has a shipped structural fix (MAX_BATCHES OOM cap; location hard-stop for geo/address; allow-list for contamination), so the recurrence is the ledger tracking a class across instances, not an unfixed bug solved three times over.
- **session-log ↔ known-issues contradiction:** `docs/known-issues.md` (189 KB, 06-09) carries ~100 resolved/fixed/closed markers and ~152 open/status markers. A full cross-reconciliation was **not** performed within the read budget; no specific contradiction is asserted here. (Marked NOT-ASSESSED per the "if an artifact's check can't complete, mark it and continue" rule.)

**Verdict: HOLDS (with one NOT-ASSESSED sub-check).** Docs fresh, CLAUDE.md under budget, no duplicate bug entries; the session-log↔known-issues reconciliation remains open.

---

## Ranked top 3 process leaks

1. **Recurrence-ledger count fragmentation (Step 1).** The "verify-the-premise" metric lives in ≥3 stores (`patterns.md` formal series + a second `patterns.md` framing-gap ledger, `session-log.md` prose, `MEMORY.md`) with four divergent live values — 9 / 10 / 13 / 14 — each incrementing independently. This is the unlock-blocker: the guard-trio design is meant to consume a ground-truth count that does not exist as a single number.

2. **Divergence-instrument coverage gap (Step 3).** The `**Surprises:**` field appears in only ~35% of planned sessions (71 of 204), yet 92% of the sessions that use it record a divergence. The two-thirds of sessions without the field almost certainly hide unrecorded divergences, making every measured divergence rate a floor.

3. **Guard 3 / don't-implement-yet leak (Step 2).** The single hardest process-guard violation on record is the executor jumping straight to implementation against an explicit "DO NOT FIX YET" plan (session-log.md:1801). Isolated and since mitigated by the blocking-Step-0 rule, but it is the highest-severity guard failure in the loop and the failure mode the relay→executor seam is most exposed to.

---

*End of audit. No fixes applied; every defect above is documented, not corrected, per session iron rule.*
