# S128 — Dual Diagnostic Audit

**Session:** S128 (read-only) · **Date:** 2026-05-10 · **Branch:** main @ 8d533842 · **Stream:** GEO/SEO infrastructure

> Originally scoped as a triple audit. **Audit C dropped during pre-flight** after structural verification revealed its premise had dissolved (exhibitions are 24/24 = 100% pass, not the 63% cited in brief). Closeout note for C is in §4.

---

## 0 · Drift snapshot (S127 pattern)

Pre-flight Explore + Step 0b structural verify caught **two real drifts** in the original brief:

1. **Audit A framing — labelling drift only.** `src/utils/filters.ts:50` (`case 'tomorrow'`) and `:91` (`case 'next-month'`) are the buggy predicates as claimed, but they are **TypeScript** (`matchesTimeRange` operating on `Event` objects via `event.startDate` / `event.endDate`), not SQL. There is no `COALESCE` in `filters.ts`. The SQL queries in §2 still functioned as a quantification tool; only the next-session fix-path label changes from "SQL COALESCE" to "TypeScript end-date branch, mirror lines 43–46".
2. **Audit C premise — dissolved.** `data/build-completeness.json` shows exhibitions at `{total:24, pass:24, warn:0, fail:0, info:10, passRate:100}`. The "63% / 34-pt gap" was stale (likely from before a recent close). Audit C dropped per user decision; institutional memory cleanup queued post-session.

Minor: `ticket_url_resolved` schema reference in brief was also drifted, became moot once C dropped.

**Preamble note:** working tree was dirty on `data/build-completeness.json` (post-build regeneration, mtime 18:30 vs committed 08:27, no exhibition-bucket changes). Resolved via targeted `git stash push data/build-completeness.json` per user direction; popped at end of audit. Pattern candidate logged: "Targeted stash for build-artifact preamble trips."

---

## 1 · Audit B — Indexing state

### Findings

**`logs/indexnow-latest.json`** (timestamp 2026-05-10T05:27:44Z, age ~13h at audit time = fresh):
```json
{"timestamp": "2026-05-10T05:27:44.141Z", "submitted": 6346, "success": 6346, "batches": 1, "failures": 0}
```
Submission healthy: 100% success, single batch (within `MAX_BATCHES=2` ceiling).

**`data/search-visibility-log.csv`** — last 15 rows (2026-04-26 → 2026-05-10) all present, no missing days. Notable cells:

- 2026-05-10 row: `events=6570, venues=48, editorial=1225, sitemap_total=7843, indexnow_submitted=6642, success=6642, batches=1, last_run=2026-05-09T11:44`. CSV's `indexnow_last_run` lags `indexnow-latest.json` by ~18h because the CSV row was written before today's IndexNow run; not a fault.
- **Manual fields stale on most-recent days:** `gsc_indexed`, `bing_indexed`, `ai_citations_count` are empty for 2026-05-09 and 2026-05-10. Last populated values: 2026-05-08 → `gsc_indexed=7, bing_indexed=390, ai_citations=0`. This is manual-update lag, not a system failure — but it means the May 18 spot-check needs Christos to read these from the GSC + Bing UIs *before* comparison.
- **One anomaly worth noting:** 2026-05-03 row shows `indexnow_submitted=2, success=2` (vs ~7000–9000 on neighboring days). Likely a known incident or a partial submission day; flagging for completeness, not part of S128 scope.
- **STALE_ENRICHMENT markers** on 2026-04-27, 2026-05-01, 2026-05-03 — none on most recent 5 days.

**Sitemap `<url>` counts (live `dist/`):**
| File | URLs |
|---|---|
| `dist/sitemap-events.xml` | 6280 |
| `dist/sitemap-editorial.xml` | 1226 |
| `dist/sitemap-venues.xml` | 44 |

CSV's `sitemap_events=6570` for 2026-05-10 vs actual file count `6280` = 290-row gap. CSV captured pre-build snapshot; build hasn't run again today on this disk. Not a fault, but a flag for whoever interprets the visibility log.

**URL spot-check (HTTP HEAD via `/usr/bin/curl`):**

| Status | URL |
|---|---|
| 200 | `https://agentathens.com/` |
| 200 | `https://agentathens.com/today` |
| 200 | `https://agentathens.com/this-weekend` |
| 200 | `https://agentathens.com/this-month` |
| 200 | `https://agentathens.com/open` |
| 200 | `https://agentathens.com/en/today` |

All six spot-check URLs reachable. No serving regressions.

### Classification — Audit B

🟢 **System healthy. No action required.** Manual-update lag on `gsc_indexed`/`bing_indexed` is the only flag.

### Manual checks Christos needs to do before May 18 spot-check

