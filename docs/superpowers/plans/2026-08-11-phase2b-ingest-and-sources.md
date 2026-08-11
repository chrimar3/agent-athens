# Phase 2B (Ingest & Sources) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kill the recurring ingest defect classes at their source (athinorama phantom rows / range-start dates / year rollover), build the post-save validator that 8+ sessions route corrections to, add cometogether.live as a source, and repair the degraded scraper tail — per spec §5.3/§5.4.

**Architecture:** All athinorama date logic funnels through the exported pure `parseTheaterDateRange(card, refDate)` (scrape-all.ts:486-537) — fixes land there with fixture tests. Phantom rows die at the identity layer: athinorama events currently get `generateEventId(title, date, venue)` (scrape-all.ts:96-98) where ongoing runs stamp `startDate = today` (scrape-all.ts:522), minting a new id every scrape-day — the fix keys athinorama identity on the source URL slug instead. The post-save validator is deterministic-only: URL-sibling collapse reuses the reversible `merged_into` dedup machinery; prose concerns become decisions-queue proposals, never blind auto-writes. cometogether.live is plain-fetch scrapeable (verified 2026-08-11: Next.js but server-rendered listings, `/el/event/[id]/[slug]` URLs, robots.txt allows event pages and declares a sitemap; `/api/*` and `/buytickets/*` disallowed — do not touch those).

**Tech Stack:** Bun + `bun:test`, existing `SOURCES` registry (scrape-all.ts:1634), existing location-filter pipeline (scrapers do NOT decide Athens membership), reversible dedup (`merged_into` + `dedup_merges`).

## Global Constraints

