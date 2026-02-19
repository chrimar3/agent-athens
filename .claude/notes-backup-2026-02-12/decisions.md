# Architecture Decisions

Accumulated decisions made during Agent Athens development.

## Database

| Decision | Why | Date |
|----------|-----|------|
| Use SQLite with Bun's built-in support | Zero dependencies, fast reads, file-based backup | Initial |
| Store exhibitions with end_date | Exhibitions run for weeks/months, need date ranges | 2026-02 |
| Use `cleanupOldEvents` with exhibition-aware logic | Exhibitions should stay visible until end_date passes | 2026-02 |

## Scraping

| Decision | Why | Date |
|----------|-----|------|
| Use Puppeteer for protected sites | Onassis/Benaki have bot protection, need browser rendering | 2026-02 |
| Keep scrapers per-source, not unified | Each source has unique structure; isolation prevents cascading failures | Initial |
| Fall back to known events when scraping fails | Better to show stale data than no data | 2026-02 |
| Consolidate all 10 sources in scrape-all.ts | Single master orchestrator ensures consistent pipeline; sources run independently but share same adapter pattern | 2026-02 |
| Use more.com as primary aggregator (not viva.gr) | more.com aggregates ALL viva.gr events plus many other sources; single source reduces duplication and API calls | 2026-02 |

### Active Scraper Sources (10 total)

| Source | Type | Notes |
|--------|------|-------|
| more.com | Aggregator | Primary source - aggregates viva + others |
| athinorama.gr | Aggregator | Local listings magazine |
| clubber.gr | Nightlife | Club events and DJ nights |
| ticketservices.gr | Tickets | Concert/theater ticket sales |
| halfnote.gr | Venue | Jazz club - iCal feed |
| residentadvisor | Nightlife | Electronic music events |
| megaron.gr | Venue | Athens Concert Hall - classical |
| snfcc | Venue | Stavros Niarchos Foundation |
| onassis | Venue | Onassis Stegi - cultural (Puppeteer) |
| benaki | Venue | Benaki Museum - exhibitions (Puppeteer) |

## Site Generation

| Decision | Why | Date |
|----------|-----|------|
| Generate combinatorial static pages | AI answer engines prefer direct URL hits | Initial |
| Category pages with curated slugs | User-friendly URLs like /concerts, /exhibitions | 2026-02 |
| Only show verified_athens + pass_through | Quality gate: reject unverified venues | Initial |

## Click Tracking

| Decision | Why | Date |
|----------|-----|------|
| Use Netlify Functions for /go/ redirect | Serverless, no backend to maintain | 2026-02 |
| Store clicks in Netlify Blobs | Built-in, free tier, persists automatically | 2026-02 |

## Venue Management

| Decision | Why | Date |
|----------|-----|------|
| Store multiple variations per venue | Scraped names vary wildly (HTML entities, accents, addresses) | 2026-02 |
| Batch venue review workflow | Plan analysis → config updates → filter rerun → verify | 2026-02 |
| Include HTML entity variants | Scrapers often return `&#171;` instead of `«`, need both | 2026-02 |
| Include address-appended variants | Some sources return "Venue, Street 123, Αθήνα, Greece" | 2026-02 |

## Time Enrichment (2026-02)

| Decision | Why | Date |
|----------|-----|------|
| Two-phase time extraction | Main scrape stays fast; time fetch is resumable/retryable independently | 2026-02 |
| Skip more.com in enrich-time.ts | more.com requires JavaScript rendering (Puppeteer) - time should be extracted at scrape time | 2026-02 |
| Non-fatal enrichment phase | Pipeline continues if enrichment fails (Article VII) | 2026-02 |
| Store both time_doors and time_source | Know where time came from for debugging; support scraped_listing vs scraped_detail | 2026-02 |
| Type-aware time validation | Log suspicious times outside expected ranges without rejecting (concerts 17-23, dj_set 21-06) | 2026-02 |

### Source-Specific Time Patterns

| Source | Pattern | Notes |
|--------|---------|-------|
| athinorama.gr | `startTime="21:00"`, `<time datetime>`, Greek PM format (`8.30 μ.μ.`) | Multiple fallback patterns needed |
| ticketservices | `data-time='20:30'` attribute | Single reliable pattern |
| more.com | JSON-LD startDate | **Requires Puppeteer** - not in enrich-time.ts |

### Time Backfill Session (2026-02-11)

**Problem:** more.com time coverage was 4.5% (6/133) because scraper WHERE clause only targeted events needing prices.

**Solutions implemented:**
1. Added `OR time_doors IS NULL` to WHERE clause (line 397) - now processes events needing time even if price exists
2. Added regex fallback for malformed JSON-LD - some pages have unescaped quotes (e.g., `"name": "Unwound "SCAM'..."`) that break JSON.parse
3. Extracted time from `start_date` field for events with embedded ISO time (e.g., `2026-02-13T20:00:00+03:00`)

**Result:** more.com time coverage 4.5% → 94.7% (6 → 126/133 events)

**Remaining 7 events:** Pages have no JSON-LD `startDate` field at all - truly missing data at source.

### Time Coverage Fix Session (2026-02-12 continued)

**Problem:** Only 40% of events had time data because `saveEvents()` in scrape-all.ts didn't include `time_doors` column.

**Fixes implemented:**
1. Added `time_doors` and `time_source` to `saveEvents()` INSERT and ON CONFLICT UPDATE
2. Fixed residentadvisor scraper: `time` → `time_doors`, added missing columns
3. Verified clubber.gr and halfnote already extract time from iCal

**Results:**

| Source | Before | After |
|--------|--------|-------|
| residentadvisor | 0% | 95% |
| halfnote | 0% | 100% |
| clubber.gr | 0% | 68.2% |
| **Overall** | **40%** | **58.5%** |

**Remaining gaps:**
- athinorama.gr (36.5%) - relies on enrichment, no time in listing pages
- clubber.gr (68.2%) - 28 existing events need re-scrape
- megaron/snfcc/onassis/benaki (0%) - exhibitions, time less critical

### Future Work

- [x] ~~Update scrape-more-enhanced.ts to save extracted time to time_doors column~~ (done)
- [x] ~~Backfill time for more.com events with prices~~ (done - 85.8% coverage)
- [x] ~~Fix saveEvents() to include time_doors~~ (done)
- [x] ~~Fix residentadvisor scraper time column~~ (done)
- [ ] Improve ticketservices coverage (currently 72.7% has time)
- [ ] Consider adding time extraction to athinorama listing scraper

## Venue Review Batch Session (2026-02-12)

### Problem
89 unverified venues blocking ~200+ events from showing on site.

### Solution
Batch-processed venue whitelist based on `docs/VENUE-REVIEW-LIST.md`:
1. Added 65+ new Athens venues to `config/athens-venues.json`
2. Added TGI Fridays to problematic entries (restaurant, not cultural venue)
3. Used LIKE pattern matching to handle curly quote variations (`Lib'ro` vs `Lib'ro`)

### Results

| Metric | Before | After |
|--------|--------|-------|
| Verified Athens | 830 | 917 |
| Unverified | 89 | 0 |
| Events on site | 841 | 928 |

### Key Learnings

| Issue | Solution |
|-------|----------|
| Curly quotes in venue names | Use `LIKE '%pattern%'` or hex matching for DB updates |
| HTML entities in venue names | Add both `«»` and `&#171;&#187;` variations |
| Many small Athens theaters | Batch add from authoritative list rather than one-by-one review |