1. **GSC UI** — read current `Pages > Indexed` count, fill into `data/search-visibility-log.csv` `gsc_indexed` column for 2026-05-09 and 2026-05-10 (and 2026-05-18 on the day).
2. **Bing Webmaster Tools UI** — same for `bing_indexed`.
3. **AI citations** — manual count from spot-checks (Perplexity, ChatGPT search, etc. for `agentathens.com`); fill `ai_citations_count`.

These read-blocked fields are why the audit can't finalize "did indexing recover post-S90" — only Christos can answer that with browser-auth access. Audit B confirms the *pipeline* is healthy; the *outcome metric* needs manual reads.

---

## 2 · Audit A — Filter-correctness (TypeScript predicate path)

### Structural confirmation (Step 0b)

`src/utils/filters.ts` exists with the buggy predicates at the lines claimed:
- Line 32: `function matchesTimeRange(event: Event, timeRange: TimeRange): boolean`
- Lines 43–48 (`case 'today'`): **CORRECT** — typed dispatch, exhibition branch checks both `event.startDate` and `event.endDate` (line 46: `return eventDate <= tomorrow && endDate >= today`); non-exhibition branch checks only `eventDate` (line 48).
- Lines 50–55 (`case 'tomorrow'`): **BUGGY** — no exhibition dispatch. Single return: `return eventDate >= tomorrowStart && eventDate < tomorrowEnd`. Compares `event.startDate` only, ignores `event.endDate`.
- Lines 60–63 (`case 'this-week'`): **CORRECT** — exhibition dispatch with `endDate` check.
- Lines 75 (`this-weekend`?), 84–87 (`case 'this-month'`): **CORRECT** — same exhibition dispatch pattern.
- Lines 91–94 (`case 'next-month'`): **BUGGY** — no exhibition dispatch. Single return: `return eventDate >= nextMonthStart && eventDate <= nextMonthEnd`.

**Asymmetric bug pattern:** 4 of 6 time-range cases have the typed-dispatch correctly (today / this-week / this-weekend / this-month). 2 of 6 (tomorrow / next-month) are missing it. The cases that have it look essentially identical — copy-paste of one will fix both buggy cases. This is a finishing-step gap, not a knowledge gap.

### Consumer tracing — load-bearing branch

The brief said: classification depends on whether buggy predicate feeds **indexed pages** vs only the UI filter bar. Tracing:

- `src/templates/filter-bar.ts:19` — references `'tomorrow'` as a UI filter option. UI consumer.
- `src/templates/filter-bar.ts:23` — references `'next-month'` as a UI filter option. UI consumer.
- **`dist/sitemap-editorial.xml` contains the buggy slugs:**
  - `https://agentathens.com/tomorrow`
  - `https://agentathens.com/next-month`
  - `https://agentathens.com/exhibition-tomorrow`  ← exhibition-specific surface
  - `https://agentathens.com/exhibition-next-month` ← exhibition-specific surface
  - Plus 16 more cross-product slugs (concert-tomorrow, theater-next-month, etc. — irrelevant to exhibitions but confirms generator scope).
- **`dist/` filesystem contains the built HTML:** `contemporary-art-exhibition-tomorrow.html`, `contemporary-art-exhibition-next-month.html`, etc.

→ **The buggy predicate IS feeding indexed pages** that AI crawlers consume. This is not theoretical. This is not UI-only.

### Quantification (`data/events.db`, current as of 2026-05-10)

Date context: today=2026-05-10, tomorrow=2026-05-11, next_month_start=2026-06-01, next_month_end_excl=2026-07-01.

**Tomorrow window:**
| Predicate | Count |
|---|---|
| Buggy (`start_date = '2026-05-11'`) | **0** |
| Correct (running on 2026-05-11: `start_date <= '2026-05-11' AND COALESCE(end_date, start_date) >= '2026-05-11'`) | **3** |

→ **Delta = 3 silently dropped** from `/exhibition-tomorrow` and `/tomorrow` indexed pages.

**Next-month window:**
| Predicate | Count |
|---|---|
| Buggy (`start_date >= '2026-06-01' AND start_date < '2026-07-01'`) | **1** |
| Correct (running across June: `start_date < '2026-07-01' AND COALESCE(end_date, start_date) >= '2026-06-01'`) | **2** |

→ **Delta = 1 silently dropped** from `/exhibition-next-month` and `/next-month` indexed pages.

**Sanity bound:** total visible exhibitions = 9. Tomorrow loss is 3/9 = **33% silent loss** on that surface; next-month loss is 1/9 = 11%. Small absolute counts, large proportional impact — same n=9 dataset that drives the Tier 1 fallback / imageless concern in `docs/known-issues.md:88`.

### Test gap (incidental finding)

`src/templates/__tests__/page.test.ts` references `getTomorrowEvent()` ~7 times — there ARE tests around tomorrow-window behavior. None apparently exercise a *running exhibition* (start in past, end in future) against the `'tomorrow'` predicate, which is how the bug survived. The fix should add at least one such test case alongside the predicate edit.

