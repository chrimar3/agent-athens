# Input Pipeline Audit — scraping reliability, ticket-link truth, input quality

**Date:** 2026-10-26 (evidence gathered 2026-10-06 → 2026-10-14; state re-checked 2026-10-14; no repository commits between 2026-10-06 and 2026-10-26)
**Type:** READ-ONLY diagnostic (session S234). No source, config or database row was modified; the only writes are this report, its companion findings file, the continuation prompt, and the record files (ledger, known-issues, session-log). Every number below was computed from `data/events.db` (read-only), `logs/pipeline-*.log`, `scrape_stats`, the live site, or a single polite fetch of the named page on the stated day.
**Method:** orchestrator scouting, then 13 independent finder agents (one per source group or pipeline layer), 5 themed merge agents, a completeness critic, and a (partially completed) adversarial verification pass. See § 5 for status.
**Question asked:** "Does scraping always work in all sources, do ticket links lead to a page where a ticket can actually be bought, and how can the pipeline get better input?"

---

## 1. Headline

1. **Scraping has not worked for 6 of 10 active sources since the pipeline moved into the container on 2026-09-27.** Every scraper routed through the outbound-URL guard pre-resolves DNS with `node:dns`; the container's `internal: true` network has no resolver (Docker Engine ≥ 26 stopped forwarding external DNS for internal-only networks, CVE-2024-29018; this Mac runs 29.8.0), so `assertPublicUrl` throws `ESERVFAIL` before any request. athinorama, ticketservices, halfnote, snfcc, onassis and benaki return 0; more.com returns 0 silently. The three survivors (RA, megaron, cometogether) are exactly the scrapers that bypass the guard with plain `fetch`, which honours `HTTPS_PROXY`.
2. **Nothing noticed.** The scrapers catch their own errors and return `[]`, so `scrape_stats.success=1`; the health check prints "ok"; the yield canary detects the drop but dies on `gh auth` (no token in the scrape container) and is logged as non-fatal; the deadman needs three consecutive runs and its subject line is taken by STALE_DEPLOY; ntfy push has been unconfigured since 2026-09-26. Benaki has reported exactly 4 events on every one of 205 logged runs since February because it injects four hard-coded, past-dated "known exhibitions" when the page yields nothing: a Tier-1 fabrication violation that masks a source that has never parsed a real row.
3. **Nothing is scheduled, and publishing cannot see itself succeed.** The legacy launchd daily job is refused (exit 9) every morning; `docker/install-launchd.sh --apply` was never run. Runs since 2026-09-25 were manual (09-27, 10-05 ×2, 10-06 ×2). The 2026-10-06 09:03 publish uploaded the build (the live site carries its 09:02 stamp) but the Netlify CLI hung afterwards, the 900 s watchdog killed it, the deploy lookup found nothing, publish exited 1, no `deploy-success` was recorded, and the watchdog has emailed "stale deploy" daily about a site that did update.
4. **Ticket links are mostly not buy links, and the layer built to fix this is dead code.** The daily pipeline runs only `validate-ticket-urls.ts --generate`, which copies each event's own listing URL into `ticket_url` with status `generated` and skips HEAD validation. 553 of 596 upcoming ticketed rows carry `generated`; `ticket_url_resolved` is NULL on every row; no row has ever had status `direct` or `valid`. The CTA does not recognise `generated`, so 719 of 957 built event pages say "Βρείτε εισιτήρια →" whether the target is a merchant checkout (ticketservices, megaron, cometogether: verified purchasable) or an editorial page (athinorama: 191 of 215 rows point back at athinorama.gr). Meanwhile the live athinorama music guide carries 52 distinct more.com ticket anchors across 127 cards and theatre detail pages carry `offers.url` to more.com in JSON-LD; the scraper discards them and the save path has no `ticket_url` column.
5. **The newsletter channel has never written an event.** `processed_emails` holds 298 rows with `event_count=0`; the importer the parser tells the operator to run does not exist; and since the DKIM gate landed, the IMAP header fetch examines only the lowest unseen UID per run (node-imap collapses `['UID','1,2,3']` to `1`).
6. **What visitors see (2026-10-14).** The live homepage is the 2026-10-06 09:02 build; its "Σήμερα" block carries `<time>` values from 6 to 10 October and nothing on or after today. Only 53 shown rows fall in the next seven days (114 in days 8–30, 349 later, the latter dominated by athinorama year-rollover artifacts). No source has created a near-term row since 2026-10-05; six sources have had no inflow since 2026-09-22/25. Enrichment has not run since the security loop (235 of 527 visible events unenriched).

## 2. Measured state (2026-10-06, re-checked 2026-10-14, read-only)

