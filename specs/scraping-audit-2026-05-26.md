# Scraping Source & Freshness-Pipeline Audit — 2026-05-26

**Type:** READ-ONLY diagnostic (Workstream 2 — Scraping & Importing, Minor).
**Author:** Automated audit session (Claude).
**Mutation guard:** PASSED — `events` count `12694 → 12694` and `scrape_stats` count `1214 → 1214`, identical before/after all dry-run probes. No writes to `data/events.db`. No edits to `src/`, `config/`, or `scripts/`. This file is the only write.
**Scope:** Diagnose only. Every 🔴/🟡 below is a finding for a *follow-up* fix session — nothing was fixed here.

---

## TL;DR

- **10 active scrapers** in the registry. **7 healthy, 1 stale, 1 stale(upstream), 1 broken.**
- 🔴 **clubber** — silent breakage. Returns `success=1` but **0 events since 2026-04-08** (~7 weeks). Selector/feed rot. **Highest priority.**
- 🟡 **halfnote** — iCal feed drained 7→0 over the past week (last events 2026-05-23). Scraper mechanism works; upstream calendar appears empty. Likely venue lull, *not* selector rot — verify before "fixing."
- 🟡 **benaki** — scraper returns 4 events daily but DB `upcoming = 0` (all stored exhibitions' `end_date` already passed). Save/date-capture or genuine between-exhibitions lull.
- **Pipeline IS firing**: the loaded `com.agentathens.daily` (full mode) ran **today 08:00 Athens**, scraped all 10 sources, 538 events, 0 errors. **BUT** the dedicated `com.agentathens.freshness` job is **NOT loaded** (last ran 2026-05-20) despite its plist existing in `config/launchd/` — launchd **label drift**.

---

## Step 0 — Real source registry (discovered from code, not docs)

Canonical registry = the `SOURCES` object in `scripts/scrape-all.ts:1521` and the `SourceId` type at `scripts/scrape-all.ts:77`. **10 sources:**

`more, athinorama, clubber, ticketservices, halfnote, ra, snfcc, onassis, benaki, megaron`

### Brief-vs-reality mismatches found (Guard: verify-assumptions)
1. **Script path wrong** — brief referenced `scripts/scrape-all-sources.ts`; the real entry point is **`scripts/scrape-all.ts`**.
2. **Flag syntax wrong** — brief used `--source=<X>`; the CLI parses `args.indexOf('--source')` expecting a **space-separated** value (`--source more`). `--source=more` makes `indexOf` return -1 and **silently falls back to scraping ALL 10 sources**. (Harmless in dry-run, but destroys per-source isolation.) All probes below used `--source <id>`.
3. **`subprocess-runner.ts` is not the registry** — it's a generic timeout/subprocess utility; the brief's Step-0 grep against it returns nothing.
4. **Count is 10** (matches the doc figure this time), but the DB `source` column does **not** match registry IDs (see note below), and the DB carries 6 extra non-registry legacy sources.

### DB `source` value ≠ registry ID
| registry id | DB `source` value |
|---|---|
| more | `more.com` |
| athinorama | `athinorama.gr` |
| clubber | `clubber.gr` |
| ra | `residentadvisor` |
| megaron | `megaron.gr` |
| ticketservices / halfnote / snfcc / onassis / benaki | *(same)* |

**Non-registry legacy sources in DB** (out of scope — one-off/manual imports, not active scrapers): `devoxx.gr` (1), `eventbrite` (4), `hackathongreece.ai` (1), `meetup` (12), `greeksin.ai` (1), `manual` (2). All have ~0 upcoming; flagged only for awareness.

---

## Step 1 — DB freshness baseline (read-only SQL)

Timestamp columns present: `start_date`, `end_date`, `created_at`, `updated_at`, `scraped_at`. Used `<TS> = scraped_at`.

Per-source (registry sources only), `upcoming` keys on `end_date` for exhibitions, else `start_date`:

| DB source | total | upcoming | newest_start |
|---|---|---|---|
| benaki | 5 | **0** | 2026-02-25 |
| halfnote | 64 | **0** | 2026-05-23 |
| onassis | 7 | 1 | 2026-06-28 |
| snfcc | 12 | 1 | 2026-05-01 |
| clubber.gr | 146 | 5 | 2026-07-11 |
| ticketservices | 157 | 23 | 2027-03-07 |
| megaron.gr | 82 | 25 | 2026-07-15 |
| more.com | 558 | 67 | 2026-11-12 |
| residentadvisor | 547 | 102 | 2027-02-07 |
| athinorama.gr | 11095 | 144 | 2027-04-26 |

> ⚠️ **`events.scraped_at` is an unreliable freshness signal** — sparsely populated (halfnote/ticketservices/snfcc have *zero* rows with it despite hundreds of rows). Use **`scrape_stats`** (Step 3) as the authoritative per-run scrape ledger instead.

---

## Step 2 — Freshness-pipeline liveness (observe only)

**`daily-automated.sh` modes** (`scripts/daily-automated.sh:716-830`): `full` (default/no-arg) = scrape + enrich + deploy; `freshness` = scrape + deploy (no enrich); `enrichment` = enrich only. **Scraping runs in `full` and `freshness`, skipped only in `enrichment`.**

### Loaded launchd jobs (`launchctl list | grep agentathens`) — all idle, last exit 0
`daily`, `enrichment`, `enrichment-01/-13/-16/-19/-22`, `enrichment-check`, `auto-enrich`, `monitor-visibility`, `check-deploy-cadence`.

### Label drift (config/launchd/ ⟷ loaded)
- **`com.agentathens.freshness` plist exists in `config/launchd/` but is NOT loaded.** Its dedicated log `logs/freshness-stdout.log` last changed **2026-05-20 12:44**; `freshness-stderr.log` last entry **2026-05-20 08:08**. → the freshness-specific cadence has been dead since **2026-05-20**.
- Loaded-but-not-in-`config/launchd/`: `daily` (root plist), `enrichment-01`, `enrichment-22`, `enrichment-check` (root plist), `auto-enrich`, `check-deploy-cadence` (root plist).

### Did scraping actually run? YES.
`com.agentathens.daily` (full mode, no arg) ran **today 08:00:07 Athens** (`logs/pipeline-2026-05-26.log:1386`), scraping all 10 sources. No clamshell-sleep gap observed — the job fired on schedule. Minor recurring non-fatal error every morning: `Database backup failed (non-fatal, continuing — check ~/agent-athens-backups/)` and periodic `Netlify CLI deploy failed` (per `freshness-stderr.log` history).

**Pipeline-liveness verdict (one line):** 🟢 *Scraping fires daily via `com.agentathens.daily` (full mode) — confirmed 08:00 today, 538 events, 0 errors — but the dedicated `com.agentathens.freshness` job is unloaded since 2026-05-20 (launchd label drift); scraping is currently surviving only on the heavier daily-full run.*

---

## Step 3 — Per-source live dry-run probes (`scrape-all.ts --dry-run --source <id>`)

**3a spike (Guard 2):** verified `--dry-run` does NOT mutate. Code-read: `saveEvents()` early-returns on `dryRun` (`scrape-all.ts:1320`); both `recordScrapeStats` call sites gated by `if (!dryRun)` (lines 1588, 1599). Empirical: `events 12694→12694`, `scrape_stats 1214→1214` after dry-run `more`. ✅ Safe to loop.

**3b results** (live, today ~21:45 Athens; cross-checked against `scrape_stats` history):

| source (registry) | DB upcoming | newest_start | dry-run live | events found | scrape_stats last_nonzero | verdict |
|---|---|---|---|---|---|---|
| more | 67 | 2026-11-12 | ✅ 41.9s | 40 | today | 🟢 HEALTHY |
| athinorama | 144 | 2027-04-26 | ✅ 151.8s (1 retry: "operation aborted") | 239 | today | 🟢 HEALTHY *(slow/flaky)* |
| ticketservices | 23 | 2027-03-07 | ✅ 211.2s | 110 | today | 🟢 HEALTHY *(slow)* |
| ra | 102 | 2027-02-07 | ✅ 1.7s | 100 | today | 🟢 HEALTHY |
| megaron | 25 | 2026-07-15 | ✅ 3.2s | 24 | today | 🟢 HEALTHY |
| snfcc | 1 | 2026-05-01 | ✅ 24.9s | 24 | today | 🟢 HEALTHY *(⚠ found 24 but DB upcoming=1 — see note)* |
| onassis | 1 | 2026-06-28 | ✅ 4.9s | 2 | today | 🟢 HEALTHY *(low volume)* |
| benaki | **0** | 2026-02-25 | ✅ 2.3s | 4 | today | 🟡 STALE *(scraper OK; 0 upcoming — exhibitions expired)* |
| halfnote | **0** | 2026-05-23 | ✅ 5.6s | **0** | **2026-05-23** | 🟡 STALE *(iCal feed drained 7→0 over a week — upstream, not selector)* |
| clubber | 5 | 2026-07-11 | ✅ 0.6s | **0** | **2026-04-08** | 🔴 **BROKEN** *(silent: success but 0 events ~7 weeks; selector/feed rot)* |

### Breakage detail (from `scrape_stats` ledger, 1214 rows)
- **clubber** — `last_nonzero = 2026-04-08`. 127 total runs; every run since Apr 8 reports `success=1` with `events_found=0` in 0.4–0.6s. An abrupt cliff from a previously-productive source = **selector/feed rot**. iCal source — likely feed URL moved or markup changed.
- **halfnote** — `last_nonzero = 2026-05-23` (1 event). Monotonic decay: `7 (05-16) → 6 (05-18) → 5 (05-19) → 4 (05-20) → 1 (05-23) → 0 (05-24/25/26)`. The *slope* (not a cliff) indicates the iCal feed naturally emptied as dated events rolled off — **scraper works, upstream calendar is empty**. Verify the feed has genuinely no upcoming shows before touching scraper code.
- **snfcc / onassis / benaki** — scrapers return events daily (`last_nonzero = today`) but DB `upcoming` is low/zero. The dry-run "events found" (pre-save) exceeds DB "upcoming" (post-save/filter/date). Secondary finding: a possible **save/scope/date-capture gap for exhibition sources** (found-but-not-landing-as-upcoming), distinct from scraper liveness.

---

## Recommended fix-session scope (NO fixes performed here)

A follow-up session — promote to **Major** only if it takes on #1+#2 — should target, in priority order:

1. **🔴 clubber (P0)** — diagnose the iCal fetch/parse path in `scrape-all.ts`. Confirm the feed URL still resolves and returns VEVENTs; fix selector/URL. 7 weeks of silent decay; clubs always have events, so 0 is the bug. Add a **non-zero-events assertion / alert** so `success=1, events=0` no longer passes as green (root cause class: success≠found).
2. **🟡 halfnote (P1, verify-first)** — confirm whether the iCal feed is genuinely empty (venue lull) vs. broken. If genuinely empty, no code fix — just monitor. If broken, fix feed URL/parse. Do NOT assume selector rot — the decay slope says upstream.
3. **🟡 benaki + snfcc + onassis exhibition save gap (P2)** — investigate why scrapers return events (4/24/2) but few/none land as `upcoming`. Check `end_date` capture for exhibitions and the scope/seasonal/dedup filters in the save path. May be a data-quality bug masquerading as low freshness.
4. **⚫ launchd label drift (P1, ops)** — decide intended state: either (re)load `com.agentathens.freshness` from `config/launchd/` or formally retire it and rely on `com.agentathens.daily` (full). Reconcile `config/launchd/` with actually-loaded labels (`daily`, `enrichment-01`, `enrichment-22`, `enrichment-check`, `auto-enrich`, `check-deploy-cadence` are loaded but not versioned in `config/launchd/`). Related prior intel: [[agent_athens_deploy_workflow]], [[project_enrichment_safety_nets]].
5. **Minor / non-fatal (P3)** — recurring morning `Database backup failed (non-fatal)` and intermittent `Netlify CLI deploy failed` in `freshness-stderr.log`. Triage separately.
6. **Observability gap (cross-cutting)** — add a "0 events while previously >0" alert keyed off `scrape_stats.last_nonzero` so the next silent breakage surfaces in days, not weeks. This is the structural fix that makes audits like this unnecessary.

---

## Verification (Done-when)
- `sqlite3 data/events.db "SELECT COUNT(*) FROM events;"` = **12694** (== Step-3a BEFORE). Zero mutation. ✅
- `scrape_stats` count = **1214** (unchanged). ✅
- All 10 Step-0 sources classified above. ✅
- Pipeline-liveness verdict recorded. ✅
- Fix-scope recommendation recorded, no code changed. ✅

> **Note on "post-session" notes updates:** the brief's post-session step asks to update `.claude/notes/mistakes.md` + `patterns.md`, but those files already carry unrelated uncommitted WIP and the session's hard guard names this audit doc as *the single permitted write*. Honoring the stricter READ-ONLY guard, those updates are **deferred to the fix session** rather than risk clobbering in-progress work.
