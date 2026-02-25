# agent-athens: Scraping Pipeline Documentation
## Source Inventory, Field Mapping & Quality Reference

*Version 1.0 — February 2026*
*Status: Complete — based on production codebase analysis*

---

## How This Document Works

This is the reference for anyone working on the agent-athens scraping pipeline. It covers:

1. **What we scrape** — every source, what it gives us, how reliable it is
2. **How scraped data maps to our database** — field transformations and edge cases
3. **Source tiers** — which sources we trust for what
4. **Known gaps** — event types we miss and why
5. **Quality indicators** — per-source reliability for dates, prices, names, freshness

The enrichment writer receives the output of this pipeline. The better the pipeline, the less guesswork in enrichment. Every field that arrives clean is a field the writer doesn't have to research manually.

---

# SECTION 1: SOURCE INVENTORY

## Current Production Stats (February 2026)

| Metric | Value |
|--------|-------|
| Total events in DB | 957 |
| Events shown on site | 890 (93%) |
| Active scraper sources | 16 |
| Verified Athens venues | 241 |
| Enriched descriptions | 170 (18%) |
| Events with images | 598 (62.5%) |
| Events with ticket URLs | 843 (88%) |

## 1A. Event Listing Sources

### Athinorama (athinorama.gr)

| Field | Details |
|-------|---------|
| **URL** | athinorama.gr |
| **Language** | Greek |
| **Publish cycle** | Weekly (Thursdays), with daily updates for some sections |
| **Coverage** | Broadest Athens cultural listings — concerts, theater, cinema, exhibitions, clubs |
| **Scrape frequency** | Daily (configured in `scrape-list.json`) |
| **Scrape method** | curl (direct HTTP, easy difficulty) |
| **Pages scraped** | `/music/guide`, `/theatre/guide`, `/cinema/guide` |
| **Fields provided** | Title, date, time (extracted via detail page scrape), venue, genre, price, description, event URL |
| **Current volume** | 437 upcoming events (45.7% of all events — largest single source) |
| **Reliability** | High for event existence and dates. Greek-language dates need parsing. 95% unique events per scrape run. |
| **Strengths** | Most comprehensive single source for Athens cultural events. Covers event types other sources miss (theater, cinema, exhibitions). Long editorial history. Time extraction recently improved to 95% success rate. |
| **Weaknesses** | Greek only — all fields need transliteration handling. Published weekly so can miss last-minute announcements. Marketing copy in descriptions. |
| **Auth/access** | Public scrape via curl. User-agent spoofing required (Chrome UA). 2-second delay between requests. 30-second timeout. Max 2 retries. |
| **Importer** | `import-athinorama-events.ts` |
| **Notes** | Primary source for non-electronic events. The Thursday publish cycle means Friday events may appear with <24hr lead time. Recently added time extraction from detail pages (scripts/enrich-time.ts) achieving 95% coverage. |

---

### musicheaven.gr

| Field | Details |
|-------|---------|
| **URL** | musicheaven.gr |
| **Language** | Greek |
| **Publish cycle** | Continuous — articles published as events are announced |
| **Coverage** | Greek music — concerts, live music, artist profiles |
| **Scrape frequency** | Not currently automated — used as manual research source |
| **Fields provided** | Artist profiles, biographical data, discography, concert announcements |
| **Reliability** | High for artist biographical data; medium for event dates (editorial lag) |
| **Strengths** | Greek artist profiles — often the best (or only) source for biographical information on Greek musicians. Artist pages useful for entity resolution research. Source priority #4 for Greek artist research per entity resolution workflow. |
| **Weaknesses** | Not automated in pipeline. Coverage gaps for non-Greek artists. Editorial focus means event listings are secondary to artist profiles. |
| **Auth/access** | Public website. No scraper currently implemented — used for manual enrichment research. |
| **Notes** | Valuable for entity research (artist profiles) beyond just event listings. Would need a dedicated scraper to automate. Currently used only during manual enrichment sessions. |

---

### Resident Advisor Athens (ra.co)

| Field | Details |
|-------|---------|
| **URL** | ra.co/events/gr/athens |
| **Language** | English (primarily) |
| **Publish cycle** | Continuous — events listed as promoters submit them |
| **Coverage** | Electronic music events — clubs, DJ sets, live electronic, festivals |
| **Scrape frequency** | Daily (configured in `scrape-list.json`) |
| **Scrape method** | GraphQL API (`https://ra.co/graphql`) |
| **Fields provided** | Title, date, time (doors + start), venue (with RA venue ID), lineup (artist names, often with RA artist IDs), price (~50% coverage), ticket link, promoter, description, genre tags |
| **Current volume** | 90 upcoming events |
| **Reliability** | High for electronic events. Structured data. Artist names in Latin characters. Prices available for ~50% of events. |
| **Strengths** | Best-structured data of any source. Artist IDs enable entity matching. International standard for electronic music listings. Consistent Latin-character artist names. GraphQL provides clean structured responses. |
| **Weaknesses** | Electronic only — no jazz, rebetiko, rock, theater, conferences. Promoter-submitted so coverage depends on whether Athens promoters use RA. Smaller Athens promoters may not list here. Requires timezone conversion. |
| **Auth/access** | GraphQL API. Standard HTTP headers with Chrome UA. 2-second delay between requests. |
| **Importer** | `scrape-residentadvisor.ts` |
| **Notes** | The cleanest source for field mapping — minimal transformation needed. RA artist IDs are a potential entity resolution anchor for electronic artists. Same venues as clubber.gr but with structured pricing data. |

---

### Clubber.gr

| Field | Details |
|-------|---------|
| **URL** | clubber.gr/events |
| **Language** | Greek (primarily), some English |
| **Publish cycle** | Continuous |
| **Coverage** | Athens nightlife and electronic music. Main scene hub since 2005. |
| **Scrape frequency** | Weekly (configured in `scrape-list.json`) |
| **Scrape method** | iCal feed (`clubber.gr/events/?ical=1`) |
| **Fields provided** | Title, date, time (from iCal DTSTART/DTEND), venue, description, event URL |
| **Current volume** | 49 upcoming events |
| **Reliability** | High for event existence; medium for time data (67% have times, stale events need refresh). 100% unique events — covers venues not in other sources (Astron, Dybbuk, Romantso). |
| **Strengths** | Broadest Athens electronic/nightlife coverage. More Athens-specific than RA — catches events RA misses. iCal format provides structured data. Venues like Astron, Dybbuk, Romantso appear only here. |
| **Weaknesses** | iCal parsing can lose time data for older/stale events. Weekly scrape means some events appear late. No pricing data in iCal feed. Seasonal reduction May-September (indoor clubs close). |
| **Auth/access** | Public iCal feed. No authentication required. Standard fetch. |
| **Importer** | `import-clubber-events.ts` |
| **Notes** | Overlap with RA for electronic events but catches Athens-specific events RA doesn't. Also monitor @clubber.gr Instagram for venue closure/opening signals. Main scene hub since 2005. |

---

### thisisathens.org

| Field | Details |
|-------|---------|
| **URL** | thisisathens.org |
| **Language** | English |
| **Publish cycle** | Weekly newsletter + continuous website updates |
| **Coverage** | Curated Athens events — culture, food, nightlife, exhibitions. Best official English coverage. |
| **Scrape frequency** | Via newsletter ingestion (`newsletter@thisisathens.org`). Subjects: "This Week in Athens", "Athens Events". Priority: 10 (highest). |
| **Fields provided** | Title, date, time, venue, type, genre, price, description — extracted by `this-is-athens.ts` newsletter parser |
| **Reliability** | High for curated accuracy. Lower volume (curated selection). English-language names reduce transliteration issues. |
| **Strengths** | English-language — artist names already in Latin characters. Curated (less noise). Covers event types beyond music. Official Athens tourism source. |
| **Weaknesses** | Low volume due to curation filtering. Newsletter-dependent — no direct scraper. May miss smaller or niche events. |
| **Auth/access** | Email newsletter subscription to `agentathens.events@gmail.com`. Parsed via IMAP ingestion pipeline. |
| **Notes** | Good supplementary source, unlikely to be primary for any event type due to curation filtering. Parser uses HTML first, falls back to plain text. |