| Metric | Value |
|---|---|
| Active sources / producing in container | 10 / 3 (ra, megaron, cometogether) |
| Last healthy host run (all 10 producing) | 2026-09-25: 821 events |
| Container runs 09-27, 10-05, 10-05, 10-06 | 395 / 419 / ~420 / ~420 events, all from the 3 unguarded scrapers (+4 fabricated benaki) |
| Upcoming shown rows | 604 (athinorama 227, megaron 110, ticketservices 87, RA 61, cometogether 45, more.com 38, halfnote 19, onassis 12, snfcc 3) |
| Upcoming ticketed rows by `ticket_url_status` | generated 553 · door_only 34 · ai_discovered 9 · NULL ~45 |
| Rows with `ticket_url = url` (own listing copied) | athinorama 191, megaron 110, ticketservices 87, more.com 41, RA 37, cometogether 39, halfnote 19, onassis 12 |
| Built event pages by CTA label | Find 719 · Buy 30 · Door 42 (of 957) |
| Live-link ground truth (16 sampled, one GET each) | BUY 7 (ticketservices 3/3, cometogether 1/1, megaron 2/3 one hop, halfnote 1/1 one hop) · LISTING 3 (athinorama 2, megaron 1) · EXPIRED 2 (athinorama) · BLOCKED 4 (more.com queue-it ×2, ra.co DataDome ×2) |
| Venue registry | 356 venues · 4 with `ticketing` · 8 with `website` · 150 with address · 29 normalised-key collisions |
| Exhibitions upcoming with an end date | 2 (site-wide) |
| Newsletter events ever imported | 0 |
| Scheduled container jobs installed | 0 |
| Live homepage build stamp / event dates shown (2026-10-14) | 2026-10-06 09:02 / 2026-10-06 … 2026-10-10 only |
| Upcoming shown rows by horizon (2026-10-14) | next 7 days 53 · days 8–30 114 · later 349 |
| Newest `created_at` among upcoming shown rows | megaron, RA, cometogether 2026-10-05 · ticketservices, halfnote 2026-09-25 · onassis 2026-09-24 · athinorama, more.com 2026-09-22 · snfcc 2026-09-05 |
| Visible events unenriched (enrichment-check 2026-10-13) | 235 of 527 |
| more.com `googlesitemap.xml` (probed 2026-10-14) | HTTP 200, 2,747 URLs: theater 559 · music 500 · cinema 254+96 · stand-up 69 · museums 66 · happenings 58 · children 58 · workshop 25 · dance 18 (no `lastmod`); `/_api/events` → HTTP 500, empty |

## 3. Root causes

### A. Input flow is broken (restore first)

**A1. Guard DNS pre-resolution vs sealed network** — `src/utils/outbound-url.ts` `assertPublicUrl` → `systemResolver` → `node:dns lookup` (lines 176–214). In the container the lookup returns ESERVFAIL; `safeFetch`, `safeFetchResponse`, `safeCurlText` and `guardPageRequests` (Puppeteer) all fail closed. Squid already performs the same private-range check after its own DNS (`docker/egress/squid.conf` `aa_private_dst`), so under the proxy the Node pre-check adds no guarantee: the connection goes to squid by name regardless. Evidence: `logs/pipeline-2026-10-05.log:710-797`; a halfnote `--dry-run` from the Mac on 2026-10-06 returned 23 events. Fix options: (a) proxy mode in the guard, gated on `AA_CONTAINER=1 && HTTPS_PROXY`, skipping local resolution but keeping scheme/credential/IP-literal/local-name checks and the size/time/redirect caps (recommended; keeps the CVE benefit; squid becomes the sole post-DNS enforcer); (b) a DNS forwarder in the egress container plus compose `dns:` (restores DNS as an exfiltration channel and touches pinned hardening tests). Either way: `docker/doctor.sh` must probe the real guard (it currently passes on raw curl), `docker/README.md:436-438` is inverted (says DNS may leak; it does not resolve at all), and the guard's tests all inject a resolver so none exercises this path. **This is a security-loop decision for the owner.**

**A2. Three scrapers bypass the guard** — RA GraphQL (`scrape-all.ts:1178`), megaron (`scrape-megaron.ts:70`), cometogether (`scrape-cometogether.ts:122`) use plain `fetch`. They work *because* they skip the guard, lose its size/time caps, and nothing pins that Bun's fetch honours the proxy. Route them through the guard after A1 lands and add the scraper files to the call-site test's GUARDED list.

**A3. Publish cannot observe its own deploy** — `netlify deploy` uploads (the site updated at 09:02 on 2026-10-06) but the CLI hangs afterwards through the proxy; the 900 s watchdog kills it (`daily-automated.sh` deploy block), `listSiteDeploys` finds nothing in the 10-minute window, publish exits 1, no `deploy-success` is recorded, the publish marker stays, and the deadman alerts STALE_DEPLOY on a fresh site. The 00:47 attempt the same day hit the wrapper's 30-minute limit the same way. Needs: find what the CLI waits on (likely a websocket or long-poll not proxied), or replace the CLI's post-upload wait with the pipeline's own `getSiteDeploy` poll (already implemented) and record success from the poll.

**A4. Scheduler** — operator action: `docker/aa-run.sh doctor` then `docker/install-launchd.sh --apply`. Code: make the deadman's pipeline-failure reason name the label and exit code ("com.agentathens.daily exit 9 → run install-launchd") instead of "a scheduled job last-exited non-zero". **Sequencing constraint:** installing the schedule before A3 is understood schedules a daily 15-minute hang that ends in exit 1 while quietly deploying, with no rollback record (`~/.config/agentathens-docker/deploys.log` does not exist).

**A5. Deploy truth is dead** — the deadman computes STALE_DEPLOY from `logs/deploy-cadence.log` (last line 2026-09-25) and a host `deploys.log` that was never written; it reported "stale by 456 h" on 2026-10-14 while the live site was from 2026-10-06, and sent eight near-identical emails in eleven days (carrying the six SOURCE_DEAD reasons since 2026-10-06 21:12Z). The problem has become alert truth and fatigue, not delivery. The deploy-truth source (Netlify `listSiteDeploys` from the host, or the verify-live content canary) must change in the same round as A3; `src/watchdog/**` is protected.

**A6. Megaron is fragile too** — on 2026-10-05 21:45Z the plain fetch got HTTP 503 after 61 s, no retry, recorded as success with 0 events. With six sources dark, Megaron is 21% of the shown set; a retry/backoff plus "zero cards parsed → throw" in `scripts/scrape-megaron.ts` (open path) protects a quarter of today's input.

**A7. Enrichment has not run since the security loop** — legacy enrichment jobs exit 9 on the host; the four container enrichment jobs were never installed; whether the Claude CLI, its OAuth refresh and its fetches work through squid (CONNECT 443 only, no DNS) is untested. 45% of visible events are stubs.