- Runtime **Bun**; timezone `Europe/Athens`; never `git add -A`; work in worktree `../aa-wt-phase2b` branched from `main` (run `bun install --frozen-lockfile` first); main checkout stays on `main`.
- TDD Iron Law. `parseTheaterDateRange` is exported pure — every date fix gets a fixture test asserting the fixture's own precondition. Synthetic fixtures, never live-data-dependent assertions.
- **Exhibitions use `end_date`, not `start_date`** (Tier-1) — any validator touching lifecycle must use the COALESCE rule.
- Price vocabulary is `open | with-ticket | donation` — never free/paid.
- The scraper does not set final `location_status` — the location filter phase owns Athens membership. A new source emits events with venue names and lets the filter classify (`verified_athens`/`unverified`/`rejected_non_athens`).
- All event deletions/merges MUST go through reversible marking (`merged_into` + `merged_into IS NULL` guards) — never hard DELETE (S197/S198 invariant; db-guard enforces at the tool layer too).
- New-source etiquette: `--dry-run` first (`/pre-scrape-check` checklist), throttle requests (the existing scrapers' retry/fetch helpers — reuse `fetchWithRetryAthinorama`-style patterns), honor robots.txt disallows.
- Do not run heavy sessions concurrently with enrichment slots when validating (S222).
- events.db in tests: `:memory:` fixtures only (prod-db-guard).

## File Structure

| File | Responsibility | Task |
|------|---------------|------|
| `scripts/scrape-all.ts` (modify :486-537, :96-98 call sites :339/:626, SOURCES :1634, SourceId type ~:88) | date fixes, athinorama URL-keyed identity, cometogether registration | 1, 2, 4 |
| `tests/athinorama-dates.test.ts` (create) | rollover + range-start fixture pins | 1 |
| `tests/athinorama-identity.test.ts` (create) | one production = one row | 2 |
| `scripts/post-save-validator.ts` (create) + `tests/post-save-validator.test.ts` | deterministic concern processing | 3 |
| `scripts/scrape-cometogether.ts` (create) + `tests/scrape-cometogether.test.ts` | new source (fetch-based, fixture-tested parser) | 4 |
| `scripts/scrape-all.ts` more.com section (:248-360) | Exhibitions timeout + runtime bound | 5 |
| `src/utils/athinorama-image.ts` + image download phase | list.jpg 404 class | 5 |

Execution order: 1 → 2 → 3 → 4 → 5 → 6. Tasks 3/4/5 independent after 1-2.

---

### Task 1: Athinorama date fixes in `parseTheaterDateRange` (pure, fixture-driven)

Two defects, one function:
- **Year rollover** (:510-511, :520, :530-532): `if (m < currentMonth) year++` re-dates a PAST event one year forward on re-scrape (13+ confirmed instances). A card whose computed date is far in the future is more likely a stale past listing than a real 11-months-away premiere.
- **Range-start artefact** (:522): ongoing shows get `startDate = today` — today is usually not a performance day ("the modal state of the field", S206), and it also feeds the identity bug (Task 2).

**Files:**
- Modify: `scripts/scrape-all.ts:486-537`
- Test: `tests/athinorama-dates.test.ts`

**Interfaces:**
- Produces: `parseTheaterDateRange(card, refDate)` returns an ADDITIONAL field: `{ startDate, endDate, startIsRangeArtifact: boolean }` — `true` when startDate was synthesized (ongoing-show branch) rather than parsed from a printed premiere. Downstream (:339/:626 call sites) writes `date_precision = 'range-artifact'`… **no new DB column**: instead, when `startIsRangeArtifact`, the event's `start_date` is written as-is BUT the identity (Task 2) excludes it, and enrichment briefs already flag date-conflicts. Keep this task to the rollover fix + the flag; the flag is consumed by Task 2.

- [ ] **Step 1 (RED):** `tests/athinorama-dates.test.ts`:

```ts
import { describe, test, expect } from 'bun:test';
import { parseTheaterDateRange } from '../scripts/scrape-all';

// refDate: 2026-08-11. Cards are minimal athinorama markup snippets — assert
// each fixture's precondition so a markup-format change fails loudly.
const ref = new Date('2026-08-11T12:00:00Z');
const card = (s: string) => s;

describe('parseTheaterDateRange rollover guard', () => {
  test('premiere 7 months ahead within window → next-year roll is KEPT (real early-booking case)', () => {
    const c = card('Πρεμιέρα: </strong>15/2');
    expect(c).toContain('Πρεμιέρα'); // precondition
    expect(parseTheaterDateRange(c, ref).startDate).toBe('2027-02-15');
  });

  test('premiere last month does NOT roll to next year beyond the window (the 13-instance rollover class)', () => {
    // 09/7 vs ref 11 Aug: old code rolled to 2027-07-09 (11 months away).
    // New rule: a rolled date > ROLLOVER_WINDOW_MONTHS (10) ahead → treat as past, return null start.
    const r = parseTheaterDateRange(card('Πρεμιέρα: </strong>9/7'), ref);
    expect(r.startDate).toBeNull();
  });

  test('ongoing show start is flagged as range artifact', () => {
    const r = parseTheaterDateRange(card('Εως: </strong>20/9'), ref);
    expect(r.startDate).toBe('2026-08-11'); // unchanged behavior…
    expect(r.startIsRangeArtifact).toBe(true); // …but now honest about it
  });

  test('printed premiere is NOT flagged', () => {
    const r = parseTheaterDateRange(card('Πρεμιέρα: </strong>15/9'), ref);
    expect(r.startIsRangeArtifact).toBe(false);
  });

  test('end-date rollover also windowed', () => {
    const r = parseTheaterDateRange(card('Εως: </strong>5/7'), ref);
    expect(r.endDate).toBeNull(); // 2027-07-05 would be 11 months out — stale listing, not a real run-end
  });
});
```

Run → FAIL (`startIsRangeArtifact` undefined; rollover unguarded). Type error on the return shape is part of the RED.

- [ ] **Step 2 (GREEN):** in `parseTheaterDateRange`: add `const ROLLOVER_WINDOW_MONTHS = 10;` and a helper `withinWindow(iso: string): boolean` (date ≤ refDate + 10 months); after each year-roll branch, if the rolled date fails `withinWindow`, set that date to `null` (comment: the 13-instance S204 rollover class — a "next-year" date nearly a year out is a stale past listing, not a booking). Add `startIsRangeArtifact` to the return (true only in the `untilMatch`-only branch). Update the `TheaterDateRange` interface and both call sites (`:339`, `:626` region — pass the flag through to Task 2's identity call; until Task 2 lands, just destructure and ignore).
- [ ] **Step 3:** `bun test tests/athinorama-dates.test.ts` green; full suite no new failures. Commit.

---

### Task 2: One production = one row (athinorama URL-keyed identity)

`generateEventId(title, date, venue)` (:96-98) + `startDate = today` mints a fresh id per scrape-day for every ongoing run — Βάκχες reached 18 rows, Υπηρέτης 50. The athinorama event URL slug (`…/bakxes-10091044/`) is the stable production key.

**Files:**
- Modify: `scripts/scrape-all.ts` — new `generateAthinoramaId(url, title, venue)`; use it at the athinorama call sites; leave other sources untouched
- Test: `tests/athinorama-identity.test.ts`

**Interfaces:**
- Produces: `generateAthinoramaId(url: string): string | null` — extracts the numeric slug id (`/-(\d{6,})\/?$/` on the URL path) and returns `md5('athinorama:' + slugId).substring(0,16)`; null when no slug id (caller falls back to the legacy id). Existing rows keep their ids (no migration): new scrapes of the same production now hit the SAME id and flow through the existing upsert/insert-or-ignore path instead of minting a row — verify which of upsert (`src/db/database.ts:251`) vs direct INSERT (scrape-all.ts:1407) the athinorama path uses and confirm same-id behavior is update-not-duplicate.
- **Backlog cleanup handled by Task 3** (URL-sibling collapse) — this task only stops NEW phantom rows.

- [ ] **Step 1 (RED):** test: same production URL scraped on two different refDates yields the SAME id; different productions yield different ids; a URL without a numeric slug returns null; **precondition pin:** the legacy `generateEventId(title, date1, venue) !== generateEventId(title, date2, venue)` for date1≠date2 (documents WHY this fix exists — if that ever changes, revisit).
- [ ] **Step 2 (GREEN):** implement + wire the athinorama call sites (`id: generateAthinoramaId(url) ?? generateEventId(title, startDate, venueName)`). Read the insert path for athinorama first and confirm same-id → update/ignore (add a note in the commit message stating which).
- [ ] **Step 3:** green; then a bounded live check: `bun run scripts/scrape-all.ts --dry-run --source athinorama | head -40` — dry-run shows stable ids. Commit.

---

### Task 3: Post-save validator (deterministic subset + proposals)

505 `date-conflict-or-unparseable` concerns and 133 `venue-mismatch-or-unknown` sit unprocessed (`event_concerns`: prose `concern_text`, PK (event_id, concern_type), no status column). Deterministic-only automation; everything else becomes a decisions-queue proposal.

**Files:**
- Create: `scripts/post-save-validator.ts`
- Test: `tests/post-save-validator.test.ts`
- Modify: `scripts/daily-automated.sh` — run in full mode after dedup phase, before build

**Interfaces:**
- Consumes: `event_concerns`, `events` (URL-sibling groups), the reversible-merge helpers used by the existing dedup scripts (read `scripts/merge-duplicates.ts`or the `merged_into` writer the S197 work landed — reuse, do not re-implement).
- Produces three deterministic behaviors, each pure-function-cored for tests:
  1. **URL-sibling collapse (athinorama phantom backlog):** groups of >1 non-merged events sharing the same athinorama slug id in `url` → elect survivor (earliest `created_at` WITH a `full_description` if any, else earliest), mark others `merged_into` survivor (reversible). This is the "dedup-before-publish" 8 sessions asked for.
  2. **Rollover expiry:** events with a `date-conflict-or-unparseable` concern AND `start_date` > today + 10 months AND no `end_date` → propose (not auto-apply) expiry/correction to the queue, with any ISO/`DD-MM`/`D Month` date found in `concern_text` extracted as the proposed correct date (`extractProposedDate(text): string | null`).
  3. **Report:** counts processed/merged/proposed → stdout + append to `data/validator-log.jsonl` (timestamped, one line per run — computed input for the digest).

- [ ] **Step 1 (RED):** fixture-DB tests (`:memory:`, schema: minimal events + event_concerns): sibling group of 3 same-slug rows → 2 marked merged_into survivor, survivor has the description; a group already merged is untouched (idempotent — run twice, same state); `extractProposedDate('post-save validator should correct to 2026-09-02')` → `'2026-09-02'`; a Greek-format date `'true night Sun 30 Aug 21:15'` → `'2026-08-30'` (year from event context param); no date → null. Assert fixture preconditions (the sibling rows genuinely share a slug; the merged group genuinely pre-merged).
- [ ] **Step 2 (GREEN):** implement. The merge writes MUST set `merged_into` and log to `dedup_merges` exactly as the existing dedup does (read it first). No DELETE anywhere.
- [ ] **Step 3:** green; live dry-run mode (`--dry-run` prints planned merges without writing — implement the flag) against the real DB (readonly open in dry-run); eyeball the Βάκχες/Υπηρέτης groups appear. Then one real run; verify `SELECT COUNT(*) FROM events WHERE merged_into IS NOT NULL` grew by the planned amount and spot-check one group. Wire into `daily-automated.sh`. Commit.

---

### Task 4: cometogether.live scraper (new source)

**Files:**
- Create: `scripts/scrape-cometogether.ts` (parser exported pure; fetch shell)
- Modify: `scripts/scrape-all.ts` — `SourceId` union (~:88 comment notes SOURCES↔colophon count guard — find and update that pin too) + `SOURCES` entry (:1634)
- Test: `tests/scrape-cometogether.test.ts` with a saved HTML fixture

**Interfaces:**
- Produces: `scrapeCometogether(fetchFn = fetch): Promise<ScrapedEvent[]>` matching the `ScrapedEvent` shape (scrape-all.ts:59-77): `id` via `md5('cometogether:' + eventId)` (URL `/el/event/[ID]/[slug]` — stable numeric id, learning Task 2's lesson from day one), `source: 'cometogether'`, `price_type` from "από €X" (X>0 → `with-ticket`, explicit free wording → `open`), `url` = absolute event URL, `venue_name` as printed (location filter classifies Athens downstream — Thessaloniki etc. events will be `rejected_non_athens`, by design), `type`/`genres` mapped from the visible genre tags (map to the EventType enum; unmappable → `other`).
- Constraints verified 2026-08-11: listing page `/el` is server-rendered; robots.txt disallows `/api/*`, `/ssr/*`, `/buytickets/*` — fetch ONLY listing/event pages and the declared `sitemap.xml`; a few hundred ms delay between event-page fetches.

- [ ] **Step 1:** Save a live fixture: `curl -s https://cometogether.live/el > tests/fixtures/cometogether-listing.html` (commit it). Fixture precondition test: the file contains `/el/event/` links (if the site redesigns, the test fails loudly instead of the parser going vacuous).
- [ ] **Step 2 (RED):** parser tests against the fixture: extracts >0 events; each has non-empty title, venue_name, a parseable date, an absolute url matching `^https://cometogether\.live/el/event/\d+/`; "από €8" → `price_type: 'with-ticket'`, `price_amount: 8`; ids stable across two parses.
- [ ] **Step 3 (GREEN):** implement `parseCometogetherListing(html, refDate): ScrapedEvent[]` + the fetch shell (listing page first; only if the listing lacks needed fields, fetch individual event pages capped at N=40/run with delay). Greek date parsing ("Σαβ, 29 Αυγ") — month-name map + year inference with the SAME 10-month window rule as Task 1 (import the helper; do not fork it).
- [ ] **Step 4:** register in `SOURCES` + `SourceId`; update the SOURCES↔colophon drift pin (~:88) whichever direction it requires. `bun run scripts/scrape-all.ts --dry-run --source cometogether` → events print, nothing written. Then one real run; then check the location filter classified them (`sqlite3 -readonly … "SELECT location_status, COUNT(*) FROM events WHERE source='cometogether' GROUP BY 1"`). Unknown venues land `unverified` (hidden) → they surface in the venue-review flow; that is correct behavior, not a bug.
- [ ] **Step 5:** Commit (scraper + fixture + registry + pin).

---

### Task 5: Scraper tail repairs (more.com Exhibitions, athinorama images)

**Files:**
- Modify: `scripts/scrape-all.ts:248-360` (scrapeMore), `src/utils/athinorama-image.ts` + the image-download phase that builds `…/list.jpg` URLs
- Test: extend existing scraper tests where present; fixture tests for the URL builder

- [ ] **Step 1 (more.com):** find the Exhibitions sub-page navigation (the `TimeoutError: Navigation timeout of 30000 ms` in pipeline logs); wrap that one category in a try/catch that logs and continues (one dead category must not cost the other categories' events — mirror the per-source isolation pattern), and raise its navigation timeout to 60s. Verify: `bun run scripts/scrape-all.ts --dry-run --source more` completes with events from the healthy categories even if Exhibitions still times out.
- [ ] **Step 2 (athinorama images):** reproduce one 404: take a current event's image URL from the logs (`…/lmnts/events/theatre/10089345/list.jpg`) and fetch the event page to find where images actually live now (the S165 `upgrade-athinorama-images.ts` + `src/utils/athinorama-image.ts` pattern at scrape-all.ts:407-412 extracts `ImagesDatabase/p/250x300/crop/...` URLs from page bodies — check whether the list.jpg fallback path is simply obsolete). Fix the builder to the working scheme with a fixture test pinning both an old-scheme and new-scheme extraction; if the scheme is genuinely gone, remove the dead fallback and let the page-body extractor be the only path.
- [ ] **Step 3:** Verify next pipeline run's image summary is no longer `Downloaded: 0 | Failed: 481`. Commit.

---

### Task 6: Validation + record

- [ ] Full suite green (known env failures only); merge → main; push; remove worktree.
- [ ] Next daily run observed: athinorama scrape produces no NEW phantom rows for the known repeat offenders (query the Βάκχες slug's row count before/after — must not grow), validator log line appears, cometogether events present and classified.
- [ ] mistakes.md/session-log entries; known-issues.md updates (phantom-row class → fixed at ingest; image 404 → status per outcome). Phase-2 exit-gate clock (14 zero-intervention days) starts when 2A+2B are both live — record the start date.

## Self-Review (performed at write time)

- **Spec coverage §5.3:** F2b pre-address check is in 2A (Task 4 there); athinorama collapse ✓(T2+T3), first-real-showdate → *partially*: the range-artifact flag + identity fix stop the damage (wrong start no longer mints rows; enrichment already flags per-event), but computing the true first showdate from per-event schedule lines ("Σάβ. 9 μ.μ.") is deliberately NOT in this plan — it needs per-event page parsing with low, unproven yield; logged as a queued follow-up in Task 6's known-issues update. Year rollover ✓(T1). Post-save validator ✓(T3, deterministic subset + proposals). §5.4: cometogether ✓(T4), more.com ✓(T5), clubber quarantine in 2A T3, athinorama images ✓(T5), ticketservices runtime bound → NOT included (6.4h runtime is ugly but currently harmless since the pipeline is enrichment-decoupled; queued follow-up, same Task 6 note).
- **Placeholder scan:** bounded read-first steps (merge-helper reuse, insert-path confirmation, colophon pin direction) are explicit executor instructions with named files.
- **Type consistency:** `TheaterDateRange` gains `startIsRangeArtifact` in T1 and T2 consumes it; `ScrapedEvent` shape copied from :59-77; `extractProposedDate` signature consistent between test and impl.