---

### lu.ma (Athens events)

| Field | Details |
|-------|---------|
| **URL** | lu.ma (filter: Athens + relevant categories) |
| **Language** | English (primarily) |
| **Publish cycle** | Continuous — event organizer submitted |
| **Coverage** | Community-organized events — tech meetups, startup events, creative gatherings |
| **Scrape frequency** | Weekly via AI/Tech scraper (`scripts/scrape-ai-tech.ts` — Puppeteer source) |
| **Fields provided** | Title, date, time, venue/address, description, RSVP link, organizer, capacity |
| **Reliability** | Medium — organizer-submitted, sometimes placeholder dates. RSVP-driven so event existence is confirmed. |
| **Strengths** | Best source for Athens tech/startup community events. Captures events that don't appear on any other platform. RSVP-driven so attendee data exists. |
| **Weaknesses** | Low volume for Athens specifically. Events may have incomplete venue details. Requires Puppeteer (browser automation). |
| **Auth/access** | Public website. Scraped via Puppeteer in `scrape-ai-tech.ts`. Requires browser automation for dynamic content. |
| **Notes** | Primary source for meetup-type tech events. Filtered by Athens + tech keywords. Part of the AI/Tech multi-source scraper. |

---

### Meetup.com (Athens tech)

| Field | Details |
|-------|---------|
| **URL** | meetup.com (Athens groups) |
| **Language** | Mixed Greek/English |
| **Publish cycle** | Continuous |
| **Coverage** | Community meetups — tech, professional, hobby |
| **Scrape frequency** | Weekly via AI/Tech scraper (`scripts/scrape-ai-tech.ts` — Puppeteer source) |
| **Current volume** | 14 upcoming events |
| **Fields provided** | Title, date, time, venue/address, description, RSVP link, organizer, group name |
| **Reliability** | Medium — many inactive groups. Signal-to-noise requires keyword filtering. |
| **Strengths** | Captures recurring community events. Group structure useful for identifying regular meetup series. |
| **Weaknesses** | Many inactive Athens groups. Signal-to-noise ratio requires aggressive keyword filtering (AI/ML/tech keywords only). Requires Puppeteer. |
| **Auth/access** | Public website. Scraped via Puppeteer. No API key used (public scrape). |
| **Notes** | Filtered by AI/tech keyword matching. Exclusion keywords prevent false positives (pub crawls, yoga, cooking, etc.). |

---

## 1B. Ticketing Platform Sources

### more.com (formerly Viva.gr)

| Field | Details |
|-------|---------|
| **URL** | more.com |
| **Language** | Greek, some English |
| **Coverage** | Main ticketing platform — Gazarte, Gagarin, Fuzz, Floyd, major concerts, theater, sports |
| **Scrape frequency** | Daily (configured in `scrape-list.json`) |
| **Scrape method** | Playwright (browser automation) with curl HTTP/1.1 fallback for problematic pages |
| **Pages scraped** | `/gr/el/tickets/`, `/gr/el/tickets/music/`, `/gr/el/tickets/theater/`, `/gr/el/tickets/sports/` |
| **Current volume** | 139 upcoming events |
| **Fields provided** | Title, date(s), time (from JSON-LD startDate — 94.7% coverage), venue, price (tiered — early bird, presale, door), ticket link, description, sometimes artist bio |
| **Reliability** | Highest for price and date accuracy — this is the transactional source. 98% unique events per scrape. |
| **Strengths** | Authoritative for pricing (this is where tickets are sold). Event dates are transaction-confirmed. Multi-tier pricing visible. JSON-LD provides structured time data. Comprehensive coverage — aggregates many smaller platforms. |
| **Weaknesses** | HTTP/2 issues require curl fallback with HTTP/1.1 forced. Playwright required for JavaScript-rendered content. 1-second delay between requests for rate limiting. Sports events need filtering out via `event-scope.json`. |
| **Auth/access** | Public scrape via Playwright + curl fallback. Chrome UA required. 1-second delay. 30-second timeout. Max 2 retries with exponential backoff. |
| **Importer** | `import-more-events.ts` |
| **Notes** | Formerly Viva.gr — important for historical link maintenance. If an old description references viva.gr ticket links, they may redirect or break. Primary source for pricing accuracy. Winner in dedup resolution (highest source priority). |

---

### TicketServices.gr

| Field | Details |
|-------|---------|
| **URL** | ticketservices.gr |
| **Language** | Greek (requires windows-1253 encoding handling) |
| **Coverage** | Festivals (Athens & Epidaurus Festival), major cultural events, concerts, theater, classical |
| **Scrape frequency** | Daily (configured in `scrape-list.json`) |
| **Scrape method** | Bun native fetch (`scrape-ticketservices.ts`) |
| **Pages scraped** | `/en/LiveConcerts/` |
| **Current volume** | 122 upcoming events |
| **Fields provided** | Title, date, time (from `data-time` attribute — 72.9% coverage), venue, price, ticket link, description |
| **Reliability** | High for date accuracy (transactional). Greek character encoding (windows-1253) requires careful handling. 94 confirmed Athens events per typical scrape. |
| **Strengths** | Authoritative for festival ticketing (Lycabettus Open Air, Herod Atticus). Good time data from structured `data-time` attributes. |
| **Weaknesses** | Narrower coverage than more.com. Windows-1253 encoding requires special handling. Time data at 73% (lower than other ticketing sources). |
| **Auth/access** | Public scrape via Bun fetch. Standard Chrome UA. 2-second delay. 30-second timeout. |
| **Notes** | Handles Lycabettus/Herod Atticus summer events. Tier 2 source — authoritative for festival events but secondary to more.com for general ticketing. |

---

## 1C. Venue-Direct Sources

### SNFCC (Stavros Niarchos Foundation Cultural Center)

| Field | Details |
|-------|---------|
| **URL** | snfcc.org/el/events and /el/exhibitions |
| **Language** | Greek |
| **Scrape frequency** | Weekly |
| **Scrape method** | Puppeteer (site blocks direct requests) |
| **Fields provided** | Title, description, start_date, end_date, type (exhibition/concert/performance/workshop), genres, venue_name, URL, price (always "open" — SNFCC is free admission) |
| **Current volume** | Not currently yielding events (scraper running but SNFCC may have changed page structure) |
| **Reliability** | High when working — Tier 1 venue-direct data. |
| **Auth/access** | Puppeteer required (bot protection). Chrome path: `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`. 30-second page load timeout. 2-second delay. |
| **Exhibition-specific fields** | `opening_hours` (JSON: 6:00-24:00 daily), `closed_days`, `permanent_collection` |
| **Notes** | All SNFCC events are `price_type: open`. Venue name: "Κέντρο Πολιτισμού Ίδρυμα Σταύρος Νιάρχος (ΚΠΙΣΝ)". Pre-verified Athens. Known exhibitions added as fallbacks if scraper fails. |

---

### Onassis Stegi

| Field | Details |
|-------|---------|
| **URL** | onassis.org/el/whats-on, /onassis-stegi, /el/exhibitions |
| **Language** | Greek |
| **Scrape frequency** | Daily |
| **Scrape method** | Puppeteer (bot protection) |
| **Current volume** | 6 upcoming events |
| **Fields provided** | Title, description, start_date, end_date, URL, image_url, venue_name ("Onassis Stegi"), price_type ("with-ticket") |
| **Venue details** | Address: Λεωφ. Συγγρού 107. Neighborhood: Κουκάκι. Hours: Mon closed, Tue-Sun 11:00-20:00 |
| **Notes** | Known exhibitions added as fallbacks (e.g., Yorgos Lanthimos: Photographs). Pre-verified Athens. |