### B. Failures are silent (make them loud second)

**B1. Scrapers swallow fetch errors** — athinorama ("unreachable — skipping source", `scrape-all.ts:597`), ticketservices (:1055), halfnote (:1141), more.com (`fetchWithCurl` empty catch :231), the three Puppeteer scrapers, RA (:1295) all return `[]`; `main()` records `success=1`. The clubber scraper already has the correct contract (errors propagate, :818-821). Apply it everywhere; `main()`'s catch already records `success=0 + error_message`.

**B2. Health check marks 0-event success rows "ok"** — `health-check.ts:301` glyph logic; CRITICAL alerts exist only as text; exit code always 0; `yesterday` is calendar-yesterday so the ratio rule is blind on non-daily runs.

**B3. Yield canary dies on `gh`** — `yield-canary.ts:500-510` throws on the first filing failure, exits 1 ("could not run"), names one source; the scrape container intentionally has no GH_TOKEN. Evaluate first, deliver second; print every verdict; exit 2; write `data/yield-canary-latest.json`; skip gh when unset.

**B4. Deadman rule counts runs, not time; push unconfigured** — `SOURCE_DEAD_STREAK=3` (`deadman-watchdog.ts:194`) took three manual runs over nine days to arm; STALE_DEPLOY outranks it in the subject; the ntfy topic file `~/.config/agentathens/ntfy-topic` was never created after security-loop round 1 moved it out of config (every run since 2026-09-26 logs "push topic not configured"). Move the yield rule onto the host deadman (reads `scrape_stats` every 6 h; email works), add a "push enabled but unconfigured" reason, give the weekly digest an email channel.

**B5. Constant fabricated yield** — Benaki's fallback (`scrape-benaki.ts:187-234`) guarantees 4 rows, so no monitor can ever see the source as dead. 176 of 205 runs loaded the page and parsed nothing: the selectors have never matched. Delete the fallback (the S164 rule already says so; ledger Decisions line 7242 still carries the superseded "fall back to known events" decision), purge the 5 rows, and add an "events_found identical for ≥14 runs and every row past-dated" rule.

**B6. `scrape_stats.events_new/updated` are always 0** — recorded before save with hard-coded zeros (`scrape-all.ts:1804-1807`); a frozen source (more.com re-fetching the same 40 items for ten days) is indistinguishable from a healthy one.

### C. Ticket links (make "Buy" true third)

**C1. Legacy generator is the only writer** — `daily-automated.sh:415` runs `validate-ticket-urls.ts --generate`; `generateMissingUrls` copies `event.url` into `ticket_url` as `generated` (:303-316) and HEAD validation is skipped (:414-422). The resolver cascade (`src/ticketing/resolver.ts`, driven by `scripts/backfill-ticket-urls.ts`) is wired into nothing; it last ran 2026-04-28. Six more legacy ticket scripts duplicate tiers with stale URL templates and are unwired.

**C2. Merchant pages are mislabelled** — 301 upcoming rows (ticketservices 86, megaron 109, more.com 41, RA 37, onassis 12, athinorama 16) hold a real merchant event URL but render "Find tickets" because `generated` is in neither CTA list (`cta.ts:50-62`, rule 4.5 at :130). Ground truth: 7 of 7 sampled merchant links were purchasable or one click from checkout with matching dates.

**C3. Editorial pages are published as ticket targets** — 191 athinorama + 39 cometogether rows send the visitor to the listing page they came from. For athinorama the real link exists: 52 distinct more.com anchors on the live music guide (127 cards, 2026-10-06), `offers.url` on theatre detail pages, `a.review-link`. The scraper extracts title/venue/date only, `ScrapedEvent` and the INSERT (:1455-1463) have no `ticket_url`, and the resolver hard-excludes athinorama on a 2026-04-24 premise that is now false (`resolver.ts:146-148`). Only `Offer.url` may be consumed from the JSON-LD: its dates are stale (2024 on a 2026 page).

**C4. The cascade as configured would publish 404s** — every `search_pattern` in `config/ticketing-mapping.json` (more.com `/gr/el/tickets/search`, live paths are `/gr-el/`; ticketservices `/en/search`) and the only registry `ticketing.url` (halfnote `/programma/`) return 404 today. Wiring the backfill without repairing templates and calling `validateUrl` on tier ≥ 2 results would ship broken "Buy" buttons.

**C5. Two status vocabularies** — legacy `valid/expired/sold_out/unverified/generated/door_only` vs D11 `direct/detail_page/venue_registry_*/crossref/platform_search/ai_discovered/venue_fallback/door_only/expired/unresolved/open_entry`; the enrichment brief trusts a third set. Even a legacy `valid` would fall to rule 4.5.

**C6. HEAD validation would wrongly expire 92 live links** — more.com (queue-it SafetyNet 302 loop) and ra.co (DataDome 403) block every non-browser client; the legacy validator maps any non-ok status to `expired`. Validation must be host-aware: GET + "event still listed" markers for ticketservices/megaron/cometogether/halfnote; RA via its GraphQL; more.com via listing crossref or headless Chromium; 302/403 → `blocked`, never `expired`.

**C7. `door_only_venues` overrides RA's own ticketing** — 20 upcoming RA rows at IT Athens, Aux Club, Oddity, Romantso render "At the door" by substring match on `config/ticketing-mapping.json`, although RA marks at least one `isTicketed=true`; the resolver's Tier-0 guard then freezes the status forever. RA rows never get a `ticket_url` at scrape time (24 NULL).