### Classification — Audit A

🔴 **CONFIRMED Tier 1 silent data loss in indexed pages.**

- Buggy predicate exists at named line numbers.
- It feeds AI-crawled indexed pages (sitemap entries + built HTML files), not just UI.
- Quantified delta > 0 on both windows today (4 row-occurrences across 2 windows × 2 surfaces each = up to 8 page-day silent losses).
- Fix is bounded: TypeScript edit in `src/utils/filters.ts` adding the 5-line `if (event.type === 'exhibition' && event.endDate) {…}` branch at lines 50 and 91, mirroring lines 43–46 / 84–87. Plus one regression test in `page.test.ts`.

### Recommended next-session shape (Audit A)

- **Type:** Bounded fix session.
- **Files touched:** `src/utils/filters.ts` (2 small edits), `src/templates/__tests__/page.test.ts` (1 new test case).
- **Effort:** ~15–30 minutes.
- **Verification:** rerun the §2 SQL — `buggy = correct` afterward (after `bun run build` regenerates indices). Manual: visit `/exhibition-tomorrow` and confirm running exhibitions appear.
- **Risk:** low — the corrected pattern is already proven in 4 sibling branches.

---

## 3 · Audit C — Closeout note

Premise dissolved during pre-flight. `data/build-completeness.json` shows exhibition bucket:
```json
{"type":"exhibition","total":24,"pass":24,"warn":0,"fail":0,"info":10,"passRate":100}
```
The "63% / 34-pt gap" cited in the brief and in `docs/known-issues.md` / `docs/agent-athens-system-reference.md` is no longer current.

**Note:** the Audit C "total" (24) measures the schema-completeness denominator (events with the exhibition type ever, including past or upcoming?), while the Audit A `location_status IN ('verified_athens','pass_through')` AND `COALESCE(end_date, start_date) >= date('now')` filter yields **9** currently-visible exhibitions. Both are valid bucketings for different purposes; the 24 vs 9 is a denominator difference, not a contradiction. Worth flagging for whoever consumes both numbers: schema completeness ≠ visibility window.

**INFO-tier findings (n=10) on the exhibition bucket:** out of scope this session. Queue for GEO Strategist prioritization brief — these are "would be nicer" enhancements (per user framing), not "is broken" defects, and don't move pass-rate.

### Recommended next-session shape (Audit C)
None this side. Audit C is **closed as no-longer-applicable.** Institutional cleanup queued post-session (see §5).

---

## 4 · One-line next-session recommendation

**Bounded fix session — Audit A:** add the exhibition typed-dispatch to `src/utils/filters.ts:50` and `:91` mirroring the pattern at lines 43–46 / 84–87, plus one regression test in `page.test.ts` for a running-exhibition × `'tomorrow'` predicate combination. Re-run §2 SQL to verify `buggy = correct` post-fix.

---

## 5 · Post-session institutional cleanup (separate next turn)

- **Append session entry** to `docs/session-log.md` with classifications: A=🔴 confirmed Tier 1, B=🟢 healthy w/ manual-lag flag, C=closed no-longer-applicable.
- **Update `docs/known-issues.md`:**
  - "Zero Indexed Pages Across Search Engines" (line ~186) — refresh status with Audit B finding (system healthy, manual reads needed for outcome metric).
  - Filter-correctness entry (lines ~76–79) — replace "suspected" language with "Audit A confirmed Tier 1, n=4 silent-loss row-occurrences across tomorrow + next-month windows on 2026-05-10".
  - Exhibition 63% bucket entry — close with "confirmed 100% pass at S128 Step 0b; entry deprecated".
- **Flag `docs/agent-athens-system-reference.md`** "Issues Identified" table for future cleanup pass — still cites 63%. Out of scope; queue for institutional-memory maintenance batch.
- **Pattern candidates for `patterns.md`:**
  1. **"Stale-premise pre-flight rescue."** Every audit-style session whose premise is a numeric claim from project memory must verify the number in Step 0, before any diagnostic SQL or grep runs against it. Validated this session by Audit C drop.
  2. **"Targeted stash for build-artifact preamble trips."** When the defensive preamble fails on a known-derivative file (build outputs, regenerated snapshots), the right move is `git stash push <path>` — preserves strict-state assertion *and* working changes, popped at end. Validated this session.
  3. **"Asymmetric typed-dispatch bug — finishing-step gap."** When N–1 of N sibling branches in the same file have a type-specific dispatch and one is missing it, the failure mode is incomplete copy-paste at the time the case was added, not a misunderstood requirement. Suggests adding a lint rule or test scaffold that exercises every `case` branch with every event type. Validated structurally this session; promote after the Audit A fix lands and confirms shape.
- **Restore stash:** `git stash pop` for `data/build-completeness.json` before any post-session commits.