---

### Benaki Museum

| Field | Details |
|-------|---------|
| **URL** | benaki.org/index.php?option=com_landings&view=search&section=events |
| **Language** | Greek |
| **Scrape frequency** | Weekly |
| **Scrape method** | Puppeteer (dynamic loading) |
| **Current volume** | 2 upcoming events |
| **Fields provided** | Title, description, start_date, end_date, URL, venue_key (determines which of 3 buildings) |
| **Three venues** | Greek Culture (Κολωνάκι), Piraeus 138 (Γκάζι), Islamic Art (Κεραμεικός) — each with separate hours |
| **Notes** | Known exhibitions added as fallbacks. Low time data (0% — exhibitions, less critical). Pre-verified Athens. |

---

### Megaron - Athens Concert Hall

| Field | Details |
|-------|---------|
| **URL** | megaron.gr/el/events |
| **Language** | Greek |
| **Scrape frequency** | Daily |
| **Scrape method** | Direct HTTP (simple HTML parsing via curl) |
| **Current volume** | 65 upcoming events |
| **Fields provided** | Title (HTML entity decoded), start_date (from `data-date` attribute), time (default 20:30 if not in source — 93.8% coverage), URL, type (detected from category), venue_name ("Μέγαρο Μουσικής Αθηνών"), genres (['classical']) |
| **Reliability** | High — venue-direct data. HTML parsing splits by class `tease tease--event-calendar`. Deduplicates by URL + date. |
| **Auth/access** | Public HTTP. Standard Chrome UA. 2-second delay. 1-second between events API calls with 3 retries. |
| **Notes** | Venue: address "Βασιλίσσης Σοφίας & Κόκκαλη", neighborhood "Kolonaki". Direct ticket sales at megaron.gr (no intermediary). |

---

### Half Note Jazz Club

| Field | Details |
|-------|---------|
| **URL** | halfnote.gr |
| **Language** | English/Greek |
| **Scrape frequency** | Weekly |
| **Scrape method** | iCal feed (`halfnote.gr/events/?ical=1`) |
| **Current volume** | 22 upcoming events |
| **Fields provided** | Title, date, time (100% coverage from iCal duration), venue, description (includes prices like "€12-€20") |
| **Seasonal** | October-May only (closed June-September). Pre-verified Athens venue (Mets neighborhood). |
| **Notes** | Prices embedded in description text — extracted by price acquisition chain. Reservations essential (door policy). Direct purchase at halfnote.gr. |

---

## 1D. AI/Tech Multi-Source Scraper

**File:** `scripts/scrape-ai-tech.ts`

This is a meta-scraper that checks multiple sources for tech/AI events in Athens.

| Sub-Source | Method | Check Frequency |
|------------|--------|-----------------|
| starttech.vc | RSS feed + JSON-LD extraction | Weekly |
| greeksin.ai | Direct HTTP | Monthly (annual conference) |
| devoxx.gr | Direct HTTP | Monthly (annual conference) |
| archimedesai.gr | Direct HTTP | Monthly |
| Eventbrite Athens | Puppeteer | Weekly |
| Meetup.com Athens | Puppeteer | Weekly |
| Lu.ma Athens | Puppeteer | Weekly |
| Known recurring events | Manual list | Weekly |

**Keyword filtering (must match at least one):**
- Core AI/ML: `ai`, `machine learning`, `deep learning`, `data science`, `llm`, `nlp`, `generative ai`, `neural`, `transformer`, `gpt`, `computer vision`, `reinforcement learning`
- Specific communities: `python`, `devops`, `cloud computing`, `kubernetes`, `docker`, `software engineering`, `full stack`
- Known communities: `mindstone`, `devoxx`, `greeks in ai`, `infraai`, `disrupt ai`, `vibe coding`

**Exclusion keywords:** `pub crawl`, `escape room`, `yoga`, `cooking`, `wine tasting`, `design open`, `leadership conference`, `angular meetup`, `ux meetup`

**Expected yield:** ~70 events per full run

**Execution:**
```bash
bun run scripts/scrape-ai-tech.ts              # Discover + save
bun run scripts/scrape-ai-tech.ts --dry-run    # Discover only
bun run scripts/scrape-ai-tech.ts --no-browser # Skip Puppeteer sources
```

### Startup/Conference Sources (monitored by AI/Tech scraper or manually)

| Source | URL | Check Frequency | Notes |
|--------|-----|-----------------|-------|
| panathenea.org | panathenea.org | Monthly (weekly from March) | Panathēnea Festival |
| doerssummit.com | doerssummit.com | Monthly (weekly from August) | Doers Summit Athens |
| theegg.gr/en | theegg.gr/en | Monthly | egg accelerator events |
| eurobank.gr press | eurobank.gr/en/group/grafeio-tupou | Monthly | Press releases about egg events |
| endeavor.org.gr | endeavor.org.gr/events | Monthly | Endeavor Greece events |
| startupgrind.com/athens | startupgrind.com/athens | Monthly | Fireside chats (irregular) |
| thefoundation.gr | thefoundation.gr | Monthly | Found.ation workshops/demos |
| orangegrove.eu | orangegrove.eu | Monthly | Dutch Embassy-backed workshops |
| vestbee.com | vestbee.com/events-list | Monthly | European startup event aggregator (filter: Athens/Greece) |
| hellenic.org | hellenic.org/all-events | Monthly | Hellenic Innovation Network (diaspora) |
| elevategreece.gov.gr | elevategreece.gov.gr | Quarterly | Government startup programs |

**Note:** Most startup/conference sources are monitored manually on a schedule rather than scraped automatically. Events are fewer and higher-value — a missed meetup costs less than a missed festival.

---

## 1E. Newsletter/Email Sources

**Ingestion pipeline:** Gmail IMAP (`agentathens.events@gmail.com`) → parse → import to DB

**10 configured newsletter sources** (from `config/newsletter-formats.json`):

| ID | Name | Sender | Parser | Priority |
|----|------|--------|--------|----------|
| this-is-athens | This Is Athens | newsletter@thisisathens.org | this-is-athens.ts | 10 (highest) |
| megaron | Megaron Concert Hall | info@megaron.gr | megaron.ts | 9 |
| gazarte | Gazarte | newsletter@gazarte.gr | gazarte.ts | 8 |
| snfcc | SNFCC | newsletter@snfcc.org | snfcc.ts | 8 |
| six-dogs | Six D.O.G.S | newsletter@sixdogs.gr | six-dogs.ts | 8 |
| aaathens-art | AAA Athens Art | chiaracrespi@aaathens.art | aaathens-art.ts | 8 |
| athinorama | Athinorama | weekly@athinorama.gr | athinorama.ts | 5 |
| more-com | More.com Events | newsletter@more.com | more-com.ts | 5 |
| viva-gr | Viva.gr Events | newsletter@viva.gr | viva-gr.ts | 5 |
| lifo-guide | Lifo Guide | guide@lifo.gr | lifo-guide.ts | 10 |

## 1F. Social Media Sources

### Venue Instagram Accounts