**C8. Registry coverage** — 4 of 356 venues carry `ticketing`; Tier 2 can fire for almost nothing. Highest-yield additions by upcoming rows: Temple 23, Gazarte 15, Κύτταρο 14, ΚΕΤ 7, Ωδείο Αθηνών 6, Σταυρός του Νότου 8, ARCH Club 6, Gagarin 205, Εθνική Λυρική Σκηνή 5 (sells via ticketservices). cometogether.live is absent from `known_merchants`, so its 44 with-ticket rows emit no JSON-LD Offer although the listing page is the checkout.

### D. Per-source defects

| Source | Defect | Evidence |
|---|---|---|
| **more.com** | Cap of 20 events × 2 categories (music, theatre) = ≤40/run, always the same promoted items (listing exposes ~470 music items; 10 consecutive days of exactly 40 with `events_new=0`). Whole-page date/venue regexes serialise tours one row per day: 909 of 1231 rows are re-rows of 121 URLs, non-Athens cities included. No Attica filter although the listing carries `area1`/`addressLocality`. Event pages answer 302-to-queue-it with the body attached; the scraper survives by hard-coding status 200. Link regex drops festival sub-events and the dance/cinema/stand-up categories. No tests. `googlesitemap.xml` lists 2,747 URLs. | `scrape-all.ts:244-372`; `scrape_stats` 09-16..09-25; live listing 2026-10-05; sitemap 2026-10-14 |
| **athinorama** | Ticket anchors discarded (C3). URL-slug identity (2026-08-11) never migrated: 196 of 215 shown rows keep legacy title-hash ids and the import gate skips every re-scrape as a duplicate of the stale row, so 126 of 127 missing-time rows are frozen and venue transfers never propagate; `ON CONFLICT` omits `start_date`/`venue_name`. 185 of 215 shown rows are pre-fix year-rollover artifacts (76 dated 2027-04) held back at build but never retired; the source publishes ~30 events. `startIsRangeArtifact` computed and discarded; no counters for windowed-out/rolled/failed cards; 200+ sequential detail fetches per run (9,553 s on 2026-09-07) although the music card prints the time. Cinema guide not scraped; no decision recorded. | `scrape-all.ts:373-808`, `:646`, `:1465-1478`; live guide 2026-10-06 |
| **ticketservices** | Athens gate `areaIds.includes('1')` is a substring test: areas 16/18/19/153 (Heraklion, Larissa, Volos, Arcadia) pass; 358 rows rejected post hoc. Per-event Puppeteer with no effective bound: 19,335 s and 20,099 s runs on 09-07/08; the static event page already has per-show `data-date`/`data-time`, the venue address block and the organiser price. Stale whitelist canonicals "Concert #1 Baumstrasse" and "Live Music Space" rewrite venue names and hide two Gagarin 205 shows as `problematic`. Titles keep raw HTML entities into ids and public slugs (17 of 91 rows). "Address drift" in the decisions queue matches WebFetch-summary confabulation, not the page. | `scrape-all.ts:890-1057`, `:914-915`; `athens-venues.json:777,1159` |
| **RA** | Single page of 100: 72 of 193 runs truncated (up to 153 total). `door_only` override (C7). 20 futile 403 event-page fetches every run (0 prices in 218 runs). GraphQL call unguarded, no timeout (one run 675 s), outer catch returns partial as success. Title-hash ids although `event.id` is fetched; `venue.id` fetched and discarded. "Bios Ρομάντσο" registry entry swallows RA's "Romantso". 23:59 sentinel stored as a scraped time on 28 of 61 rows. | `scrape-all.ts:1150-1300` |
| **clubber** | Quarantine correct: iCal endpoint now times out (0 bytes in 25 s), `/feed/` is news-only RSS. No automatic re-probe; `--crossref` is dead code since 2026-07-05. | probes 2026-10-06 |
| **halfnote** | Scraper fine; killed only by A1. `today` in UTC. | `scrape-all.ts:1070-1149` |
| **megaron** | Works via plain fetch (A2); returned HTTP 503 as success=1 on 2026-10-05 21:45. Venue hard-coded to the building: hall ("ΑΙΘΟΥΣΑ") is on every detail page; `enrich-time.ts` already fetches it but is skipped in freshness mode and would ESERVFAIL. Price hard-coded `with-ticket` (lectures are "Είσοδος ελεύθερη με ηλεκτρονική κράτηση"). New category "Προβολή" unmapped (NT Live / Met Live typed theater/concert). Genres `['Classical','Concert']` on all 110 rows. Exhibitions get no end_date. | `scrape-megaron.ts`; live detail pages 2026-10-06 |
| **cometogether** | Listing embeds `__NEXT_DATA__` JSON with venue city/municipality/countryCode/formattedAddress/coordinates, ISO start/end with timezone, minPrice/maxPrice/saleStatus, category/subCategories; the scraper regex-parses cards and keeps only the name. Result: 69 of 115 upcoming rows hidden as unverified (≥45 provably Thessaloniki/Chania/Patras…), a Hamburg church event and (until hand-fixed) a Larissa event shown as verified_athens, 45/45 shown rows date-only, flat "€35" prices lost (78 of 172 fixture cards), Temple metal gigs typed dj_set by venue-lock. | `scrape-cometogether.ts`; `tests/fixtures/cometogether-listing.html` |
| **snfcc** | Dateless card → `start_date = today`, id includes it → one new row per day per URL (one exhibition = 79 rows; 167 of 320 rows carry an invented start; 118 of 119 exhibitions no end_date). Category pages mostly surface sidebar widgets (7 events from 6 pages). Price hard-coded `open` on 320 rows. wp-json is Akamai-403. | `scrape-snfcc.ts:343-358` |
| **onassis** | Card exposes sub-venue (`p.mb3 span span`: Onassis Ready, Αρχείο Καβάφη, Στέγη) and `<time datetime="start/end">`; parser hard-codes venue "Onassis Stegi", price `with-ticket`, `location_status verified_athens` (34/34), hence a New York exhibition shown as Athens. Συζήτηση/Διάλεξη → `other` → categorizer's Greek talk keywords type them `tech`. | `scrape-onassis.ts:172-217`; fixture |
| **benaki** | Fabricated fallback (B5); selectors never matched; Joomla feed view 404. | `scrape-benaki.ts:126-234` |

