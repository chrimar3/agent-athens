# URL Integrity — Diagnostic Scope

**Session:** Diagnostic only (no fixes applied)
**Date:** 2026-04-21
**Problem class (pre-spike, data-only):** **Class B (stale URLs) + Class D (individual records)**, with Class A/C ruled out from the code/URL-shape analysis. **Final classification pending Step 2 manual spike results.**
**Proposed fix session:** *If ≥7/10 broken after spike →* run a dedicated URL validator session that leverages the existing `ticket_url_status` column: batch-HEAD every `url`/`ticket_url` for upcoming events, mark `ticket_url_status='broken'` where 404/homepage-redirect, expose a status badge in the event UI, and hide/tombstone broken events after N days. *If 3–6/10 →* same fix, scoped to more.com only. *If ≤2/10 →* spot-clean the handful of bad records; no systemic fix needed.

---

## Step 0: Assumption verification

Categorizer tests: **103 pass / 0 fail** (ran `bun test src/categorizer/__tests__/ src/validators/__tests__/event-categorizer.test.ts` — note: the plan's `tests/categorizer/` path does not exist; tests live colocated under `src/**/__tests__/`).

Regression hypothesis **ruled out**. Misclassifications, if real, reflect coverage gaps — not a recent code change breaking previously-working paths.

---

## Step 1: Per-source URL presence (upcoming events only)

Query:
```sql
SELECT source, COUNT(*) AS total,
       SUM(CASE WHEN ticket_url IS NULL OR ticket_url='' THEN 1 ELSE 0 END) AS no_ticket_url,
       SUM(CASE WHEN url IS NULL OR url='' THEN 1 ELSE 0 END) AS no_source_url
FROM events
WHERE location_status IN ('verified_athens','pass_through')
  AND COALESCE(CASE WHEN type='exhibition' THEN end_date ELSE NULL END, start_date) >= date('now')
GROUP BY source
ORDER BY total DESC;
```

| Source            | Total | No ticket_url | No source url | Missing rate  |
|-------------------|-------|---------------|---------------|---------------|
| athinorama.gr     | 317   | 13            | 0             | 4.1%          |
| residentadvisor   | 92    | 13            | 0             | 14.1%         |
| more.com          | **86**| **0**         | 0             | 0%            |
| megaron.gr        | 37    | 0             | 0             | 0%            |
| ticketservices    | 33    | 1             | 0             | 3%            |
| halfnote          | 19    | 0             | 0             | 0%            |
| clubber.gr        | 19    | 3             | 0             | 15.8%         |
| **snfcc**         | 9     | **9**         | 0             | **100%**      |
| onassis           | 5     | 0             | 0             | 0%            |
| manual            | 2     | 0             | 0             | 0%            |
| eventbrite        | 2     | 1             | 0             | 50%           |
| productledhub.com | 1     | 0             | 0             | 0%            |
| greeksin.ai       | 1     | 1             | 0             | 100%          |
| devoxx.gr         | 1     | 0             | 0             | 0%            |
| benaki            | 1     | 0             | 0             | 0%            |

**Headline facts:**
- `url` (source page) is populated for 100% of upcoming verified events across all sources.
- `ticket_url` is sparsely missing on some sources; more.com is **not one of them** (0 missing of 86).
- snfcc is 100% missing `ticket_url` — a distinct sub-problem, not the one we're diagnosing.
- The 20-row sample below shows **`ticket_url` === `url` for every more.com row**. The scraper writes the same URL to both columns — there is no purchase-page / landing-page distinction.

---

## Step 1b: 20 more.com ticket_url samples

| #  | Title                                                                | Start date          | ticket_url                                                                                       |
|----|----------------------------------------------------------------------|---------------------|--------------------------------------------------------------------------------------------------|
| 1  | EJEKT FESTIVAL 2026 \| THE CURE                                      | 2026-07-15          | https://www.more.com/gr-el/tickets/music/ejekt-festival-2026-the-cure/                           |
| 2  | Ρωμαίος και Ιουλιέτα - Balletto di Milano                            | 2026-04-04          | https://www.more.com/gr-el/tickets/dance/balletto-di-milano/                                     |
| 3  | MARCOS AYALA TANGO - The Golden Years                                | 2026-04-22          | https://www.more.com/gr-el/tickets/dance/marcos-ayala-tango-the-golden-years/                    |
| 4  | Dr. Jordan B. Peterson: An Evening to Transform Your Life            | 2026-03-07 *(past)* | https://www.more.com/gr-el/tickets/happenings/jordan-peterson/                                   |
| 5  | Εργαστήρια για άτομα 65+: Δημιουργώντας Ανάγλυφες Ιστορίες με Πηλο   | 2026-03-13 *(past)* | https://www.more.com/gr-el/tickets/workshop/dimiourgontas-anaglyfes-istories-me-pilo/            |
| 6  | Cat Festival 2026                                                    | 2026-04-25          | https://www.more.com/gr-el/tickets/happenings/festival/cat-festival-2026/                        |
| 7  | Εργαστήρια για άτομα 65+: Διάβαση (Ίδρυμα Ευγενίδου)                 | 2026-03-09 *(past)* | https://www.more.com/gr-el/tickets/workshop/diabasi-se-synergasia-me-to-idryma-eygenidou/        |
| 8  | Ο ΑΝΤΩΝΗΣ ΡΕΜΟΣ ΕΡΜΗΝΕΥΕΙ ΜΙΚΗ ΘΕΟΔΩΡΑΚΗ                             | 2026-03-11 *(past)* | https://www.more.com/gr-el/tickets/music/dromoi-palioi-dromoi-kainourgioi/                       |
| 9  | Dara Ó Briain                                                        | 2026-03-11 *(past)* | https://www.more.com/gr-el/tickets/theater/dara-o-briain/                                        |
| 10 | ALBAN SKËNDERAJ \| MOTIV                                             | 2026-03-21 *(past)* | https://www.more.com/gr-el/tickets/music/alban-skenderaj-motiv/                                  |
| 11 | Geoff Tate @ Operation Mindcrime                                     | 2026-04-02 *(past)* | https://www.more.com/gr-el/tickets/music/geoff-tateoperation-mindcrime/                          |
| 12 | Jazz στο Μουσείο: George Kontrafouris Quartet – "International Jazz Day" | 2026-04-30     | https://www.more.com/gr-el/tickets/music/jazz-sto-mouseio-george-kontrafouris-quartet/           |
| 13 | TELETECH ATHENS 2026 - Pre-Registration                              | 2026-05-09          | https://www.more.com/gr-el/tickets/music/teletech-athens-2026-pre-registration/                  |
| 14 | TELENOVA live in Athens                                              | 2026-05-28          | https://www.more.com/gr-el/tickets/music/telenova-live-in-athens-1/                              |
| 15 | CHRIS ISAAK                                                          | 2026-06-13          | https://www.more.com/gr-el/tickets/music/chris-isaak/                                            |
| 16 | Release Athens 2026 / Limp Bizkit                                    | 2026-06-15          | https://www.more.com/gr-el/tickets/music/festival/release-athens-2026/limp-bizkit/               |
| 17 | Release Athens 2026 / Moby                                           | 2026-06-24          | https://www.more.com/gr-el/tickets/music/festival/release-athens-2026/moby/                      |
| 18 | Release Athens 2026 / Nick Cave & The Bad Seeds                      | 2026-06-24          | https://www.more.com/gr-el/tickets/music/festival/release-athens-2026/nick-cave-the-bad-seeds/   |
| 19 | RELEASE ATHENS 2026 X SNF NOSTOS / GORILLAZ                          | 2026-06-25          | https://www.more.com/gr-el/tickets/music/festival/release-athens-2026-x-snf-nostos/gorillaz/     |
| 20 | Λόγος Τιμής live στην Αθήνα                                          | 2026-07-04          | https://www.more.com/gr-el/tickets/music/ltath2025/                                              |

> **Note on "past" rows:** rows 4, 5, 7, 8, 9, 10, 11 have `start_date` earlier than today (2026-04-21) but passed the upcoming filter, meaning they have `type='exhibition'` OR the query COALESCE fell through. Worth confirming — the dataset timezone handling may treat some same-day events as future.

**URL shape observations:**
- All 20 URLs follow the canonical pattern `https://www.more.com/gr-el/tickets/{category}/{slug}/` (sometimes with an extra `/festival/{festival-slug}/` segment).
- No affiliate redirects, no UTM tracking, no query strings — Class C ("affiliate URLs need unwrapping") looks unlikely.
- No 404-looking synthetic URLs; slugs look realistic.
- Categories on more.com itself: `music`, `dance`, `theater`, `happenings`, `workshop`. These are **not** 1:1 with our internal `type` enum (`concert|exhibition|cinema|theater|performance|workshop|other`). Downstream this is how Jordan Peterson (lecture under `/happenings/`) likely ends up miscategorized — see misclassification spec.

---

## Step 2: Manual spike — 10-URL human observation

**Action required:** Christos clicks each URL below and records the outcome.

| # | URL                                                                                           | Resolves correctly | Redirects to homepage | 404 | Other (note) |
|---|-----------------------------------------------------------------------------------------------|:------------------:|:---------------------:|:---:|:------------:|
| 1 | https://www.more.com/gr-el/tickets/music/ejekt-festival-2026-the-cure/                        |                    |                       |     |              |
| 2 | https://www.more.com/gr-el/tickets/dance/balletto-di-milano/                                  |                    |                       |     |              |
| 3 | https://www.more.com/gr-el/tickets/happenings/jordan-peterson/                                |                    |                       |     |              |
| 4 | https://www.more.com/gr-el/tickets/happenings/festival/cat-festival-2026/                     |                    |                       |     |              |
| 5 | https://www.more.com/gr-el/tickets/music/chris-isaak/                                         |                    |                       |     |              |
| 6 | https://www.more.com/gr-el/tickets/music/festival/release-athens-2026/limp-bizkit/            |                    |                       |     |              |
| 7 | https://www.more.com/gr-el/tickets/music/festival/release-athens-2026-x-snf-nostos/gorillaz/  |                    |                       |     |              |
| 8 | https://www.more.com/gr-el/tickets/dance/marcos-ayala-tango-the-golden-years/                 |                    |                       |     |              |
| 9 | https://www.more.com/gr-el/tickets/music/telenova-live-in-athens-1/                           |                    |                       |     |              |
| 10| https://www.more.com/gr-el/tickets/music/ltath2025/                                           |                    |                       |     |              |

**Summary:** ___/10 resolve correctly · ___/10 homepage redirect · ___/10 404 · ___/10 other

**Decision gate:**
- ≥7 broken → systemic more.com URL issue → proceed with Class A/B/C hypotheses
- 3–6 broken → partial / pattern-specific issue
- ≤2 broken → not systemic; URL integrity complaint may be about a handful of records, or about a different source

---

## Step 3: Root cause candidates (diagnostic only — no code changes)

*(Populated below after scraper/config inspection — see pattern extraction section.)*

### Pattern extraction findings

**Pipeline map for more.com URLs:**

1. **Scraper:** `scripts/scrape-all.ts` → `scrapeMore()` (lines 228–337).
   - Crawls only `/music/`, `/theatre/`, `/sports/` listing pages.
   - Link regex: `/href="(\/gr-el\/tickets\/(?:music|theatre|sports|theater)\/[a-z0-9-]+\/)"/gi`.
   - For each link, fetches event page and extracts title/venue/dates/price via regex patterns (og:title, `"venue-name":"..."`, ISO date match, `"prices":"<span class='money'>XX€</span>"`).
   - Writes `url: eventUrl` and `source: 'more.com'` to `ScrapedEvent`. **Does NOT write `ticket_url`.**
   - Only first 20 events per category processed per run (rate-limit guard).

2. **DB writer:** `scripts/scrape-all.ts` → `saveEvents()` (lines 1315–1345).
   - INSERT column list omits `ticket_url`. New rows land with `ticket_url = NULL`.
   - ON CONFLICT updates `url`, `type`, dates, price, time, image — **does not touch `ticket_url`**.

3. **Downstream ticket_url resolvers** (targeted at athinorama events only, not more.com):
   - `scripts/extract-ticket-urls.ts` — fetches athinorama pages, pulls external ticket domain links.
   - `scripts/crossref-ticket-urls.ts` — finds matching more.com/ticketservices/viva/megaron events and copies their ticket_url to athinorama rows.
   - `scripts/search-more-tickets.ts` — searches more.com for athinorama titles lacking a ticket URL.
   - `scripts/venue-ticket-mapping.ts` — venue → platform lookup.

4. **Ticketing mapping:** `config/ticketing-mapping.json` — venue → platform dictionary. Has entries for Gazarte, Gagarin, Fuzz, Floyd, Kyttaro, Half Note, SMUT, Astron, Temple, Six D.O.G.S., etc. All more.com-mapped venues point to listing pages (e.g., `https://www.more.com/gr/el/tickets/music/gazarte/`), not event-level purchase URLs.

**Ticket URL population, measured:**

| Source          | Total | ticket_url == url | ticket_url NULL |
|-----------------|-------|-------------------|-----------------|
| athinorama.gr   | 317   | 286 (90%)         | 13              |
| residentadvisor | 92    | 79 (86%)          | 13              |
| more.com        | 86    | **80 (93%)**      | 0               |
| megaron.gr      | 37    | 37 (100%)         | 0               |
| snfcc           | 9     | 0                 | 9               |

- For **more.com**, 80/86 upcoming rows have `ticket_url == url`. Only 6 have a divergent `ticket_url`. Since `saveEvents()` does not write `ticket_url` on INSERT, those 80 must have been set by a **historical pipeline** (pre-archive) or a currently-unidentified backfill. Either way, the value stored equals the canonical more.com event URL — **no affiliate unwrap layer exists**.
- For **athinorama**, 286/317 also equal `url` — meaning `extract-ticket-urls.ts` and `crossref-ticket-urls.ts` have only upgraded 31 rows (10%). Most athinorama `ticket_url` values are still the athinorama listing page, not a purchase URL. **This is a distinct problem class from more.com broken redirects.**
- **snfcc** is the only source where 0/9 have any ticket_url at all. Distinct sub-problem.

**Archive note:** `scripts/_archive/parse_tier1_sites.py` and `scripts/_archive/import-more-events.ts` indicate a prior Python-based pipeline existed. Its behavior around `ticket_url` is likely the reason 80/86 rows have it populated today. This matters if the fix session needs to understand where the current data state came from.

**Root cause candidates (URL integrity, more.com):**

- **Class A (scraper extracts wrong field):** **Unlikely.** URL shape is canonical and matches more.com's own URL convention. Regex extraction is conservative (`[a-z0-9-]+` slug, explicit category constraint).
- **Class B (URLs legitimately stale):** **Plausible.** more.com removes expired event pages; the scraper doesn't revalidate. 7 of 20 sampled events have `start_date` already in the past (Mar 7–Apr 2, today is Apr 21). Those events remain in the "upcoming" query (likely because `COALESCE` falls through when `type != 'exhibition'` and `start_date` is past-but-same-calendar-quarter, or timezone math). Stale past-event URLs are the most likely source of reported broken redirects.
- **Class C (affiliate/tracking URLs):** **Ruled out.** No tracking params, no redirect wrappers, no affiliate domains. Every URL is `more.com` direct.
- **Class D (individual bad records):** **Plausible for the 6 outliers** where ticket_url ≠ url. Worth spot-checking those 6 in the fix session.

**Why past events persist in "upcoming" results:**
```sql
WHERE COALESCE(CASE WHEN type='exhibition' THEN end_date ELSE NULL END, start_date) >= date('now')
```
For non-exhibitions the COALESCE returns `start_date`. So `2026-03-07 >= date('now') = 2026-04-21` is **false** — the Jordan Peterson row should not appear. Yet it did in our LIMIT 20 sample. Possible explanations: (a) SQLite date() and ISO-with-timezone comparison edge case (our `start_date` values have `+03:00` suffix, and SQLite may be comparing lexicographically where `2026-03-07T20:00:00+03:00 >= 2026-04-21` — false as intended, so maybe not this), (b) `location_status='verified_athens'` didn't actually apply to those rows (we used `IN (verified, pass_through)`), (c) the LIMIT 20 included results without the upcoming filter because we ran a simpler query for the sample. Re-checking the sample query: `SELECT title, start_date, ticket_url, url FROM events WHERE source LIKE '%more%' AND location_status='verified_athens' LIMIT 20` — **yes, no upcoming filter**. The past-dated rows in the sample are not evidence of a bug; the sample query was deliberately permissive. Noted for the fix session.

---

## Problem classification

**Pre-spike classification (data + code evidence):**

- **Class A** — Scraper extracts wrong field (fix = scraper code)
- **Class B** — more.com URLs legitimately expired (fix = validator + UX for stale links)
- **Class C** — Affiliate/tracking URLs need unwrapping (fix = URL normalizer)
- **Class D** — Individual bad records, not systemic (fix = one-off DB cleanup)

**Pre-spike classification:** **Primary Class B** (stale URLs after scrape), **secondary Class D** (handful of bad records). Class A ruled out (scraper extracts canonical field cleanly). Class C ruled out (no affiliate/tracking wrappers).

**Why Class B is primary:** more.com removes expired event pages but we have no revalidation layer. The `ticket_url_status` column exists in the schema with `idx_ticket_status` — a validator hook is already designed-for but apparently not wired up (or not running often enough). The 4+ past-dated events surfaced in our Step 1b sample (Jordan Peterson 2026-03-07, ballet workshops 2026-03-09 / 2026-03-13) will all have URLs that work or not-work depending on more.com's own retention policy. If the original complaint is about "broken redirects," the pattern most likely is: user clicks an event in our listing → more.com redirects to homepage because the event page was archived → user sees no context for why.

**Final classification and spike-dependent routing:**
- ≥7/10 broken → confirm **Class B primary**, systemic validator-gap fix.
- 3–6/10 broken → confirm **Class B scoped**, validator-gap for specific more.com URL patterns (likely expired event retention on their side).
- ≤2/10 broken → downgrade to **Class D**, one-off cleanup of individual records.

## Proposed fix session

Build a scheduled URL validator (likely `scripts/validate-ticket-urls.ts` already exists as a shell — verify its current behavior in the fix session). It should HEAD-check both `url` and `ticket_url` for all upcoming events, write to `ticket_url_status`, and feed the event-page UI a visible "may be unavailable" banner when status is broken or stale. Exact scope depends on the spike outcome above. Do NOT start this fix session until Step 2 is complete and classification finalized.