| Field | Details |
|-------|---------|
| **Coverage** | Most reliable for individual venue announcements — lineup changes, cancellations, schedule updates |
| **Scrape frequency** | Manual monitoring — no automated scraper |
| **Fields provided** | Varies wildly — image posts with event details, story announcements, lineup graphics |
| **Reliability** | Highest for venue-specific information (direct from source). Lowest for structured data extraction. |
| **Strengths** | First to announce. Most current. Venue's own voice. Catches last-minute changes. |
| **Weaknesses** | Unstructured — event details embedded in images, Greek text in graphics, stories ephemeral (24hr). No API for stories. Manual extraction often required. |
| **Key accounts monitored** | Individual venue accounts (no centralized list — venues are checked during enrichment sessions) |
| **Notes** | Effectively a manual Tier 1 source. The challenge is automation. Enrichment-knowledge Section 13 notes "Individual venue Instagram — most reliable for announcements." |

---

### @clubber.gr (Instagram)

| Field | Details |
|-------|---------|
| **Coverage** | Scene-wide nightlife announcements, venue openings/closures |
| **Use** | Signal detection — not primary event data source |
| **Notes** | Main scene hub since 2005. Monitor for venue status changes, new venue announcements, scene shifts. |

---

### @athens.rave.culture (Instagram)

| Field | Details |
|-------|---------|
| **Coverage** | Underground electronic events, 24K followers |
| **Use** | Catches events that don't appear on RA or clubber.gr |
| **Notes** | Underground focus means this captures events at the margins of the formal listing ecosystem. |

---

# SECTION 2: FIELD MAPPING

## Canonical Database Fields

The events table has **51 columns**. Key fields for the scraping pipeline:

| DB Field | Type | Required | Source Priority | Notes |
|----------|------|----------|-----------------|-------|
| `id` | TEXT | Yes | Generated | MD5 hash of title\|date\|venue |
| `title` | TEXT | Yes | Any source | Cleanup: trim whitespace, decode HTML entities |
| `description` | TEXT | No | Any source | Short description from scraper |
| `full_description` | TEXT | No | Enrichment | Legacy enriched description |
| `full_description_en` | TEXT | No | Enrichment | English enriched (400-600 words) |
| `full_description_gr` | TEXT | No | Enrichment | Greek enriched (400-600 words) |
| `source_full_description` | TEXT | No | Scraper | Original scraper description (preserved) |
| `type` | TEXT | Yes | Inferred from keywords/source | See event types below |
| `genres` | TEXT | No | Source or enrichment | JSON array |
| `tags` | TEXT | No | Enrichment | JSON array (semantic taxonomy) |
| `start_date` | TEXT | Yes | Ticketing > listing > social | ISO 8601 format |
| `end_date` | TEXT | If multi-day | Same as start_date | For exhibitions and festivals |
| `time_doors` | TEXT | Preferred | Scrape detail > iCal > venue default | HH:MM 24-hour format |
| `time_peak` | TEXT | Optional | Enrichment writer | Main event start time |
| `time_source` | TEXT | No | Automatic | `scraped_listing` \| `scraped_detail` \| `enriched` |
| `venue_name` | TEXT | Yes | Any source | Must match to known venue in whitelist |
| `venue_address` | TEXT | No | Venue whitelist or scrape | Street address |
| `venue_neighborhood` | TEXT | No | Venue whitelist | Athens neighborhood name |
| `venue_lat` | REAL | No | Venue whitelist | Latitude |
| `venue_lng` | REAL | No | Venue whitelist | Longitude |
| `price_type` | TEXT | Yes | Ticketing > listing | `open` \| `with-ticket` \| `paid` \| `door` \| `tba` \| `donation` |
| `price_amount` | REAL | If ticketed | Ticketing source | Lowest standard tier (EUR) |
| `price_range` | TEXT | No | Source | e.g., "€15-25" |
| `price_advance` | REAL | No | Ticketing | Advance ticket price |
| `price_door` | REAL | No | Ticketing/venue default | Door/cash price |
| `price_source` | TEXT | No | Automatic | `direct` \| `crossref_ra` \| `venue_default` \| `unknown` |
| `ticket_url` | TEXT | If ticketed | Ticketing platform | Direct link to purchase |
| `ticket_url_status` | TEXT | No | Validation | `valid` \| `expired` \| `unverified` \| `generated` \| `door_only` |
| `url` | TEXT | No | Any source | Source event page URL |
| `source` | TEXT | Yes | Automatic | Scraper source ID |
| `image_url` | TEXT | No | og:image scrape | Event image URL |
| `image_source` | TEXT | No | Automatic | `scraped_listing` \| `scraped_detail` \| `backfill` \| `not_found` |
| `schema_json` | TEXT | No | Generated | Full Schema.org JSON-LD |
| `ai_context` | TEXT | No | Enrichment | JSON semantic tags (mood/audience/vibe) |
| `location_status` | TEXT | No | Filter pipeline | `verified_athens` \| `pass_through` \| `unverified` \| `rejected_non_athens` \| `problematic` |
| `needs_enrichment` | INTEGER | No | Automatic | 0=enriched, 1=needs work |
| `enriched_at` | TEXT | No | Automatic | Enrichment timestamp |
| `opening_hours` | TEXT | No | Scraper/venue config | JSON object for exhibitions |
| `closed_days` | TEXT | No | Scraper/venue config | "Monday" or "Monday, Tuesday" |
| `door_policy` | TEXT | No | Enrichment | Entry policy description |
| `is_cancelled` | INTEGER | No | Manual | 1 if cancelled |
| `dedup_protected` | INTEGER | No | Dedup pipeline | 1 if protected from dedup |
| `created_at` | TEXT | Yes | Automatic | ISO 8601 |
| `updated_at` | TEXT | Yes | Automatic | ISO 8601 |
| `scraped_at` | TEXT | No | Automatic | Scrape timestamp |

## Field Transformation Rules

### Date Parsing

Greek date formats encountered in scraping:

| Source Format | Example | Transform |
|---------------|---------|-----------|
| Greek month names (genitive) | "Σάββατο 1 Μαρτίου 2026" | Map: Ιανουαρίου→01, Φεβρουαρίου→02, Μαρτίου→03, Απριλίου→04, Μαΐου→05, Ιουνίου→06, Ιουλίου→07, Αυγούστου→08, Σεπτεμβρίου→09, Οκτωβρίου→10, Νοεμβρίου→11, Δεκεμβρίου→12 |
| Abbreviated Greek | "Σάβ 01/03" | Requires year inference (assume current year, or next year if month has passed) |
| ISO-ish | "2026-03-01" | Direct parse |
| Slash format (European) | "01/03/2026" | DD/MM/YYYY (European convention, NOT MM/DD) |
| Dot format | "15.01.2026" | DD.MM.YYYY |
| Range (Greek) | "27-29 Μαΐου 2026" | Parse as start_date + end_date |
| Range (Slash) | "15/01 - 30/03/2026" | Parse as start_date + end_date |
| Megaron `data-date` | `data-date="DD MM YYYY,"` | Split by space, reformat |
| iCal DTSTART | `20260301T200000` | Parse as ISO datetime |
| JSON-LD (more.com) | `"2026-03-01T20:00:00+02:00"` | Direct parse, extract time |

**Edge case — year rollover:** Events scraped in December for January dates. Always check whether the month has already passed in the current year.

**Edge case — exhibitions:** Use `end_date` for lifecycle, not `start_date`. See CLAUDE.md Tier 1 rules.

### Time Parsing

| Source Says | Likely Meaning | Maps To |
|-------------|----------------|---------|
| "Doors: 20:00" | Door opening time | `time_doors` |
| "Starts: 21:30" | Performance start time | `time_peak` (if door time also present) or `time_doors` (if only time given) |
| "22:00" (no label) | Ambiguous — could be doors or start | Default to `time_doors`, flag for enrichment writer |
| "From 23:00" | Door time for club events | `time_doors` |
| "8.30 μ.μ." | Greek PM format (add 12) | `time_doors` = "20:30" |
| "10 π.μ." | Greek AM format (no change) | `time_doors` = "10:00" |
| ISO `T20:00:00+03:00` | Explicit time with timezone | Extract to `time_doors` = "20:00" |
| iCal DTSTART `T200000` | iCal time component | Extract to `time_doors` = "20:00" |
| Megaron default | No time in source | Default to `time_doors` = "20:30" |