### E. Venue identity at the save seam

Every source exposes a stable venue identity or address the pipeline discards (cometogether Google Place id + full location; RA `venue.id`; ticketservices `data-venueids`; more.com JSON-LD `location.address`; athinorama `/halls/` slug). The save seam stores only `venue_name`; `filter-athens-only.ts` then overwrites it in place with the first registry match (first-match substring, file order), so the scraped string is lost and 29 registry key collisions decide silently (Bios/Romantso, three "Άλσος", Gustav, Ολύμπια ×2). Athens membership is decided post-save by a Greece-only substring blacklist: 472 rows saved-then-deleted since July; foreign cities pass. Title-keyed ids for 8 of 10 sources; `ON CONFLICT` never updates venue/date/status. Two divergent Athens filters are live (`src/utils/athens-filter.ts` in `upsertEvent` vs `src/quality/location-filter.ts`). Addresses come from a name-keyed geo backfill with wrong master entries (ARCH Club, Φιλίπ, Κύτταρο). "Ηρώδειο" is absent from the whitelist (17 rows hidden). 89 upcoming rows sit in `unverified` with no review cadence (~40 plausible Athens candidates).

### F. Newsletter channel

Zero events ever (298 `processed_emails`, all `event_count=0`, status `processing`); no importer at the path the parser names; UID-list truncation examines one message per run; 302 pre-gate files rescanned every run and the tracked `newsletter-events.json` rewritten to `[]`; 6 of 10 configured formats have no parser module and have never sent mail; the pipeline parser bypasses the registry. Only lifo.gr (editorial), megaron.gr and snfcc.org (both already scraped directly) ever arrive. Decide keep-vs-retire after a one-week diff once the UID bug is fixed.

### G. Source landscape (verified surfaces the project does not use)

athinorama JSON-LD `offers.url` (zero extra requests); more.com `googlesitemap.xml` (2,747 URLs, verified 2026-10-14) and the listing's schema.org `<article>` microdata (complete catalogue per category in one request); ticketservices listings beyond `/en/LiveConcerts/` (GNO sells there: 6 `gno-` links on nationalopera.gr); cycladic.gr WordPress REST; aefestival.gr RSS + REST (seasonal); culturenow.gr and elculture.gr RSS (editorial, cross-reference only). Not viable: more.com `/_api/events` (HTTP 500), Eventbrite search (removed 2020), lu.ma (per-calendar key), Bandsintown (artist-centric), Songkick (paywalled), Ticketmaster Discovery (no GR). SNFCC and Onassis stay on a browser.

### H. Who can change what (`.github/path-guard.json`)

Most of Phase 1 and the alerting fixes touch **protected paths**, which an agent may only propose via issue and the owner lands by PR: `src/utils/outbound-url.ts`, `scripts/lib/chrome-path.ts`, `docker/**`, `scripts/daily-automated.sh`, `config/**` (venue whitelist, ticketing mapping, classification, quarantine, monitoring), `src/watchdog/**` and `scripts/deadman-watchdog.ts`, `src/ticketing/ticket-trust.ts`, `validator.ts`, `venue-registry.ts`, `src/utils/ticket-source-classifier.ts`, `src/db/url-columns.ts` + `scripts/lib/url-columns.ts` (the one sanctioned writer of URL columns: any scraper that starts writing `ticket_url` must go through `prepareUrlWrite`), `src/config/active-source-ids.ts`, `scripts/weekly-digest.ts`, the launchd plists, `package.json`.

**Open to agents:** `scripts/scrape-all.ts` and every `scripts/scrape-*.ts`, `scripts/validate-ticket-urls.ts`, `scripts/backfill-ticket-urls.ts`, `scripts/health-check.ts`, `scripts/yield-canary.ts`, `src/ticketing/resolver.ts`, `cta.ts`, `offer-builder.ts`, `src/quality/location-filter.ts`, `scripts/filter-athens-only.ts`, `src/db/database.ts`, `src/ingest/**` except `allowed-senders.ts`, `src/generate-site.ts`, `.claude/notes/**`, `docs/session-log.md`, `docs/known-issues.md`. One constraint: `tests/security/scraper-fetch-guards.test.ts` pins that `scrape-all.ts` may not add raw `fetch()` calls, so every new listing pull must go through the guard, which is dead in the container until A1 lands.

### I. The record

Before this session, `docs/known-issues.md`, `.claude/notes/ledger.md` and `docs/session-log.md` contained no entry for the container DNS outage, the eight-month Benaki fabrication, the publish CLI hang or the dead deploy signal; the superseded "fall back to known events" decision still stands at ledger line 7242 beside the S164 ruling that contradicts it. This session added the Mistakes section (2026-10-26), three known-issues entries and Session 234; the Decisions row should get a superseded note when the Benaki fallback is removed.

## 4. Proposed sequence

