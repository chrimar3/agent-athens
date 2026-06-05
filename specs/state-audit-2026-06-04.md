# Ground-Truth State Audit — 2026-06-04

**Session type:** Read-only recon (don't-implement-yet guard honored — zero source changes; one tracked artifact `data/build-completeness.json` was transiently overwritten by the Step-3 `bun run build` and restored to HEAD, see §3 caveat).
**Method:** All brief-assumed columns/paths verified against the live schema before querying (`enrichment_tier`, `location_status`, `enriched_at` all exist; `known-issues.md` lives at `docs/`, not `.claude/notes/`).

---

## Brief-vs-reality deltas (verify-assumptions ledger)

| # | Brief premise | Actual |
|---|---|---|
| 1 | "~828 pending enrichment" | **301** upcoming events lack `full_description` (12,614 all-time incl. past events). Neither slice reproduces 828. |
| 2 | Test baseline "~1,410+" | **2,661 pass / 1 skip / 0 fail** (2,662 tests, 125 files) — nearly double the brief's floor. |
| 3 | "all 10 sources reporting" | **16 distinct `source` values** in DB. The 10 = scraper registry (`scrape-all.ts` SOURCES); DB additionally holds manual/legacy sources (meetup, benaki, eventbrite, manual, devoxx.gr, greeksin.ai, hackathongreece.ai). |
| 4 | "session log has drifted" | **False** — `docs/session-log.md` is current at **Session 171, dated today (2026-06-04)**. |
| 5 | "Expected: validator 0 errors" | Production completeness report records **311 event-level fails** (see §3); dev-path build **halts outright**. |
| 6 | Step-3 assumed `bun run build` is read-only & canonical | It is **neither**: it's the non-production build path (production = `scripts/daily-automated.sh` with location-filter pre-pass), and it **mutates tracked `data/build-completeness.json`**. Restored from HEAD after capture. |

---

## Workstream 1 — Enrichment coverage

- **Upcoming events (start_date ≥ today): 679 total.**
  - Missing `full_description`: **301** (44.3%) → **378 (55.7%) have descriptions**.
  - By type (upcoming): concert 370, dj_set 121, theater 118, festival 23, cinema 16, workshop 8, other 8, show 6, performance 5, exhibition 3, tech 1.
- **Tier distribution (all 13,945 rows):** stub 13,852 / premium 79 / standard 8 / full 6.
- **Tier distribution (upcoming):** stub 639 / premium 39 / full 1.
- **Data-hygiene flag:** 639 upcoming stubs vs only 301 missing descriptions → **~338 upcoming events have a description but still carry `enrichment_tier='stub'`** — the tier field lags description writes. Any tier-based query (incl. this brief's) undercounts real coverage.

## Workstream 2 — Pipeline & freshness

- **Enrichment is current, not in drought:** `MAX(enriched_at)` = **2026-06-04 07:09** (today).
- **But throughput is uneven:** last 7 days = 78 / 59 / 54 / 8 / 0 (Jun 1) / 5 / 47 / 20. The May 31–Jun 2 dip (8/0/5) is consistent with the standing 🔴 recovery-asymmetry issue; Jun 3–4 recovered.
- **Sources (top):** athinorama 12,127 · more.com 611 · residentadvisor 597 · ticketservices 210 · clubber 146 · megaron 85 · snfcc 66 · halfnote 65 · long tail of 8 more.
- **location_status:** verified_athens 12,470 / unverified **1,410** / problematic 57 / pass_through 8.
- **Git cadence healthy:** daily `chore: daily pipeline update` commits unbroken through 2026-06-04; feature work S169–S171 (GA4 importer arc, README claims sync) landed Jun 3–4.

## Workstream 3 — Schema & build integrity

- **Dev path (`bun run build`): RED — halts.** `Build halted: 310 event-detail page(s) missing required location` (streetAddress empty), thrown at `src/generate-site.ts:1278`. Per the dual-build-path memory, this path skips the Athens location-filter pre-pass that production applies — recorded as a finding, **not fixed** (guard).
- **Production path (HEAD `build-completeness.json`, built 2026-06-04 05:20 UTC by the daily pipeline, which committed green):**
  - 3,188 events measured; **311 fails total** — theater 237 (87% pass), exhibition 16 (62%), concert 23 (96%), performance 10 (67%), cinema 8 (75%), dj_set 6, workshop 6, other 3, show 2.
  - Note the near-identity: dev-halt count (310) ≈ production fail count (311). Production *records* these as fails and continues; dev *halts* on them. Same underlying ~310-event missing-streetAddress cluster on both paths.
  - Layers: event/offer/place/datafeed = measured; **aria_level = stale**.
- **Tests: GREEN — 2,661 pass / 1 skip / 0 fail** (5,712 expects, 48.5s). The S171-flagged flaky `processEventImage` network test did not flake this run. Two benign warnings (badge-contrast 4.74:1 AA-pass drift note; intentional missing-config test).
- **Caveat:** Step 3 as specified is not repeatable-clean — `bun run build` overwrote tracked `data/build-completeness.json` (55-line diff) before halting. Restored via `git checkout --`. Future audit briefs should read the HEAD artifact instead of rebuilding.

## Workstream 4 — Indexing & citation state

- **Manual indexed counters are 24 days stale:** `gsc_indexed`/`bing_indexed` columns empty since **2026-05-11**; last known values **8 Google / 605 Bing** — i.e., the brief's figures are confirmed *as the last reading*, but there is **no fresh ground truth**. A manual GSC + Bing Webmaster read is still owed (also flagged in known-issues S163 update).
- **Live auto-metrics (Bing 7d, latest rows):** impressions 9, clicks 0, avg_position 2.67, top10 count 3. **GSC 7d columns: STALE throughout** (API automation still blocked, 🟡).
- **IndexNow operational:** 2,706 submitted/2,706 success on 2026-06-04, running daily.
- **Sitemap total 3,892** (events 2,658 + venues 39 + editorial 1,195), down from 6,244 on May 17 — consistent with event-window pruning, not a regression.
- **AI citations:** no citation columns in this log; GA4 AI-referral channel (kpi.db, S169–170) shows 18 rows / 19 sessions, 100% chatgpt.com, zero perplexity/gemini/claude/copilot to date (honest zero, drift guard armed).

## Workstream 5 — Open-item reconciliation

- **Session log: current at S171 (2026-06-04).** No drift to reconcile — the Planner's premise needs re-baselining in the other direction.
- **Known-issues 🔴 (confirmed open):**
  1. **Recovery Mechanism Asymmetry / enrichment throughput** — watchdog kills (`server-stream-idle` + `wrapper-wall-clock`) even on exit=0; `enrichment_queue` 10,842 pending / 0 draining; escalated to Planner in S163 as the live demo risk. This week's 0–8/day dip (§2) is fresh corroboration.
  2. **SWEEP_ORPHANS false-positives** — 1,264 empty-slug `dist/events/*--` dirs; sweeper still cannot be armed.
- **Known-issues 🟡 (selected):** indexing reclassified to coverage-tracking (fresh manual read owed); GSC API automation blocked; event-id stability Vector C pending (blocks taxonomy session's migration sweep); Megaron taxonomy follow-ups; dedup keep-decision.
- **Stashes:** 2 — `stash@{0}` and `stash@{1}`, both `session-wip-pre-schema-deploy-2026-05-25`. stash@{0} was already selectively recovered (S158c/S159 colophon/filter/search work); both stashes still exist and should be reviewed-then-dropped or kept deliberately.
- **S171 open items still live:** CV PDF re-export owed by Christos (undersells by 37%); `config/scrape-list.json` 7-vs-10 reconciliation; flaky `processEventImage` test; **/en/ mirrors (674 pages) absent from sitemaps — intentional-or-gap undecided**.

---

## Top 3 highest-leverage next sessions, ranked

1. **Enrichment-throughput forensic (the standing 🔴).** The queue holds 10,842 pending with zero drain-state movement, daily throughput swung 0→78 this week, and 301 upcoming events (44% of the visible window) lack descriptions. Every content KPI sits behind this valve, and S163 already escalated it as demo risk. Per S99's own criterion the recovery-asymmetry now warrants its dedicated session. Include the tier-lag fix scoping (338 mislabeled stubs) as a cheap rider — it corrects all coverage dashboards.
2. **streetAddress fail-cluster backfill (~311 events, theater-dominated 237).** One venue-registry backfill pass in `config/athens-venues.json` (or deliberate suppression) flips ~10% of all event pages from fail→pass on the production report, *and* un-halts the dev build path — eliminating the dual-build-path divergence that has now burned two sessions' worth of false premises (S166, this audit). Also intersects the 1,410 `unverified` location rows.
3. **Indexing ground-truth refresh + /en/ sitemap decision.** Cheapest of the three: Christos pulls fresh GSC/Bing absolute counts (24 days stale; everything downstream — including whether "8 Google indexed" is still true — is unmeasurable until then), and the 674-page /en/ sitemap-absence question gets settled. **Routing note honored:** the Sprint-4 English-default flip and Sprint-5 metric-hierarchy ruling are GEO Strategist go/no-go calls; this session only produces the readings they need.

---

*Post-session: share this audit with Planner to re-baseline the roadmap — note especially deltas #1 (pending count), #2 (test baseline), and #4 (session log is NOT drifted).*