**Current time coverage:** 82.4% of upcoming events have `time_doors` or ISO time component.

**Critical:** Athens venues distinguish between doors, show start, and peak time. The venue intelligence database (`config/venue-intelligence.md`) has venue-specific timing patterns. When a source gives a single unlabeled time, cross-reference against known venue timing to infer what it means.

### Venue Name Matching

The pipeline must match scraped venue names to known venue slugs in `config/athens-venues.json` (127 venues with all variations). This is the most error-prone transformation.

| Scraped Name Variant | Should Match To | Slug |
|----------------------|-----------------|------|
| "Half Note Jazz Club" | Half Note Jazz Club | `half-note-jazz-club` |
| "Half Note" | Half Note Jazz Club | `half-note-jazz-club` |
| "Halfnote" | Half Note Jazz Club | `half-note-jazz-club` |
| "6 D.O.G.S" | Six D.O.G.S | `six-dogs` |
| "Six Dogs" | Six D.O.G.S | `six-dogs` |
| "6DOGS" | Six D.O.G.S | `six-dogs` |
| "Γκαζάρτε" | Gazarte | `gazarte` |
| "GAZARTE" | Gazarte | `gazarte` |
| "Στοά Αθανάτων" | Stoa Athanaton | `stoa-athanaton` |
| "Μέγαρο Μουσικής" | Μέγαρο Μουσικής Αθηνών | `megaron-mousikis` |
| "Athens Concert Hall" | Μέγαρο Μουσικής Αθηνών | `megaron-mousikis` |
| "Megaron International Conference Centre" | Μέγαρο Μουσικής Αθηνών | `megaron-mousikis` |
| "«Κάρολος Κουν»" | Θέατρο Κάρολος Κουν | (matched via variations) |
| "&#171;Κάρολος Κουν&#187;" | Θέατρο Κάρολος Κουν | (HTML entity variant) |
| "ΚΠΙΣΝ" | SNFCC | `snfcc` |
| "Stavros Niarchos Foundation" | SNFCC | `snfcc` |

**Variation types that must be captured:**
- English abbreviations / full names
- Full Greek names with AND without accents (scrapers may strip accents)
- Unicode special chars (`« »`, `–`, `—`)
- HTML entity equivalents (`&#171;` `&#187;` `&amp;`)
- Address-appended forms
- ALL CAPS variants
- Curly quotes vs straight quotes

**Unmatched venues:** When a scraped venue name doesn't match any known slug:
1. Set `location_status = 'unverified'` — event hidden from site
2. Store the raw name for review (`bun run scripts/review-venues.ts --list`)
3. Do NOT auto-create venue profiles — venue profiles require manual research
4. After adding to `config/athens-venues.json`, re-run `bun run scripts/filter-athens-only.ts`

### Artist Name Handling

| Source | Name Format | Transform Needed |
|--------|-------------|------------------|
| Resident Advisor | Latin characters, artist's preferred spelling | Minimal — use as canonical |
| Athinorama | Greek script | Transliterate per conventions in enrichment-knowledge Section 16 |
| more.com | Mixed — sometimes Greek, sometimes Latin, sometimes ALL CAPS | Normalize to Latin, fix capitalization |
| clubber.gr | Mixed Greek/English | Normalize to Latin |
| Half Note iCal | Usually Latin (jazz artists) | Minimal cleanup |
| Venue Instagram | Varies wildly — stylized, ALL CAPS, emojis | Manual cleanup often required |

**Entity matching:** After name normalization, run through entity lookup workflow. Match to existing slug if possible. If no match, flag as NEW_ARTIST.

### Price Normalization

| Source Says | Maps To | Notes |
|-------------|---------|-------|
| "Free" / "Ελεύθερη είσοδος" / "Δωρεάν" | `price_type: open`, `price_amount: 0` | |
| "€15" / "15€" | `price_type: with-ticket`, `price_amount: 15` | Use the standard/regular tier |
| "€10 presale / €15 door" | `price_type: with-ticket`, `price_amount: 10`, `price_door: 15` | Store both |
| "From €10" | `price_type: with-ticket`, `price_amount: 10` | |
| "€15-25" (range) | `price_type: with-ticket`, `price_amount: 15`, `price_range: "€15-25"` | Store floor of range |
| "Early bird €20, Regular €40" | `price_type: with-ticket`, `price_amount: 40` | Store regular price, NOT early bird |
| "Κατώτατη κατανάλωση" (minimum consumption) | `price_type: door` | Bouzoukia — flag for enrichment writer |
| No price listed | `price_type: tba` | Flag for price acquisition chain |

**Rule:** `price_amount` should reflect what a person walking up to the event on the day would typically pay. Not the cheapest tier that sold out months ago. Not the VIP package.

**Current price distribution:** 66% paid, 20% with-ticket, 8% TBA, 3.4% door, 2% open.

---

# SECTION 3: SOURCE TIER SYSTEM

## Tier 1: Primary Sources (Authoritative)

**Definition:** Sources where the data originates. First-party information from the entity that controls the event.