| Phase | Gate | Work (O = owner PR on a protected path · A = agent-executable) |
|---|---|---|
| **1. Restore input flow** | `docker/aa-run.sh scrape --dry-run --source halfnote` returns > 0 events; a scheduled run deploys, records `deploy-success`, and the live "Σήμερα" block contains today | O: A1 proxy-mode guard + real-guard doctor probe + README correction (security-loop decision: squid becomes the sole post-DNS enforcer); O: A3 Netlify post-upload wait replaced by the pipeline's own poll, deploy recorded; O: A5 deploy-truth source; O: A4 `install-launchd --apply` only after A3; A: A2 route RA/megaron/cometogether through the guard; A: A6 megaron retry + zero-cards throw |
| **2. Make failure loud** | A synthetic ESERVFAIL run produces `success=0`, a failing health glyph, a canary verdict file, one email naming the sources, and a "shown rows in next 7 days per source" ratchet in `build-completeness.json` | A: B1 propagate; A: B2 glyph + exit 3; A: B3 canary evaluate-then-deliver + verdict file; O: B4 yield rule on host deadman + push-unconfigured reason + digest email; A: B5 delete Benaki fallback + constant-yield rule; A: B6 events_new; A: near-term coverage ratchet |
| **3. Ticket-link truth** | On a rebuilt site, every "Buy" CTA target returns a purchasable page in the sample; no "Find" target is the event's own editorial page | A (cheapest visible win): C2 let `cta.ts` render "Αγοράστε εισιτήρια →" for `generated` rows whose host is a merchant, and "Λεπτομέρειες →" for listing-aggregator hosts; A: C3 capture athinorama `offers.url` / more.com anchors at scrape (consume only `Offer.url`, never the stale JSON-LD dates) and write through `prepareUrlWrite`; A: C4 repair/validate templates, `validateUrl` on tier ≥ 2; O: C1 swap the daily step in `daily-automated.sh` to the backfill; A: C5 converge on D11; A: C6 host-aware weekly revalidation with an explicit unvalidatable list (more.com, ra.co) so 92 live links are not expired; A: C7 conditional door_only + RA `isTicketed`; O: C8 registry `ticketing` additions, cometogether.live in `known_merchants`, one shared host allowlist |
| **4. Input quality** | Non-Athens rows rejected before insert; venue_raw preserved; one matcher; 89 unverified upcoming rows triaged | A: E structured venue capture (new columns) + city gate at save + stop rewriting venue_name; O: registry collision lint + stale canonicals ("Concert #1 Baumstrasse", "Live Music Space", Bios/Romantso, Gustav, Ολύμπια); per-source fixes in D by yield (A: more.com sitemap-driven + listing-microdata rewrite, Attica filter; A: athinorama rekey + rollover retirement + counters; A: ticketservices area JSON + staged fetch + bound; A: RA pagination + isTicketed + stable ids; A: snfcc date skip + URL identity; A: onassis sub-venue from the card; A: megaron hall/price/"Προβολή"/end_date; A: cometogether `__NEXT_DATA__`) |
| **5. Coverage** | Each new feed has a fixture test and a yield baseline | A: ticketservices GNO listings; A: more.com sitemap (2,747 URLs, verified); A: cycladic.gr REST; O: Ηρώδειο whitelist; owner decision: newsletter keep-or-retire after a one-week diff; O: enrichment container jobs installed and exercised through the proxy |

**Owner decisions needed before work starts:** (1) A1/A7 trade-off: proxy-mode guard or DNS forwarder; (2) install the container schedule before or after A3 is understood; (3) newsletter keep or retire; (4) athinorama cinema guide in or out of scope; (5) cometogether.live as a known merchant; (6) which venues get `ticketing` blocks first.

## 5. Appendix — method, verification status, merged findings

**Method.** Orchestrator scouting (read-only) → 13 finder agents (one per source group or pipeline layer) → 5 themed merge agents → adversarial verification (planned: 3 refuters per critical, 2 per high, 1 otherwise) → completeness critic. Runs: 2026-10-06 (7 of 13 finders hit the usage limit), 2026-10-14 (all 13 finders completed; a single merge agent exceeded the output cap; critic ran on the observations and produced 12 gaps), 2026-10-26 (bucketed merge completed: 95 raw → 76 merged findings; 1 of 140 verifier agents completed before the usage limit; critic did not re-run).

**Verification status — read this before acting.** The 76 merged findings below are finder-asserted and merged, **not adversarially verified** (only A04 "ntfy push unconfigured" received a verdict: held, medium). The orchestrator independently reproduced the following from the repo, logs, database and live hosts and stands behind them: A01 (ESERVFAIL log lines on three container runs; halfnote dry-run from the Mac returns 23 events), A02 (`scrape_stats` success=1 rows with 0 events), A03 (`launchctl list` exit 9, no docker jobs), S01/Q06 (live athinorama music guide on 2026-10-06: 127 cards, 52 distinct more.com ticket anchors; save path has no `ticket_url` column), R04 (five hard-coded Benaki rows in `events`, all past-dated, `verified_athens`), S08 (`areaIds.includes('1')` at `scrape-all.ts:915`), T01/T02/T04 (status counts and `ticket_url = url` counts), the live-site staleness (homepage stamp 2026-10-06 09:02 with event dates 6–10 October on 2026-10-14), the publish hang (`watchdog killed CLI after 900s`, exit 143, no `deploy-success`), and the more.com sitemap (2,747 URLs, `/_api/events` → HTTP 500). Everything else carries the finder's evidence pointers (file:line, log line, SQL) and should be re-checked at the cited location before a fix is built on it.

**Severity counts (merged).** critical 6 · high 33 · medium 28 · low 9.

**Where the rest lives.** Full text of every merged finding (claim, impact, recommendation, evidence pointers): `specs/input-pipeline-audit-2026-10-findings.md`. Continuation prompt for the next session: `specs/input-pipeline-audit-2026-10-CONTINUATION.md`. The workflow script and run (`wf_3a414832-908`) are resumable from the session that produced them; the finders and merges are cached, so a resume re-runs only verification and the critic.

### Merged findings (id · severity · title · reporting finders)

Prefixes: A = infrastructure and alerting · T = ticket links · S = more.com, athinorama, ticketservices · R = RA, clubber, halfnote, megaron, cometogether, SNFCC, Onassis, Benaki · Q = save seam, newsletters, source landscape.

