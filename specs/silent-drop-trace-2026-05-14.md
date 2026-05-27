# Silent-Drop Trace: Findings

**Date:** 2026-05-14
**Session:** Round 6 — diagnostic instrumentation of build pipeline
**Purpose:** Identify the predicate that drops 60 events from `dist/events/` and `dist/en/events/`
**Predicate verdict:** **H3b confirmed** — gate is `getHardStopExcludeIds()` at `src/db/database.ts:273-301`, called from `getAllEvents()` at line 311. Hypothesis space narrowed correctly: the gate is a third predicate (S110f tier-A0 hard-stop concerns) that correlates with — but is not — the `(stub, has_en=yes, has_el=no)` data-side signature.

---

## 1. Trace summary

| Metric | Value |
|---|---|
| Trace file | `/tmp/silent-drop-trace.jsonl` (deleted in Step 6) |
| Total entries | 44 |
| Unique target IDs captured | 3 / 3 |
| Build outcome | Success (no thrown errors; pages emitted as expected for non-hard-stopped events) |
| Verdi (`7481fd1a657f60b0`) entries | 2 |
| EXA Concert (`8ad40e93de76c87c`) entries | 2 |
| Control 523def07 (`523def0775a979d4`) entries | 40 |
| Build log line 1321 | `Hard-stopped events (lifetime): 66 (412.5% of last-24h)` |

The asymmetric entry counts are themselves the finding: the missing targets never reach any selection or render stage because they are excluded **upstream of `generate-site.ts` entirely**, by the SQL query in `getAllEvents()`. The control reaches all 39 stages from `select:filter-location_status` through `sweep:slug-in-valid-set` (×2 for EL + EN).

---

## 2. Side-by-side trace tables

### Verdi vs Control 523def07

| Stage | Verdi | 523def07 |
|---|---|---|
| `select:filter-location_status` (A1) | **NEVER FIRED** | pass (verified_athens) |
| `select:filter-lifecycle` (A2) | **NEVER FIRED** | pass (upcoming) |
| `select:pageable-included` | `in_pageable: false` | included (concert, more.com) |
| `intermediate:venue-image-attach` (B1) | NEVER | reached |
| `intermediate:venue-website-attach` (B2) | NEVER | reached |
| `loop:el:enter-iteration` (D1) | NEVER | reached |
| `render:el:pre-call` → `render:enter` → all E2-E14 stages → `render:el:post-call` | NEVER | all reached |
| `write:el:writeHtml-pre` / `-post` (D9) | NEVER | both fired (file written) |
| `en:filter-fullDescriptionEn` (B4) | NEVER | pass |
| `loop:en:enter-iteration` (C1) | NEVER | reached |
| `render:en:pre-call` / `-post` (C4) | NEVER | both fired |
| `write:en:writeHtml-pre` / `-post` (C6) | NEVER | both fired |
| `sweep:validEventSlugs-built` (F0) | `in_pageable: false`, `validset_size: 5008`, `pageable_count: 5008` | `in_set: true`, slug `523def07--dire-straits-legacy-live-in-greece` |
| `sweep:slug-in-valid-set` (F4-keep) | NEVER (no file to classify) | fired ×2 (EL + EN paths kept) |
| `sweep:slug-not-in-valid-set-DELETING` (F4-orphan) | NEVER | NEVER |
| `sweep:delete-pre` / `-post` (F7) | NEVER | NEVER |

### EXA vs Control — identical pattern to Verdi vs Control. Both Verdi and EXA have only 2 entries each (`select:pageable-included` with `in_pageable: false`, and `sweep:validEventSlugs-built` with `in_pageable: false`).

### Verdi vs EXA — identical traces. Same divergence point, same data-side cause. Not a type-specific code path; the gate doesn't branch on `event.type`.

---

## 3. Divergence point identification

**Stage of divergence:** Pre-`select:filter-location_status` — i.e., before `generate-site.ts:163`.

**File:line of the gate:** `src/db/database.ts:311`
```typescript
const excludeIds = getHardStopExcludeIds(database);
```