**Characteristics:**
- Data comes directly from the venue, promoter, or ticketing platform
- Transactional accuracy — prices are what you actually pay
- Dates are contractual (ticketing platforms don't list wrong dates)
- Updates propagate here first

**Tier 1 Sources:**
| Source | Authoritative For | Current Volume |
|--------|-------------------|----------------|
| more.com | Prices, dates, ticket links for major concerts | 139 events |
| TicketServices.gr | Prices, dates for festival events | 122 events |
| Resident Advisor | Electronic event listings, prices, lineup | 90 events |
| Athinorama | Broadest Athens cultural coverage | 437 events |
| Clubber.gr | Athens electronic/nightlife scene | 49 events |
| SNFCC (venue direct) | SNFCC programming | ~20 events |
| Megaron (venue direct) | Classical/orchestral programming | 65 events |
| Half Note (venue direct) | Jazz programming | 22 events |
| Venue Instagram (manual) | Lineup announcements, schedule changes | Ad hoc |

**Pipeline rule:** When Tier 1 data conflicts with lower tiers, Tier 1 wins. Always.

---

## Tier 2: Editorial Sources (Curated)

**Definition:** Sources that aggregate and editorialize event information. The data is second-hand but from credible editorial operations.

**Characteristics:**
- Information is curated and fact-checked to editorial standards
- May add context (genre classification, reviews) not present in Tier 1
- Slight publication lag — events appear here after being announced at Tier 1
- Occasional errors in transcription

**Tier 2 Sources:**
| Source | Curated For | Current Volume |
|--------|-------------|----------------|
| thisisathens.org | English-language Athens events | Via newsletter |
| Lifo Guide | Weekly event guide (Greek) | Via newsletter |
| musicheaven.gr | Greek music events and artist profiles | Manual research |

**Pipeline rule:** Tier 2 sources are valuable for discovery and enrichment context. Use for event discovery; cross-reference with Tier 1 for price/date accuracy.

---

## Tier 3: Community Sources (Signal)

**Definition:** Community-generated listings. Valuable for discovering events that don't appear on Tier 1 or 2, but data quality varies.

**Characteristics:**
- User/organizer submitted with minimal editorial oversight
- Coverage of niche and underground events
- Data may be incomplete, informal, or inconsistent
- Higher noise-to-signal ratio

**Tier 3 Sources:**
| Source | Signals For | Current Volume |
|--------|-------------|----------------|
| lu.ma | Tech/startup community events | Part of AI/tech scraper |
| Meetup.com | Recurring community meetups | 14 events |
| Eventbrite | General event discovery | 4 events |
| @athens.rave.culture | Underground electronic events | Manual |
| @clubber.gr (Instagram) | Scene signals, not structured data | Manual |
| Facebook events | Not currently scraped | N/A |

**Pipeline rule:** Tier 3 sources feed the discovery pipeline but every event discovered here should be cross-referenced against Tier 1/2 before enrichment. If no Tier 1/2 confirmation exists, the event still gets processed but is flagged as single-source.

---

## Source Conflict Resolution

When sources disagree:

| Conflict Type | Resolution Rule |
|---------------|-----------------|
| **Date conflict** | Ticketing platform wins. If no ticketing, venue website wins. |
| **Price conflict** | Ticketing platform wins (transactional accuracy). |
| **Venue name spelling** | Use the venue's own website/social spelling. |
| **Artist name spelling** | Use RA spelling for electronic. Artist's own Spotify/Bandcamp for others. |
| **Time conflict** | Venue-specific knowledge wins (reference database timing patterns). |
| **Event exists/doesn't exist** | If ANY Tier 1 source lists it, it exists. Tier 2 listing alone = exists. Tier 3 alone = flag for verification. |
| **Event canceled** | Venue Instagram or ticketing platform cancel notice = confirmed. Absence from listings alone ≠ canceled. |

### Dedup Winner Selection

When merging duplicates across sources, the "winner" (surviving record) is chosen by:

1. **Source priority:** more.com > viva.gr > gazarte > email sources
2. **Description length:** Longer description = better data
3. **Title completeness:** Longer/more complete title wins
4. **Field completeness:** More filled fields = richer record

---

# SECTION 4: GAP ANALYSIS

## Events We Miss and Why

### Instagram-Only Announcements

**Gap:** Events announced exclusively via Instagram stories (24hr ephemeral content) or post captions that don't appear on any listing platform.

**Affected event types:** Underground electronic events, pop-up shows, last-minute additions, DJ set announcements at bars.

**Scale of gap:** Estimated 10-15% of total Athens events (primarily underground/niche). The 50 "unverified" events in the DB suggest some are caught but can't be venue-matched.

**Mitigation:** Manual monitoring of key venue accounts during enrichment sessions. Recurring events at known venues can be listed without per-event scraping.

**Future fix:** Community submission form on the agent-athens site. Instagram API monitoring for key accounts.

---

### Small Venue / No Online Presence

**Gap:** Events at venues too small or too informal to list on any platform. The proprietor announces by word of mouth or a handwritten sign.

**Affected event types:** Rebetiko nights at unlisted venues, small bar jazz sessions, Exarchia basement shows.

**Scale of gap:** Estimated 5-10% of total Athens events. Rebetiko has the highest gap level of any event type.

**Mitigation:** The enrichment knowledge base (`config/venue-intelligence.md`) captures known regular nights (e.g., Kavouras Fri/Sat, Stoa Athanaton Fri/Sat/Sun). Recurring events at known venues can be listed without per-event scraping.

**Future fix:** Community submission form on the agent-athens site.

---

### University-Hosted Events

**Gap:** Events organized by university departments, student organizations, or research groups — often free, often unlisted on cultural event platforms.

**Affected event types:** Tech talks, hackathons, cultural events, lectures, film screenings.

**Scale of gap:** Estimated 3-5% of Athens tech/cultural events.

**Mitigation:** lu.ma and Meetup catch some university-adjacent events. The AI/tech scraper keywords include academic terms.

**Future fix:** Monitor university event calendars (AUEB/ACE, NTUA, Athens University).

---

### Pop-Up / One-Off Events

**Gap:** Events organized by collectives, brands, or individuals that don't have a regular venue or listing presence.

**Affected event types:** Gallery openings, brand activations, pop-up dinners, one-off concerts in non-standard spaces.

**Scale of gap:** Estimated 5-8% of total events. Higher in summer months when outdoor pop-ups increase.

**Mitigation:** lu.ma and Instagram monitoring catch some of these. Eventbrite catches brand-organized events.

**Future fix:** Broader social media monitoring. Community submission pipeline.

---

### Private-But-Public Events

**Gap:** Events that are technically private but effectively open to anyone who shows up — gallery openings, soft-launch parties, industry mixers.

**Affected event types:** Art openings, fashion events, industry networking, album listening parties.

**Scale of gap:** Small but culturally significant. These events often appear only in niche newsletters or Instagram stories.

**Mitigation:** Newsletter pipeline (AAA Athens Art newsletter covers gallery openings).

**Future fix:** Dedicated gallery/art source scraper.

---

### Non-Greek International Listings

**Gap:** International touring artists who announce Athens dates on their own channels (Bandsintown, Songkick, artist website) before any Greek platform picks it up.

**Affected event types:** International concerts, DJ tour stops.

**Scale of gap:** Small but important — these are often high-value events. Typically caught 1-2 weeks later when more.com or ticketservices list them.

**Mitigation:** RA catches international electronic acts. more.com catches most international concerts once tickets go on sale.

**Future fix:** Add Bandsintown/Songkick to scraping sources for Athens-filtered results.

---

## Event Type Coverage Matrix

| Event Type | Primary Source(s) | Secondary Source(s) | Gap Level | Current Count |
|------------|-------------------|---------------------|-----------|---------------|
| Theater | Athinorama, more.com | ticketservices | Low | 354 |
| Concert (major) | more.com, ticketservices | Athinorama | Low | 330 |
| Electronic/club | RA, clubber.gr | Venue IG, Athinorama | Low | 137 |
| Classical | Megaron (direct), ticketservices | Athinorama | Low | 56 |
| Meetup/tech | lu.ma, Meetup.com | Startup org websites | Medium | 14 |
| Opera | ticketservices, Megaron | Athinorama | Low | 11 |
| Festival | ticketservices, more.com | Athinorama | Low | 9 |
| Exhibition | Athinorama, Onassis, Benaki | thisisathens, SNFCC | Medium | 8 |
| Show | more.com | Athinorama | Low | 6 |
| Dance | ticketservices | Athinorama | Low | 5 |
| Conference | AI/tech scraper | lu.ma | Medium | 5 |
| Performance | Athinorama | Onassis | Low | 4 |
| Workshop | SNFCC, Athinorama | lu.ma | Medium | 3 |
| Jazz | Half Note (direct) | Athinorama, thisisathens | Medium | Subset of concerts |
| Rebetiko | Athinorama | Venue IG, word of mouth | **High** | Subset of concerts |
| Bouzoukia | Athinorama | Venue IG | **High** | Not tracked separately |

---

# SECTION 5: QUALITY INDICATORS BY SOURCE

## Date Reliability

| Source | Stars | Common Issues |
|--------|-------|---------------|
| more.com | ★★★★★ | Transactional — dates are accurate |
| TicketServices.gr | ★★★★★ | Transactional — dates are accurate |
| Resident Advisor | ★★★★★ | Promoter-verified, structured data |
| Megaron | ★★★★★ | Venue-direct, `data-date` attribute |
| Half Note | ★★★★★ | Venue-direct, iCal format |
| Athinorama | ★★★★☆ | Occasional errors on multi-day events. Thursday publish can lag. |
| Clubber.gr | ★★★★☆ | iCal structured but stale events may have incorrect dates |
| thisisathens.org | ★★★★☆ | Newsletter lag — events may be announced days after others |
| Onassis/Benaki | ★★★★☆ | Venue-direct but Puppeteer scrape may miss page structure changes |
| lu.ma | ★★★☆☆ | Organizer-submitted, sometimes placeholder dates |
| Venue Instagram | ★★★★☆ | Accurate but unstructured — you have to read the image |

## Price Reliability

| Source | Stars | Common Issues |
|--------|-------|---------------|
| more.com | ★★★★★ | Authoritative — this is where you buy |
| TicketServices.gr | ★★★★★ | Authoritative |
| Resident Advisor | ★★★★☆ | Usually accurate, ~50% coverage. Sometimes doesn't reflect door price. |
| Half Note | ★★★★☆ | Prices embedded in description text — needs parsing. Range: €12-€51. |
| Megaron | ★★★★☆ | Venue-direct but scraper doesn't always capture price |
| Athinorama | ★★★☆☆ | May list presale price without noting door markup. Sometimes stale. |
| Clubber.gr | ★★☆☆☆ | iCal feed does not include pricing data |
| Venue Instagram | ★★★☆☆ | Often mentions price but informal — "entrance 10€ with drink" needs parsing |
| lu.ma | ★★☆☆☆ | Free events often listed; paid events may not include price |
| Eventbrite | ★★★☆☆ | Prices available but not all Athens events are on Eventbrite |

## Artist Name Consistency

| Source | Stars | Common Issues |
|--------|-------|---------------|
| Resident Advisor | ★★★★★ | Standard Latin-character names, often with RA artist ID |
| Half Note | ★★★★☆ | Usually Latin (jazz artists), consistent formatting |
| more.com | ★★★☆☆ | Greek script common. Inconsistent transliteration. ALL CAPS sometimes. |
| Athinorama | ★★☆☆☆ | Greek script standard. Multiple transliteration variants across listings. |
| musicheaven.gr | ★★★☆☆ | Greek script but often includes Latin variant |
| Clubber.gr | ★★★☆☆ | Mixed Greek/English, reasonable consistency for electronic artists |
| Venue Instagram | ★★☆☆☆ | Stylized names, emojis, ALL CAPS, creative formatting |

**Impact:** Artist name inconsistency is the #1 cause of entity resolution failures. The transliteration normalization rules exist specifically because of this problem.

## Data Freshness

| Source | Lag from Announcement | Notes |
|--------|------------------------|-------|
| Venue Instagram | Minutes - hours | First to announce |
| Resident Advisor | Hours - days | Promoter submission queue |
| more.com | Hours - days | Ticketing goes live when organizer is ready |
| Half Note iCal | Hours - days | Updated when venue updates their site |
| Megaron | Hours - days | Updated with new programming |
| Clubber.gr | Days | Weekly scrape + editorial process |
| lu.ma | Same day | Organizer publishes directly |
| Athinorama | Up to 7 days | Weekly Thursday publish cycle |
| thisisathens.org | 3-7 days | Weekly newsletter digest |

---

# SECTION 6: PIPELINE PROCESSING RULES

## Deduplication

The same event often appears across multiple sources. The pipeline uses two deduplication stages:

### Stage 1: Same-Source Dedup (`scripts/remove-duplicates.ts`)

**7-pass algorithm:**

| Pass | Name | Match Criteria |
|------|------|----------------|
| -1 | Non-event filter | Remove products: Κάρτα (cards), PASS, season tickets, gift cards |
| 0 | Recurring protection | Protect: theater runs (3+ shows/7+ days), exhibition runs, weekly recurring, festival multi-day |
| 1 | URL-based | Same URL = same event |
| 2 | Exact match | Title + venue + date + time (strict) |
| 3 | Cross-source 24hr | Different sources, same title/venue within 24 hours |
| 4 | Fuzzy title | Case-insensitive + trimmed title match |
| 5 | Venue normalization | Removes special characters from venue comparison |
| 6 | Suspicious timestamp | Only merges 00:00 or 12:00 times (conservative) |
| 7 | Smart title | Strips "live in Athens", Greek "στο [venue]", articles, aliases |

**Safety:** Aborts if >20% of events would be removed. Requires `--execute` flag.

### Stage 2: Cross-Source Merge (`scripts/merge-duplicates.ts`)

**4-layer matching:**
1. Fuzzy title match (high similarity threshold)
2. Venue match (normalized)
3. Date match (same or within window)
4. Type compatibility check

**Field merger logic:**
- Keeps longer descriptions
- Uses best available prices (more.com preferred)
- Merges ticket URLs
- Combines genres
- Audit trail: every merge logged to `dedup_merges` table for undo

**Execution:** Requires `--execute --min-confidence 0.9` in production pipeline.

## Event Lifecycle in Pipeline

```
SCRAPED → DEDUPLICATED → LOCATION_FILTERED → ENRICHMENT_QUEUED → ENRICHED → PUBLISHED
                                                    ↓
                                           (if insufficient data)
                                           NEEDS_RESEARCH → manual enrichment session
```

**Pipeline states (from database):**

| State | Count | % |
|-------|-------|---|
| Published (verified + enriched) | 170 | 18% |
| Published (verified, needs enrichment) | 720 | 75% |
| Hidden (unverified) | 50 | 5% |
| Hidden (problematic) | 17 | 2% |

## Event Type Scope Filtering

**Excluded by `config/event-scope.json`:**
- Sports events (keywords: αγώνας, match, basketball, football, derby, etc.)
- Sports venues (OAKA, SEF, Karaiskakis, Olympic Stadium, etc.)
- Sports teams (AEK, Olympiakos, Panathinaikos, PAOK, etc.)
- Corporate/business events (conference, seminar, networking, team building)
- Religious/private events (wedding, baptism, funeral, church service)

**Override allowlist:** Dance events (contemporary dance, ballet, tango, flamenco) are allowed despite potential keyword overlap.

## Scrape Scheduling (Production)

| Source | Schedule | Method | Timeout | Delay |
|--------|----------|--------|---------|-------|
| more.com | Daily | Playwright + curl fallback | 30s | 1s |
| athinorama.gr | Daily | curl | 30s | 2s |
| ticketservices.gr | Daily | Bun fetch | 30s | 2s |
| residentadvisor | Daily | GraphQL | 30s | 2s |
| megaron.gr | Daily | curl | 30s | 2s (1s events API) |
| onassis | Daily | Puppeteer | 30s | 2s |
| halfnote | Weekly | iCal | 30s | standard |
| clubber.gr | Weekly | iCal | 30s | standard |
| snfcc | Weekly | Puppeteer | 30s | 2s |
| benaki | Weekly | Puppeteer | 30s | 2s |
| AI/tech sources | Weekly | RSS + Puppeteer | 30s | 2s |
| Newsletters | On receipt | IMAP → parser | N/A | N/A |

**Global config:** User-Agent: Chrome 120 on macOS. Max 2 retries with exponential backoff (`delay = baseDelay × 2^(attempt-1)`).

## Seasonal Rules

From `config/seasonal-rules.json`:

**Summer (May-September):**
- Indoor clubs close or reduce operations
- Nightlife migrates to Athens Riviera (Bolivar, Astir Beach, Island Athens)
- Half Note Jazz Club closed
- Stoa Athanaton, Klimataria, Perivoli tou Ouranou closed
- Priority shifts to beach/outdoor venues

**Winter (October-April):**
- Full indoor operations
- Rebetiko season active
- Half Note jazz active (250 concerts/season)
- Stoa Athanaton active (Fri/Sat 22:30, Sun 13:00)

**Validation:** Pipeline rejects events at closed seasonal venues. Warns on seasonal mismatches.

---

# SECTION 7: MONITORING & HEALTH

## Pipeline Health Indicators

| Metric | Current Value | Healthy Range | Alert Threshold |
|--------|---------------|---------------|-----------------|
| Events in database | 957 | 800-1200 | <500 (scraping failure) |
| Events shown on site | 890 (93%) | >85% | <80% |
| Unverified events | 50 (5%) | <10% | >15% |
| Events with prices | 924 (96.5%) | >90% | <85% |
| Events with times | ~789 (82.4%) | >80% | <70% |
| Events with ticket URLs | 843 (88%) | >85% | <75% |
| Events with images | 598 (62.5%) | >50% | <30% |
| Events with Schema.org | 890 (93%) | >90% | <80% |
| Enriched descriptions | 170 (18%) | Increasing | Stagnant for >7 days |
| Sources active | 16 | >12 | <10 |
| Events scraped/week (W08) | 413 | 200-500 | <100 |
| Distinct verified venues | 241 | >200 | <150 |

## Source Health Monitoring

**File:** `scripts/health-check.ts`

**Reports generated:**
- Daily health report (per-source scrape stats)
- 7-day trend report
- Data quality audit
- Alert generation (CRITICAL/WARNING)

**Reports directory:** `data/health-reports/`

**Execution:**
```bash
bun run scripts/health-check.ts              # Daily report
bun run scripts/health-check.ts --weekly     # 7-day trend
bun run scripts/health-check.ts --quality    # Quality audit
```

**Tracked per-source metrics:**
```typescript
interface ScrapeStats {
  source: string;
  scraped_at: string;
  events_found: number;
  events_new: number;
  events_updated: number;
  duration_ms: number;
  success: number;  // 0 or 1
  error_message: string | null;
}
```

| Health Check | Frequency | Method |
|-------|-----------|--------|
| Source still accessible | Daily (automated via pipeline) | HTTP status + scrape success flag |
| Source structure unchanged | Weekly (manual) | Compare scraped field count to expected |
| Source content fresh | Weekly | Check if new events appear |
| Scraper still running | Daily | Pipeline log in `logs/pipeline-YYYY-MM-DD.log` |
| Enrichment queue growing | Daily | `needs_enrichment` count trending |

---

# APPENDIX A: GREEK DATE/TIME VOCABULARY

For date parsing from Greek-language sources:

| Greek | English | Notes |
|-------|---------|-------|
| Δευτέρα | Monday | |
| Τρίτη | Tuesday | |
| Τετάρτη | Wednesday | |
| Πέμπτη | Thursday | |
| Παρασκευή | Friday | |
| Σάββατο | Saturday | |
| Κυριακή | Sunday | |
| Ιανουαρίου / Ιαν | January | Genitive case (standard in dates) |
| Φεβρουαρίου / Φεβ | February | |
| Μαρτίου / Μαρ | March | |
| Απριλίου / Απρ | April | |
| Μαΐου / Μαϊ | May | Note: ΐ with diaeresis |
| Ιουνίου / Ιουν | June | |
| Ιουλίου / Ιουλ | July | |
| Αυγούστου / Αυγ | August | |
| Σεπτεμβρίου / Σεπ | September | |
| Οκτωβρίου / Οκτ | October | |
| Νοεμβρίου / Νοε | November | |
| Δεκεμβρίου / Δεκ | December | |
| Πόρτες / Είσοδος | Doors / Entry | |
| Αρχή / Έναρξη | Start / Beginning | |
| Εισιτήρια | Tickets | |
| Ελεύθερη είσοδος | Free entry | |
| Δωρεάν | Free (adjective) | |
| Προπώληση | Presale | |
| Ταμείο | Box office / Door | |
| μ.μ. | PM (afternoon) | Add 12 hours |
| π.μ. | AM (morning) | No change |

---

# APPENDIX B: VENUE SLUG REGISTRY

Canonical venue slugs for matching. This is a subset of the 127 venues in `config/athens-venues.json`.

## Electronic/Club Venues

| Venue Name | Slug | Known Variants |
|------------|------|----------------|
| SMUT Athens | `smut-athens` | SMUT, Smut |
| Astron Club | `astron-club` | Astron, ASTRON |
| AUX Club | `aux-club` | AUX, Aux |
| Six D.O.G.S | `six-dogs` | 6 D.O.G.S, 6DOGS, Six Dogs, six d.o.g.s |
| Romantso | `romantso` | ROMANTSO |
| Bios | `bios` | BIOS, Bios Pireos |
| Temple Athens | `temple-athens` | Temple, TEMPLE |
| IT Athens | `it-athens` | IT, I.T. Athens |
| Oddity | `oddity` | ODDITY |
| Steam Athens | `steam-athens` | Steam, STEAM |
| Death Disco | `death-disco` | DEATH DISCO |
| Sodade2 | `sodade2` | Sodade, SODADE2 |
| Shamone | `shamone` | SHAMONE |

## Concert Venues

| Venue Name | Slug | Known Variants |
|------------|------|----------------|
| Gazarte | `gazarte` | GAZARTE, Γκαζάρτε |
| Gagarin 205 | `gagarin-205` | Gagarin, GAGARIN 205 |
| Fuzz Live Music Club | `fuzz` | Fuzz, FUZZ, Fuzz Club |
| Floyd Live Music Venue | `floyd` | Floyd, FLOYD |
| Kyttaro Live Club | `kyttaro` | Kyttaro, KYTTARO, Κύτταρο |
| AN Club | `an-club` | AN, A.N. Club |

## Jazz

| Venue Name | Slug | Known Variants |
|------------|------|----------------|
| Half Note Jazz Club | `half-note-jazz-club` | Half Note, Halfnote, HALF NOTE |

## Classical/Performing Arts

| Venue Name | Slug | Known Variants |
|------------|------|----------------|
| Megaron Mousikis | `megaron-mousikis` | Athens Concert Hall, Μέγαρο Μουσικής, Μέγαρο Μουσικής Αθηνών, Megaron International Conference Centre |
| SNFCC | `snfcc` | Stavros Niarchos Foundation, ΚΠΙΣΝ, Κέντρο Πολιτισμού Ίδρυμα Σταύρος Νιάρχος |
| Onassis Stegi | `onassis-stegi` | Onassis, Στέγη |
| Zappeion Hall | `zappeion` | Zappeion Megaron, Ζάππειον |
| Technopolis | `technopolis` | Technopolis City of Athens, Τεχνόπολις |

## Rebetiko/Traditional

| Venue Name | Slug | Known Variants |
|------------|------|----------------|
| Stoa Athanaton | `stoa-athanaton` | Στοά Αθανάτων, Stoa |
| Klimataria | `klimataria` | Κλιματαριά |
| Kavouras | `kavouras` | Καβούρας |
| Perivoli tou Ouranou | `perivoli-tou-ouranou` | Περιβόλι του Ουρανού |

## Museums

| Venue Name | Slug | Known Variants |
|------------|------|----------------|
| Benaki Museum (Greek Culture) | `benaki-koloaki` | Μουσείο Μπενάκη Ελληνικού Πολιτισμού, Κουμπάρη 1 |
| Benaki Museum (Piraeus 138) | `benaki-piraeus` | Μουσείο Μπενάκη - Πειραιώς 138 |
| Benaki Museum (Islamic Art) | `benaki-islamic` | Μουσείο Ισλαμικής Τέχνης |

## Other Notable

| Venue Name | Slug | Known Variants |
|------------|------|----------------|
| Hamam | `hamam` | HAMAM |
| Kapnikarea | `kapnikarea` | Καπνικαρέα |
| EGG Hub | `egg-hub` | EGG, egg Hub, egg Eurobank |
| A for Athens | `a-for-athens` | |
| Bolivar Beach Bar | `bolivar` | Bolivar, BOLIVAR (summer only) |
| Astir Beach | `astir-beach` | Astir, ASTIR (summer only) |
| Theatre of the No | `theatre-of-the-no` | Θέατρο του Νέου Κόσμου |
| Underflow Records | `underflow` | Underflow Records & Art Gallery, UNDERFLOW |

**Full registry:** See `config/athens-venues.json` for all 127 venues with complete variation lists.

---

*This document grows with the pipeline. Every new source, new edge case in parsing, and new venue variant should be added here. The pipeline is only as good as its documentation.*

*Last updated: February 2026. Based on production codebase analysis of 16 active scraper sources, 957 events, 241 verified venues.*