| id | sev | title | from |
|---|---|---|---|
| A01 | critical | Outbound guard pre-resolves DNS with node:dns, which returns ESERVFAIL on the internal-only container network | container-dns, alerting-chain |
| A02 | critical | Scrapers swallow fetch/guard errors and record success=1 with 0 events, so the pipeline stays green | container-dns, alerting-chain |
| A03 | high | Daily pipeline is unscheduled: legacy launchd job refused (exit 9) every morning, container jobs never installed | alerting-chain |
| A04 | high | ntfy push silently unconfigured since 2026-09-26; digest listing six 0-event sources had no off-machine channel | alerting-chain |
| A05 | high | Yield canary detects the drop but exits 1 on the first gh call, names one source, and its verdict never leaves the container | alerting-chain, container-dns |
| A06 | high | Deadman SOURCE_DEAD rule counts runs, not time; STALE_DEPLOY outranks it so 16 alerts never named a dead source | alerting-chain |
| A07 | high | Fix design: proxy-mode guard (recommended) vs DNS forwarder in egress; README describes DNS inverted | container-dns |
| A08 | medium | health-check marks a 0-event source 'ok' while raising a CRITICAL alert nobody consumes | alerting-chain |
| A09 | medium | Three first-party scrapers bypass the outbound guard and the call-site test does not cover scraper files | container-dns |
| A10 | low | docker/doctor.sh passes on raw curl while every guarded fetch in the same container is dead | container-dns |
| T01 | critical | Legacy copy-url generator is the only ticket_url writer; tiered resolver is wired into no job | ticket-url-pipeline, ticket-url-live-check |
| T02 | high | 'generated' status hides 318 merchant checkout pages behind the Find label while JSON-LD emits an Offer | ticket-url-pipeline, ticket-url-live-check |
| T03 | high | HEAD validation has never run; enabling it as written would mass-expire live links (DNS errors, Queue-it, DataDome) | ticket-url-pipeline, ticket-url-live-check |
| T04 | high | athinorama 'generated' ticket links are editorial listings, never a checkout | ticket-url-live-check |
| T05 | high | Wiring the resolver as-is would overwrite 130 megaron/onassis event pages with search URLs and write 25 malformed ra.co URLs | ticket-url-pipeline |
| T06 | high | Three host lists and two status vocabularies disagree across validator, classifier, ticket-trust, CTA and the legacy script | ticket-url-pipeline |
| T07 | medium | Venue registry ticketing covers 4 of 356 venues; 161 upcoming 'generated' rows have no tier that can resolve them | ticket-url-pipeline |
| T08 | medium | Tier 1b detail-page extraction is a stub with a stale athinorama exclusion; six legacy ticket scripts are dead | ticket-url-pipeline, ticket-url-live-check |
| T09 | medium | athinorama year-rollover rows publish ticket links to the wrong edition of an event | ticket-url-live-check |
| T10 | medium | door_only_venues marks 19 upcoming RA-sourced rows 'At the door' at venues the code itself says RA sells tickets for | ticket-url-pipeline |
| T11 | medium | ticket_url_resolved column has had no writer since it was added (S103, 2026-05-02) | ticket-url-pipeline |
| T12 | low | Venue mapping writes a dead Half Note calendar URL into ticket_url | ticket-url-live-check |
| Q01 | critical | Scrapers discard source venue identity; save seam stores only venue_name | save-seam-quality |
| Q02 | critical | Gated email ingest examines only one message per run (UID list truncated by node-imap) | ingest-newsletters |
| Q03 | high | Whitelist match is first-match substring and filter-athens-only overwrites venue_name in place | save-seam-quality |
| Q04 | high | No ingest-time city gate; post-save blacklist is Greece-only, substring-based and ordered before the whitelist | save-seam-quality |
| Q05 | high | Single-venue scrapers hardcode the parent venue and verified_athens at scrape time | save-seam-quality |
| Q06 | high | Athinorama event pages expose merchant ticket URLs in JSON-LD that the scraper never reads | source-landscape |
| Q07 | high | Exhibition/museum coverage is effectively empty and the Benaki scraper's hardcoded fallback masks it | source-landscape |
| Q08 | high | No import step exists: the newsletter channel has never written an event to events.db | ingest-newsletters |
| Q09 | high | 302 legacy email files are permanently unparseable and rescanned every run | ingest-newsletters |
| Q10 | medium | Title-keyed event ids for 8 of 10 sources; ON CONFLICT never updates venue, date or location_status | save-seam-quality |
| Q11 | medium | Addresses on shown rows come from a name-keyed post-hoc geo backfill with wrong or garbled master entries | save-seam-quality |
| Q12 | medium | Two divergent Athens filters are live: upsertEvent uses a hardcoded blacklist with an assume-Athens default | save-seam-quality |
| Q13 | medium | more.com scraper self-caps at 40 events/run while more.com declares a sitemap and an events API namespace | source-landscape |
| Q14 | medium | Greek National Opera and other ticketservices-sold organisers reach the site only via athinorama | source-landscape |
| Q15 | medium | Newsletter zero yield is silent: no fetched/unaccounted line, non-fatal exit, no monitor | ingest-newsletters |
| Q16 | medium | Newsletter parser coverage gap: pipeline bypasses the registry, parsers yield nothing usable, 6 of 10 formats have no module and no mail | ingest-newsletters, source-landscape |
| Q17 | low | Verified feed inventory for current and candidate sources | source-landscape |
| Q18 | low | Odeon of Herodes Atticus (Ηρώδειο) is absent from the venue whitelist, so all its rows are hidden | source-landscape |
| S01 | critical | athinorama scraper discards available more.com ticket links; resolver excludes athinorama on a stale premise | source-athinorama |
| S02 | high | athinorama URL-slug identity never migrated: import gate freezes 196 legacy-id rows and ON CONFLICT never refreshes start_date/venue_name | source-athinorama |
| S03 | high | 185 of 215 shown athinorama rows are pre-fix year-rollover artifacts with no retirement path | source-athinorama |
| S04 | high | more.com: hard cap of 20 pages × 2 categories ingests ~5% of the catalogue although the listing already carries the full structured catalogue | source-more |
| S05 | high | more.com whole-page regexes serialize runs and tours one row per day and flatten prices; 74% of rows are re-rows of 121 URLs | source-more |
| S06 | high | No Attica filter at ingest for more.com; NATIONWIDE_SOURCES lists only cometogether, so more.com (and ticketservices) 'Πολλαπλοί Χώροι' rows pass through | source-more, source-ticketservices |
| S07 | high | more.com event pages are 302-to-queue-it with the body attached; the scraper survives only by never checking status | source-more |
| S08 | high | ticketservices Athens area gate is a substring test; Heraklion, Larissa, Volos and Arcadia pass | source-ticketservices |
| S09 | high | Stale generic whitelist canonicals rewrite venue_name: fake 'Concert #1 Baumstrasse' label and two hidden Gagarin 205 shows | source-ticketservices |
| S10 | high | ticketservices per-event Puppeteer loop is unbounded (5.4–5.6 h runs), redundant with the static HTML, and swallows per-event failures | source-ticketservices |
| S11 | high | athinorama date logic is unobservable: range-artifact flag discarded, silent card/page skips have no counters, multi-hour scrapes leave no trace | source-athinorama |
| S12 | medium | athinorama detail-page phase: 200+ sequential fetches per run, retries on 4xx, silent per-page failure, stale JSON-LD — while the music card already prints the time | source-athinorama |
| S13 | medium | more.com link regex and category list drop festival sub-events, multi-segment URLs and whole categories (dance, cinema, stand-up comedy) | source-more |
| S14 | medium | ticketservices titles keep raw HTML entities and are hashed into event ids and public slugs; the merchant's stable ids are unused | source-ticketservices |
| S15 | medium | ticketservices scraper discards the page's real venue address; 'address drift' in the decisions queue is best explained by WebFetch summary confabulation | source-ticketservices |
| S16 | medium | athinorama cinema guide is not scraped although config, docs and a live cinema hub assume it; no recorded decision | source-athinorama |
| S17 | medium | scrape_stats never records events_new/events_updated, so a frozen source looked healthy for weeks | source-more |
| S18 | low | Neither scrapeMore nor the athinorama card parser is pinned by a running test | source-more, source-athinorama |
| R01 | high | cometogether discards __NEXT_DATA__ city/address; Athens membership decided by name-only matching | source-halfnote-megaron-cometogether |
| R02 | high | Onassis parser hard-codes 'Onassis Stegi', with-ticket and verified_athens although cards carry sub-venue and ISO dates | source-puppeteer-trio |
| R03 | high | SNFCC invents start_date = today for dateless cards (one new row per day, no end_date) and stamps price 'open' unread | source-puppeteer-trio |
| R04 | high | Benaki scraper has never parsed a real exhibition; four hard-coded past exhibitions are written as verified_athens every run | source-puppeteer-trio |
| R05 | high | RA scraper fetches one page of 100 and silently truncates in high season | source-ra-clubber |
| R06 | high | door_only_venues substring rule overrides RA's advance-price evidence for 20% of upcoming RA rows | source-ra-clubber |
| R07 | medium | Megaron scraper hard-codes building venue and with-ticket and writes no end_date; the detail page has hall, price and date range but the only detail-page pass is skipped in the container | source-halfnote-megaron-cometogether |
| R08 | medium | cometogether ignores __NEXT_DATA__ minPrice, start/end and category: flat '€N' prices lost, all rows date-only, 105/172 typed 'other' and Temple venue-lock flips metal gigs to dj_set | source-halfnote-megaron-cometogether |
| R09 | medium | RA GraphQL selection requests no isTicketed, genre or artist fields; rows are hard-coded type 'concert' / genres ['electronic'] with ticket_url NULL | source-ra-clubber |
| R10 | medium | Megaron typing drift: 'Προβολή' category unmapped (screenings typed theater/concert) and genres ['Classical','Concert'] stamped on every row | source-halfnote-megaron-cometogether |
| R11 | medium | SNFCC category pages mostly surface sidebar/widget cards, not the listing; six category crawls yielded 7 events on the last host run | source-puppeteer-trio |
| R12 | medium | Clubber.gr must stay quarantined: iCal endpoint hangs, RSS is editorial, and scrapeClubber hard-codes door_only on every row | source-ra-clubber |
| R13 | medium | RA TBA price loop: 20 ra.co page fetches per run, 0 prices recovered in all 219 logged runs | source-ra-clubber |
| R14 | medium | Onassis talks typed 'tech': Συζήτηση/Διάλεξη map to 'other' and the shared categorizer's Greek talk keywords take over | source-puppeteer-trio |
| R15 | low | cometogether.live is not a known merchant, so the JSON-LD Offer is omitted for every with-ticket cometogether row although the listing URL is the organiser's checkout | source-halfnote-megaron-cometogether |
| R16 | low | 23:59 start times on 48% of upcoming RA rows are written as trusted scraped times | source-ra-clubber |
| R17 | low | RA venue strings written verbatim: 'TBA - <hint>' creates 21 phantom venues, 'Bios Ρομάντσο' lands on a whitelist entry conflating two buildings, and RA's venue id is discarded | source-ra-clubber |
| R18 | low | Half Note and Megaron compute 'today' in UTC, against the project's Europe/Athens rule | source-halfnote-megaron-cometogether |