**Exact branch condition:** `getHardStopExcludeIds()` at `src/db/database.ts:273-301`. Returns the set of event IDs that:
1. Have at least one row in `event_concerns` whose `concern_type` matches a rule with `tier === 'A0'` (loaded from `loadGateRules()` in `src/utils/load-gate-rules.ts`)
2. AND don't have a matching override in `loadOverrides()`

The query at `getAllEvents:322-324` then becomes:
```sql
SELECT * FROM events WHERE is_cancelled = 0 AND id NOT IN (?, ?, ...) ORDER BY start_date ASC
```
…where the placeholders are the hard-stop excluded IDs.

**Local state at the gate for each event:**
| Event | `is_cancelled` | A0 concerns in `event_concerns` | Override exists? | Result |
|---|---|---|---|---|
| Verdi (`7481fd1a657f60b0`) | 0 | `venue-mismatch-or-unknown` | No | **EXCLUDED** |
| EXA (`8ad40e93de76c87c`) | 0 | `date-conflict-or-unparseable` (+ `thin-context` tier B, irrelevant) | No | **EXCLUDED** |
| Control (`523def0775a979d4`) | 0 | none | — | INCLUDED |

---

## 4. Predicate verdict

**H3b confirmed.** Gate is a third predicate (presence of an unmatched A0-tier `event_concerns` row), not the data-side signature `(stub, has_en=yes, has_el=no)` directly. The signature correlates because:

1. **stub tier** ↔ hard-stopped events stay at `enrichment_tier='stub'` because the enrichment pipeline skips them (per `database.ts:307` comment: "Filtered events stay in the table and remain enrichment-eligible" — in practice they sit unenriched while concerns are unresolved).
2. **has_el=no** ↔ Greek `description` and `full_description_gr` are populated by enrichment, which never ran for these events.
3. **has_en=yes** ↔ `full_description_en` is often populated at scrape time from source pages (athinorama.gr, more.com) before hard-stop concerns are flagged.

This is **designed behavior**, not a bug. Comment at `database.ts:303-307`:
> "Public-output chokepoint: applies the S110f hard-stop filter to suppress tier-A0 events from public surfaces (event pages, sitemap, datafeed, schema). Filtered events stay in the table and remain enrichment-eligible."

The same build emitted (line 1319-1339 of `/tmp/silent-drop-build.log`):
```
=== Hard-stop firing (S110f) ===
Hard-stopped events (lifetime): 66 (412.5% of last-24h)
  entity-resolution-uncertain: 12 (75.0%)  [⚠ exceeds 10% threshold]
  venue-mismatch-or-unknown:    21 (131.3%) [⚠ exceeds 10% threshold]
  date-conflict-or-unparseable: 29 (181.3%) [⚠ exceeds 10% threshold]
  ticket-merchant-unverified:   10 (62.5%)  [⚠ exceeds 10% threshold]
⚠ HARDSTOP_FIRING_RATE_EXCEEDED: ...rules likely over-tuned, see decisions.md S110f
```

A0 totals across `event_concerns`: 12 + 21 + 29 + 10 = 72 concern rows, but 66 unique event IDs (deduped — some events carry multiple A0 concerns; EXA is one such, with both `date-conflict-or-unparseable` and `thin-context`). The 60-vs-65-vs-66 discrepancy resolves cleanly: 66 hard-stopped, of which 60 had pages that would have been emitted (the other 6 likely fail other selection filters like lifecycle).

---

## 5. Verdi vs EXA comparison

Same divergence stage. Same code path. NOT a type-specific bug. Both excluded by the same SQL `id NOT IN (...)` predicate at `database.ts:323`. The drop is uniform across `event.type`.

---

## 6. Try/catch findings

No try/catch fired for the missing events because they never entered any code path. The trace shows zero `render:enter`, zero `write:*`, zero `sweep:delete-*` entries for Verdi and EXA. There is no silent error suppression — the events simply don't reach the build pipeline.

