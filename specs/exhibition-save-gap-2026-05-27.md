# Exhibition Save-Gap Diagnosis — snfcc / benaki / onassis — 2026-05-27

**Type:** READ-ONLY investigation → spec. No code changed. No DB writes.
**Mutation guard:** baseline `events=12694`, `scrape_stats=1214` (see session end for re-check).
**Verdict per source:** snfcc → **(d) save-path drop** · benaki → **(a) genuine expiry, masking a dead live parser** · onassis → **(b) exhibition end_date not captured**.
**Headline (bigger than exhibitions):** the daily scrape finds ~538 events but **only ~129 persist** — **~405 (75%) are silently swallowed every run** by a mislabeled `catch`. Exhibitions are the most visible casualty, but the bug is global.

---

## How "found vs landed" was measured

- **Found (pre-save):** live `--dry-run --source <id>` event count (non-mutating; verified yesterday).
- **Landed:** `SELECT … FROM events WHERE source=<id>` + `created_at`/`updated_at` timeline.
- **Save outcome:** the real pipeline logs `Saved N events to database (M out of scope)` (`scripts/scrape-all.ts:1637`).
- ⚠️ **`scrape_stats.events_new` / `events_updated` are always 0** (hardcoded at `scrape-all.ts:1588` — `recordScrapeStats(sourceId, events.length, 0, 0, …)`). Do **not** use them; they are never back-filled.
- ⚠️ **Timezone trap:** `events.updated_at`/`created_at` use SQLite `datetime('now')` = **UTC**. The 08:00 Athens scrape = **05:0x UTC**; the 10:00 Athens enrichment = **07:0x UTC**. Rows showing `updated_at ≈ 07:0x` were touched by *enrichment*, not the scrape.

---

## THE GLOBAL FINDING (drives all three verdicts) — silent save drop

Daily `Saved N` from recent pipeline logs (`logs/pipeline-2026-05-2*.log`): **131, 4, 135, 128, 129, 129** out of ~538 scraped. Net-new rows actually created per day (`SELECT date(created_at), COUNT(*) …`): **2 (05-26), 5 (05-25), 3 (05-24), 28 (05-23), 5, 6, 7**.

**Mechanism — `scripts/scrape-all.ts:1396-1420`:**
```ts
stmt.run({ … });   // INSERT … ON CONFLICT(id) DO UPDATE …
saved++;
} catch (err) {
  // Silently skip duplicates      ← lines 1418-1420
}
```
- The events table's **only** unique index is on `id` (`sqlite_autoindex_events_1`; verified via `pragma_index_list`). `ON CONFLICT(id) DO UPDATE` therefore handles *every* id collision — a true duplicate **cannot** throw. So the ~405/run landing in this catch are **not duplicates**; they are real exceptions (NOT NULL violation, `normalizeDateField` rejection, type/categorizer error, or transient `SQLITE_BUSY` from concurrent enrichment) being **silently discarded under a misleading comment.**
- Consequence: `saved++` counts only inserts + successful updates; the 75% that throw never persist and never refresh existing rows.

**Fix-session pointer (P0, do NOT fix here):** `scripts/scrape-all.ts:1418-1420` — replace the bare silent catch with `log('ERROR', e.source, \`save failed for ${e.id}: ${err}\`)` (or rethrow non-duplicate errors). **First** surface the real exception; do **not** assume duplicates. The save count should jump toward ~534 once the true error is fixed. This is the single highest-leverage fix for site freshness.

---

## Per-source verdicts

### snfcc → (d) SAVE-PATH DROP  *(demo-relevant)*
**Evidence:**
- Live dry-run finds ~21-24 events; the scraper **filters past events at scrape time** (`scripts/scrape-snfcc.ts:337, :420, :504` — `if (startDate < today && (!endDate || endDate < today)) continue;`), so the found set is *current*.
- DB has **12** snfcc rows; **0 created in the last 21 days** (`MAX(created_at)=2026-04-23`); newest `start_date=2026-05-01`; only **1 upcoming**.
- All 12 rows are `location_status=verified_athens` → **not** a location filter issue (rules out cause c).
- Existing rows' `updated_at ≈ 07:00 UTC` = enrichment, **not** the 05:06 UTC scrape → the scrape's found events neither inserted nor updated these rows. They are in the ~405 swallowed set.