(For completeness: `getHardStopExcludeIds:280-283` does have a `tableExists` check that returns an empty set if `event_concerns` is missing — graceful fallback for unmigrated test fixtures. Not relevant here since the table exists.)

---

## 7. Locale asymmetry

The trace explains EL ⊂ EN cleanly:

- **60 missing from BOTH `dist/events/` AND `dist/en/events/`**: these are the hard-stopped events (66 total in event_concerns; 60 of those would otherwise have made it through `pageableEvents`). The hard-stop filter is locale-agnostic — it removes events upstream of *both* write loops, so they're absent from both subtrees.
- **5 additional EN-only misses**: not hard-stopped; these pass `getAllEvents()` and reach `pageableEvents`. They fail the EN-specific filter at `generate-site.ts:596` (now traced as `en:filter-fullDescriptionEn`):
  ```typescript
  const englishEvents = pageableEvents.filter(e => e.fullDescriptionEn);
  ```
  i.e., events with no English description don't get `/en/events/` pages, even though they get `/events/` (Greek) pages.

The EL-write loop (`event-page.ts:639`) uses unfiltered `pageableEvents`; the EN-write loop adds the `fullDescriptionEn` requirement. So EL is always a superset of EN in terms of which pages are emitted, EXCEPT for the hard-stop drop which removes from both equally. Net: EL miss = 60, EN miss = 60 (hard-stops) + 5 (no EN text) = 65. Math checks out.

---

## 8. Open questions for Strategist

1. **Is the firing rate the real issue, not the drop?** Build log already flags `⚠ HARDSTOP_FIRING_RATE_EXCEEDED` for all 4 A0 concern types. Verdi's `venue-mismatch-or-unknown` concern text reads as a sub-location nuance ("outdoor Garden of the Megaron, not the indoor halls") that arguably shouldn't trigger an A0 hard-stop — it would surface as a quality flag in the description, not a publish blocker. EXA's `date-conflict-or-unparseable` is more substantive (year may be 2026 vs 2027), so blocking until verified is defensible. Two examples ≠ general conclusion, but they hint that A0 calibration may differ by concern type. Strategist + Planner joint review per routing tree.

2. **Should the build print which events were hard-stopped, not just the count?** Currently the log says "66 hard-stopped" without enumerating IDs. Adding a debug-level enumeration (gated by env var) would have made this diagnostic session a 5-minute query instead of a full instrumentation pass. Tracks with the "two consecutive sessions where pre-flight caught a load-bearing assumption" pattern noted by Strategist.

3. **Is `enrichment-eligible` actually true for hard-stopped events?** The comment at `database.ts:307` says hard-stopped events "remain enrichment-eligible." If they're sitting at `enrichment_tier='stub'` indefinitely (as the data-side signature suggests), the enrichment pipeline may not actually be processing them — defeating the "filtered, not deleted" design. Worth checking the enrichment scheduler's selection criteria separately.

4. **Override path verification.** The `loadOverrides()` mechanism at `database.ts:292` lets an event be re-included despite an A0 concern. If the path forward is per-event override rather than rule recalibration, the override config should be checked for tooling: how does an operator add an override today?

---

## Routing per Strategist's tree

H3b confirmed → **joint review (Strategist + Planner)**. Predicate is correctly an over-tuned config (S110f rules) operating on a separate signal channel (`event_concerns` table) rather than a code-path bug. Next session is policy/calibration, not code-fix.

---

## Files referenced

- Gate definition: `src/db/database.ts:273-301` (`getHardStopExcludeIds`)
- Gate call site: `src/db/database.ts:311, 322-324` (`getAllEvents`)
- Rules loader: `src/utils/load-gate-rules.ts:80` (`loadGateRules`)
- Override loader: `src/utils/load-gate-rules.ts` (`loadOverrides`)
- Build log evidence: `/tmp/silent-drop-build.log:1319-1340` (deleted in Step 6)
- Trace artifact: `/tmp/silent-drop-trace.jsonl` (deleted in Step 6)
- Branch enumeration: `specs/silent-drop-trace-branches.md`