**Verdict:** **(d)** — current events are found daily but silently fail to persist. Not expiry, not location, not an end_date bug.
**Fix-session pointer:** the global catch (`scrape-all.ts:1418-1420`). Likely secondary contributor to surface once logging is on: `scrape-snfcc.ts:333` defaults unparseable dates to `today` (`parsedStart || today`), which can churn `generateEventId` daily — confirm after the catch is un-silenced.

### benaki → (a) GENUINE EXPIRY, masking a dead live parser
**Evidence:**
- Dry-run logs `Adding known exhibitions from research` → the **4 found events are a hardcoded fallback** (`scripts/scrape-benaki.ts:177-219`): Grand Tour (`…→2026-03-29`), N.I.M.A. (`…→2026-03-28`), Ακριθάκης (`…→2026-05-24`), Συλλογή ΜΙΕΤ (`…→2026-04-26`).
- All 5 stored benaki rows are exhibitions with `end_date` **already past** (newest `2026-05-24`, three days ago), all `verified_athens`. The Tier-1-correct display classifier therefore *correctly* marks them expired → **DB `upcoming=0` is accurate.**

**Verdict:** **(a)** — no save bug, no query bug. BUT the live HTML parser (`scrape-benaki.ts:127-165`) is returning **0**, which is the *only* reason the hardcoded fallback fires — and that fallback is now fully expired. benaki has been silently coasting on stale hardcoded data (a clubber-style breakage, hidden behind a fallback).
**Fix-session pointer:** `scrape-benaki.ts:127-165` (repair/verify the live `com_landings` selector) and `:177-219` (the fallback is expired — refresh the researched dates or remove the fallback so a dead parser surfaces instead of masquerading).

### onassis → (b) EXHIBITION end_date NOT CAPTURED
**Evidence:**
- **6 of 7** stored onassis rows are exhibitions with **`end_date = NULL`**; all `verified_athens`.
- Live parser sets `end_date` **only** when the listing has an explicit date *range* (`scripts/scrape-onassis.ts:150-167`); the single-date branch (`:159`) leaves `end_date=null`.
- The display classifier `src/utils/event-lifecycle.ts:50` is **Tier-1 compliant** — `relevantDate = (isExhibition && endDate) ? endDate : startDate`. With `endDate=NULL` it *correctly* falls back to `startDate`, so a still-running exhibition that opened `2026-05-17` is marked PAST on `2026-05-27`.

**Verdict:** **(b)** — but the root cause is **scraper end_date capture, NOT the consumption query** (the query is correct; I verified it). NULL end_date + correct fallback = premature expiry. onassis also carries the same expired hardcoded fallback (`scrape-onassis.ts:182-191`, `2026-03-07→2026-05-17`).
**Fix-session pointer:** `scrape-onassis.ts:159` — capture/derive `end_date` for single-date exhibition listings (fetch the detail page, or treat an exhibition with no end_date as *ongoing* rather than expiring on start_date).

---

## Cross-cutting notes (for awareness, not Track-A fixes)

- ✅ **Display gate is correct:** `src/utils/event-lifecycle.ts:44-68` honors the exhibition `end_date` rule. The canonical COALESCE pattern otherwise appears **only in tests** (`src/db/__tests__/queries.test.ts:320,453`), because production filters lifecycle in JS, not SQL.
- ⚠️ **start_date-only queries that are NOT the display gate** (lower priority): stats `upcomingCount` (`src/db/database.ts:418`) and enrichment prioritization (`src/enrichment/priority-queue-manager.ts:293, :638, :646`). These under-count/deprioritize running exhibitions but do not hide them from the site.

## Recommended fix-session scope (priority)
1. **P0 — un-silence the save catch** (`scrape-all.ts:1418-1420`), identify the true exception behind the 405/run drop, fix it. Single biggest freshness win; affects all 10 sources.
2. **P1 — onassis end_date capture** (`scrape-onassis.ts:159`).
3. **P1 — benaki live parser + stale fallback** (`scrape-benaki.ts:127-165`, `:177-219`).
4. **P2 — retire the always-0 `events_new/events_updated`** args or compute them (`scrape-all.ts:1588`) so `scrape_stats` becomes a usable save-success signal.

> No code modified in this session. All line numbers are read-only references for the follow-up fix session.
