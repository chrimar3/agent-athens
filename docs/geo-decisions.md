# Strategic Decisions Log
## Agent Athens GEO/SEO

Track major decisions here. Each entry should include: what was decided, why, what it replaces, and how to validate it worked.

---

### Decision Template

```
## [Date] — [Decision Title]
**Context:** Why this came up
**Decision:** What we decided
**Reasoning:** Why this over alternatives
**Implementation:** What Claude Code needs to do
**Validation:** How we know it worked
**Replicability:** Would this work for agent-barcelona, agent-berlin?
**Status:** Pending / Implemented / Validated / Revised
```

---

## 2026-02-20 — Hub Page Editorial Template (Answer Capsule + FAQ + Comparison Table)
**Context:** Round 4 Q1 investigated what excellent hub page editorial content looks like for AI citation. BrightEdge shows Travel AI citations jumped from 6% to 18% YoY, with 80%+ coming from outside Google page 1 — niche authority can compete.

**Decision:** Every hub page follows a 5-part template: (1) answer capsule (40–60 words directly answering the primary query), (2) comparison table (event name, venue, date, category, price, editor's pick badge), (3) individual event blocks using "What / Why it matters / What to expect" three-part pattern with attributed quote, (4) FAQ section (4–5 question-answer pairs with `FAQPage` schema), (5) seasonal narrative paragraph updated quarterly. Include a statistic every 150–200 words. Use `ItemList` schema on ranked lists.

**Reasoning:** StoryChief experiment: Q&A is the best-performing GEO format (citations across 17 keywords from single FAQ section). Princeton/Georgia Tech: quotation addition boosts visibility 115% for lower-ranked sites. TimeOut/Lonely Planet analysis reveals the three-part item structure as standard among highest-cited travel pages. The answer capsule pattern — `[Specific claim] + [Value proposition] + [Transition]` — matches AI extraction behavior (44.2% of citations from first 30% of text).

**Implementation:**
1. Answer capsule template: *"Athens hosts over {count} {category} events this week, from {example_1} to {example_2}. This daily-updated guide covers every {category_description} across the Greek capital."*
2. Comparison table: SSR-rendered HTML table with sortable columns (not client-side JS)
3. Event blocks: "What is it?" (1–2 factual sentences) → "Why it matters" (2–3 cultural context sentences) → "What to expect" (1 insider tip). Include attributed quote per block.
4. FAQ: 4–5 questions from the 60-question bank, `FAQPage` schema
5. Seasonal narrative: 200–400 words of genuine seasonal context, updated quarterly

**Validation:** Compare AI citation rates for hub pages with vs. without full template. Track FAQ questions appearing in AI answers.

**Replicability:** Fully replicable. Template is city-agnostic — only cultural specifics change per city.

**Status:** Pending

---

## 2026-02-20 — Variable Enrichment Matrix (Replaces Fixed 150-Word Minimum)
**Context:** Round 4 Q2 found the one-size-fits-all 150-word minimum underserves exhibitions (which justify 200–300 words due to 8× searchability window) and overserves DJ sets (where structured schema data carries the citation load). SE Ranking: 120–180 words between headings = 70% more ChatGPT citations. Pixaura: "800-word post with tight structure outperforms 2,000-word padded article."

**Decision:** Replace the universal 150-word minimum with per-event-type floors and ceilings:

| Event type | Prose min | Prose max | Critical structured fields | Priority info |
|---|---|---|---|---|
| Exhibition | 200 words | 300 words | 8–10 fields | Artist background → curatorial angle → cultural significance → practical |
| Concert (major) | 120 words | 200 words | 7–8 fields | Genre tag → artist context → venue character → practical |
| Concert (local/DJ) | 80 words | 120 words | 6–7 fields | Genre context → vibe description → practical |
| Kids/family | 120 words | 180 words | 10+ fields (many binary) | Age range → language → indoor/outdoor → duration → stroller access |
| Festival (parent) | 250 words | 400 words | 8+ fields + subEvent array | Overview → highlights → historical significance → practical |
| Festival (sub-event) | 80 words | 150 words | Per sub-event type | Inherits venue context from parent |
| Theater (ancient) | 180 words | 250 words | 9–10 fields | Playwright → ancient context → director → language/subtitles |
| Theater (contemporary) | 120 words | 180 words | 8–9 fields | Director → theme → language/subtitles |

Every event: first sentence optimized for extraction — declarative "is" statement naming event, venue, and neighborhood.

**Reasoning:** Exhibition pages have an 8× searchability window (weeks/months vs. single night) — each word works harder longer. Concert listings on Songkick/Bandsintown rely on structured data; prose is secondary. Kids events need binary decision fields (age range, stroller access) as the actual discovery mechanism. Theater in Athens has a unique GEO differentiator: ancient-to-modern connections when staging classical playwrights at historical venues.

**Implementation:**
1. Update enrichment writer project with per-type templates and word count targets
2. Add binary structured fields to kids/family event schema (ageRange, strollerAccess, languageOfEvent, indoorOutdoor)
3. Add ancient context module to theater enrichment template (2–3 sentences when performing Aeschylus, Sophocles, Euripides, Aristophanes or at Epidaurus, Herodion, Theatre of Dionysus)
4. Enrichment priority order unchanged: exhibitions → festivals → kids → concerts → theater → cinema

**Validation:** Compare citation rates across event types at 3-month mark. Track whether lower-investment concert enrichments (80 words) achieve comparable citation rates to higher-investment exhibitions.

**Replicability:** Fully replicable. The matrix applies to any city. Only the "ancient context" theater module is Athens-specific — Barcelona/Berlin substitute their own unique cultural hooks (e.g., Gaudí architecture, Bauhaus movement).

**Status:** Pending — replaces "Event Enrichment Priority Order" word count guidance

---

## 2026-02-20 — Reddit Strategy Reframed (Brand Mentions, Not Links)
**Context:** Round 4 Q3 discovered that AI engines cite Reddit thread URLs directly, NOT the poster's external website. Reddit accounts for 46.7% of Perplexity's top-ten citations (Profound, 4B+ citations) and 21% of Google AI Overview citations. However, YouTube overtook Reddit as top social citation platform in late 2025 (~16% vs ~10% of LLM answers). Reddit's share of social citations fell from 44.2% to 20.3% between August and December 2025.

**Decision:** Reframe Reddit goal from "drive authority links to agent-athens" to "become the recognized Athens cultural events expert whose brand name AI recommends." Tactics:
- Post titles mirror exact user queries: "What cultural events are happening in Athens this February?"
- Provide event info directly in Reddit post — dates, venues, prices, tips
- Mention agent-athens as optional resource (not as link-building exercise)
- Personal founder account, not brand account
- Build 50+ comment karma before any self-promotion
- Comply with 90/10 ratio across entire account history

**Reasoning:** Semrush (248K Reddit posts): title-query semantic alignment is the #1 citation predictor (47% higher similarity in cited vs. non-cited posts). Median cited post: just 5–8 upvotes and 11–19 comments — popularity doesn't drive citation. Comment count is actually a *negative* predictor. Reddit's 90/10 self-promotion rule + shadow ban risks (>70% unintentional) make aggressive link-building counterproductive. Diggity Marketing case study: authentic participation → 642% Reddit referral growth + 2,814% AI referral growth.

**Implementation:**
1. Create personal founder Reddit account (NOT u/agent-athens or similar brand account)
2. Weeks 1–4: Lurk, upvote, comment genuinely in r/GreeceTravel, r/Athens, r/greece
3. Week 4+: First helpful comments with genuine Athens cultural knowledge
4. 50+ karma milestone: First informational post with event roundup
5. Ongoing: Weekly value-first posts, agent-athens mentioned as source no more than 10% of the time
6. Monitor: Track brand name mentions in AI answers (not just link citations)

**Fastest citation path:** Perplexity cites Reddit within days (real-time retrieval). Google AI Overviews within weeks (Reddit-Google exclusivity deal). ChatGPT parametric influence takes months.

**Validation:** Search for "agent-athens" in ChatGPT, Perplexity, and Google AI Mode at 3-month mark. Track whether the brand is recommended even without direct URL citation. Monitor Reddit referral traffic in GA4.

**Replicability:** Fully replicable. Same strategy for r/Barcelona and r/Berlin. Identify city-specific Tier 1 subreddits pre-launch.

**Status:** Pending — refines "Reddit and Community Engagement Strategy"

---

## 2026-02-20 — Citation Stability Understanding (Corrects 40–60% Churn Figure)
**Context:** Round 4 Q4 reconciled conflicting data on citation churn. The "40–60% of cited domains change monthly" figure from Profound was used in earlier strategy documents and created an impression of instability.

**Decision:** Correct the mental model: citation churn is per-regeneration URL noise at the fringe, not domain instability at the core. 96.8% of cited domains show zero week-over-week change (BrightEdge). Among domains that change, 87% are declines (not replacements). Event calendars likely face moderate 20–35% URL-level churn, sharing characteristics with both news (freshness demand) and directory sites (structured data). Organic SEO performance and AI citation performance are 100% correlated (Lily Ray, 11 sites).

**Reasoning:** Two datasets tell different stories: Ahrefs (1.9M citations) found 45.5% of specific URLs rotate per regeneration, but BrightEdge (weekly tracking) found 96.8% domain stability and 99.4% top-brand stability. The reconciliation: AI Overviews pull from a rotating pool of candidate URLs per execution, but the domain citation footprint is stable. This means agent-athens should focus on domain authority (building the footprint) rather than defending individual URL citations.

**Top citation predictors (SE Ranking, 129K domains):** (1) Referring domains (32K+ = 3.5× more likely), (2) Domain traffic >190K monthly, (3) Reddit/Quora brand mentions (10M+ = 7 vs 1.8 citations), (4) Content freshness within 3 months (6 vs 3.6 citations), (5) Content length 2,900+ words (5.1 vs 3.2 citations). Pages with rich schema: 2.8× higher citation rates (AirOps, 45K+ citations).

**Implementation:**
1. Focus on domain-level authority signals (daily freshness, 18 hub topical depth, brand mentions)
2. Don't chase individual URL citation stability — URL rotation is expected
3. Implement full Event schema (Eventbrite: 100% traffic growth after structured data implementation)
4. Archive past events gracefully: keep live 30–60 days with "This event has passed" + links to similar upcoming events, then noindex. Reuse URLs for annual recurring events.

**Validation:** Track Bing WMT AI Performance at domain level, not URL level. Monitor for domain-level stability over 90-day periods.

**Replicability:** Fully replicable — defensive framework is city-agnostic.

**Status:** Pending — corrects citation churn assumptions in earlier documents

---

## 2026-02-20 — Content-Hash Freshness Architecture for Astro
**Context:** Round 4 Q5 confirmed fake freshness is now penalized (Google Dec 2025 core update) and Q7 specified a novel content-hash architecture. No existing static site generator (Hugo, Next.js, Gatsby, Eleventy) uses content hashing for lastmod — all rely on git commit dates or file timestamps. The "500-word update threshold" is a myth (Mueller: "no magical word count target").

**Decision:** Implement SHA-256 content hashing integrated into Astro's build pipeline:

**Build pipeline (10 steps):**
1. Fetch event data
2. Astro builds static pages
3. Content-hash integration extracts editorial blocks via `<!--editorial-start-->` / `<!--editorial-end-->` HTML markers in Astro layouts
4. Strips known dynamic patterns (event counts like "47 concerts", navigation/layout, CSS/JS hashes, auto-generated sidebar content)
5. SHA-256 hashes editorial content only
6. Compares to persisted `.content-hashes.json` manifest (committed to git)
7. Updates lastmod only when hash changes
8. Generates Netlify `_headers` with per-page ETag and Last-Modified
9. Generates split sitemaps: events (lastmod = today) + editorial (lastmod = hash-derived date)
10. Deploy to Netlify

**Hash scope:** Include editorial markdown body + frontmatter (title, description, tags). Exclude dynamic count strings, navigation HTML, CSS/JS asset hashes, auto-generated content.

**Astro sitemap:** Use `@astrojs/sitemap` `serialize` callback for per-page lastmod customization, or create custom `src/pages/sitemap-events.xml.ts` and `src/pages/sitemap-editorial.xml.ts` resource routes. Split sitemaps via `chunks` option (v3.7.0+).

**Netlify headers:** `_headers` file supports per-path ETag and Last-Modified. Generate during `astro:build:done` hook, append to `dist/_headers`. Edge Functions and `_headers` are mutually exclusive per path — use build-time approach.

**Reasoning:** Google Dec 2025 core update explicitly targets date changes without meaningful content updates. Bing: accurate lastmod is most important optional sitemap signal, and 84% of sitemaps set it incorrectly. Raptive analysis: winning pages 393 days since update vs 500 for losers — but content activity only helped sites with baseline authority. Schema dateModified, on-page visible date, and sitemap lastmod must all agree.

**Critical principle:** A daily build producing identical HTML should NOT update dateModified. Show one date on-page (not both published and modified — showing both caused 22% CTR drop in documented case).

**Implementation:**
1. Add `<!--editorial-start-->` / `<!--editorial-end-->` markers to Astro layout templates
2. Create Astro integration that runs during `astro:build:done`
3. Build SHA-256 hashing with dynamic pattern stripping
4. Create `.content-hashes.json` manifest, commit to git
5. Generate split sitemaps with correct lastmod per content type
6. Generate `_headers` with per-page ETag/Last-Modified
7. Add visible `<time>` element for on-page date (single date only)
8. Ensure schema dateModified agrees with sitemap lastmod and visible date

**Validation:** After 3 months: verify hub page lastmod only changes when editorial content changes. Check GSC crawl stats for sitemap trust signals. Compare hub citation rates vs. previous naive-rebuild period.

**Replicability:** Fully replicable. The integration code is identical across cities — only content collections change.

**Status:** Pending — extends and specifies "Quarterly Refresh Cadence" architecture

---

## 2026-02-20 — New Schema.org Event Subtypes (PerformingArtsEvent + ConferenceEvent)
**Context:** Schema.org v29.4 (December 8, 2025) introduced `PerformingArtsEvent` and `ConferenceEvent` as new Event subtypes. These are directly relevant to agent-athens and few sites have adopted them yet — early-mover advantage.

**Decision:** Implement both subtypes immediately:
- `PerformingArtsEvent`: Use for theater events involving classical/historical material, opera, ballet, any performing arts that don't fit MusicEvent or TheaterEvent precisely
- `ConferenceEvent`: Use for any conference, symposium, or lecture-series events

Update the Schema.org mapping table:

| Category | Schema.org Type |
|---|---|
| Theater (ancient drama/classical) | PerformingArtsEvent |
| Theater (contemporary) | TheaterEvent |
| Conference/symposium/lecture | ConferenceEvent |
| All others | Unchanged from current mapping |

**Reasoning:** Google treats subtypes identically for rich results today, but subtypes add semantic precision for knowledge graphs and textual context for AI engines. Being among the first to implement new subtypes positions agent-athens as a technically sophisticated source — a signal of authority. Zero downside, low effort.

**Implementation:**
1. Add `PerformingArtsEvent` and `ConferenceEvent` to event type mapping config
2. Update schema generation templates
3. Theater categorization: if performing Aeschylus, Sophocles, Euripides, Aristophanes, or opera/ballet → `PerformingArtsEvent`; contemporary theater → `TheaterEvent`
4. Conference/lecture detection: keyword matching in event titles (conference, symposium, lecture, workshop)

**Validation:** Verify subtypes appear correctly in Google Rich Results Test. Monitor Schema.org for additional subtypes in future releases (check quarterly).

**Replicability:** Fully replicable. Same subtypes apply to any city.

**Status:** Pending

---

## 2026-02-20 — DeepL Caching Architecture
**Context:** Round 4 Q6 confirmed DeepL Free (500K chars/month) fits one city with smart caching but exceeds without it (~540K–750K uncached vs ~200K–350K cached). Content-hash-based caching avoids re-translating unchanged content.

**Decision:** Implement JSON translation cache committed to git, keyed by content hash:
- Phase 1 (Athens): DeepL API Free + content-hash caching. Google Cloud Translation API as fallback.
- Phase 2 (3 cities): Multi-provider free tier: DeepL (Greek, 500K), Google Cloud Translation (Spanish, 500K), Azure Translator (German, 2M). Total: $0. If too complex, DeepL Pro at ~$24/month.

**Cache architecture:**
- JSON file: `translation-cache.json` committed to git
- Key: SHA-256 hash of source text
- Value: translated text + DeepL metadata (target language, timestamp)
- Steady-state cache hit rate: 85–95% (most events persist across daily rebuilds)
- Monitor via DeepL `/v2/usage` endpoint

**Greek-specific rules:**
- Cultural terms kept in Greek with explanatory text: μπουζούκι (bouzouki), ρεμπέτικο (rebetiko), τσικνοπέμπτη (Tsiknopempti)
- DeepL Greek quality: ~7–8/10 (adequate for event descriptions, weaker on cultural nuance)
- Entity Locking for venue names, artist names, neighborhood names

**Reasoning:** Without caching, Athens alone exceeds free tier. With caching, comfortable headroom (150–300K unused). Multi-provider free tier for 3 cities avoids any cost. DeepL terms allow free-tier reduction "at all times" — fallback strategy needed.

**Implementation:**
1. Build translation cache module (JSON + SHA-256)
2. Integrate into Astro build pipeline: check cache → call DeepL only for new/changed content
3. Add `/v2/usage` monitoring to build output
4. Implement Google Cloud Translation as fallback
5. Entity Locking list: venue names, artist names, neighborhoods, cultural terms

**Validation:** Monitor monthly character usage. Track cache hit rate. Compare DeepL output quality with native Greek speaker review (sample of 50 descriptions at 3-month mark).

**Replicability:** Fully replicable. Cache architecture is identical across cities. Only translation provider assignment changes per language.

**Status:** Pending

---

## 2026-02-20 — Neos Kosmos Neighborhood Addition
**Context:** Round 4 Q8 evaluated neighborhood additions. Neos Kosmos anchors two of Athens' most significant cultural institutions and has a recognized cultural renaissance.

**Decision:** Add Neos Kosmos to the neighborhood mapping. It takes priority over Makrygianni if only one addition is possible. Key venues: Onassis Stegi (premier multidisciplinary arts space, hosts Block Party and Borderline festivals, year-round programming), EMST — National Museum of Contemporary Art (in former Fix brewery), multiple galleries. Wikidata QID: Q12878997. This Is Athens lists it as one of 13 downtown neighborhoods with two dedicated guide articles.

Also consider Ampelokipoi for Megaron Mousikis (Athens Concert Hall) — one of Europe's premier concert venues with 400+ performances/year. Wikidata QID: Q758136.

Do NOT add Anafiotika (part of Plaka, ~50 houses, zero event venues) or Syntagma (transport hub, not cultural neighborhood).

**Implementation:**
1. Add Neos Kosmos to neighborhood config: QID Q12878997, coordinates, tourist tier
2. If adding Ampelokipoi: QID Q758136
3. Update containedInPlace chain for venues in these neighborhoods
4. Add neighborhood context sections to relevant hub pages

**Validation:** Verify Wikidata QIDs resolve correctly. Check that venues in Neos Kosmos (Onassis Stegi, EMST) map to the neighborhood.

**Replicability:** N/A — Neighborhood decisions are city-specific by design.

**Status:** Pending

---

## 2026-02-20 — Makrygianni Neighborhood Resolution
**Context:** Round 4 Q8 resolved the Makrygianni question from Round 3's open research areas.

**Decision:** If the current 13 neighborhoods include a combined "Acropolis/Koukaki" entry, split it into "Koukaki" and "Makrygianni" (reaching 14 without geographic overlap). Use "Makrygianni" as canonical name with "Acropolis area" as prominent English alias (tourists search "near Acropolis" not "Makrygianni" — metro station is "Akropoli").

Key venues: Acropolis Museum (Athens' #1 museum), Ilias Lalaounis Jewelry Museum, Centre for Acropolis Studies. Borders Odeon of Herodes Atticus and Theatre of Dionysus. Wikidata QID: Q2614281.

**Reasoning:** Lonely Planet/Frommer's list combined "Koukaki & Makrigianni." TripAdvisor treats as distinct. Wikipedia has separate article. Wikidata has distinct QID. Venue density justifies separate entity for Schema.org precision.

**Implementation:**
1. If combined entry exists: split "Acropolis/Koukaki" → "Koukaki" + "Makrygianni"
2. Add QID Q2614281 with coordinates to neighborhood config
3. Add `alternateName: "Acropolis area"` in schema for English discoverability
4. Map Acropolis Museum, Herodion, Theatre of Dionysus to Makrygianni in venue config

**Validation:** Verify geographic accuracy — Makrygianni sits between Koukaki and the Acropolis slopes.

**Replicability:** N/A — Neighborhood decisions are city-specific.

**Status:** Pending — conditional on current neighborhood structure

---

## 2026-02-20 — GEO Monitoring Cadence
**Context:** Round 4 Q9 identified three developments requiring monitoring: Bing AI Performance (launched Feb 9, 2026), Google AI Mode expansion, and market share shifts (Grok surpassing Perplexity). A structured cadence prevents ad-hoc reactions.

**Decision:** Three-tier monitoring cadence:

**Weekly (15 minutes):**
- Check Google Search Console for AIO impression changes
- Check Bing Webmaster Tools AI Performance
- Scan Search Engine Roundtable for algorithm signals
- Manual spot-check: ask "what cultural events are happening in Athens this weekend?" across ChatGPT, Perplexity, and Google AI Mode

**Monthly (1 hour):**
- Review Google Search Central Blog and Bing Webmaster Blog
- Check OpenAI and xAI news for crawling/citation changes
- Audit schema.org Event markup for new properties
- Run HubSpot AI Search Grader (free)
- Review GA4 AI referral channel data

**Quarterly (2–3 hours):**
- Full schema.org releases review
- AI search market share assessment (SimilarWeb, First Page Sage)
- Competitor audit (ThisIsAthens, WhyAthens, TimeOut, AllEvents)
- Reddit presence review and strategy adjustment
- New AI travel tool assessment
- Regulatory developments (UK CMA, EU)

**Monitor 6 platforms:** Google AI Overviews/AI Mode, ChatGPT, Perplexity, Gemini, Copilot, Grok.

**Recommended paid tool (when budget allows):** Otterly.AI Lite ($29/month) for continuous multi-platform citation tracking.

**Implementation:**
1. Set up Bing Webmaster Tools (immediate)
2. Create weekly 15-minute calendar block
3. Create monthly 1-hour calendar block
4. Create quarterly 2–3 hour review session
5. Document findings in a monitoring log (append to decisions log or separate file)

**Validation:** After 90 days, assess whether the cadence catches relevant changes before they impact citation performance.

**Replicability:** Fully replicable. Same cadence per city, can be batched.

**Status:** Pending

---

## 2026-02-19 — GEO Measurement Stack
**Context:** Need to measure AI engine citations with zero budget. GEO measurement landscape matured in Feb 2026 with Bing AI Performance report.

**Decision:** Implement 4-layer free measurement stack: Bing AI Performance + GA4 AI referral channel + Netlify Observability bot monitoring + HubSpot AEO Grader monthly. Add Otterly.ai Lite ($29/mo) at 50+ pages.

**Reasoning:** First-party Bing data is the only official citation metric available. GA4 catches click-through referrals. Netlify logs catch crawler activity. HubSpot provides free cross-engine visibility snapshots. Together they cover the measurement landscape without cost.

**Implementation:**
1. Register Bing Webmaster Tools, verify site, enable AI Performance
2. Create GA4 custom channel group with AI referral regex matching `(chatgpt\.com|chat\.openai\.com|perplexity\.ai|claude\.ai|gemini\.google\.com|copilot\.microsoft\.com)` — place ABOVE "Referral" in priority order
3. Enable Netlify Observability, set up monthly bot analysis using `Netlify-Agent-Category` header (`ai-agent` = user-triggered, `ai` = bulk crawlers)
4. Run first HubSpot AEO Grader snapshot as baseline
5. Set up monthly log analysis script:
```bash
grep -Ei "gptbot|oai-searchbot|chatgpt-user|claudebot|perplexitybot|google-extended" access.log | awk '{print $1,$4,$7}' | sort | uniq -c | sort -rn
```

**Validation:** After 90 days, compare Bing citation trends with GA4 referral data and Netlify bot patterns. If correlations emerge, the stack is working. If not, evaluate Otterly.ai or Ahrefs Brand Radar.

**Replicability:** Fully replicable. Same stack works for any city. Only the HubSpot AEO Grader prompts and GA4 property change per city.

**Status:** Pending

---

## 2026-02-19 — Bilingual Content Strategy
**Context:** Athens serves 40.7M international tourists/year. AI Overviews match query language 96% of the time (Weglot 1.3M citation study). Greek-only = invisible to English queries. English-only = invisible to Greek queries.

**Decision:** Full bilingual site — Greek primary (root), English parallel (`/en/`). Reciprocal hreflang on every page. `x-default` = Greek.

**Reasoning:** Weglot study shows 431% citation gap for untranslated sites, closing to 22% for bilingual. Translated sites get 24% more citations even in original language. 40.7M annual tourists searching in English represent a massive audience no competitor serves bilingually. ChatGPT often cites English URLs regardless of query language. Google AI Overviews strictly match query language.

**Implementation:**
1. Create `/en/` subdirectory structure mirroring root
2. Add English event titles + descriptions to data pipeline
3. Implement reciprocal hreflang tags on every page (Greek ↔ English)
4. Prioritize translating: category landing pages → weekend roundups → event listings
5. Use consistent translation for venue names and event types
6. Do not mix languages on the same page
7. English domain name ("agent-athens") already signals English relevance

**Validation:** Compare GA4 traffic by language segment. Monitor Bing AI Performance for English vs Greek grounding queries. Run HubSpot AEO Grader in both languages monthly.

**Replicability:** Fully replicable. Each city instance uses local language as primary + English as parallel. Config: `primaryLanguage: "el"`, `secondaryLanguage: "en"`, `primaryPath: "/"`, `secondaryPath: "/en/"`. For agent-barcelona: `primaryLanguage: "es"`, etc.

**Status:** Pending

---

## 2026-02-19 — Schema.org Event Subtype Mapping
**Context:** Site uses generic `Event` @type. Google treats all subtypes identically for rich results, but specific subtypes add semantic precision for knowledge graphs and AI engines that read JSON-LD as text.

**Decision:** Map each event category to its most specific Schema.org subtype. Fall back to generic `Event` only when no subtype fits.

**Reasoning:** Zero downside to specificity. Future-proofs for potential Google differentiation. AI engines read JSON-LD as text, so richer semantic data provides additional context for citation. Google's June 2025 physical-location requirement aligns with our events.

**Mapping:**

| agent-athens Category | `@type` | Priority Properties |
|---|---|---|
| Συναυλίες (Concerts) | `MusicEvent` | `performer`, genre via `about` |
| Θέατρο (Theater) | `TheaterEvent` | `workPerformed`, `performer` |
| Εκθέσεις (Exhibitions) | `ExhibitionEvent` | `organizer`, long date ranges |
| Σινεμά (Cinema) | `ScreeningEvent` | `workPresented` as Movie |
| Φεστιβάλ (Festivals) | `Festival` | `subEvent` for individual acts |
| Παιδικά (Kids) | `ChildrensEvent` | `typicalAgeRange` |
| Κωμωδία (Comedy) | `ComedyEvent` | `performer` |
| Χορός (Dance) | `DanceEvent` | `performer` |
| Ομιλίες (Talks) | `EducationEvent` | `performer` for speaker |
| Λογοτεχνία (Literary) | `LiteraryEvent` | `performer` for author |
| Φαγητό/Κρασί (Food) | `FoodEvent` | — |
| Default/Other | `Event` | Generic fallback |

**Implementation:**
1. Add subtype mapping to event classification pipeline (config-driven, not hardcoded)
2. Ensure every event includes: `name`, `startDate` (ISO 8601 with timezone `+02:00`/`+03:00`), `location` (with full `PostalAddress` including `addressCountry: "GR"`), `description`, `image`, `offers` (with `priceCurrency: "EUR"`), `eventStatus`, `url`
3. Use `EventSeries` for festivals with `subEvent` links
4. Validate all markup via Google Rich Results Test

**Validation:** Check Google Search Console Enhancement report for Event rich result eligibility. Test 5 sample pages in Rich Results Test after implementation.

**Replicability:** Fully replicable. Category-to-subtype mapping is config per city. Only `addressCountry`, `priceCurrency`, and timezone change.

**Status:** Pending

---

## 2026-02-19 — Consolidate Combinatorial Pages to Hub Architecture
**Context:** 315 combinatorial pages (type × time × price × genre), many with 0 events. Google's Helpful Content System penalizes site-wide for thin pages. AI engines cite 2–7 domains per response and prefer comprehensive single sources.

**Decision:** ~~Restructure to 15–25 editorially enriched hub pages~~ **REVISED (Round 3):** Restructure to **18 hub pages** (10 Tier 1 + 7 Tier 2 + 1 conditional) + individual event pages. 301-redirect remaining combinatorial pages to nearest hub. Never serve 0-result pages.

**Reasoning:** Consolidated pages get 3.2× more AI citations. 82.5% of AI Overview citations go to deep content. Programmatic SEO with low differentiation has ~60% failure rate within 18 months. 315 pages filtering the same database fail the 85% similarity test. John Mueller explicitly recommends "fewer, stronger pages." Round 3 competitor analysis (ThisIsAthens, WhyAthens, TimeOut, AllEvents) validated specific taxonomy.

**The 18 hubs:**

*Tier 1 — Must-have (10 hubs):*

| # | Slug | Schema.org subtype | Demand signal | Inventory risk |
|---|------|--------------------|---------------|----------------|
| 1 | `/concerts` | MusicEvent | Songkick 76+; Bandsintown 49+ | LOW |
| 2 | `/theater` | TheaterEvent | Tripadvisor category; 200+ venues | LOW |
| 3 | `/exhibitions` | ExhibitionEvent | WhyAthens hub; 70+ museums | LOW |
| 4 | `/nightlife` | Event (generic) | ★★★★★ highest competitor volume | LOW |
| 5 | `/this-weekend` | ItemList of Events | "things to do Athens this weekend" — no competitor has static URL | NONE |
| 6 | `/today` | ItemList of Events | Captures "today" + "tonight" — no competitor has static URL | NONE |
| 7 | `/festivals` | Festival | ThisIsAthens lists 34; always forward-looking | LOW |
| 8 | `/live-music` | MusicEvent | ThisIsAthens `/nightlife/live-music` exists | LOW |
| 9 | `/kids` | ChildrensEvent | Family travel growing; SNFCC year-round | LOW |
| 10 | `/open` | Event + isAccessibleForFree:true | Multiple "free things to do" guides rank well | LOW |

*Tier 2 — Strong candidates (7 hubs):*

| # | Slug | Schema.org subtype | Rationale |
|---|------|--------------------|-----------|
| 11 | `/cinema` | ScreeningEvent | 65 open-air cinemas (May–Oct) + indoor year-round |
| 12 | `/dance` | DanceEvent | WhyAthens hub; Onassis Stegi + Megaron program dance |
| 13 | `/classical-music` | MusicEvent (genre:classical) | Megaron Concert Hall Oct–June season |
| 14 | `/this-month` | ItemList of Events | Trip-planning intent; monthly auto-refresh |
| 15 | `/with-ticket` | Event + Offer | Commercial intent complement to `/open` |
| 16 | `/comedy` | ComedyEvent | Limited but growing English-language scene |
| 17 | `/greek-music` | MusicEvent | Rebetiko (UNESCO) + entechno + laïko combined |

*Tier 3 — Conditional (1 hub):*

| # | Slug | Rationale |
|---|------|-----------|
| 18 | `/jazz` | Half Note ~200 shows Oct–May; include only if ≥3 jazz events/week consistently |

**Hubs NOT recommended:** `/opera` (merge into `/classical-music`), `/outdoor` (seasonal May–Oct only; tag not hub), `/workshops` (blurs events/activities), `/new-this-week` (overlaps `/today` + `/this-weekend`)

**Implementation:**
1. Build 10 Tier 1 hubs first with 7-layer editorial structure
2. Add Tier 2 hubs as editorial content is ready
3. Validate `/jazz` inventory before building Tier 3
4. 301-redirect remaining combinatorial URLs to nearest hub
5. Implement minimum 5-event threshold — 302-redirect to parent category when below
6. Never serve a page with 0 events
7. Do NOT add new combinatorial dimensions (neighborhoods, specific dates)

**Validation:** Monitor GSC indexing rate (target >90% indexed). Track pages-per-session and bounce rate improvements. Monitor AI citation coverage via Bing AI Performance after 90 days.

**Replicability:** Fully replicable. Same taxonomy works for Barcelona and Berlin with minimal adaptation — swap `/greek-music` for `/flamenco` or `/electronic-music`. Hub selection is config-driven per city.

**Status:** Pending — **Updated with Round 3 specifics**

---

## 2026-02-19 — Phased Venue Page Strategy
**Context:** Venue pages could strengthen entity authority and capture "where to see X in Athens" queries, but thin venue stubs risk HCU site-wide penalty. Content-rich pages with JSON-LD are 3× more likely to appear in AI Overviews.

**Decision:** Phase 1: Launch 20–30 content-rich venue pages for major Athens cultural venues (300–500 words unique editorial each). Phase 2: Add mid-tier venues only when editorial content is ready. Phase 3: Aggregate smaller venues into neighborhood guide pages. No stub pages ever.

**Reasoning:** Princeton GEO research shows AI bias toward third-party authoritative sources. `sameAs` links to Wikidata strengthen entity recognition. But thin stubs risk site-wide quality penalty under HCU. Phased approach balances authority-building against quality risk.

**Venue Schema.org mapping:**

| Venue Category | `@type` |
|---|---|
| Concert halls, Odeia | `PerformingArtsTheater` |
| Theaters (drama) | `PerformingArtsTheater` |
| Art galleries | `ArtGallery` |
| Cinemas | `MovieTheater` |
| Nightclubs/live music | `NightClub` |
| Multi-use cultural centers | `EventVenue` |
| Museums | `Museum` |
| Outdoor amphitheaters | `EventVenue` |
| Bars with live music | `["EventVenue", "BarOrPub"]` |

**Implementation:**
1. Identify top 20–30 venues by event frequency (config-driven per city)
2. Write unique editorial descriptions: atmosphere, programming focus, neighborhood context, transit, accessibility, practical tips
3. Implement venue-specific Schema.org types with `sameAs` links (official site, Wikidata, Wikipedia, Google Maps)
4. Include `event` property linking to upcoming events, bidirectional with event pages
5. Add `amenityFeature` for accessibility info
6. `noindex` any venue page below content threshold until enriched

**Validation:** Monitor venue pages in GSC for indexing and impressions. Check if venue names appear in Bing AI Performance grounding queries. Track "where to [activity] in Athens" queries for citation appearance.

**Replicability:** Fully replicable. Venue selection by event frequency is automated. Schema.org type mapping is config per city. Only the editorial content and venue list change per city.

**Status:** Pending

---

## 2026-02-19 — Niche Authority Backlink Strategy
**Context:** New domain with zero authority. AI citations have a threshold effect — 32K+ referring domains for ChatGPT citation boost (unreachable short-term). But niche authority + brand mentions + content freshness are viable paths.

**Decision:** Prioritize niche topical authority over raw backlink volume. Three-tier approach: (1) Foundation links + Reddit/community presence, (2) Local cultural institution partnerships, (3) Digital PR with original data. Target 15–25 quality city-specific backlinks in first 6 months.

**Reasoning:** Brand search volume is the strongest AI citation predictor (0.334 correlation). Perplexity has a niche authority exception — deeply authoritative niche sites beat generalist high-DA sites. Travel/tourism has low citation concentration, rewarding specific user needs. Nofollow links carry nearly equal weight for AI visibility. Outbound citations to authoritative sources improve trust scores.

**Implementation (Athens-specific targets, generalizable pattern):**

*Tier 1 — Foundation (Weeks 1–4, Free):*
1. Register Bing Webmaster Tools + Google Search Console
2. Submit events to Eventbrite, AllEvents.in, Facebook Events
3. Post weekly event roundups on Reddit (r/athens, r/greece, r/travel)
4. Cite authoritative sources in own content (VisitGreece.gr, Wikipedia, SNFCC)

*Tier 2 — Local Authority (Months 1–3, Free):*
5. Submit to thisisathens.org, visitgreece.gr, cultureisathens.gr
6. Contact major venues (SNFCC, Onassis, Megaron) — offer to promote events, request resource link
7. Pitch expat/travel media (XpatAthens, WhyAthens, Athens Insider) for content partnerships
8. Contact cultural institutes (British Council, French Institute, Goethe-Institut)

*Tier 3 — Scaling (Months 3–6):*
9. Publish original data ("Most Popular Cultural Events in Athens by Season") as linkable assets
10. Submit to Greeka, Discover Greece, Greek Travel Pages
11. Broken link building on Athens tourism pages

**Validation:** Track referring domains in Ahrefs/GSC monthly. Monitor brand search volume in Google Trends. Check Reddit mention volume. Correlate with AI citation data from Bing AI Performance.

**Replicability:** Pattern is universal: (1) official tourism board, (2) major cultural institutions, (3) expat/travel media, (4) universal event platforms, (5) Reddit/community, (6) embassy/cultural institutes. Only the specific targets change per city. Maintain a per-city link target config.

**Status:** Pending

---

## 2026-02-19 — llms.txt: Maintain, Don't Invest
**Context:** llms.txt already exists on site. SE Ranking 300K domain study shows zero correlation with AI citations. Google's Mueller compares it to keywords meta tag. No AI platform confirms using it.

**Decision:** Keep existing llms.txt as-is. Do not create llms-full.txt. Do not invest further time. Zero priority.

**Reasoning:** Zero evidence of benefit from 300K domain study, Semrush/Search Engine Land server log experiments, OtterlyAI 90-day experiment, and Google's explicit statements. The primary use case (developer API docs for AI coding assistants) doesn't match a cultural events calendar. Opportunity cost of maintaining dynamic llms-full.txt is unjustified.

**Implementation:** No action needed — file already exists. Review in 6 months if any AI platform announces support.

**Validation:** Monitor Netlify logs for AI bot requests to `/llms.txt`. If any platform announces support, reassess.

**Replicability:** N/A — already a static file that requires no per-city customization.

**Status:** Decided — No Action

---

## 2026-02-19 — Hub Page Editorial Structure for AI Citability
**Context:** Need to define the content architecture for hub pages to maximize AI engine citations. Research from Princeton GEO, Kevin Indig (3M ChatGPT responses), SE Ranking (129K domains), and Ahrefs (174K pages) converged on structural principles.

**Decision:** Each hub follows a 7-layer structure: answer capsule → question-headed editorial sections (120–180 words each) → FAQ with schema → SSR event listings → timestamp. Target 1,500–2,500 words editorial + dynamic listings. 60/40 editorial-to-listing ratio.

**Reasoning:** Princeton GEO study shows statistics/citations/quotations boost visibility 30–40%. Kevin Indig (3M ChatGPT responses) proves 44.2% of citations come from first 30% of text. SE Ranking (129K domains) shows 120–180 word sections and 19+ data points optimal. Ahrefs (174K pages) shows word count itself is near-zero correlated (Spearman r = 0.04) — structure and information density matter more than length. 53.4% of all citations go to pages under 1,000 words. The 2,500-word target is a ceiling, not a floor.

**Nuance vs. earlier consolidation decision:** The original "2,500+ words" target per hub was a floor. This research revises it to a range (1,500–2,500) where structure and density are the actual drivers. A 1,800-word hub with 19+ statistics and question-based headings will outperform a 3,000-word padded hub.

**Implementation:**
1. Create hub page template with 7-layer structure in the static site generator:
   - Layer 1: Opening answer capsule (120–150 chars) directly answering "what is [category] in Athens?"
   - Layer 2: Question-based H2/H3 editorial sections (120–180 words each), 19+ statistics/data points per hub, 20%+ proper noun density (venues, artists, neighborhoods, festivals)
   - Layer 3: FAQ section (5–8 questions) with FAQPage schema markup
   - Layer 4: Server-side-rendered event listings with Event schema in JSON-LD
   - Layer 5: Visible "Last Updated" timestamp reflecting actual content changes
   - Layer 6: Bi-directional linking to spoke (event) pages
   - Layer 7: Related hubs cross-links
2. Write opening answer capsules for each of 18 hubs
3. Target balanced analyst tone — subjectivity score ~0.47 (fact + interpretation, not pure opinion)
4. Embed attributed quotes and comparison tables where natural
5. Set quarterly editorial refresh calendar (cosmetic updates without meaningful content changes don't help)
6. Ensure all event listings are server-side rendered in HTML (GPTBot, ClaudeBot, PerplexityBot do NOT execute JavaScript)

**Validation:** Track AI citation rates via Bing AI Performance, HubSpot AEO Grader, and GA4 AI referral segments. Compare citation rates pre/post hub launch. Target: appear in AI Overviews for ≥3 fan-out queries per hub within 90 days.

**Replicability:** Fully replicable. Hub template is config-driven — only content, language, and entity data change per city. The 7-layer structure, section length targets, and FAQ schema pattern are universal.

**Status:** Pending

---

## 2026-02-19 — Tiered Translation Quality Strategy
**Context:** Bilingual strategy (Greek root + English /en/) requires translating hubs, roundups, listings, and venue pages. Need to determine minimum viable translation quality for each content type.

**Decision:** Four-tier approach: (1) Hub pages: DeepL + full human review; (2) Weekend roundups: DeepL + light review; (3) Event listings: DeepL, no review; (4) Venue descriptions: DeepL + light review. Entity Locking for untranslatable cultural/venue terms.

**Reasoning:** Weglot study (1.3M citations) shows translation boosts English-query visibility 327%. Google officially softened MT stance June 2025 — no longer recommending blocking MT content. No evidence AI engines detect or penalize MT specifically; they evaluate content quality holistically. DeepL outperforms Google Translate 1.3× per blind tests. Tiered approach matches investment to page value and shelf life.

**Key evidence:**
- Google (June 11, 2025): "Our policies do not strictly define content that has been translated by AI as spam"
- Reddit precedent: Google had no objections to massive AI translation initiative (tens of millions of pages)
- Glenn Gabe (December 2025): Google and Bing handle hreflang well; ChatGPT frequently returns wrong language version — dedicated /en/ URLs matter more than hreflang for non-Google AI engines
- ~80% of Weglot's 110K+ users publish translations without manual edits
- No study found directly A/B-testing human vs. machine translation for AI citation rates — this is an honest gap

**Implementation:**
1. Set up DeepL API integration in build pipeline (free tier: 500K chars/month — monitor usage, may need paid tier as multi-city scales)
2. Create Entity Locking list of Greek terms/venue names that bypass translation (e.g., "bouzouki," "rebetiko," "Megaro Mousikis")
3. Translate all 18 hub pages through DeepL; queue for human review (~30 min per hub)
4. Automate event listing translation in daily build (no review required)
5. Translate 20–30 venue descriptions; queue for light review (~10 min each)
6. Implement hreflang tags with self-referencing on every page pair
7. Verify /en/ URLs are independently crawlable (not solely reliant on hreflang signals)

**Validation:** Compare AI citation rates between Greek and English versions using HubSpot AEO Grader. Monitor Google Search Console for hreflang errors. Track English-language AI referral traffic in GA4.

**Replicability:** Fully replicable. DeepL supports Spanish (Barcelona) and German (Berlin). Tier structure transfers — only Entity Locking lists and language pairs change per city. Barcelona adds Catalan consideration; Berlin uses formal German defaults.

**Status:** Pending

---

## 2026-02-19 — Event Enrichment Priority Order
**Context:** 57% of events are unenriched. Need to determine which event types to enrich first for maximum AI citation ROI.

**Decision:** Three-tier priority: (1) Exhibitions → Festivals → Kids events; (2) Concerts (niche genres) → Theater; (3) Cinema last. Minimum enrichment: 150+ word description + complete schema per event.

**Reasoning:** One Further (100 UK cultural orgs) shows exhibitions/events most resilient to AI disruption. Exhibitions have 8× searchability window vs one-night concerts. Kids events serve 26% of Athens visitors (families) and are explicitly favored by AI Mode's multi-criteria query decomposition. Cinema has lowest ROI due to aggregator dominance (IMDB, Rotten Tomatoes, Google's own listings). Presence AI (1,200+ pages) shows quality threshold at ~150 words separates 18–25% from 48–72% citation rates. Concert enrichment should prioritize niche genres (rebetiko, jazz, classical, Greek folk) where competition is lower.

**Key evidence:**
- Exhibitions: 8× searchability window, most AI-resilient content type (One Further)
- Kids events: 26% of Athens visitors are families (EXAAA survey), AI Mode decomposes family queries into multi-criteria sub-queries favoring well-enriched listings
- Concerts: highest raw volume but fiercest competition; niche genres (rebetiko, jazz, classical) offer better positioning than mainstream acts
- Cinema: dominated by global aggregators, lowest competitive advantage
- Quality threshold: 150–200 words with structured schema = citability jump from 18–25% to 48–72% (Presence AI)

**Implementation:**
1. Audit current enrichment status by event type (count unenriched per category)
2. Create enrichment template: 150-word minimum with fields for performer background, venue context, genre, price range, accessibility
3. Enrich all current/upcoming exhibitions first (longest active window = immediate ROI)
4. Enrich all festival events and kids events next
5. For concerts, prioritize rebetiko, classical, jazz, and Greek folk over mainstream
6. Cinema enrichment only after all other types are complete
7. Add specific Schema.org subtypes to every event (already decided — see Schema.org mapping)

**Validation:** Track citation rates by event type in HubSpot AEO Grader. Compare enriched vs unenriched event citation rates after 30/60/90 days. Target: ≥40% of enriched events appearing in at least one AI response within 90 days.

**Replicability:** Priority order transfers with city-specific adjustments. Barcelona: architecture events and fiestas enter Tier 1. Berlin: film events (Berlinale ecosystem) and club/electronic music rank higher. The enrichment template and minimum quality threshold (150+ words) are universal.

**Status:** Pending

---

## 2026-02-19 — Neighborhood Context as Hub Sections, Not Separate Pages
**Context:** Need to determine whether hub pages should incorporate neighborhood context and at what granularity. Local queries trigger AI Overviews 40.2% of the time (Local Falcon, 60K queries).

**Decision:** Weave neighborhood context into hub pages as structured sub-sections (150–300 words each). No standalone neighborhood pages unless 2,000+ words of unique content is justified. Implement `containedInPlace` schema chaining on all events/venues.

**Reasoning:** Local Falcon (60K queries) shows 40.2% of local queries trigger AI Overviews. All Athens neighborhoods are Knowledge Graph entities (Plaka = Q1231816 etc.). Manning Search Marketing documents 80% ranking loss from suburb-specific thin pages after Google's March 2024 Core Update. Time Out, SantoriniDave, and other competitors use hub-with-sections model. This aligns with 315→18 consolidation strategy and avoids creating new thin pages.

**Key evidence:**
- "Near me" searches grew 900% in two years (BrightLocal)
- Hyperlocal searches convert 29% higher than generic location-based queries
- Manning Search Marketing: HVAC company lost 80% rankings and 63% organic traffic from suburb-specific thin pages
- HIP Creative: "Creating 20 neighborhood pages that say basically the same thing with the city swapped out is worse than doing nothing"
- Competitor pattern: Time Out Athens, SantoriniDave — city-level hubs with neighborhood sections, not standalone pages

**Implementation:**
1. ~~Define config-driven list of 10 tourism-relevant Athens neighborhoods with Wikidata IDs~~ **UPDATED (Round 3): 13 neighborhoods with verified Wikidata IDs** — see "Neighborhood Wikidata Mapping" decision
2. Add neighborhood sub-sections (150–300 words each) to relevant hub pages
3. Use neighborhood names in H2/H3 headings for long-tail query capture (e.g., "Live music venues in Psyrri" as H3 within "Live Music in Athens" hub)
4. Implement `containedInPlace` chain in JSON-LD: Event → EventVenue → containedInPlace: Neighborhood (with `sameAs` to Wikidata/Wikipedia) → containedInPlace: City
5. Include `geo` coordinates on every venue
6. Add neighborhood context to venue page editorial (phased 20–30 venues)
7. Exception rule: standalone neighborhood page only if 2,000+ words of genuinely unique content can be supported

**Validation:** Track impressions for neighborhood-modified queries in Google Search Console. Monitor AI Overview citations with neighborhood-level specificity. Test "things to do in [neighborhood] Athens" queries across ChatGPT, Perplexity, and Google AI Overviews monthly.

**Replicability:** Fully replicable. Each city instance defines its own 7–13 neighborhood list with Wikidata IDs. Schema chain pattern is universal. Barcelona uses barrio names; Berlin uses Kiez/Bezirk names.

**Status:** Pending — **Updated with Round 3 neighborhood count**

---

## 2026-02-19 — Reddit and Community Engagement Strategy for AI Citation Signals
**Context:** Reddit is the #1 most-cited domain across AI engines (40.1% citation frequency, Semrush). Reddit-Google deal ($60M/year) and Reddit-OpenAI deal (~$70M/year) structurally embed Reddit content in AI systems. This is an infrastructure-level priority, not a marketing channel.

**Decision:** Establish authentic Reddit presence on r/GreeceTravel, r/Athens, r/greece with 90/10 value-to-promotion ratio. 4-week maturation period before any brand mentions. Weekly cadence of daily monitoring + weekly posts + monthly evergreen content. Parallel Quora and LinkedIn presence.

**Reasoning:** Semrush (150K+ citations) shows Reddit at 40.1% citation frequency across AI. SE Ranking (129K domains) shows 4× citation advantage for domains with Reddit/Quora mentions. Zenith (187 queries) shows 3.8× citation odds from niche subreddits and 1.5+ year median cited post age — evergreen content compounds. Reddit-Google and Reddit-OpenAI licensing deals structurally advantage Reddit content. 91% of US Reddit travel community users make booking decisions based on Reddit (PhocusWire).

**Key nuances:**
- Counterintuitive: number of comments is a STRONG NEGATIVE predictor of citation (Zenith, coefficient: -1.785)
- Raw upvote scores are NOT reliable predictors
- Semantic title matching is the strongest positive predictor
- Cited post median age: 1.5+ years — evergreen content, not ephemeral posts
- Citation volatility: 40–60% of cited domains change monthly (Profound) — sustained engagement required

**Implementation:**

*Account setup and maturation (Weeks 1–4):*
1. Create hybrid-named Reddit account (e.g., "AgentAthens_Maria")
2. Weeks 1–2: Zero promotion. Lurk, upvote, genuine comments on r/GreeceTravel, r/Athens, r/travel. Build karma
3. Weeks 3–4: Answer Athens travel/culture questions. No links to site yet

*Ongoing weekly cadence (from Week 5):*
4. Daily (10–15 min): Monitor r/GreeceTravel, r/Athens, r/greece for cultural event questions. 1–2 helpful comments
5. Weekly (2–3 hours): 2–3 comments across Tier 1–2 subreddits. One standalone valuable post per week (seasonal guide, cultural insight, event roundup). 90/10 rule: 90% pure value, 10% incidental brand mention
6. Monthly: One comprehensive evergreen post (e.g., "Complete Guide to Athens Cultural Events by Season")
7. Quarterly: Seasonal cultural event preview posts; refresh earlier posts

*Parallel platforms:*
8. Quora presence answering Athens cultural event questions (cited 1.5% in AI Overviews, 3.6% in Perplexity)
9. Personal LinkedIn profiles for team members (47% of LinkedIn citations from personal profiles)
10. Google Business Profile and TripAdvisor listings (review platform signals = 3× ChatGPT citation chances)
11. Track brand mentions via Google Alerts

**Target subreddits:**
- Tier 1: r/GreeceTravel (956K), r/Athens (55K), r/greece (252K)
- Tier 2: r/travel (12M), r/solotravel (1.8M), r/digitalnomad (1.1–1.5M)

**Validation:** Track Reddit thread impressions and engagement. Monitor GA4 for Reddit referral traffic. Check if Reddit threads mentioning agent-athens appear in AI citations. Track brand mention volume monthly.

**Replicability:** Fully replicable per city. Each city identifies Tier 1 subreddits (r/Barcelona, r/VisitingBerlin, etc.). The maturation timeline, 90/10 rule, and weekly cadence are universal. Barcelona may benefit from Spanish-language Reddit alternatives (Forocoches, Menéame). Berlin has strong Reddit presence in r/berlin (300K+).

**Status:** Pending

---

## 2026-02-19 — Cross-City Replicability Architecture
**Context:** agent-athens must be built so agent-barcelona and agent-berlin can launch with minimal rearchitecting. Need to define what transfers vs. what's city-specific.

**Decision:** Separate domains per city. ~60–70% universal architecture (schema, hub model, GEO tactics, build pipeline, measurement). ~30–40% city-specific config (venue data, neighborhoods, language, competitors, event weights). Athens first (least competitive), Barcelona second (most competitive, stress-tests model), Berlin third.

**Reasoning:** Google treats subdomains as separate entities (no authority consolidation from barcelona.agent-athens.com). Content farm risk is low — each city has genuinely unique event data, different language pairs, different venues. Greek's low-resource AI status (Common Corpus: ~single-digit B tokens vs English 867B, Wikipedia: ~100K articles vs English ~7.1M) makes English content disproportionately important for Athens vs. Barcelona/Berlin.

**Key findings:**
- Language resource disparity: Greek is explicitly classified as low-resource for LLMs (Meltemi project). Greek alphabet reduces cross-lingual transfer from dominant Latin-script training data (Google ATLAS study, 400+ languages)
- English content is proportionally MORE important for Athens than Barcelona/Berlin
- Athens has least competitive English-language cultural event landscape (World Travel Awards winner with weak competitor coverage)
- Barcelona is most competitive (barcelona.cat official calendar, DondeGo AI-native startup, Fever, Time Out)
- Berlin has strong institutional digital infrastructure but gaps in independent AI-optimized cultural calendars

**Universal elements (~60–70%):**
Schema.org markup, hub-and-spoke content model, GEO optimization tactics (statistics, citations, quotations), daily update cadence, bilingual framework, entity locking approach, freshness signaling, measurement stack, 7-layer hub structure, FAQPage schema, Reddit engagement cadence

**City-specific elements (~30–40%):**
Venue databases, neighborhood taxonomies (with Wikidata IDs), language pairs, competitor watchlists, local data sources/APIs, seasonal calendars, event category weightings, social media channel preferences, local partnership networks

**Per-city config checklist:**
- Language pair (primary + English)
- Hreflang codes (el/en, es/en or ca/en, de/en)
- Entity Locking list (untranslatable terms)
- Neighborhood list with Wikidata IDs (7–13 per city)
- Venue database (20–30 major venues per city)
- Event category weights for hub page prominence
- Competitor watchlist (5–10 per city)
- Local data sources / event feed APIs
- Tourism seasonality calendar
- Reddit subreddit targets (3–5 per city)
- Local partnership target list (tourism board, cultural institutions)
- Schema.org city entity sameAs links

**Implementation:**
1. Abstract all city-specific values into a single config file per city instance
2. Build config template with all 12 parameter categories above
3. Register agent-barcelona.com and agent-berlin.com domains proactively
4. Design Organization schema linking all city domains to parent entity
5. Set up cross-site linking (sister site badges, "Also in Barcelona/Berlin" links)
6. Document the 60/40 universal/specific split
7. Launch sequence: Athens (validate) → Barcelona (stress-test) → Berlin (scale)

**Validation:** After Athens achieves target citation rates (≥3 AI Overview appearances per hub), begin Barcelona build. Compare time-to-citation between cities. Target: Barcelona launch within 6 weeks of config completion.

**Replicability:** This IS the replicability decision. Success metric: a new city can be configured and launched within 4–6 weeks given venue data and local editorial partnerships.

**Status:** Pending

---

## 2026-02-20 — Finalized 18-Hub Taxonomy with Competitor Gap Analysis
**Context:** Round 3 research analyzed competitor structures (ThisIsAthens, WhyAthens, TimeOut, AllEvents), query demand patterns, AI engine decomposition behavior, and zero-event risk for each candidate hub category. Needed to finalize the exact hub list from the earlier "15–25" range.

**Decision:** 18 hub pages: 10 Tier 1 (must-have) + 7 Tier 2 (strong candidates) + 1 Tier 3 (conditional). Specific slugs, Schema.org subtypes, and inventory risk assessed per hub. See updated "Consolidate Combinatorial Pages" decision for full taxonomy.

**Reasoning:** Competitor gap analysis revealed: (1) No competitor offers bilingual Greek/English hub pages. (2) No competitor has dedicated static URLs for `/today` or `/this-weekend` — they all use dynamic filter parameters that AI engines cannot reliably cite. (3) WhyAthens showed "No events found" on multiple category pages — validating the inventory-risk filtering approach. (4) AI engines decomposing "what to do in Athens" consistently surface these exact categories. 18 hubs cover every AI-expected category without zero-event risk.

**Key competitor findings:**
- ThisIsAthens: Rich editorial but flat chronological event feed, zero category filtering
- WhyAthens: Clean 6-hub taxonomy but inventory gaps ("No events found" on live pages)
- TimeOut Athens: Purely editorial listicles, no dynamic calendar
- AllEvents.in: Broadest taxonomy (20+ categories) but poor editorial quality
- **Gap:** No competitor has static `/today` or `/this-weekend` URLs — highest-opportunity hubs

**Implementation:** Merged into the updated "Consolidate Combinatorial Pages" decision above.

**Validation:** Monitor each hub for ≥5 events minimum. Track citation appearance per hub in Bing AI Performance. Evaluate `/jazz` (Tier 3) inventory after 90 days.

**Replicability:** Same taxonomy works for Barcelona/Berlin with category swaps: `/greek-music` → `/flamenco` (Barcelona) or `/electronic-music` (Berlin).

**Status:** Pending

---

## 2026-02-20 — Meta Description Templates — P0 Priority
**Context:** Meta descriptions are empty on many event pages. Round 3 research found AI engines actively use meta descriptions as context primers and sometimes quote them verbatim. beyondsenior.engineering GEO guide: metadata + freshness = **+47% citation impact**. For a calendar with minimal per-event body text, meta descriptions become the primary text signal for AI crawlers.

**Decision:** Implement programmatic meta description templates on ALL pages immediately. P0 priority — highest-leverage item from Round 3 (under 2 hours implementation, +47% citation impact).

**Reasoning:** DefiniteSEO: LLMs use meta descriptions as "short, dense pieces of language that signal meaning before processing full text." Fairway Digital Media: meta descriptions "often quoted verbatim by LLMs." Google explicitly encourages programmatic generation for database-driven sites. If JSON-LD has `description` but HTML meta is empty, Google generates snippet from body content, not JSON-LD — both fields must exist.

**Templates:**

*Event pages:*
```
{EventTitle} at {Venue}, Athens on {FormattedDate}. {TicketStatus}. Daily-updated Athens events.
```
Examples:
- "Rembetiko Night at Stavros Niarchos Foundation, Athens on Mar 15, 2026. Open. Daily-updated Athens events." (108 chars)
- "Jazz Quartet at Half Note Jazz Club, Athens on Apr 3, 2026. With-ticket from €15. Daily-updated Athens events." (111 chars)

*Hub/list pages:*
```
Athens {Category} events – {Count} listings. Daily-updated cultural events calendar.
```

*Venue pages:*
```
{VenueName} — Athens {VenueType}. Upcoming events, accessibility, and visitor info. Updated daily.
```

**Implementation:**
1. Add meta description template to event page generator — populate from `title + venue + date + price status`
2. Add meta description template to hub page generator — populate from `category + event count`
3. Add meta description template to venue page generator — populate from `name + type`
4. Align JSON-LD `description` field with meta description (related but not identical — JSON-LD can be more data-rich)
5. For enriched events: use first 150 chars of enriched description as meta description instead of template
6. Target 100–155 characters per meta description

**Validation:** Monitor Google Search Console for SERP snippet changes. Track click-through rate changes on event pages. Check if meta description text appears in AI engine citations via Bing AI Performance.

**Replicability:** Fully replicable. Template structure is universal — only `Athens` and `EUR` change per city. Use project terminology: "Open" not "free", "With-ticket" not "paid".

**Status:** Pending

---

## 2026-02-20 — OG Images Deferred to P2
**Context:** OG images are currently generic (concert-default.jpg). Round 3 research investigated whether OG images affect AI citation rates.

**Decision:** Defer OG image improvement to P2. Zero evidence OG images affect AI citation rates. Implement after structured data and meta descriptions are solid.

**Reasoning:** The foundational GEO research (Aggarwal et al.) tested optimization methods on Perplexity and other AI engines — top methods were Statistics Addition (+41%) and Quotation Addition (+28%), all text-based. No image-related optimization tested or shown to help. AI citation pipelines use RAG (text chunks); images are not indexed. Google's Event structured data marks images as recommended, not required. Perplexity sources images from Getty Images partnership, not og:image. Google AI Overviews pull images from their own index, not OG tags.

**When ready (P2):**
- Use **Satori** (Vercel's open-source JSX-to-SVG library) + **sharp** or **resvg-js** for build-time OG generation
- Zero API cost — runs in Node.js
- Implementation pattern: astro-satori template on GitHub
- Generate per-event images: category-colored background + event title + date + venue name
- Estimated effort: 1–2 days

**Implementation:** No action now.

**Validation:** N/A until P2.

**Replicability:** Fully replicable. Satori template works for any city — only city name and color scheme change.

**Status:** Decided — Deferred to P2

---

## 2026-02-20 — Neighborhood Wikidata Mapping — 13 Verified Entries
**Context:** The "Neighborhood Context as Hub Sections" decision required a config-ready list of Athens neighborhoods with Wikidata IDs. Round 3 research verified all entries, geocoordinates, and entity classifications.

**Decision:** 13 Athens neighborhoods mapped with verified Wikidata QIDs, geocoordinates, and tourist tier classifications. Gazi is primary entity (not Kerameikos) for nightlife/cultural events. Consider adding Makrygianni (Q6743284) as 14th.

**Mapping:**

| Neighborhood | QID | Lat | Lon | Tourist tier |
|---|---|---|---|---|
| Plaka | Q1231816 | 37.9722 | 23.7306 | HIGH |
| Monastiraki | Q1235440 | 37.9764 | 23.7236 | HIGH |
| Psyrri | Q2984834 | 37.9778 | 23.7250 | HIGH |
| Kolonaki | Q1779602 | 37.9772 | 23.7406 | HIGH |
| Exarcheia | Q531602 | 37.9861 | 23.7347 | MEDIUM-HIGH |
| Gazi | Q1496656 | 37.9781 | 23.7144 | MEDIUM-HIGH |
| Kerameikos | Q630974 | 37.9783 | 23.7186 | MEDIUM-HIGH |
| Koukaki | Q2613998 | 37.9639 | 23.7231 | HIGH |
| Metaxourgeio | Q1235412 | 37.9860 | 23.7215 | MEDIUM |
| Pangrati | Q2336775 | 37.9681 | 23.7441 | MEDIUM |
| Thiseio | Q2984896 | 37.9750 | 23.7167 | HIGH |
| Petralona | Q2984861 | 37.9663 | 23.7105 | MEDIUM-LOW |
| Kypseli | Q1795153 | 38.0002 | 23.7390 | LOW-MEDIUM |

**Key decisions:**
- **Gazi/Kerameikos:** Use Gazi (Q1496656) as primary `containedInPlace` for events. Kerameikos carries archaeological-site semantics that confuses entity resolution for nightlife/cultural events. Reference Kerameikos as alias only.
- **containedInPlace chain:** Event → Venue → Neighborhood (QID) → Athens Municipality (Q1224979) → Central Athens (Q5765570) → Attica Region (Q758085) → Greece (Q41)
- **Makrygianni (Q6743284):** Recommended addition — immediate Acropolis Museum neighborhood, distinct from Koukaki in travel guides (Lonely Planet, Fodor's). Include if venue density warrants.

**Implementation:**
1. Add neighborhood config to city config file with all 13 QIDs, coordinates, and Wikipedia URLs
2. Use `instance of: neighborhood (Q123705)` as Wikidata filter for cross-city consistency
3. Implement `sameAs` linking to Wikidata + English Wikipedia + Greek Wikipedia for each neighborhood
4. Set Gazi as primary entity; alias Kerameikos in editorial text only

**Validation:** Verify all QIDs resolve correctly via Wikidata API. Test containedInPlace chain in Google Rich Results Test. Check that neighborhood entities appear in Knowledge Graph queries.

**Replicability:** Fully replicable. Barcelona equivalents (El Born, Gràcia, Raval, Barceloneta, Eixample, Gòtic, Poble Sec, Sant Antoni) and Berlin equivalents (Kreuzberg, Mitte, Friedrichshain, Prenzlauer Berg, Neukölln, Schöneberg, Charlottenburg) all have Wikidata entries with same classification. Cultural/colloquial neighborhoods outperform administrative units for event calendars.

**Status:** Pending

---

## 2026-02-20 — Hub Page Data Sourcing — 20 Verified Statistics + 10 Institutional Sources
**Context:** Hub page editorial requires 19+ data points per hub (SE Ranking optimal). Round 3 research verified 20 statistics with exact values and mapped 10 institutional sources, 7 of which replicate across cities.

**Decision:** Use 5-layer data sourcing formula per hub: (1) Athens-level tourism stats, (2) national cultural stats from ELSTAT, (3) EU/international comparisons, (4) venue-specific annual reports, (5) awards/rankings/history. This yields 15–19 minimum data points per hub.

**20 verified statistics ready to use:**

| # | Data point | Value | Source | Year |
|---|-----------|-------|--------|------|
| 1 | Acropolis Museum visitors | 2,000,312 | Art Newspaper / ELSTAT | 2024 |
| 2 | Athens foreign visitors | ~8 million (+24% vs 2019) | EXAAA/AIA/GBR | 2024 |
| 3 | Greece tourism revenue | €21.59 billion | Bank of Greece | 2024 |
| 4 | Greece international visitors | 40.7 million | Bank of Greece | 2024 |
| 5 | Attica region tourism revenue | €4.75 billion | Bank of Greece | 2024 |
| 6 | SNFCC annual visits | 3,224,793 | SNFCC report | 2024 |
| 7 | Greece museums + sites visitors | 20.66 million | ELSTAT | 2024 |
| 8 | Acropolis site visitors | 4.5+ million | ELSTAT | 2024 |
| 9 | Open-air cinemas in Athens | 65 | ThisIsAthens | Current |
| 10 | Athens Epidaurus Festival 2024 | 93 productions, 2,500+ artists, 85 days | AEF | 2024 |
| 11 | Museum + site receipts | €171 million | ELSTAT | 2024 |
| 12 | World Travel Awards | Cultural City 4 consecutive years | WTA | 2022–2025 |
| 13 | Odeon of Herodes Atticus capacity | 4,680 seats | AEF | Current |
| 14 | Megaron Concert Hall | 4 halls, 1,960-seat main | Megaron | Current |
| 15 | Athens hotel rooms | 18,198 rooms in 295 hotels | ACVB | Current |
| 16 | Acropolis daily visitor cap | 20,000 | Ministry of Culture | Since 2023 |
| 17 | Acropolis UNESCO | 1987, criteria i/ii/iii/iv/vi | UNESCO | Permanent |
| 18 | SNFCC cumulative visits | 27 million+ (2017–2024) | SNF | 2024 |
| 19 | Greece cultural participation | 46.9% of adults | Eurostat | 2015 |
| 20 | Athens airport destinations | 154 destinations, 67 airlines | ACVB | Current |

**7 universally replicable sources:** National statistics office, central bank tourism data, Eurostat cultural tables, UNESCO World Heritage, World Travel Awards, city CVB statistics, venue annual reports.

**Data gaps:** Benaki Museum, Museum of Cycladic Art, EMST, Megaron do not publish attendance. Theater production counts not centrally tracked. Use proxies: venue capacity × estimated fill, event feed counts, qualitative descriptors.

**Implementation:**
1. Create data sources reference file in city config
2. Assign 3–5 relevant statistics to each of 18 hub pages
3. Format all statistics with source attribution for E-E-A-T signals
4. Set annual data refresh reminder (most stats update annually)
5. Use proxies where hard data unavailable

**Validation:** Count data points per hub — target ≥19. Verify all sources are still accessible and current.

**Replicability:** 7 of 10 sources work directly for Barcelona (INE, Banco de España, Eurostat, UNESCO, WTA, Barcelona Tourism Observatory, institutional reports) and Berlin (Destatis, Bundesbank, Eurostat, UNESCO, WTA, visitBerlin, institutional reports).

**Status:** Pending

---

## 2026-02-20 — FAQ Bank — 60 Questions Mapped to Hub Pages
**Context:** Hub page 7-layer structure requires 5–8 FAQ questions per hub with FAQPage schema. Round 3 compiled questions from Google PAA, Tripadvisor, official Athens guides, family travel blogs, and AI decomposition patterns.

**Decision:** 60 validated FAQ questions organized per hub. Split into universal questions (apply across hubs) and category-specific questions. Each answer sourced from official guides, venue sites, or travel authorities.

**Universal questions (belong on every relevant hub):**
- "Where can I buy event tickets in Athens?" → viva.gr, aefestival.gr, Eventbrite, venue box offices
- "Do children get free entry to museums and archaeological sites?" → EU under 25 free; non-EU under 18 free
- "What time do events and shows typically start in Athens?" → concerts 20:30–21:00; open-air cinemas 21:00; Epidaurus 21:00
- "How do I find events if I don't speak Greek?" → most events accessible in English; films in original language with Greek subtitles
- "How do I get around Athens to reach event venues?" → metro covers most central venues; walkable historic center

**Per-hub highlights:**
- **Concerts (7 Qs):** Best outdoor concert venues? Where to hear live rebetika? Summer festivals? Live music every night?
- **Theater (7 Qs):** Performances in English? Epidaurus subtitles? (Yes.) When is Athens Epidaurus Festival? (June–August.) Ancient drama in ancient theater? Kids at Epidaurus? (Under 5 not permitted; 5–12 can attend.)
- **Exhibitions (8 Qs):** Museum open days? (6 Mar, 18 Apr, 18 May, last weekend Sep, 28 Oct, first Sunday Nov–Mar.) Combined Acropolis ticket worth it? (5 days, 7+ sites.) Wheelchair accessible?
- **Cinema (6 Qs):** Movies in English? (Yes — never dubbed except children's.) Open-air season? (May–Oct.) Ticket cost? (€6–€8.50.)
- **Kids (6 Qs):** Acropolis suitable for strollers? (Museum: yes, free strollers. Hill: steep.) SNFCC family events? Museum family workshops? (Acropolis Museum family backpacks.)
- **This-weekend/today (5 Qs each):** Best weekend night neighborhoods? (Gazi, Psyrri, Exarchia, Kolonaki.) Weekend vs. weekday? (Guard ceremony Sundays; Benaki Thursdays; August full-moon evenings.)
- **Open events (4 Qs):** Free Acropolis days? (National holidays + first/third Sundays Nov–Mar.) Free concerts? (Monthly at Olympia; This is Athens City Festival in May, 250+ events.)

**Implementation:**
1. Create FAQ content file per hub page
2. Implement FAQPage schema on each hub (5–8 questions per hub)
3. Ensure answers contain factual details with source attribution
4. Integrate universal questions into all relevant hubs (avoid exact duplication — rephrase per context)
5. Update FAQ answers quarterly alongside hub editorial refresh

**Validation:** Check FAQPage schema validation in Rich Results Test. Monitor if FAQ content appears in AI citations. Track People Also Ask appearance for target questions.

**Replicability:** Question patterns transfer across cities. Universal questions adapt with city name swap. Category-specific questions need local answers (e.g., Barcelona: "Are there flamenco shows for tourists?" Berlin: "Is the Berlinale open to the public?").

**Status:** Pending

---

## 2026-02-20 — Quarterly Refresh Cadence with Monthly Maintenance and Split Sitemaps
**Context:** AI-cited content averages 393 days newer than traditional organic results (Ahrefs, 17M citations). Pages not updated in 90+ days see ~40–60% citation rate drop (Passionfruit, Jan 2026). Google December 2025 core update explicitly penalizes "fake freshness." Need to define refresh cadence that maintains genuine freshness without gaming signals.

**Decision:** 90-day full refresh cycle with monthly lightweight maintenance between quarters. Split sitemaps: `sitemap-events.xml` (daily lastmod) and `sitemap-editorial.xml` (lastmod only on substantive changes). Content-hash-based timestamps to prevent false freshness signals.

**Reasoning:** Daily event listing changes provide domain-level freshness, but each hub page is evaluated individually — AI systems check page-specific dateModified and content recency. A daily rebuild that naively updates all timestamps destroys credibility. Content-hash builds ensure only genuinely changed pages signal freshness.

**Quarterly full refresh (15 items):**

*Content and editorial (7 items):*
1. Update all statistics with current-year data
2. Add 500+ words of new content per hub page (substantive-update threshold)
3. Rewrite seasonal narrative paragraphs for upcoming quarter
4. Add 2–3 new FAQ questions per hub
5. Update internal links to fresh event listing pages
6. Add any new venues opened in past quarter
7. Refresh seasonal imagery

*Technical and metadata (5 items):*
8. Update `dateModified` in Schema.org (ISO 8601, only on substantive changes)
9. Update visible "Last Updated" date using `<time>` element
10. Update sitemap `lastmod` for changed hub pages only
11. Ping IndexNow after hub page updates (Bing/Yandex)
12. Refresh meta descriptions with current quarter/year

*Quality and authority (3 items):*
13. Audit and fix broken outbound links
14. Add/update expert quotes demonstrating E-E-A-T
15. Re-promote updated hubs on social channels

**Monthly lightweight maintenance (between quarters):**
- Update 2–3 internal links to new seasonal event pages
- Add 1 new FAQ question
- Refresh one data point or statistic
- Keep dateModified advancing legitimately

**Critical freshness architecture for static sites:**

*Split sitemaps:*
- `sitemap-events.xml`: Daily lastmod (legitimate — events change daily)
- `sitemap-editorial.xml`: Lastmod only when hub pages receive substantive changes
- Google and Bing develop per-sitemap trust scores — inflating lastmod destroys credibility

*Content-hash-based timestamps:*
- During each build, compute hash of each hub page's content
- Compare to previous build's hash
- Only update `Last-Modified` headers and sitemap lastmod for pages where hash changed
- Prevents daily rebuild from falsely signaling freshness on unchanged editorial pages

**Implementation:**
1. Create split sitemap infrastructure: `sitemap-events.xml` + `sitemap-editorial.xml` + `sitemap-index.xml`
2. Implement content-hash comparison in build pipeline
3. Set quarterly calendar with 2-week refresh windows
4. Create per-hub refresh checklist template
5. Budget: 2–4 hours per hub × 18 pages = 36–72 hours per city per quarter

**Validation:** Monitor sitemap crawl patterns in GSC. Track hub page citation rates pre/post quarterly refresh. Verify content-hash system prevents false lastmod updates.

**Replicability:** Fully replicable. All cities refresh in same 2-week window for batch efficiency. Shared checklist template with city-specific fields (local stats sources, seasonal calendar, venue updates).

**Status:** Pending

---

## 2026-02-20 — x-default Changed to English (Reversal of Prior Decision)
**Context:** Round 5 Q2 confirmed that ChatGPT (64.5% market share) and Perplexity both ignore hreflang entirely and default to English-language URLs regardless. The international tourist audience — agent-athens's primary monetization audience — also searches in English. The prior decision set x-default to Greek because the root domain is Greek-primary.

**Decision:** Change `x-default` hreflang target from Greek root URL to English `/en/` URL across all pages.

**Reasoning:** ChatGPT and Perplexity, which together represent a majority of AI search traffic outside Google, return the x-default URL when they encounter pages with hreflang. Setting x-default to Greek means these engines serve Greek URLs to English-speaking users. English x-default aligns with actual engine behavior. Additionally, major international travel platforms (Airbnb, Booking.com) use English as x-default — signals trust for an international-facing site.

**Implementation:**
```html
<!-- BEFORE (incorrect) -->
<link rel="alternate" hreflang="x-default" href="https://agent-athens.com/event-slug/" />

<!-- AFTER (correct) -->
<link rel="alternate" hreflang="el" href="https://agent-athens.com/event-slug/" />
<link rel="alternate" hreflang="en" href="https://agent-athens.com/en/event-slug/" />
<link rel="alternate" hreflang="x-default" href="https://agent-athens.com/en/event-slug/" />
```
Apply to all pages site-wide. Template change, not per-page — one code update covers all.

**Validation:** After deployment, test with hreflang validation tool. Monitor ChatGPT/Perplexity citation URLs — they should now return `/en/` versions for English queries.

**Replicability:** Fully replicable. Pattern: root path for local language, `/en/` for English with x-default. Agent-barcelona: Spanish root + `/en/`. Agent-berlin: German root + `/en/`.

**Status:** Pending — replaces prior x-default=Greek decision. **Highest-priority config change from Round 5 — 10-minute implementation, high impact on 4 platforms.**

---

## 2026-02-20 — Schema Additions: offers, isAccessibleForFree, eventAttendanceMode, eventStatus
**Context:** Round 5 Q4 audited Google's Event structured data docs (updated Dec 2025) and found four properties now effectively required or high-impact that are missing from the current schema template. A critical June 2025 change removed all online event support — only physical events are eligible for Google's event rich results. BrightEdge found 44% increase in AI citations for sites with structured data + FAQ blocks.

**Decision:** Add four properties to the Event schema template immediately (Sprint 3):
1. `isAccessibleForFree` — boolean on Event itself
2. `offers` with `price`, `priceCurrency`, `availability`, `url`
3. `eventAttendanceMode: OfflineEventAttendanceMode` (only relevant value post-June 2025)
4. `eventStatus: EventScheduled` (enables status-aware AI responses)

**Reasoning:** `isAccessibleForFree` is critical for "free things to do in Athens" queries. `offers` is now required by Google when price is present. `eventAttendanceMode: OfflineEventAttendanceMode` signals physical presence — required for rich results post-June 2025. `eventStatus` enables AI engines to give status-aware answers.

**Implementation — schema templates:**

For **"open" events** (project terminology — not "free"):
```json
{
  "isAccessibleForFree": true,
  "eventAttendanceMode": "https://schema.org/OfflineEventAttendanceMode",
  "eventStatus": "https://schema.org/EventScheduled",
  "offers": {
    "@type": "Offer",
    "price": "0",
    "priceCurrency": "EUR",
    "url": "https://agent-athens.com/events/event-slug",
    "availability": "https://schema.org/InStock"
  }
}
```

For **"with-ticket" events** (project terminology — not "paid"):
```json
{
  "isAccessibleForFree": false,
  "eventAttendanceMode": "https://schema.org/OfflineEventAttendanceMode",
  "eventStatus": "https://schema.org/EventScheduled",
  "offers": {
    "@type": "Offer",
    "price": "20.00",
    "priceCurrency": "EUR",
    "url": "https://ticketsource.com/event",
    "availability": "https://schema.org/InStock",
    "validFrom": "2026-02-01T10:00+02:00"
  }
}
```

**Validation:** Google Rich Results Test confirms structured data is valid. Monitor price-filtered AI query citations (e.g., "free events Athens this weekend") — expect improvement within 4–6 weeks of indexing.

**Replicability:** Fully replicable. Change `priceCurrency` per locale (EUR for all three initial cities), `addressCountry` per city. Price field remains event-specific.

**Status:** Pending — Sprint 3 implementation

---

## 2026-02-20 — Schema Addition: performer sameAs Links (Sprint 4)
**Context:** Round 5 Q4 found that Schema App experiments adding `sameAs` links to performer entities yielded a 46% increase in impressions and 42% increase in clicks. AI engines use sameAs links for entity disambiguation — connecting the event to a known entity in the knowledge graph. Artist/performer queries represent a significant slice of event discovery ("concerts by X in Athens").

**Decision:** Add `performer` with `sameAs` links to Wikidata, Wikipedia, and MusicBrainz for all concert/theater events where a named artist is present. Queue for Sprint 4 (requires ID lookup infrastructure to be built).

**Reasoning:** Entity disambiguation through sameAs is the mechanism by which AI engines connect an event page to a known knowledge graph entity, dramatically improving the probability of appearing in artist-specific AI queries. The 46% impressions boost is a significant finding. The lookup infrastructure (fetching Wikidata/MusicBrainz IDs) needs to be built as part of the enrichment pipeline.

**Implementation:**
```json
{
  "performer": {
    "@type": "MusicGroup",
    "name": "Artist Name",
    "sameAs": [
      "https://www.wikidata.org/entity/Q12345",
      "https://en.wikipedia.org/wiki/Artist_Name",
      "https://musicbrainz.org/artist/uuid-here"
    ]
  }
}
```
For theater: use `"@type": "Person"` for directors/playwrights, `"@type": "PerformingGroup"` for theater companies.

Build a lookup helper: given artist name → query Wikidata SPARQL API (free, no rate limit concerns at this scale) → cache result in event data → include in schema generation.

**Validation:** Monitor AI citation rates for artist-specific queries. Track impressions/clicks in GSC for event pages with vs. without sameAs. 

**Replicability:** Fully replicable. Wikidata and MusicBrainz are global databases — works identically for Barcelona and Berlin.

**Status:** Pending — Sprint 4

---

## 2026-02-20 — E-E-A-T Infrastructure Stack (Sprint 3)
**Context:** Round 5 Q3 found Google's January 2026 Core Update targets "content that reads like a summary of the top five search results" and "accurate but hollow" content. The February 2026 Discover Core Update explicitly rewards "locally relevant content from sites with strong E-E-A-T signals." No major event platform uses per-event-listing author bylines — brand-level attribution is industry standard for calendar content.

**Decision:** Build the full infrastructure E-E-A-T stack in Sprint 3. Do NOT create fabricated individual personas. Use brand-level "Athens Events Guide Editorial Team" attribution with a real disclosure of methodology.

**Reasoning:** Google cross-references entities — fabricated personas fail verification and risk penalty. Infrastructure signals (Organization schema, methodology pages, source attribution) require zero per-event effort but apply site-wide. The enrichment quality threshold for E-E-A-T is hyperlocal specificity — content that includes specific neighborhood references, transit info, and "insider" details that "anyone could write" generically is at risk.

**Implementation — required pages and schema:**
1. **About page** (`/about/`): who runs the site, why Athens specifically, editorial methodology, data sources, founding date
2. **Editorial methodology page** (`/editorial/`): "How We Create Event Descriptions" — explaining the enrichment process, source verification, update frequency
3. **Corrections policy page** (`/corrections/`): how errors are reported and corrected
4. **Organization schema** on site root:
```json
{
  "@type": "Organization",
  "name": "Athens Events Guide",
  "foundingDate": "2026",
  "sameAs": ["social profiles"],
  "contactPoint": { "@type": "ContactPoint", "contactType": "editorial" },
  "address": { "@type": "PostalAddress", "addressLocality": "Athens", "addressCountry": "GR" }
}
```
5. **Source attribution footer** on every event page: "Event data from [source]. Cultural context by Athens Events editorial team."
6. **`dateModified` timestamps** on all event pages (already in plan via content-hash architecture)
7. **Google Business Profile** with Athens address

**Mandatory hyperlocal fields** added to enrichment template (Round 5 addition):
- Neighborhood name (Plaka, Kolonaki, Monastiraki, etc.)
- Nearest metro station
- Cultural context category
- Source attribution
- At least one "insider" detail not available from the source listing

**Validation:** Monitor traffic changes following next Google core update. Track "site:" search impressions as a proxy for crawl health. No specific metric for E-E-A-T — this is a defensive measure.

**Replicability:** Fully replicable. About/methodology/corrections pages are templatable with city substitution. Organization schema changes city + country only. Hyperlocal enrichment fields change neighborhood names per city.

**Status:** Pending — Sprint 3

---

## 2026-02-20 — 45-Day Event Lifecycle (Replaces Vague "30–60 Days" Guidance)
**Context:** Round 5 Q5 replaced the vague "30–60 days then noindex" guidance from Round 4 with a precise 4-phase lifecycle backed by AI freshness data and Google's official guidance on 404s and crawl budget. John Mueller explicitly confirmed: "Having 404s gives a site any sort of penalty — you're wrong. Utterly wrong." AI-cited content is 25.7% fresher than organic Google results (Ahrefs, 17M citations).

**Decision:** Implement a precise 4-phase event lifecycle:

| Phase | Timeframe | Actions |
|---|---|---|
| **Active** | Through event date | Full schema (`eventStatus: EventScheduled`), indexed, in `sitemap-events.xml` |
| **Just passed** | Days 1–14 post-event | "This event has passed" banner + similar events module. Schema → `eventStatus: EventCompleted`. Remove from "upcoming" navigation. Keep indexed. |
| **Cooling** | Days 15–44 post-event | Add `<meta name="robots" content="noindex, follow">`. Remove Event schema. Remove from `sitemap-events.xml`. Keep similar events module. |
| **Archive/Remove** | Day 45+ post-event | Return **410 Gone** (not 404 — faster de-indexing signal). Exception: 301 to parent venue/category page if the event page earned >5 external backlinks. |

**For recurring events** (John Mueller's direct guidance):
```
/events/athens-epidaurus-festival/        → ALWAYS current year (evergreen, indexed, accumulates authority)
/events/athens-epidaurus-festival/2025/   → Archive (noindex after 45 days from 2025 event end)
```

**Reasoning:** The 4-phase approach balances: (1) keeping recent past-event pages indexed briefly (they may still be searched and contain fresh date signals), (2) progressive de-emphasis to preserve crawl budget for active events, (3) clean removal at 45 days to prevent thin/outdated content accumulating. 410 is preferred over 404 because it signals intentional removal, not a broken link — Googlebot processes 410s faster.

**Implementation:**
1. Automated phase transitions based on `endDate` field in event data
2. Day 0 → Day 14: Set `eventStatus: EventCompleted` in schema, add UI banner
3. Day 15: Add noindex meta tag, remove from sitemap via build logic
4. Day 45: Configure Netlify redirect rules to return 410 for expired event URLs
5. Exception logic: check backlink count before 410 (API call to GSC or Ahrefs — if >5 backlinks, redirect instead)
6. Recurring event detection: if `eventRecurring: true` in data, use non-dated URL pattern

**Validation:** Monitor crawl budget in GSC (pages crawled per day should stay focused on active events). Track whether past-event pages appear in AI citations (they shouldn't after 45 days).

**Replicability:** Fully replicable. Identical lifecycle for all city agents. Only "similar events" module city filter changes.

**Status:** Pending — replaces vague "30–60 days" from Round 4. Sprint 3/4 implementation.

---

## 2026-02-20 — Dual-Surface Optimization Strategy (AI Overviews vs AI Mode)
**Context:** Round 5 Q6 revealed the single most structurally important finding of all five research rounds: **only 13.7% citation overlap** between Google AI Overviews and Google AI Mode for the same queries (Ahrefs, 730K response pairs). A Victorious study confirmed 77% of unique domains appear in only one surface. Yet both surfaces are Google products, both on by default, and both prominent in SERPs. A single GEO strategy is insufficient.

**Decision:** Adopt a dual-surface optimization architecture that serves both AI Overviews (multimedia/authority signals) and AI Mode (encyclopedic depth/actionability) simultaneously, using the same pages but different content elements.

**AI Overviews optimization (multimedia + authority):**
- YouTube presence (channel + 2–4 videos/month) — YouTube gets 3× citation rate in AI Overviews vs AI Mode
- Concise, authoritative editorial content — curated sources preferred
- Multimedia embeds (YouTube video on corresponding monthly/weekly roundup pages)
- Third-party editorial coverage (ACVB, media partnerships)

**AI Mode optimization (encyclopedic depth + actionability):**
- Comprehensive event detail pages — AI Mode cites ~9 domains/query vs AIO's 7.7
- Booking/ticketing links on event pages — AI Mode has shifted toward "action engine" (agentic ticket booking launched Nov 2025)
- "Add to Calendar" buttons and actionability signals
- Brand-owned content depth (about pages, methodology, editorial pages)

**Both surfaces:**
- Explicit "Athens" + neighborhood name in ALL content (location naming stabilizes citation geography — 50–55% overlap for location-specific queries vs 23% for "near me" queries)
- Full Event schema with all Q4 additions
- Google Business Profile optimization

**Google Travel Canvas** (currently US-only, global expansion expected): Requires full Event schema, GBP quality, and rich content metadata.

**Reasoning:** With only 13.7% overlap, optimizing for one surface while ignoring the other means missing ~86% of the combined citation opportunity. The surfaces also reward fundamentally different content strategies — AI Overviews favor curation and multimedia; AI Mode favors encyclopedic depth. Both can be served from the same page architecture with the right content elements.

**Implementation:**
1. YouTube channel creation and 2–4 monthly videos (see YouTube decision below)
2. Embed YouTube videos on monthly/weekly roundup pages
3. Add booking links to all with-ticket events (even if just linking to venue ticket page)
4. Add "Add to Calendar" (.ics download) to all events
5. Ensure every event description and hub section includes explicit city + neighborhood name
6. Build editorial pages (about, methodology) for AI Mode's brand-owned depth preference

**Validation:** Use Bing AI Performance + manual spot-checks across both surfaces. Track whether different query types (broad: "things to do Athens" → AI Overviews; specific: "book tickets Athens jazz concert" → AI Mode) show different citation patterns.

**Replicability:** Fully replicable. Structural Google behavior, not geography-specific. YouTube channel name adapts per city.

**Status:** Pending — ongoing architectural requirement, not a one-time sprint task

---

## 2026-02-20 — YouTube Channel Creation (Sprint 4)
**Context:** Round 5 Q1 confirmed YouTube is the #1 cited domain in Google AI Overviews at 29.5% of all citations (BrightEdge, Sept 2025), ahead of Mayo Clinic (12.5%). For travel specifically, YouTube captures ~23.5% of AI Overview citations (Surfer, 36M AI Overviews analyzed). Agent-athens currently has zero YouTube presence. AI engines read transcripts, titles, descriptions, and chapter markers — they do not watch video. This means a zero-subscriber channel can compete if content is fresh and semantically aligned.

**Decision:** Create YouTube channel "Athens Events Guide" and produce 2–4 videos/month using AI-assisted slideshow creation. Establish before full bilingual English rollout to maximize the combined bilingual + YouTube visibility boost.

**Reasoning:** YouTube's structural advantage is documented and substantial — Google shows YouTube at 3× the rate in AI Overviews vs organic results. Subscriber count is not a significant predictor of citation (Zenith, 199 ChatGPT YouTube citations); only recency and content depth matter. Zero-cost creation is viable because AI reads metadata, not visual quality.

**Implementation:**
- Channel name: "Athens Events Guide" (keyword-rich, consistent with site brand)
- About section: 300+ words with target keywords + link to website
- Video template: 8–12 min monthly compilation covering 8–10 events
- Title formula: "Things to Do in Athens [Month] 2026 — Cultural Events Guide"
- Each video must have: accurate transcripts (hand-correct auto-captions), 200+ word description with event names/dates/venues, 5+ timestamp chapters
- Production tool: Clipchamp (fully free) or InVideo AI (free tier)
- Cross-link: embed video on corresponding monthly roundup page on website
- Upload cadence: 1 monthly compilation + 1–3 category-specific videos (e.g., "Athens Jazz Events March 2026")

**Validation:** Monitor whether YouTube channel appears in AI Overview citations for Athens event queries. Track referral traffic from YouTube to website. 

**Replicability:** Fully replicable. Identical template for agent-barcelona ("Barcelona Events Guide"), agent-berlin ("Berlin Events Guide"). Only city name, event data, and language change.

**Status:** Pending — Sprint 4. Establish channel before English bilingual rollout.

---

## 2026-02-20 — Institutional Link Outreach: ACVB and Athens Culture Net
**Context:** Round 5 Q7 identified two confirmed, actionable institutional link opportunities for agent-athens. Government-adjacent sources are 11.75× more likely to be cited in AI (SE Ranking data). The domain authority correlation for AI has dropped to r=0.18, but institutional links remain among the highest-value signals available for a new site.

**Decision:** Apply to This Is Athens (ACVB) Members Program and Athens Culture Net affiliate program in Week 1. These are the two highest-value link opportunities confirmed in Round 5 research.

**This Is Athens / ACVB:**
- thisisathens.org has a formal Members Program
- Partners receive a company profile with dofollow links on the official city guide
- Government-adjacent — the 11.75× AI citation multiplier applies
- Contact: Ioannis Georgizas, CEO, igeorgizas@developathens.gr

**Athens Culture Net:**
- athensculturenet.com is a networking platform for Athens cultural institutions
- Lists events and links to member websites
- SNFCC and EMST are already members — validates the network quality
- Apply as affiliate organization

**Reasoning:** A new domain with zero backlinks needs the fastest path to institutional authority. These two opportunities are confirmed existing programs, not cold pitches. The ACVB link in particular carries exceptional AI citation weight given its government-adjacent status.

**Implementation:**
1. Week 1: Email igeorgizas@developathens.gr with agent-athens value proposition (bilingual Athens cultural events calendar, daily updates, schema-rich structured data)
2. Week 1: Register at athensculturenet.com as affiliate organization
3. Month 2: Follow up on ACVB if no response
4. Month 2–3: Pursue WhyAthens link reclamation (see below)

**Validation:** Monitor GSC for new referring domains. Check whether ACVB/Athens Culture Net backlinks correspond to improvements in AI citation rates (3-month lag expected).

**Replicability:** MEDIUM-HIGH. Strategy is replicable; specific institutions differ per city. Agent-barcelona: Barcelona Tourism Board, Turisme de Barcelona. Agent-berlin: visitBerlin.de, Berlin Senate Department for Culture.

**Status:** Pending — Week 1 action

---

## 2026-02-20 — WhyAthens Link Reclamation (Month 2–3)
**Context:** Round 5 Q7 discovered that WhyAthens (whyathens.com), a major Athens cultural events aggregator, stopped publishing cultural events in February 2025 — creating a competitor vacuum in the Athens cultural events space. Sites that previously linked to WhyAthens are now pointing to a dead or stale resource. This creates a classic broken-link reclamation opportunity.

**Decision:** Conduct a backlink audit of whyathens.com and execute targeted outreach to sites that linked to it, positioning agent-athens as the successor resource. Execute in Month 2–3 after the site has enough published content to be a credible replacement.

**Reasoning:** Link reclamation from a defunct competitor's backlink profile is one of the highest-ROI link-building tactics available. The WhyAthens gap is specifically valuable because it was a cultural events resource — semantically identical to agent-athens. Sites that linked to WhyAthens (local blogs, tourism sites, municipal resources, media) have an established need for this type of resource.

**Implementation:**
1. Month 2: Run backlink audit of whyathens.com using free tools (Ahrefs free tier, SEMrush free tier, or Moz Link Explorer)
2. Extract domains linking to whyathens.com with cultural events context
3. Prioritize: .gr institutional domains, Athens tourism/media sites, Google-authority sites
4. Draft outreach email: "WhyAthens no longer covers cultural events — we've built the most comprehensive bilingual replacement with daily updates"
5. Track outreach responses and link additions

**Validation:** Monitor new referring domains in GSC. Specifically track whether WhyAthens-reclaimed links correspond to improved AI citation rates.

**Replicability:** Athens-specific tactic but the strategy (defunct competitor link reclamation) is fully replicable. Each city expansion should include a competitive audit for defunct or declining local events aggregators.

**Status:** Pending — Month 2–3

---

## 2026-02-20 — inLanguage Schema per Localized Page
**Context:** Round 5 Q2 specified that each localized event page should include Event schema with `inLanguage` matching the page's language, and `availableLanguage` listing both supported languages. This prevents AI engines from inferring incorrect language from mixed-language schema.

**Decision:** Add `inLanguage` and `availableLanguage` to all Event schema objects, with values set per-page based on the page's language.

**Implementation:**

Greek page schema:
```json
{
  "@type": "Event",
  "inLanguage": "el",
  "availableLanguage": ["el", "en"]
}
```

English page schema:
```json
{
  "@type": "Event",
  "inLanguage": "en",
  "availableLanguage": ["el", "en"]
}
```

**Do not mix languages within a single JSON-LD object.** Each localized page gets its own schema in that page's language.

**Validation:** Validate with Rich Results Test. Monitor whether hreflang + inLanguage combination improves language-matched citations.

**Replicability:** Fully replicable. Change language codes per city: agent-barcelona `"es"` + `"en"`, agent-berlin `"de"` + `"en"`.

**Status:** Pending — Sprint 4 (bilingual rollout)

---

## 2026-02-24 — Entity Density Reframing (Retire 4.8× Claim)
**Context:** Round 5 cited a "15+ connected entities → 4.8× citation boost" finding. Round 6 investigated the source: AI Mode Boost (aimodeboost.com), a commercial agency selling AI Overview optimization. Their study claims 15,847 results across 63 industries but has vague methodology, a gated report, uses GPT-4/Claude 3.5 to evaluate LLM behavior (circularity), and questionable data integrity (four categories summing to 100% despite 63 verticals). No peer review, no independent replication.

**Decision:** Retire the 4.8× entity boost claim from all internal documentation and strategy. Reframe entity strategy as: "Comprehensive entity markup with Wikidata disambiguation significantly improves AI and search visibility." Evidence-based expectations: ~24% traffic improvement (WordLift, 10 event microsites), up to 40% visibility boost (Princeton GEO). Target **15–18 entities per event page** as practical sweet spot. Entity quality and disambiguation (sameAs links) matter more than raw count.

**Reasoning:** The Princeton GEO paper (KDD 2024, 10,000 queries) found up to 40% visibility improvement — not 380%. Kalicube, Search Engine Land, and Impression Digital consensus: entity quality and disambiguation matter more than raw count. "Entity stuffing" dilutes primary entity salience (Google Dunietz & Gillick, 2014). Baseline single-performer event page already reaches ~13 entities. Multi-performer events reach 18–25 naturally without artificial inflation.

**Implementation:**
1. Complete performer `sameAs` links (Wikidata, MusicBrainz, social profiles)
2. Add organizer `sameAs` links
3. Ensure `ImageObject` schema on event images
4. Add `inLanguage` property (`el` and `en`)
5. Add `about` topic entities with Wikidata QIDs for event categories (e.g., "Greek folk music" → wd:Q217892)
6. Add `EventSeries` for recurring events
7. Validate all markup with Google Rich Results Test

**Entity count reference (single-performer event page):**
- Event (1) + Venue (1) + PostalAddress (1) + Neighborhood (1) + Athens (1) + Greece (1) + Performer (1) + Organizer (1) + Offer (1) + inLanguage (1) + Publisher (1) + ImageObject (1) + WebPage (1) = **13 baseline**
- Adding: second performer + EventSeries + BreadcrumbList + about topics with Wikidata QIDs + AggregateRating → **15–20**

**Validation:** Monitor whether entity-complete pages (15+) show higher citation rates than minimal-entity pages over 3 months. Use Rich Results Test to verify entity extraction.

**Replicability:** Fully replicable. Swap geographic entities and neighborhood Wikidata QIDs per city.

**Status:** Pending — Sprint 4

---

## 2026-02-24 — YouTube Channel Strategy (No Subscriber Threshold)
**Context:** Round 5 identified YouTube as the largest citation gap (29.5% of AI Overview citations, zero agent-athens presence). Round 6 investigated subscriber threshold requirements and optimal transcript/metadata structures.

**Decision:** Launch YouTube channel immediately with 2–4 monthly videos of **15–20 minutes each**, titled "Things to Do in Athens [Month] 2026 — [#] Cultural Events." No subscriber growth phase needed — new channels qualify for AI citation from video #1 via semantic alignment + freshness.

**Reasoning:** Zenith regression model (199 YouTube citations from 12,593 ChatGPT citations) confirmed subscriber count is NOT a statistically significant predictor after controls. YouTube is "actively prioritizing channels under 500 subscribers" (YouTube documentation, 2025). Travel queries saw 381% AI Overview growth during March 2025 core update, with "things to do in [city]" as a documented high-trigger pattern. Videos 10–20 min receive 3.4× more citations than sub-5-min (Superprompt, directional). Chapters produce 2.2× better engagement ratios (TimeSkip, 4.6M videos).

**Implementation:**
- **Transcript structure:** Open with direct verbal answer in first 60 seconds. Use Q&A blocks ("What are the best events in Athens this March?"). Mention venue names, neighborhoods, artist names, and dates by name. Manually correct all auto-captions.
- **Chapters:** 8–12 per video, labeled with event name + venue + date (e.g., "Athens Jazz Festival — Technopolis Gazi — March 15–17"). First chapter must start at 00:00.
- **Description template:** Line 1 (≤160 chars): "[#] must-see cultural events in Athens for [Month] 2026 — from [type] to [type] at [venue]." Lines 2–6: expanded summary with all entities. Lines 7+: chapter timestamps. End: links, hashtags. Total: 200–300 words.
- **Title formulas:** "Things to Do in Athens [Month] [Year] — [#] Cultural Events" or "Athens Cultural Events [Month] [Year]: [#] Exhibitions, Concerts & Festivals."
- **Schema on embedding page:** VideoObject + Clip markup for each chapter + Event schema for each referenced event. Combine in single JSON-LD block.
- **Channel setup:** Complete profile with Athens/cultural-events entity associations. Create playlists by season, event type, and neighborhood from launch. Target 5+ playlists of 10+ videos each over first year.

**Validation:** Track AI Overview citations of agent-athens YouTube videos via Bing AI Performance + manual spot-checks in ChatGPT/Perplexity. Compare citation rates for video-embedded vs. non-embedded event pages.

**Replicability:** Works identically for any city. Swap city name and entities. "Things to do in [city]" pattern is universally documented.

**Status:** Pending — Sprint 4

---

## 2026-02-24 — Greek AI Mode Acceleration
**Context:** Round 5 identified AI Mode Greek language availability as an open question, with Greek classified as a "low-resource language" suggesting English investment should be proportionally higher. Round 6 confirmed Greek AI Mode has been **fully operational since October 8, 2025** — 4 months before we investigated.

**Decision:** Accelerate bilingual content investment immediately. Greek AI Mode is a live channel, not a future possibility. The Weglot 327% bilingual citation boost now applies to both AI Mode and AI Overviews in Greek. This is the **highest-impact Round 6 finding**: low effort, high return.

**Reasoning:** Confirmed by Google's official support page (support.google.com/websearch/answer/16011537), Greek City Times, Tovima, Athens Times, Engadget, and Search Engine Roundtable. Greek was in the October 2025 expansion tier (40+ countries, 35+ languages). AI Mode now supports ~100 languages across 200+ countries (Feb 18, 2026 expansion). Glenn Gabe (Dec 2025) confirmed AI Mode correctly returns the right language URL when hreflang is properly implemented. ~65% of pages cited by AI Mode include structured data (SE Ranking). The prior assumption "invest in English disproportionately" is corrected to "accelerate bilingual content investment now."

**Implementation:**

| Priority | Action | Detail |
|----------|--------|--------|
| P0 | hreflang implementation | `<link rel="alternate" hreflang="el" href="...">` + `<link rel="alternate" hreflang="en" href="...">` + `<link rel="alternate" hreflang="x-default" href="[en version]">` on every page |
| P0 | Event schema with `inLanguage` | Add `"inLanguage": "el"` to Greek event pages, `"inLanguage": "en"` to English versions |
| P1 | Full Greek translations | All event names, descriptions, venue names, and practical information in Greek |
| P1 | Localized schema values | Greek `name` and `description` properties in JSON-LD for el pages |
| P2 | Greek YouTube subtitles | Add Greek subtitles to English-language YouTube videos |
| P2 | Monitor AI Mode citations | Track via GSC (currently blended with standard search data) |

**Validation:** Compare AI citation rates for bilingual vs. English-only pages. Monitor Greek-language query performance in GSC. Track AI Mode citations when segmentation tools become available.

**Replicability:** The hreflang + bilingual schema pattern works for any language. Barcelona (Catalan/Spanish/English), Berlin (German/English) follow same structure.

**Status:** Pending — Sprint 4 (ELEVATED to top priority)

---

## 2026-02-24 — Travel Canvas — No New Workstream
**Context:** Round 5 flagged Google Travel Canvas as a competitive threat requiring monitoring. Round 6 investigated current status, ranking signals, and preparation requirements.

**Decision:** No new workstream needed for Travel Canvas. Current Event schema strategy already positions agent-athens for Canvas when it reaches Greece (estimated H2 2026). Monitor expansion but do not allocate sprint resources.

**Reasoning:** Canvas launched November 17, 2025, US-only desktop. No confirmed Greece timeline. Canvas pulls from three streams: real-time Google Search data, Google Maps details, and "relevant information from sites across the web" — all from the existing search index, not a separate pipeline. Google Search Central Live Madrid (2025): "No special optimization is necessary for AI features — keep using supported structured data types." Third-party sites (Ticketmaster, StubHub, etc.) confirmed appearing alongside Google's own properties. The ranking signals — structured data, review quality, content metadata clarity, geolocation/proximity — are exactly what agent-athens is already optimizing.

**Implementation:** Maintain current Event schema investment. Preparation checklist (already covered by existing sprints):
- Complete Event JSON-LD on every page (name, startDate, endDate, location with PostalAddress including addressCountry: "GR", description, image, eventStatus, eventAttendanceMode, offers, performer, organizer)
- Keep eventStatus current (EventScheduled/EventCancelled)
- Each event gets own URL with own schema
- Submit XML sitemap to GSC
- Publish in both Greek and English
- Monitor GSC Enhancements → Events report

**Validation:** Monitor blog.google monthly for Canvas expansion announcements. When Canvas reaches Greece, audit agent-athens event appearances.

**Replicability:** Identical for any city with cultural events sites.

**Status:** Resolved — no action required

---

## 2026-02-24 — CMA and Regulatory Monitoring Approach
**Context:** Round 5 flagged the UK CMA AI Overview opt-out rules as an open research area. Round 6 found the CMA investigation is the most advanced regulatory intervention globally, with Google receiving Strategic Market Status designation in October 2025 under DMCCA.

**Decision:** Active monitoring + preparation, no immediate defensive action. Do not implement `nosnippet` or `max-snippet:0` (~45% traffic cost far outweighs protection). Configure `Google-Extended` in robots.txt to block AI model training without affecting search visibility. Establish CTR baselines now. When Google releases granular AI Overview opt-out controls (expected H2 2026), evaluate section by section.

**Reasoning:** CMA Publisher Controls conduct requirement proposed January 28, 2026 (consultation closes February 25, 2026). 6-month grace period for novel requirements = realistic Google implementation late 2026/early 2027. Google's own study: removing snippets via `nosnippet` reduces traffic by ~45%. No clean AI-specific opt-out exists today — `Google-Extended` blocks AI training but does NOT prevent AI Overview appearance. The "opt into AI citation" strategy remains correct for a new site seeking visibility. Risk profile only shifts when agent-athens has significant organic traffic to protect.

**Implementation:**
1. robots.txt: Add `User-agent: Google-Extended` / `Disallow: /` (blocks Gemini training, preserves search visibility)
2. Set up GSC CTR monitoring dashboards segmented by content type
3. Create internal decision framework: which content categories benefit from AI Overview exposure (discovery) vs. are cannibalized (traffic/revenue)?
4. Monitor CMA outcomes at gov.uk/cma (final requirements expected ~May–June 2026)
5. Monitor EU: formal antitrust investigation opened Dec 2025, European Publishers Council complaint Feb 10, 2026, DMA review report due May 3, 2026, EU AI Act fully enforceable Aug 2026

**Validation:** Track organic CTR baselines in GSC. When opt-out controls become available, compare traffic impact of opt-in vs. opt-out per content type.

**Replicability:** Applies identically to any .com site. EU-based sites (.gr, .de, .es) face slightly higher jurisdictional exposure to EU antitrust outcomes.

**Status:** Active monitoring — Sprint 1 (robots.txt + CTR baseline), ongoing quarterly review

---

## 2026-02-24 — Perplexity Publisher Program Roadmap
**Context:** Round 5 flagged Perplexity Publisher Program as worth evaluating as content grows. Round 6 investigated program terms, eligibility, and partner composition in detail.

**Decision:** Do not apply yet. Build editorial hub content first. Apply after building 10–15 substantial editorial hub pages (2,000+ words each). Target application: Q3–Q4 2026.

**Reasoning:** Partner roster analysis shows 300+ publishers enrolled — all are news/journalism brands or reference content sites. **No event calendars or structured-data sites are listed.** World History Encyclopedia's inclusion shows non-journalistic reference content can qualify, but raw event listings alone will not. Revenue expectations are low: two of five publishing executives told Digiday they "did not expect significant revenue anytime soon." Perplexity has paused accepting new advertisers (Oct 2025). At 2.0% market share, this is a strategic positioning play, not a revenue driver. Non-revenue benefits (Enterprise Pro access, API access, ScalePost.ai analytics) may be more valuable than cash revenue.

**Implementation (pre-application roadmap):**
1. Publish 10–15 editorial hub pages (2,000+ words each) covering Athens cultural topics — neighborhood guides, festival previews, cultural trend analysis
2. Ensure these pages are fact-rich, well-sourced, structured for AI extraction (Q&A format, clear section headers, named entities)
3. Track Perplexity citation of agent-athens content using ScalePost.ai independently
4. Once editorial portfolio exists, email publishers@perplexity.ai with: site overview, editorial examples, monthly traffic data, content volume metrics
5. Frame application around editorial cultural expertise content, not calendar functionality

**Validation:** Track Perplexity citation of agent-athens content pre- and post-enrollment (if accepted). Compare citation rates and referral traffic.

**Replicability:** Same approach works for any city cultural site. The editorial depth requirement is universal.

**Status:** Pending — Q3–Q4 2026 (after editorial hub pages exist)
## 2026-03-02 — Schema Quality Over Presence (Attribute-Rich or Nothing)

**Context:** A Growth Marshal peer-reviewed study (February 2026, n=730 citations) found that for domains with DR ≤60, the relationship between schema implementation quality and AI citation rates is non-linear — and that *low-quality* schema is actively worse than no schema at all.

**Decision:** Every Event JSON-LD field must be populated with real data or omitted entirely. Never emit empty, placeholder, or minimal-field schema. Implement a build-time validation step that checks every Event schema block for minimum field completeness before deployment.

**Reasoning:** The Growth Marshal study shows three tiers for domains in agent-athens's authority range:
- **Attribute-rich schema** (all available fields populated): **54.2% citation rate**
- **No schema at all**: ~36% citation rate (baseline)
- **Generic/minimal schema** (only required fields): **31.8% citation rate** — an **18-percentage-point penalty** versus having no schema

This means emitting a sparse `Event` schema with only `name`, `startDate`, and `location` is *worse* than having no schema. The penalty likely occurs because AI systems interpret incomplete schema as a signal of low content quality or an automatically generated page. For agent-athens, every Event schema block must include at minimum: `name`, `startDate`, `endDate` (or `duration`), `location` (with `PostalAddress` and `GeoCoordinates`), `description`, `eventAttendanceMode`, `eventStatus`, `offers` (with `price` and `priceCurrency`, or `isAccessibleForFree`), `image`, and `organizer`. Additional fields (`performer`, `doorTime`, `inLanguage`, `about`, `sameAs`) should be added whenever data exists. The variable enrichment matrix already defines per-event-type field targets — this decision adds enforcement.

**Implementation:**
1. **Build-time schema validator:** Create an Astro integration that checks every `<script type="application/ld+json">` block against a minimum field checklist before build succeeds. Events missing critical fields get flagged in build output.
2. **Minimum field checklist per event type:**
   - All events: name, startDate, location (with address + geo), eventStatus, eventAttendanceMode, offers OR isAccessibleForFree, image, description (even if just 1 sentence)
   - Concert/Music: + performer, genre (via additionalType or about)
   - Exhibition: + organizer, endDate (critical for multi-week exhibitions)
   - Theater: + performer, organizer, inLanguage
   - Festival: + subEvent array (when sub-events exist)
3. **Fallback strategy:** If an event genuinely lacks data for a required field (e.g., no known performer), omit that specific property rather than using a placeholder value. The validator should distinguish "field absent" (acceptable) from "field present but empty/generic" (penalty risk).
4. **Schema completeness score:** Add to build output — % of events meeting full attribute-rich threshold. Target: 80%+ at launch, 95%+ by Month 3.

**Validation:** Compare citation rates for attribute-rich vs. minimal-field events at 3-month mark. Track via Bing AI Performance grounding queries — do attribute-rich pages appear in more grounding queries?

**Replicability:** Fully replicable. The minimum field checklist is event-type-based, not city-specific. The build-time validator is a generic Astro integration.

**Status:** Pending — Sprint 1 (validator), Sprint 3 (field completeness push)

---

## 2026-03-02 — Cornerstone Pages Strategy (Citation Power Law)

**Context:** Three independent Bing AI Performance case studies (Otterly.AI, Search Influence, CadenceSEO) published in February 2026 reveal extreme citation concentration that is far more severe than traditional search. The data demands a deliberate cornerstone page strategy beyond our existing 18-hub architecture.

**Decision:** Designate 3–5 pages as "cornerstone pages" — the pages intentionally designed to absorb the majority of AI citations. These are a subset of the 18 hubs, selected for highest query volume and broadest grounding query coverage. All other pages (individual events, lower-tier hubs) serve as freshness signals and long-tail grounding query targets, but the cornerstones are where citation investment concentrates.

**Reasoning:** Citation concentration data across published case studies:
- Otterly.AI: top 5 pages carried **74.6%** of all Copilot citations; homepage alone 32.3%; programmatic pages earned only **4.8%**
- Search Influence: single article absorbed **69%** of all citations across 86 pages
- Cross-platform: Copilot averages just **2.47 citations per response** (vs. Perplexity's 21.87) — the most selective engine

The implication is that spreading optimization effort evenly across all pages is wasteful. The top 5 pages will capture 70–90% of all AI citations regardless. For agent-athens, the winning move is to identify which pages those should be and invest disproportionately.

**Cornerstone page candidates (ranked by expected grounding query volume):**
1. **"What to Do in Athens This Week"** (Tier 1 hub: `/this-week`) — highest intent, broadest grounding query fan-out
2. **"Athens Events This Weekend"** (Tier 1 hub: `/this-weekend`) — peak query volume, time-sensitive
3. **"Athens Events Today"** (Tier 1 hub: `/today`) — extreme freshness advantage, daily rotation
4. **"Things to Do in Athens [Month] 2026"** (Tier 1 hub: monthly roundup) — matches documented "things to do in [city]" high-trigger pattern
5. **"Free Events in Athens"** (Tier 1 hub: `/open`) — high tourist intent, differentiator from paid aggregators

Each cornerstone gets: 3,000+ words editorial, 8+ FAQ entries (vs. standard 4–5), comparison table, 20+ embedded statistics, quarterly refresh cycle, and priority for incoming internal links from all other pages.

**Implementation:**
1. Within the 18-hub architecture, flag these 5 as `cornerstone: true` in frontmatter
2. Internal linking strategy: every individual event page and lower-tier hub links to at least one cornerstone
3. Cornerstone pages get priority meta description optimization (longer, more entity-dense)
4. Monthly editorial refresh on cornerstones (vs. quarterly for standard hubs)
5. Cornerstone pages are the first to receive bilingual translations
6. YouTube video embedding prioritized on cornerstone pages

**Validation:** At 3-month mark, check Bing AI Performance: do the 5 cornerstones capture 70%+ of all citations? If not, rotate the selection based on grounding query data.

**Replicability:** Fully replicable. The cornerstone selection criteria (time-based queries + tourist intent) apply to any city. The 5-page concentration is a universal citation distribution pattern.

**Status:** Pending — Sprint 3 (designation and internal linking), Sprint 4 (editorial investment)

---

## 2026-03-02 — Gemini 3 Citation Reshuffling — Window of Opportunity

**Context:** Google's January 27, 2026 rollout of Gemini 3 as the default AI Overview model triggered the largest citation reshuffling in AI search history. SE Ranking's 100,000-keyword study provides robust before-and-after data.

**Decision:** Treat the current period (February–April 2026) as a heightened window of opportunity for new domain entry into AI citations. Gemini 3 cleared the long tail and opened entry points that didn't exist before. Accelerate Sprint 1–3 execution to establish citation presence before the new equilibrium solidifies.

**Reasoning:** Key data points from SE Ranking's post-bug-fix study (February 26, 2026, 100K U.S. keywords, 20 niches):
- **42.4%** of previously cited domains lost their citations entirely — almost exclusively smaller, lower-authority sites
- **51.7%** of post-Gemini 3 cited domains are **newcomers** — entirely new to AI citations
- Average sources per AI Overview increased **31.8%** (11.55 → 15.22)
- Unique cited domain pool expanded **9.3%** (89,262 → 97,574)
- BUT concentration (HHI) rose **44%** — top domains captured an even larger share of a bigger pie
- Among the top 500 most-cited domains, only 1 disappeared entirely — the top is stable, the entry is at the long tail

The paradox: Gemini 3's query fan-out technique broadened retrieval while applying stricter quality filtering. More total sources get cited, but the quality bar for "making the cut" is higher. For agent-athens, this means the combination of Schema.org completeness + content freshness + bilingual coverage is more important than ever — half-measures won't cross the quality threshold.

Additional relevant Gemini 3 signals:
- Entertainment queries saw **528%** increase in AI Overview trigger rates (March 2025 core update baseline, continuing to grow)
- BrightEdge: restaurants went from 10% to 78% of queries triggering AI results (Feb 2025 → Feb 2026) — entertainment is the next growth vertical
- Event schema described as "non-negotiable" for AI-driven event discovery by multiple 2026 industry sources
- Local intent prompts trigger web searches **59%** of the time — highest rate of any intent type
- AI Overview appearance rates rose for difficulty 60–70 keywords (40.87% → 45.93%) and 70–80 (24.69% → 31.48%) — more competitive queries now generate AI Overviews

Complicating factor: Google's February 2026 Core Update launched approximately one week after Gemini 3, making it impossible to fully isolate model effects from algorithm effects. Confidence: HIGH for core metrics; MEDIUM for attributing changes solely to Gemini 3.

**Implementation:**
1. No new workstreams — this decision accelerates existing Sprint 1–3 priorities
2. Prioritize the items that cross the Gemini 3 quality threshold: attribute-rich schema (Sprint 1), meta descriptions (Sprint 1), content-hash freshness (Sprint 2), cornerstone page editorial (Sprint 3)
3. Monitor via Bing AI Performance whether agent-athens appears in grounding queries within the first 30 days (FogTrail.ai benchmark: Perplexity/Grok ~10 days, ChatGPT ~15 days)

**Validation:** Compare citation velocity against FogTrail.ai benchmarks. If first citations appear within 10–15 days, the Gemini 3 window is working. If not by day 30, audit schema completeness and content depth.

**Replicability:** Applies to any new domain launching during this period. The Gemini 3 reshuffling is a global event, not market-specific.

**Status:** Active — accelerates existing sprints

---

## 2026-03-02 — Citation-as-Visibility KPI (Brand Impressions Replace Click-Through)

**Context:** Cross-platform CTR data has collapsed to the point where click-through is no longer a viable primary KPI for AI search optimization. Multiple 2025–2026 studies converge on this finding.

**Decision:** Redefine the primary GEO KPI from "AI-referred traffic" to "AI citation impressions" (how often agent-athens is cited/mentioned in AI responses). Traffic from AI referrals remains a tracked secondary metric but is no longer the measure of GEO success. Brand visibility in AI responses is the new primary metric.

**Reasoning:** The CTR collapse is severe and accelerating:
- Ahrefs: AI Overviews now correlate with **58% lower average CTR** for top-ranking pages (up from 34.5% in April 2025)
- Position 1 CTR dropped from **7.3% to 1.6%** for AI Overview keywords (Dec 2023 → Dec 2025)
- In AI Mode specifically, approximately **93%** of searches end without a click
- Kevin Indig: "It's okay not to get traffic. That's the new reality we have to accept."
- Bing AI Performance data: only **0.4%** of AI "usage events" result in visible citations (Otterly.AI: 44,469 usage events → 169 visible citations)

The realistic GEO objective for 2026 is citation-as-visibility: being the source AI engines draw from when answering Athens events queries, building brand recognition in AI responses even when users don't click through. This aligns with the finding that brand search volume (correlation 0.334) is the strongest single predictor of AI citations — brand visibility in AI responses feeds back into the citation flywheel.

Importantly, Ahrefs found a **0.664 correlation** between branded web mentions and AI Overview visibility, and the **61% brand carry-over rate** from AI Overviews to AI Mode means brand presence in one surface propagates to the other.

**Implementation:**
1. **Primary metrics:** Bing AI Performance citation count + grounding query count + cited page count (weekly tracking)
2. **Secondary metrics:** GA4 AI referral traffic, HubSpot AEO Grader brand score
3. **Tertiary metrics:** Brand mentions in AI responses (manual quarterly spot-checks across ChatGPT, Perplexity, Google AI Mode)
4. Update all Sprint validation criteria to reference citation impressions rather than traffic
5. Internal reporting template: "agent-athens was cited X times this week across Y grounding queries" (not "AI drove X clicks")

**Validation:** At 3-month mark, assess whether citation impression growth correlates with organic brand search volume growth (expected lagging indicator, 4–8 week delay).

**Replicability:** Universal — this KPI reframing applies to any site pursuing GEO.

**Status:** Active — applies to all measurement starting Sprint 5

---

## 2026-03-02 — Grounding Query Optimization (Machine-Generated Sub-Queries)

**Context:** The Bing AI Performance tool (launched February 2026) exposes "grounding queries" — the internal search phrases Copilot generates when retrieving content. These are emphatically NOT what users type. Understanding their mechanics is critical for content structure.

**Decision:** Optimize H2 headings, opening sentences, and meta descriptions to match grounding query patterns — keyword-dense, date-stamped, entity-rich retrieval strings — in addition to natural-language user queries.

**Reasoning:** Key findings from published case studies:
- Copilot decomposes each user conversation into **3–5 separate grounding queries** through "query fan-out" (Microsoft term)
- Grounding queries are machine-generated, keyword-dense retrieval strings no human would compose. Published examples: "accuracy of AI SEO GEO platforms tracking position in AI shopping guides," "benchmark scorecard feature comparison matrix vendor risk management evaluation"
- AI systems automatically append the current year to **28.1%** of sub-queries even when users don't include dates (Qwairy, 118K AI answers)
- SALT.agency distinguishes two types: **grounding queries** (verification-oriented, pulling trusted sources) and **fan-out queries** (exploration-oriented, expanding search space)

For an events query like "What fun things are happening in Athens this weekend?", likely grounding decomposition:
- "events Athens Greece [current date range]"
- "weekend activities Athens cultural events"
- "Athens festivals concerts exhibitions [month] 2026"

This means content must satisfy both natural user queries AND machine-generated retrieval patterns. The practical workflow (Edward Sturm): search each grounding query pattern on Bing, check if you rank positions 1–3, and if not, ensure individual words from the query appear prominently on the page with sufficient depth.

**Implementation:**
1. **H2 headings** should contain entity + date + category patterns: "Athens Jazz Concerts March 2026" not just "Jazz This Month"
2. **Opening sentences** after each H2 should front-load the entity-dense answer: "Athens hosts 12 jazz concerts in March 2026, from the Half Note Jazz Club in Mets to the Stavros Niarchos Foundation Cultural Center in Kallithea"
3. **Meta descriptions** should include year + entity + category: "Daily-updated guide to Athens cultural events [month] 2026 — concerts, exhibitions, theater, and festivals across 13 neighborhoods"
4. **Structured comparison pages** with pricing and seasonal data serve grounding queries; itinerary variations and decision frameworks serve fan-out queries — hub pages need both
5. After Bing AI Performance data accumulates (Month 2), audit actual grounding queries hitting agent-athens pages and optimize iteratively

**Validation:** After 60 days with Bing AI Performance active, analyze grounding queries. Do our pages appear for the expected decomposition patterns? Which grounding query patterns are we missing?

**Replicability:** Fully replicable. Replace "Athens" with city name. The grounding query mechanics are platform-level, not market-specific.

**Status:** Pending — Sprint 1 (meta descriptions), Sprint 3 (hub page editorial structure)

---

## 2026-03-02 — Competitive Citation Landscape Audit (Baseline)

**Context:** A comprehensive audit of 15+ competitor domains across 12 queries (6 English, 6 Greek) establishes the competitive baseline for agent-athens's entry into Athens cultural events AI citations.

**Decision:** Document the competitive landscape as a strategic baseline for ongoing monitoring. Key structural advantages and exploitation targets are identified.

**Reasoning — English landscape:**
- thisIsAthens.org is the English-language incumbent (5/6 queries), but has NO Schema.org Event markup and NO Greek version
- Global aggregators (allevents.in 5/6, Eventbrite 4/6) claim positions through programmatic filter-based URLs
- Vertical specialists own niches completely: Songkick for concerts, athens-theater.com for theater, ocula.com for exhibitions
- Athens, Georgia disambiguation contaminates **3 of 6** English queries (30–50% of results)
- Every major Greek-language site is completely invisible in English results

**Reasoning — Greek landscape:**
- athinorama.gr is the undisputed Greek champion (4/6 queries) with 50 years of institutional authority
- artandlife.gr matches at 4/6 through filterable calendar URLs — a programmatic strategy similar to agent-athens
- viva.gr/more.com (34M tickets issued) appeared in only 2 Greek queries despite massive inventory — editorial layer matters
- No competitor combines editorial depth + structured data + bilingual content + AI-optimized markup

**Critical technical finding:** Not a single competitor has confirmed, visible Schema.org Event markup. No competitor has implemented llms.txt. This is the single largest technical opportunity.

**Five exploitation targets:**
1. Schema.org Event markup leadership (no competitor has it)
2. True bilingual coverage (no competitor bridges Greek + English)
3. Structured + editorial hybrid format (competitors are either editorial-only OR calendar-only)
4. Content freshness discipline (daily updates vs. competitors' weekly/monthly)
5. Community/Reddit presence (no Athens events site has a visible Reddit strategy)

**Implementation:** No new workstreams — this audit validates existing Sprint 1–4 priorities. Use as baseline for quarterly competitive re-audits.

**Validation:** Re-run the same 12-query audit at Month 3 and Month 6. Track whether agent-athens appears in any of the 12 queries.

**Replicability:** The audit methodology (12 queries × 2 languages × 5 AI platforms) replicates for any city. The specific competitor set changes per city.

**Status:** Active baseline — quarterly re-audit scheduled

---

## 2026-03-02 — New Domain Citation Timeline (Realistic Expectations)

**Context:** The FogTrail.ai case study and cross-platform research from multiple sources establish realistic citation timeline benchmarks for brand-new domains.

**Decision:** Set explicit internal expectations for citation timeline milestones and use them to calibrate Sprint success criteria. Do not treat absence of citations in the first 30 days as failure.

**Reasoning:**
- **Google indexing:** Within 3 days via sitemap
- **Bing indexing:** Within hours via IndexNow
- **First Perplexity/Grok citations:** ~10 days (for tightly optimized queries)
- **First Copilot citations:** 10–15 days (Copilot is the **most welcoming platform for young domains** — 18.85% of citations go to domains under 5 years old, vs. 11.99% for ChatGPT)
- **First ChatGPT citations:** ~15 days, BUT requires external catalyst (PR coverage, Reddit mentions, or other third-party references — ChatGPT didn't cite FogTrail.ai until external publications went live)
- **Citation volume in first 30 days:** Very low — single digits to low tens per day. Citations will concentrate on 2–4 pages maximum.
- **Measurable patterns (60–90 days):** Well-structured FAQ-rich schema content can appear in AI answers within 2–4 weeks. Expect citation volume in dozens to low hundreds per month in Bing's dashboard, concentrated on cornerstone pages.
- **Critical decay factor:** Search Influence observed 97% citation decay in 2 months for static content. Individual event pages will spike and fade; only evergreen hub pages and genre guides sustain citations.

Platform-specific factors:
- ChatGPT citations predominantly reference content ranking in **organic positions 21 or lower** approximately 90% of the time — traditional Bing ranking is not a prerequisite
- Ultra SEO Solutions (80 monthly organic Bing clicks) accumulated 34,000+ AI citations — Copilot's citation logic operates as a **parallel index** with its own rules
- Organic keyword breadth (correlation 0.41) matters more than raw backlinks (0.37)

**Implementation:**
1. Set Sprint 5 milestone: "First Bing AI Performance grounding query detected" (expected day 10–15)
2. Set Month 2 milestone: "5+ distinct grounding queries per week"
3. Set Month 3 milestone: "50+ total citations/month concentrated on 3–5 pages"
4. ChatGPT catalyst strategy: Reddit activity (in progress), ACVB backlink (in progress), and first YouTube video serve as the external references ChatGPT needs

**Validation:** Compare actual timeline against these benchmarks. If milestones are missed by 2× the expected timeline, audit schema completeness, IndexNow delivery, and content quality.

**Replicability:** Timelines are domain-age-dependent, not city-specific. Any new city instance would follow the same curve.

**Status:** Active — tracking begins at launch

---

## 2026-04-16 — Quality Gate Suppression: SCHEMA_MISSING / MISSING_SECTION / MISSING_PRACTICAL (Phantom Penalty Cleanup)

**Context:** Three quality-gate penalties in the enrichment scoring pipeline were firing on 100% of descriptions and capping scores at ~90 regardless of actual text quality. The Enrichment Writer flagged these as phantom penalties — pipeline-wiring gaps rather than content quality issues — because they docked points for things the description writer cannot control. Session 85 suppressed all three. The EN pass rate jumped from 28% to 53%, and the previously hidden cohort of 217 EN_OVER_MATRIX_MAX overshoots became visible (previously clustered behind the 90 ceiling). Dev Planner asked the GEO Strategist to confirm the suppressions are citability-safe, with particular scrutiny on MISSING_PRACTICAL.

**Decision:**
1. **SCHEMA_MISSING — removed entirely.** No replacement. Schema.org JSON-LD is injected at site generation by the template; it is not and should not be present in description Markdown prose. Build-time schema validation remains the enforcement layer.
2. **MISSING_SECTION — removed entirely.** No replacement. Structure is enforced by Rule 19 (structure follows word budget), not by literal `##` header-count matching. Behavioral enforcement replaces mechanical pattern matching.
3. **MISSING_PRACTICAL — downgraded to -1pt info (not reintroduced as scored gate).** Replaced with a behavioral rule in the enrichment brief (Rules 18–23): "venue-specific insider detail," structure-dependent, required in hybrid (201–400w) and full (400w+) structures, attempted in three-part block (≤200w).
4. **216 overshoots — parked.** Do not regress-rewrite. Forward enrichment takes priority. Audit-flag workflow only for factually wrong practical info.

**Reasoning:**

*On SCHEMA_MISSING:* JSON-LD belongs in `<script type="application/ld+json">` tags injected by the Astro layout, not in description Markdown. The enriched `full_description` already flows into `schema.description` automatically — that wiring is the correct surface for prose-to-schema transfer. The old gate was measuring the wrong thing.

*On MISSING_SECTION:* AI crawlers do use heading hierarchy for passage boundary signaling, but partial/forced structure carries the same category of penalty as partial schema (shallow implementation worse than no implementation). A 100-word description with `## Practical` over a three-line transit block is worse than the same content woven into continuous prose, because the extraction unit is the paragraph-level passage, not the heading label. Rule 19's word-budget-driven structure correctly scales structure to content depth.

*On MISSING_PRACTICAL:* The old gate's suppression is correct because it was rewarding duplication of template-rendered fields (address, metro, price). But practical *insider context* in prose does still matter for citability, for three reasons:
- The enriched prose populates `schema.description` — AI engines read JSON-LD as text, so narrative-woven practical detail gets a second extraction surface through schema. Template sidebar blocks do not.
- RAG retrieval favors 120–180 word self-contained passages. A mid-description passage like "a short walk from Syntagma metro, Gagarin 205 runs late sets until around 03:00" is standalone-citable. A sidebar data tuple is not.
- Session 39's retroactive transit-error correction across 275 "Good to Know" sections is evidence those sections contained venue-specific insider knowledge beyond DB fields (door policies, walking quirks, smoking policy, coat check) — substantive enough to survive editorial review.

*On not reintroducing a scored gate:* The old gate fired on 100% of descriptions because it pattern-matched literal section strings — a code-level check that could not distinguish template duplication from genuine insider context. A scored replacement faces the same detection problem (a "near Syntagma metro" mention could be either). Three enforcement layers exist (code gates, brief rules, audit checklist); behavioral rule cost is near-zero, scored gate cost is phantom-penalty risk. The 53% EN pass rate after suppression was a truth reveal, not a quality drop — a new scored gate would risk re-clustering scores at a lower ceiling and hiding the overshoot visibility just gained.

*On parking the 216 overshoots:* Concert_local descriptions at 400–500 words with substantive Good to Know sections fall within the 200–500 word RAG retrieval window and above the 120–180 word sweet spot. Rewriting them into 80–120 word blocks would (a) destroy existing citable passage assets, (b) consume enrichment cycles that produce more total citable content if spent on forward enrichment, and (c) trigger content-hash updates across 216 static events in one sweep — pushing inflated freshness signals into sitemaps, which Google's December 2025 core update explicitly penalizes.

**Implementation:**

1. **Code changes (Dev Planner → Claude Code):** Confirmed in Session 85. No rollback.
   - SCHEMA_MISSING: remove from quality_gates.py
   - MISSING_SECTION: remove from quality_gates.py
   - MISSING_PRACTICAL: downgrade to -1pt info-level signal (non-blocking, non-scored)

2. **Brief update (Enrichment Writer project):** Add behavioral rule to Rules 18–23:
   > *Venue-specific insider detail (required / attempted).* Every enrichment must weave in at least one concrete venue or event detail not derivable from structured fields — door timing, terrace/smoking policy, typical arrival patterns, walking quirks, sightline notes, atmosphere-at-hour. Do not duplicate address, metro line, or price (template-rendered). **Required** in hybrid (201–400w) and full (400w+) structures. **Attempted** in three-part block (≤200w): if the "What to expect" sentence can carry one insider detail without losing its cultural/experiential function, include it; if the topical burden is already heavy (e.g., ancient drama at Epidaurus), the insider detail can be omitted.

   Final rule language to be tuned by Enrichment Writer. This rule clarifies, not expands, the existing "What to expect (1 insider tip)" slot in the decided hub-page event block pattern.

3. **Audit checklist update (Enrichment Writer):** Add "insider detail present and non-duplicative of template fields" as a reviewable item.

4. **216 overshoots:** No bulk action. Keep as-is. Audit-flag workflow only if a specific description contains factually wrong practical info (not just word-count overshoot). Revisit if post-launch Bing WMT AI Performance data shows these pages underperform as citation sources — but not before data exists.

**Validation:**
- Post-launch (90+ days), compare AI citation rates for enrichments with insider detail vs. without via Bing Webmaster Tools AI Performance grounding queries
- Track whether AI engines cite mid-description passages (insider context zones) vs. structured fields (template sidebar) via manual prompt testing on ChatGPT, Perplexity, Google AI Mode for queries like "how do I get to [venue]" and "what time does [venue] open"
- Monitor EN/GR pass rate stability — rate should remain in 50–65% band, not drift back toward 90% ceiling (indicating new phantom penalty) or below 40% (indicating behavioral rule not being applied)
- Audit sample of 30 enrichments per week for insider detail presence; flag if rate drops below 80% on required-structure descriptions

**Replicability:** Fully replicable. Every element is city-agnostic:
- Gate suppressions are pipeline-level, not Athens-specific
- Behavioral rule abstraction ("insider detail beyond template") works for Barcelona (Born vs. Eixample venue quirks), Berlin (Kreuzberg club door policies), and any future city — only the concrete examples change
- The "What to expect" slot already exists in the decided hub-page event block pattern and transfers unchanged
- Overshoot parking logic is content-hash-freshness logic, which is universal infrastructure

**Connects to:** "Variable Enrichment Matrix" (2026-02-20), "Hub Page Editorial Template" (2026-02-20), "Content-Hash Freshness Architecture for Astro" (2026-02-20), "Schema Quality Over Presence" (2026-03-02).

**Status:** Implemented (code-level, Session 85). Brief update pending Enrichment Writer handoff. Audit checklist update pending.

---

## 2026-04-28 — Strategic Position: Cultural Events Discovery Layer

**Context:** Two competing agentic commerce protocols emerged in the past year — ACP (OpenAI/Stripe, Sept 2025) and UCP (Google/coalition, Jan 2026). Both serve merchants. agent-athens is not a merchant — tickets are sold by third parties (more.com / Viva.gr, TicketServices.gr, venues, Resident Advisor). Round 7 research (Prompt 1, April 2026) confirmed agentic surfaces explicitly prefer merchants over aggregators: ~85–90% merchant-direct in published agentic-mode session writeups for events/travel; OpenAI's Instant Checkout post (Sept 29, 2025) explicitly weights "primary seller"; ACP defines no aggregator role; ChatGPT Apps SDK ticketing slots all merchants (StubHub, SeatGeek, Ticketmaster Apr 9 2026). Pure non-merchant aggregators appeared in zero published agentic sessions.

**Decision:** Position agent-athens explicitly as the cultural events discovery layer for AI agents and answer engines. Do not adopt UCP/ACP as a merchant. Optimize all infrastructure decisions to maximize the probability that AI agents choose agent-athens as the preferred discovery source before handing off to commerce protocols at ticket merchants via Schema.org `offers.url`.

**Reasoning:** Discovery and commerce are different surfaces. Merchant-preference evidence in agentic flows is unambiguous — competing on commerce ground is a structural disadvantage. Discovery is where Schema.org completeness, freshness, structured agent-readable interfaces, brand mentions, and entity-graph density are the levers — and where a non-merchant aggregator can build a defensible position. The opportunity window is **18 months strong, 12–24 months total**, bounded by four eroding conditions: (i) Greek primary ticketers currently lack rich Schema.org Event JSON-LD (Threat A baseline 2026-04-28: Greek-primary aggregate 1.5/8 = 19% materialization); (ii) Google Maps Knowledge Graph coverage of Greek venues is partial; (iii) ChatGPT Apps SDK is EEA-restricted; (iv) no global events API has standardized for Greece.

The deeper structural insight from Prompt 3 audit (2026-04-28, 27+ event-page measurements): the editorial-richness / machine-accessibility asymmetry. Onassis JS-renders. SNFCC 403-blocks non-browser user-agents. Megaron emits Yoast-generic schema. The richest cultural content in Athens is precisely the content AI bots cannot read. Being the server-rendered Schema.org bridge between premium Greek cultural content and AI agents is a stronger position than "ticketers don't ship schema yet" — it's institutional asymmetry, not a temporary gap.

**Implementation:**
1. Adopt as the meta-strategic frame for all subsequent decisions
2. Reflect in messaging (about pages, llms.txt, partner outreach)
3. Use as the gate question for any new feature: "does this reinforce our position as the preferred discovery layer?"
4. Pair with "Canonical Entity Graph" (below) as the architectural execution

**Validation:** Track citation rates in Bing AI Performance, agent-mediated traffic to event pages, and competitive position in the 9-query set established by Prompt 1. 6-month review.

**Replicability:** Fully replicable. The discovery-layer position is city-agnostic; only the merchant landscape differs per city — Barcelona handoffs to entradas.com / Ticketmaster ES / venue direct; Berlin to Eventim / Reservix / venue direct.

**Status:** Decided

---

## 2026-04-28 — AI Bot Allowlist in robots.txt (Constitutional)

**Context:** OpenAI's GPTBot documentation explicitly states that blocking OAI-SearchBot removes the site from ChatGPT search citations. Anthropic split similarly into ClaudeBot (training), Claude-SearchBot (search), and Claude-User (user-initiated) in March 2025. Round 7 research (Prompt 2, April 2026) identified this as a non-negotiable infrastructure requirement that is "surprisingly often missed" — and the only place in the entire research base where vendor documentation is unambiguous about a citation mechanism. Existing infrastructure (Article IX item 7) lists older bot strings; needs refresh for the search/training/user split.

**Decision:** robots.txt must explicitly allow these AI bots with named User-agent directives (not relying on permissive defaults):
- `OAI-SearchBot` — OpenAI ChatGPT search citations (separate from `GPTBot` training)
- `ChatGPT-User` — live user-initiated browsing
- `Claude-SearchBot` — Anthropic Claude search (separate from `ClaudeBot` training)
- `Claude-User` — live user-initiated
- `PerplexityBot` — Perplexity
- `Googlebot` — general search index (prerequisite for Google AI surfaces)
- `Bingbot` — Microsoft, including AI Performance and Copilot
- `Google-Extended` — Gemini training (verify current scope quarterly; semantics changed once in 2024–2025)

`GPTBot` and `ClaudeBot` (training crawlers) remain allowed but are not citation-critical.

Adds to Article IX as a constitutional rule.

**Reasoning:** Cost is zero. Risk of not doing it is unbounded — implicit allows or stale bot strings can drop the site from ChatGPT citations entirely per OpenAI's own documentation. The Cloudflare Q1 2026 crawl-to-refer ratios (~1,276:1 GPTBot, ~23,951:1 ClaudeBot, ~5:1 Google) mean even small absolute citation losses compound on already-thin live-discovery traffic.

**Implementation:**
1. Update robots.txt with explicit `User-agent: <bot>` / `Allow: /` directives for the 8 bots above
2. Build-time validator: confirm robots.txt contains all 8 User-agent declarations; fail build on absence
3. Document in current-infrastructure-v2.md Article IX as a constitutional rule (replaces/extends current item 7)
4. Per-city replicas inherit the same robots.txt template; only the `Sitemap:` directive URL differs per domain
5. Quarterly verification of `Google-Extended` semantics in current Google documentation

**Validation:** Pre-deployment — robots.txt validator confirms all 8 User-agents present. Post-deployment — Bing Webmaster Tools confirms crawl access; Netlify Observability shows continued crawl traffic from each bot category.

**Replicability:** Universal. The robots.txt template is identical across all city replicas; only `Sitemap:` URL is config-driven.

**Status:** Decided — Sprint 1 (smallest, ship first)

---

## 2026-04-28 — Interface Stack: Build HTML+JSON-LD Foundation; Defer MCP and NLWeb

**Context:** Round 7 research (Prompt 2, April 2026) evaluated seven candidate agent-readable interfaces for the discovery-layer position: HTML+JSON-LD baseline, /api/events.json DataFeed, MCP server, NLWeb endpoint, agents.json, structured sitemap extensions, and well-known manifests. Prompts 1 and 2 produced a partial disagreement on MCP — Prompt 1 recommended ship as "highest-leverage future-proof investment"; Prompt 2 recommended defer behind named triggers because no consumer AI engine autonomously discovers MCP from arbitrary domains as of April 2026 (every documented integration runs through user installation, admin configuration, or vendor-curated directories). Cloudflare Q1 2026: 89.4% of AI crawler traffic is training, ~8% search-index, only ~2.2% live agent fetch.

**Decision:** Build the foundation now. Defer MCP and NLWeb behind named triggers. Skip dormant or single-vendor formats.

**BUILD NOW (Sprint 1–2):**
1. HTML + Schema.org JSON-LD hardened — full Event + Place (PostalAddress + GeoCoordinates) + Offer + Organizer + Performer with `sameAs` (per "Canonical Entity Graph" below) and full offers spec (per "Schema.org Offers Implementation Spec" below)
2. robots.txt AI bot allowlist (per separate decision above)
3. sitemap.xml with accurate `<lastmod>` per event (already content-hash-driven)
4. `/api/events.json` as Schema.org `DataFeed` of Event items, refreshed per content-hash rebuild, referenced from sitemap and `<link rel="alternate" type="application/ld+json">` on the homepage
5. ARIA + semantic HTML audit on event detail and hub templates (OpenAI's Atlas launch post, Oct 2025, explicitly recommends ARIA for ChatGPT agent navigation — only direct frontier-model guidance on site markup for agents)
6. Token `/llms.txt` (curated link map) — already shipped; do not invest further

**DEFER (with named triggers):**

MCP server defer triggers (any one flips to build):
- Anthropic, OpenAI, or Google publicly commits in product documentation to probing `/.well-known/mcp/server-card.json` or equivalent on arbitrary domains during consumer answer/search (not enterprise platforms, not agent runtimes)
- SEP-1649 or SEP-1960 merges into stable MCP spec AND at least one of the five major consumer AI products ships the probe
- ChatGPT Apps SDK opens public directory submission with meaningful discovery traffic (build is for directory submission, not open-web hosting)
- Independent measurement (Cloudflare Radar, Ahrefs, Profound) publishes data showing MCP-exposing content sites get citation lift
- **Threat A materialization** — aggregate Threat A index ≥ 4.0/8 across the three Greek primary ticketers (per "Threat A Baseline + Quarterly Tripwire Monitoring" below) — gives agents a structured query interface that ticketers can't replicate without protocol-level effort

NLWeb defer triggers (any one flips to build):
- Microsoft Build 2026 (June 2–3, 2026) announces consumer Copilot autonomously consuming third-party NLWeb endpoints
- Eventbrite or another launch partner publishes engineering metrics showing AI-agent traffic or citation lift attributable to NLWeb
- A non-Microsoft AI engine commits in product documentation to NLWeb consumption
- Spec-level discovery convention lands in `microsoft/NLWeb` or `nlweb-ai/NLWeb` AND at least one engine commits

**SKIP:**
- agents.json (Wildcard) — project dormant, vendor pivoted to AEO consulting
- `/.well-known/ai-agent.json` (Aiia) — single-vendor, no engine adoption
- A2A `/.well-known/agent-card.json` — for agent-to-agent, not content sites
- `llms-full.txt` — bytes that cost CDN egress for no documented benefit
- Competing well-known MCP variants (`/.well-known/mcp.json`, `/mcp-server`, `/mcp-servers`) — adopting one of three drafts increases not decreases fragmentation surface

**Reasoning:** Reconciles Prompts 1 and 2 with a forward-compatibility hedge. `/api/events.json` as a Schema.org DataFeed builds the data layer that an MCP server would consume — when triggers fire, the build is short (1–2 weeks per Prompt 2 estimate). Net: zero-regret today, fast catch-up tomorrow. The Cloudflare data (2.2% live agent fetch) means most agent-relevant value today is in training data and RAG retrieval, which compounds through HTML+JSON-LD presence over months. The aiXiv n=1,006 study (citation outcomes dominated by ranking position 43% at #1 vs 5% at #7, plus content-level signals) and the absence of any measured "stacking bonus" for multiple agent-readable interfaces support quality-over-quantity.

**Implementation:**
1. Sprint 1: robots.txt allowlist, HTML+JSON-LD hardening, sitemap.xml lastmod accuracy, offers required-field validator
2. Sprint 2: `/api/events.json` DataFeed build step, ARIA audit, Place schema with sameAs
3. Sprint 3+: Multi-merchant logic, entity reconciliation
4. Quarterly trigger review: June (post-Build 2026), September, December 2026

**Validation:** Pre-deployment — schema validators pass, build pipeline succeeds, sample events validated via Schema.org validator and Google Rich Results Test. Post-deployment — Bing Webmaster Tools AI Performance citation trend, Netlify Observability bot traffic, GA4 AI referral channel. 6-month — re-evaluate trigger framework against fresh evidence.

**Replicability:** Fully replicable. All interface decisions are universal (parameterized by city config). Wikidata QIDs (Athens Q1524, Barcelona Q1492, Berlin Q64) live in per-city config per "Canonical Entity Graph" below.

**Status:** Decided — Sprint 1 (foundation), Sprint 2 (DataFeed + ARIA), MCP/NLWeb deferred with quarterly review

---

## 2026-04-28 — Canonical Entity Graph with sameAs + Wikidata Cross-References

**Context:** Round 7 research (Prompt 1) Move 5 identified entity-graph density as the deepest moat against Threat B (Google AI Mode pulling Athens cultural events entirely from Maps + Knowledge Graph + venue Schema.org, bypassing third-party sources). Threat B is rated 90%+ in major US/UK markets, 30–40% for Athens today — the only "very high — existential" threat in the matrix. Pattern evidence: non-merchant discovery layers that retained citation share in the AI era did so by becoming canonical structured-entity sources (G2 for SaaS, Wikipedia for facts, Bandsintown as the API behind merchant surfaces). Curatorial layers replicable by Reddit lost share. Yoast schema framework guidance is explicit: cross-page `@id` resolution is unreliable ("Google can't extract structured data from other pages"), so seller Organization must be materialized inline once per page even though canonical Organization page exists elsewhere.

**Decision:** Every event, venue, performer, and organizer page emits structured Schema.org markup with stable canonical `@id` URI and `sameAs` references to authoritative external entities: Wikidata QID (where exists), Google Maps Place ID (where exists), official entity website, MusicBrainz ID for performers (where applicable), and merchant product ID for ticketed events. Bilingual coverage with `inLanguage` and explicit `addressCountry: GR` for disambiguation (per "Greek Disambiguation Strategy" below).

**Venue-as-merchant pattern:** When the venue is itself the merchant of record (Megaron selling its own show through webtics.megaron.gr; Onassis through tickets.onassis.org), the entity uses dual typing `@type: ["Place", "Organization"]` so a single canonical entity serves both `location` and `offers.seller` references — no Organization duplication. To be A/B tested in Sprint 4 against the alternative pattern of separate `Place` and `Organization` entities linked via `sameAs`.

**Reasoning:** Becomes part of the entity-resolution infrastructure rather than another listings page. When Google AI Mode pulls from Maps + Knowledge Graph, agent-athens still routes through as the canonical source because the entity graph references make us the authoritative resolver. This is the architectural counter to Threat B and the most replicable structural choice — Schema.org `sameAs` is universal, Wikidata is universal, Google Maps Place IDs are universal.

**Implementation:**
1. Per-venue page emits Place schema with sameAs array: Wikidata QID, Google Maps Place ID, venue official URL
2. Per-performer page (when implemented) emits Person/PerformingGroup schema with sameAs: Wikidata QID, official URL, MusicBrainz ID where applicable
3. Per-organizer entity emits Organization schema with sameAs: Wikidata QID, official URL
4. Per-event page references the Place, Performer, Organizer canonical entities via `@id`. Each JSON-LD `@graph` document materializes the seller Organization inline (per Yoast guidance), with `@id` pointing to the canonical agent-athens URL. Cross-page `@id` resolution is unreliable; same-page graph references are required for AI extraction.
5. Stable canonical URLs per entity (e.g., `/venue/onassis-stegi/`, `/venue/half-note-jazz-club/`, `/organization/more-com/`) — never change once published
6. Daily build step queries Wikidata for entity reconciliation; flags entities missing Wikidata QIDs for editorial enrichment (Editorial Director / Enrichment Writer brief)
7. Bilingual: `inLanguage` per page version; `addressCountry: GR` on all Place schemas
8. Sprint 4 A/B test: dual-type `["Place", "Organization"]` vs. separate-entity-with-`sameAs` for venue-as-merchant cases (Megaron, Onassis, Half Note when self-merchanting)

**Validation:**
- Build-time validator: every Place must have Wikidata QID OR Google Maps Place ID OR official URL (minimum one, target three)
- Build-time validator: every `offers.seller.@id` must resolve to an Organization (or dual-type Place/Organization) materialized in the same page's `@graph` envelope. Orphan seller refs fail build.
- Post-deployment: Schema.org validator + Google Rich Results Test on sample entities
- 3-month: monitor Bing AI Performance for citation lift on entity-rich pages vs sparse-entity pages
- **6-month Threat B counter-test:** probe Google AI Mode for Athens venue queries — is agent-athens cited as authoritative source for venue facts? This is the explicit measurable test of Move 5 working as the architectural counter to the existential threat.

**Replicability:** SPEC universal. Per-city DATA differs: Wikidata QIDs per city (Q1524 Athens, Q1492 Barcelona, Q64 Berlin), per-city venue/performer corpus, per-city merchant product ID schemes. Build step that reconciles to Wikidata is universal; entities reconciled differ per city.

**Connects to:** "Strategic Position" (above), "Greek Disambiguation Strategy" (below), "Schema.org Offers Implementation Spec" (below).

**Status:** Decided — Sprint 2 (Place schema with sameAs), Sprint 3 (Performer/Organizer schema, multi-merchant seller refs), Sprint 4 (build-time Wikidata reconciliation step + dual-type A/B test)

---

## 2026-04-28 — Greek Disambiguation Strategy: addressCountry GR + Multi-Layer Patterns

**Context:** Round 7 research (Prompt 1, April 2026) confirmed the Athens, GA / Athens, TN disambiguation problem is severe — 30–50% of top results for "things to do this weekend" and "concerts April 2026" returned wrong-city content (visitathensga.com, allevents.in, athens-theater.com Florida, Flagpole.com). Disambiguation is a structural moat for any source with explicit country signals across multiple layers.

**Decision:** Implement explicit disambiguation across schema, content, URLs, metadata, and entity graph:
1. Schema.org Place schema: `addressCountry: "GR"` (ISO code, never literal "Greece") mandatory on every Place entity
2. Schema.org Event schema: `location` with full PostalAddress including `addressCountry: "GR"`
3. Schema.org Offer schema: `eligibleRegion: {"@type": "Country", "name": "GR"}` recommended belt-and-braces (small payload cost; helps agents that extract Offers without parent context). `areaServed` is redundant with `eligibleRegion` for events tied to a single venue — pick `eligibleRegion` and stay consistent.
4. Page meta description and title: "Athens, Greece" or "Athens (Greece)" — never bare "Athens" on English pages
5. Hreflang and `inLanguage`: `el-GR` primary, `en-GR` (or `en`) secondary, never just `el` or `en`
6. URL structure: domain-level disambiguation (agent-athens.com is already disambiguating by domain choice — preserve this; do not introduce paths that obscure)
7. Internal copy patterns: opportunistic "Athens, Greece" mentions in early page content (within first 100 words, per existing internal-linking spec)
8. Wikidata `sameAs` to Q1524 (Athens, Greece) on every Place referenced — coordinated with "Canonical Entity Graph" decision

**Reasoning:** Search indices struggle with Athens disambiguation; AI engines route discovery through search indices. Single-layer disambiguation (e.g., title only) is insufficient — explicit signals across all layers (schema, copy, metadata, entity graph) collectively train engines that this domain is canonically about Athens, Greece. Multi-layer redundancy is what wins. The 30–50% wrong-city contamination measured in current top-10 results means there is real competitive ground to capture by being unambiguously the Greek-Athens source.

**Implementation:**
1. Build-time validator: every Place schema must have `addressCountry: "GR"`; every Event location must have full PostalAddress with country; every Offer should have `eligibleRegion: GR` (warn-not-fail)
2. Template update: page titles and meta descriptions follow "Athens, Greece" formula (Editorial Director brief)
3. Content guidelines: "Athens, Greece" mention rule for first-100-words on hub pages (Editorial Director + Enrichment Writer brief)
4. Wikidata reconciliation: Q1524 referenced on every Place page (per "Canonical Entity Graph" decision)
5. Hreflang audit: confirm `el-GR` and `en-GR` (or `en`) tags, never bare language codes

**Validation:**
- Pre-deployment: validator confirms `addressCountry: "GR"` on all Place schemas (fail build on absence)
- 3-month: probe queries "things to do in Athens this weekend" and "concerts in Athens" — measure % wrong-city contamination in top 10 results that include agent-athens
- 6-month: Bing Webmaster Tools query analysis — confirm queries surfacing agent-athens are Greek-Athens, not Georgia-Athens

**Replicability:** SPEC universal: "explicit country disambiguation across schema/content/metadata/links/entity graph" is generic. DATA per-city: country code value (GR/ES/DE), Wikidata QID (Q1524/Q1492/Q64), language code (el/es/de), specific patterns (Barcelona, Spain vs Barcelona, Venezuela; Berlin has less acute disambiguation but still applies the rule).

**Connects to:** "Canonical Entity Graph" (above) — Wikidata Q1524 sameAs is shared. "Schema.org Offers Implementation Spec" (below) — `eligibleRegion` lives in Offers per this decision.

**Status:** Decided — Sprint 1 (validator + schema), Sprint 2 (content guidelines via Editorial Director), Sprint 3 (Wikidata reconciliation)

---

## 2026-04-28 — Updated Competitor Intelligence + Differentiation Claim

**Context:** Round 7 research tested 9 queries (5 English, 4 Greek) on April 28, 2026 and produced a sharply different competitive map than the project's prior assumptions, plus a 27+ event-page audit (Prompt 3) of competitor handoff quality. Three findings invalidate parts of the existing competitor list, and the audit produced a defensible four-way intersection differentiation claim.

**Findings updating prior baseline:**
- **Time Out Athens has effectively withdrawn** from active dated-event queries; appears only as evergreen city-guide content. The previous March 2026 Competitive Baseline assumption (Time Out present) is outdated.
- **insightsgreece.com is the active English weekend-listicle winner** — replaced WhyAthens (which stopped publishing events Feb 2025). Publishes weekly "Fun Things to do in Athens This Weekend: April X-Y, 2026" pages with date-specific URLs. Encodes ticket vendors as **unhyperlinked plaintext** in WordPress listicles — the editorial richness is real but the structured data is absent.
- **Municipal cluster** (opanda.gr, cityofathens.gr, athens-technopolis.gr, cultureisathens.gr, athensjazz.gr) operates as a coordinated, heavily-interlinked official index occupying ~30% of citable set on Greek queries.
- **artandlife.gr** confirmed as Greek dark horse winning both "all events" Greek queries — but the audit revealed it 403-blocks AI fetchers and ships Greek-only with no demonstrably superior JSON-LD vs Athinorama. Its "Greek structured-data benchmark" reputation is overstated for AI-handoff use cases.
- **Athinorama.gr** remains dominant on Greek theatre/weekend queries (40 years of brand authority — structurally unbreachable on legacy queries). Deep-links to more.com only — single-seller; mechanical English translation at en.athinorama.gr; no external entity graph.
- **thisIsAthens.org** has high-quality editorial curation and structured Info blocks but ships **no detectable Schema.org Offers JSON-LD** and offers no Greek hreflang despite being the official Athens tourism guide.
- **Songkick & Bandsintown** JS-render schema (Songkick's pages literally warn "enable javascript"; Bandsintown returns 403 to default fetchers); offer one affiliate ticket partner per event; no Greek-language variant.
- **Eventbrite Greece** schema-rich (6.5/8 in Threat A audit) but covers shallow Athens cultural catalogue (pub crawls, conferences, food tours, yoga retreats) — not the venues agent-athens covers.
- **Resident Advisor** Wikidata QID confirmed (Q1969451). Genre-locked to electronic music (~13 upcoming Athens events on audit day). Vertical Threat A, not horizontal.
- **Tripadvisor** misclassifies Athens attractions as events and routes ticket CTAs to unrelated Viator guided tours.

**Decision:** Update competitor monitoring list. Replace outdated assumptions in geo-strategy-context.md and current-infrastructure-v2.md Competitive Baseline section with current data. Adjust strategic moves accordingly. Adopt the explicit competitive differentiation claim grounded in the Prompt 3 audit:

> **agent-athens is the only Athens cultural-events surface that simultaneously delivers (1) server-rendered Schema.org Event + Offer JSON-LD with seller-as-Organization `@id` graph references, (2) multi-merchant `offers[]` array federation per event with deterministic non-curated ordering, (3) native bilingual EN+EL coverage with hreflang and curated (not auto-translated) English, and (4) explicit external entity-graph linkage via Wikidata QIDs, Google Maps Place IDs, and MusicBrainz IDs.**

The four-way intersection is empty across the audited field of 11+ competitors × 3 events each. **Templating-vs-curation variance is uniformly low** — every competitor runs a single CMS template across flagship/mid-tier/niche events. agent-athens can match the editorial richness of insightsgreece.com (curated copy) AND the entity-graph rigor of Songkick AND the Schema.org completeness that no one currently delivers — a strict superset, not a weighted trade-off.

**Reasoning:** Working from outdated competitor maps causes wasted effort. Each competitor profile implies a different strategic posture:
- insightsgreece.com → contestable; ship consistent date-stamped weekend content for ~6 months to build cadence parity, structured-data superiority is automatic
- Municipal cluster → partner network (aggregate from + link to, do not compete head-on)
- Athinorama.gr → unbreachable on Greek theatre, contestable on English content (no English version yet)
- artandlife.gr → former benchmark, now downgraded by access barriers; not a moat threat
- Resident Advisor → not a target unless agent-athens enters electronic vertical
- Time Out Athens → de-prioritize from monitoring; revive only if they re-enter dated-event publishing

**Implementation:**
1. Update geo-strategy-context.md Competitive Landscape section with current map (replace outdated entries; add new findings + four-way intersection claim)
2. Update current-infrastructure-v2.md Competitive Baseline section (replaces March 2026 baseline)
3. Quarterly competitive query probe (July, October, January, April) repeating the 9-query set from Prompt 1
4. Specific monitoring signals: insightsgreece.com weekend post cadence; Athinorama.gr English version (if launched); municipal cluster cross-linking changes; artandlife.gr Schema.org additions
5. English content strategy adjustment: contest insightsgreece.com directly with weekly date-stamped weekend pages (Editorial Director brief)
6. Greek strategy adjustment: aggregate from + link to municipal cluster; do not attempt head-on against Athinorama on theatre

**Validation:** Quarterly query probe results logged. If agent-athens appears in top-10 for any of the 9-query set within 6 months, the competitive strategy is working. If not at 12 months, re-evaluate moves.

**Replicability:** SPEC universal — "monitor active competitors quarterly via fixed query set, classify each by strategic posture (contestable / partner / unbreachable / benchmark / niche / withdrawn)." DATA per-city — specific competitor names. agent-barcelona will identify its own active English/Spanish weekend-listicle winner, municipal cluster, dark horse aggregator. Same monitoring methodology, different competitor list.

**Status:** Decided — quarterly cadence starts July 2026; next probe scheduled 2026-07-28

---

## 2026-04-28 — Schema.org Offers Implementation Spec (Required Fields, Multi-Merchant, Open Events)

**Context:** Round 7 Prompt 3 produced a complete spec for the discovery → commerce handoff. The handoff is the seam where agent-athens transfers a user (or an AI agent) from discovery (us) to checkout (merchant). It happens in two contexts: (A) answer-engine citation → user reads our event page in browser → clicks our outbound `offers.url` to merchant; (B) agentic task execution → AI agent reads our structured data → follows `offers.url` to merchant → potentially invokes merchant's ACP/UCP commerce protocol there. In both contexts, handoff quality determines whether AI agents prefer agent-athens for next time. A bad handoff trains agents away; a great handoff trains them toward.

**Decision:** Adopt the following Schema.org Offers implementation spec, enforced by build-time validator. Spec is city-agnostic; per-merchant URL patterns live in city config.

### Required fields (every with-ticket event Offer)

Build validator MUST fail the build if any are absent on a paid event:

| Property | Notes |
|---|---|
| `@type: "Offer"` | Type discrimination from `AggregateOffer` |
| `url` | Public, crawlable, single-event ticket-purchase URL (Google Event docs explicit requirement) |
| `price` | Without `price`, falls into 18-point penalty zone (Growth Marshal Feb 2026, n=730) |
| `priceCurrency` | ISO 4217; Google requirement |
| `availability` | One of `https://schema.org/InStock` \| `SoldOut` \| `PreOrder` (Google accepts only these three for events) |
| `validFrom` | When tickets go on sale; required by Google for date-restricted offers |
| `seller` | MUST be `{"@id": "..."}` reference to Organization (or dual-type Place/Organization for venue-as-merchant) materialized inline in same page's `@graph` |

### Recommended fields (warnings on absence)

| Scenario | Add | Rationale |
|---|---|---|
| Tiered pricing | `priceSpecification` array of `UnitPriceSpecification` with `name` + `price` + `priceCurrency` | Megaron's "€6/€8/€12/€15/€18/€22/€25" canonical use case |
| Sales window known | `validThrough` (ISO 8601 with timezone offset) | Tier-C agents need expiry; Tier-A training benefits from validity bracketing |
| All events | `eligibleRegion: {"@type": "Country", "name": "GR"}` | Belt-and-braces disambiguation per "Greek Disambiguation Strategy" |
| Per-merchant booking lead time | `advanceBookingRequirement: {"@type": "QuantitativeValue", "minValue": N, "unitCode": "HUR"}` | Distinguishes "tickets at door" from "registration closes 24h prior" |

### Deepest-link policy

`offers.url` resolves to the deepest URL that is (a) accessible without authentication, (b) free of session/transient query parameters, and (c) stable for ≥6 months. If two URLs both qualify, prefer the one with a numeric persistent ID. If deeper levels (date picker, seat picker, checkout) require cookies/session, **stop at event-detail** — never construct synthetic deeper URLs. Strip universally: `utm_*`, `fbclid`, `gclid`, `_ga`, `mc_cid`, `mc_eid`, `igshid`, `ref=`, `source=`, `eb_*`. Keep functional locale parameters (`?lang=en` is locale, not session). Strip all fragments. Match merchant's own canonical trailing-slash convention.

**Tier resolution:** This rule optimizes Tier A (89.4% bot traffic, training stability) and Tier B (8%, citation freshness via stable URL plus accurate `dateModified`), at a 1–2-click cost to Tier C (2.2%, live agent fetch). Tier C agents (OpenAI Operator, Claude computer-use, Bright Data ticket-hunter) re-render the merchant page anyway and re-discover the buy button per their published reference architectures. **Stability protects 97.4% of bot traffic at no measurable cost to the 2.2%.**

### Multi-merchant policy

Flat `offers` array. Each Offer has its own `seller`, `url`, `price`, `priceCurrency`, `availability`. Reserve `AggregateOffer` only for ≥3 merchants AND material price variance (>10% spread) AND desire for `lowPrice`/`highPrice`/`offerCount` summary surfacing. Use Sprint 4 A/B test on 2–4 multi-merchant events to validate flat-array vs `AggregateOffer` rich-results behavior before standardizing.

**Defer-to-merchant ordering:** Sort `offers[]` by `seller.@id` Unicode codepoint ascending. Deterministic (Tier-A stable), reproducible (Tier-B auditable), unbiased qualitatively (no ranking by price/recency/preferred-merchant), documentable in `/about/methodology`. **Sprint 3 pilot:** evaluate `seller.@id` codepoint sort vs. event-id-seeded hashed ordering — alphabetical sort accidentally creates structural bias for merchants whose slugs start early in the alphabet, compounding over thousands of events. Hashed ordering removes that bias while remaining deterministic. Decide at end of Sprint 3 based on citation stability data.

**Price differential representation:** Each Offer carries face value charged by that merchant (Viva.gr's €27 includes service fee → represent €27, not €25-plus-fee). agent-athens does not normalize prices.

### Open events policy

Hybrid: every open event emits BOTH `isAccessibleForFree: true` AND an `Offer` with `price: "0"` plus `priceCurrency: "EUR"`. The boolean carries semantic "free badge" eligibility for Google rich results; the Offer carries the actionable URL.

**Project terminology mapping:** internal label `open` → `isAccessibleForFree: true` in JSON-LD. Internal label `with-ticket` → absence (or explicit `false`) of `isAccessibleForFree` plus non-zero-price Offer.

**Pure informational open events** (no registration, no ticketing — e.g., free outdoor concert at Filopappou Hill): set `offers.url` to the venue's official information page. If no venue information page exists, omit `offers` entirely and rely on `isAccessibleForFree`. **Never** point `offers.url` at agent-athens's own canonical event page (self-referential offers fail Google Rich Results validation and confuse agents).

**Open-with-registration variant** (Onassis public talks, SNFCC concerts, museum free evenings): `isAccessibleForFree: true` + `Offer` with `price: "0"` + `validFrom` (registration-opens timestamp) + `advanceBookingRequirement` (formal "must register" signal). Never use `availability: PreOrder` for free registration.

### Validation rules (extends 18-point penalty validator from Round 7 March)

**FAIL (block build):**
- Any with-ticket event missing `url`, `price`, `priceCurrency`, `availability`, `validFrom`, or `seller`
- Any `seller` not an `@id` reference to Organization (or dual-type Place/Organization) in the same `@graph` envelope
- Any `seller.@id` not resolving to a marked-up entity on agent-athens (orphan seller validation)
- Any `price` on a with-ticket event equal to 0
- Any `isAccessibleForFree: true` event with non-zero `price`
- Any Place schema missing `addressCountry: "GR"` (per "Greek Disambiguation Strategy")
- Any `offers.url` pointing to agent-athens canonical event page (self-referential)

**WARN (log, do not block):**
- Missing `priceSpecification` on tiered-pricing events
- Missing `validThrough`
- Missing `eligibleRegion`
- Missing `advanceBookingRequirement` on registration-required open events
- `offers.url` returning HTTP 3xx redirect chain >1 hop on validation crawl
- `offers.url` returning HTTP 4xx/5xx on validation crawl

**Operational health flag:** track per-merchant `offers.url` depth degradation over time. If a merchant's URL pattern regresses (e.g., Gazarte starts returning slug-suffixed `-2`/`-3` variants when a show is repeated), emit a warn at build and a quarterly summary in the Threat A re-probe report.

### Sprint mapping

| Sprint | Scope |
|---|---|
| Sprint 1 | Validator extension: required-field checks, currency check, ISO-8601 date check, `seller.@id` orphan check, addressCountry check |
| Sprint 2 | DataFeed integration: `/api/events.json` emits Schema.org DataFeed with full Offer arrays per event; `dateModified` matched to content-hash |
| Sprint 3 | Multi-merchant logic: per-event merchant resolution from data layer; flat-array emission with deterministic seller-@id ordering; AggregateOffer threshold logic; ordering-pilot evaluation |
| Sprint 4 | Entity reconciliation hooks; Wikidata QID provisioning; venue-as-merchant dual-type A/B test; AggregateOffer Rich Results A/B test |

**Reasoning:** Spec resolves the multi-merchant federation question (flat array preferred for events; `AggregateOffer` is product-centric per Schema.org docs and Google's Event examples model `offers` as flat arrays). Codepoint-ordered defer-to-merchant addresses the Move 4 constraint of not curating. Hybrid open-events policy resolves the URL-carrying need. Required-field set hardens the existing 18-point penalty validator with offers-specific checks. Three claims marked INFERRED rather than DOCUMENTED are flagged for Sprint 4 A/B testing.

**Implementation:** Per Sprint 1–4 mapping above; flagged INFERRED claims (offers-specific 18-point penalty extension; flat-array citation preference for events; codepoint-sort citation neutrality) re-validated post-Sprint-3 deployment via Bing AI Performance citation tracking on multi-merchant events.

**Validation:** Build-time validator catches all FAIL conditions. Schema.org validator + Google Rich Results Test pass on sample events. 3-month: citation rate on with-ticket events with full offers spec vs partial baseline. 6-month: Sprint 4 A/B test results inform standardization choice.

**Replicability:** SPEC universal. DATA per-city: per-merchant URL patterns, currency code (EUR for Athens; EUR for Barcelona; EUR for Berlin in this case but config-driven so any other city works), country code value (GR/ES/DE).

**Connects to:** "Canonical Entity Graph" (above) — `seller.@id` references entity graph. "Greek Disambiguation Strategy" (above) — `eligibleRegion` per this decision. "Threat A Baseline" (below) — operational health flag connects to quarterly probe.

**Status:** Decided — Sprint 1 (validator), Sprint 2 (DataFeed), Sprint 3 (multi-merchant + ordering pilot), Sprint 4 (Wikidata + A/B tests)

---

## 2026-04-28 — Threat A Baseline + Quarterly Tripwire Monitoring

**Context:** Round 7 Prompt 3 audited 12 platforms (3 Greek primary ticketers + Eventbrite GR + Resident Advisor + 7 Athens venues) on April 28, 2026 against 8 criteria measuring Schema.org Event JSON-LD presence, property completeness, Place country code, Offers schema, English content, sitemap, AI bot policy, and Google Rich Results validity. Threat A — defined as Greek primary ticketers shipping rich Schema.org Event + English content + clean lastmod, rated 60–75% probability on 12–24 month horizon — needs an explicit baseline to detect materialization in time for repositioning.

**Decision:** Adopt the following baseline and quarterly tripwire monitoring framework.

### Aggregate baseline (2026-04-28)

- **Aggregate Threat A index across 12 platforms: ≈ 2.4 / 8 (30%)** — well below materialization threshold
- **Greek-primary index (more.com + Viva.gr + TicketServices.gr only): ≈ 1.5 / 8 (19%)** — strong window
- **Trigger threshold from "monitor" to "active mitigation required":** Greek-primary aggregate index ≥ 4.0/8 (i.e., trio's mean rises from ~1.5 to ~4.0)

### Per-platform 2026-04-28 baseline

| Platform | Score /8 | Status |
|---|---|---|
| Eventbrite GR | 6.5 | Globally schema-rich; shallow Athens cultural catalogue; vertical Threat A on pub crawls/yoga/conferences |
| Resident Advisor | 5.25 | Genre-locked to electronic; vertical Threat A only |
| Pallas Theater | ~4.75 | Closest venue to direct materialization (Tribe Events + bilingual + structured detail) |
| Half Note | ~3.25 | Tribe baseline; monolingual Greek bodies under English chrome |
| Megaron | ~2.5 | Yoast generic only; rich content, machine-thin schema |
| Onassis Stegi | ~1+UM | JS-only rendering; markdown extraction empty body |
| TicketServices.gr | ~1.6 | Likely no JSON-LD; legacy CMS UTF-8 encoding artefacts |
| more.com | ~1.5 | JS-likely-hydrated; PM via search snippets |
| Viva.gr | ~1.5 | Shared CMS with more.com; same hydration pattern |
| SNFCC | ~1+UM | Site-side WAF blocks non-browser user-agents (403) |
| Gazarte | ~1.25 | Plain HTML text; no JSON-LD detected |
| Christmas Theater (ct.gr) | ~0.35 | Lowest score; legacy domain hijacked (separate decision below) |

### Tier-A tripwires (any one crossed = Threat A escalates one severity level)

1. more.com adds `<script type="application/ld+json">` Event blocks to event detail pages, server-rendered, verifiable via `curl -A "GPTBot/1.0"` view-source
2. Viva.gr ships Schema.org Event with `location.address.addressCountry: "GR"` on `/tickets/en/...` paths
3. TicketServices.gr migrates off legacy CMS (loss of `?????` UTF-8 artefacts in extracted HTML)
4. Any of the three Greek primary ticketers announces partnership with Stripe ACP, Google UCP, OpenAI Apps SDK, or Anthropic Claude commerce APIs (public announcements only)
5. Any of the three Greek primary ticketers publishes hreflang `<link rel="alternate" hreflang="...">` declarations for `el` ↔ `en` pairs in `<head>`
6. Onassis Stegi ships server-side-rendered JSON-LD on `/whats-on/{slug}` pages
7. SNFCC stops 403-blocking non-browser user-agents at the WAF

### Tier-B tripwires (multiple crossed = trend confirmation)

1. Resident Advisor adds `sameAs` to Wikidata QIDs for Athens venues (Plex, Romantso, Six D.O.G.S, SMUT, Astron, Diego, Plissken, Release Athens)
2. RA's robots.txt explicitly allows `OAI-SearchBot`, `Claude-SearchBot`, `PerplexityBot`, `Google-Extended` (separate from `GPTBot` training crawl)
3. Eventbrite's GR vertical begins listing primary cultural events from SNFCC, Onassis, Greek National Opera, Megaron
4. more.com or Viva.gr publishes a public sitemap index for `gr-en` events with valid `<lastmod>` per URL
5. Greek Ministry of Culture or SETE issues structured-data guidance to ticketers
6. Megaron adds explicit Event JSON-LD with `priceSpecification` array for tier pricing
7. Pallas Theater adds Wikidata `sameAs` and `performer` as `Person`/`MusicGroup` entities
8. Christmas Theater removes SEO-spam footer injections and regains control of `christmastheater.gr`

### Tier-C tripwires (signals of broader market shift)

1. SNFCC, Onassis, or Megaron starts emitting Schema.org Event on their own site
2. Google "Things to do in Athens" carousel pulls from a Greek-primary ticketer for the first time
3. Any Greek ticketer joins Schema.org `culturalRecommendations`, Artsdata.ca-style data cooperatives, or equivalent
4. Documented case study of OpenAI Operator, Claude computer-use, or Google Mariner completing a Greek-merchant ticket purchase end-to-end

### Threshold and mitigation

**Equivalent in tripwires:** any 2 Tier-A crossed in a single quarter, OR any 1 Tier-A + 3 Tier-B in same quarter.

**At threshold, mitigation means:**
1. Re-frame agent-athens from "discovery layer" to "discovery + curation + entity-graph layer" — the differentiation moves from "Greek ticketers don't ship schema" to "no source surfaces multi-merchant federation + bilingual native curation + entity-graph richness simultaneously"
2. Trigger the deferred MCP server build (per "Interface Stack" — Threat A materialization is a named MCP defer trigger)
3. Trigger NLWeb endpoint build if any Tier-A merchant adopts ACP/UCP
4. Negotiate direct merchant relationships for entity-ID provisioning — if more.com ships its own Schema.org, agent-athens's Organization page for more.com should `sameAs` directly into more.com's canonical entity (not just merchant homepage)
5. Push entity-graph richness ahead — Wikidata QID adoption, MusicBrainz IDs for performers, Google Place IDs for venues — to maintain the 4-way intersection moat even after the schema-completeness leg falls

**Re-probe cadence:** 2026-07-28, 2026-10-28, 2027-01-28, 2027-04-28. Each probe re-runs the 12-platform × 8-criterion matrix using the same URLs captured. If a URL 404s by next probe, that itself is a finding.

**Reasoning:** Without an explicit baseline, the quarterly competitive probe has nothing to measure against. With it, we can detect Threat A materializing 6+ months before it forces strategic reposition. The 8-criterion scoring matrix is universal SPEC; the platform list is Athens-specific DATA. agent-barcelona will run an analogous baseline against entradas.com / ticketmaster.es / venue direct.

**Implementation:**
1. Capture audit URLs and view-source evidence for each platform from 2026-04-28 baseline (operational artifact for repeatability)
2. Add to monitoring cadence in current-infrastructure-v2.md: quarterly Threat A re-probe scheduled
3. Calendar alerts for next probe (2026-07-28) and key external events (Microsoft Build 2026 June 2–3, OpenAI/Anthropic fall 2026 events, Stripe ACP partner announcements)
4. Document tripwire framework in current-infrastructure-v2.md as Article XII (new article)

**Validation:** First quarterly probe 2026-07-28 produces deltas vs. baseline. Any tripwire crossing logged in decisions-log addendum. If aggregate Greek-primary index moves ≥1 point in any quarter, escalate review cadence to monthly.

**Replicability:** SPEC universal — 8-criterion scoring matrix, Tier-A/B/C tripwire framework, threshold methodology. DATA per-city — specific platforms, specific URL patterns, specific tripwire events. agent-barcelona Threat A baseline will use same SPEC against different DATA.

**Connects to:** "Strategic Position" (above) — quantifies the opportunity window. "Updated Competitor Intelligence" (above) — overlaps on competitive-monitoring cadence. "Interface Stack" (above) — Threat A materialization is a named MCP defer trigger.

**Status:** Decided — baseline established 2026-04-28; first quarterly re-probe 2026-07-28

---

## 2026-04-28 — Christmas Theater Domain Hijack: Operational Constraint

**Context:** During the Threat A baseline audit (Prompt 3, 2026-04-28), the legacy `christmastheater.gr` domain was discovered to be hijacked with Indonesian gambling SEO spam injected on every page of the operating site `ct.gr`. This is a material trust signal that may already be suppressing the venue's structured-data eligibility in Google. Outside the original prompt scope but operationally consequential.

**Decision:**
1. **Validator constraint:** agent-athens MUST NOT emit `seller.@id`, `sameAs`, `url`, `outboundLink`, or any structured-data reference to `christmastheater.gr` under any circumstance. Canonical reference for the venue is `ct.gr` only.
2. **Build-time validator rule:** any reference to `christmastheater.gr` in any output (HTML, JSON-LD, sitemap, llms.txt, RSS, OG metadata) fails the build.
3. **Out-of-band notification:** Editorial Director brief includes a soft-power outreach to the Christmas Theater operator notifying them of the spam injection. This is the kind of move that builds institutional relationships in the Athens cultural-events ecosystem.
4. **Tripwire:** "Christmas Theater removes SEO-spam footer injections and regains control of `christmastheater.gr`" is logged as a Tier-B tripwire in Threat A monitoring.

**Reasoning:** Linking to a hijacked domain transmits trust-signal damage. agent-athens's discovery-layer position depends on being trusted by AI engines to point to legitimate sources. A hardcoded validator block prevents accidental reintroduction across rebuilds, deployments, and city replicas.

**Implementation:**
1. Add `christmastheater.gr` to the merchant-and-venue-URL blocklist in city config
2. Add validator rule: any output containing the string `christmastheater.gr` fails build
3. Editorial Director brief: draft out-of-band outreach to venue operator (separate workstream)
4. Quarterly tripwire check: confirm `ct.gr` remains spam-free; check `christmastheater.gr` for control restoration

**Validation:** Build-time grep for `christmastheater.gr` returns zero matches. Quarterly re-check of `ct.gr` confirms continuing operational hygiene.

**Replicability:** SPEC universal — "validator-blocked-domain list per city for hijacked or trust-compromised sources." DATA per-city — specific blocklisted domains. The pattern (validator block + tripwire) transfers; the specific domain is Athens-only.

**Connects to:** "Threat A Baseline" (above) — Tier-B tripwire #8 references this finding.

**Status:** Decided — Sprint 1 (validator block); Editorial Director outreach pending separate brief

---

## 2026-05-04 — Cancelled Events: Emit With EventCancelled + Discontinued Rather Than Filter

**Context:** S101a-A audit surfaced that `is_cancelled=1` rows (~30–50 events) are filtered at the query layer in `src/db/database.ts` and never reach emission. The `availabilityForEventStatus()` helper already supports `EventCancelled` → `Discontinued` per the 2026-04-29 schema mapping spec, so the helper is ready; only the query path is gating. Question raised: should cancelled events flow through emission with explicit status, or remain filtered?

**Decision:** Emit cancelled events whose original date has not yet passed with `eventStatus="EventCancelled"` + `offers.availability="Discontinued"`. Events whose original date has passed continue to expire under the standard 45-day lifecycle. Schedule as session S101b, separately from S101a-B.

**Reasoning:** agent-athens's discovery-layer authority includes *negative* authority — "X is not happening" is itself a citation-worthy answer. Hiding cancelled events sends absence to Tier A training crawls and to Tier C live agents, when both could have received a clean structured signal instead. The citability equation (structured data × freshness) is strictly improved by treating cancellation as a signal rather than a deletion. Google's rich-results guidance reinforces this. Filtering at the query layer was a pre-helper artifact; now that the mapper is ready, the architectural reason for filtering is gone.

**Implementation:**
1. Query layer (`src/db/database.ts`): emit cancelled events whose original `event_date` has not yet passed; keep filtering for past-date cancelled events (handled by 45-day lifecycle elsewhere)
2. Helper branch already wired (`EventCancelled` → `Discontinued`) — no helper change needed
3. UI: minimal "cancelled" badge on event cards and detail pages — not a redesign opportunity
4. Validator: add `eventStatus="EventCancelled"` ↔ `offers.availability="Discontinued"` parity rule, applied to both JSON-LD and microdata surfaces (per S101a-B microdata-validator coverage)

**Validation:** Post-deployment, confirm cancelled events appear in sitemap and in hub pages with the badge. Verify Schema.org Validator and Google Rich Results Test parse `EventCancelled` + `Discontinued` correctly. Track AI-engine handling: queries like "is X cancelled" or "is X still happening" should cite the agent-athens page rather than returning silence.

**Replicability:** Fully replicable. SPEC universal — query-layer emission of structurally-flagged cancelled events; UI badge; validator parity. DATA per-city — none; cancellation handling is a city-agnostic concern. Barcelona/Berlin inherit the same pattern.

**Connects to:** S101a-B microdata-validator coverage (this decision relies on the validator covering both surfaces). 2026-04-29 `availabilityForEventStatus()` schema mapping spec (already implemented helper).

**Status:** Decided — scheduled as S101b after S101a-B closes

---

## 2026-05-04 — Postponement Infrastructure: Helper Branches Intentionally Dormant

**Context:** S101a-A audit surfaced that `availabilityForEventStatus()` supports `EventPostponed` and `EventRescheduled` mappings, but no database column feeds them and no scraper signal extracts postponement. Two readings of the gap: (a) intentional symmetry with the 2026-04-29 spec, branches dormant for future expansion; (b) planned capability requiring a `postponement_status` column plus scraper work, scopable as S101b. Decision needed before scrapers begin emitting postponement signals ad-hoc.

**Decision:** Reading (a). Postponement branches in the helper are intentionally dormant. Do not add a database column. Do not add scraper extraction logic. Do not scope an S101 follow-on. Reactivation trigger is direct venue feed signal (e.g., a venue partner publishing `eventStatus` directly through API or RSS); only at that point do we add the column and the parity rule.

**Reasoning:** Three reasons. (1) Reliable postponement detection from public scrapers is genuinely hard — banner parsing, date-diff comparison against historical scrapes, and announcement-page heuristics are all noisy at the recall and precision levels needed. (2) False-positive postponement signals are strictly worse than silence: broadcasting to AI training crawls and live agents that an event is postponed when it isn't damages authority faster than not signaling at all. The asymmetry favors silence. (3) Helper having dormant branches is good engineering, not technical debt — the schema mapper is complete and correct; when reliable signal becomes available, plumbing is one column plus an already-ready mapper, not a redesign.

**Implementation:**
1. No code changes
2. Document dormancy explicitly in `availabilityForEventStatus()` source comment so a future Planner does not read the unused branches as a TODO
3. Add postponement to a "deliberately deferred" register inside `current-infrastructure-v2.md` (or equivalent) listing reactivation triggers
4. Reactivation trigger: a venue partner publishes structured postponement signal (API, RSS, or direct feed). At that point, add `postponement_status` column, scraper-side mapping, and validator parity rule

**Validation:** Quarterly review — confirm no scraper has begun emitting ad-hoc postponement signals. If a scraper does begin emitting (incident, not feature), revert and re-evaluate.

**Replicability:** Fully replicable. SPEC universal — "schema-helper branches may be intentionally dormant pending reliable signal source; document explicitly to prevent future TODO-misreads." DATA per-city — none. Pattern transfers cleanly to Barcelona/Berlin.

**Connects to:** 2026-04-29 `availabilityForEventStatus()` schema mapping spec (helper completeness rationale). Emission-validator coverage manifest decision (below) — dormant branches are a category of "covered by helper, no emission surface yet, no validator scope yet" and should appear as such in the manifest.

**Status:** Decided — dormant by design; reactivation gated on reliable-signal trigger

---

## 2026-05-04 — Tier Pricing: Emit UnitPriceSpecification[] When Multiple Price Values Available

**Context:** S101a-A audit identified `price_advance` and `price_door` REAL columns populated by Megaron and similar tier-pricing scrapers, with no current emitter producing `UnitPriceSpecification[]`. Megaron-pattern events with seven-tier pricing (€6/€8/€12/€15/€18/€22/€25) currently emit only the lowest amount via `Offer.price`, losing the tier signal. This is the latent §2 gap (c) from the audit. Question raised: address in S101a-B, scope separately, or defer to S102 multi-merchant work?

**Decision:** Emit `UnitPriceSpecification[]` inside `Offer.priceSpecification` when ≥2 distinct non-null price values are present in the database. Scope as session S101c, separately from S101a-B and separately from S102. Confirm column semantics (true advance-vs-door vs. min/max compression) before specifying the emit shape.

**Reasoning:** Emitting €6 alone when typical Megaron seats sell at €18 is genuinely misleading information flowing into Tier A training data — the citability equation (enrichment quality × structured data) is degraded by structurally accurate but materially misleading output. Even a two-point range (advance/door, or min/max) is strictly better than apparent-flat-€6.

S101c is *not* S102. Tier pricing is *within* a single merchant — `UnitPriceSpecification[]` array inside one `Offer`. S102 is multi-merchant — multiple `Offer` entries with multiple sellers. Orthogonal concerns, separable refactors. Bundling them delays a real citability win behind a much larger Sprint 2/3 piece.

Column semantics need confirmation before spec. `price_advance`/`price_door` cannot capture seven tiers fully. Either the Megaron scraper drops intermediate tiers (effectively min/max under misleading column names) or it captures actual advance-vs-door (only two of seven tiers are represented). The emit pattern differs: range with min/max descriptors vs. labeled tier-pair. Quick grep of the Megaron scraper resolves it; Planner can answer in 15 minutes.

**Implementation:**
1. Pre-spec step: Planner confirms `price_advance`/`price_door` actual semantics by inspecting the Megaron scraper extraction logic
2. Emit branch: when `price_advance IS NOT NULL` AND `price_door IS NOT NULL` AND values differ, emit `Offer.priceSpecification` as `UnitPriceSpecification[]` with semantics-appropriate descriptors (true advance/door if confirmed; generic tier-1/tier-2 with min/max framing if compressed)
3. Validator rule: `price-tier-emit-when-data-available` — fails build if both columns populated with distinct values but `priceSpecification` not emitted; applies to both JSON-LD and microdata
4. Approximately 30 LOC plus validator extension; single session

**Validation:** Schema.org Validator and Google Rich Results Test parse `UnitPriceSpecification[]` correctly. Spot-check Megaron events in production HTML and JSON-LD. Track whether AI engines surface tier ranges in answers ("tickets from €6 to €25") rather than misleading flat prices.

**Replicability:** Fully replicable. SPEC universal — emit `UnitPriceSpecification[]` whenever ≥2 distinct prices exist for a single event-merchant pair. DATA per-city — venue-pattern specifics differ; tier pricing exists at major European venues with structured ticketing (Liceu in Barcelona, Staatsoper in Berlin, etc.). Pattern transfers; per-city scrapers may populate the same columns from different upstream shapes.

**Connects to:** S102 multi-merchant emission (Sprint 2/3) — orthogonal but logically adjacent; both expand `Offer` shape but along different axes (within-merchant vs. across-merchant). 2026-04-29 schema mapping spec — extends the same emission philosophy.

**Status:** Decided — scheduled as S101c after column-semantics confirmation; sequenced after S101a-B and S101b

---

## 2026-05-04 — Emission-Validator Coverage Manifest as Build Invariant

**Context:** S101a-A audit surfaced a recurring pattern category not previously named: §2 (d) — validator scope is narrower than emission scope. The price-numeric and availability-presence FAIL rules already exist at `schema-completeness.ts:170–188` and JSON-LD output is clean. The 11,217 violations live exclusively in HTML microdata, which the validator never parsed. Validation surface and emission surface drifted apart silently for an unknown duration. The pattern will recur as new emission surfaces are added (RSS, OpenGraph, future MCP-emitted JSON, NLWeb endpoint, hreflang `<link>` tags) unless a structural guardrail is installed.

**Decision:** Adopt as build-time invariant: every emission surface must be registered with a corresponding validator surface (or explicitly registered as "not validated, low-risk surface") in a coverage manifest. Any emitter not declared in the manifest fails the build. Schedule implementation as session S110, sequenced after Sprint 1 closes.

**Reasoning:** The 11,217-violation incident was not a one-off bug — it was a structural failure mode where two correctly-functioning components (emitter, validator) drifted apart silently because no third component asserted that their scopes must remain coupled. The cost of building the manifest is small (one YAML file plus a build-time check). The cost of not building it scales with every new emission surface added: each is another opportunity for silent drift. Discovery-layer authority depends on emission cleanliness across all surfaces AI engines parse, not just the surfaces we last validated. Installing this guardrail before the next emission surface ships (RSS feed, OpenGraph metadata expansion, NLWeb endpoint) is materially cheaper than back-validating after the fact.

The manifest is explicitly permissive — surfaces *may* be registered as "not validated, low-risk" with stated rationale. The invariant is registration, not validation. This prevents the manifest from becoming a blocker for low-priority surfaces while still surfacing every emission decision as a deliberate one.

**Implementation:**
1. Coverage manifest format: YAML or TypeScript registry declaring each emission surface (`json-ld`, `microdata`, `rss`, `og`, `sitemap`, `llms-txt`, etc.) and its validation status (`validated:full`, `validated:partial`, `not-validated:low-risk`, `not-validated:deferred`)
2. Build-time check: any emitter writing to a surface not declared in the manifest fails the build with a "register your emission surface" error
3. Validator coverage check: any surface marked `validated:full` or `validated:partial` must have a corresponding validator entry; mismatches fail the build
4. Initial population: register existing surfaces (`json-ld:validated:full`, `microdata:validated:full` after S101a-B closes, `sitemap:validated:partial`, `og:not-validated:low-risk`, `llms-txt:not-validated:low-risk`)
5. Queue as S110, sequenced after Sprint 1 closure when emission surfaces are stable enough to inventory cleanly

**Validation:** Post-implementation, attempt to add a new emission surface without manifest registration and confirm build fails. Attempt to add a `validated:full` surface without a validator entry and confirm build fails. Quarterly review of the manifest to surface any surfaces that drifted to `not-validated:deferred` and need promotion.

**Replicability:** Fully replicable as SPEC universal — "every emission surface is registered with validation status; build invariant prevents silent drift between emission and validation scopes." Manifest contents are per-codebase (not per-city) but the structural pattern transfers identically to agent-barcelona and agent-berlin. This is closer to a build-system convention than a city-specific decision.

**Connects to:** S101a-B microdata-validator coverage (the immediate trigger). All future emission-surface decisions (RSS, NLWeb, MCP endpoint when triggers fire). Postponement dormancy decision (above) — dormant helper branches without an emission surface should appear in the manifest as deliberately not-emitted.

**Status:** Decided — queued as S110 after Sprint 1 closure

---

## 2026-05-08 — Cornerstone Schema First Cornerstone — Schema-Only Ship, Picks Empty for Initial Weekends, Multi-Cornerstone Picks Data Model

**Context:** The 5 cornerstone pages (`/this-weekend`, `/today`, `/this-week`, `/[month]-2026`, `/open`) are designed to absorb 70–90% of all AI citations per the citation power law (March 2 cornerstone-pages decision). The May 4 cornerstone-schema architecture decision specced dual ItemList emission (Picks + Comparison), a Position 1.5 conditional template slot, and an `editorial_pick_rank` column on the `events` table — implementation queued for the first serialized cornerstone, `/this-weekend`, in feedback-cycle order. May 8 brief preparation surfaced two issues requiring decisions before Template B could ship to Dev Planner: (1) Editorial Director clarified that `editorial_pick_rank` was not yet populated and the gap was undocumented editorial rubric, not infrastructure; (2) the column-on-events shape silently assumed single-hub picks, which doesn't survive multi-cornerstone reality (a killer Saturday concert can legitimately be picked on `/today` rank #1, `/this-weekend` rank #2, `/this-week` rank #4, and `/[month]-2026` rank #6 simultaneously). A third issue surfaced at v3-to-v4 ratification time: the v3 spec assumed `events.id INTEGER PRIMARY KEY`; Dev Planner Step-0 verification against `data/events.db` HEAD confirmed the actual production schema is `events.id TEXT PRIMARY KEY`. Type alignment is required for reliable CASCADE semantics under SQLite type-affinity rules. Brief corrected to v4 before any code or log shipped.

**Decision:**

1. **Cornerstone schema architecture (locked May 4, recorded here):** Cornerstone pages emit dual ItemList — a Picks ItemList (`itemListOrder: ItemListOrderManual`, 5–7 entries, position carries editorial rank) at template Position 1.5, alongside the Comparison ItemList (`itemListOrder: ItemListOrderAscending`, full S110f-filtered eligible event set). Picks ItemList `@id` shape: `[page-canonical-url]#picks`. Comparison ItemList `@id` shape: `[page-canonical-url]#comparison`. Cornerstone-only conditional ★ column on the comparison table marks pick events with a binary indicator (rank lives in the Picks block, not the column). Standard hubs inherit the Position 1.5 slot but never populate it — divergence is data-presence, not template-shape.

2. **Schema-only ship with empty conditional render (May 8 ED clarification).** `editorial_picks` data table ships from day one. Render logic is conditional on data presence — for the first 1–2 weekends post-deploy, the table is empty for `/this-weekend` → Picks block does not render → page flows from answer capsule directly to comparison table → ★ column does not render. ED drafts the picks rubric in parallel during these weekends. Backfill picks once rubric stabilizes. **Empty Picks ItemList is omitted entirely from emitted schema** — not emitted as an empty container.

3. **Multi-cornerstone picks data model (May 8 amendment).** Replace the May 4 column-on-events shape with a separate `editorial_picks` table. Schema:

   ```sql
   CREATE TABLE editorial_picks (
     hub_slug      TEXT    NOT NULL,
     locale        TEXT    NOT NULL DEFAULT 'en',
     week_starting TEXT    NOT NULL,
     event_id      TEXT    NOT NULL,           -- type-aligned with events.id TEXT PRIMARY KEY
     rank          INTEGER NOT NULL CHECK (rank BETWEEN 1 AND 10),
     PRIMARY KEY (hub_slug, locale, week_starting, rank),
     UNIQUE       (hub_slug, locale, week_starting, event_id),
     FOREIGN KEY  (event_id) REFERENCES events(id) ON DELETE CASCADE
   );
   ```

   Same event may have multiple rows across (hub, week) tuples — supports multi-cornerstone picks natively. Locale lives in the relationship, forward-compatible with bilingual at zero schema-change cost. CASCADE delete: event removal flows through pick rows. CHECK ceiling at 10 covers `/[month]-2026`'s 7–10 target without hardcoding.

   `event_id` column type is **TEXT, type-aligned with the existing `events.id TEXT PRIMARY KEY` schema.** The original v3 brief assumed INTEGER; Dev Planner Step-0 verification surfaced the actual TEXT type before any code changed. Type alignment matters because SQLite's type-affinity rules permit a type-mismatched FK declaration to compile, but `ON DELETE CASCADE` becomes unreliable across type-class boundaries — identity matching gets fuzzy. The project's broader posture (exact-match discipline) contradicts a type-fuzzy FK at the schema layer. Trade-off at this table size (~5,000 rows max — hubs × weeks × ranks ≤ 10): TEXT keys are marginally larger and slower to index than INTEGER, but the cost is negligible at this scale; type alignment is the only thing that matters.

4. **Pick-count rules (locked, propagate to all cornerstones):**
   - Cap at 7 picks per cornerstone-week. Past 7, ItemList rank-1 signal weight dilutes and embedding chunks gain noise without proportional citation gain.
   - Hard floor at 5 picks for `/this-weekend`. If inventory genuinely doesn't support 5 standouts, fall back to "no picks this week" via empty conditional render rather than ship a thin block — empty-render is strictly better than 3 picks signaling "we couldn't find 5 things worth recommending."
   - Per-cornerstone targets: `/this-weekend` 5–7 (target 7); `/this-week` 7; `/[month]-2026` 7–10; `/today` 3–5 (single-day inventory cap); `/open` 3–5 (free-event inventory typically constrained).

5. **Category-balance rules (locked, propagate to all cornerstones):** Soft category-balance with editorial override and ≥3-category floor non-negotiable. ED ranks by editorial quality first, then validates ≥3 distinct categories represented across the 5–7 picks. If not met, swap lowest-ranked pick in the dominant category for the highest-quality pick in an unrepresented category until floor met. The 3-category floor is the non-negotiable; everything above it is editorial discretion.

6. **Cornerstone sequencing in feedback-cycle order (locked May 4, recorded here):** `/this-weekend` first, then `/today`, `/open`, `/this-week`, `/[month]-2026`. Each successor cornerstone inherits the canonical template established by `/this-weekend` and runs faster — primarily configuration changes plus per-cornerstone pick-count tuning.

**Reasoning:**

*On dual ItemList over single:* Picks ItemList and Comparison ItemList answer different grounding-query types. Picks serves "what does agent-athens recommend for this weekend?"; Comparison serves "what's happening this weekend?" (broad fan-out). Collapsing them loses the "agent-athens's top pick" extractability that the curation signal exists to provide. Same event can appear in both — Picks is a curation reference, not content duplication.

*On schema-only ship over schema-plus-picks-on-day-one:* ED's framing was correct — even if the field shipped tomorrow, populating it without a documented rubric would mean inconsistent picks across weekends, which is worse than no picks because it erodes the editorial signal the field is meant to carry. Empty conditional render preserves the 18-point penalty avoidance from "Schema Quality Over Presence" — partial schema is the trap, not "schema scaffolding rendering nothing." The schema infrastructure is still the citability multiplier; picks are a quality enhancer on top.

*On separate `editorial_picks` table over column-on-events:* Picks are a relationship (hub × week × locale → ranked event), not a property of an event. The relational shape is the structurally correct model. Forcing ED to pick one cornerstone per event under the column shape would create editorial friction that doesn't serve the citation goal — and risks cornerstones citing each other's "second-best" picks, weakening the curation signal across the board. The relational shape was missed in the May 4 spec; surfacing now is materially cheaper than discovering it post-migration when ED hits the multi-cornerstone case in week 2–3 of rubric drafting and forces retrofit. Locale in the relationship (rather than on the events table) provides bilingual forward-compat at zero schema-change cost — when Greek lands, ED inserts `(this-weekend, el, week, ...)` rows alongside English picks; no schema change, no constraint change.

*On `event_id TEXT` over `event_id INTEGER`:* Production `events.id` is TEXT, not INTEGER. Type alignment at the FK boundary is required for reliable CASCADE semantics. The cost of TEXT keys at this table size is negligible (~5,000 rows max). The synthetic-INTEGER-column alternative was considered and rejected — higher friction, no clear benefit at this table size, only justified if a project-wide INTEGER-key migration is on the roadmap (none known). The corrective process worked: v3 brief flagged "events.id column shape unexpected" as a §11 implementation flag-back item; Dev Planner Step-0 verification triggered on that hedge before code changed; brief corrected to v4 before log shipped. The institutional-memory pattern (`feedback_verify_paths_in_briefs.md`) flagged this as the second instance of brief-family FK type-assumption mismatch — promoted to a post-S101a-1 process audit pass parallel to the May-4-not-logged audit.

*On 5–7 with floor 5, cap 7:* Position 1 in an ItemList carries the bulk of citation weight (same first-30%-rule that governs page chunks); each additional position past 7 reduces relative differentiation. Below 5, AI engines read "thin curation." 7 is the published-GEO-guidance sweet spot across editorial-picks blocks. Per-cornerstone tuning is justified by inventory shape — `/today` cannot reliably produce 7 standouts on a single day; `/[month]-2026` can support 7–10 across a longer window.

*On soft category-balance with ≥3 floor:* Pure cross-category (rank purely by quality) fails grounding-query fan-out — AI agents decompose "things to do in Athens this weekend" into category sub-queries (music, theater, exhibitions, family, free), and a picks list of 7 concerts even editorially perfect signals "agent-athens = music site" and misses the cornerstone's actual citation job. Hard category-balance with mandatory quotas forces ED to pick mediocre events to fill slots, which erodes the editorial signal quality the field exists to carry. Soft-balance with ≥3 floor preserves editorial sovereignty when reality is genuinely concentrated (Athens Festival opening weekend, Onassis programmatic peak) while preventing the structural failure mode.

**Implementation:**

S101a is split into two sessions (see separate entry "S101a Two-Session Split — Foundation Before Template").

S101a-1 (foundation):
1. `editorial_picks` table migration with PRIMARY KEY, UNIQUE, CHECK, FOREIGN KEY constraints + render-support index per the spec above; `event_id` column is TEXT
2. `picks-itemlist-position-contiguous` validator rule, FAIL tier, ~10 LOC, applied to JSON-LD + microdata emission paths, ≥3 unit tests (empty/contiguous/gap)
3. `<html lang="en">` template audit + fix
4. `localeUrl()` helper definition + unit tests

S101a-2 (cornerstone template):
5. Picks ItemList JSON-LD emission (conditional on `editorial_picks` rows existing for the (hub, locale, week))
6. Picks ItemList microdata emission (parity)
7. Comparison ItemList `inLanguage` / `availableLanguage` modifications
8. Position 1.5 template slot wiring + conditional render logic
9. Conditional ★ column on cornerstone comparison tables
10. `localeUrl()` callsite usage at all S101a-2 emission points (picks-block links, ItemList `@id`s, breadcrumb chain)
11. TODO[S110] markers at both emission sites

Picks-render query joins `editorial_picks → events` on `ep.event_id = e.id` (TEXT JOIN, type-aligned) and applies the S110f event-eligibility predicate on the events side — single source of truth, picked events that become ineligible drop naturally from the JOIN.

Successor cornerstones (`/today`, `/open`, `/this-week`, `/[month]-2026`) inherit S101a-2's template. Estimated 30–50% session-time reduction per successor cornerstone vs. S101a-2 if the template ships clean.

**Validation:**

Pre-deploy (S101a-1):
- `editorial_picks` migration runs cleanly on production database snapshot
- `event_id` column type confirmed TEXT (matches `events.id TEXT PRIMARY KEY`)
- PRIMARY KEY enforced: insert two rows with same `(hub, locale, week, rank)` → second insert fails
- UNIQUE constraint enforced: insert two rows with same `(hub, locale, week, event_id)` at different ranks → second insert fails
- CHECK constraint enforced: insert with `rank=0` or `rank=11` → fails
- FOREIGN KEY enforced: delete an event with picks → pick rows cascade-delete (test fixture uses string event IDs)
- Validator rule unit tests pass (empty, contiguous, gap)

Pre-deploy (S101a-2):
- Schema.org Validator clean on `/this-weekend/`
- Google Rich Results Test passes
- Empty-picks case: Picks ItemList omitted entirely (not emitted as empty container) — confirm by inspecting rendered HTML
- TODO[S110] markers grep-verifiable at both emission sites

Post-deploy (first 7 days, empty-picks state):
- Bing Webmaster Tools confirms `/this-weekend/` indexed
- Manual spot-check: comparison table renders, ★ column does NOT render, picks block does NOT render

Post-deploy (post-first-picks-populate, week 2–3):
- Picks block renders at Position 1.5 with N entries, 5 ≤ N ≤ 7
- ★ column renders on comparison table with binary markers on cornerstone only
- Schema.org Validator: dual ItemList parses correctly; both `position` sequences contiguous
- Picks events sourced from S110f-filtered event pool (verifiable via query trace — picks must be a subset of comparison-table eligible events)
- Category-balance spot-check: ≥3 distinct categories represented across the picks

3-month cornerstone power-law check: do the 5 cornerstones capture 70%+ of all citations per the Otterly.AI baseline pattern? If not, cornerstone selection or schema shape is rotated.

**Replicability:**

SPEC universal. Cornerstone schema architecture, dual-ItemList pattern, Position 1.5 conditional slot, `editorial_picks` separate-table data model with `(hub_slug, locale, week_starting, rank)` constraint shape, ★ column conditional render, `picks-itemlist-position-contiguous` validator rule, pick-count rules per cornerstone type, category-balance soft-with-≥3-floor — all city-agnostic.

`event_id` column type per-city. TEXT for agent-athens (matches existing `events.id TEXT PRIMARY KEY`). Each city instance of the `editorial_picks` migration must verify the city's `events.id` column type and align `event_id` accordingly — TEXT or INTEGER — to maintain reliable CASCADE semantics. **Authoring-routine check at city instantiation:** before writing `editorial_picks` migration for a new city, verify that city's `events.id` type via `sqlite3 [city-db] ".schema events"` and adjust. This is a city-instantiation step, not a SPEC variation.

DATA per-city. URL slug `/this-weekend` is universal across initial cities (English slug for cornerstone URLs). Per-city event corpus, per-city venue/category mix. `addressCountry` per city (`GR`/`ES`/`DE`).

Multi-cornerstone picks support transfers identically — `editorial_picks` table shape is agent-Athens-agnostic; each city instantiates its own table with the same schema shape (column-type alignment per the city's `events.id` type as noted above). Pick rows are per-(hub, locale, week, rank) tuples regardless of city.

**Connects to:**
- "Hub Page Editorial Template" (2026-02-20) — Comparison ItemList is the comparison-table layer of the 5-part template; Picks block at Position 1.5 is a cornerstone-only sixth part
- "Cornerstone Pages Strategy" (2026-03-02) — defines the 5 cornerstone pages this decision builds on
- "Schema Quality Over Presence" (2026-03-02) — empty-conditional-render pattern preserves the 18-point penalty avoidance
- "Emission-Validator Coverage Manifest as Build Invariant" (2026-05-04) — `cornerstone-itemlist:json-ld` and `cornerstone-itemlist:microdata` register as new emission surfaces when S110 ships; TODO markers are in place at S101a-2 emission sites
- "Bilingual Infrastructure Subset" (2026-05-08, separate entry) — Picks ItemList carries `inLanguage` matching page locale; `availableLanguage` follows the locked English-only shape; locale-in-relationship in `editorial_picks` is the bilingual forward-compat hook
- "S101a Two-Session Split — Foundation Before Template" (2026-05-08, separate entry) — implementation sequencing for this decision
- `feedback_verify_paths_in_briefs.md` (institutional memory) — caught the v3 INTEGER assumption pre-code; second instance of brief-family FK type-assumption mismatch; prompted a post-S101a-1 process audit pass on past Template B briefs for similar assumed-type FK references

**Status:** Decided — S101a-1 in session planning at Step 0.5 with corrected migration; S101a-2 plan composed post-S101a-1 ship against verified state.

---

## 2026-05-08 — Bilingual Infrastructure Subset — `inLanguage` + `availableLanguage` + `<html lang>` + Locale-Aware Helper for New Code; URL/hreflang/Translation Deferred

**Context:** Greek-content rollout is currently deprioritized; the site is English-content only. The S101a Template B preparation surfaced a question: which elements of the prior bilingual decisions (Feb 19, Feb 20, Feb 24) ship now, and which defer until Greek content is on a near-term roadmap? The bilingual workstream splits four ways with very different costs and correctness profiles, and shipping the wrong subset (e.g., hreflang claiming Greek alternates when Greek pages don't exist) would emit incorrect schema rather than just incomplete schema — strictly worse than silence.

**Decision:** Adopt a narrow, correctness-bounded bilingual infrastructure subset for S101a and forward-going work, with explicit deferrals for the rest:

**In scope (ship now):**

1. **`inLanguage` on schema entities.** `inLanguage: "en"` on Event entities and on both ItemList wrappers (Picks and Comparison). Schema.org permits `inLanguage` on the ItemList wrapper via the CreativeWork inheritance chain; AI engines parse the wrapper-level signal independently of item-level signals.

2. **`availableLanguage: ["en"]`** on Event and ItemList wrappers. Single-element array, not `["el", "en"]`. We do not claim Greek availability when Greek pages do not exist. When Greek content lands, expand the array.

3. **`<html lang="en">` verification.** Audit all page templates for correctness; fix any template missing the attribute or carrying a wrong value.

4. **Locale-aware URL helper for new code only.** Introduce `localeUrl(path: string, locale?: string): string` (or equivalent signature; adapt to existing utilities namespace). Default `locale` parameter is the page locale (currently effectively `"en"` for all calls). Return value for now: `/{path}` with no locale prefix. Forward-compatible: when bilingual rolls out, the helper extends to return `/{locale}/{path}` for non-default locales. Used in S101a's new emission surfaces (picks-block links, ItemList `@id` URLs, cornerstone breadcrumb chain). Existing site-wide hardcoded internal links are NOT refactored — that's a future bilingual-infrastructure session.

**Out of scope (deferred):**

- **No hreflang tags.** Greek alternates do not exist; emitting hreflang to non-existent Greek URLs would lie about content. Self-referencing hreflang on the English page alone provides no benefit and adds maintenance surface.
- **No `/en/` URL.** Site stays at `/this-weekend/` (no locale prefix) until bilingual lands and the prefix scheme is rolled out site-wide as a coordinated migration.
- **No DeepL caching scaffolding.** Translation pipeline activates when Greek content rollout activates.
- **No site-wide hardcoded-link refactor.** Estimated ~1 dedicated session; defers cleanly.
- **No sitemap split into per-locale files.** Estimated ~0.5 session; defers cleanly.
- **No canonical-link or breadcrumb template restructure for locale-prefix paths.** Estimated ~0.5–1 session; defers cleanly.

**Reasoning:**

*On the four-way split:* The bilingual workstream has been treated as a single bundle in prior decisions (Feb 19 hreflang triplet, Feb 20 x-default reversal, Feb 24 inLanguage), but the four sub-components have radically different ship-now profiles. (1) `inLanguage` on schema and (2) `<html lang>` correctness are cheap and correct on English-only content — ship now, no downside. (3) URL routing scaffolding has real migration cost (existing internal links, sitemaps, canonicals, breadcrumbs) — defer until benefit is on a near-term roadmap. (4) hreflang claiming Greek alternates would be incorrect on English-only content — exclude entirely, not just defer.

*On `availableLanguage: ["en"]` over `["el", "en"]`:* Same correctness principle as the hreflang exclusion. Schema is a structured-data contract with AI engines; emitting `availableLanguage: ["el", "en"]` when Greek content does not exist is a lie about availability that AI engines parse and propagate. The cost of expanding the array later (single-line code change when Greek content ships) is far smaller than the cost of emitting incorrect schema in the interim.

*On the locale-aware helper for new code only:* The principle being locked is "don't introduce new hardcoded English paths in new code, regardless of bilingual timing." This costs nothing — `localeUrl('this-weekend')` is no harder to write than `'/this-weekend/'` — and prevents the situation getting worse during the deferral period. Refactoring existing hardcoded links to the helper is a real session of work that pays its cost only when bilingual ships; paying that cost now while bilingual is deprioritized risks paying without reaping. When bilingual lands, the existing-link refactor + sitemap split + canonical restructure consolidate into one bilingual-infrastructure session, not three scattered ones — the deferral preserves efficiency rather than losing it.

*On hreflang exclusion (not deferral):* Hreflang is the only sub-component where the wrong implementation is actively harmful, not just incomplete. Emitting `<link rel="alternate" hreflang="el" href="...">` to a non-existent or stub Greek URL would produce 404s on the alternate, which Google interprets as a quality signal. Better to have no hreflang than incorrect hreflang — the principle generalizes to any structured signal that asserts a fact about content (`availableLanguage`, `sameAs`, etc.).

**Implementation:**

In S101a-1 (foundation):
1. `<html lang="en">` template audit — single grep, fix outliers in place
2. `localeUrl(path, locale)` helper definition + ≥3 unit tests covering English path, explicit-locale-en, explicit-locale-el forward-compat shape

In S101a-2 (cornerstone template):
3. `inLanguage: "en"` on Event entities, Picks ItemList, Comparison ItemList
4. `availableLanguage: ["en"]` on the same entities
5. `localeUrl()` callsite usage at all S101a-2 emission points (picks-block links, ItemList `@id` URLs, breadcrumb chain) — grep-verifiable: no hardcoded `/this-weekend` strings in S101a-2-introduced files
6. Pre-deploy verification: no hreflang tags emitted on `/this-weekend/` (verify by inspecting rendered head)

In a future bilingual-infrastructure session (triggered by Greek-content rollout being on near-term roadmap):
7. Refactor of existing site-wide hardcoded internal links to use `localeUrl()`
8. Sitemap split into per-locale files (`sitemap-en.xml`, `sitemap-el.xml`, `sitemap-index.xml`)
9. Canonical-link + breadcrumb template restructure for locale-prefix paths
10. hreflang triplet emission (with x-default per Feb 20 reversal decision)
11. DeepL caching scaffolding + Entity Locking list

**Validation:**

Pre-deploy:
- Schema.org Validator parses `inLanguage` correctly on Event + both ItemList wrappers
- `availableLanguage: ["en"]` in emitted schema (verify by inspecting rendered JSON-LD)
- `<html lang="en">` confirmed on every page template (grep across templates)
- `localeUrl()` helper unit tests pass
- No hreflang tags on `/this-weekend/` (verify by inspecting rendered head)
- `localeUrl()` used at all S101a-2 emission sites (grep: no hardcoded `/this-weekend` in new files)

Long-term: when Greek content lands, expanding `availableLanguage` to `["el", "en"]` and adding hreflang requires single-file changes plus the deferred bilingual-infrastructure session. The deferral cost is bounded.

**Replicability:**

SPEC universal. The principle "include only languages where content actually exists at this stage" generalizes to all cities. Athens, Barcelona, Berlin all launch English-first per the existing posture; all three start with `availableLanguage: ["en"]`, no hreflang, `<html lang="en">`, and `localeUrl()` helper for new code. As each city's primary-language content rolls out on its own schedule, the schema expansion is per-city.

DATA per-city. Locale codes per city: Athens secondary `el`, Barcelona secondary `es` (Catalan deferred per existing spec), Berlin secondary `de`. URL slug `/this-weekend` is universal across cities (English slug for cornerstone URLs).

Zero hardcoding. Locale-aware logic in S101a reads from city config (`primaryLanguage`, `secondaryLanguage`, `primaryPath`, `secondaryPath`).

**Connects to:**
- "DeepL Caching Architecture" (2026-02-20) — DeepL scaffolding deferred until Greek content rollout
- "x-default Changed to English" (Feb 2026) — when hreflang re-activates in the future bilingual-infrastructure session, x-default → English remains the locked target
- "inLanguage Implementation" (2026-02-24) — `inLanguage: "en"` on schema entities is the partial implementation of this prior decision
- "Cornerstone Schema First Cornerstone" (2026-05-08, separate entry) — S101a-2 is the first cornerstone where this bilingual subset materializes
- "S101a Two-Session Split — Foundation Before Template" (2026-05-08, separate entry) — `<html lang>` audit and `localeUrl()` helper land in S101a-1; schema `inLanguage`/`availableLanguage` and helper callsite usage land in S101a-2

**Status:** Decided — S101a-1 ships `<html lang>` audit + `localeUrl()` helper; S101a-2 ships schema-side application; future bilingual-infrastructure session reactivates remaining deferrals when Greek-content rollout is on near-term roadmap.

---

## 2026-05-08 — S101a Two-Session Split — Foundation Before Template

**Context:** S101a Template B (cornerstone schema implementation on `/this-weekend`) covered 8–10 distinct surfaces: `editorial_picks` table migration, JSON-LD ItemList emission, microdata ItemList emission, Comparison ItemList modification (inLanguage/availableLanguage), Position 1.5 template slot wiring, conditional ★ column rendering, `picks-itemlist-position-contiguous` validator rule, `<html lang>` template audit, `localeUrl()` helper definition, helper callsite usage at S101a emission points, TODO[S110] markers, decisions-log entries. This exceeds the project's session-discipline ceiling. Dev Planner flagged the over-scope before writing session plans, proposing a split into S101a-1 (foundation) + S101a-2 (cornerstone template).

**Decision:** Split S101a into two sessions:

**S101a-1 (foundation batch):**
- `editorial_picks` table migration
- `<html lang>` template audit + fix
- `localeUrl()` helper definition + unit tests
- `picks-itemlist-position-contiguous` validator rule + ≥3 unit tests
- Decisions-log entries (this entry plus the two siblings)

No user-visible surface change in S101a-1. TDD-correct: validator and helper land before schema emission depends on them.

**S101a-2 (cornerstone template):**
- Picks ItemList schema emission (JSON-LD + microdata, conditional)
- Comparison ItemList modifications (`inLanguage` + `availableLanguage` additions)
- Position 1.5 template slot wiring + conditional render
- Conditional ★ column on cornerstone comparison tables
- `localeUrl()` callsite usage at S101a-2 emission points
- TODO[S110] markers at both emission sites
- Page-level validation criteria (Schema.org Validator, Google Rich Results Test, etc.)

User-visible surface lands in S101a-2 (page-level rendering changes).

**S101a-2 plan is composed post-S101a-1 ship against verified-known foundation state, not assumed state.**

**Reasoning:**

*On session-discipline ceiling:* The project's session-discipline pattern is risk-bounded sessions with verifiable checkpoints. 8–10 surfaces in one session creates several failure modes simultaneously: (a) reviewer cannot meaningfully spot-check all changes; (b) test failures in one surface block others from shipping; (c) rollback granularity is coarse — a problem in template wiring forces rollback of validator code that was fine. Splitting into foundation + template is the canonical risk-reduction move when surface count exceeds the ceiling.

*On the strategic argument beyond risk reduction:* Successor cornerstones (`/today`, `/open`, `/this-week`, `/[month]-2026`) inherit S101a-2's template only — they do not re-do S101a-1's foundation. This is materially cleaner inheritance shape than "successor cornerstones inherit S101a's foundation+template combined." The mental model for /today, /open, /this-week, /[month]-2026 becomes "S101a-2 applied to [cornerstone]," which is the right level of abstraction for the inheritance shape. Estimated 30–50% session-time reduction per successor cornerstone vs. S101a-2 if the template ships clean — and the cleanness depends on the foundation being independently shippable and verifiable, which the split enforces.

*On TDD-correct ordering:* The validator rule (`picks-itemlist-position-contiguous`) and the helper (`localeUrl()`) are dependencies of the schema emission code that uses them. Landing them first means the emission code in S101a-2 is written against tested foundations, not against simultaneously-being-written foundations. Standard TDD pattern; the split makes the ordering explicit rather than implicit.

*On the foundation-state-verification argument:* Writing S101a-2's session plan post-S101a-1-ship eliminates assumed-state risk. If S101a-1 surfaces a surprise (e.g., SQLite version-specific behavior on the CHECK constraint, microdata-emission path requires architectural change), S101a-2's plan is composed against the resolved state rather than the assumed state. The cost of waiting to write S101a-2 is bounded (one session of latency); the benefit of plan-against-verified-state is real.

**Implementation:**

1. Dev Planner writes S101a-1 session plan
2. S101a-1 executes: migration runs, helper lands, validator rule lands, `<html lang>` audit completes, log entries draft
3. S101a-1 ships and ladders into the standard log-write pass
4. Dev Planner writes S101a-2 session plan against verified S101a-1 state
5. S101a-2 executes: schema emission, template slot wiring, ★ column rendering, helper callsite usage, TODO markers
6. S101a-2 ships
7. Successor cornerstones (`/today` etc.) inherit S101a-2's template

**Validation:**

The split itself is validated by execution shape:
- S101a-1's pre-deploy criteria are independently checkable without the cornerstone template (migration runs cleanly + helper unit tests pass + validator unit tests pass + `<html lang>` audit complete)
- S101a-2's pre-deploy criteria depend on S101a-1's foundation being already shipped (helper callsite usage requires the helper to exist; ItemList emission with `inLanguage` requires the field-floor floor to be ready)
- Successor cornerstone session-time tracking: target 30–50% reduction vs. S101a-2 baseline

If S101a-1 ships and S101a-2 cannot be cleanly written against verified state — e.g., an unexpected foundation-state issue surfaces — the split has done its job by forcing the issue to surface before template work is contaminated.

**Replicability:**

SPEC universal. The split pattern (foundation → template) applies to any cornerstone schema implementation on any city. agent-barcelona's first cornerstone implementation, agent-berlin's first cornerstone implementation, will follow the same shape — foundation session lands the city-specific migration + helper config + validator rules, template session lands the schema emission. Each successor cornerstone within a city inherits the city's template.

DATA per-city. The migration shape is identical (`editorial_picks` table); city config differs (locale codes, URL slugs, `addressCountry`, `event_id` column type per city's `events.id` type alignment).

**Connects to:**
- "Cornerstone Schema First Cornerstone — Schema-Only Ship, Picks Empty for Initial Weekends, Multi-Cornerstone Picks Data Model" (2026-05-08, separate entry) — the strategic decision being implemented across this split
- "Bilingual Infrastructure Subset" (2026-05-08, separate entry) — `<html lang>` and `localeUrl()` land in S101a-1; schema-side `inLanguage`/`availableLanguage` and helper callsite usage land in S101a-2
- "Emission-Validator Coverage Manifest as Build Invariant" (2026-05-04) — TODO[S110] markers at S101a-2 emission sites enable one-line manifest registration when S110 ships

**Status:** Decided — S101a-1 in session planning at Step 0.5 with corrected migration; S101a-2 plan composed post-S101a-1 ship.

---

## 2026-05-11 — Unclassifiable-Merchant Ticket Sources: Omit Offer (Classifier as Single Emission Gate)

**Context:** Sprint 1 closed 2026-04-30 (commits 749de0fd5, 5d49315a1, 3eaec15df, 8021646d1). The Session 0 diagnostic surfaced ~78 with-ticket events emitting athinorama.gr URLs as `offers.url` — athinorama is a listings aggregator, not a merchant. Smaller parallel clusters: manual-source events without outbound ticket links, residentadvisor events lacking outbound merchant URLs, megaron events redirecting to unclassified Greek payment portals. The post-Sprint-1 offers emission refactor already specified config-driven `ticket-source-classification.json`, inline Organization seller emission, and eventStatus→availability mapping (omit Offer on EventCompleted; Discontinued on EventCancelled; InStock on Scheduled/Postponed/Rescheduled). Policy gap: what happens when a with-ticket event's only ticket URL is neither a merchant nor classifiable as one. Three options framed by Dev Planner: A) drop `offers.url` and `seller`, keep Offer block; B) drop entire Offer block; C) emit aggregator as generic seller without Wikidata grounding.

**Decision:** Option B. When a with-ticket event's only ticket URL is not in the classifier's known-merchant set, the classifier emits no Offer. Event-level `isAccessibleForFree: false` carries the ticketing signal independently. Policy is general — applies to athinorama and all future unclassifiable ticket-source cases (Παναθήναια ingestion, new aggregators, unmapped payment portals). The classifier is the single source of truth for Offer emission gating; no special-case code paths for "unclassifiable" branches outside the config layer.

**Reasoning:** Options A and C are structurally foreclosed by the 2026-04-28 Offers Implementation Spec FAIL rules — A drops `url` and `seller` (both required when Offer emits); C inlines an aggregator as `seller` that cannot resolve to a marked-up Organization in the entity graph (orphan-seller FAIL). Adopting either means rewriting locked validator rules, not extending them.

Option B is consistent with three existing precedents: pure-informational open-events with no venue info page ("omit `offers` entirely and rely on `isAccessibleForFree`" — 2026-04-28); EventCompleted lifecycle (Offer omitted for past events — 2026-02-20); EventCancelled emission policy (S101b — Offer DOES emit there because the seller relationship is still honestly grounded; the unclassifiable-merchant case differs precisely because seller grounding is unavailable).

The 18-point partial-schema penalty (Schema Quality Over Presence, 2026-03-02) operates at event level, not Offer level — partial Offer risks degrading the entire event's citation posture, while omitted Offer leaves the event clean. Tier A protection (89.4% of bot traffic, per "Schema.org Offers Implementation Spec") is better served by honest absence than by partial merchant claims that train models toward broken booking surfaces.

The coverage-hit counter-argument is acknowledged (~84 with-ticket events lose Offer presence at deploy). Mitigated by the nightly URL resolver already on the roadmap (Sprint 2 scope) which populates `ticket_url_resolved` for aggregator sources — events transition out of the Offer-less state without per-event content work as resolver hits land. Deliberately Deferred Register entry tracks the deferral state.

**Implementation:**
1. Classifier (`ticket-source-classification.json`): unclassifiable URL → `omit_offer: true`. No special-case code paths; classifier output is the single emission gate.
2. Emission layer: when classifier returns `omit_offer`, skip the entire `offers` block. Event still emits `isAccessibleForFree: false` and all other Schema Completeness Checklist fields.
3. **Validator rule scoping (required for this decision to ship cleanly):** Re-scope the existing FAIL rule from *"Any with-ticket event missing `url`, `price`, `priceCurrency`, `availability`, `validFrom`, or `seller`"* to *"Any **emitted Offer** missing `url`, `price`, `priceCurrency`, `availability`, `validFrom`, or `seller`."* Separates emission policy (classifier-driven) from validation policy (Offer-shape correctness when emitted). Aligns spec with already-established behavior for EventCompleted Offer omission. Schema Completeness floor (`offers ... OR isAccessibleForFree`) covers the new state unchanged.
4. Build-time telemetry: log count of unclassifiable-merchant Offer omissions, broken down by source (athinorama, manual-source, residentadvisor, other). Becomes the measurable baseline against which the nightly URL resolver's coverage is later evaluated.
5. Deliberately Deferred Register entry added to `current-infrastructure-v2.md` — reactivation trigger: nightly URL resolver populating `ticket_url_resolved`.

**Validation:** Post-deployment, confirm build-time omission count matches expected baseline (~84). Confirm validator no longer flags these events as FAIL. Confirm `isAccessibleForFree: false` present on all affected events. Schema.org Validator + Google Rich Results Test parse the Offer-less with-ticket events cleanly. Quarterly: omission count should trend down as resolver coverage expands; rising count indicates scraper regression or aggregator drift.

**Replicability:** Fully replicable. SPEC universal — "classifier is single source of truth for Offer emission gating; unclassifiable merchant URLs trigger omission; event-level `isAccessibleForFree` carries ticketing signal independently of Offer presence." DATA per-city — each city's `ticket-source-classification.json` lists its own known merchants and aggregators. Barcelona will hit this with its own aggregator set (timeout.es scenarios, ticketmaster.es edge cases); Berlin similarly. Policy precedent transfers; merchant lists differ.

**Connects to:**
- "Schema.org Offers Implementation Spec" (2026-04-28) — this decision scopes the FAIL rule from event-property to Offer-property.
- Pure-informational open-events policy within the Offers Spec — direct precedent for omit-Offer + rely-on-`isAccessibleForFree`.
- "Cancelled Events: Emit With EventCancelled + Discontinued Rather Than Filter" (S101b) — contrasting case (Offer emits because seller is still honestly grounded).
- "Schema Quality Over Presence" (2026-03-02) — 18-point partial-vs-no penalty is the underlying citation evidence.
- Nightly URL resolver (Sprint 2 scope) — documented recovery path.

**Status:** Decided — implements concurrent with the post-Sprint-1 offers emission refactor; validator scoping update lands in same change; Deliberately Deferred Register entry added to `current-infrastructure-v2.md` in same commit.

---

## 2026-05-12 — Combinatorial URL Consolidation: Narrowest-Surviving-Hub Rule + Rolling Eviction at 28 Days

**Context:** Dev Planner's 2026-05-12 memo flagged three execution-level ambiguities in the 2026-05-11 Q3 ruling on subgenre/time-variant consolidation: (a) dominant-intent rule for `/<type>/<genre>/<time>` patterns when `/<genre>` is sub-threshold; (b) point-in-time vs rolling hub-maintenance model; (c) canonical 18-hub list source. The 2026-05-11 framing of "default to type-hub" was imprecise — it collapsed two distinct cases (sub-threshold genre, surviving genre) under one rule, and the maintenance-model language conflated entry threshold (5 events) with render threshold. Resolved as batch before the audit classifier (Dev Planner's S-CON-1) can be made deterministic.

**Decision:**

1. **Narrowest-surviving-hub rule.** Signal precedence: `genre > type > price > time`. For each combinatorial URL, the classifier routes to the narrowest surviving hub that honors the dominant signal present in the URL; type-hub default applies only when no narrower surviving hub exists. 410 Gone categorically rejected — citation-equity preservation across Tier A training crawl ingestion dominates the value of letting individual URLs die cleanly. Single-hop only; audit must verify no chains and no loops in the resulting `_redirects`.

2. **Rolling eviction at 28 consecutive daily builds** below the ≥3-upcoming-events-in-next-30-days threshold. Three states: HEALTHY (≥3 events, 200, normal render), SOFT_FALLBACK (<3 events, eviction_counter < 28, 200 with reduced-inventory framing — never 302), EVICTED (eviction_counter ≥ 28, permanent 301 to parent, removed from `sitemap-editorial.xml`, appended to `_redirects`). Eviction is one-way; reinstatement requires a new strategic decision. Eviction emits to two surfaces: `_redirects` (the 301) and the S110 coverage manifest (URL marked `evicted` rather than `orphan`). The manifest distinguishes legitimate eviction from silent emitter failure. Implementation must ship both writes atomically; an eviction visible in `_redirects` but absent from the manifest is itself a bug. S110 inherits the `evicted` classification when its URL-surface dimension is specced.

3. **18-hub list canonical** in decisions-log entries 2026-02-19 "Consolidate Combinatorial Pages to Hub Architecture" (revised) and 2026-02-20 "Finalized 18-Hub Taxonomy". Audit classifier reads from these as authoritative; no prerequisite consolidation session required. `/jazz` inclusion gated by one-line data check against events table at audit time — if ≥3 jazz events/week threshold not met, surviving-hub set is 17 and `/concert/jazz` routes to `/concerts` per the narrowest-surviving rule. Whether the list is lifted into a typed config file (`src/config/hubs.ts` or equivalent) during this work stream is execution judgment, not a strategy gate.

**Threshold reconciliation.** The Feb 19 "5-event minimum, 302 to parent when below" is retired by this decision. One operational threshold governs hub maintenance: ≥3 upcoming events in the next 30 days, evaluated at each daily build. The Tier 3 inclusion gate for `/jazz` (≥3 jazz events/week consistently) is unchanged — that is the pre-launch entry bar, not the ongoing maintenance bar, and the two should not be conflated again.

**Reasoning:** Tier A training crawl dominance (~89% of AI bot traffic per Cloudflare Q1 2026) makes URL stability decisive over inventory responsiveness. Point-in-time 302 produces citation-unreliable URLs that flap between 200 and 302 on weekly cycles, and confuses Google's canonical model. The 28-day window covers Athens cultural seasonality (four weekly cycles, summer/winter shoulder dips for `/cinema` and `/classical-music`) while still clearing genuinely dead hubs. The narrowest-surviving rule preserves the strongest signal the URL carries; type-hub fallback captures the most durable signal when genre cannot be honored. Time-hub fallback was specifically rejected because temporal hubs are content-rolling — a 301 from `/concert/rebetiko/this-weekend` to `/this-weekend` produces semantic incoherence in training data where the rebetiko-concert reference points at content that varies week to week. The atomic two-surface emission contract for eviction is the structural fix that prevents the S110 manifest from confusing legitimate disappearance with silent regression; without atomicity, a build crash mid-eviction could produce exactly the asymmetric state the manifest is meant to detect.

**Implementation:** Audit classifier (Dev Planner S-CON-1) and implementation (S-CON-2). Queued post-I/O, behind Sprint 1 closure. Eviction-counter persistence shape (column on hub config vs new `hub_eviction_state` table) is execution judgment. Typed-hub-config lift evaluated against session context budget at S-CON-1 plan-write time.

**Validation:** Audit classifier output verified deterministic for the ~1,171 combinatorial URLs in current `dist/`. No chains, no loops, no 410s in resulting `_redirects`. Post-deployment, sample 20 redirects across all four signal-precedence branches and confirm single-hop behavior in Bing Webmaster Tools and Google Search Console URL inspection. Eviction-counter logic verified against a simulated inventory drought across one of the at-risk Tier 2/3 hubs (`/jazz`, `/comedy` seasonal lull, `/classical-music` summer pause). Eviction atomicity verified by a build-crash simulation: forced failure between `_redirects` write and manifest write must roll back both, not leave one. S110 coverage manifest entry for the URL-surface dimension recognizes the `evicted` classification when S110 ships.

**Replicability:** All three sub-decisions SPEC-universal. Signal-precedence rule (`genre > type > price > time`), eviction-window value (28 days), single-threshold maintenance model (≥3 events / 30 days), atomic two-surface emission contract, and hub-list-canonicality shape transfer to agent-barcelona and agent-berlin identically. Per-city DATA: the surviving-hub set (`/greek-music` swaps to `/flamenco` for Barcelona, `/electronic-music` or equivalent for Berlin), per-city ticket-source classifier config, per-city seasonality patterns that determine which hubs hit soft fallback when.

**Connects to:**
- "Consolidate Combinatorial Pages to Hub Architecture" (2026-02-19) — the 5-event minimum is retired by this decision; the consolidation strategy is unchanged
- "Finalized 18-Hub Taxonomy with Competitor Gap Analysis" (2026-02-20) — canonical hub list lives here
- "Emission-Validator Coverage Manifest as Build Invariant" (2026-05-04) — atomic two-surface emission contract: eviction emits to both `_redirects` and the S110 manifest with `evicted` classification; S110 inherits this when its URL-surface dimension ships; asymmetric state (one surface written, the other not) is itself a bug
- "Unclassifiable-Merchant Ticket Sources: Omit Offer (Classifier as Single Emission Gate)" (2026-05-11) — same batch closure for Sprint 1 ratification cycle; separate concern

**Status:** Decided. Awaiting Dev Planner S-CON-1 session plan, queued post-I/O and post-Sprint-1-closure.

---

## 2026-05-14 — A0 Hard-Stop Calibration: Substitution-Ladder Deference

**Context:** Sub-problem A from the 2026-05-14 A0 calibration audit identified 4/10 representative inspections where a hard-stop fired alongside a substitution ladder that had already produced clean output (no fabrication, careful fallback wording, unreliable field omitted). All 4 events would render correctly if published. The hard-stop suppression is redundant with the substitution ladder's safety work. Audit anchors: HEB SED, Santouri, Mayans, NBZ. Concern types involved: `entity-resolution-uncertain` and `ticket-merchant-unverified`. Full-cohort entity-resolution + ticket-merchant population is 22 events; full-population FP rate unknown but trajectory suggests significant share. Planner recommended Option 1 (sub-problem A rule-side fix) with Option 3 fallback if cross-project coordination slips past T-10.

**Decision:**

1. **Hard-stop semantics: last-resort, not defense-in-depth.** When the substitution ladder produces structured signal that it fired and handled the concern cleanly, the hard-stop defers and the event publishes. Applies to `entity-resolution-uncertain` and `ticket-merchant-unverified` only — sub-problem B concerns (`date-conflict-or-unparseable`, `venue-mismatch-or-unknown` for non-sub-location cases) continue to fire as before because those catch real upstream data corruption.

2. **Telemetry: append-only JSONL at exemption chokepoint.** `logs/hardstop-would-have-fired.jsonl` fires one record per exempted event per build. Matches the existing `banned-phrase-matches.csv` pattern (decoupled from data model, maximally reversible, queryable). Provides post-deploy signal for the future FP-rate-among-firings warning (separate decision; see "S110f Calibration Metric: FP-Rate-Among-Firings").

3. **Implementation requires cross-project coordination.** Substitution ladder is implicit (lives in agent brief template, Enrichment Writer scope), not a code module. Structured `substitution_applied` + `substitution_summary` fields require coordinated change: Enrichment Writer updates brief template to emit fields in `temp-descriptions/concerns.jsonl`; Dev Planner adds ingest, schema, exemption gate, and JSONL telemetry. Cross-project contract spec (GEO Strategist) defines field shape before either sub-session starts.

4. **Text-extract-at-ingest alternative rejected on rubric grounds.** Same brittleness as the branch-(i) text-prefix coupling rejected for the exemption mechanism. Per-city regex maintenance is not SPEC-universal; agent-barcelona's brief template phrasing emits its own structured fields cleanly.

5. **Slip-gate: completed-by-T-10 or abort to Option 3.** If both sub-sessions (Dev Planner + Enrichment Writer) have not landed and verified by EOD May 19, abort to deferred-execution posture. Brief drafts ship as scoped specs for post-Παναθήναια execution; demo story shifts to "audit complete, fixes scoped, cross-project execution post-demo." Cornerstone polish takes precedence in the May 19 → May 29 window.

**Reasoning:**

*On last-resort semantics:* A0 hard-stops exist to protect Tier A training data and Tier B/C citation accuracy from corrupt signal. When the substitution ladder produces output with no fabrication, careful fallback wording, and omitted unreliable fields, that output does not damage Tier A — it's honest discovery-layer behavior (event + venue + date known; ticket vendor not verified, so omitted). Suppressing it costs a citation surface and an inventory data point for zero protective benefit. The 4 audited events would render correctly if published; n=4 is directional rather than conclusive, but the reversibility of the rule-side exemption combined with telemetry monitoring is the correct shape for the confidence level. Aligns with 2026-04-16 phantom penalty precedent — gates that fire when the system already handled the issue elsewhere measure the wrong thing.

*On JSONL telemetry over event_concerns extension:* JSONL is a runtime artifact decoupled from the data model. Adding an `exempted_at_build_ts` tier to event_concerns would tightly couple telemetry to schema migrations and complicate the future FP-rate-among-firings computation. Append-only JSONL is queryable, auditable, and skippable; if the exemption ever needs to revert, the JSONL becomes the record of what would-have-happened during the exemption window.

*On cross-project coordination over single-stream text-extraction:* The single-stream alternative (save-batch.ts extracts substitution_summary from concern_text prose via regex) is faster — one Dev Planner session vs. two parallel sub-sessions. It is also brittle: agent prompt phrasing drift silently regresses the extraction; per-city regex maintenance is not SPEC-universal. The rubric established for the exemption mechanism (structured signal over text-prefix coupling) applies equally to the write-time decision. Accepting Option 2 here would mean the rubric was discipline-flexible, which has downstream implications for the future FP-rate-among-firings warning spec and for agent-barcelona/agent-berlin replicability.

*On slip-gate over open-ended optimism:* Cross-project sub-session coordination has historically taken longer than per-session estimates suggest; the T-14 to T-12 estimate has buffer but compounding small slips can exhaust it. Demo-window protection is the structural priority — both Option 1 ship and Option 3 defer produce credible demo stories; the deciding factor is execution risk against cornerstone polish, not narrative. Hard gate at T-10 forces the decision rather than letting drift collapse cornerstone work.

**Implementation:**

*Contract spec (artifact below):*

Surface: `temp-descriptions/concerns.jsonl` — line-delimited JSON, one record per concern emitted by the agent brief.

New fields added to each concern record:

| Field | Type | Required | Null semantics |
|---|---|---|---|
| `substitution_applied` | boolean | Required | If the substitution ladder did not fire for this concern, emit `false`. Never omit. |
| `substitution_summary` | string \| null | Required when `substitution_applied=true`; null otherwise | Concise human-readable summary of what the ladder did (≤200 chars). Examples: `"ticket merchant omitted — unverified URL"`, `"venue resolved via fallback — registered sub-location applied"`. Null is the only acceptable value when `substitution_applied=false`. |

Ingest contract (save-batch.ts):
- Both fields must be present in incoming JSON; missing field → ingest fails loudly (not silently defaults). Forces brief-template compliance.
- `substitution_applied=true` with `substitution_summary=null` → ingest fails. Forces meaningful pairing.
- `substitution_applied=false` with non-null `substitution_summary` → ingest warns but accepts (defensive; agent may overemit; not a correctness violation).

Database shape (migration 013):
- `event_concerns.substitution_applied` INTEGER NOT NULL DEFAULT 0 (boolean-as-int per SQLite convention)
- `event_concerns.substitution_summary` TEXT NULL
- CHECK constraint: `(substitution_applied = 0 AND substitution_summary IS NULL) OR (substitution_applied = 1 AND substitution_summary IS NOT NULL)`

Exemption gate (getHardStopExcludeIds chokepoint):
- Exemption applies when `substitution_applied=1` AND `concern_type IN ('entity-resolution-uncertain', 'ticket-merchant-unverified')`
- Other concern types NOT exempted — sub-problem B catches via current rules; sub-problem C handled structurally in Component B
- Telemetry JSONL fires at exemption decision point (one record per exempted event per build)

JSONL telemetry shape (`logs/hardstop-would-have-fired.jsonl`):

```
{
  "build_ts": "2026-05-20T03:14:22Z",
  "event_id": "...",
  "rule": "entity-resolution-uncertain",
  "concern_text": "...",
  "substitution_summary": "..."
}
```

Example concern record (post-contract):

```json
{"event_id":"...","concern_type":"ticket-merchant-unverified","concern_text":"...","substitution_applied":true,"substitution_summary":"ticket merchant omitted — URL not in classifier registry"}
```

*Sub-session sequencing:*

1. Contract spec lands (this entry)
2. Migration 013 (schema add) runs
3. Backfill script runs (see Anchor backfill protocol below)
4. Dev Planner sub-session: ingest validation + exemption gate + JSONL telemetry
5. Enrichment Writer sub-session: brief template update
6. Verify both sub-sessions independently
7. Deploy

Steps 3 and 5 do not interact. Backfill corrects historical rows that brief-template-going-forward cannot reach. New emissions post-step-5 carry fields organically; backfilled rows already carry them. Single coherent state at deploy.

**Anchor backfill protocol.** Audit-identified historical anchors (4 events at Athens audit time: HEB SED, Santouri, Mayans, NBZ) receive structured exemption via post-migration script (`scripts/backfill-a0-audit-anchors-2026-05-14.ts`), not via natural re-enrichment cycle. Backfill is one-time data correction:

```sql
UPDATE event_concerns
SET substitution_applied = 1,
    substitution_summary = '[verbatim from audit per-rep inspection]'
WHERE event_id IN (...)
  AND concern_type IN ('entity-resolution-uncertain', 'ticket-merchant-unverified');
```

Lives in `scripts/`, not in migration file (schema files SPEC-universal; data corrections per-city). Backfilled rows do NOT emit JSONL telemetry (one-time correction ≠ runtime exemption; future FP-rate-among-firings warning computes against runtime exemptions only). Pattern transfers to agent-barcelona/agent-berlin: each city's audit produces its own dated backfill script.

**Validation:**

Pre-deploy:
- Contract spec verified by both sub-sessions before either commits (field names, types, CHECK constraint shape)
- Migration 013 runs cleanly on production database snapshot
- Backfill script runs against migration 013 schema; 4 anchor rows verified updated; row count matches expected
- Ingest validation unit tests: missing field fails loudly; `applied=true + summary=null` fails; `applied=false + summary≠null` warns
- Exemption gate unit tests: `applied=1 + matching concern_type` exempts; `applied=1 + non-matching concern_type` does NOT exempt; `applied=0` does NOT exempt regardless of concern_type
- JSONL emits one record per exempted event per build, schema validated against documented shape
- Schema.org Validator and Google Rich Results Test clean on the 4 anchor events post-exemption

Post-deploy (first 14 days):
- The 4 anchor events appear in production dist/ and render with substitution-ladder fallback content
- JSONL log accumulates exemption records (expected: runtime exemptions from new agent emissions; backfilled rows do NOT emit)
- Spot-check: 4–12 events from the full-cohort entity-resolution + ticket-merchant population (22 events total) become exempted as natural re-enrichment cycles complete
- No regression in Sub-problem B catches (date-conflict and venue-mismatch hard-stops continue firing on real data corruption)

Post-deploy (30+ days):
- JSONL log provides denominator for future FP-rate-among-firings warning computation
- If JSONL surfaces exempted events that render with materially wrong content (rather than honest field-omission), the rule-side exemption is revisited or scoped narrower

**Replicability:**

SPEC universal. Last-resort hard-stop semantics, substitution-ladder-deference principle, JSONL telemetry pattern, contract-spec field shape (`substitution_applied` + `substitution_summary`), ingest validation rules, CHECK constraint, exemption-gate concern_type scoping, sub-session sequencing pattern, slip-gate discipline — all city-agnostic. The cross-project coordination hinge (GEO Strategist drafts contract spec before parallel sub-sessions) is itself a SPEC-universal coordination pattern.

DATA per-city. Each city's agent brief template emits its own `substitution_summary` phrasing in its own language. Each city's audit produces its own dated backfill script naming city-specific event_ids. The 22-event full-cohort count is Athens-specific; agent-barcelona and agent-berlin will surface their own cohort sizes at their respective audit moments.

**Connects to:**
- 2026-04-16 "Quality Gate Suppression" — same precedent (gates that fire when the system already handled the issue measure the wrong thing)
- Future entry "S110f Calibration Metric: FP-Rate-Among-Firings" — JSONL telemetry from this decision provides the denominator
- Future entry "Sub-Location Handling Scoped Into Component B" — handles sub-problem C structurally; Verdi-class FPs resolve via venue registry + `containedInPlace` rather than rule exemption
- Sub-problem B (upstream scraper/normalizer data quality) — explicitly out of scope; correct hard-stop catches preserved

**Status:** Decided — contract spec v0 above; sub-session sequencing locked; T-10 slip-gate active; backfill protocol documented.

## 2026-05-18 — Sprint 3 Scope: Organizer Minimal Emission via Venue-as-Organizer; Performer Stays Sprint 4

**Context:** S137 GSC triage surfaced both `performer` and `organizer` as currently un-emitted with non-trivial implementation costs. The 2026-04-28 "Build HTML+JSON-LD Foundation" decision committed both to Sprint 3; the 2026-02-20 `performer sameAs` decision separately scoped performer to Sprint 4 behind Wikidata SPARQL infrastructure. Reconciliation needed before Sprint 3 brief is written.

**Decision:**
1. **Organizer in Sprint 3 (minimal).** When `venue_id` resolves to a Component-B-eligible venue (sameAs populated, Tier 1 priority venues first: Megaron, Onassis Stegi, Benaki), emit `organizer: {"@id": "<venue-canonical-url>"}` referencing the inline-materialized Place/Organization dual-type entity in the page's `@graph`. When venue is not Component-B-eligible or organizer signal is unreliable, omit `organizer` entirely. No new DB column; no scraper change; mapper extension only.
2. **Performer stays Sprint 4** with full Wikidata SPARQL helper, `performers` JSON array DB column, and scraper extraction. Partial performer emission without `sameAs` would land in the 18-point partial-schema penalty zone rather than the 46%/42% impressions/clicks lift documented in the 2026-02-20 entry.

**Reasoning:** The discriminator between Sprint 3 and Sprint 4 inclusion is DB schema cost and emission completeness. Organizer for venue-hosted events piggybacks on Component B at zero marginal DB cost — the same `@id` already serves `location`, `offers.seller`, and now `organizer`. Performer needs the full sameAs treatment to move citations; half-shipping is structurally worse than not shipping.

**Implementation:**
1. Extend the event-emission mapper to add `organizer: {"@id": "<venue-canonical-url>"}` when venue's Component B sameAs array is populated.
2. Omit `organizer` when not eligible. No fallback to bare name string.
3. Validator extension: see paired 2026-05-18 validator coverage decision (`organizer` → RECOMMENDED).
4. Coverage manifest: register `organizer` as `validated:partial` (RECOMMENDED, not blocking).

**Validation:** Schema.org Validator and Google Rich Results Test parse Megaron/Onassis/Benaki events with the new `organizer` reference. Build-time validator confirms `organizer.@id` resolves to an entity in the same page's `@graph` envelope (orphan-reference check, parallel to existing `seller.@id` rule). 3-month: Bing AI Performance citation rate on Tier 1 venue events vs. non-Tier-1.

**Replicability:** SPEC universal — "venue-as-organizer fallback when venue entity is Component-B-eligible; omit otherwise; no DB schema change in this step." DATA per-city — Tier 1 venue list per city (Athens: Megaron/Onassis/Benaki; Barcelona: Liceu/MACBA equivalents; Berlin: Philharmonie/Volksbühne equivalents).

**Connects to:** 2026-04-28 "Canonical Entity Graph" (dual-type Place/Organization pattern). 2026-02-20 "performer sameAs Links" (Sprint 4 commitment preserved). 2026-05-04 "Emission-Validator Coverage Manifest" (forces paired validator rule).

**Status:** Decided — Sprint 3 envelope.

## 2026-05-18 — Offer.validFrom Omission Stands: GSC Warning is Cosmetic, Not Penalty

**Context:** S134 (2026-05-11 closure) removed `validFrom` from the Offer emission shape on semantic-correctness grounds — no reliable upstream signal for "tickets-on-sale timestamp" exists, and proxying with `createdAt` would broadcast false on-sale dates into Tier A training data. The 2026-04-28 Offers Implementation Spec had originally mandated `validFrom` as FAIL-blocking. Sprint 1 closeout deferred it; current state omits. GSC is now flagging "Missing validFrom" on all Offer-emitting URLs. Question: cosmetic GSC warning, or real rich-result/citation penalty triggering S134 reconsideration.

**Decision:** Cosmetic. Hold the S134 omission. `validFrom` remains omitted from Offer emission.

**Reasoning:** Three converging signals confirm cosmetic-not-blocking status:
1. Google's official Event documentation places `validFrom` in example markup but not in the required-properties list; pages without it pass Rich Results Test as eligible.
2. GSC's rich-result reporting separates errors (blocking) from warnings (partial markup). "Missing validFrom" is a warning. Pages remain eligible for the Event rich result.
3. The semantic argument from S134 is unchanged: omission beats systematic misinformation. The discovery-layer authority strategy chooses honest omission with cosmetic warning over `createdAt` proxy with no warning but false data in training crawls.

**Implementation:**
1. No code changes. Current omission stands.
2. **Operational caveat:** baseline the validFrom warning count post-Sprint 1 closure. Monitor for *deltas* against baseline rather than absolute count. Spikes alongside other anomalies warrant investigation of the other anomalies; isolated validFrom drift is ignorable.
3. Add to Deliberately Deferred Register in `current-infrastructure-v2.md`. Reactivation trigger: merchant feed exposes structured on-sale timestamp (e.g., webtics.megaron.gr publishing it in a parseable form). Per-source enrichment, not universal proxy.
4. Validator rule re-scoping from 2026-05-11 closure remains correct: `validFrom` was already dropped from the FAIL list for Offer-property checks. No further validator change needed.

**Validation:** Quarterly review — confirm Rich Results Test continues to validate Offer-emitting URLs as eligible. Confirm Bing AI Performance citation rate on with-ticket events is not degraded relative to baseline. Confirm no Google policy update has elevated `validFrom` from recommended to required for the Event rich result.

**Replicability:** SPEC universal — "omit `validFrom` rather than proxy with `createdAt`; cosmetic GSC warning is the cost of semantic correctness; reactivation gated on structured upstream signal." DATA per-city — none. Pattern transfers cleanly.

**Connects to:** S134 (2026-05-11 closure) — this decision reaffirms the closure. 2026-05-04 "Postponement Infrastructure" — same dormancy pattern (deliberately deferred, reactivation-trigger-gated). 2026-05-11 "Unclassifiable-Merchant Ticket Sources" — same principle (silence beats false signal in Tier A training data).

**Status:** Decided — omission stands; baseline-and-monitor operational protocol; Deliberately Deferred Register entry added.

## 2026-05-18 — Validator Coverage Extension: organizer RECOMMENDED, offers.url INFO→RECOMMENDED, Both with Sprint 3

**Context:** S137 GSC triage proposed two `schema-validator.ts` extensions: (1) add `organizer` at RECOMMENDED severity to close the S101a-B-pattern blind spot opened by Sprint 3 organizer emission; (2) promote `offers.url` from INFO to RECOMMENDED so local validation surfaces what GSC surfaces. Question: ride with Sprint 3 envelope, or one-line drive-by in a maintenance batch.

**Decision:** Both ride with Sprint 3 envelope.

**Reasoning:**
1. **`organizer` RECOMMENDED is not optional.** The 2026-05-04 S110 coverage manifest established as build-time invariant: every emission surface must have declared validation status. When Sprint 3 ships organizer emission (per paired 2026-05-18 Sprint 3 scope decision), the validator MUST cover it in the same change set or the build fails the manifest invariant. RECOMMENDED is the correct severity because organizer emission is conditional on venue-as-organizer eligibility — absence is legitimately a "not-eligible" state, not a defect.
2. **`offers.url` INFO→RECOMMENDED closes the local-vs-GSC feedback gap.** Today the validator doesn't surface what GSC will flag; the gap is invisible until production and 2-3 weeks of GSC indexing. Promotion costs ~1 LOC, severity stays non-blocking, no risk of false-positive build failures.
3. **Batch with Sprint 3 over separate maintenance pass.** Context-switching cost dominates one-line change cost. Both extensions travel with whatever ships next; Sprint 3 is the next ship.

**Implementation:**
1. In `src/utils/schema-validator.ts`, add `organizer` to the recommended-fields registry. Severity: RECOMMENDED (non-blocking).
2. Add orphan-reference check: when `organizer` is present as `{"@id": "..."}`, the `@id` must resolve to an entity in the same page's `@graph` envelope. Parallel to existing `seller.@id` orphan check.
3. Promote `offers.url` from INFO to RECOMMENDED in the same registry.
4. Update the S110 coverage manifest to mark `organizer` as `validated:partial` and `offers.url` validation as `validated:partial` (was `not-validated:low-risk`).

**Validation:** Post-deployment, sample 10 Tier 1 venue events (Megaron/Onassis/Benaki) and confirm validator emits RECOMMENDED-level signal when `organizer` is absent and PASS when present. Confirm coverage manifest reflects updated status. Confirm full build passes with new rules active.

**Replicability:** SPEC universal — validator rules are city-agnostic; apply identically to all city replicas. DATA per-city — none.

**Connects to:** Paired 2026-05-18 Sprint 3 scope decision (organizer minimal emission). 2026-05-04 "Emission-Validator Coverage Manifest as Build Invariant" (forcing coupling between emission and validation surfaces). 2026-05-11 "Unclassifiable-Merchant Ticket Sources" (Offer-property validator scope from which this extends).

**Status:** Decided — Sprint 3 envelope; landed in same change set as organizer emission and any other Sprint 3 validator extensions.

## 2026-05-20 — CollectionPage ListItem Offer: Omit on Unknown-Price-Paid; Couple Validator to Both Surfaces (S139)

**Context:** validator.schema.org gate on the completed @graph envelope (homepage + today.html) returned 4 errors each, localized to CollectionPage. Root cause: the CollectionPage nested-ListItem Offer-builder — a separate, older code path that never received S134's classifier-gated treatment — emits Offers with `priceCurrency` + `availability` but no `price` for paid events with unknown amount. Free events (`price:"0"`) and paid-known events (`price:"N"`) are already valid. The event-page Offer path (S134-gated) is clean; only the sibling ListItem path is affected. The build-time validator's emitted-Offer-shape FAIL rule covers the event-page surface but not the ListItem surface — a silent emission/validation-scope drift, same failure class as the 11,217-microdata incident that motivated S110.

**Decision:**
1. **Shape (binding):** unknown-price-paid ListItem emits no Offer; nested event node's `isAccessibleForFree: false` carries the ticketing signal. Identical outcome to the S134 event-page path. Never `price:"0"` for paid events.
2. **Validation coupling (ships with the fix, non-negotiable):** extend the build-time emitted-Offer-shape FAIL rule to the CollectionPage ListItem surface; register that surface in the S110 Coverage Manifest. This class of defect must fail the internal build, not an external gate.
3. **Code path:** default to unifying the ListItem path onto the shared classifier-gated Offer-builder (option b) IF repo verification confirms a single shared builder the ListItem path can call (call-site change, not net-new logic). Otherwise ship the local omit-guard (option a) to clear the gate, and schedule physical unification as a Sprint 2.5/3 follow-up. Decision rule resolved by Dev Planner against actual `generate-site.ts` code, not the knowledge base.

**Reasoning:** Omission is forced by three locked precedents — Unclassifiable-Merchant Option B (omit whole Offer when no valid Offer is producible; `isAccessibleForFree` carries the signal), partial-schema penalty operating at envelope level (an invalid Offer risks the whole CollectionPage's citation posture; omission leaves it clean), and omit-beats-fabricate / silence-beats-false-signal in Tier A. The (a)-vs-(b) tension dissolves once the validator coupling (decision 2) is in place: it asserts both surfaces share one emitted-Offer policy as a build invariant, so (a) no longer leaves drift intact and (b) becomes a clean-code nicety rather than a correctness necessity.

**Implementation:**
1. ListItem Offer emission: when event is `isAccessibleForFree:false` and no price/priceSpecification is available, emit no `offers` block on the ListItem event node. Retain `isAccessibleForFree:false`.
2. Build-time validator: emitted-Offer-shape FAIL rule (`price` OR `priceSpecification` required on any emitted Offer) now applies to the CollectionPage ListItem surface, not only the event-page surface. Add regression assertion that the rule catches the pre-fix price-less state.
3. Coverage Manifest (S110): register CollectionPage nested-ListItem Offer as a validated surface.
4. Path consolidation per decision 3 above.

**Validation:** validator.schema.org gate on homepage + today.html @graph returns 0 errors. Build-time validator FAILs on any price-less ListItem Offer (verify against pre-fix state). Spot-check: unknown-price-paid nested events emit no Offer but retain `isAccessibleForFree:false`; free (`price:"0"`) and paid-known nested events unchanged. Google Rich Results Test parses both pages cleanly.

**Replicability:** Fully replicable. SPEC universal — "ListItem Offer emission obeys the same omit-when-no-valid-Offer policy as the event-page path; both surfaces covered by one build-time emitted-Offer-shape rule and registered in the Coverage Manifest." DATA per-city — each city's classifier merchant list (already per-city). No Athens hardcoding.

**Connects to:** 2026-05-11 "Unclassifiable-Merchant Ticket Sources: Omit Offer" (same omit shape, different trigger axis). 2026-05-04 "Emission-Validator Coverage Manifest" (this is the drift failure mode S110 guards against; decision 2 closes it). 2026-05-18 "Offer.validFrom Omission Stands" (omit-beats-fabricate). "Schema Quality Over Presence" (18-pt penalty at envelope level).

**Status:** Decided — shape + validator coupling ship in the S139 fix; path-consolidation branch resolved by Dev Planner repo verification. Unblocks deploy-gate, S141, S142.

## 2026-05-20 — `/this-weekend` Cornerstone Answer-Capsule Override (First Per-Cornerstone Divergence from Generic Capsule Template)

**Context:** GEO's 2026-05-20 literal-match ruling identified the exact string "Athens events this weekend" front-loaded across four on-page slots (title, H1, meta description, answer-capsule first sentence) as the single highest-leverage on-page lever for Perplexity's literal-match retrieval — non-negotiable for the demo, `/this-weekend` indexed at T-4. Locking the Dev patch surfaced that the generic 40–60w answer-capsule template ("Athens hosts over {count}…", per 2026-02-20 Hub Page Editorial Template) buries the literal string at word 4+ and breaks "this weekend" adjacency, so it cannot serve this cornerstone unchanged. Three architectural questions required resolution before Dev could take the patch: the full capsule wrapper shape (not just locked S1), the H1 form (pure string vs. country-disambiguated), and a terminology-rule check against the sitewide "open" (not "free") constraint that the demo is judged on. This is the first cornerstone to diverge from the generic capsule template; the divergence is referenced by every future city's demo setup.

**Decision:**

1. **Per-cornerstone capsule override (binding for `/this-weekend`, 60–80w):** This cornerstone overrides the generic 40–60w answer-capsule template. S1 is the locked front-loaded literal match: *"Athens events this weekend span {count} cultural events across {category_summary}, {date_range} — from {example_1} to {example_2}."* S2 is dynamic with TWO picks-conditional branches — empty-picks branch ("…covers {open_count} open events and {with_ticket_count} with-ticket events across {venue_count} venues in {city_descriptor}, refreshed daily…") and populated-picks branch ("…with editor's picks flagging the weekend's standout highlights"). The literal string occupies S1 word 1 in every branch.

2. **Empty-picks branch is the default render for the demo (binding).** Per the 2026-05-08 schema-only-ship decision, the first weekend runs in empty-picks state. The populated branch references editorial picks that do not yet exist; rendering it as default would put false copy on the page being judged. Dev ships the empty branch as default; the populated branch activates only on picks-presence (same conditional gate as the Position 1.5 Picks ItemList).

3. **H1 ruling — pure `Athens Events This Weekend`, no "in Greece."** The H1's sole job is the exact-string match, strongest when "this weekend" sits in the first three words. The disambiguation rule (2026-02-20 Athens-Greece multi-layer disambiguation) binds title + meta description, NOT H1; the country signal is carried in the title, meta, and schema `addressCountry: "GR"`. H1 stays clean.

4. **Terminology sweep — "open" not "free" across all four slots (binding).** The sitewide Tier-1 term is "open" (URLs `/open`, Schema, filter chips, page titles). Any "free" in title/H1/meta/capsule violates the terminology rule the demo is judged on. Capsule uses "open-entry exhibitions" / "open events" and the `{open_count}` token. Editorial sweeps all four slots, not only the capsule.

5. **Token sourcing from the S110f-eligible weekend set (binding):** `{count}` = COUNT eligible; `{open_count}` = COUNT where `isAccessibleForFree`; `{with_ticket_count}` = `{count} − {open_count}`; `{category_summary}` = top 2–3 categories by count joined "X, Y and Z"; `{venue_count}` = distinct venues; `{example_1/2}` = two events chosen deterministically from the eligible set (highest schema-completeness, tie-break earliest start) — NOT from picks (which may be empty); `{date_range}` = weekend Sat–Sun, localized; `{city_descriptor}` = config value (`"central Athens"`), never hardcoded.

6. **Degradation rules:** `{open_count}=0` → drop open clause (and vice versa); `{count}<2` → drop "from … to …" tail; `{count}=0` → fall to Article IX empty-page capsule. All branches retain the literal string in S1 word 1.

**Reasoning:** Evidence on Perplexity's retrieval (March 2026 GEO sources) confirms the mechanism is header-as-query-mirror plus a direct-answer block in the opening sentence, with the primary keyword at the very start of the title — not a string merely present somewhere in each slot. Front-loading is the operative variable; a buried match weakens. The generic capsule's "Athens hosts over {count}…" opener is therefore disqualifying for a cornerstone whose entire demo thesis is literal-match retrieval. H1-pure over H1-disambiguated because the two rules (literal match, country disambiguation) collide only in title + meta, where both can be satisfied simultaneously; H1 is unconstrained by disambiguation and should spend its full budget on the match. Empty-picks-default because the partial-schema/false-copy posture (Schema Quality Over Presence; 2026-05-08 empty-render-beats-thin-block) extends to capsule prose — claiming picks that don't exist is a false signal on the highest-scrutiny surface. Terminology sweep because the demo is explicitly judged on the "open"/"with-ticket" terminology rule; a single "free" in a GEO-optimized slot would fail the page on its own constraint.

**Implementation:** Dev takes this as an isolated template/content patch on the `/this-weekend` cornerstone capsule renderer — no schema overlap (the dual-ItemList schema work is separate). Capsule renderer branches on picks-presence (reuse the existing Position 1.5 conditional gate). Token resolution joins the S110f-eligible event set (single source of truth shared with the comparison table). Resolved copy specifics (final S1 examples, exact category/venue phrasing) fold into a follow-on locked-copy entry once Editorial's four slots return; this entry locks the architecture independent of copy iteration.

**Validation:** Rendered `/this-weekend` (empty-picks state) capsule opens with literal string "Athens events this weekend" in S1 word 1; capsule is 60–80w; S2 renders the empty branch (no picks reference). Perplexity literal-match fires (GEO confirmation pass on Editorial's locked copy). No "free" string in any of the four slots (grep gate). Pure `Athens Events This Weekend` H1 present. Token degradation paths verified at `{count}=0`, `{open_count}=0`, `{count}=1`. Page indexed by T-4 (Bing Webmaster Tools).

**Replicability:** Fully replicable. SPEC universal — "the weekend cornerstone overrides the generic capsule with a front-loaded literal-match S1 (`[City] events this weekend span …`), picks-conditional S2 with empty-default, pure-string H1, and a terminology sweep enforcing the city's sitewide pricing terms across all four GEO slots." This is the first per-cornerstone capsule divergence and the reference pattern for every future city's demo setup (agent-barcelona: "Barcelona events this weekend"; H1 pure; "(Spain)" disambiguation in title/meta only). DATA per-city — city name, region signal, `{city_descriptor}` config value, and the local-language literal string (validated against that language's query data, never a translation of the EN string). No Athens hardcoding.

**Connects to:** 2026-02-20 "Hub Page Editorial Template" (the generic 40–60w capsule this overrides). 2026-05-08 "Cornerstone Schema First Cornerstone" (empty-picks-state default; shared Position 1.5 conditional gate; S110f-eligible set as single source of truth). 2026-02-20 "Athens-Greece multi-layer disambiguation" (title/meta country signal; why H1 is exempt). "Schema Quality Over Presence" / omit-beats-fabricate (empty-picks-default rationale). Sitewide "open"/"with-ticket" terminology rule (Constitution Article — terminology sweep). Greek-page equivalent is a separate Editorial draft + GEO confirmation cycle, gated on the bilingual infrastructure subset — follows, does not block, the EN demo.

**Status:** Decided — architecture locked 2026-05-20; H1-pure, capsule override template, empty-picks-default, and terminology sweep are binding for the Dev patch. Resolved-copy specifics fold into a follow-on locked-copy entry on Editorial return.

## 2026-05-20 — Event.location Inline-With-`@id` (Required Fields Materialize Inline; Optional Stay Bare-Ref); S138 §2.4 v2; S142 Ungated

**Context:** GSC URL Inspection on a freshly-crawled (20 May 19:52, post-S139) `/en/` SNFCC event returned "invalid items not eligible for rich results"; critical error `Missing field "location"`. The invalid item: an Event whose `location` was a bare same-`@graph` `@id` reference. validator.schema.org showed 0 errors on identical markup. Confirmed: Google's Events rich-result parser does not resolve same-page `@id` for the required `location` field — valid Schema.org, not rich-result-eligible. S138 §2.4's bare-`@id` `location` lost eligibility on every event page.

**Decision:**
1. `Event.location` → inline-with-`@id`: emit inline `@id` + `@type` + `name` + full `PostalAddress` (`addressCountry`/`addressLocality`/`addressRegion`), retaining the canonical venue node (same `@id`) as a top-level `@graph` member.
2. Minimal inline set — name + address only; `geo`/`sameAs`/rich data stay on the canonical node and reach graph consumers via `@id` merge; inlining them is redundant.
3. General rule: rich-result-required nested properties materialize inline-with-`@id`; optional properties may stay bare-`@id`.
4. `organizer` stays bare-`@id`; S142 unblocked, ships unchanged — optional field, unresolved `@id` is non-critical (validFrom-class), and for venue-hosted events restates the inline location relationship. Inline-organizer hardening deferred to 6-month Threat-B trigger.
5. Build inline `location.address` and canonical `address` from one source field (identical-by-construction; avoids ambiguous merge).
6. Fold in the `addressRegion: "Attica"` fix at this surface.

**Reasoning:** Required vs optional sit on opposite sides of the eligibility line — only the required field is eligibility-critical, so only it is forced inline. Inline name+address is the exact eligibility-required surface; `@id` merge carries everything else without duplication. Minimal-inline avoids a second emission site for geo (drift surface, zero gain). Removes dependency on undocumented `@graph`-sibling `@id` resolution for the most eligibility-critical field, on Tier-1 venues. Consistent with 2026-04-28 materialize-and-reference and fragility-avoidance discipline.

**Implementation:** Mapper: `Event.location` → inline object per above; `organizer` unchanged (bare-`@id`, S142). Validator (S110): new rule — required nested fields (`location.name`, `location.address`) must be inline-present on the Event node, not merely `@id`-resolvable; closes the literal-vs-graph drift that let this pass internally. Coverage manifest updated. `addressRegion` emits "Attica".

**Validation:** Post-deploy GSC URL Inspection on Megaron/Onassis/Benaki/SNFCC `/en/` events → Events-eligible, no `Missing field "location"`. validator.schema.org still 0 errors; confirm node-merge preserves `sameAs`/`geo` from canonical node. Build validator FAILs on bare-`@id` required fields (regression assert). `addressRegion` = "Attica".

**Replicability:** SPEC universal — "rich-result-required nested Event properties inline-with-`@id`; optional may stay bare-ref; minimal inline = eligibility-required set only." DATA per-city — venue corpus, `addressRegion` (Attica/Barcelonès/Berlin), `addressCountry` (GR/ES/DE). No Athens hardcoding.

**Connects to:** 2026-04-28 Canonical Entity Graph (materialize-and-reference). S138 §2.4 (this is its v2). 2026-05-18 validFrom Cosmetic + Sprint 3 Organizer/S142. S110 Coverage Manifest (drift class) — note: this is the **second** Coverage Manifest update dated 2026-05-20; the same-day S139 CollectionPage entry registers the ListItem Offer surface, this entry adds the required-nested-field inline rule. Both land in one day; manifest provenance is the two entries jointly. Component B `addressRegion` fix.

**Status:** Decided — 2026-05-20. Append-only entry, logged after the same-day S139 CollectionPage and `/this-weekend` cornerstone entries (causal order: S139 clears the deploy gate → this ruling confirms S142 ships bare-`@id` organizer unchanged).

## 2026-05-21 — /en/ Self-Canonical + Indexable; noindex+Cross-Locale-Canonical Was a Regression; Ratify Greek-Root+English-/en/ (Supersedes May-8 "No /en/"); Lifecycle-Aware Indexability Guard

**Context:** S143 envelope verified correct via live-curl, but GSC rich-result eligibility (a Tier-B verification surface) was unverifiable: the `/en/` event page shipped `noindex` + canonical → non-`/en/` root. Decision D (2026-05-20, Event.location Inline) had run GSC URL Inspection on a freshly-crawled `/en/` SNFCC event at 19:52 May 20 and received a *field-level* verdict (`Missing field "location"`) — a verdict only producible on an indexable, self-canonical page (a `noindex`/cross-canonical page returns "Excluded by 'noindex'" / "Alternate page with proper canonical tag" with no eligibility check). The `noindex`+cross-canonical state therefore post-dates May 20 and is a regression, almost certainly from S143. Phase-1 verification (per brief-verification rule) curled the bare-root and found **case (d): real dormant Greek** content — not stub, 404, or duplicate-English.

**Decision:**
1. `/en/` event pages in **Active** / **Just-passed (Day 1–14)** phases are self-canonical and indexable. Remove `noindex`; canonical → self (the `/en/` URL).
2. Bare-root = real dormant Greek. Leave untouched, dormant, and **out of the sitemap**. (Case (d) adopted; do not 301, do not activate.)
3. Sitemap = `/en/` URLs only. **No hreflang.** Trigger refined: hreflang is gated on a *published, indexable, quality-gated* Greek locale — not "Greek bytes exist." Dormant Greek (whether `noindex` or pre-review) does not qualify.
4. hreflang `el↔en` + `x-default → /en/` + Greek URLs entering the sitemap reactivate **together**, gated on the Greek root locale becoming self-canonical/indexable AND passing its tiered translation-quality review. Not before, not piecemeal.
5. Ratify Greek-root + English-`/en/` as the operative architecture. This **supersedes the 2026-05-08 "no `/en/` URL" deferral**, which has been overtaken by live, crawled `/en/` pages.
6. Build-time indexability guard, **lifecycle-phase-aware** (reconciled with 45-Day Event Lifecycle):
   - **noindex guard:** assert `index` + self-canonical ONLY for Active + Just-passed (Day 1–14) events. **Cooling (Day 15–44) is exempt** — `noindex` is expected there and Event schema is removed. Archive (Day 45+) = 410, no page to check.
   - **cross-locale-canonical guard:** universal across all live (non-410) phases — no page may declare a canonical to a different-locale URL. Cooling `/en/` events stay self-canonical to `/en/` while `noindex` (not root).
   - The guard's phase predicate MUST read the same `endDate`/`eventStatus` lifecycle state machine that drives the lifecycle `noindex` — single source of truth, no parallel rule, or the two drift and fight on edge dates.
7. Past `/en/` events being `noindex` = 45-Day Lifecycle Cooling phase = **intentional freshness policy, NOT the regression.** Do not force past events indexable.

**Reasoning:** English is the primary and only enrichment locale; the content and the S143 envelope live on `/en/`. `noindex` deletes that page from the search index, killing Tier B (~8% of AI-bot traffic, the search-index-routed citation path) and the GSC verification workflow D depends on; canonical-to-dormant-root consolidates the only real content's signal onto a non-promoted locale. Keeping English self-canonical at `/en/` is also the Tier-A-stable choice: when Greek activates at root, no English URL moves (Tier A wins per the three-tier framework — the 89.4% compounding mass dominates). Tearing `/en/` down to root now would force a full English→`/en/` migration at Greek launch — a double migration, worst for Tier A. hreflang to dormant Greek yields an inconsistent cluster (if Greek is `noindex`, Google drops/errors the whole set, losing the signal on the `/en/` side too) or prematurely surfaces un-quality-gated content — the same "incorrect hreflang is worse than none" failure as the May-8 exclusion, in a new mode. Lifecycle `noindex` on past events is deliberate crawl-budget/freshness policy; the guard must not fight a locked decision.

**Implementation:**
1. `/en/` Active + Just-passed: remove `noindex`, set canonical → self.
2. Bare-root dormant Greek: untouched, kept out of sitemap.
3. Sitemap: self-canonical `/en/` URLs only, correct `lastmod`; no hreflang. (Use the English-only sitemap shape, NOT the fully-activated bilingual template.)
4. Build invariant per Decision 6 (phase-keyed noindex guard + universal cross-locale-canonical guard, both reading the lifecycle state machine).
5. Re-run D's validation, impossible under the regression: GSC URL Inspection on Megaron/Onassis/Benaki/SNFCC `/en/` events → must return an Events-eligibility verdict (not a `noindex` exclusion).
6. **Open confirm before patch lands:** the phase of the originally-reported `/en/` page. Active/upcoming → genuine regression (force index+self-canonical). Past/cooling → `noindex` was lifecycle-correct and only the cross-locale canonical was the bug (self-canonical to `/en/`).

**Validation:** curl shows Active/just-passed `/en/` events self-canonical + indexable; bare-root dormant Greek absent from sitemap; GSC URL Inspection returns a rich-result verdict (not "Excluded by noindex"); build FAILs on `noindex` of an Active/Just-passed event and on `noindex`+cross-locale-canonical in any live phase; build does NOT fail on Cooling-phase `noindex`.

**Replicability:** SPEC universal — "secondary launch locale self-canonical at `/en/`; bare-root reserved for the primary locale (dormant until published + quality-gated); hreflang + x-default + sitemap-merge activate together only on primary-locale publication; indexability guard is phase-keyed to the shared lifecycle state machine." DATA per-city via existing `primaryLanguage`/`secondaryLanguage`/`primaryPath`/`secondaryPath` config; `addressRegion`/`addressCountry` per city. Barcelona = `/en/` + es-root, Berlin = `/en/` + de-root, identical. No Athens hardcoding.

**Connects to:** 2026-05-08 "Bilingual Infrastructure Subset" (supersedes its "no `/en/` URL" clause; `inLanguage`/`availableLanguage`/`<html lang>`/`localeUrl` scope unchanged; hreflang + sitemap-split deferral remains consistent — they activate per Decision 4). 2026-02-19 "Bilingual Content Strategy" (ratifies Greek-root + English-`/en/`). 2026-02-20 "x-default Changed to English" (`x-default → /en/` reactivates with hreflang on Greek publication). 2026-02-20 "45-Day Event Lifecycle" (Cooling-phase `noindex` is intentional; guard phase predicate reads its state machine). 2026-05-20 "Event.location Inline" (its GSC validation workflow depends on this fix). S110 Coverage Manifest (registers the new phase-keyed indexability invariant). `feedback_verify_paths_in_briefs.md` (Phase-1 bare-root curl before remediation — verified case (d), not assumed).

**Status:** Decided — 2026-05-21. Append-only entry; consolidates the initial ruling and the same-day refinement after Phase-1 confirmed case (d). Regression fix; rides next deploy. Blocked only on phase-confirmation of the originally-reported page before the patch lands.

---

## 2026-05-21 — /proof: AI-Citation Section Dropped Pending First-Party Data (D1)

**Context:** The `/proof` page (CV-as-a-page, credibility evidence; demo May 29) was specced to include an AI-citation section. No `data/ai-citations.csv` exists and no pipeline logs AI engine mentions. Dev Planner asked GEO to either drop the section until tracking exists, or authorize a tracking artifact and define what counts as a citation.

**Decision:** Drop the AI-citation section entirely from the May 29 `/proof` build. Do not authorize a hand-rolled tracking artifact. Reactivation trigger: Bing AI Performance shows ≥1 grounding query citing an agent-athens URL (the existing Sprint 5 "first grounding query detected" milestone). "What counts as a citation" is deferred to that point — it is a measurement decision belonging with live first-party data, not demo copy.

**Reasoning:** A hand-rolled `data/ai-citations.csv` would be a parallel, lower-trust measurement layer that contradicts the established KPI reframe (citation impressions, primary surface Bing AI Performance — see 2026-02-19 "GEO Measurement Stack" and the citation-as-visibility KPI entry). More fundamentally, the page's entire job is credibility; an unverifiable or fabricated citation count on that surface is self-defeating. The same logic that makes partial schema carry an 18-point penalty versus none applies to credibility claims — an unsubstantiated number is worse than its absence. Lead the credibility argument with what is real and verifiable (indexing, schema coverage, freshness cadence).

**Implementation:**
1. Omit the AI-citation section from the May 29 `/proof` build entirely — no empty container, no placeholder.
2. Reactivation: ship the section only after Bing AI Performance registers ≥1 grounding query citing an agent-athens URL.
3. At reactivation, define the citation-counting rule against live Bing data before any number is displayed.

**Validation:** Pre-deploy — grep confirms no AI-citation section, placeholder, or empty container in rendered `/proof` HTML. Reactivation gate — section ships only when the Sprint 5 grounding-query milestone fires.

**Replicability:** Universal. No city instance displays AI-citation evidence on its `/proof` surface until that city's Bing AI Performance produces a real grounding-query citation. City-agnostic.

**Connects to:** 2026-02-19 "GEO Measurement Stack"; citation-as-visibility KPI reframe; 2026-04-16 "Schema Quality Over Presence" (omit-beats-fabricate rationale); 2026-05-21 "Data-Source-Priority on Credibility Surfaces" (sibling principle).

**Status:** Decided — as-built into May 29 `/proof` build briefs.

---

## 2026-05-21 — /proof: Indexing Messaging Anchored to Bing, GSC Data-Layer Only (D2)

**Context:** `/proof` needs an indexing-status subsection. `gsc_indexed` is STALE 4 days; the last real value is `gsc_indexed=7` (2026-05-08, two weeks old) — which reads worse than current reality. Options were (a) "indexing underway" framing + cite Bing 7d only, (b) quote the stale GSC 7, (c) defer the indexing subsection entirely.

**Decision:** Option (a). Present indexing as "indexing underway; live coverage tracked via Bing." Display Bing 7-day figures only: 21 impressions, average position 9.76, 2 results in the top 10. The GSC value stays in the data layer for internal trend tracking and is never displayed. Do not editorialize the dashboard lag (no "refresh pending" excuse-framing); state verifiable facts and let Bing carry the weight.

**Reasoning:** A two-week-old `gsc_indexed=7` undersells reality, and a stale number on a credibility surface reads as neglect — the opposite of the page's purpose. The Bing 7d figures are honest, recent, and a genuinely strong story for a new domain: average position 9.76 with top-10 presence. This keeps an indexing subsection (not deferral, option c) but anchors it to the freshest defensible first-party source rather than quoting a stale number (rejecting option b).

**Implementation:**
1. Render indexing subsection with copy: "indexing underway; live coverage tracked via Bing."
2. Display Bing 7d metrics: 21 impressions, avg position 9.76, 2 top-10 results.
3. `gsc_indexed` remains data-layer only — internal trend tracking, never surfaced on `/proof`.
4. No dashboard-lag editorializing in displayed copy.

**Validation:** Pre-deploy — rendered `/proof` shows Bing 7d figures and no GSC value; displayed Bing numbers match the live source within freshness window. Post-deploy — indexing subsection figures refresh from Bing on rebuild, not from a frozen snapshot.

**Replicability:** The specific values (21 / 9.76 / 2) are Athens-and-moment-specific. The displayed-source-selection rule is city-agnostic and is captured separately — see 2026-05-21 "Data-Source-Priority on Credibility Surfaces."

**Connects to:** 2026-05-21 "Data-Source-Priority on Credibility Surfaces" (general rule extracted from this decision); 2026-02-19 "GEO Measurement Stack" (Bing AI Performance / WMT as primary surface).

**Status:** Decided — as-built into May 29 `/proof` build briefs.

---

## 2026-05-21 — /proof: Schema.org Type = WebPage + mainEntity:Dataset (D3)

**Context:** `/proof`'s own Schema.org type was undecided among WebPage / TechArticle / Report / Dataset (or WebPage+mainEntity:Dataset). Citability-driven call.

**Decision:** Emit `WebPage` as the top-level node with `mainEntity` pointing to a `Dataset` node (`@id` pattern `[canonical]#proof-data`). `variableMeasured` entries on the Dataset cover each metric class rendered (indexing coverage, schema coverage, freshness cadence) and are bidirectionally matched to displayed values — no metric in schema that isn't on the page, and no displayed metric absent from schema. `creator` references the agent-athens Organization node via `@id`. `dateModified` is content-hash-driven, consistent with the freshness architecture.

**Reasoning:** The page is genuinely a webpage (reviewers read it; AI crawls it as a page) whose *primary entity* is a structured body of evidence — metrics, coverage stats, freshness data. That is a `Dataset`, a type AI engines treat as a citable factual source rather than narrative prose. Rejected alternatives: `TechArticle` implies how-to/documentation and invites wrong grounding-query matches; `Report` is not well-supported for rich results and gives no AI-parsing advantage over the pair; bare `WebPage` underspecifies the evidentiary payload and loses the signal that the page contains extractable structured facts. Required nested fields materialize inline-with-`@id` per the 2026-05-20 rule.

**Implementation:**
1. Top-level `WebPage` node; `mainEntity` → `Dataset` (`@id`: `[canonical]#proof-data`).
2. Dataset carries `name`, `description`, `dateModified` (content-hash-driven), `creator` (Organization via `@id`), and `variableMeasured` per metric class shown.
3. Bidirectional match: every `variableMeasured` value == rendered value; every rendered metric has a `variableMeasured` entry.
4. Apply 2026-05-20 inline-with-`@id` rule to any rich-result-required nested properties.

**Validation:** Pre-deploy — validator.schema.org clean; Google Rich Results Test passes; automated check confirms `variableMeasured` ↔ rendered-value parity (fail build on mismatch). `dateModified` advances only when `/proof` content hash changes.

**Replicability:** Universal. Every city's `/proof` uses WebPage + mainEntity:Dataset with the same `@id` pattern and the same variableMeasured↔rendered parity invariant. Metric values are per-city; structure is city-agnostic.

**Connects to:** 2026-05-20 "Event.location Inline-With-`@id`" (nested-required-field rule); freshness / content-hash architecture; canonical Organization entity node.

**Status:** Decided — as-built into May 29 `/proof` build briefs.

---

## 2026-05-21 — /proof: EN-Primary, EN-Only Generation for Demo; hreflang Decoupled from availableLanguage (D4)

**Context:** `/proof`'s audience (AI agents, reviewers) skews EN, against the about-page precedent of EL-primary + EN-secondary. Locale options were EL+EN / EN-only / EN-primary. EN-only would break the bilingual moat pillar and the constitutional bilingual commitment; the page exists to prove the site's standards, so it should not ship without the bilingual posture. Follow-on: for the 8-day gap before the EL page ships, generate a thin EL "coming soon" stub (credibility risk) or let hreflang/availableLanguage point at an EL URL that 404s (crawler-signal risk)?

**Decision:** EN-primary. For May 29, generate EN only: `inLanguage: "en"`, `availableLanguage: ["en","el"]`. **Decouple hreflang from availableLanguage** — emit NO `<link rel="alternate" hreflang="el">` and NO `dist/el/proof/` until the real EL page ships. `availableLanguage` states site capability (honest — the site serves both) and carries no URL, so no 404 risk. The locale-aware URL helper is wired (structurally bilingual-ready) with no EL target to resolve yet. EL follows on the standard bilingual cycle (Editorial draft → GEO confirm), gated on the bilingual infrastructure subset — committed, not deferred. Reactivate the bidirectional `en`↔`el` hreflang pair in the same patch that ships the real EL page.

**Reasoning:** EN leads because the audience skews EN (justifies reversing the about-page EL-primary precedent; also a Growth touch). EN-only generation is rejected as a permanent posture — it contradicts the moat pillar the page exists to demonstrate — but EN-first *sequencing* for the demo is fine. On the 8-day gap: the two offered options both eat real cost; a third path eats nothing. Hreflang-to-404 is the worst harm — a 404 in an hreflang cluster can make Google distrust the whole cluster, and that distrust outlasts the gap; durable downside for a negligible 8-day benefit on a near-zero-crawl-history page. A thin stub costs Editorial time and places a sub-standard page on the credibility surface for an audience unlikely to navigate to `/el/proof/` in the window. No-hreflang EN loses only the hreflang signal for 8 days — nothing on a new page — and hreflang does its real work once a genuine EL counterpart exists.

**Implementation:**
1. `/en/proof/` ships. `inLanguage: "en"`, `availableLanguage: ["en","el"]`.
2. No `<link rel="alternate" hreflang="el">`; no `dist/el/proof/` generated.
3. Locale-aware URL helper wired; no EL target resolves yet.
4. EL page authored on the bilingual cycle; logged as committed-not-deferred (do NOT enter the Deliberately Deferred Register).
5. Reactivation: emit bidirectional `en`↔`el` hreflang pair in the same patch as the live EL page.

**Validation:** Pre-deploy — rendered `/en/proof/` has `inLanguage:"en"` and `availableLanguage:["en","el"]`, and contains no hreflang-`el` link; `/el/proof/` does not exist (no 404-able alternate emitted). Post-EL-ship — both pages emit the reciprocal hreflang pair; cluster validates with no dangling/404 alternate.

**Replicability:** Universal pattern. Each city's `/proof` ships in its EN/agent-skewed primary, declares `availableLanguage` for committed locales, and withholds hreflang until each per-locale URL is live. Per-city: which locale is "primary," which secondary. The hreflang/availableLanguage separability rule is extracted separately — see 2026-05-21 "Hreflang / availableLanguage Separability."

**Connects to:** 2026-05-21 "Hreflang / availableLanguage Separability" (general rule extracted from this decision); about-page EL-primary precedent (deliberately reversed here); bilingual infrastructure subset scope; Deliberately Deferred Register (explicitly NOT entered — EL is committed).

**Status:** Decided — as-built into May 29 `/proof` build briefs.

---

## 2026-05-21 — Data-Source-Priority on Credibility Surfaces (Cross-City Rule)

**Context:** Extracted from D2 (`/proof` indexing messaging). A credibility surface displayed a metric from a source (GSC) whose freshest available value was two weeks stale and read worse than current reality, while a fresher first-party source (Bing) carried a stronger, honest signal.

**Decision:** On any credibility surface (`/proof` and equivalents), never display a number staler than a defined freshness threshold N. Prefer the freshest first-party source. Stale metrics stay in the data layer for internal trend tracking; they are not surfaced. Do not editorialize source lag in displayed copy — state verifiable current facts.

**Reasoning:** A credibility surface's value is its trustworthiness; a stale number on it reads as neglect and can undersell reality, inverting the surface's purpose. The penalty for displaying a weak/stale figure can exceed the penalty for omitting it. Source selection should optimize for freshness and first-party verifiability, not for coverage completeness across every available dashboard.

**Implementation:**
1. Define N per metric class (default: do not display first-party metrics older than the source's own reporting window, e.g. Bing 7d).
2. Rank sources by freshness × first-party-ness; display the top-ranked live source.
3. Keep staler sources data-layer only for trend tracking.
4. No lag-editorializing in displayed copy.

**Validation:** Audit each credibility surface: every displayed metric resolves to a live source within N; no displayed value exceeds its freshness threshold.

**Replicability:** Fully city-agnostic. Thresholds and source rankings are config-driven per metric class; no city-specific hardcoding.

**Cross-referenced from:** 2026-05-21 "/proof: Indexing Messaging Anchored to Bing" (D2).

**Status:** Decided — standing rule.

---

## 2026-05-21 — Hreflang / availableLanguage Separability (Cross-City Rule)

**Context:** Extracted from D4 follow-on. A bilingual-committed page needed to ship in one locale ahead of its counterpart, raising the question of how to represent the not-yet-live locale without incurring crawler-signal harm (hreflang-to-404) or credibility harm (thin stub).

**Decision:** Treat `hreflang` and `availableLanguage` as separable. `availableLanguage` is a Schema.org capability statement (no URL) and may declare committed locales ahead of their per-locale URLs going live. `hreflang` is a URL-level pointer and must NEVER be emitted to a non-live URL. Emit the reciprocal hreflang pair only when both per-locale URLs are live, in the same patch that ships the second locale.

**Reasoning:** The two properties make different claims. `availableLanguage` honestly states that the site serves a language; `hreflang` asserts a specific alternate URL exists. A 404 in an hreflang cluster can degrade Google's trust in the entire cluster, and that damage outlasts the gap it was meant to bridge — durable downside for a transient benefit. Capability can lead; URL pointers must follow live URLs. This also avoids manufacturing a thin-stub credibility risk to solve a crawler risk the separation eliminates outright.

**Implementation:**
1. `availableLanguage` lists all committed locales from day one.
2. No `hreflang` alternate to any URL that is not live (no 404-able alternates).
3. Reactivate reciprocal `hreflang` pairs in the same patch that ships each new per-locale URL.
4. Locale-aware URL helper may be wired ahead of live targets (structurally ready), but emits hreflang only for resolvable URLs.

**Validation:** No rendered page emits an hreflang alternate to a non-200 URL. `availableLanguage` may exceed the set of live hreflang-linked locales; the reverse (hreflang to a missing locale) fails the check.

**Replicability:** Fully city-agnostic. Applies to every multi-locale page in every city instance; locale identities are per-city, the separability rule is universal.

**Cross-referenced from:** 2026-05-21 "/proof: EN-Primary, EN-Only Generation for Demo" (D4).

**Status:** Decided — standing rule.

---

## 2026-05-22 — /proof: Evidence Set Frozen for Demo; .ics Conditional Fast-Follow (D5)

**Context:** /proof is live with three grounded metric classes (Bing indexing, schema coverage, freshness cadence) per D2/D3; AI-citation section dropped per D1; GSC excluded per D2 until fresh. Question: add more credible metrics, or is the set sufficient for the May 29 demo? Candidates: source-count (needs grounding artifact), enrichment coverage %, freshness cadence (already approved per D3), .ics coverage.

**Decision:** Current set is sufficient for May 29. Ship as-is; no new metric is a demo blocker.
- freshness cadence: already approved (D3) — confirm rendered + parity-valid; not a new addition.
- source-count: REJECT. Needs a grounding artifact = the D1 anti-pattern (parallel lower-trust measurement layer). Reactivation: only if it reduces to a pure build-time count from existing config/SQLite with no separate artifact AND reads as a strength.
- enrichment coverage %: DEFER. Build-native but currently undersells; surfacing it spotlights the one citability axis deliberately allowed to lag (Constraint 3) on the credibility surface. Reactivation: site-wide coverage crosses a defined strength threshold, OR reframed as Tier-1-category-scoped once strong. "What counts as enriched" defined at that trigger, not in demo copy.
- .ics coverage: CONDITIONAL FAST-FOLLOW, not a demo blocker. Add only if .ics is emitted universally (100% by construction, enrichment-independent) — then it's a clean strength + AI-Mode actionability signal. If partial/enrichment-dependent, defer on the enrichment undersell logic. Dev Planner confirms universality before any wiring.

**Reasoning:** The page's value is trustworthiness; its strength is maximized when every displayed number is itself a strength, not merely true. Three build-native, first-party, currently-strong metrics aligned to the citability equation (structured data × freshness) beat a longer mixed-strength list. The D1 "unsubstantiated number worse than absence" logic and the Data-Source-Priority "weak/stale figure penalty exceeds omission penalty" rule both bear directly. Each addition also incurs the D3 variableMeasured↔rendered parity cost, raising the bar any new metric must clear.

**Implementation:**
1. No new metric sections in the May 29 build beyond the three approved classes.
2. Confirm freshness cadence is rendered and parity-valid (D3 invariant).
3. Dev Planner: report whether .ics is universal-by-construction; if yes, scope as post-demo fast-follow with its own variableMeasured entry; if no, defer.
4. Log enrichment-% and source-count reactivation triggers (above).

**Validation:** Pre-deploy — rendered /proof shows exactly the three approved metric classes, no placeholder for deferred candidates; every displayed value resolves to a live build-native or first-party source within its freshness threshold (Data-Source-Priority rule). Each rendered metric has a matching variableMeasured entry and vice versa.

**Replicability:** Universal. Rule — surface only build-native, first-party, currently-strong metrics; defer anything that undersells or requires a separate artifact — is city-agnostic. Values per-city; gate identical. .ics coverage and freshness cadence are structural.

**Connects to:** 2026-05-21 "/proof: AI-Citation Section Dropped Pending First-Party Data" (D1); 2026-05-21 "Data-Source-Priority on Credibility Surfaces"; 2026-05-21 "/proof: Schema.org Type = WebPage + mainEntity:Dataset" (D3, parity invariant); 2026-04-16 "Schema Quality Over Presence" (completeness/penalty logic); 2026-02-19 dual-surface .ics actionability call; Constitution Constraint 3 (enrichment non-gating).

**Status:** Decided — for May 29 /proof build.

---

## 2026-05-22 — /proof: Freshness Cadence Is a Missing Metric Class, Wire Pre-Demo (D5 follow-on)

**Context:** Deployed /proof renders the data-metric keys (eventCount, schemaPassClean, 3× Bing) but freshness cadence is NOT a tagged metric. D5 called it load-bearing and a D3-approved variableMeasured class requiring "confirmed rendered + parity-valid." Question: is it already satisfied by schemaPassClean.validatedAt + daily-rebuild prose (no-op), or genuinely missing and needing a pre-demo wire (freshnessCadence key + variableMeasured + data-metric tag)?

**Decision:** Genuinely missing. Wire it pre-demo. (a) rejected, (b) adopted.
- validatedAt is recency (one timestamp), not cadence (a rate) — different metric, not a weak proxy.
- Daily-rebuild prose feeds Channel B (raw tokenization) only; the page was typed WebPage+mainEntity:Dataset (D3) precisely to make evidence structured-extractable for Channel A. Freshness is our strongest new-domain signal; prose-only leaves it in the channel the page was architected not to rely on.
- D3 already lists freshness cadence as a variableMeasured class distinct from the node's content-hash-driven dateModified housekeeping field. The designed metric is the one absent.

**Implementation:**
1. Add freshnessCadence as a rendered data-metric key AND a Dataset variableMeasured entry in the same change (D3 parity invariant; fail-on-mismatch must pass).
2. Source the value from build/deploy metadata the system already keeps (.content-hashes.json history; events-sitemap daily lastmod). Express as observed cadence, not a hardcoded "daily" string. If a stretch isn't provably daily, state actual observed cadence — verifiable facts only (Data-Source-Priority rule).
3. Retain the daily-rebuild prose as the Channel B complement (not redundant).
4. This is the single add; does NOT reopen the D5 freeze on enrichment %, source-count, or .ics.

**Reasoning:** Build cadence is a first-party, self-evident fact the build knows about itself — NOT the D1/source-count anti-pattern (a parallel lower-trust artifact). Closing the gap is trivial effort, infrastructure-level (auto-refreshes every build, no per-event work), and structures our single best citability signal. Effort-vs-impact strongly favors the wire over leaving the strongest differentiator prose-only on a Dataset-typed credibility surface.

**Validation:** Pre-deploy — rendered /proof shows a freshnessCadence value tag; Dataset variableMeasured contains a matching freshnessCadence entry; build-time parity check passes; displayed value resolves to live build metadata within its freshness threshold. Distinguish freshnessCadence (rate) from dateModified (recency) — both present, not conflated.

**Replicability:** Universal. Cadence sourced from build/deploy + content-hash manifest is shared infrastructure; only the observed value is per-city.

**Connects to:** 2026-05-22 "/proof: Evidence Set Frozen for Demo" (D5, parent); 2026-05-21 "/proof: Schema.org Type = WebPage + mainEntity:Dataset" (D3, parity invariant + the missing class); 2026-02-20 "Content-Hash Freshness Architecture" (sourcing); dual-channel schema mechanism (Channel A vs B); 2026-05-21 "/proof: AI-Citation Section Dropped" (D1, the anti-pattern this is NOT).

**Status:** Decided — pre-demo wire for May 29 /proof build.

---

## 2026-05-22 — Empty-Slug Venue @id Collision (venueEntity:297): Config Slug Field + Build Invariant; Pre-Demo, Not Sprint 4

**Context:** `slugify('Μέγαρο Μουσικής Αθηνών') === ''` — slugify strips non-Latin
scripts, producing empty slugs for all 172 Greek-named venues. Each emits
`@id = /venues//#venue`; all collide on one empty-slug node (Megaron 32ev, GNO
3ev, Technopolis 8ev share identity). Pre-existing (venueEntity:297), surfaced by
S142's organizer-@id work. JSON-LD `@id` collision = entity merge: graph consumers
treat the venues as one node with conflicting name/geo/address/sameAs.
hreflang/`<html lang>`/`inLanguage` operate on the language-variant layer and
cannot disambiguate entity identity. Primary harm is moat failure (Component B
sameAs entity-graph cannot form on a colliding node), not a ranking penalty.

**Decision:**
1. **Pre-demo, not Sprint 4.** Tier-A stability protects URLs crawlers learned as
   good; a colliding/empty URL is corrupt, not stable. Fixing before the demo
   amplifies crawl is stabilization; deferring forces a later live-URL migration
   (worst Tier-A outcome) and risks Tier-A ingesting broken URLs first.
2. **Mechanism = explicit `slug` field on `config/athens-venues.json`** (same file/
   pattern as Component B inline sameAs). Tier-1 venues get curated, permanent,
   English-readable slugs; one locale-independent slug per venue → one canonical
   locale-independent venue `@id` (the `/en/` prefix carries language, the slug
   carries identity).
3. **Transliteration is fallback-only** for un-curated long-tail venues — general
   script-aware local library (zero API cost), never the primary path. Hardcoded
   Greek→Latin maps rejected (not SPEC-universal).
4. **Build invariant (S110-class): FAIL on any empty venue slug or any `@id`
   containing `//`.** Closes the bug class permanently; protects Barcelona/Berlin.
5. **Scope gated on diagnostic:** confirm in dist/ whether the empty slug breaks
   only the `@id` (route uses a different slug source → isolated @id patch, near-
   zero risk to S143-145 surfaces) or also the page URL/canonical/og:url/sitemap
   (→ same live-curl validation S143-145 used; still pre-demo; not bundled into
   cornerstone capsule work).

**Reasoning:** Per the 2026-05-20 inline-location finding, Event rich-result
eligibility reads inline `location.name`+`address`, not the venue `@id`; so the
collision most likely does NOT hard-block Megaron's Event eligibility, and the
corruption's real damage is to entity-graph/Knowledge-Panel identity + sameAs
resolution + containedInPlace + venue-as-organizer references. Curated slugs over
transliteration: Tier-A-locked permanence demands chosen, not auto-derived, URLs
for demo venues; decoupled from Greek-name edits. The build invariant is the
infrastructure-over-content fix — one rule corrects all 172 and prevents
recurrence, vs. per-venue content work.

**Implementation:**
1. Diagnostic first (brief-verification rule): dist/ distinct-file count for Greek
   venues; rendered canonical/og:url on Megaron `/en/`; slug source for route vs `@id`.
2. Add `slug` field to `config/athens-venues.json`; curate Tier-1
   (Megaron/Onassis/Benaki/SNFCC) with permanent English-readable values.
3. Generator: venue slug = config `slug` ?? transliterate(name); build FAILs if result empty.
4. Validator (S110 manifest): new rule — venue slug non-empty AND `@id` contains no `//`.
5. Single canonical locale-independent venue `@id` per venue across both locales.

**Validation:** GSC URL Inspection on a live Megaron `/en/` event NOW → confirm
Events-eligible (corrupted @id not blocking) vs error (demo-critical, land before
T-4). Post-fix: 0 empty venue slugs in dist/; no `@id` containing `//`; each Greek
venue resolves to a distinct stable `@id`; build FAILs on a synthetic empty-slug
venue (regression assert). Confirm Megaron/GNO/Technopolis no longer share a node.

**Replicability:** SPEC universal — "venue slug is an explicit config field;
script-aware transliteration fallback only; build FAILs on empty slug or `//` in
`@id`; one locale-independent slug→`@id` per venue." DATA per-city — each city's
venue config carries its own curated slugs (Barcelona `palau-musica`, Berlin
`philharmonie`). No transliteration-rule or Athens hardcoding.

**Connects to:** 2026-05-20 "Event.location Inline-With-@id" (why Event rich
results survive; entity-graph is the real damage surface). 2026-04-28 "Canonical
Entity Graph" (per-venue @id + sameAs — the moat this bug defeats). 2026-05-21
"/en/ Self-Canonical" (S143-145 stabilized surfaces; live-curl validation pattern).
S110 Coverage Manifest (registers the empty-slug invariant). S142 (surfacing sprint;
venue-as-organizer @id references for these 172 venues also corrupted).
Brief-verification rule (dist/ diagnostic before scoping).

**Status:** Decided — 2026-05-22. Diagnostic + GSC verification gate execution
scope and demo-criticality; fix lands pre-demo regardless of branch.

---

## 2026-05-22 — [S-capsule] {date_range} Displays True Filter Window (Fri–Sun), Not Sat–Sun

Context: token table specified {date_range} → "weekend Sat–Sun"; recon found
  filter (filters.ts:72-85, value:'this-weekend') is Fri 00:00 → Mon 00:00 —
  a 3-day window. Friday events render on the page.
Ruling: {date_range} displays true window as day names = "Friday to Sunday".
  Filter NOT narrowed. Token-table "Sat–Sun" entry corrected (was a spec bug).
Reasoning: literal-match thesis targets the string "this weekend", NOT
  "Saturday-Sunday" — Sat–Sun buys nothing on the match while misdescribing
  the page (false-copy-on-judged-page failure mode). Narrowing the filter to
  force Sat–Sun would delete real Fri-night events (Half Note, Gazarte, Pallas,
  Megaron) — negative citability. Capsule describes infrastructure, never the
  reverse.
Phrasing: day names over rolling calendar dates — stable copy, no date
  arithmetic / boundary bugs on demo path; recency already carried by
  dateModified + content-hash freshness. Rolling dates deferred behind named
  date-specific-query trigger.
Tradeoff accepted: marginally less punchy than bare "weekend"; accuracy-against-
  page outranks style.
Validation: every day named in capsule is consistent with events in the page's
  eligible set; no event renders outside the stated window.
Replicability: city-agnostic; shared filter logic, day names localize via
  bilingual pipeline.
Status: corrects the {date_range} clause of the capsule override spec; filter
  window affirmed unchanged.

---

## 2026-05-22 — [S-capsule] Capsule Example Selector: Earliest-Start, Not Schema-Completeness

Context: S1 tail "— from {example_1} to {example_2}" needs a deterministic
  2-event selector. Locked spec called for highest-schema-completeness ranking;
  recon found no Event-shaped scorer (scoreRichness operates on snake_case rows,
  renderer sees camelCase Event) — implementing it was the heaviest build item.
Ruling: earliest-start-deterministic accepted. Selector = start_date ASC →
  title alpha ASC → event_id ASC (total order, reproducible builds). Raw rows,
  no adapter. Same eligible set as rest of capsule.
Reasoning: tokens are prose-only (no JSON-LD surface) → completeness does not
  propagate to capsule citability → zero citability cost. Both rules
  non-fabricated. Severe cost asymmetry. No load-bearing second use for the
  scorer near-term.
Tradeoff accepted: may name a minor event over a marquee one; breadth-framing +
  S2 picks curation make this acceptable.
Validation: capsule prose deterministic across two builds of identical data
  (content hash stable); both example titles present in page's eligible event set.
Replicability: city-agnostic, no hardcoding.
Status: supersedes the completeness-ranking clause of the capsule override spec;
  Event-completeness scorer deferred behind named featured-ranking trigger.

---

## 2026-05-22 — [S-capsule] Country Disambiguation Is Title/Meta-Only; Capsule Keeps "central Athens"

Context: Editorial Flag 3 claimed the answer-capsule also needs country
  disambiguation, rerouting {city_descriptor} = "Athens, Greece" — colliding
  with the token-table value "central Athens". The 2026-02-20 formula bound
  disambiguation to Title + Meta only.
Ruling: disambiguation stays title/meta-only. {city_descriptor} = "central
  Athens" preserved. Flag-3 reroute rejected. No disambiguation token added to
  the capsule template.
Reasoning: disambiguation is page-level entity resolution, won once by the
  strongest signals (Title + Meta "Athens, Greece"; Event/Place schema
  addressCountry "GR" + addressRegion "Attica"; sameAs→Wikidata Athens-GR node)
  and inherited by all downstream prose. Capsule "Athens" rides the resolved
  entity — no within-page context pulls toward Georgia. Extracted snippets
  surface against an already-geo-resolved query. Capsule-bound "Athens, Greece"
  buys ~zero disambiguation, costs locality richness every render. Literal-match
  thesis ("Athens events this weekend" in S1) untouched either way.
Flag (follow-on, named): "central Athens" is a geographic claim; eligible set
  includes non-central venues (SNFCC/Kallithea, Gazarte/Gazi, Half Note/Mets).
  Verify "central" holds against the this-weekend set; if not, demote to plain
  "Athens" or config-set per-city locality term true for the whole set —
  false-copy-on-judged-page family. Queued behind demo ship.
Tradeoff accepted: a hypothetical zero-context extraction shows "Athens" without
  "Greece"; no realistic surface constructs this failure (page resolution
  precedes extraction), and the alternative costs specificity every render.
Validation: capsule emits no standalone country string; page still resolves
  Athens-GR via title/meta/schema; {city_descriptor} consistent with rendered
  venues.
Replicability: city-agnostic; disambiguation lives in title/meta formula slot,
  {city_descriptor} in capsule slot — separate per-city config, no collision.
Status: affirms the 2026-02-20 title/meta disambiguation formula; resolves
  Editorial Flag 3 against capsule-binding; "central Athens" affirmed pending
  the named locality-accuracy follow-on.

---

## 2026-05-23 — Declared Canonical Normalizes to Served (Trailing-Slash) Form; Canonical-Must-Be-200 Invariant; S144 Untouched (Orthogonal Axis)

**Context:** Demo-critical, pre-existing (not S151). The `/en/this-weekend` cornerstone has a 3-way self-canceling URL-form conflict that blocks Bing indexing → blocks the Perplexity-via-Bing path:
- **Served:** `/en/this-weekend/` → HTTP 200 (content).
- **No-slash:** `/en/this-weekend` → HTTP 301 → `/en/this-weekend/` (Netlify Pretty URLs default).
- **Declared** `<link rel=canonical>` + `sitemap-editorial.xml` + IndexNow: `/en/this-weekend` (no slash) → 301s.
- **Result:** the declared canonical points at a redirect. Bing "cannot index a redirect"; Google logs mixed-signal duplicates.

Source (pre-existing): `hub-page.ts:306` + `:535` emit a no-slash canonical. Code comments at `L302–306` read "S144 (GEO 2026-05-21) supersedes 2026-05-14 canonical-to-root posture." URL-form policy had been contested across ≥3 sessions. Recon (this entry) confirmed via decisions-log that S144 (the 2026-05-21 "/en/ Self-Canonical + Indexable" ruling) governs **which URL** the canonical targets (locale/identity axis), and is silent on trailing-slash surface form. Sitewide convention in the log's own canonical/hreflang examples is trailing-slash (`https://agent-athens.com/en/event-slug/`); the hub-page no-slash emission is the outlier.

**Decision:**
1. **Normalize the declared canonical, `sitemap-editorial.xml`, and IndexNow submission to the SERVED trailing-slash form** (`/en/this-weekend/`). The declared canonical follows the 200; it never points at a 301. **Option (a) selected.**
2. **Reject (c) re-ping no-slash** — a non-fix; re-submitting a URL whose canonical points at a redirect does not stop it pointing at the redirect.
3. **Reject (b) `_redirects` strip-slash** — fights the Netlify Pretty URLs default (fragile, ongoing maintenance), migrates every already-crawled slash URL off the form Tier-A has learned (worst Tier-A outcome), and breaks consistency with the sitewide trailing-slash canonical convention (would leave hubs no-slash and events slash).
4. **New S110-class build invariant (infrastructure-over-content):** no declared canonical, sitemap URL, or IndexNow URL may differ from its own served form — i.e., no canonical may point at a URL that 301s. Build FAILs on any emission whose declared form does not equal the resolved 200 form under the deployed redirect ruleset. Closes the redirect-canonical bug class permanently across all cities.

**Reasoning:**
- **Canonical-must-be-200 is non-negotiable.** As long as Netlify Pretty URLs is on, no-slash → slash is forced, so a no-slash canonical is structurally guaranteed to be broken. The only no-slash-preserving alternatives are disabling Pretty URLs sitewide (a far larger, riskier server-behavior change) or accepting a permanently broken canonical on a demo-critical page. Neither is acceptable.
- **S144 is an orthogonal axis; no violation.** S144 = identity/locale (`/en/` *self*-canonical, reversing the prior cross-locale "canonical → bare Greek root" consolidation). The superseded "canonical-to-root posture" meant pointing canonical at a *different URL*. Trailing-slash form is the *surface form of the same self URL*. `/en/this-weekend` → `/en/this-weekend/` stays self-referential and on `/en/`. Normalizing the slash **completes** S144's intent: S144 existed to produce a *verifiable, indexable* self-canonical for GSC/Bing rich-result verification; a self-canonical pointing at a 301 is exactly what Bing won't index, so the no-slash form actively defeats S144. The slash normalization is what makes S144 real on this page.
- **Tier-A stability favors (a), not (b).** Crawlers already resolve to the slash form (every no-slash hit 301s to slash), so Tier-A has learned slash as the live URL. (a) aligns the *declared* form with the form crawlers already hold → zero crawler migration. (b)'s "smaller declared change" hides a *larger* real-world migration: flipping the served form to no-slash moves every already-crawled URL off the learned form. The report's "(a) = larger blast radius" is true only in count of declared-URL surfaces touched; in the dimension that matters (already-crawled URL stability), (a) is the zero-migration option.
- **Consistency.** The sitewide event-page and hreflang canonical convention is trailing-slash. (a) brings the hub-page outlier into line; (b) would fork hub vs event URL form.

**Implementation:** (one Dev pass, shotgun-surgery across all URL-emission sites)
1. `hub-page.ts:306` and `:535` — emit canonical in trailing-slash form for the cornerstone (and any other hub URL emitted no-slash).
2. `sitemap-editorial.xml` generator — emit `/en/this-weekend/` (trailing-slash) `<loc>`.
3. IndexNow submission form — submit the trailing-slash URL.
4. Add the canonical-must-equal-served build invariant to `schema-validator.ts` / S110 manifest: for each emitted page, assert declared canonical == sitemap `<loc>` == IndexNow URL == the 200-resolving served form under `_redirects` + Pretty URLs. FAIL on mismatch.
5. Update the comment at `hub-page.ts:302–306` to record that trailing-slash normalization is orthogonal to (and consistent with) S144's identity-axis posture, ending the cross-session contest.
6. Re-submit `/en/this-weekend/` to Bing/IndexNow after deploy.

**Pre-execution verification (verify-against-repo rule):** before the pass, `grep` actual event-page and other-hub canonical/`og:url`/sitemap emission to confirm served vs declared forms. Log examples indicate event pages already emit trailing-slash canonicals, but project-knowledge is not the repo. If any other surface is also no-slash-declared, the same fix applies sitewide rather than hub-only — ruling unchanged, scope count adjusts.

**Validation:**
- `curl -I /en/this-weekend` → 301 → `/en/this-weekend/` (200) **and** the rendered canonical on the 200 page == `/en/this-weekend/` (self, no redirect).
- `sitemap-editorial.xml` `<loc>` for the cornerstone == `/en/this-weekend/`; IndexNow submitted form == `/en/this-weekend/`.
- Bing Webmaster Tools: URL no longer rejected as "redirect"; indexing proceeds.
- Build FAILs on a synthetic emission whose declared form 301s (invariant regression assert).
- No `og:url`/canonical/sitemap divergence remains on the page (single served form everywhere).

**Replicability:** SPEC universal — "declared canonical / sitemap / IndexNow URL always equals the served 200 form; never a URL that 301s; trailing-slash normalization is orthogonal to the locale/identity canonical axis." Netlify Pretty URLs is the deploy default for every city, so agent-barcelona and agent-berlin inherit the same forced no-slash→slash behavior and the same canonical-must-be-200 invariant. DATA per-city — none; URL forms derive from each city's served behavior, not hardcoded values.

**Connects to:** 2026-05-21 "/en/ Self-Canonical + Indexable" (S144 — identity/locale axis; this entry is the orthogonal trailing-slash axis that completes its verifiable-self-canonical intent). 2026-02-20 "x-default Changed to English" (sitewide trailing-slash canonical/hreflang convention this aligns with). 2026-05-20 "Event.location Inline" (its GSC/Bing rich-result verification depends on an indexable self-canonical — same dependency this fix restores for the hub). S110 Coverage Manifest (registers the new canonical-must-be-served invariant). Empty-slug/`//` `@id` invariant (same infrastructure-over-content bug-class-closing pattern). `feedback_verify_paths_in_briefs.md` (grep actual emission forms before the pass).

**Status:** Decided — 2026-05-23. Recon-then-rule complete; no fix written in this entry. Becomes a single Dev session touching all URL-emission sites (`hub-page.ts:306`/`:535`, sitemap generator, IndexNow form) plus the new build invariant, in one pass. Pre-execution grep gate per verify-against-repo.

---

## 2026-05-25 — location FAILs Build (Non-Zero Exit); endDate WARNs Type-Conditionally

**Context:** location is already a hard error in both validator layers but not
wired to a non-zero exit. Question: should a pageable event missing `location`/
`location.address` halt the build? And what severity for `endDate` — WARN or FAIL?

**Decision:**
1. **location → FAIL (non-zero exit).** A pageable event missing `location` or
   `location.address` breaks the build. Authorizes wiring the existing hard error
   to a build failure.
2. **endDate → WARN, never FAIL.** RECOMMENDED severity. Type-conditional
   visibility: WARN (visible) for Exhibition/Festival/multi-day types missing
   endDate; INFO/silent for single-occurrence types (Concert, single Theater).
3. **No silent skip on missing location.** If halt frequency proves non-rare, the
   response is a scraper fix or a deliberate, monitored quarantine lane (excluded
   from pageable set, logged, counted) — never a silent per-event drop.
4. **S110:** register `location` as `validated:full`/FAIL, `endDate` as
   `validated:partial`/WARN.
5. **Extension to confirm (not re-decide):** location FAIL applies to any
   rich-result-intent Event node, including ListItem-embedded (S139 both-surfaces
   coupling). Verify against actual emission sites.

**Reasoning:** location is rich-result-eligibility-critical (2026-05-20 inline rule;
GSC drops Events-eligibility on absence) AND a corruption signal — every real event
has a venue, so a missing one is a parse failure, not a legitimate state. Halting
forces source-level fix (infrastructure-over-content) and obeys S110 fail-loud /
no-silent-drift. Deploy atomicity mitigates the freshness cost: a non-zero exit
keeps the prior good deploy live, so the cost is one day of recoverable staleness,
strictly better than shipping a broken node or silently eroding coverage.
endDate is the inverse: not rich-result-required, legitimately absent on a large
single-occurrence class. FAIL would block clean events or pressure a misleading
`endDate=startDate` proxy — forbidden by attribute-rich-or-nothing / omit-beats-
fabricate. WARN mirrors organizer's "absence is not-applicable, not a defect."

**Validation:** Build FAILs on a synthetic pageable event with location stripped
(regression assert). Build PASSES with endDate stripped; emits WARN for a stripped
exhibition endDate, INFO/silent for a stripped single-concert endDate. Coverage
manifest reflects both statuses. Confirm halt count baseline post-deploy.

**Replicability:** SPEC-universal — location-as-corruption-signal and the
type-conditional endDate logic are city-agnostic. DATA per-city: none.

**Connects to:** 2026-05-20 "Event.location Inline-With-@id" (eligibility basis).
"Schema Quality Over Presence" (18-pt envelope penalty; absent vs empty distinction).
2026-05-04 S110 Coverage Manifest (fail-loud; validation-status registration).
2026-05-18 organizer RECOMMENDED (severity-as-not-applicable pattern).
2026-05-20 S139 CollectionPage (both-surfaces validator coupling).

**Status:** Decided — 2026-05-25. Authorizes Dev Planner session to wire location
to non-zero exit and add the type-conditional endDate WARN; ListItem-surface
extension gated on emission-site verification.
---
## 2026-05-25 — English-Default Language Flip (Supersedes Greek-Primary Default)
**Context:** Christos requested English-first: homepage, hubs, and event pages default to English, Greek secondary. Coverage query returned 312 visible events / 301 English (96.5%) / 1 Greek (0.3%) — the ≥95% band. The 11 English-gap events are description-less in both languages (enrichment gap, not translation gap); the lone Greek row is a legacy/test artifact under the English-only enrichment policy. Supersedes the default-language assignment in "Bilingual Content Strategy" (2026-02-19, "Greek primary (root)"); does not contradict "Greek AI Mode Acceleration" (2026-02-24) — Greek remains a deferred channel re-promotable by config once Greek enrichment ships.
**Decision:**
1. English becomes the served default. Bare root `/` 301→`/en/`. English content stays at `/en/` (no migration of Sessions 45–47 URLs). Greek migrates root→`/el/`.
2. NO cross-language canonical. Every page self-canonicals to its own served form, regardless of primary language. "English primary" is carried by x-default (done), served-default-at-root, content language, and homepage/internal-link graph — never by canonical.
3. Coverage gap (option c, reframed): emit English page always; render `description`-omitted (never Greek-substituted) where no English copy exists. Description-less events appear in listings, not prose capsules. Honest-absence upheld, not overridden.
4. Build a real English homepage at `/en/`; kill the `/en/`→`/en/today` placeholder redirect (resolves S92 deferral).
**Reasoning:** Content reality is 96.5% English; a Greek-primary root asserts authority the content doesn't back. ChatGPT/Perplexity ignore hreflang and serve x-default (already EN); Google AI Mode respects hreflang. Canonical is deduplication, not language hierarchy — cross-language canonical would deindex Greek and invalidate the cluster (confirmed current Google guidance). Keeping English at `/en/` avoids churning freshly-built URLs (Tier-A stability); only low-equity Greek migrates. `/en/` vs bare-root is a non-signal once root 301s and x-default points to `/en/`.
**Implementation spec:**
- Config: `defaultLanguage: "en"`, `secondaryLanguages: ["el"]`. Rule: root 301→`/{defaultLanguage}/`; secondaries at `/{lang}/`; x-default=`/{defaultLanguage}/`; self-canonical per page.
- One-hop 301s only (root→/en/; old Greek root→/el/). No chains, no loops.
- Build-invariant (S110-class): no declared canonical/sitemap/IndexNow/hreflang URL may point at a 301. `/en/` homepage canonical=/en/ (200); `/` never declared as a target.
- English homepage: prose surfaces gated to English-described events; listings may include description-less events; no fabricated English names.
- Interim demo toggle (option A) ships unaffected; must not cross-canonical or emit Greek-as-English.
**Validation:**
- Post-deploy: hreflang validator passes; ChatGPT/Perplexity return `/en/` URLs; Google URL Inspection confirms `/en/` indexed, `/el/` indexed independently (no "indexed under canonical" collapse).
- Redirect sweep: root→/en/ and Greek-root→/el/ resolve single-hop in GSC + Bing WMT.
- Grep: no canonical/sitemap/hreflang URL equals a 301 source. English homepage renders no description-less event in prose.
**Replicability check:** Fully replicable. `defaultLanguage`/`secondaryLanguages` config drives the whole mechanism. Barcelona: `en` default, `["es","ca"]` secondary. Berlin: `en` default, `["de"]` secondary. Every city ships English-default-at-`/en/` from day one — Athens converges to the shared pattern, no bespoke topology.
**Status:** Pending — full flip post-Παναθήναια (not demo-blocking); interim toggle (option A) cleared for May 29.
---
## 2026-05-25 — Location Build-Halt Is Node-Keyed, Not Page-Keyed (Venue-Page MusicEvent Scope)
**Context:** 39 venue pages emit MusicEvent nodes that omit `location`, relying on the parent Place/LocalBusiness address ("Place-adjacent inheritance"). Question: does the 2026-05-20 location inline-materialization halt cover these emission sites?
**Decision:** Halt applies; no venue-page exemption. The S110 rule is keyed to the **node type**, not the emission site: any node typed `Event`/Event-subtype, on any page, must carry `location.name` + `location.address` inline. Schema.org has no positional address inheritance; omission = `Missing field "location"`, strictly worse than the bare same-graph `@id` already rejected, and inside the 18-point partial-schema penalty zone. The only exemption boundary is a bare `@id` pointer (no `@type`, no properties) under `Place.event`/`ItemList` — not recommended here.
**Implementation:** Venue-page MusicEvent `location` → inline `@id`(=venue Place `@id`) + `@type` + `name` + full `PostalAddress` (GR / locality / "Attica"), address sourced from the venue's own record (single source, identical-by-construction). Venue Place node stays top-level with geo/sameAs (merged via `@id`). MusicEvent shares the canonical event `@id` (no duplicate entity). Validator: assert node-keyed scope — every typed Event-subtype node fails the halt on missing inline `location.name`/`location.address`, venue pages included.
**Validation:** GSC URL Inspection on a sample venue page → MusicEvent nodes Events-eligible, no `Missing field "location"`. Build FAILs on any venue-page MusicEvent omitting inline location (regression assert). Confirm graph-merge preserves venue geo/sameAs.
**Replicability:** Node-keyed scope is universal SPEC. Venue address is per-city DATA (`config/{city}-venues.json`). No Athens hardcoding.
**Status:** Pending — clarifies/extends 2026-05-20 Event.location Inline; scopes S110 validator coverage to all Event-subtype emission sites.
## 2026-05-25 — Microdata Strip on Hub + EDP: Ratified (f02043922)
**Context:** Commit f02043922 (live via daily pipeline) removed inline Microdata from EDP + hub templates and retired `validateMicrodata`. Ratify-or-revert call on live state ahead of 2026-05-29 demo.
**Decision:** Ratify. Microdata removal is redundant-with-JSON-LD cleanup, net-neutral-to-positive. JSON-LD is the primary AI-crawler structured-data path and the canonical emission surface; Microdata was an architected parity mirror (validator rules historically written to both surfaces in lockstep), never the sole carrier of any entity/property. No partial-schema gap created: the 18-pt penalty is envelope-level and the envelope is defined by intact JSON-LD. Google normalizes both formats into one graph (no stacking bonus lost). Removal also retires the surface responsible for the 11,217-violation incident — the project's worst structured-data drift event.
**Conditional:** Ratify is contingent on post-deploy verification that JSON-LD emits clean independent of the strip — live Rich Results on EDP + both `/this-weekend` hubs; GSC URL Inspection on one of the 54 Track-B indexed events showing field-level eligibility, not exclusion.
**Required follow-up (independent of verdict):** Update S110 Coverage Manifest — remove/retire the `microdata:validated:full` entry; the surface no longer exists, so leaving it registered violates the manifest invariant.
**Constraint honored:** No precautionary re-add — re-adding Microdata would reintroduce the drift-prone surface S110 exists to prevent.
**Replicability:** SPEC universal — single-surface JSON-LD canonical structured-data path; redundant Microdata mirror retired; emission surfaces tracked in coverage manifest. DATA per-city — none. agent-barcelona/agent-berlin inherit JSON-LD-only.
**Status:** Ratified — conditional close pending post-deploy JSON-LD verification.
---
## 2026-05-25 — Hub Title Brand Suffix Dropped Template-Wide; Over-Length Locked Copy Stands (Bing Title-Length Flag)
Context: Bing Webmaster Tools flagged /en/this-weekend/ title "too long"
  (~98 chars: ~83-char locked titleEn + template-appended " | agent-athens"
  suffix at hub-page.ts:402, vs ~60 display limit). Over-length is a soft
  display signal (truncation), not an indexing block. Decision routed to GEO:
  the locked copy is GEO's; the suffix is template-appended and not part of
  locked copy.
Ruling: drop the " | agent-athens" suffix from the hub-page title template
  (hub-page.ts:402), template-wide. Locked titleEn copy stands unchanged.
  Locked copy is NOT shortened. Resulting ~97-char title (still over Bing's
  display window) accepted — the over-length is now brand-free keyword copy.
Reasoning: this page's job is literal-match retrieval via Perplexity→Bing-index
  (2026-05-23), not Bing organic rank, so the live question is what the engine
  reads as title, not whether Bing indexes it. The 8-keyword intent and the
  front-loaded literal "Athens events this weekend" live in the first ~83 chars
  (2026-05-20 capsule override: front-loading is the operative variable). The
  suffix adds zero keyword coverage and zero disambiguation (country signal
  already carried by title/meta "Athens, Greece" + schema addressCountry "GR",
  2026-04-28) — pure brand tail on a no-equity domain, which a citation engine
  does not reward. Dropping it preserves 100% of keyword work, removes 15 inert
  chars; no tradeoff. Shortening locked copy (path c) rejected — trades the
  literal-match moat for a cosmetic display win; reserve for a future HARD
  signal, never a soft flag.
Scope note: hub-page.ts:402 is a template line — dropping the suffix strips it
  from EVERY hub page, not just this cornerstone. Treated as an intended
  sitewide title-template change (brand tail is low-value across all hubs), not
  a one-page patch. Per-page suffix-retention override explicitly NOT pursued
  (more code, no benefit). Dev verifies the suffix is appended at exactly one
  template site before stripping (single source).
Validation: rendered /en/this-weekend/ <title> = locked titleEn verbatim, no
  " | agent-athens" tail; literal "Athens events this weekend" still front-loaded
  at title start; spot-check 2-3 other hub pages confirm suffix removed sitewide
  with each page's own keyword copy front-loaded; Bing WMT re-crawl (flag may
  persist as soft warning at ~97 — accepted, not a fail gate).
Replicability: fully city-agnostic. SPEC: "hub titles carry no brand suffix;
  the title budget is spent entirely on front-loaded keyword/literal-match copy;
  country disambiguation rides title/meta + schema, never a brand tail." DATA
  per-city: each city's locked titleEn literal. No Athens hardcoding; the suffix
  drop is a template change identical across every city build.
Status: Decided. Dev patch on hub-page.ts:402 (suffix removal, sitewide).
  Independent of locked-copy iteration. Affirms 2026-05-20 front-loading thesis
  and 2026-04-28 disambiguation layering (title/meta + schema, not brand tail).
---

## 2026-05-25 — `/en/` Filter Combo Pages: Degrade-as-Hub-Routing (No Secondary-Locale Combo Surface)

**Context:** Filter chips on English hubs (`/en/this-week/` etc.) currently link to Greek combo pages (`/concert-this-week`) — no `/en/` equivalents exist. Dev Planner requested a ruling between (a) generate ~72 `/en/` combo mirrors (×locale, adding ~72 indexable English pages) or (b) degrade — hide filter options with no `/en/` target. Downstream of the approved English-default flip (2026-05-25), F-series, post-demo. Site is mid-recovery from zero-indexed (known-issues #1, S90 — 10,150 URLs resubmitted, awaiting re-crawl). Content is already 96.5% English (S-current coverage).

**Decision:**
1. **(b) selected, reframed: degrade = re-point, not remove.** No `/en/` combo pages are generated. English filter chips are NOT removed; they re-point to surviving hubs (`/en/concerts/`, `/en/this-week/`, etc.) and/or apply in-page client-side filtering. User filters; results narrow; no 404, no missing chip.
2. **No secondary-locale combo surface, as a standing rule.** The 72 Greek combos are legacy-surviving residue of the 2026-02-19 consolidation (315→18 hubs) under the 2026-05-12 narrowest-surviving-hub + 28-day rolling-eviction regime — a *suppressed, evicting* surface class, not a freely-expandable one. English skips building a surface the primary locale is already migrating off.
3. **Q2 (canonical/sitemap) — N/A under (b); fallback recorded.** If combos were ever generated, each would self-canonical to its own served trailing-slash form, never cross-canonical to the parent hub (cross-URL canonical is forbidden by the 2026-05-21/05-23 self-canonical + canonical-must-be-200 invariants; canonical-to-hub would also assert "duplicate of hub" — true, which is the argument against generating). No combo sitemap entries.
4. **Q3 (timing) — defer any reconsideration behind the F2 indexing-stabilization gate.** Combo-generation is not reconsidered before re-crawl settles.

**Reasoning:** Generating 72 `/en/` mirrors does not add 72 English long-tail surfaces — it doubles a surface the project already decided to suppress, mid-re-crawl. Combinatorial pages filtering one event DB by type×time×price×genre fail the 85% similarity test and drag the site-wide Helpful Content classifier; consolidation drew 3.2× more AI citations than the separate pages combined. English long-tail already lives on the 18 enriched hubs (editorial, not combinatorial); `/en/concert-this-week` is the intersection of `/en/this-week/` + `/en/concerts/`, both of which exist — zero new semantic surface. Timing is independently decisive: injecting near-duplicate listing pages into an active recovery re-crawl spends scarce recovering-domain crawl equity on the lowest-value surface class while cornerstone/hub pages still fight for re-index; Tier A (~89% of bot traffic) doesn't follow the pagination these feed. On Q4 (does fewer-options read as broken?): the flip Q3 "fewer events than Greek" concern was *inventory asymmetry* (thinner English event pool) — a credibility problem. This is not that. Filtering fewer near-duplicate URL targets is invisible when chips re-point to hubs / filter in-page. Asymmetry only reads as broken if chips are *removed* rather than *re-pointed* — hence the reframing. Greek combos and English filtering diverge at the URL layer, converge at the UX layer; that divergence is the leading edge of the consolidation the whole site is migrating toward.

**Implementation spec (for Dev Planner sequencing):**
1. Filter-bar fix: English chips resolve to surviving hubs and/or in-page client-side filtering. No chip removed; no `/en/` combo generated; no combo `<loc>` added to any sitemap.
2. No canonical work (no combo emitted). Fallback rule recorded above if reconsidered.
3. Combo-generation reconsideration gated behind F2 indexing-stabilization gate.
4. **Independent of this ruling — Step 3 (filter labels) ships now:** locale-aware `filter-bar.ts` labels (Τύπος→Type, Τιμή→Price, Ταξινόμηση→Sort, aria strings) — pure correctness, no GEO call, same trivial-label logic as S155 nav. **One pricing-terminology check:** the Price chip values must use locked Tier-1 terms — **open / with-ticket**, NOT free/paid — on both locales; executor surfaces any ambiguous label rather than guessing.

**Validation:**
- No `/dist/en/*-this-*` or other `/en/` combo HTML generated; sitemap-editorial.xml contains no `/en/` combo `<loc>`.
- Every English filter chip resolves to a 200 (hub or in-page state); none 404s, none links to a Greek combo URL from an `/en/` surface.
- Rendered `/en/` filter bar offers the same *functional* filtering as Greek (results narrow correctly); chip count parity not required, result parity is.
- Price chip renders "open"/"with-ticket" on both locales (grep filter-bar.ts output).
- Re-crawl unaffected by net-new combo pages (count delta = 0).

**Replicability check:** Fully city-agnostic. SPEC: "filter chips route to surviving hubs and/or in-page filtering, never to per-locale combinatorial mirrors; a secondary locale never generates a combo surface the primary locale's consolidation regime is evicting; degrade = re-point, never remove chips." Barcelona (`en` + `["es","ca"]`), Berlin (`en` + `["de"]`) inherit identically: each builds hubs per locale, routes filters to them, mirrors no combos into any secondary locale. DATA per-city: the 18-hub set + surviving-combo list are per-city config; routing rule is universal. No Athens hardcoding.

**Connects to:** 2026-02-19 "Consolidate Combinatorial Pages to Hub Architecture" (315→18; the surviving combos are its residue). 2026-05-12 "Combinatorial URL Consolidation: Narrowest-Surviving-Hub + 28-Day Eviction" (defines combos as a suppressed/evicting class). 2026-05-25 "English-Default Language Flip" (no cross-language canonical; self-canonical per served form — basis for the Q2 fallback). 2026-05-21/05-23 self-canonical + canonical-must-be-200 invariants (forbid the canonical-to-hub fallback path). F2 indexing-stabilization gate (shared timing gate). S90 known-issues #1 zero-indexed recovery (the active re-crawl this protects). S155 trivial-label precedent (filter-label correctness pass).

**Status:** Decided — 2026-05-25. (b) degrade-as-hub-routing. Filter-bar re-point + Step 3 locale-aware labels cleared to ship now; combo-generation reconsideration deferred behind F2 gate. Post-demo, downstream of the English-default flip.

---

## 2026-05-27 — Microdata Strategy: JSON-LD Is the Sole Canonical Surface; Microdata Stays Retired (Confirms 2026-05-25)

**Context:** GEO ruling requested on whether to deliberately emit a fuller
Microdata Event graph as a second structured-data format, or hold JSON-LD-only
with Microdata minimal. The honest live state is "JSON-LD is the real surface;
Microdata is minimal and was historically a bug source." This is effectively a
reopen request against the 2026-05-25 "Microdata Strip on Hub + EDP: Ratified
(f02043922)" decision, so the bar is: did the GEO landscape move, or was the
prior reasoning wrong. Neither holds.

**Decision:** Hold JSON-LD-only. Do NOT emit a parallel/fuller Microdata Event
graph. "Microdata stays minimal" is ruled to mean a near-zero posture: JSON-LD
is the sole canonical carrier of every Event/Offer/Place/Organizer entity and
property; no JSON-LD entity is mirrored in Microdata. `validateMicrodata` stays
retired. The 2026-05-25 ratification stands and is generalized from "EDP + hub
strip" to a standing strategic posture across all surfaces and all city replicas.

**Reasoning:**
1. *Conflicting-signal, not additive.* A fuller Microdata Event graph is the
   same entity expressed twice on one page — the documented conflicting-signal
   anti-pattern, not a stacking bonus. Google normalizes both formats into one
   graph (no additive gain); the field's current guidance (Feb–Apr 2026) and
   Google's own docs (updated 2026-01) reaffirm JSON-LD as recommended and
   note no benefit to dual-expressing one entity.
2. *Reintroduces the S110 failure mode.* Microdata was the surface behind the
   11,217-violation incident — the project's worst structured-data drift event —
   caused by emission/validation scope drift on a parallel mirror surface. S110
   exists specifically to prevent that. A re-added Microdata graph would have to
   re-enter validator lockstep (the lockstep that broke), or violate S110.
3. *Maintainability runs entirely against Microdata.* Daily-rebuilt static site
   with deeply nested Event→Offer→UnitPriceSpecification[]→location graphs.
   Microdata expresses nesting via itemscope/itemprop woven into presentation
   HTML — fragile under template change. JSON-LD is an isolated, template-
   independent block.
4. *Dual-channel steelman fails.* The "LLMs tokenize JSON-LD as raw text"
   benefit already accrues — the ld+json block is in served HTML. Microdata
   would add a redundant, lower-density restatement, which the thinking-patterns
   reference flags as a mild automated-generation negative signal, not a gain.

**Implementation:**
1. No Microdata Event-graph emission. Confirm f02043922 left no stray
   entity-bearing itemprop/itemscope on EDP or hub templates; remove any found
   (removal, not validation).
2. S110 Coverage Manifest: register Microdata explicitly as a retired/not-emitted
   surface with rationale "retired — see 2026-05-25 + 2026-05-27 rulings,"
   rather than silently omitting it. Silent absence invites accidental re-add.
3. No `validateMicrodata` resurrection.

**Validation:** Grep templates for `itemscope`/`itemprop` post-build; expect zero
entity-bearing instances on EDP + hubs. Coverage manifest contains an explicit
Microdata-retired entry and no `microdata:validated:*` entry. Build passes.

**Reopen trigger (named):** A specific consumer AI engine documented to extract
Microdata while ignoring JSON-LD. Current evidence runs opposite (ChatGPT,
Perplexity extract from JSON-LD even when invalid). Parked behind this trigger,
same discipline as MCP/NLWeb.

**Replicability:** SPEC universal — JSON-LD sole canonical surface; Microdata
retired and registered-as-retired in the manifest. DATA per-city — none.
agent-barcelona/agent-berlin inherit JSON-LD-only. No Athens hardcoding.

**Connects to:** 2026-05-25 "Microdata Strip on Hub + EDP: Ratified" (this
confirms and generalizes it). 2026-05-04 "Emission-Validator Coverage Manifest"
(the drift mode a re-add would reintroduce). "Schema Quality Over Presence"
(18-pt envelope penalty defined by intact JSON-LD). Dual-channel mechanism in
geo-thinking-patterns-merged.md (argues for richer JSON-LD, not a second format).

**Status:** Decided — confirms ratified 2026-05-25 state; closes the
microdata-expansion question behind a named reopen trigger.

---

## 2026-05-30 — GA4 Stays Secondary/AI-Referral-Scoped (Mentor "Grow Users" Input Does Not Re-Open KPI Hierarchy)

**Context:** Mentor conversation raised "add Google Analytics, grow users," framing traffic as a growth target. This touches the Sprint 5 KPI framework. Two rulings requested before the S100b dev brief: (1) does GA4 stay secondary/AI-referral-only or become a primary human-growth instrument; (2) does the queued `kpi-import-ga4.ts` scope expand.
**Decision:** GA4 remains a SECONDARY metric scoped to the AI-referral custom channel. Not promoted to primary; not expanded to full-funnel human growth. `kpi-import-ga4.ts` scope in S100b holds unchanged (AI-referral channel import, operator-setup gate intact). This CONFIRMS the 2026-03-02 Citation-as-Visibility KPI lock; it does not amend it.
**Reasoning:** The mentor's frame is correct for a destination site and a category error for a citation layer. The locked data already settles it: ~93% no-click in AI Mode, ~0.4% of AI usage events surface as a visible citation. Promoting traffic to primary instruments the 0.4% tail and declares the 99.6% mission-carrying majority unmanaged. The kernel of truth in "get human signal" is already served — AI-referral traffic is the visible confirmation that invisible citations are landing, which is exactly why it exists as a secondary AI-scoped metric. Promotion would invite Goodhart pressure (engagement/retention features that fight the SSR-structured-data moat) and would substitute an easy-but-wrong metric for the genuinely hard-to-measure right one (citation impressions). The correct response to a hard primary metric is to harden citation measurement (Bing AI Performance grounding-query count), not to anchor on traffic.
**Implementation:** No change to KPI hierarchy. S100b proceeds with `kpi-import-ga4.ts` importing the AI-referral custom channel only (regex per 2026-02-19 Measurement Stack), gated on operator setup (GC service account + GA4 Data API + property linkage, ~20 min, `docs/kpi-setup.md`). Dev brief written against this scope. No full-funnel session/acquisition reporting.
**Validation:** Importer output populates the secondary-metric row only; primary dashboard remains Bing AI Performance citation/grounding-query count. Grep confirms no full-funnel acquisition fields in importer scope. Sprint 5 reporting template unchanged ("cited X times across Y grounding queries," not "drove X clicks").
**Replicability:** SPEC-universal. KPI hierarchy and the AI-referral channel definition are city-agnostic; the AI engines are the same regardless of city. DATA-per-city: each city has its own GA4 property; importer logic and channel grouping are identical across agent-barcelona / agent-berlin.
**Connects to:** 2026-03-02 "Citation-as-Visibility KPI" (parent lock, reaffirmed); 2026-02-19 "GEO Measurement Stack" (AI-referral channel regex, four-layer free stack); 2026-05-27 `/proof` AI-citation section drop (sibling: don't surface unverifiable measurement).
**Status:** Active — S100b unblocked to brief. Dormant follow-on: "AI-referral share of total organic sessions" context ratio is a possible future separate D-entry, NOT authorized now, reactivation only if mentor input formally requests a denominator for interpretability.

---

## 2026-06-03 — AI-Referral Importer Reconciled to 5 Engines (Gemini + Claude Added)

**Context:** 2026-05-30 held `kpi-import-ga4.ts` at 3 engines (chatgpt/perplexity/
copilot) pending Strategist call on adding gemini.google.com + claude.ai. kpi.db
CHECK constraint already permits all 5. Question framed as add-or-hold.
**Decision:** Add gemini.google.com + claude.ai. Importer covers the full 5-engine
set defined in 2026-02-19 GEO Measurement Stack. This is a reconciliation of an
implementation deviation back to the decided channel definition — NOT a scope
expansion and NOT a KPI-hierarchy change.
**Reasoning:** (1) The 2026-02-19 channel-definition regex already enumerated all
5; importer-at-3 was under-implementation below spec. (2) Gemini is the #2 engine
(21.5% AI-search share, Jan 2026) — excluding it is the material blind spot, not
including it. (3) The historical Gemini-murkiness was about AI Overviews (which pass
google.com); an exact `gemini.google.com` host match captures only the chatbot and
correctly excludes AI-Overview/organic noise — no false-attribution risk. (4) GA4's
native "AI Assistant" channel (launched 2026-05-13) canonicalizes exactly
ChatGPT+Gemini+Claude; importer staying narrower than GA4's own default is wrong.
(5) claude.ai passes referrers consistently in browser sessions — low volume, zero
marginal cost (CHECK already allows). (6) Does not touch 2026-05-30/2026-03-02:
GA4 stays secondary, AI-referral-scoped; engine membership ≠ instrument promotion.
**Implementation:** Expand `kpi-import-ga4.ts` source filter to chatgpt.com,
chat.openai.com, perplexity.ai, claude.ai, gemini.google.com, copilot.microsoft.com
(chat.openai.com folded to ChatGPT in per-engine rollup). No schema migration.
Operator-setup gate (docs/kpi-setup.md) unchanged.
**Validation:** Importer writes rows for all 5 engine keys. Empty Gemini/Claude rows
are expected (no recognized referral with valid header yet), not a config error.
Spot-check that gemini.google.com matches pull no google/organic sessions.
**Replicability:** SPEC-universal — engine set identical for all cities.
DATA-per-city — separate GA4 property only. No Athens hardcoding.
**Connects to:** 2026-02-19 "GEO Measurement Stack" (parent channel definition,
now reconciled). 2026-05-30 "GA4 Stays Secondary/AI-Referral-Scoped" (hierarchy
lock, untouched — this completes membership, not promotion). 2026-03-02
"Citation-as-Visibility KPI" (primary lock, untouched).
**Status:** Active — S100b importer briefable at 5 engines. Dormant follow-on:
consolidate onto GA4 native `ai-assistant` channel IF Google publishes a full
recognized-referrer list including Perplexity + Copilot (reactivation trigger).

---

## 2026-06-04 — Growth Probe Pre-Registration: Viber "This Weekend" Broadcast Result Cannot Promote Traffic (Anti-Goodhart Lock Extension)

**Context:** Mentor "grow users" fork is live again, now framed as a cheap North-Star probe — Growth is speccing a manual Viber "this weekend" broadcast with a forthcoming success threshold. 2026-05-30 locked citation impressions primary / GA4 secondary-AI-referral-scoped and named the Goodhart risk if traffic becomes a target. The risk this entry addresses: a positive probe signal creates post-hoc pull to quietly promote traffic in the hierarchy — the exact drift 2026-05-30 warns against. Defense is to pre-register interpretation BEFORE any probe data exists. Does NOT re-open 2026-05-30 or 2026-03-02.

**Decision:**
1. A probe that HITS its threshold changes nothing in the KPI hierarchy. It may (a) confirm the distribution-channel hypothesis (continue the manual broadcast as a cheap experiment) and (b) earn a named leading-indicator dashboard row labelled non-promotable/diagnostic. It authorizes no build work by itself.
2. Viber traffic is NOT AI-referral traffic; it cannot enter the secondary metric slot (defined by the AI-referral regex, 2026-02-19 / 2026-06-03). Any probe signal is a new, distinct, lower-tier diagnostic — not a top-up of an existing instrument.
3. Invariant regardless of result: citation impressions remain primary; no engagement/retention/personalization feature degrading the SSR+JSON-LD surface ships without a separate re-ruling; sprint prioritization stays governed by enrichment × structured data × freshness; promoting any traffic/engagement metric to primary requires a NEW dated entry explicitly superseding 2026-03-02 + 2026-05-30, never dashboard drift.
4. Symmetric lock: a NULL probe result does NOT demote the /this-weekend cornerstone. The surface's job is citation, not push-traffic.
5. Growth's forthcoming success metric must clear a 4-test rubric — pull-not-push; zero moat cost to capture (no added JS/instrumentation on static pages); ungameable by list/frequency inflation; bounded to the probe. Vanity/moat-hostile metrics (raw pageviews/sessions, time-on-page/scroll-depth, retention-as-target, login-gated) are rejected pre-probe.

**Reasoning:** Pre-registration prevents outcome-switching: the interpretation of a probe is fixed before its result is known, so a tempting number cannot retroactively rewrite the KPI hierarchy. A leading indicator confirms a fact about latent demand; it is not a target. The standing moat is crawlable SSR + canonical JSON-LD + daily freshness — precisely the surfaces "grow users" pressure erodes (login walls, JS gating, interaction tracking). Binding both directions (success ≠ promotion, null ≠ demotion) prevents the probe from being weaponized either way.

**Implementation:** No code. Pre-registration is governing-record only. When Growth's metric lands, check it against the 4-test rubric in this entry before the broadcast runs. If a leading-indicator row is added, label it non-promotable/diagnostic; do not wire it into primary/secondary reporting. Any future traffic-promotion proposal opens as a new dated entry citing+superseding 2026-03-02 + 2026-05-30.

**Validation:** Probe result, whatever its sign, is logged as a leading-indicator readout, not a hierarchy change. No engagement/retention build appears in any post-probe sprint brief without a separate re-ruling reference. Grep future briefs: no primary-dashboard change attributable to probe traffic absent a superseding entry.

**Replicability:** SPEC-universal — pre-registration discipline, citation-first invariant, moat-protection re-ruling gate, and the 4-test audience-signal rubric are city-agnostic. DATA-per-city — the channel (Viber) and recipient list are Athens-specific; agent-barcelona/agent-berlin run analogous distribution probes (WhatsApp/Telegram/etc.) against the identical interpretation frame.

**Connects to:** 2026-05-30 "GA4 Stays Secondary/AI-Referral-Scoped" (parent lock this protects); 2026-03-02 "Citation-as-Visibility KPI" (primary lock, untouched); 2026-06-03 "AI-Referral Importer Reconciled to 5 Engines" (defines the secondary-slot membership Viber cannot enter); /this-weekend cornerstone work (the surface under probe).

**Status:** Active — pre-registration binds before probe data exists. Reactivation/escalation trigger: Growth's success metric delivered (run 4-test rubric) OR any proposal to promote a traffic/engagement metric (opens new superseding entry, does not amend this one).

---

## 2026-06-05 — Card-Grid Typographic Tile Coexists With Body-Title `<a>` (GEO Anchor Floor)

**Context:** S161 advances the Satori typographic card from a Design-Navigator-only
visual concern into the card-grid layer. Open question raised in review: does the
tile coexist with the per-card body-title text anchor (title stacked twice), or
replace it? The tile renders the title with a 4-line cap. Ruling issued 2026-06-03,
re-confirmed and committed 2026-06-05; S161 image-field baseline is ~2026-05-27
(64.2% image-field gap, concerts-concentrated).

**Decision:** Coexist. The SSR text `<a href="{detailUrl}">{full untruncated title}</a>`
is mandatory on every card and is NOT replaced by the tile. The tile is visual +
image-artifact source (feeds `og:image` + Event JSON-LD `image`); the anchor is the
GEO floor. Replacement is a hard block — if S161 layout as drafted replaces the
anchor, reject before Dev Planner writes the session.

**Reasoning:** AI crawlers (GPTBot, ClaudeBot, PerplexityBot) do not execute JS and
do not OCR rasters; a title carried only in a tile is invisible as machine-readable
text and removes both the hub->EDP internal link and its event-name anchor text. The
tile / `og:image` / schema `image` artifact may be lossy (4-line truncation OK); the
page text layer may not. The 4-line cap is safe precisely because the full title
persists, untruncated, in the anchor below.

**Implementation:** Per card, render tile + SSR full-title anchor. If the tile is an
`<img>`, set `alt={title}` (alt is not the floor — no link, weaker signal — but
costs nothing). Truncation (Satori line-cap or CSS clamp) is confined to the tile;
the anchor text is never truncated in source.

**Validation:** JS-off `curl` of a hub page shows an untruncated full-title
`<a href>` per card; the title string is present as anchor text, not only inside an
`<img alt>` or background-image reference; hub internal-link count unchanged vs.
pre-S161 (tile addition must not cannibalize the anchor).

**Replicability:** SPEC-universal; no Athens DATA. "Card tiles are visual /
image-artifact source; the crawlable full-title `<a>` to the detail page is
mandatory." Inherited by agent-barcelona / agent-berlin unchanged.

**Connects to:** 2026-02-20 "OG Images Deferred to P2" (the logged Satori / og:image
lineage; this card is the same shared image artifact). 2026-02-20 "Hub Page Editorial
Structure" / 7-layer (mandates SSR event listings; carries the "crawlers do NOT
execute JavaScript" floor and the hub->EDP listing links). NOTE — two upstream
dependencies are ruled but NOT yet in this log: the image-field build-time hotlink
validation gate (strip-to-null on failure) and the Satori-fallback advancement from
P2 deferral. Both should be logged so this entry's artifact lineage fully resolves.

**Status:** Decided — binding on S161 before Dev Planner session.

---

## 2026-06-05 — Stand-up Sets Emit ComedyEvent, Not TheaterEvent (@type Derivation Above EventType)
**Context:** Hub taxonomy is locked (`/comedy`→ComedyEvent, `/theater`→TheaterEvent/PerformingArtsEvent), but the @type emitted by a stand-up set was not pinned. The EventType enum (concert|exhibition|cinema|theater|performance|workshop) has no `comedy` value, so stand-up acts (Kevin Bridges, Mario Adrion) fall into `theater`/`performance` and a naive EventType→@type map routes them to TheaterEvent. The Step 0c categorizer work excluded this borderline re-type as a Strategist call. Greek comedy plays (Coronet, Καρυάτιδα) are scripted theatrical works, arguably correct as TheaterEvent.
**Decision:** Stand-up/sketch/improv (performer-as-self, no scripted dramatic work) → `ComedyEvent`. Scripted comedic plays (actors performing a written work) → `TheaterEvent`, unchanged. Decision boundary = presence of `workPerformed`. `show` rejected (not a valid schema:Event subtype); TheaterEvent-for-stand-up rejected (false signal).
**Reasoning:** ComedyEvent is the most-specific-true type, already the locked @type of the /comedy hub, zero rich-result downside (treated identically to Event), and lets `performer` carry the citation signal. TheaterEvent for stand-up is a false Tier A signal and pollutes the /theater hub's node coherence — worse than bare Event. Root cause is the EventType enum gap; fix is to derive @type from a format signal layered above EventType, not to widen the enum. Operationalizes the 2026-02-19 "most-specific-subtype" / Κωμωδία→ComedyEvent ruling and the Round 4 theater-categorization rule by making the implicit stand-up-vs-comedic-play boundary explicit.
**Implementation:** (1) Categorizer comedy-format detector overrides EventType→@type default → ComedyEvent when no workPerformed; keys on absence of scripted work so comedic plays don't trip it. (2) One-time dated DB correction script in scripts/ (Anchor-backfill pattern) re-types ingested stand-up to ComedyEvent; Kevin Bridges + Mario Adrion are anchors; Coronet/Καρυάτιδα excluded. (3) No EventType enum change; @type becomes derived, not enum-mirrored.
**Validation:** ComedyEvent validates as Event rich result (validator.schema.org + GSC). Kevin Bridges/Mario Adrion emit ComedyEvent + performer, no workPerformed. Coronet/Καρυάτιδα still TheaterEvent + workPerformed. S110 manifest has paired node-keyed validator rule for ComedyEvent. Zero stand-up leakage into /theater TheaterEvent node set.
**Replicability:** SPEC-universal — rule + derived-@type mechanism transfer to agent-barcelona/agent-berlin unchanged. DATA-per-city — comedy-format detection heuristics (per-language stand-up vocabulary, comedian registries) and the dated backfill script.
**Connects to:** "Schema.org Event Subtype Mapping" (2026-02-19, most-specific-subtype principle), "New Schema.org Event Subtypes" (2026-02-20, theater categorization), "Finalized 18-Hub Taxonomy" (2026-02-20, /comedy→ComedyEvent locked), "A0 Hard-Stop Calibration" (2026-05-14, Anchor-backfill pattern reused for the DB correction).
**Status:** Decided. Awaiting categorizer-rule + backfill-script sequencing.

---

## 2026-06-05 — ChatGPT-Only AI Referral (n=19): English-Flip Stays Gated (No-Go); `/en/` Sitemap Coverage Is the Diversification Lever (Tier-B Starvation Hypothesis)

**Context:** State audit 2026-06-04 (§4) gave the first honest read of the citation feedback loop. GA4 AI-referral channel: 19 sessions, 100% chatgpt.com; zero from Perplexity, Gemini, Claude, Copilot. Bing 7-day: 9 impressions, 0 clicks, avg position 2.67. Drift guard armed — a real zero, not a missing-data artifact. The same audit surfaced a `/en/` sitemap absence of 674 pages, undecided intentional-or-gap. Dev Planner routed the cluster for a Strategist ruling: (a) does ChatGPT concentration change citation-strategy priority; (b) go/no-go on the "English-default flip" (= hreflang `el↔en` + `x-default → /en/` + Greek URLs entering the sitemap — gated by 2026-05-21 S144 Decision 4 on Greek publication), blocking Sprint 4 closure. Caveat weighted: n=19 is suggestive, not conclusive; indexing counts feeding the read are 24 days stale (fresh GSC/Bing pull queued as Session C).

**Decision:**
1. **English-flip: NO-GO. The S144 Decision-4 gate stands unchanged.** hreflang + `x-default → /en/` + Greek-into-sitemap do not activate. Reactivation trigger is unchanged and reaffirmed: Greek root locale becomes self-canonical + indexable AND passes its tiered translation-quality review. Sprint 4 closes ON this ruling — a decisive no-go is the closure, not a deferral.
2. **The 674-page `/en/` sitemap absence is a separate axis from the flip and is NOT intentional-by-default.** S144 Decision 3 already ruled the sitemap = `/en/` URLs only, which *requires* Active + Just-passed `/en/` event pages to be present. Resolution rule: classify the 674 by lifecycle phase. Cooling (Day 15–44) / Archive (410) / bare-root dormant Greek → correctly absent (intentional, no action). Any Active or Just-passed `/en/` event absent from `sitemap-events.xml` → a build GAP (regression), P1, fix required.
3. **The sitemap-coverage gap (to the extent it is one) is the single highest-leverage item in this cluster for the diversification goal**, ahead of any ChatGPT-specific content tuning and ahead of the flip. It is an infrastructure fix (applies to all `/en/` event pages at once) and is the most plausible mechanical cause of the three dark engines.
4. **Strategic read on ChatGPT concentration: investigate via cheap instrumentation, do not double down and do not re-platform content.** At n=19 the pattern does not license overfitting to one engine's preferences, nor a content-quality verdict on the others. The working hypothesis is Tier-B starvation, not Tier-A content failure.

**Reasoning:** The flip no-go is over-determined. (i) The gate already forbids it — Greek is dormant (S144 case d); emitting hreflang to un-quality-gated dormant Greek re-introduces the "incorrect hreflang is worse than none" failure (2026-05-08, 2026-05-21) in a new mode. (ii) The only engine biting ignores the flip entirely — ChatGPT and Perplexity disregard hreflang and default to English URLs (2026-02-20 x-default entry; Glenn Gabe Dec-2025). Activating the flip buys zero on the live channel and risks the dormant-Greek cluster error. So the flip cannot be the Sprint-4 blocker's resolution in the "go" direction; the correct resolution is a firm no-go that reaffirms the gate.

The diversification lever is the sitemap, not the flip, because the three engines run independent discovery pipelines that gate on reachability, and inter-engine citation overlap is ~1.4% (Lee 2026) — ChatGPT holding us in its pool implies nothing about Perplexity/Gemini/Copilot reach. Perplexity's own docs make crawl/index accessibility the hard prerequisite ("no other signal matters if Perplexity cannot reach the page"). Copilot is Bing-index-fed (IndexNow/sitemap-accelerated); Gemini is Google-index-fed. Tier B (~8% of AI-bot traffic, the search-index-routed citation path) is precisely the path a missing-from-sitemap page starves — and it is the path Gemini and Copilot most depend on. A 674-page hole in `sitemap-events.xml` is therefore a coherent mechanical explanation for three dark engines that does not require a content-quality story. ChatGPT can cite anyway because it is Tier-A-heavy (training crawl, 89.4% of AI-bot mass) plus persistent browsing, neither of which needs our sitemap.

"Double down on what ChatGPT rewards" is rejected: at n=19 it overfits to one engine and risks degrading the city-agnostic structured-data moat to chase a single pipeline's quirks. "Diversify by changing content" is rejected: nothing in the data points at content; it points at reachability. The disciplined move is to remove the reachability gap (infra fix, all-pages, replicable) and re-read after Session C with per-engine instrumentation in place — confirm or kill the Tier-B-starvation hypothesis on data, not on a hunch built from 19 sessions.

**Implementation:**
1. No flip work. Confirm `sitemap-events.xml` / hub templates emit no hreflang and no `x-default` (S144 state preserved). Reactivation trigger logged unchanged.
2. **Session C (queued, cheap) extended by one task:** alongside the fresh GSC/Bing pull, phase-count the 674 absent `/en/` pages against the `endDate`/`eventStatus` lifecycle state machine (single source of truth, per S144 Decision 6). Output: counts in {Active, Just-passed, Cooling, Archive, dormant-Greek}.
3. **If the Active + Just-passed count is non-trivial:** open a P1 infra fix — those `/en/` URLs enter `sitemap-events.xml` with correct content-hash `lastmod` and are submitted via IndexNow (already wired per 2026-05-23). This is a build-generator fix, not per-event content work. Add/confirm an S110 manifest invariant: every Active/Just-passed `/en/` event page present in `sitemap-events.xml` (paired validator rule; closes the emission-vs-validation drift class).
4. **If the 674 are all Cooling/Archive/dormant-Greek:** mark the audit item resolved-intentional; no action; record that the dark engines are NOT explained by sitemap coverage and the hypothesis moves to the next candidate (schema completeness / brand-mention scarcity / engine ramp time).

**Validation:** Phase-count returns a clean partition of the 674 (no unclassifiable rows = lifecycle state machine is the sole driver). Post-fix (if triggered): `curl` of `sitemap-events.xml` lists Active/Just-passed `/en/` URLs; GSC URL Inspection on a previously-absent `/en/` event returns an indexed/eligible verdict; Bing Webmaster shows the URLs submitted. Diversification check at next reading cycle: first non-ChatGPT AI-referral session OR first Perplexity/Gemini/Copilot citation appears after sitemap coverage closes — logged as confirmation of the Tier-B-starvation hypothesis. Null result after a full crawl cycle → hypothesis falsified, escalate to next candidate. n is explicitly held as provisional until Session C refreshes the 24-day-stale indexing counts.

**Replicability:** SPEC-universal. "When one engine dominates AI referral at low n, treat it as a discoverability-pipeline read, not a content verdict; the lever is search-index reachability (sitemap coverage of the indexable locale), not engine-specific content tuning or premature hreflang activation." The flip-gate discipline (hreflang/x-default activate only on primary-locale publication + quality review) and the "Active/Just-passed indexable-locale pages must be in the events sitemap" invariant are city-agnostic. DATA-per-city: the 674 figure, the Athens lifecycle corpus, the specific engine that dominates first (Barcelona/Berlin may see a different first-mover engine).

**Connects to:** 2026-05-21 S144 "/en/ Self-Canonical + Indexable" (Decision 3 sitemap rule, Decision 4 flip gate, Decision 6 lifecycle state machine — this entry reaffirms the gate and operationalizes Decision 3 against the 674). 2026-02-20 "x-default Changed to English" (the flip's target; reactivates only on Greek publication). 2026-05-08 "Bilingual Infrastructure Subset" (incorrect-hreflang-worse-than-none principle). 2026-05-23 "Declared Canonical Normalizes to Served" (IndexNow wiring reused for any sitemap-coverage fix). 2026-05-04 S110 "Emission-Validator Coverage Manifest" (paired validator rule for the sitemap-coverage invariant). Three-tier citation framework (Tier B = the starved path). Session C (state audit 2026-06-04 §-cheap-followups).

**Status:** Decided — 2026-06-05. English-flip = NO-GO, gate stands; **Sprint 4 closes on this ruling.** Sitemap-coverage resolution blocked only on the Session C phase-count (cheap, queued). Reactivation trigger for the flip unchanged: Greek root published + indexable + quality-gated.

---

## 2026-06-05 — Metric Hierarchy Unchanged at n=19; Per-Engine Citation Decomposition Added as Non-Promotable Leading Indicator

**Context:** Same audit (2026-06-04 §4). Dev Planner asked whether the 100%-ChatGPT AI-referral read reweights the Sprint-5 metric hierarchy (Strategist-owned, flagged pending). The primary/secondary lock is already settled: 2026-03-02 (citation impressions primary, AI-referral traffic secondary), 2026-05-30 (GA4 stays secondary/AI-referral-scoped), 2026-06-03 (importer reconciled to 5 engines), 2026-06-05 Viber pre-registration (citation-first invariant, non-promotable leading-indicator pattern).

**Decision:**
1. **Hierarchy unchanged.** Primary = AI citation impressions (Bing AI Performance grounding-query count as the hardenable instrument). Secondary = GA4 AI-referral traffic, scoped to the 5-engine regex. n=19 / 100%-ChatGPT does NOT reweight, does NOT promote ChatGPT-referral sessions to primary, does NOT amend 2026-03-02 / 2026-05-30.
2. **Add a per-engine decomposition row** to the Sprint-5 dashboard: AI-referral sessions and (where available) citations split by engine {chatgpt, perplexity, gemini, claude, copilot}. Labelled **non-promotable / diagnostic**, per the 2026-06-05 Viber leading-indicator pattern. It feeds the diversification investigation (sitemap-coverage hypothesis above); it is not a target and is not wired into primary/secondary reporting.
3. **Sprint-5 primary instrument is explicitly citation-side, not referral-side.** The first milestone stays "first Bing AI Performance grounding query detected." ChatGPT-referral session count is NOT the Sprint-5 health metric.

**Reasoning:** Promoting the dominant engine's referral count at n=19 is the exact Goodhart drift 2026-05-30 and the Viber pre-registration forbid — it instruments the visible 0.4% tail and lets a tempting number rewrite the hierarchy post-hoc. The engine-concentration datum is real signal, but its correct destination is a *diagnostic* that informs a strategy question (why are three engines dark), not a metric promotion. The non-promotable leading-indicator slot already exists in the governing record precisely for facts like this — confirm a latent condition without making it a target. Hardening the genuinely-hard primary metric (citation impressions) is the right response to thin referral data, not anchoring on the easy-but-wrong referral count of the one engine that happens to be biting.

**Implementation:** No code beyond the importer already reconciled to 5 engines (2026-06-03) — the per-engine split is a reporting view over data already captured. Dashboard adds one diagnostic row, explicitly labelled non-promotable. No new instrumentation on static pages (preserves the no-added-JS moat constraint from the Viber 4-test rubric). No change to `kpi-import-ga4.ts` scope.

**Validation:** Sprint-5 dashboard shows citation impressions as primary, AI-referral (5-engine) as secondary, per-engine split as a labelled diagnostic. Grep future briefs: no primary-dashboard change attributable to ChatGPT-referral concentration absent a dated superseding entry. The per-engine row's job is to register when a second engine lights up (validating/falsifying the sitemap-starvation hypothesis), not to be optimized toward.

**Replicability:** SPEC-universal. "Single-engine dominance at low n is a diagnostic input, never a hierarchy reweight; per-engine decomposition is a non-promotable leading indicator." Inherited unchanged by agent-barcelona / agent-berlin. DATA-per-city: which engine dominates first.

**Connects to:** 2026-03-02 "Citation-as-Visibility KPI" (primary lock, untouched). 2026-05-30 "GA4 Stays Secondary/AI-Referral-Scoped" (confirmed, not amended). 2026-06-03 "AI-Referral Importer Reconciled to 5 Engines" (defines engine membership; this entry reads its output diagnostically). 2026-06-05 Viber pre-registration (non-promotable leading-indicator pattern reused). 2026-06-05 ChatGPT-Only Read (above — the per-engine row feeds that entry's diversification investigation).

**Status:** Active — 2026-06-05. Hierarchy unchanged; per-engine diagnostic row authorized for Sprint 5. **Sprint 5 metric-hierarchy ruling closed.** Promotion of any traffic/engine metric to primary requires a new dated entry superseding 2026-03-02 + 2026-05-30.

---

## 2026-06-05 — Guard-6 hreflang Sweep: Gate hub-page.ts + venue-page.ts to Mirror page.ts; Reconcile llms.txt; Paired Validator Closes the Four-Surface Drift (S175 lagged surface)

**Context:** S175 read-only recon found hub-page.ts (457-459, unconditional el/en/x-default) and venue-page.ts (242,455, hreflang="el") emitting hreflang to dormant bare-root Greek — confirmed in dist/en/concerts/index.html and parallel pages. S144's gated-hreflang fix (2026-05-21) landed in src/templates/page.ts only; hub + venue are the lagged parallel surface. generate-site.ts:1417 (llms.txt) asserts "each English page has bidirectional hreflang tags," consistent with the buggy emitters and contradicting the ruling. This is a live emission contradicting same-week rulings (S144; 2026-06-05 English-flip NO-GO) on the Tier-B crawl-signal axis the dark-engine investigation now turns to (S175 falsified sitemap-starvation at trigger=0).

**Decision:** Lagged-surface regression, not intended scope. GO on a P1 Guard-6 hreflang sweep. (1) Enumerate ALL hreflang emitters before patching — not only the two reported. (2) Route all emission through one gated helper (preferred per S139 decision rule) or gate each site to mirror page.ts identically (fallback + scheduled unification). (3) Mirror page.ts's gated behavior; all surfaces reactivate together on the S144 Decision-4 flip gate — no hardcoded deletion. (4) Derive the llms.txt hreflang claim from the same gate predicate (single source of truth); register the hreflang <link> surface in the S110 manifest with a build-time FAIL invariant: no page class may emit hreflang/x-default while the flip gate is closed.

**Reasoning:** The "page.ts-only intended" branch is falsified — S144 and the 2026-06-05 NO-GO scope hreflang universally; the May-8 principle generalizes to any content-asserting signal; S110 (2026-05-04) already named hreflang <link> as a manifest surface; and hubs are the citation-concentration surface (~74% of citations on top-5 pages), where dormant-Greek hreflang does maximum Tier-B damage. Doc+code agreeing while both contradict the decision is the signature of a non-propagated gate plus stale docs, not a designed exception — same sibling-path drift class as S139 and the 11,217-microdata incident (Guard 6 / shotgun surgery). Severity FAIL: false signal asserted about content = corruption class, parity with location-absence.

**Validation:** grep confirms zero ungated hreflang/x-default emitters across all generators; dist/en/concerts/ and venue pages emit page.ts-identical gated output; build FAILs on any hreflang emission while flip gate closed (regression assert against pre-fix state); llms.txt text matches actual gate state; S110 manifest lists hreflang <link> as a validated surface. On Greek publication, all four surfaces light up together with no further code change.

**Replicability:** SPEC-universal — gate predicate, single-emitter discipline, paired validator are city-agnostic, reading existing primaryLanguage/secondaryLanguage config. Barcelona (es-root+/en/), Berlin (de-root+/en/) identical. DATA-per-city: none.

**Connects to:** 2026-05-21 S144 (/en/ self-canonical + hreflang gate — this enforces its universal scope across hub+venue). 2026-06-05 ChatGPT-Only/English-Flip NO-GO (reaffirms the gate; same Tier-B axis as the dark-engine investigation). 2026-05-08 Bilingual Infrastructure Subset (incorrect-hreflang-worse-than-none origin). 2026-05-04 S110 Coverage Manifest (explicitly anticipated hreflang <link>; paired-validator invariant). 2026-05-20 S139 CollectionPage ListItem (same sibling-path drift + validator-coupling fix shape; decision rule for single-helper-vs-local-gate). Sprint-3 retrospective Guard 6 (four-surfaces-move-together). Three-tier framework (Tier-B crawl signal; hub citation concentration).

**Status:** Decided — 2026-06-05. GO, P1, regression direction. Draft the sweep brief against the four requirements.

---

## 2026-06-05 — /theater Listing Membership Derives From the Comedy-Format Signal, Not EventType (No theater→show Type Mutation)
**Context:** Follow-on to same-day "Stand-up Sets Emit ComedyEvent (@type Derivation Above EventType)." That ruling closed the JSON-LD node set ("zero stand-up leakage into /theater TheaterEvent node set") but not the visible /theater hub listing. If the listing predicate reads event_type='theater', backfilled stand-ups still render in the /theater list while emitting ComedyEvent @type — a node-set-vs-listing drift (S139 / S175 four-surface class). Question raised: change EventType theater→show to evict them from the listing, framed as mistype correction (always allowed) vs hub-driven reclassification (forbidden, tag≠type). Explicitly out of S175 locked scope.
**Decision:** NO type mutation. (1) Not a mistype: EventType is the deliberately-coarse ingestion bucket per the same-day ruling; @type is the truth layer. EventType=theater on a stand-up is the expected coarse state, not a corruption. (2) `show` is foreclosed — rejected same-day as not a valid schema:Event subtype; no /show hub exists in the 18-hub taxonomy. (3) The real residual (visible-listing leak) is fixed by re-keying the /theater and /comedy listing predicates to the single comedy-format signal that already drives @type — never by changing the event's type.
**Reasoning:** Mutating type to relocate a hub IS the tag≠type anti-pattern regardless of the mistype framing. The routing-predicate fix yields identical visible output with smaller blast radius (no badge/filter/membership shotgun surface) and adds no second source of truth to drift against the @type derivation. A theater→show write would also reverse a Decided same-day ruling without superseding justification.
**Implementation:** No data/enum mutation. /theater listing selector excludes comedy-format-detected events (no workPerformed); /comedy includes them; one predicate, both surfaces. S110: paired invariant — events in the /theater visible listing must be a subset of events emitting /theater-eligible @type; build FAILs on a ComedyEvent @type appearing in the /theater listing. Recon gate: grep whether /theater listing reads event_type or derived category before patching.
**Validation:** No event with derived @type=ComedyEvent renders in /theater listing (dist/ spot-check + S110 invariant). Stand-ups appear only in /comedy. TheaterEvent node set unchanged. Build FAILs on injected violation (regression assert).
**Replicability:** SPEC-universal — "hub-listing membership derives from the same single signal as @type; never mutate type to relocate a hub." DATA-per-city — comedy-format heuristics only.
**Connects to:** 2026-06-05 "Stand-up Sets Emit ComedyEvent (@type Derivation Above EventType)" (parent; this closes its implicit listing surface). 2026-05-04 "Emission-Validator Coverage Manifest" (paired-surface invariant). S139 sibling-path drift / S175 four-surface hreflang sweep (same drift class). 2026-02-20 "Finalized 18-Hub Taxonomy" (/comedy→ComedyEvent locked; no /show hub).
**Status:** Decided. Queued after the comedy-format detector + backfill land; out of S175.

---

## 2026-06-05 — Transliteration Variants Go in alternateName, Not the Entity Key (Psyrri/Psiri)
**Context:** ED flags `Psiri` [psiˈri] as the dominant transliteration in tourist/
search content for the Psyrri neighborhood (logged canonical 2026-02-20:
`Psyrri`, Q2984834). Question routed to Strategist: is a GSC query-form check
worth running to decide whether the display/H2 surface should carry `Psiri`?
Entity key + sameAs to stay canonical regardless. Does not touch the current commit.

**Decision:**
1. PRE-REQ — confirm the deployed canonical form first. Log says `Psyrri` (double-r);
   ED note says `Psyri` (single-r). Grep live config + dist/ sameAs. If drifted,
   that entity-consistency fix precedes everything below.
2. No GSC query-form check. Premature on a new domain (thin query volume) and
   off-thesis (GSC = Tier-B Google strings; KPI is Tier-A/C AI citation).
3. Entity layer (`@id` slug, `sameAs` Q2984834, schema `name`) frozen — never
   chases query forms (entity-drift / sameAs-graph failure class).
4. Add `Psiri` + `Ψυρρή` to `alternateName` now — config-driven, all-events
   automatically, attested-not-fabricated, lands the variant in the Tier-A surface.
   No signal gate (same basis as Makrygianni `alternateName: "Acropolis area"`).
5. Body copy carries the dominant variant at least once (canonical-lead,
   variant-in-parens). Strategist constraint; Editorial executes.
6. Primary-display flip (H2 leads with `Psiri`) deferred, trigger-gated:
   reactivation = weekly kpi.db probe shows engines consistently emitting `Psiri`
   when citing Psyrri events. Not the GSC log.

**Reasoning:** This is the 2026-02-20 Makrygianni pattern, not a new problem —
search-form discoverability via `alternateName`, decided on travel-guide evidence
without GSC. `alternateName` captures ~all the citability value at config-level
cost; the display-flip is the only higher-stakes piece, and its payoff is unproven
(genuine GEO unknown), which is exactly why it gates on the AI-probe rather than a
guess. GSC is the wrong instrument: it reports the wrong tier for this project's KPI.

**Validation:** Post-change, neighborhood entity emits `name` (canonical) +
`alternateName` incl. `Psiri`/`Ψυρρή`; `sameAs` Q2984834 unchanged; one untruncated
body mention of the variant. Build invariant: entity `name`/`@id`/`sameAs` for the
neighborhood unchanged by this work (regression assert). Display-flip stays absent
until probe trigger fires.

**Replicability:** SPEC-universal — "transliteration/exonym variants ride on
`alternateName` (config-driven), never the entity key; primary-display flips gate on
AI-citation-probe evidence, not assumption." Generalizes the Makrygianni
`alternateName` rule to all colloquial/transliteration variants. DATA per-city
(Athens Psyrri/Psiri; Barcelona Gràcia/Gracia, Born/El Born; Berlin exonyms).

**Connects to:** 2026-02-20 Makrygianni Resolution (`alternateName` for search-form
discoverability — the precedent). 2026-02-20 Neighborhood Wikidata Mapping (Psyrri
Q2984834 canonical; Gazi/Kerameikos alias-in-editorial-text rule). 2026-05-22 Venue
Slug (entity key is config-curated, never query-derived). Weekly probe / GEO
Monitoring Cadence (the display-flip trigger instrument).

**Status:** Decided — 2026-06-05. Pre-req canonical-form confirmation gates
implementation; alternateName + body-mention authorized; display-flip deferred,
trigger-gated.

---
## 2026-06-05 — S176 /theatre Re-Key Fires in Full; Lifecycle-Masked Clean Node-Set Does Not Retire the Predicate Fix

**Context:** S175-close /theatre recon (recon-gate required by same-day "/theater Listing Membership Derives From the Comedy-Format Signal") found zero stand-up rows in the /theatre ItemList — anchors (Kevin Bridges, Mario Adrion) excluded by lifecycle, NOT by predicate. JSON-LD node-set clean. Sole remnant: Adrion's EventType-driven ΘΕΑΤΡΟ badge/card mechanism, visible-only, latent (no live card currently rendering). Question: does S176 fire the full re-key (re-key listing membership + S110 invariant), or collapse to invariant-only and let the badge ride until the @type re-map handles it?

**Decision:** Full re-key (a). (1) Re-key /theatre + /comedy listing predicates to the comedy-format signal that already drives @type — one signal, both surfaces; no EventType/enum mutation. (2) Badge label re-keys to the same derived signal in the same session (or registers as a third paired S110 surface with explicit trigger if renderer blast radius is non-trivial — recon decides; never left silently EventType-keyed). (3) S110 invariant: build FAILs on a ComedyEvent @type in /theatre listing membership — keyed as a subset assertion (/theatre-listed ⊆ theatre-eligible-@type), node-keyed on @type, severity FAIL. Recon-gate: grep the listing selectors before patching. Reject invariant-only (b).

**Reasoning:** The re-key was already Decided same-day; collapsing to invariant-only reverses a Decided ruling without superseding justification. "Excluded by lifecycle, not by predicate" means the predicate is still event_type-keyed and re-selects on the next upcoming stand-up — a dormant state, not a correct one. The invariant protects the fix from regressing; shipping it without the fix arms a build-halt landmine that detonates at ingestion time on the next live stand-up. Option (b)'s deferral premise is false: the @type re-map froze EventType ("@type derived, not enum-mirrored"), so it never touches the EventType-keyed badge — the badge would ride permanently, an EventType→@type drift of the Guard-6 / 11,217-microdata class the S110 manifest exists to catch. On /theatre the badge is solved by exclusion; on /comedy the relocated card needs the badge label on the single signal too. Subset-keyed invariant guards both ItemList and visible listing in one check; a JSON-LD-only invariant would miss the re-exposing visible-listing surface.

**Validation:** grep confirms listing selectors read derived category post-patch. dist/ spot-check: no derived-@type=ComedyEvent in /theatre listing or ItemList; stand-ups appear only in /comedy; no ΘΕΑΤΡΟ badge on any comedy-format card on either hub. TheaterEvent node-set unchanged. Build FAILs on an injected ComedyEvent-in-/theatre-membership violation (regression assert). S110 manifest lists the membership-subset invariant as validated.

**Replicability:** SPEC-universal — "hub listing membership, @type, and visible category labels all derive from one format signal; a coarse ingestion field must never drive a visible label that contradicts the derived @type; a lifecycle-masked clean node-set does not retire a predicate fix — dormant ≠ correct." Barcelona/Berlin identical. DATA-per-city: comedy-format heuristics, anchor lists.

**Connects to:** 2026-06-05 "Stand-up Sets Emit ComedyEvent (@type Derivation Above EventType)" (parent; EventType frozen — the reason the badge deferral premise fails). 2026-06-05 "/theater Listing Membership Derives From the Comedy-Format Signal" (this fires its queued re-key + invariant; recon-gate now returned). 2026-06-05 Guard-6 hreflang Sweep + S139 + 11,217-microdata (parallel-surface drift class). 2026-05-04 S110 Coverage Manifest (paired membership-subset invariant). 2026-02-20 45-Day Lifecycle (the masking mechanism). `feedback_verify_paths_in_briefs.md` (grep selectors before patch).

**Status:** Decided — 2026-06-05. GO, full re-key. Recon-gate (selector grep) gates the patch; badge-label disposition resolves at recon (in-session re-key vs paired-surface+trigger). Out of S175 locked scope; lands as the queued post-detector/backfill session.

---

## 2026-06-09 — Validity Surface: Zero-Structural-Errors Headline + Enrichment-Gap Rider; Same-Ship Shared-Source Parity Invariant; Gap-Count Ungameable-by-Construction

**Context:** The colophon (87%) and `/proof` ("100% valid") contradicted on the validity figure. Editorial resolved it as a mislabel, not a number bug: two metrics — validity (FAIL-tier structural errors) and completeness (WARN-tier optional-field absences) — were folded into one denominator, producing a spurious 87% "pass rate." Corrected, both surfaces tell one story: 0 structural errors / 3,079 pages, with the 394 optional-field warnings reclassified as an enrichment-gap rider, not validity failures. Editorial's copy is locked verbatim and identical on both surfaces. Three framing questions gated the dev brief; GEO Strategist confirmations follow.

**Decision:**

1. **CONFIRMED — errors-based headline, and it is stronger than "citation-credible."** "Zero structural errors across 3,079 pages" is not merely more favorable than "2,685 of 3,079 (87%)" — it is *tautologically true on any live deploy*. FAIL-tier rules halt the build with non-zero exit (`location` FAILs; 2026-05-25), so a deployed site provably carries 0 FAIL-tier errors. The claim is machine-enforced by the build invariant, not asserted by copy — the most defensible form for Tier-A ingestion. Bare "valid" is retired: ambiguous denominator (valid against what?), and it is the exact token that let WARN-tier counts fold into the validity denominator. **Both displayed metrics MUST derive single-source from the validator's native FAIL/WARN split (`schema-completeness.ts`), never a re-computed pass-rate.** Re-derivation is the bug; forbidding it prevents recurrence.

2. **CONFIRMED — same ship, hardened from deploy-discipline to a structural invariant.** A window where colophon and `/proof` disagree is a citable self-contradiction — the multi-surface-drift class in miniature. Same-deploy is non-negotiable. But "same ship" enforced by deploy timing is the weak form; it reopens on the next careless edit. Strong form, per the Emission-Validator Coverage Manifest (2026-05-04): both surfaces render from ONE shared copy constant (single source) plus a build-time parity invariant that FAILs if the two emitted strings diverge — string-keyed, not page-keyed (cf. node-keyed-not-page-keyed, 2026-05-25). Wiring cost (proof edit + colophon wiring + shared source + parity invariant + S110 registration) accepted as a chosen constraint: it is the guardrail against the exact drift the contradiction exposed, not a one-line swap.

3. **CONFIRMED — publish the 394; ungameable by construction, with two pre-registered guards.** Surfacing the gap-count is anti-Goodhart; concealment is the Goodhart move. Against the locked four-test rubric (2026-06-04), the "ungameable" leg passes *structurally, not by promise*: per Schema Quality Over Presence (2026-03-02), placeholder/minimal schema scores 31.8% vs ~36% for no schema — an 18-point penalty. The only gaming move (emit placeholder fields to clear warnings) is self-punishing on the primary KPI (citation rate). The sole rational path to a lower 394 is genuine enrichment — the pull toward the core equation. Two guards:
   - (a) **Reduction-path lock** — 394 falls ONLY via real enrichment. Warning-suppression, threshold-redefinition, and placeholder/empty-field emission to clear a warning are forbidden (restates honest-absence-over-fabrication; empty `[]` worse than omission; 2026-03-02 penalty).
   - (b) **Inflow-aware interpretation** — the Constitution permits events to deploy un-enriched, so new events continuously add WARN-tier gaps. Raw 394 can RISE while the engine improves. The honest health signal is gap-rate / backlog burn-down against the ~828-event backlog, not the raw count in isolation. This interpretation lives in the measurement layer and this log — NOT on the locked public surface.

**Pre-dev verification gate (verification, not a bounce):** confirm before the brief locks that (i) the published 394 equals the validator's derived WARN-tier count single-source (not hand-maintained), and (ii) Editorial's locked rider frames 394 directionally and does NOT state or imply zero-as-destination. Zero is not a truthful floor — honest-absence fields (e.g., genuinely no named performer) never close, so a zero-target reintroduces fabrication pressure. If the rider implies zero-target, that one phrase bounces to Editorial; all other framing stands.

**Reasoning — failure modes traced:** (a) *87%-as-validity* publishes a false weakness into Tier A — a skeptical engine extracts "self-reports 13% failure"; cause is the fold, fix is single-source FAIL/WARN derivation. (b) *Sequential ship* leaves an inter-deploy window whose crawl ingests a self-contradiction; shared-source + parity invariant closes it permanently. (c) *Naked gap-count* without guard (a) pressures fabrication → 18-point self-inflicted citation penalty; without guard (b) a healthy batch of new events reads as regression → pressure to throttle freshness (a core-equation leg) or rush-fabricate.

**Implementation spec (Dev Planner, against Editorial's locked copy):** (1) one shared copy constant for the validity string; colophon and `/proof` both render from it; counts interpolate from the validator FAIL/WARN output, not re-computed. (2) Edit `/proof`'s "100% valid" → locked string in the SAME deploy as the colophon wiring. (3) Build-time parity invariant: FAIL if colophon-string ≠ proof-string (string-keyed); register the surface pair in the S110 Coverage Manifest. (4) Confirm 394 = live WARN count single-source; confirm rider is directional (verification gate).

**Tradeoffs:** Real dev session, not a swap (accepted — it is the drift guardrail). Public 394 invites scrutiny (intended — honest pressure). Inflow makes raw 394 noisy as a public trend (mitigated: interpretation stays internal; public surface shows the honest point-in-time count only).

**Validation:** Build green ⇒ 0 FAIL-tier errors (headline self-true). Parity invariant present and FAILing on injected divergence (test). Both surfaces identical post-deploy (no drift window). 394 traces to validator WARN output. Over time: 394 burns down with the backlog; gap-rate (not raw count) is the tracked health metric.

**Replicability:** Fully SPEC-universal. Headline form, single-source FAIL/WARN derivation, shared-copy + parity invariant, and ungameable-gap-count governance transfer identically to agent-barcelona / agent-berlin. DATA per-city: the three numbers (page count / 0 / gap count) interpolate from each city's own validator. No Athens hardcoding.

**Connects to:** 2026-03-02 Schema Quality Over Presence (18-point penalty → ungameable-by-construction); 2026-04-28 Offers Implementation Spec (Required-FAIL vs Recommended-WARN taxonomy); 2026-05-04 Emission-Validator Coverage Manifest (parity-invariant pattern); 2026-05-21 `/proof` EN-Primary (surface edited); 2026-05-25 location FAILs / endDate WARNs (live FAIL/WARN split — single-source basis); 2026-05-25 Location Build-Halt Node-Keyed (invariant scoping); 2026-06-04 Viber Pre-Registration (four-test rubric); 2026-03-02 Citation-as-Visibility KPI / 2026-05-30 GA4 Secondary (citation-impressions primary).

**Status:** Confirmed — routes to Dev Planner for the validity brief against Editorial's locked copy, subject to the pre-dev verification gate. No framing amended; no Editorial bounce.

---

## 2026-06-09 — Validity Reconciliation: completeness-reporter Is a Forbidden Re-Derived Source; passClean Re-Sourced; Parity ≠ Truth

**Context:** Pre-brief reconciliation of the same-day Zero-Structural-Errors ruling surfaced two distinct "fail" definitions in the build: (1) `schema-completeness` failCount — FAIL-tier, build-halting, the basis of "true by construction"; (2) `completeness-reporter` buckets in `build-completeness.json` (`events.totals.fail=6`, `hubs.fail=2`, non-zero at HEAD), from which `/proof`'s `passClean` currently reads. The locked headline assumed definition (1) at zero; `/proof` is wired to (2), non-zero — meaning `/proof` may currently render "open issues," not "100% pass." `build-completeness.json`/`completeness-reporter` appear nowhere in this log or the infrastructure register.

**Decision:**
1. **Definition is not a new fork — it is already locked.** "Structural error" = `schema-completeness` failCount (def. 1); the 394 rider = `schema-completeness` warnCount (def. 1, WARN tier). The `completeness-reporter` (def. 2) is the "re-computed pass-rate" the parent ruling forbade as a source. It is removed from the public-surface path; `/proof`'s `passClean` is re-sourced onto the validator's native FAIL/WARN output. Not a label swap — a re-source.
2. **Pre-brief verification gate (live, single-source, no inference), three outcomes:** trace what `events.totals.fail`/`hubs.fail` actually count (which nodes, which fields); confirm the FAIL path is wired to non-zero exit on this build and the deploy did not bypass a halt; confirm the validator's own failCount on deployed `dist/` is 0. Outcome A (6/2 are WARN-class enrichment gaps) → headline true, copy stands, proceed to wiring. Outcome B (build-halt bypass) → fix the invariant hole first. Outcome C (6/2 are uncaught required-field defects the reporter catches but the validator doesn't) → validator-scope-narrower-than-emission-scope gap (§2(d) class); headline blocked until those nodes are fixed or promoted into the schema-validator FAIL tier.
3. **Copy stands (conditional on Outcome A); no Editorial bounce.** The headline's referent was always the validator FAIL count (0 by construction). The 6/2 were never its subject. The defect is `/proof`'s render source, fixed in code.
4. **Sequencing — parity guarantees agreement, not truth.** Strict order: re-source both surfaces onto the validator FAIL/WARN split → confirm both the 0 and the 394 trace to `schema-completeness.ts` (not `build-completeness.json`) → only then arm the string-keyed parity invariant. Parity-locking a completeness-reporter-sourced string would harden a falsehood byte-identically.

**Reasoning:** A second module emitting an independent verdict on the same nodes is an unparented re-derivation — the exact silent-drift class S110 exists to catch. Disagreement between the two "fails" is not a definition ambiguity; it is the symptom the single-source mandate was written to eliminate. The deductive prior (FAIL halts build; site deployed ⇒ 0 FAIL-tier) is strong but is not a substitute for the live check, and does not by itself exclude Outcomes B/C — both of which would make the live render, though not the copy, unbackable.

**Validation:** Recon classifies all 8 reporter-fails against the Schema Completeness Checklist. Validator native failCount on deployed dist/ confirmed 0. Post-fix: `/proof` and colophon both interpolate from the validator FAIL/WARN output; grep confirms no public surface reads `build-completeness.json`. Parity invariant FAILs on injected divergence — armed only after re-source lands.

**Replicability:** SPEC-universal — "any second pass/fail scorer on the same nodes is a forbidden public source unless reconciled to the validator tiers in the S110 manifest; parity guarantees agreement, not truth — re-source before parity-lock." Transfers to Barcelona/Berlin unchanged. DATA per-city: none.

**Connects to:** 2026-06-09 Validity Surface: Zero-Structural-Errors Headline (parent — reaffirmed, not superseded); 2026-05-25 location FAILs Build / Non-Zero Exit (the build-halt basis of "true by construction"); 2026-05-04 Emission-Validator Coverage Manifest as Build Invariant (§2(d) validator-scope drift; single-source registration); 2026-05-21 `/proof` Schema.org Type (variableMeasured↔rendered parity precedent).

**Status:** Decided — 2026-06-09. Routes to Dev Planner subject to the three-outcome verification gate. Copy unamended pending Outcome A confirmation; wiring (re-source → trace → parity-lock) sequenced strictly in that order.

---

## 2026-06-09 — All-Class failCount==0 Build Invariant: Native Promotion Subsumes the Detail-Page Location Hard-Stop; Staged; Colophon Downstream

**Context:** The pre-brief verification gate (2026-06-09 Validity Reconciliation, three-outcome) resolved to Outcome C, widened. Two findings. (1) Production frozen since Jun 8 (~26h+) on 6 detail-page streetAddress FAILs — drift venues missing streetAddress in athens-venues.json; the location FAIL gate (2026-05-25) firing as designed; fix is config backfill (execution, no ruling). (2) The "zero structural errors" guard is NOT the validator's native failCount — it is a detail-page-only, location-substring hard-stop. Hub-class and other-field FAIL-tier errors ship UNGATED (today: 4 CollectionPage streetAddress FAILs; generally offers/startDate/FAQPage on any non-detail page). The guard is a strict subset of the claim it backs: it passes green while "zero structural errors across 3,079 pages" is false off-slice. This falsifies the parent ruling's premise ("FAIL halts build ⇒ deployed ⇒ 0 FAIL-tier") as implemented — exactly the deductive-prior-is-not-the-live-check risk the re-source entry named.

**Decision:**

1. **(a) CONFIRMED — promote to all-class native failCount==0.** Re-architect the gate to read schema-completeness.ts native failCount across ALL nodes, ALL page classes, EVERY FAIL-tier rule; halt iff failCount > 0. Deletes the detail-page filter and the location-substring match. The gate, the colophon, and /proof all read the ONE failCount (single-source extended to the gate): build green ⟺ failCount==0 ⟺ the published number. For streetAddress this is conformance, not new policy — 2026-05-25 (Node-Keyed) already ruled the halt node-keyed across all emission sites; the shipped detail-only gate violated it and the 4 hub FAILs are that latent bug.

2. **(b) CONFIRMED — staged, green→green, colophon gated on catalogue-complete.** No big-bang flip onto an unknown freeze surface. The colophon is downstream and blocked regardless, so there is no timeline pressure for full coverage. Staging:
   - **Stage 1 — location/streetAddress, all-class.** Sequenced strictly AFTER all streetAddress drift is backfilled clean (6 detail via Finding 1 + the 4 hub nodes folded into its scope or a same-pass follow-on). Backfill-then-promote: the flip is a no-op on deploy state; regression assert runs on a clean baseline.
   - **Stages 2…N — one FAIL-tier rule (or small batch) per stage,** each gated on a per-rule recon confirming that rule's all-class node-set is clean (or backfilled clean) before promotion. Discovers the latent FAIL surface incrementally, never flips onto an unknown freeze.
   - **Catalogue authority:** the FAIL-tier set to promote = every rule registered FAIL-tier in the S110 Coverage Manifest, enumerated by recon — NOT hand-authored here. Single-source catalogue; staging walks it.
   - **Hard gate:** no partial-gate state licenses the colophon. "Zero structural errors" is citable-by-construction ONLY after the final stage makes the gate native failCount==0 across the full FAIL-tier registry. A half-closed gate read as "true" is a forward-orphan; dormant ≠ correct.

3. **(c) ACCEPTED — wider freezes are the feature.** A FAIL-tier finding means the page would emit wrong/invalid structured data; halting prevents shipping it into Tier A (wrong > empty > omit). Per 2026-05-25 deploy-atomicity: non-zero exit keeps the prior good deploy live; cost is recoverable staleness, strictly better than a broken node. The freeze converts silent-wrong (broken schema + false colophon) into loud-stale (visible build FAIL), which forces the fix. Two boundaries:
   - **WARN never freezes.** Invariant is failCount==0, NOT warnCount==0. The 394 enrichment-gap rider is warnCount; un-enriched events still deploy (Constraint 3). Freezing on WARN would pressure fabrication.
   - **Front-stop the freshness bleed (recommendation, adjacent execution):** a config-load invariant — no venue enters the pipeline without streetAddress — stops the streetAddress drift class BEFORE it freezes the daily deploy. The build failCount==0 gate is the correctness back-stop; the config invariant is the freshness front-stop. Both infrastructure-over-content.

**Colophon disposition:** stays blocked, now explicitly downstream of catalogue-complete. The locked re-source → trace → parity-lock sequence (2026-06-09 Reconciliation) sits behind the final stage: re-sourcing passClean onto native failCount is safe-on-every-deploy only once the gate halts on native failCount > 0. The 4 live colophon stats are unaffected and honest; this blocks only the 5th.

**Reasoning — failure modes traced:** (a) *Subset-guard-as-validity-claim* publishes a false machine-enforcement claim into Tier A — "zero structural errors" enforced only over detail×location, asserted over 3,079×all-rules; cause is the detail/substring special-case, fix is native failCount==0. (b) *Big-bang flip* freezes simultaneously on every latent FAIL across an unmeasured surface — an availability cliff with no warning; staged green→green discovers the surface incrementally. (c) *warnCount in the gate* would block constitutional un-enriched deploys and pressure placeholder emission → the 18-point self-inflicted citation penalty (2026-03-02). (d) *Colophon unblocked on a partial gate* re-publishes the falsehood the verification gate just caught; catalogue-complete is the only honest trigger.

**Implementation spec (Dev Planner):** (1) Replace the detail-page/location-substring hard-stop with a native gate: `exit 1` iff schema-completeness.ts failCount > 0, all nodes/classes/rules. (2) Stage 1: expand the Finding-1 backfill to all 10 streetAddress drift nodes (6 detail + 4 hub) → verify clean → land the all-class streetAddress promotion + regression assert (synthetic hub-node streetAddress strip ⇒ build halts) in the same change. (3) Stages 2…N: recon the S110 manifest FAIL-tier registry; per rule, confirm/backfill clean, then promote class-agnostic with a regression assert. (4) S110 manifest: record the gate's scope as node-keyed/class-agnostic native failCount; retire the detail-page/substring scoping note. (5) Recommend (not gate) the venue-config streetAddress load invariant as the freshness front-stop. (6) Colophon wiring remains blocked; unblock trigger = gate native failCount==0 across full FAIL-tier registry.

**Tradeoffs:** Wider freeze surface (accepted — it is correctness enforcement; mitigated by green→green staging + config front-stop). Multi-session staged rollout vs one flip (accepted — colophon has no deadline; big-bang risk is unbounded). Deletes a working-on-its-slice special-case (intended — the slice was the bug).

**Validation:** Per stage: build FAILs on a synthetic FAIL-tier strike for that rule on a non-detail class (regression assert); build PASSES on the clean backfilled baseline. Final: gate halts on native failCount > 0 anywhere; build green ⇒ failCount==0 ⇒ headline self-true; grep confirms no detail-page/substring scoping remains. WARN strike (e.g., stripped exhibition endDate) does NOT freeze (regression assert). Only after final stage: colophon re-source → trace → parity-lock proceeds.

**Replicability:** Improves it. Native failCount==0 is pure SPEC — deletes the detail/location special-case (DATA-shaped) for the validator's own tier output. Transfers to agent-barcelona / agent-berlin unchanged; the three published numbers (pages / 0 / gap) interpolate per-city. DATA per-city: none.

**Connects to:** 2026-06-09 Validity Surface: Zero-Structural-Errors Headline (parent — premise repaired, not superseded; supplies the missing all-class mechanism behind "true by construction"); 2026-06-09 Validity Reconciliation: completeness-reporter Forbidden / passClean Re-Sourced (the verification gate this is Outcome C of; re-source → trace → parity-lock sequenced behind catalogue-complete); 2026-05-25 location FAILs Build / Non-Zero Exit (deploy-atomicity freshness reasoning; FAIL/WARN tier split — WARN never freezes); 2026-05-25 Location Build-Halt Node-Keyed (the already-Decided node-keyed scope this gate conforms to); 2026-05-04 Emission-Validator Coverage Manifest as Build Invariant (§2(d) validator-scope-narrower-than-emission-scope drift; manifest = FAIL-tier catalogue authority); 2026-05-20 S139 CollectionPage emitted-Offer-shape both-surfaces coupling (a FAIL-tier rule in the staging set); 2026-03-02 Schema Quality Over Presence (18-pt penalty — why WARN must stay out of the gate); Constitution Constraint 3 (enrichment non-gating — un-enriched deploys protected).

**Status:** Decided — 2026-06-09. (a) all-class native failCount==0 confirmed; (b) staged green→green, colophon gated on catalogue-complete; (c) wider freeze accepted, WARN excluded, config front-stop recommended. Routes to Dev Planner: Finding-1 backfill expands to all 10 streetAddress nodes → Stage 1 promotion + regression assert → staged FAIL-tier walk of the S110 manifest. Colophon stays blocked downstream.

---

## 2026-06-09 — Bare-Root Dormant-Greek Hubs: robots-meta Surface Never Received the Dormancy Signal the Sitemap Has; noindex via the Single Flip-Gate Predicate; Guard-6 Continuation (Drift Closure, NOT a Posture Change)

**Context:** Bing flagged ("High") that bare Greek hub `/today` is 200, self-canonical, emits no robots meta (fully indexable) — yet is dropped from all 3 sitemaps. Indexable + self-canonical + sitemap-absent is an internal contradiction. Same state hits all 24 bilingual bare-root hubs (today, this-week/weekend/month, next-month, concerts, exhibitions, theatre, cinema, dance, comedy, classical-music, greek-music, nightlife, kids, festivals, open, with-ticket, about, editorial, corrections, colophon, proof, saved); `/today` is just the first Bing surfaced. The sitemap drop is S144 D3 (`generate-sitemaps.ts` filter on `bilingualHubSlugs`, reported `:136-139`), whose comment assumed the Greek alternate was "noindex/dormant" — but the noindex was never emitted to output. Request arrived framed as a re-open of Greek-hub dormancy (A first-class / B noindex / C cross-locale canonical). Recon refutes the re-open premise: dormancy is locked and thrice-reaffirmed.

**Decision:** Resolution B, reframed. This is **surface drift, not a posture choice**. Greek-hub dormancy is settled (S144 D2: bare-root = real dormant Greek, curled case (d), do not activate; reaffirmed 2026-06-05 English-Flip NO-GO with Sprint 4 closing on it). The defect is that the dormancy signal reached the sitemap surface but never the robots-meta surface — same class as S175 (hreflang), the 11,217-microdata incident, and S139. Fix: emit `<meta name="robots" content="noindex, follow">` on bare-root dormant-primary-locale hubs, derived from the **same flip-gate predicate** that gates hreflang (S175) and sitemap exclusion (S144 D3) — single source of truth, no parallel "isDormant" flag. Self-canonical stays self-referential (not cross-locale; eases the flip). On gate open (Greek published + quality-gated), the same predicate reverses noindex→index, sitemap-out→in, hreflang-off→on, together (S144 D4); no hardcoded deletion. Enumerate ALL bare-root dormant-locale emitters before patching (24 hubs + combo pages `/concert-this-week` etc.), patch the class. A and C rejected.

**Reasoning:** A (Greek first-class) reverses S144 + the 2026-06-05 Sprint-4-closing NO-GO, ships un-quality-gated Greek (the 2026-05-08 "incorrect/low-quality signal worse than silence" failure in a new mode), and chases Greek human-search — not a promotable KPI; the only live-biting engine (ChatGPT, 100% of AI-referral) ignores language signals, so A buys zero on the live channel and risks the dormant cluster. C is a cross-language canonical: "cross-language canonical would deindex Greek and invalidate the cluster (confirmed Google guidance)" (2026-06-04 §; English-default analysis) — corrupts the future cluster, fragile (conceded), and as a hint not a directive doesn't clear the indexability contradiction. B with single-predicate derivation is the only option that (i) honors the locked gate, (ii) resolves Bing's contradiction (noindex + sitemap-absent is consistent), and (iii) closes the drift class at its root by making robots-meta + sitemap + hreflang read one predicate.

**Implementation:**
1. Phase-1 grep (verify-before-inferring): confirm `generate-sitemaps.ts` filter lines, `bilingualHubSlugs` membership, the bare-hub robots-meta gap, and the exact S175 flip-gate predicate name. Source not in /mnt/project; reported lines unconfirmed.
2. Route bare-root dormant-locale robots-meta through the single gated helper keyed on the S175 flip-gate predicate (per-surface mirroring is fallback). Emit `noindex, follow`.
3. Self-canonical unchanged (self-referential).
4. Inverse-on-flip wired to the same predicate (no hardcoded deletion).
5. Enumerate + patch the full bare-root dormant-locale class (24 hubs + combos + any others), not `/today` alone.
6. S110 invariant, node-keyed to the dormant-locale bare-root page class: gate closed → MUST noindex AND MUST be sitemap-absent (FAIL otherwise); gate open → MUST NOT noindex AND MUST be in sitemap + hreflang. Validator scope = page class, matching emission scope.

**Validation:** curl `/today` + sample of the 24 → 200, `noindex, follow`, self-canonical, absent from all sitemaps; Bing re-crawl clears the High flag; `/en/` hubs unchanged (indexable, self-canonical, in sitemap); build FAILs on any indexable dormant bare-root hub and on any such hub in a sitemap; grep confirms robots-meta + hreflang + sitemap-exclusion read one predicate.

**Replicability:** SPEC-universal — "dormant primary-locale bare-root pages emit `noindex,follow`, stay out of the sitemap, emit no hreflang; all three derived from the single locale-publication flip-gate predicate and reversing together on publication." DATA-per-city: none; predicate reads existing `primaryLanguage`/`secondaryLanguage`/`primaryPath`/`secondaryPath`. Barcelona (es-root) / Berlin (de-root) identical. No Athens hardcoding.

**Connects to:** 2026-05-21 S144 "/en/ Self-Canonical + Indexable" (D2 dormant bare-root; D3 sitemap rule + "dormant Greek whether noindex or pre-review does not qualify"; D4 flip gate; D6 single-source-of-truth predicate). 2026-06-05 "English-Flip NO-GO" (reaffirms gate; Sprint 4 closed on it; 100%-ChatGPT live read). S175 "Guard-6 hreflang sweep" (same flip gate; single gated helper; enumerate-all-emitters; S110 invariant pattern — this is its robots-meta sibling). 2026-05-08 "Bilingual Infrastructure Subset" (incorrect/low-quality signal worse than silence). 2026-02-20 "45-Day Event Lifecycle" (`noindex, follow` convention). 2026-05-04 S110 "Emission-Validator Coverage Manifest" (paired node-keyed build-FAIL invariant). 2026-05-23 "Declared Canonical Normalizes to Served" (orthogonal-axis discipline). 2026-05-25 filter-chip combo-page entry (combos are part of the dormant bare-root class).

**Status:** Decided — 2026-06-09. Resolution B as drift closure. Blocked only on Phase-1 grep confirming the flip-gate predicate name and the full emitter enumeration. Session-label note: do NOT reuse "S101b" (occupied by 2026-05-04 cancelled-events); assign a fresh S-number.

---
## 2026-06-12 — A2 Surface Audit Routing Packet: Five Citability-Semantics Rulings (G1 NULL-endDate Assertion; G2 Meta-Keywords Vocabulary; G3 noindex-in-Sitemap Severity/Sequencing; G4 llms.txt Venue-Claim; G5 "Εως"-Only Description Field)

**Context:** Dev Planner relay (2026-06-10), sourced from read-only output-surface Audit A2 (`specs/audit-A2-surface-geo.md`) of `dist/`. Five rulings requested; implementation stays with Dev Planner. G1 and G5 BLOCK the next dev session (F2 "Εως"→end_date extraction / F3 lifecycle end-date-awareness); G2–G4 non-blocking. Findings: F3 — 34 live exhibitions with NULL end_date, currently emitting false `eventStatus: EventCompleted` days after opening (e.g. Barbara Kruger, opened 2026-06-04, end unknown). F8 — "δωρεάν"/"free" on 388 pages, exclusively inside `<meta keywords>` synonym lists; zero in JSON-LD, price labels, or visible copy. F4 — 422 EL event pages (41% of EL sitemap-events) carry `noindex` (lifecycle Cooling) while present in the sitemap, violating the build's own in-sitemap⟹indexable invariant; the enforcing validator covers a different page class. F7 — llms.txt header asserts "308 events across 38 venues" where 38 = venue-*page* count while listed events span ~111 distinct venues (~3× understatement). F2 — 11,526 rows carry run-end prose ("Εως 2026-06-30", 14 chars) as the ENTIRE description, emitted verbatim as JSON-LD `description` on 763 live pages.

**Decision:**

**G1 (BLOCKING) — NULL end_date assertion policy: Option (b), refined, type-branched.** When `end_date` is NULL: always **omit `endDate`** (honest absence; never synthesize). For `eventStatus`, branch on whether the event type implies a run:
- **Run-implying types** (exhibition, theater, festival — config set `runImplyingTypes`): emit `eventStatus: EventScheduled` while the event is within a presumption window `startDate + presumed_run_days`; once past that window, **omit `eventStatus` entirely**. Never assert `EventCompleted` on a NULL-end event from presumption alone.
- **Point-in-time types** (concert, screening, talk): NULL `endDate` is expected, not a gap; `endDate` omitted; `eventStatus` follows the existing start-date-anchored lifecycle unchanged (Scheduled → Completed in Just-passed). This path is already correct; the F3 bug is the run-implying path only.

`presumed_end = startDate + presumed_run_days` is the single synthetic basis and feeds the **same** lifecycle state machine that drives `noindex` (no parallel "isPresumedLive" flag). **Lifecycle guardrail:** presumption may gate `noindex`/Cooling for a NULL-end run-type event, but MUST NOT escalate to Archive/410 — removal of a possibly-live page requires a real `endDate`. Corrects the packet's cost-framing: per the 2026-03-02 fallback clause, honest omission of a genuinely-absent field is the *sanctioned* state ("field absent = acceptable"), **not** the 18-point penalty — that penalty attaches to generic/required-only/placeholder schema ("field present but empty/generic"), which is exactly what the false `EventCompleted` is.

**G2 (non-blocking) — Meta-keywords vocabulary: RETIRE the surface; banned-vocab rule is assertive-surface-scoped (question moot).** The open/with-ticket banned-vocabulary rule governs **assertive** surfaces — JSON-LD (`isAccessibleForFree`), URLs, page titles, filter chips, price labels, `<meta name="description">`, visible copy — and does not, by its own terms, reach `<meta keywords>` (a non-assertive retrieval-hint surface). But the δωρεάν-in-keywords question is moot: the synonym-stuffed `<meta keywords>` tag is to be **removed from the template** (all 388 pages, one emitter change). Current evidence: no target AI engine reads meta keywords, no search engine has used it as a positive signal since 2009, and Bing — the Tier-B index path for Perplexity/Copilot — has stated that excessive meta keywords may be flagged as spam. The tag therefore carries zero retrieval benefit and a documented downside on our secondary-KPI surface. δωρεάν/free remain banned on all assertive surfaces (restated). Do **not** migrate the synonyms anywhere: Greek-human-search query-matching is off-thesis versus the AI-citation KPI (per the locked KPI hierarchy and the GSC-is-the-wrong-instrument precedent). Fallback if the tag is retained for an unrelated reason: the synonym list (including δωρεάν/free) must still be stripped — minimal/non-stuffed only.

**G3 (non-blocking; sequencing call) — noindex-in-sitemap: bounded Tier-B signal, NOT crisis-grade; ride the F2 session on Guard-6 discipline.** The contradiction is the 45-Day Lifecycle Cooling rule ("remove from `sitemap-events.xml` when `noindex`") **drifting on the EL-sitemap sibling surface** — the same emission/validation sibling-path drift class as S139 (CollectionPage ListItem) and S175 (hreflang). Severity from the citability side: real but **bounded** — sitemap↔robots contradiction damages crawl-trust on the search-index path (Tier B, ~8%), while Tier A (~89%, training crawl) is largely indifferent to sitemap-noindex contradiction. Not catastrophic in isolation, and F2's end-date backfill reclassifies ~214 of the 422 as live first, shrinking the set. **Ruling: fix rides in the F2 session — not on severity, on Guard-6 / single-source-of-truth discipline.** F2 already makes the lifecycle `endDate`-aware and touches the exact membership predicate; splitting the fix leaves a half-corrected intermediate through a deploy cycle. Sitemap membership must derive from the same lifecycle predicate that gates `noindex`; the in-sitemap⟹indexable invariant must be extended to the EL event-page class (the validator covering "a different page class" is the bug).

**G4 (non-blocking) — llms.txt venue claim: canonical metric = distinct venues hosting listed events; derived counter; drop the page-count number.** The headline venue metric is **distinct venues of listed events** (~111), not venue-*page* count (38). Phrasing: `"{event_count} events across {distinct_venue_count} venues"`. The counter MUST be **derived at build** from the events table (same single-source-of-truth discipline that reconciled the llms.txt hreflang claim in S175), never hardcoded. Venue-page count is an internal architecture metric, not a citation-surface claim — **omit it from llms.txt** (do not advertise the page-coverage gap; do not add a second number that invites the same drift). This is a correctness/maintenance fix to a false claim on a citation surface (an understated/unsubstantiated number is the /proof-D1 failure class), explicitly **not** llms.txt investment (consistent with "Maintain, Don't Invest").

**G5 (BLOCKING) — "Εως {date}"-only description: Option (c), refined → extract, strip fragment, omit-if-empty.** Always extract the date into `end_date` (F2 scope). Then strip the `"Εως {date}"` fragment from the description string:
- If the remainder is empty/whitespace → the `description` property is **omitted entirely** from JSON-LD (NOT emitted as `""`; no empty container, no placeholder). The event becomes enrichment-eligible (honest-empty-state; enrichment fills later, non-blocking to deploy).
- If the remainder is substantive prose → keep the cleaned prose as `description` (the now-redundant trailing "Εως" fragment removed, since `end_date` carries it structurally).
Never emit a description that is solely a date fragment: a 14-char date string is "present but generic/empty" — the worst case, matching the 18-point-penalty profile and looking auto-generated. Honest absence beats it.

**Standing items (carried forward, no new ruling):** QID drift-gate cadence/severity policy and multi-edition `sameAs` ambiguity routing remain pending per prior relays; packet flags no action needed if in flight.

**Reasoning:**
- **G1.** Three precedents force omit-over-assert: the 2026-03-02 fallback ("omit that specific property rather than placeholder"; "field absent = acceptable" vs "field present but empty/generic = penalty risk"); the 2026-05-18 validFrom ruling (omitting a *recommended* property is a cosmetic warning, not a rich-result/citation penalty — `endDate` and `eventStatus` are recommended, not in Google's required Event set, so omission does not break rich-result eligibility); and omit-beats-fabricate / silence-beats-false-signal in Tier A. False `EventCompleted` on a live event is the catastrophic outcome — it tells engines the event is over, evicting it from "current/upcoming" and killing citation for a running event. The presumption-window-then-silence model asserts only what we have honest basis for (a typical run is underway) and goes silent rather than fabricate either direction. Tying `presumed_end` to the shared lifecycle state machine follows the 2026-05-21 single-source-of-truth guard (the phase predicate must read one state machine "or the two drift and fight on edge dates"). The Archive/410 guardrail applies "wrong assertion worse than missing" to the page's existence: presumption may dim a page (noindex) but must not delete a possibly-live one.
- **G2.** The banned-vocabulary rule's purpose is to govern how agent-athens *asserts* pricing framing (open vs free); `<meta keywords>` asserts nothing about an event — it is a (dead) retrieval-hint container. So the rule does not reach it. But applying the project's own "don't invest in dead surfaces" logic plus current external evidence: the surface has zero retrieval value across all target engines AND a Bing spam-flag downside on the Tier-B path. Carrying a banned term inside a spam-risk dead tag is the worst of both; removing the tag resolves the vocabulary question, the spam risk, and a future-leakage vector (synonyms copied into an assertive surface) in one infrastructure change. The "δωρεάν capture" need is illusory for this project: the live engine (ChatGPT, 100% of AI-referral) ignores language signals and the KPI is AI citation, not Greek human-search.
- **G3.** Tier-weighted blast radius is the calibrating lens: the harm (sitemap-trust erosion) lands almost entirely in Tier B; Tier A ingestion does not depend on sitemap-noindex consistency. That makes the contradiction elevated-hygiene, not a crisis — but the Guard-6 sibling-surface pattern (S139/S175) says fix drift at its root and sweep all siblings in the pass that already touches the predicate. F2 is that pass. Deferring would re-open the same code in a later session and ship an intermediate state that still contradicts the build's stated invariant.
- **G4.** A wrong number on a primary GEO citation surface is the same failure class as an unsubstantiated AI-citation count on /proof (D1: "an unverifiable or fabricated number is worse than its absence" on a credibility surface). The honest, more useful, and more impressive metric is coverage breadth (distinct venues), which is exactly what an engine needs to judge "does this source cover venue X?". Deriving the counter prevents recurrence of the same hardcoded-claim-drifts-from-truth defect S175 fixed for the hreflang line of the same file.
- **G5.** Identical to G1's spine on the description surface: the date-only string is "present but generic" — the 18-point-penalty profile — so it is strictly worse than honest omission. Option (c) over (a) preserves real prose where the "Εως" is a suffix; the omit-if-empty refinement (no `description: ""`) follows the 2026-03-02 fallback and /proof-D1 "no empty container."

**Implementation (specs for Dev Planner → Claude Code):**
- **G1.** (1) Add config `runImplyingTypes` (SPEC-universal default: `["exhibition","theater","festival"]`) and `presumed_run_days` (SPEC-universal default 90; per-type override permitted, per-city override permitted if a city's data shows different run norms). (2) Emission: NULL `end_date` → never emit `endDate`. For run-implying types: emit `eventStatus: EventScheduled` iff `now <= startDate + presumed_run_days`, else omit `eventStatus`. For point-in-time types: unchanged. (3) Compute `presumed_end` once; the lifecycle state machine consumes it for NULL-end events. (4) Guardrail: lifecycle may not emit 410/Archive for a NULL-end event lacking a real `endDate` (cap at Cooling/noindex). (5) S110: register the NULL-end assertion surface; build-FAIL on any `eventStatus: EventCompleted` emitted for a row with NULL `end_date`; build-FAIL on any synthesized `endDate`. (6) Recon gate (verify-before-inferring): grep the current lifecycle/eventStatus emitter to confirm how NULL `end_date` resolves to `EventCompleted` before patching.
- **G2.** Remove the `<meta keywords>` emission from the page template (single emitter; covers all 388 pages and future pages). Recon gate: grep the template to confirm the keywords emitter and that δωρεάν/free occur only there before removal. No assertive-surface changes.
- **G3.** Rides the F2 session. Sitemap-events membership predicate consults the lifecycle state machine (exclude Cooling/Archive). Extend the in-sitemap⟹indexable build invariant to cover the EL event-page class (close the "different page class" validator gap); register in S110 so emission and validation scopes match. Verify the ~214 F2-reclassified rows re-enter as live (indexable + in sitemap) and the residual Cooling set is sitemap-absent.
- **G4.** Add a build-time derived counter `distinct_venue_count` = COUNT(DISTINCT venue) over listed events; render llms.txt header as `"{event_count} events across {distinct_venue_count} venues"`. Remove the venue-page-count number from the header. Recon gate: confirm the current llms.txt counter source.
- **G5.** F2 parser: extract trailing/standalone `Εως {date}` → `end_date`. Post-extraction, strip the `Εως {date}` fragment from `description`; if `trim(description)` is empty → omit the `description` property from JSON-LD and flag the row enrichment-eligible; else keep the cleaned prose. S110: build-FAIL on any JSON-LD `description` whose value matches the bare-date-fragment pattern; build-FAIL on `description: ""`.

**Validation:**
- **G1:** curl Barbara Kruger + sample of the 34 → no `endDate`, `eventStatus: EventScheduled` while within window, no `eventStatus` after; zero `EventCompleted` on NULL-end rows; build FAILs on injected `EventCompleted`-with-NULL-end and on synthesized `endDate`; no NULL-end page returns 410.
- **G2:** rendered HTML across a page sample emits no `<meta keywords>`; grep confirms δωρεάν/free absent site-wide outside (now-removed) keywords; assertive surfaces unchanged.
- **G3:** post-F2, zero EL event pages both `noindex` and in any sitemap; build FAILs on a noindex EL event page present in the sitemap; the ~214 reclassified rows are indexable + in-sitemap.
- **G4:** llms.txt header reads the derived distinct-venue count (~111) and matches a direct COUNT(DISTINCT) query; no venue-page-count number present; counter re-derives on rebuild.
- **G5:** zero live pages emit a date-only `description`; emptied descriptions omit the property (no `""`); rows with real prose retain cleaned prose; build FAILs on injected bare-date description.

**Replicability:** All five SPEC-universal. G1: `runImplyingTypes` / `presumed_run_days` are type-keyed config with universal defaults; per-city override is DATA, mechanism transfers (Barcelona/Berlin identical). G2: removing a dead, spam-risk tag is city-agnostic. G3: lifecycle-derived sitemap membership + paired invariant read existing config; no city specifics. G4: derived distinct-venue counter is city-agnostic; the count value is DATA-per-city. G5: parser + omit-if-empty is language-token DATA-per-city (the "Εως" literal → each city's run-end prose token: "Hasta"/"Bis"); the strip-extract-omit mechanism is universal.

**Connects to:** 2026-02-20 "45-Day Event Lifecycle" (endDate-driven lifecycle; Cooling = noindex + sitemap removal — G1/G3/G5 spine). 2026-03-02 "Schema Quality Over Presence (Attribute-Rich or Nothing)" (18-pt penalty operates at event level; field-absent-acceptable vs present-but-generic-penalty; omit-not-placeholder fallback — G1/G5). 2026-05-18 "Offer.validFrom Omission Stands: GSC Warning is Cosmetic, Not Penalty" (recommended-property omission ≠ rich-result penalty; omission beats misinformation — G1). 2026-05-11 "Unclassifiable-Merchant Ticket Sources: Omit Offer" (omit-beats-fabricate; classifier as single emission gate — G1/G5). 2026-05-21 "/en/ Self-Canonical + Indexable … Lifecycle-Aware Indexability Guard" (guard reads the shared endDate/eventStatus state machine; single source of truth; Cooling = noindex + out-of-sitemap — G1/G3). 2026-05-20 "CollectionPage ListItem … S139" and 2026-06-05 "Guard-6 hreflang Sweep; Reconcile llms.txt" (sibling-path emission/validation drift; llms.txt claims derived from the same source of truth — G3/G4). 2026-02-19 "llms.txt: Maintain, Don't Invest" (G4 is correctness-maintenance, not investment). 2026-05-21 "/proof: AI-Citation Section Dropped (D1)" (omit / no empty container; unsubstantiated number worse than absence — G4/G5). 2026-04-28 "Schema.org Offers Implementation Spec (Open Events)" (open→isAccessibleForFree; assertive pricing-surface terminology mapping — G2). 2026-06-05 "Transliteration Variants Go in alternateName" and the KPI-hierarchy entries (2026-05-30 GA4-secondary; 2026-06-05 ChatGPT-Only) (Greek-human-search / GSC off-thesis vs the AI-citation KPI — G2). 2026-05-04 S110 "Emission-Validator Coverage Manifest" (new build invariants for all five register here; emission/validation scope parity). 2026-06-05 "/theater Listing Membership (tag≠type)" and the Guard-6 retrospective (sibling-surface sweep discipline — G3).

**Status:** Decided — 2026-06-12. **G1 + G5 unblock the F2/F3 session** (assertion + description-field semantics resolved). **G3 rides that same F2 session** by Guard-6 discipline (predicate already in scope). **G2 + G4** ride the next convenient template / llms.txt change (non-blocking). All five gated on their stated recon greps (verify-before-inferring) before patch. Standing items (QID drift-gate cadence/severity; multi-edition sameAs routing) carried forward, no ruling this session.

---
## 2026-06-12 — Address-Withheld-By-Policy Is a Declared Class, Not a Drift FAIL (Smut; `addressDisclosure`)

**Context:** The streetAddress backfill (2026-06-09 Stage-1 precondition) hit Smut, a real,
identifiable Athens warehouse club whose street address is UNPUBLISHED BY DESIGN
(location-on-request). Not unverifiable — deliberately private. It FAILs the location
hard-stop (2026-05-25) identically to a drift venue with a scrape-missing address, freezing
the whole deploy (failCount==0 is all-or-nothing) on a venue whose "missing" address is a
policy fact, not a data gap. This is the rule-shape input to BOTH the Stage-1 all-class
streetAddress invariant and the ingest-side config-load front-stop. The class recurs: every
warehouse / secret-location / pop-up venue.

**Decision:**
1. **Three states, not two.** streetAddress absence has three causes: present (normal),
   absent-as-corruption (drift → FAIL, correct), absent-as-policy (withheld → must NOT FAIL).
   The 2026-05-25 gate conflates the last two. Its premise — "every real event has a venue,
   so a missing one is a parse failure, not a legitimate state" — is falsified by the
   withheld class. An invariant satisfiable only by fabrication is malformed.
2. **Schema-honest representation (Q1).** streetAddress OMITTED entirely — never `""`, `"TBA"`,
   or `"location on request"` (a non-address string in streetAddress is fabrication a Tier-A
   crawler ingests as a literal address). PostalAddress still materializes inline-with-`@id`
   (2026-05-20) at the honest floor: `addressLocality` (neighborhood if publishable, else
   "Athens") / `addressRegion: "Attica"` / `addressCountry: "GR"`. `location.name` present,
   `location.address` present, street genuinely absent — valid Events node, reduced richness
   accepted. The withholding is disclosed in PROSE (Event/Place description: "Location on
   request" / "Exact address shared with ticket holders") — a citable cultural detail, not a
   gap. `Place.publicAccess: false` is optional (semantically imperfect; prose is primary).
3. **The FAIL rule distinguishes via a DECLARED class (Q2).** New venue-level field in the
   per-city venue config: `addressDisclosure: "street" | "locality" | "city"`, default
   `"street"`. The streetAddress hard-stop fires iff streetAddress absent AND
   `addressDisclosure == "street"`. `"locality"` exempts streetAddress, REQUIRES
   `addressLocality`; `"city"` exempts street+locality, REQUIRES `addressRegion` +
   `addressCountry`. The gate enforces an honest floor at the declared precision — never a
   bare pass. Declared-not-inferred: inference would let drift venues masquerade as policy
   venues. This is tier reclassification via a logged, config-visible class — NOT a silent
   subset guard.
4. **Front-stop amended.** The 2026-06-09 config-load invariant ("no venue enters without
   streetAddress") would wrongly REJECT Smut at ingest. Amended: no venue enters without
   EITHER streetAddress OR a declared non-`street` `addressDisclosure` plus its floor fields.
   Drift (neither) still rejected at ingest — shift-left intact.
5. **Interim (Q3): quarantine lane, not freeze, not fabrication.** Move Smut's 2 events into
   the sanctioned monitored quarantine lane (2026-05-25 pt 3 — excluded from pageable set,
   logged, counted, never silent) to cover the one-cycle gap. The real fix is the
   `addressDisclosure` field — prioritize it as the immediate next Dev session; rule exemption
   + regression assert ship in the same change (fix+tripwire together).
6. **Stage-1 precondition added.** Smut is not drift and cannot be backfilled. The
   `addressDisclosure` exemption MUST land before the Stage-1 streetAddress promotion flips, or
   Stage 1 freezes on Smut permanently. Stage-1 preconditions are now: drift backfilled AND
   exemption live AND Smut declared.

**Reasoning:** The resolving precedent already exists in the gate's own ruling — endDate is
WARN-not-FAIL because FAIL "would pressure a misleading proxy — forbidden by omit-beats-
fabricate." streetAddress-at-a-withheld-venue is structurally identical: legitimately absent
for a defined class, FAIL pressures fabrication. The endDate pattern is severity conditional
on a declared class; this applies the same shape to a new field+class. Omitting beats
fabricating; a partial honest PostalAddress beats a fake street; the withholding fact is
itself a differentiating, citable signal for Athens's warehouse scene. Declared-class gating
keeps the invariant meaningful (every event locatable to a stated floor) while removing the
fabrication trap.

**Validation:** Build PASSES on a synthetic `"locality"` venue with no streetAddress but
present addressLocality; build still FAILs on a synthetic `"street"` venue with stripped
streetAddress (both regression asserts in the same change). Build FAILs on a `"locality"`
venue MISSING addressLocality (floor enforced). Ingest front-stop REJECTS a venue with no
streetAddress and no `addressDisclosure`; ACCEPTS Smut (declared `"locality"`/`"city"` + floor
fields). Smut's emitted JSON-LD: `location.name` + PostalAddress at floor precision, NO
streetAddress key (not empty string); validator.schema.org 0 errors; GSC URL Inspection on a
Smut `/en/` event → Events-eligible. S110: register `addressDisclosure` as a venue-config
gate input and the disclosure-conditional streetAddress rule.

**Replicability:** SPEC-universal — the `addressDisclosure` enum, disclosure-conditional FAIL,
and amended front-stop are city-agnostic; every city has secret-location venues. DATA per-city:
each city's venue config declares per-venue disclosure level. No Athens hardcoding. Deferred
(not built): venue-level disclosure does not cover a one-off secret pop-up at a normally-public
venue — event-level override → Deliberately Deferred Register.

**Connects to:** 2026-05-25 "location FAILs Build" (premise falsified; endDate WARN precedent;
quarantine-lane mechanism — pt 3). 2026-05-20 "Event.location Inline-With-@id" (partial
PostalAddress still materializes inline). 2026-06-09 "all-class native failCount==0 / Stage 1 /
config-load front-stop" (Stage-1 precondition + front-stop amendment). omit-beats-fabricate /
attribute-rich-or-nothing (governing principle). S110 Coverage Manifest (rule + gate-input
registration).

**Status:** Decided — 2026-06-12. Routes to Dev Planner: (1) add `addressDisclosure` to venue
config + ingest front-stop amendment; (2) disclosure-conditional streetAddress rule + dual
regression assert (same change); (3) declare Smut + dequarantine its 2 events; (4) confirm
landed BEFORE Stage-1 streetAddress promotion flips. Editorial: Smut prose location-on-request
disclosure line.

---

## 2026-06-14 — Geodata Ancestry: Per-Key Parent-Pointer Model, Emitter Owns Zero Geography (D8)
**Context:** schema-geo.ts hardcodes a single municipality QID (Q1524) as every neighborhood's municipality hop. Structurally Athens-only; also a wrong-QID-class bug (Q1524 is the city-level sameAs; logged chain specifies Q1224979 for the municipality). 24 venues with neighborhood:"Piraeus" emit a false Kastella-in-Athens-Municipality chain in production. No geodata resolver exists.
**Decision:** (a) Remove all hardcoded ancestry from the emitter. Each geodata key declares one immediate administrative parent; a per-city ancestor table declares each ancestor's parent to the country; the emitter walks parent→country and materializes nested containedInPlace. Parent-pointer over denormalized: mirrors P131 (one edge/node), DRY, and is the only model that survives variable chain depth (Berlin city-state = 1 hop). Emitter invariant: emit a hop only if its QID carries a verified-provenance marker, else truncate at last verified node (omit-beats-fabricate, node-keyed) — this alone kills the false Piraeus emission on landing. (b) Dedicated geo-chain resolver (not performer-resolver overload): SPARQL-confirms each P131 edge + instance-of, stamps per-node provenance, drift-gates failures; shares the line-1180 SPARQL pattern as a distinct module. Adjudicates Q1524-vs-Q1224979 and Attica Q758085-vs-Q758056 as a side effect. (c) verified_core decoupled — scope flag ≠ geo-ancestry; sibling fast-follow after D8, no bundling.
**Reasoning:** Hardcoded fixed-depth ancestry fails both correctness (live false Piraeus chain) and replicability (variable depth across cities). Parent-pointer + provenance-truncation fixes both and makes the emitter self-protecting against unverified/hand-committed QIDs. Separate geo resolver avoids tag≠type conflation of identity vs containment verification.
**Validation:** All 16 keys re-emit; no key routes through a hardcoded constant. 24 Piraeus venues emit no Q1524 hop (Kastella-only at minimum). Every emitted hop carries a resolver-stamped provenance marker. Q1524/Q1224979 and Attica QID conflicts resolved with logged provenance. Schema validator containedInPlace materialization invariant passes node-keyed. Replica smoke test: a Berlin-shaped 1-hop key and a Barcelona-shaped 4-hop key emit correctly through the same emitter with zero code change.
**Replicability:** SPEC-universal — emitter owns zero geography; parent-pointer walk; verified-provenance truncation; geo-chain resolver verifying P131 edges + instance-of. DATA-per-city — ancestor table + per-key parent pointers (Athens 4-hop, Piraeus 4-hop alt-branch, Barcelona Municipality→Barcelonès→Catalonia→Spain, Berlin Q64→Q183). No Athens hardcoding survives.
**Connects-to:** "Neighborhood Wikidata Mapping" (containedInPlace chain, Q1224979/Q5765570/Q758085/Q41 — corrects its implementation drift). Performer SPARQL helper (line ~1180 pattern, reused not shared). QID drift-gate cadence/severity standing item (geo surface operationalized). verified_athens→verified_core (sibling, sequenced after). D6a/D6b (unblocked on landing; require own entries first).
**Status:** Decided — 2026-06-14. Geo-chain resolver first; emitter ships on Athens-chain verification; Piraeus backfills nightly.

---

## 2026-06-30 — Schema-Gate Failure Disposition: Penalty Is (a)-Scope, streetAddress Recommended-Not-Required, Source-Class-Keyed Disclosure Default (F2b)

**Context:** Dev Planner's 2026-06-28 memo: the schema-completeness gate (src/validators/schema-completeness.ts, F2b) hard-failed all ~3,598 pages for 06-24→06-28 on a handful of addressless verified_core/pass_through venues; froze git push, stranded 2 unrelated commits; cleared only by the failing events aging out (page count 3644→3598, no code fix). The "fix" backfill is perpetual — re-fires every time a new addressless venue enters the window. Dev Planner made the architecture call (ship N−k, phases independently failable) and routed three citation-policy questions to GEO: (Q1) is streetAddress citation-required or -recommended; (Q2) standing disposition of a gate-failing page (D1–D4); (Q3) does the 18-pt partial-schema penalty scope to (a) malformed/structurally-partial or (b) valid-but-recommended-field-omitted.

**Decision:**
1. **Q1 — RECOMMENDED.** Citation-required floor = location.name + materialized PostalAddress at locality precision (addressLocality / addressRegion "Attica" / addressCountry "GR"), per 2026-05-25 + 2026-06-12. streetAddress is a richness field above the floor: AI engines cite on name×date×venue×area; street precision is user-actionability, not a citability gate. Floor-without-street already empirically validated Events-eligible (Smut, 2026-06-12).
2. **Q3 — (a) only.** Penalty attaches to malformed/degenerate schema: empty-string, placeholder ("TBA"/"location on request"), broken node, OR missing required floor (Category B/C). A complete-and-valid floor PostalAddress with no streetAddress key is NOT partial schema → penalty-free. This is the original 2026-03-02 intent ("field absent acceptable; field present-but-empty/generic penalty risk"); the gate drifted from it.
3. **Q2 — D3 standing policy, field-agnostic, keyed on failure category.** A: recommended field absent, floor intact → not FAIL (WARN max), ship indexed, clean omission, no empty key. B: required floor missing → FAIL, ship page indexed but suppress that node's JSON-LD (no-schema ≻ broken-schema), stays in sitemap. C: empty/placeholder present → FAIL, drop-to-floor if floor valid else node-suppress, never ship the value. D: no citable content (not a real event) → D1/D2, upstream event-validity not the schema gate. Gate FAIL-set contains only B/C. D4 (penalized partial PostalAddress) REJECTED — its penalty premise is void; "floor PostalAddress, no street key" IS D3 done right.
4. **Infrastructure fix (kills the perpetual backfill):** source-class-keyed default addressDisclosure. verified_core → default "street" (missing street = drift = FAIL → backfill; detection preserved). pass_through → default "locality" (missing street = expected = Category A floor-valid; requires addressLocality). Per-venue addressDisclosure overrides the class default. A source-class default is a positive logged assertion about source precision, NOT inference-from-absence — masquerade risk is intra-class only, and pass_through makes no street claim to drift from, so 2026-06-12 "declared-not-inferred" is honored.

**Reasoning — failure modes traced:** (a) *Gate miscalibration:* binary present/absent gate conflates Category A (floor-valid, penalty-free) with B/C (broken) → freezes the whole site on optional-field absence; fix is the A/B/C/D reclassification. (b) *Perpetual backfill:* pass_through venues are structurally locality-only and never backfillable from our pipeline; per-venue declaration is a content-treadmill; source-class default lifts it to infrastructure (config-driven, one rule, all venues). (c) *Penalty over-scope:* treating recommended-field omission as partial schema would pressure fabrication (empty/placeholder street) — the exact thing the penalty exists to prevent; inverts the rule against itself. (d) *N−k preserved:* Dev Planner's ship-N−k stays as the safety net for genuine B/C residue; this ruling removes correctly-classified A from the k.

**Implementation spec (Dev Planner):** (1) Add source-class → default addressDisclosure mapping (verified_core="street", pass_through="locality") in venue config load, per-venue override retained. (2) Reclassify gate: A=WARN/pass, B/C=FAIL(node-suppress + page-ship), per failure category not field. (3) Regression asserts same change: pass_through venue w/ no street + present addressLocality ⇒ PASS (Category A, floor schema, no street key); verified_core venue w/ stripped street ⇒ FAIL (drift); any venue w/ "streetAddress":"" ⇒ FAIL (Category C); pass_through declared "locality" missing addressLocality ⇒ FAIL (floor). (4) S110: register source-class-default-disclosure as a gate input; record gate FAIL-set = Categories B/C only. (5) This completes Stage 1 of 2026-06-09 all-class failCount==0 — Stage 1 promotes onto the A/B/C/D definition, not binary present/absent.

**Validation:** Build PASSES on clean backfilled baseline + synthetic pass_through-floor venue; FAILs on synthetic verified_core street-strip, empty-string street, and "locality"-missing-locality. validator.schema.org 0 errors on a floor-only node; GSC URL Inspection Events-eligible. Recon the 67-page 06-28 failing set: pass_through fraction → dissolves; verified_core fraction → genuine backfill remainder. Confirm front-stop (2026-06-09) and addressDisclosure field (2026-06-12) deploy state before sprint.

**Replicability:** SPEC-universal — A/B/C/D taxonomy, penalty-(a) scope, field-agnostic disposition, source-class→disclosure mapping all city-agnostic; verified_core/pass_through is the committed generalization (coreBoundaryRule per city). DATA per-city: venue→source-class assignment + per-venue overrides. Barcelona/Berlin inherit unchanged. No Athens hardcoding.

**Connects to:** 2026-03-02 Schema Quality Over Presence (penalty origin; (a)-scope confirmed, not superseded); 2026-05-25 Location Build-Halt Node-Keyed (required floor = location.name + location.address inline); 2026-06-09 all-class native failCount==0 / Stage 1 / config front-stop (this completes Stage 1's streetAddress definition; WARN-never-freezes inherited); 2026-06-12 addressDisclosure / Address-Withheld-By-Policy (per-venue declared mechanism, extended here with source-class default; declared-not-inferred honored); omit-beats-fabricate + wrong≻empty≻omit (governing); Constitution Constraint 3 (enrichment non-gating — Category A ships un-enriched). S110 Coverage Manifest.

**Status:** Decided — 2026-06-30. Routes to Dev Planner as one Pattern-C/TDD sprint (source-class default + A/B/C/D reclassification + regression asserts, same change). Blocked-on: recon of 2026-06-09 front-stop + 2026-06-12 addressDisclosure deploy state (fold in if un-landed). Unblocks: address backfill demotes freshness-blocker → optional minor-stream hygiene.

---

## 2026-07-01 — Schema-Gate Disposition Re-Ruling: Source-Class Infra Parked, Gate Reclassification Unbundled & Shipped, Q1/Q2/Q3 Reaffirmed (F2b) — supersedes 2026-06-30 spec items (1) and (3)-partial

**Context:** Dev Planner recon (specs/schema-gate-recon-2026-06-30.md) sized the 2026-06-30 ruling's implementation sprint against live code/config/DB and reported four premises falsified: (P1) `verified_core`/`source_class` does not exist — only `location_status` (types.ts:67; grep=0; DB GROUP BY confirms 0); (P2) the 2026-06-09 rejecting config-load front-stop never shipped — what is live (S174) is a warn-not-block scrape-time guard, event always persists (database.ts:263–278); (P3) `addressDisclosure` is absent entirely, full build-from-scratch (config+src grep=0); (P4) the reclassification dissolves ≈0 current failures — all 67 of the 06-28 failing pages were verified, pass_through=0. Deeper claim: the F2b gate was not the freeze — the generator resolves streetAddress from config/athens-venues.json even on empty DB venue_address (config cascade), so a live build reports 0 schema errors; the 06-24→06-28 freeze was a DB-availability failure (lost/empty events.db, code-1 before deploy), separate incident, hardened at four surfaces. Dev Planner routed one question back: is the source-class-default infrastructure worth building now (Option 2) or parked until pass_through scales (Option 1)?

**GEO recon-correction (grounded against canonical decisions-log.md):** (C1) The 2026-06-30 entry IS logged (lines 4299–4321, Status Decided, clean terminus). (C2) The 06-30 ruling did NOT assume P2/P3 live — its Validation says "Confirm front-stop + addressDisclosure deploy state before sprint" and Status says "fold in if un-landed"; recon confirms a hedge the ruling already carried. Only P4 + "gate wasn't the freeze" are net-new corrections, and the 06-30 Validation already predicted the dissolve ("pass_through fraction → dissolves; verified_core → genuine backfill remainder"). (C3) "Gate clean the whole time" is over-stated: the 2026-06-09 all-class entry documents a real Jun 8 gate freeze on 6 verified streetAddress FAILs (config drift). The gate is clean when config is complete; it fires on config drift. (C4) Version-skew: recon cites D12 at line 4742; canonical snapshot is 4321 lines with D12 at 4290 and the 06-30 entry present — the "rulings vanish" pattern is a two-copies problem, not dropped text.

**Decision:** The 06-30 ruling separates into three layers with independent fates.

1. **Layer 1 — Citation policy: REAFFIRMED, standing, no build.** Q1 (streetAddress citation-recommended not -required; floor = location.name + materialized PostalAddress at locality) + Q3 (18-pt partial-schema penalty is (a)-scope only) + Q2 (A/B/C/D field-agnostic disposition, FAIL-set = B/C). These are policy, not components; they stand regardless of what ships.

2. **Layer 2 — Gate reclassification: UNBUNDLED and SHIPPED NOW, zero net-new components.** The freeze-on-optional-absence miscalibration is category-keyed, not source-class-keyed. Rule keys on floor validity (already present): floor intact + no streetAddress key ⇒ WARN, ship indexed; empty-string / placeholder ("TBA"/"on request") / broken node / missing required floor ⇒ FAIL. No `verified_core`, no `addressDisclosure`, no front-stop required. This is the actual freeze-fix and honors Q1/Q3.

3. **Layer 3 — Source-class disclosure default: PARKED (all three components).** `verified_core` taxonomy + `addressDisclosure` field/reader + rejecting config-load front-stop. Under Layer 2 all missing-street-with-intact-floor already resolves to WARN safely; the components' only current job is triaging the WARN stream (verified drift → backfill vs pass_through → expected). With pass_through=8 and the failing set ~100% verified, that stream is currently homogeneous — the mechanism sorts one class. ≈0 citability return now; value is entirely forward-looking.

4. **Re-open trigger (parked):** whichever fires first — (a) pass_through ≥ 10% of live events in any deployed city (weekly KPI log; absolute floor 25 pass_through events, small-denominator guard); (b) any second-city launch plan sourcing venues aggregator-first (no hand-curated athens-venues.json equivalent), fires immediately regardless of count.

**Reasoning:** (a) Effort/impact — three net-new components to auto-exempt 8 events and dissolve ≈0 current failures fails ruthless prioritization; the config cascade already delivers the floor-valid citability outcome the mechanism was built to protect. (b) omit-beats-fabricate not at risk — verified venues carry real street from config; pass_through's locality floor is already Events-eligible (Smut, 06-12). (c) The freeze was real but category-caused: WARN-surfacing optional absence (Layer 2) removes it without needing source-class; source-class only sorts the resulting WARN stream, trivial at current scale. (d) Layer 1 policy is the durable value of 06-30 and survives intact. (e) Parking with a measurable trigger keeps forward risk (aggregator-first replication) armed without paying build cost against a homogeneous 8-event population.

**Implementation spec (Dev Planner) — one Pattern-C/TDD sprint:** (1) Reclassify F2b gate keyed on floor validity, NOT source-class: floor intact + no street key ⇒ WARN/pass; empty-string/placeholder/broken-node/missing-floor ⇒ FAIL; gate FAIL-set = B/C only. (2) Regression asserts keyed on floor, source-class-agnostic: floor-valid + no street ⇒ PASS(WARN); `"streetAddress":""` ⇒ FAIL(C); floor missing (no locality) ⇒ FAIL(B); placeholder street ⇒ FAIL(C). (3) S110: register the reclassified gate FAIL-set (B/C) as the gate input. (4) This completes Stage 1 of 2026-06-09 all-class failCount==0 via floor-validity definition, not binary present/absent and not source-class. (5) DO NOT build `verified_core`/`addressDisclosure`/front-stop; log the parked trigger (above). Ordinary verified-drift backfill in athens-venues.json remains execution-level hygiene, surfaced by WARN.

**Validation:** Build PASSES on floor-valid node with no street; FAILs on empty-string street, placeholder street, and floor-missing node. validator.schema.org 0 errors on floor-only node; GSC URL Inspection Events-eligible. No new config field or taxonomy introduced (grep confirms `addressDisclosure`/`verified_core` remain unbuilt by design). Parked-trigger recorded and monitorable on the weekly KPI log.

**Replicability:** SPEC-universal — floor-validity gate reclassification, A/B/C/D disposition, and the parked-trigger predicate (pass_through-share threshold + aggregator-first-launch condition) are all city-agnostic. DATA per-city: venue floor data in each city's config. Barcelona/Berlin inherit the reclassified gate unchanged; the aggregator-first arm of the trigger is written specifically to catch their launch model. No Athens hardcoding.

**Connects to:** 2026-06-30 Schema-Gate Failure Disposition (SUPERSEDES spec items (1) source-class mapping and (3)-partial pass_through regression asserts; REAFFIRMS Q1/Q2/Q3 and category-keyed A/B/C/D; the 06-30 entry stays as-issued, this appends over the named clauses); 2026-06-12 addressDisclosure / Address-Withheld-By-Policy (parked, not extended); 2026-06-09 all-class failCount==0 / Stage 1 (completed here via floor-validity definition; Jun 8 config-drift freeze cited as evidence gate fires on drift); 2026-05-25 Location floor node-keyed; 2026-03-02 Schema Quality Over Presence (penalty (a)-scope origin); omit-beats-fabricate + wrong≻empty≻omit (governing); Constitution Constraint 3 (enrichment non-gating). S110 Coverage Manifest.

**Status:** Decided — 2026-07-01. Routes to Dev Planner as one componentless Pattern-C/TDD sprint (Layer 2). Layer 3 PARKED with dual re-open trigger. Open flag: version-skew between canonical decisions-log.md and the executor's working copy must be reconciled before this appends (see process note) — append to the single canonical path only.

---

## 2026-07-04 — UX/IA Redesign Go/No-Go: No-Go on Live Implementation This Fable Window; Conditional Go on Audit/Spec Artifact Only (Zero Live URL Diff); Pipeline Fixes Proceed as Plain Dev Outside the Window

**Context:** The Fable tool window closes after 2026-07-07. Question on the table (Dev Planner): spend the closing window implementing a live UX/IA redesign of agent-athens? Competing pulls — a redesign appetite (portfolio/UX vs. citability-driven, unresolved) against the risk that live URL/IA/canonical/sitemap/schema mutation, executed under a time-boxed tooling deadline, churns the surfaces the citation strategy depends on for a benefit not tied to citation. Concurrent pipeline defects — broken build gate freezing the daily refresh cycle; IndexNow over-submission (~395K submissions, minimal indexed) — are unrelated to both the redesign and to Fable.

**Decision:**
1. **No-Go on live UX/IA redesign implementation this window.** No live URL, IA, template, canonical, sitemap, hreflang, or schema change ships under the Fable window. A closing tooling window is not itself a reason to mutate live surfaces.
2. **Conditional Go — audit/spec artifact only.** Permit a redesign audit + spec (design-only): zero live diff, no URL/IA/schema/sitemap change. Fable may author it if idle, but Fable-fit is not the rationale and must not manufacture a deadline. This is the **design-now/commit-later** split — the *commit* is gated on a separate go/no-go, not on the window.
3. **Pipeline fixes proceed immediately as plain dev, outside the window.** Build-gate repair (restore the `failCount==0` all-class/all-node gate; unfreeze the daily refresh) and IndexNow submission hygiene (halt over-submission) are ordinary maintenance — not redesign, not Fable-scoped. They carry no window dependency and do not wait on the redesign decision. Do not gate P1 maintenance behind a design call.
4. **Redesign appetite unresolved — flagged, not decided here.** Whether the appetite is citability-driven or portfolio/UX-driven is an open input that scopes the spec and weights its commit gate. The spec must state which; this ruling does not settle it.

**Reasoning:** Live URL/IA changes churn canonical, sitemap, hreflang, and schema surfaces — the load-bearing citation substrate — for a redesign whose citation payoff is unproven; omit-beats-churn applies at the URL layer as it does at the schema layer. A closing window manufactures a false deadline: the audit/spec does not expire, so nothing durable is lost by deferring the commit. The design-now/commit-later split preserves freshness-first sequencing without stalling design thinking. Conflating the pipeline defects with the redesign would hostage P1 maintenance (a frozen refresh cycle is an active citation-freshness bleed) to an unrelated design decision — hence the explicit decoupling.

**Replicability:** SPEC-universal — "no live URL/IA/schema mutation driven by a closing tooling window; design-now/commit-later with the commit on a separate gate; maintenance decoupled from redesign." DATA per-city: none. No Athens hardcoding; Barcelona/Berlin inherit the posture verbatim.

**Connects to:** 2026-07-04 Authority/Entity-Presence ruling (same design-now/commit-later split; both No-Go on live changes this window; authority ruling explicitly mirrors this one) and 2026-07-04 Past-Event URLs ruling (both cite this as the redesign antecedent); build-gate repair + IndexNow hygiene (pipeline workstream, decoupled here as plain dev); freshness-recovery read (the commit gate the redesign shares with the authority play); 2026-02-20 45-Day Lifecycle + canonical-must-be-200 / single-flip-gate invariants (surfaces a live IA change would churn).

**Spec:** `specs/redesign-spec-v2.md` (authored 2026-07-04, NOT YET ratified — IA/token sign-off pending Design Navigator, URL-implication clearance pending GEO). Discoverability pointer only; records where the artifact lives, does not ratify its contents.

**Status:** LOGGED 2026-07-04 — canonical docs/geo-decisions.md

---

## 2026-07-04 — Authority/Entity-Presence Play: Unpark Now as a Risk-Free Strategy-Spec; Reframe Backlinks → Brand-Mention/Entity Co-occurrence (Ahrefs 0.664 vs 0.218); Implementation Gated on Freshness Read

**Context:** The parked 2026-07-04 ruling named off-site authority as the probable citation ceiling. Evidence (Dev Planner packet): Bing shows zero backlinks, 8 clicks / 95 impressions / 6 months; Google ~1,380 / Bing 373 indexed against near-zero engagement — indexing is not the bottleneck, demand/authority is. Packet requests: unpark-now (scope a strategy-spec) vs. hold-for-freshness-read, and constraints if now. NOTE: the prior 07-04 ruling and its cited stats (e.g. "2.8× / 4+ platforms") are NOT present in the canonical log (still un-logged); treated here as verified-by-Dev-Planner memo, not re-confirmed against the log.

**Decision:**
1. **Unpark now** — GO on a strategy-spec session (design-only, touches nothing live). **Decouple from the Fable-window justification.** Authority strategy is strategic reasoning, not a design/UX task; it does not need Fable specifically. The reasons to start now are (a) risk-free — it's a spec, zero live diff; (b) zero scheduling contention now that the redesign spec is authored; (c) starting strategic design early spends no implementation resource, and the freshness read still gates the *commit*. If Fable is idle, use it — but Fable-fit is not the rationale and must not manufacture a deadline.
2. **Implementation stays gated** on the 2–4 week freshness-recovery read confirming authority — not freshness, not indexing — is the ceiling. Same split as the redesign ruling: design now, commit after the read.
3. **Reframe the lever (binding for the spec).** The packet frames this as backlinks / off-site trust. Current evidence (Ahrefs 2026, 75k brands): brand web mentions correlate 0.664 with AI citation rate — ~3× stronger than backlinks (0.218) — and count even without a hyperlink. ChatGPT (agent-athens's dominant referrer) is parametric/entity-driven; Wikipedia ≈ 7.8% of ChatGPT citations. So the primary lever is **brand-entity strength + co-occurrence with category terms ("Athens events/culture") across authoritative sources + entity-graph presence (Wikidata/Wikipedia)** — not link acquisition. Backlinks remain a secondary lever (Perplexity real-time retrieval; ChatGPT skews to DR80+ editorial, ~65% of its citations), but the spec leads with mentions/entity.

**Strategy-spec constraints (what the session must produce):**
- **Entity/mention-first, per-engine.** Separate tracks: (ChatGPT/entity) Wikidata completeness + `sameAs` + venue/event entity co-occurrence, and platform/notable-venue presence in Wikipedia's orbit *only where notability is real* (no fabricated notability); (Perplexity/real-time) structured answer-first surfaces + presence in the community/editorial sources it retrieves live; (Google AI Mode/authority) editorial coverage. Build on existing entity infra (D8/D12 geo-chain, `sameAs` QIDs) — extension, not green-field.
- **Backlink track = the already-logged programs**, not net-new invention: ACVB / thisisathens.org Members Program (government-adjacent, high AI-citation weight), Athens Culture Net affiliate, WhyAthens defunct-competitor link reclamation. Spec sequences/prioritizes; does not re-decide.
- **City-agnostic (mandatory).** Every channel = a config seam + a per-city *discovery procedure* (find this city's CVB/tourism board, cultural network, defunct aggregator), never hardcoded Athens institution names. Barcelona/Berlin inherit the procedure; DATA differs.
- **Zero API cost.** No paid backlink/mention APIs. Measurement via free surfaces (Bing WMT referring domains, GSC, manual per-engine prompt sampling under the existing KPI logging). Wikidata edits are free.
- **KPI framing.** Primary = AI citation impressions (unchanged). Authority is an *input*; track leading indicators as a scoped secondary dashboard (referring domains; unlinked brand-mention count across target sources; Wikidata/entity completeness; first non-ChatGPT engine citation). None promotable to primary without a dated supersession.
- **Out of scope for the spec:** live URL/IA changes (redesign separately settled No-Go this window); any outreach/commit execution (gated on freshness read); paid tooling.

**Reasoning:** The entity-vs-backlink evidence is the load-bearing correction: optimizing a link campaign when the ~3× stronger signal is unlinked entity co-occurrence would spend the authority budget on the weaker lever. The design-now/commit-later split honors the freshness-first sequencing without stalling durable strategy work. Fable-fit is a weak justification for a non-design task — a closing window should not manufacture urgency for a spec that doesn't expire. Building on the existing entity graph is higher-leverage and more city-agnostic than a pure outreach push.

**Implementation:** Scope one strategy-spec session (any capable executor; Fable optional). Output = a spec artifact, zero live diff. No code, no URL/schema/sitemap change. Gate the *implementation* sprint on the freshness-read go/no-go.

**Validation:** Spec delivered as artifact; confirm zero live change (no URL/schema/sitemap diff). Freshness read (2–4 wk) yields the implementation go/no-go. Post-implementation leading indicators: new referring domains (Bing WMT/GSC); rising unlinked-mention count in sampled AI answers; Wikidata entity completeness; first Perplexity/Gemini/Copilot citation (Tier-B / diversification). ~3-month lag expected before citation-rate movement.

**Replicability:** SPEC-universal — "authority = entity/mention-first, per-engine, built on the existing entity graph; backlink track = per-city institutional + defunct-aggregator reclamation via a discovery procedure; zero-API measurement." DATA per-city: institution names, entity QIDs, local-language category terms. No Athens hardcoding.

**Connects to:** 2026-02-20 institutional-backlink (ACVB / Athens Culture Net) + WhyAthens reclamation (the backlink track — not re-decided); Growth Marshal three-tier authority study; D8/D12 geo-chain + `sameAs` QID infra (entity-track substrate); KPI hierarchy (citation-primary, GA4-secondary); 2026-07-04 redesign go/no-go (same design-now/commit-later split; No-Go on live changes this window); freshness-recovery read (implementation gate).

**Status:** LOGGED 2026-07-04 — canonical docs/geo-decisions.md

---

## 2026-07-04 — Past-Event URLs: Current Hard-404 Is a Regression Against the 2026-02-20 45-Day Lifecycle; Reaffirm 410-at-Archive + Cooling-200/noindex; Re-spec the Backlink Exception as Zero-Cost Config Allowlist

**Context:** Dev Planner packet (verified 2026-07-04): the orphan-sweep removes past-event page directories at ~14 days; a sampled past event and the spec's `/events/1121c664--/` example return live HTTP 404; recent events (~last 2 days) present (36/38) → age-gated by the sweep. Packet frames this as an open A/B/C/D policy choice and requests a ruling before implementation.

**Decision:** **Not an open question.** The 2026-02-20 *45-Day Event Lifecycle* already decides past-event URL disposition, and the current 404 is a **regression** against it (locked decision, cross-referenced by S144/G1/G3, never superseded). Reaffirm and restore:
- **Day 1–14 (Just-passed):** 200, indexed, `eventStatus: EventCompleted`, "passed" banner + similar-events module.
- **Day 15–44 (Cooling):** 200, `noindex,follow`, Event schema removed, out of `sitemap-events.xml`, similar-events module retained. The sweep must **stop deleting these** — deleting them (→404) is the main casualty of the regression; policy says live-200/noindex.
- **Day 45+ (Archive):** **410 Gone** — explicit, not the current catch-all 404. Honest, faster de-indexing signal for genuinely-ended content.
- **Exception:** 301-to-parent only for URLs with real inbound equity. **Dormant now** (Bing = zero backlinks → no URL qualifies → today every Archive URL is 410). Its original Ahrefs/GSC-API implementation violates zero-cost; re-specced below.

Reject as standalone policies: **A (404)** = the regression to eliminate. **Uniform D (permanent tombstone-200)** = fights the sweep and accretes thin content at scale — but its good part (live 200 + cross-links) is already the decided Day 1–44 behavior, time-bounded. **Uniform C (301)** = fabricates content-equivalence (event ≠ venue/hub) and there is ~zero equity to preserve; reserved for the dormant exception only.

**Reasoning:** The site has zero backlinks, so the equity-preservation rationale behind C/D preserves ~nothing today — 410 is the honest, cheapest, correct signal for an event that is permanently over. C would tell crawlers an ended event equals its venue/hub, which is false (violates omit-beats-fabricate at the URL layer). Uniform-D thin content at continuous-expiry scale is a doorway/quality risk. The lifecycle already resolves all of this; the ruling is conformance + one honest de-indexing signal + a zero-cost, self-activating exception seam.

**Implementation:**
1. **Recon gate first (decided ≠ shipped).** Grep the sweep/generator + lifecycle/`eventStatus` emitter against actual `dist/` behavior to determine whether the lifecycle was never fully shipped or shipped-then-regressed by the sweep. Target state is the lifecycle regardless; recon sets the diff.
2. **Make the sweep lifecycle-aware.** Phase off the same `endDate`/`eventStatus` state machine that drives `noindex` (single-source-of-truth, per S144 D6). No deletion before Day 45. Day 15–44 = keep file, emit `noindex,follow`, strip Event schema, drop from `sitemap-events.xml`.
3. **Emit explicit 410 at Archive.** On Day-45 transition: delete the page file **and** append an explicit per-URL rule to `_redirects` — `/en/events/{hash}/ /410.html 410` (minimal 410 body page). Explicit per-URL, **not** a wildcard: `/events/*` would catch live events, and Netlify wildcard-410 is documented to fall through to 404 while full-path matches return 410 correctly (Netlify support + docs). The file must be absent (no shadowing) for the rule to fire — delete-without-a-rule is exactly the current 404 bug.
4. **Bound `_redirects` growth.** Continuous expiry → the explicit-410 list grows unbounded (Netlify warns >10k rules). Prune each 410 after a de-indexing window (~90–180 days post-archive); once engines drop the URL, fall-through to 404 is harmless. Keeps `_redirects` bounded, city-agnostic.
5. **Re-spec the backlink exception (zero-cost).** Replace the Ahrefs/GSC-API check with a manually-maintained config allowlist (`archive_301_exceptions`: URL → parent target), populated from free Bing WMT / GSC referring-domain data only when authority accrues. Empty/dormant now. Single-hop, audited (no chains/loops), city-agnostic. This is the seam where the authority play (Part 1), once it lands links, begins to change URL disposition.

**Validation:** curl a Day-20 event → 200 + `noindex,follow`, no Event schema, absent from `sitemap-events.xml`, similar-events present. curl a Day-50 event → HTTP 410 (not 404), file absent. No live/upcoming event ever returns 410 — build-FAIL on any 410 rule whose event is still within lifecycle (410 rules gate on rows past Day 45 on the state machine). `_redirects` prune job holds rule count bounded. Exception allowlist empty today; when populated, sampled entries 301 single-hop (GSC/Bing URL inspection).

**Replicability:** Fully SPEC-universal — identical lifecycle + explicit-410-at-Archive + config-driven single-hop 301 exception + time-bounded `_redirects` pruning for every city. DATA per-city: the "similar events" filter only. No Athens hardcoding.

**Connects to:** 2026-02-20 45-Day Event Lifecycle (reaffirmed, NOT superseded — this is a conformance/regression ruling + a zero-cost re-spec of its exception + a scale-bounding addition); S144 D6 single-source-of-truth lifecycle state machine (the sweep must read it); 2026-05-25 hub eviction/redirect (distinct surface — *hubs* 301-on-eviction on an equity rationale; *events* 410-at-archive: the "410 categorically rejected" precedent is scoped to hubs and does NOT extend to genuinely-ended events); S110 Coverage Manifest (register the 410/archive surface + the "no 410 on in-lifecycle event" build invariant); 2026-07-04 authority ruling (the exception's trigger condition).

**Status:** LOGGED 2026-07-04 — canonical docs/geo-decisions.md

---

## 2026-07-04 — Canonical Path Confirmed = `docs/geo-decisions.md`; Two-Copies Reconciled; "Un-logged Until Canonical Path Confirmed" Conditions Discharged (Recon-Before-Write: No Re-append)

**Context:** The 2026-07-01 entry carried an open flag — "version-skew between canonical decisions-log.md and the executor's working copy must be reconciled before this appends; append to the single canonical path only." Two 2026-07-04 rulings (Authority/Entity-Presence; Past-Event URLs) were consequently held provisional in the working copy with Status "Ruling issued … Un-logged until canonical path confirmed." Recon this session (both files diffed and grepped) resolves the ambiguity: the canonical file is `docs/geo-decisions.md`, and it **already carries all three 2026-07-04 rulings** — Redesign (antecedent) → Authority → Past-Event — each Status `LOGGED — canonical docs/geo-decisions.md`. The stale executor working copy (`decisions-log.md`) still shows the pre-finalization state: Redesign appended last (out of antecedent order) and the two rulings still marked provisional. The only file delta sits inside the 2026-07-04 block (ordering + those two Status lines); everything prior is byte-identical.

**Decision:**
1. **Canonical path = `docs/geo-decisions.md`.** Single source of truth. The 2026-07-01 open flag is discharged — reconciliation target confirmed.
2. **No re-append of the two provisional rulings.** They are already present and LOGGED in canonical; re-adding would duplicate headers and break append-only integrity. Recon-before-write catches exactly this — the "Un-logged" status was a working-copy artifact, not a missing canonical entry. Their conditions ("Un-logged until canonical path confirmed") are hereby **discharged as satisfied**: they are logged in the confirmed canonical.
3. **Retire the stale working copy.** `decisions-log.md` is superseded by canonical `geo-decisions.md`; overwrite it with canonical to converge the two copies. No content is lost — canonical is a strict superset (correct order + finalized statuses).
4. **Antecedent ordering stands.** Canonical's Redesign-first ordering is correct (Redesign is the decided antecedent both other rulings cite); the working copy's Redesign-last was the mis-order. No reorder performed on canonical.

**Reasoning:** Blind-appending on the working copy's provisional statuses would have injected duplicate 2026-07-04 entries into the append-only log — the precise corruption recon-before-write exists to prevent. Silence-beats-fabricate at the log layer: a status that says "un-logged" is not evidence of absence; verify live canonical state first. Discharging via a fresh supersession entry (not an in-place edit of the provisional statuses) preserves append-only discipline.

**Implementation:** Append this reconciliation entry to canonical `docs/geo-decisions.md` only. Overwrite the executor working copy `decisions-log.md` with canonical (byte-for-byte) so both paths match. No code, schema, URL, or sitemap change.

**Validation:** Post-append canonical integrity holds (header/separator counts increment by one entry; Unicode survives; clean trailing bytes). Canonical contains exactly one instance of each 2026-07-04 ruling header (no duplicates). After overwrite, `diff decisions-log.md geo-decisions.md` returns empty.

**Replicability:** SPEC-universal — "single canonical decisions path per city; recon-before-write before any append; discharge provisional statuses via supersession-append, never in-place edit; retire divergent working copies by overwrite from canonical." DATA per-city: the canonical file path only. No Athens hardcoding.

**Connects to:** 2026-07-01 entry (open flag discharged — canonical path confirmed); 2026-07-04 Authority/Entity-Presence + Past-Event URLs rulings (their "Un-logged until canonical path confirmed" conditions satisfied); the standing two-copies / append-only-integrity discipline (quoted-heredoc appends, post-append header/separator/Unicode/trailing-byte checks).

**Status:** LOGGED 2026-07-04 — canonical docs/geo-decisions.md

---

## 2026-07-04 — Ruling 2 Ratification: Event Lifecycle Phase Dispositions Pinned + 410 Zero-Cost Reframe + Exhibition endDate Invariant
**Context:** Dev Planner recon on Ruling 2 refuted its "~14-day sweep = deletion" premise. Actual model (per 2026-02-20 45-Day Lifecycle): endDate-driven phases; JUST_PASSED_DAYS=14 = index→noindex flip; RETENTION_DAYS=45 = generation stops. Production serves uniform 404 for >45d events by omission (no explicit 410 emitted). Recon requested confirmation of three phase dispositions before the dev fix.
**Decision:**
- **A / Archive (45+):** Explicit 410 Gone, unconditional. The 2026-02-20 >5-backlink→301 exception is REFRAMED to honor zero-API-cost: config-driven manual allowlist `backlink_preserved_urls`, empty at launch, populated only from free GSC Links export, never a paid backlink API. 410 applies to individual expired event pages ONLY — hub/combinatorial URLs retain 301-to-surviving-hub (no 410), per 2026 combinatorial ruling.
- **B / Cooling (15–44d):** 200 + noindex,follow + Event schema removed + self-canonical to /en/ (not root) + absent from sitemap-events.xml + similar-events retained.
- **C / Just-passed (0–14d):** 200 + indexed + self-canonical to /en/ + present in sitemap-events.xml + "passed" banner + eventStatus:EventCompleted + removed from upcoming nav + similar-events.
- **Binding invariant (elevated from dev-flag):** No event with future endDate may classify Cooling/Archive. Phase predicate keys on endDate per event type; exhibitions age on endDate, not start_date. Fix-brief Step-0 test: future-endDate + aged-start_date exhibition → Active.
- **Coordination:** 410 rules generated at build time from the same classifyEventLifecycle output driving all page phases (single source of truth, extends S144 D6 to the response layer). Event-410 rules partitioned from combinatorial _redirects so the "no 410s" combinatorial audit stays scoped.
**Reasoning:** 410 de-indexes ~1 crawl cycle vs 404's multi-week retry queue (searchenginezine Jan-2026); AI retrieval crawlers treat 4xx/5xx as hard visibility signals; dead events carry zero citation-equity so strongest removal signal is correct. Original API-based backlink check violated zero-cost and is moot at near-zero current authority. Exhibition start_date bug would noindex/410 a live event — strictly worse than the gap being fixed.
**Implementation:** Response-layer 410 + build-time redirect generation + TDD; full per-phase acceptance surfaces above as test assertions; exhibition endDate check as Step 0. Dev-work class, greenlit 07-04→~07-18 window. No redesign/authority surface touched.
**Validation:** curl >45d event → 410 (not 404); cooling event → 200 + noindex,follow + no Event JSON-LD + self-canonical /en/ + absent from sitemap; just-passed → 200 + indexed + in sitemap + EventCompleted; exhibition with future endDate → Active in all surfaces; no 410 matches a hub path; combinatorial audit still passes.
**Replicability:** SPEC-universal. Phase dispositions, endDate-anchored predicate, unconditional-410 + empty-allowlist seam, single-classifier mandate — all city-agnostic. DATA per-city: similar-events filter, the allowlist contents (empty everywhere until authority exists). No Athens hardcoding.
**Connects to:** 2026-02-20 45-Day Event Lifecycle (ratifies phases; corrects the sweep misread; reframes backlink exception for zero-cost). 2026-05-21 S144 D6 (single lifecycle state machine; extends to response layer). 674-audit entry (Active/Just-passed sitemap invariant). Combinatorial-URL ruling (hub 301 vs event 410 class split; "no 410s" audit partition). 2026-02-20 organizer/endDate (endDate critical for multi-week exhibitions).
**Status:** Ratified. Gates the Ruling-2 dev fix brief.

---

## 2026-07-04 — Ruling 2 Implementation Closure (append; cross-refs the 2026-07-04 Ruling 2 Ratification + Amendment)
Clarifying supersession of the Ruling-2 ratification entry. Carries the three commit-hash artifacts and the three Option-A conditions as tracked flags. Does not edit the ratification body.
**Implementation shipped (Steps 0→3, deploy authorized separately):**
Bare-root archive 410s via bounded 45–90d DB band, cooling Event-JSON-LD suppression, exhibition-endDate regression lock. `bun test` 2895/0, `tsc` clean.
**Commits (local → pushed):** `8ce5e5af9` (implementation) · `434693b4c` (exhibition lock + flipped anchor) · `e91f341e9` (emission/cooling/partition suites).
**Amendment ratifications carried:**
- **Artifact 1 — exhibition invariant RED-on-removal lock:** RATIFIED. Verified: stubbing `resolveEffectiveEnd` to drop its `endDate` branch → §1 lock tests RED (6 fail) → revert → 19/19 green. Keyed on single predicate `endDate in future`, no second surface. Commit `434693b4c`.
- **Artifact 2 — no-410s combinatorial test categorical:** RATIFIED. Asserts zero non-event 410s AND single-hop AND no loops across the partition. Commit `e91f341e9`.
- **Artifact 3 — cooling drop-#event-node:** CONFIRMED + GATE CLEARED. Drops `#event`, preserves venue `Place` / publisher-seller `Organization`. GEO's orphaned-edge gate verified CLEAN (specs/ruling2-deploy-gates.md): Offer is nested inline on `Event.offers` → drops with the Event; all `@id` edges outbound from `#event`, nothing references into it; empirically confirmed on a cooling with-ticket event. Commit `8ce5e5af9`.
**Band-count correction (FYI):** correct `resolveEffectiveEnd` keying yields 6,246 rules, not the spike's raw-COALESCE estimate of 3,068 — multi-day non-exhibition runs (started >90d ago, ended 45–90d ago) correctly enter the band. The 3,068 estimate would have stranded ~3,178 long-run URLs at 404-by-omission. Ceiling: 62% of 10k. The invariant working as designed.
**Option-A conditions (tracked flags):**
1. **Edge-function spike = immediately-next sequenced item** (not backlog). Named recon gates: manifest freshness, cold-start on 404 paths, `_redirects` eval-order. Spec authored: `specs/edge-function-410-recon.md`. Retires the 45–90d band, covers both locales unbounded.
2. **Deploy-gates verified CLEAN** (specs/ruling2-deploy-gates.md): no dead `/en/` URL in sitemap or hreflang (hreflang gate globally closed; sitemap sources pageable-only; three independent mechanisms), no orphaned schema edge. No MUST-FIX surfaced.
3. **INTERIM ASYMMETRY FLAG — OPEN:** Archive 410s cover bare-root `/events/{slug}/` only; `/en/` mirror still 404s. Accepted per Option A (canonical value vestigial on dead events → pure removal-SPEED lag on URLs being deleted; holding would extend the freshness drought — a compounding live-surface hit). Benign-status VERIFIED, not assumed. **Tripwire:** rests on `HREFLANG_GATE_OPEN = false` — if that flips (bilingual launch), dead `/en/` URLs could carry hreflang and the asymmetry becomes real drift; re-verify at that point. **Closes when:** edge function ships.
**Status:** Ratified. Interim flag OPEN until edge-function closure.

---

## 2026-07-04 — INTERIM FLAG: cross-locale 410 asymmetry (bare-root only)

**State:** Archive 410s (45–90d band, 6,246 rules) cover bare-root `/events/{slug}/` ONLY. The `/en/events/{slug}/` mirror still 404s for archive events — NOT 410'd.

**Why accepted (GEO Ruling, Option A):** canonical value is vestigial on dead events; the asymmetry is pure removal-SPEED on URLs being deleted anyway (404 de-indexes over a multi-week queue vs 410's single cycle). Bounded, self-resolving, zero live surface. Holding instead would extend the 6-day freshness drought — a compounding hit to LIVE citability. Trade is lopsided toward shipping.

**Named closure:** Netlify Edge Function + archived-slug manifest — covers both locales, unbounded, one 410 signal from one source. Sequenced as the immediately-next item (NOT backlog). Spec: `specs/edge-function-410-recon.md`.

**Not benign-by-assumption:** verified clean 2026-07-04 (`specs/ruling2-deploy-gates.md`) — no dead `/en/` URL in sitemap or hreflang (hreflang gate globally closed; sitemap sources pageable-only). So the asymmetry is genuinely removal-speed only, not a drift. **Re-confirm this holds if `HREFLANG_GATE_OPEN` ever flips to true** — a bilingual launch could start emitting hreflang to dead `/en/` archive URLs, at which point the asymmetry stops being benign and becomes real drift. Named here so the condition can't get lost (future-Guard-6 landmine, defused now).

**Closes when:** edge function ships. Until then this flag stays open on the ledger.

**Status:** OPEN (interim) — LOGGED 2026-07-04, canonical `docs/geo-decisions.md`; closes when the edge-function 410 ships.

---

## 2026-07-04 — Fable-Window Reconfirm: Ruling B (Pipeline Priority, No Fable Spend on Redesign); Freshness-Gate Over-Determines the No-Go; Authority-Ceiling "Next Ruling" Is Already Discharged
**Context:** Dev Planner Phase-0 gate re-routed the Fable-window redesign-vs-pipeline call with refined numbers (~1,380 Google / 373 Bing indexed vs 1,919 sitemap; 8 clicks / 6mo / zero backlinks) and two new facts: freshness epoch reset to 2026-07-04 (implementation freshness-gated to ~07-18) and a shipped pipeline fix (Past-Event 404→410) on Sonnet/Opus. Packet framed authority as "next ruling needed."
**Decision:**
1. **Reconfirm Ruling B** — pipeline stays priority; zero Fable spend on redesign this window. This does not reopen the 07-04 redesign go/no-go; it ratifies it against new evidence.
2. **Freshness gate over-determines the No-Go.** Live-surface redesign (Phase D/E) cannot ship before ~07-18 regardless of Fable; the cliff pressures only zero-live-diff artifacts (Phase B done sans Fable; C non-expiring). No durable value decays by deferral. Do not rush C.
3. **Authority "next ruling" is DISCHARGED, not open.** The 07-04 Authority/Entity-Presence ruling already unparked the strategy-spec (GO, Fable-decoupled) and reframed the lever to entity/mention co-occurrence. The packet's open-flag reflects copy-staleness, not an unmade decision.
4. **Redesign appetite half-resolved:** "indexed-but-ignored" ⇒ redesign is not citability-driven. Any remaining case is portfolio/UX, gated separately, off the citation budget and off the Fable clock. Routes to Design Navigator; gates nothing on pipeline.
**Reasoning:** Redesign moves none of {structured data, freshness, entity/mention authority} — the three citability inputs the numbers implicate. A closing tooling window manufactures a false deadline for non-expiring design artifacts. Recon against canonical geo-decisions.md before acting on a memo's open-flags (two-copies discipline) — the "authority still open" premise fails that check.
**Implementation:** No Fable commit (ruling spends none; weekly-moving terms moot). Sonnet/Opus track: edge-function /en/ closure, build-gate repair (unfreeze daily refresh), IndexNow hygiene, authority strategy-spec. Redesign B/C = idle-capacity only, zero deadline.
**Validation:** Zero live URL/schema/sitemap diff attributable to the Fable window. Pipeline items progress on Sonnet/Opus without window dependency. Authority strategy-spec delivered as artifact. No Fable budget line committed.
**Replicability:** SPEC-universal — "a closing tooling window never justifies live mutation; live-redesign implementation is freshness-gated regardless; redesign judged as portfolio/UX on its own gate, not the citation budget; authority = entity/mention-first." DATA per-city: none. Barcelona/Berlin inherit verbatim.
**Connects to:** 2026-07-04 UX/IA Redesign Go/No-Go (ratified, not superseded); 2026-07-04 Authority/Entity-Presence (the discharged "next ruling"); 2026-07-04 Past-Event 404→410 (the cited pipeline proof); freshness-recovery read (shared commit gate); build-gate repair + IndexNow hygiene (pipeline workstream).
**Status:** LOGGED 2026-07-04 — append to canonical docs/geo-decisions.md only; verify single-copy before write.

---

## 2026-07-04 — Redesign-Spec-v2 GEO Surface: RATIFIED Against Artifact (`3adacc28e`); GATE-1/2/3 Cleared; Two Conformance Flags (Past-Event Lifecycle Must Conform to 410-at-Archive; Locale-Toggle Routing Defers to Edge-Fn); F1/F4/F8 Cleared as Plain-Dev Defect Repair

**Context:** The prior Phase-C sign-off (2026-07-04) WITHHELD ratification pending artifact access and issued three self-certifiable gates; a follow-up ruling BOUND GATE-1 (zero-URL-change, no exception) under the interview trigger and reaffirmed gates 1–3 for scoped Phase C. `specs/redesign-spec-v2.md` (286 lines, HEAD `3adacc28e`, all 5 sections, spec-only / zero-implementation) is now mounted and readable. GEO reads it against its owned surfaces — URL implications, schema/SSR citation-substrate, in-flight-pipeline interaction — and rules on the merits rather than on summary. This closes the WITHHELD.

**Decision:** **RATIFY the GEO surface, against artifact, with two conformance flags (neither blocking).** The spec does not merely avoid breaching the gates; it selects the citation-safe fork at each branch. Clearance certifies citation-NEUTRALITY (does no harm to the substrate), not citation-lift.

1. **GATE-1 (zero-URL-surface mutation) — CLEAR, exemplary.** §2.4 preserves all 1,919 sitemap URLs; every proposal is additive or state-changing at the same URL. Load-bearing correctness: (a) the F3 slug fix is **new-events-only** — existing `--/` ID-only slugs stay live, avoiding a 696-URL canonical churn; (b) the spec **explicitly REJECTS both URL-churn temptations by name** — hub-slug rename (would demand 990×301) and `/e/{slug}` short event URLs (696×301); (c) the only minted URLs are future event pages (baseline daily pipeline, not redesign-driven) and future `/en/` pages (out of scope; §2.3.4 toggle surfaces existing 22 mirrors only). No new hub URL enters the sitemap during the read window. IA gains (hub above-the-fold reorder §2.3.3, running-exhibitions lane §2.3.2, locale toggle §2.3.4, past-event permanence §2.3.1) are delivered entirely at the presentation/state layer — the "GATE-1 constrains the URL graph, not IA" thesis, executed.

2. **GATE-2 (schema completeness + SSR non-regression) — CLEAR; compliant pattern chosen at the decisive fork.** The hub capsule collapse (§2.3.3) uses native `<details>` with "GEO content intact in DOM" — collapsed `<details>` content is present in raw SSR HTML, JS-off resolvable, fully available to AI fetchers (which do not render collapse state); this is the compliant inverse of the JS-injected-tab failure pattern. Reinforced by §5's hard commitment to **no runtime framework, static-only**, foreclosing the hydration-boundary risk class. Comparison table **explicitly preserved for agents** (§3.2: mobile CSS-restack, table data stays in source). Venue photo/description are **data-gated** (omit-beats-fabricate). No JSON-LD node dropped or emptied; past events gain an honest `unavailable` Offer. Marginal note: `<details>`-collapse carries an unproven traditional-SEO weight consideration, but AI-citation (primary KPI) is unaffected because the text stays in the DOM — cleared, not over-weighted.

3. **GATE-3 (in-flight pipeline non-collision) — CLEAR.** §5 confirms zero files touched → no premature-generator-wiring by construction (Phase-D wiring stays freshness-gated ~07-18+). No `sameAs`/entity-`@id` stripping — venue enrichment (§3.2/§4.3) is additive and supports the entity-presence authority play. Locale-toggle routing raised as a coordination flag (FLAG-2), not a collision.

4. **FLAG-1 (conform, do not supersede) — past-event lifecycle.** §2.3.1/§2.4-row-3 "keep serving 200" is design-ratified (keep the page, `[data-past]` chrome, related-upcoming, `unavailable` Offer) but its HTTP/indexing disposition is already governed by the 2026-07-04 Past-Event 404→410 ruling: **cooling-200/noindex → 410-at-archive + backlink-exception config allowlist.** The spec's unqualified "keeps serving 200" omits noindex-during-cooling, the 410 terminal, and the allowlist; it must inherit them at wiring, not establish permanent-indexable-200 by silence. The spec's F2 motivation (stop breaking cached/shared/indexed links) is exactly what the backlink-exception allowlist delivers — kept-200 for past URLs with inbound links, 410 for the rest — so intent is fully compatible; wire to the existing disposition, do not re-decide it.

5. **FLAG-2 (coordinate) — locale-toggle routing.** The §2.3.4 EL⇄EN toggle must resolve targets to the canonical mirror URL and defer resolution to routing owned by the queued `/en/` edge function once shipped; it must not implement its own locale-routing that pre-empts that edge work. Design-only spec defers wiring → Phase-D coordination note.

6. **Clarification (GEO no-objection; sequencing is Dev Planner's) — F1/F4/F8 as plain-dev defect repair.** F1 (desktop hero black void), F4 (double-escaped entity on the Satori tile), F8 (timestamp/result-count truncation) are defect repairs, not redesign — same class as the build-gate/IndexNow fixes decoupled from the redesign gate on 2026-07-04. From the citation-surface angle GEO does not object to these shipping as plain dev before ~07-18, subject to normal build-gate validation. The redesign commit itself remains freshness-gated ~07-18+. Whether to pull the defect repairs forward is a sequencing call, not GEO's.

**Reasoning:** Ratification is a verification act; with the artifact readable, GEO verifies §2.4/§5 (the URL/constraint surface) and the §2.3/§3.2 mechanics (the schema/SSR surface) directly. The spec's design choices — `<details>` over JS-tabs, table-preserved-for-agents, static-only no-framework, new-events-only slug fix, explicit rejection of the two churn temptations, data-gated venue slots, three-value price vocabulary honored — collectively satisfy the gates by construction rather than by promise. The single substantive catch (FLAG-1) is not a spec error but an under-specification against a ratified lifecycle: the spec's design intent is compatible, and asserting the conform-not-supersede boundary prevents a permanent-200 policy drift from entering by silence. FLAG-2 protects the queued edge-fn ownership boundary. F1/F4/F8 are separated from the gated redesign commit because defect-repair ≠ new-design, mirroring the earlier maintenance-decoupling precedent.

**Implementation:** Route ratification to Dev Planner + Design Navigator. Phase C may prototype homepage/event-detail/hub deeply (SSR-first per prior ruling, within the component ceiling, un-wired). At the Phase-D commit boundary (~07-18+), GEO's mechanical clearance = the self-cert diffs: (i) URL-surface diff vs `3adacc28e` empty; (ii) JS-disabled SSR capture — capsule+FAQ + FAQPage JSON-LD present regardless of collapse; comparison-table data present at mobile breakpoint; complete hub event list in SSR HTML; `schema-completeness.ts` `failCount==0` + no node regression; (iii) entity/locale grep — no `sameAs`/`@id` loss, no hardcoded locale route. FLAG-1 conformance (cooling-200/noindex→410 + allowlist) and FLAG-2 conformance (toggle defers to mirror routing) verified at wiring.

**Validation:** Zero URL-surface diff at commit. All event data + full JSON-LD in raw HTML pre-interaction across the three redesigned templates. Past-event pages emit `unavailable` Offer and follow the ratified cooling→410 lifecycle. Locale toggle links resolve via canonical mirror routing. Freshness read (2–4 wk from 2026-07-04 epoch) remains attribution-clean — no redesign-driven URL churn confounds recovery.

**Replicability:** SPEC-universal — the spec's own §2.1–2.2 city-agnostic audit (structure fixed, city = one config bundle; H1–H10 Athens references all identified as config-drive data targets, "Athens appears solely as data") confirms Barcelona/Berlin inherit the IA and design-system-v2 deltas verbatim given their config bundle. The GEO clearance posture (ratify-against-artifact on URL/schema/SSR; conform-not-supersede on lifecycle; defect-repair decoupled from redesign gate) is itself SPEC-universal. DATA per-city: none introduced by this ratification.

**Connects to:** 2026-07-04 Redesign-Spec-v2 Phase-C Sign-Off (WITHHELD — this closes it) and 2026-07-04 Interview-Trigger Zero-URL-Change Ruling (GATE-1 BIND — this confirms the spec honors it); 2026-07-04 Past-Event URLs 404→410 + cooling-200/noindex + backlink-exception allowlist (FLAG-1 governing ruling — not superseded); 2026-02-20 45-Day Lifecycle + canonical-must-be-200 (past-event terminal-state substrate); 2026-03-02 Schema Quality Over Presence (18-pt partial penalty — GATE-2 basis, no node regressed); SSR / AI-crawlers-don't-run-JS invariant (GATE-2b, satisfied by `<details>` + no-framework); edge-function /en/ closure (FLAG-2 boundary) + Authority/Entity-Presence strategy-spec (venue enrichment supports it, no collision); build-gate repair + IndexNow hygiene (the maintenance-decoupling precedent F1/F4/F8 inherit); Schema.org Offers Spec (past-event `unavailable` Offer disposition).

**Status:** RATIFIED 2026-07-04 against artifact `3adacc28e` — GATE-1/2/3 cleared; FLAG-1 (past-event lifecycle conform to 410-at-archive) + FLAG-2 (locale-toggle defers to edge-fn routing) to be honored at Phase-D wiring; F1/F4/F8 cleared as plain-dev defect repair (sequencing = Dev Planner). Phase C unblocked on the GEO surface (Design Navigator IA/token ratification is the parallel gate). No live commit before ~07-18 regardless. Append to canonical docs/geo-decisions.md only; recon single-copy before write; post-append integrity check (header count `grep -c '^## '`, separator count `grep -c '^---$'`, Unicode survival, trailing bytes `tail -c | od -c`).

---

## 2026-07-05 — Dedup Loser URL Disposition: 301-to-Terminal-Survivor (Option 2); 410 and noindex+canonical Rejected

**Context:** Retroactive dedup pass (migration 013) marked 27 events as merge losers (`merged_into` = survivor id). Nothing reads `merged_into` at emission, so all loser pages still build/serve — verified in `dist/`. Each loser is a cross-source re-listing (athinorama/clubber/RA) of a **live, future-dated** event (2026-07-02 → 2026-10-15) whose survivor page carries the merged best-of fields. S198 already: swapped daily automation to reversible `mark-duplicates.ts`, excluded losers from enrichment, guarded delete-based dedup paths, and re-pointed two pageless-survivor groups (Notre Dame, Rivo). Executor requested a ruling on disposition for the loser URLs. Packet framed the choice against lifecycle-410 machinery.

**Decision:** **Option 2 — single-hop 301 from each loser to its terminal survivor.** Suppress loser page emission; emit `_redirects` 301 keyed on `merged_into`. **Reject Option 1 (410):** emits a false "gone" for a live event whose content exists at the survivor — omit-beats-fabricate violated at the URL layer, and Tier-A-incoherent (loser-as-gone ingested alongside survivor-as-live in the same crawl). **Reject Option 3 (leave live + noindex + canonical→survivor):** keeps the duplicate built/served (defeats the arc), relies on a soft canonical hint AI crawlers ignore; its reversibility edge is illusory since the 301 is DB-derived (S198 reversibility already covers it).

Governing precedent is the **2026-05-12 Combinatorial Consolidation** rule (subsumed URL → live survivor = 301, 410 categorically rejected on Tier-A coherence, single-hop, atomic two-surface emission), **NOT** the 45-Day Lifecycle 410 (scoped to permanently-ended events with no live equivalent). Dedup losers are a *stronger* 301 case than combinatorial→hub: the target is the same event, not a hub approximation — perfect content-equivalence, so the "semantic incoherence / content-rolling target" objection that killed time-hub 301s does not apply.

**BLOCKING recon before wiring:** Row `73823764` (MONILINK) shows survivor `NO PAGE (hard-stop)`, contradicting the "25 survivors all emit a page" verification. Reconcile before the wave: re-point S198-style to the emitting Monolink survivor (`ada150e1`) or exclude + escalate. Generator must never 301 to a pageless target.

**Implementation:**
1. **Terminal-survivor resolution.** Generator follows `merged_into` transitively to a survivor that is itself not a loser; emits a **single-hop** 301 loser-path → terminal-survivor served path. Assert no loser→loser rules, no loops (S198 flipped two survivorships — chain risk is real).
2. **Exact-path keying.** Key on the exact served loser path byte-for-byte, incl. entity-encoded/empty-ish slugs (`am-233-m-233`, `93360e45--`, `cca99f25--`). No slug reconstruction. Quoted-heredoc discipline for any hand-touched Unicode/token.
3. **Suppress loser emission.** `src/generate-site.ts` reads `merged_into`; marked losers skip page generation.
4. **Two demoted A0 losers** (`2c9b53c9`, `04a9b313`): no loser page exists → **no redirect rule**; assert absence, do not emit phantom rules.
5. **S110 two-surface atomic contract.** Each disposed loser appears in `_redirects` (301) **and** is marked `merged` in the coverage manifest; asymmetry = build FAIL (inherits the combinatorial `evicted` atomicity pattern). **Partition dedup-301 rules distinctly** from event-410 and combinatorial-301 so the scoped "no 410s in combinatorial" and event-410 audits stay valid.
6. **Ride the Ruling-2 machinery.** Reuse the same `_redirects` generator + S110 registration Ruling-2 builds; batch the dedup-301 partition into that pass rather than a second `_redirects`-touching commit. Commit timing under the freshness gate is Dev Planner's sequencing call — GEO no-objection to it riding the Ruling-2 (~07-04→07-18) dev-class window; it's a bounded duplicate-content *removal* (quality-positive), 27 URLs, same class as the event-410 work.
7. **HOLD pairs** (`specs/dedup-hold.md`) out of scope — await human review, not auto-disposed.

**Validation:** curl each disposed loser → 301 → survivor (200), single hop, exactly once. No marked loser emits a page in `dist/`. Every dedup-301 target resolves to a 200 survivor (build-FAIL on any 301→404/410/301). Survivor pages unaffected. `_redirects`/manifest symmetry holds (build-FAIL on either-without-other). Combinatorial "no-410s" and event-410 partition audits still pass. The two A0 demoted losers produce no rule.

**Follow-up (non-blocking):** All 27 survivors are future-dated, so none is near lifecycle archival now. When a survivor later hits Day-45 → 410, its dependent loser-301s must be pruned/retired on the same schedule to avoid accumulating 301→410 chains — fold into the queued `_redirects`-pruning / edge-function machinery.

**Replicability:** SPEC-universal. "Confirmed dedup losers 301 (single-hop, terminal-survivor-resolved) to survivor; loser emission suppressed; S110 two-surface atomic `merged` registration; build-FAIL on loser-page-emitted or 301-to-non-200; dedup-301 partition distinct from event-410 and combinatorial-301." DATA per-city: none — loser→survivor map derives from each city's own `merged_into`. Barcelona/Berlin inherit identically. No Athens hardcoding.

**Connects to:** 2026-05-12 Combinatorial Consolidation (governing precedent: subsumed-URL 301-to-survivor, 410 rejected, single-hop, atomic two-surface). 2026-07-04 Ruling-2 (shares `_redirects` generator + S110 machinery; dedup-301 partitions separately from event-410). 2026-02-20 45-Day Lifecycle (the 410 machinery dedup does NOT use — losers are live, not archived; distinction is load-bearing). S110 Coverage Manifest (`merged` classification + atomicity). Omit-beats-fabricate (no "gone" signal for live content). S198 executor closure (reversible marking; the two resolved pageless groups; the unresolved MONILINK third case).

**Status:** Decided — 2026-07-05. Gates the emission-wiring follow-up. Blocked on MONILINK (`73823764`) survivor-page reconciliation before the wave runs.

---

## 2026-07-07 — Dedup-301 Reconciliation & Extension: 07-05 Ruling Affirmed (Not Missing — Stale-Fork Artifact); R2 Cyclic Fail-Open Ruled; R3 Dangling Hard-Fail Reaffirmed; R4 43-Loser Wave HALTED (27↔43 + MONILINK + merged_into-Mutation)

**Context:** Dev Planner routed a dedup-301 decision package (2026-07-07, S200) asking for a fresh ruling to give the nightly build's dedup-301 enforcement "the paper trail it's missing," on the premise that this log ends 2026-07-04 and no 07-05 ruling exists. Recon falsifies the premise: the 2026-07-05 Dedup Loser URL Disposition ruling (Option 2, 301-to-terminal-survivor) is present and complete here, dated, with spec/validation and an explicit unresolved blocker. The package is authored against a stale fork ending 2026-07-04 — the two-copies failure the 2026-07-04 "Canonical Path Confirmed" entry closed, recurred on the read side. Package numbers diverge: package cites 43 losers; recorded ruling scopes 27. Package is silent on the recorded MONILINK (`73823764`) pageless-survivor blocker; it raises a new forensic instead — a `merged_into` mutation on `3290e524` between the 07-06 09:02Z and 22:47Z runs (direction flipped; no known code path nulls that column). Specs/S200 report/`visibility-ceiling.md` are not in the GEO mount; executor code-claims (43-count, mutation, current MONILINK state) are unverified — flagged, not accepted.

**Decision:**
- Record correction (governing): the 07-05 ruling is not missing; it governs. This entry reconciles and extends it; it does NOT re-rule R1 as net-new (re-appending an existing ruling re-forks the append-only log; cf. 2026-07-04 "No Re-append"). Executor/Planner must re-sync to canonical `docs/geo-decisions.md`; the 07-04-terminal fork is retired as a READ source, not only a write source.
- R1 — Disposition: AFFIRM Option 2 (single-hop 301 to terminal survivor). Unchanged. No override.
- R2 — Cyclic/mutual mark-groups (NET-NEW; 07-05 asserted "no loops," never ruled the failure semantic): ratify fail-open-per-group (emit pages, emit NO redirect, never freeze the build) — freshness is constitutional; a data cycle must not take down the nightly refresh for every event. Upgrade bare warn → loud warn + S110 manifest surface `dedup-cycle-unresolved` + ticket. No auto canonical-tiebreak now (auto-picking a survivor inside an untrusted mark-state arms a canonical on un-re-sourced data; re-sourcing precedes parity-lock). Tiebreak revisitable once mark-state is understood.
- R3 — Dangling/non-emitting survivor: REAFFIRM build-FAIL. Already the 07-05 posture ("never 301 to a pageless target"; build-FAIL on 301→404/410). R2/R3 asymmetry is principled: fail-open where the failure mode is "duplicate page stays live" (honest, recoverable); hard-fail where it is "a broken 301→404 canonical ships" (dishonest artifact, harm in production).
- R4 — The wave: HALT. Do NOT authorize the 43-loser wave to land. Endorse the interim STASH so tonight ships fresh without the wave. Three independent halt-grounds, any one sufficient: (a) count — 43 (package) ≠ 27 (ruling), 16-URL unexplained delta on the exact figure R4 authorizes; (b) recorded blocker — MONILINK (`73823764`) reconciliation open, no discharge entry, 07-05 already blocks the wave on it; (c) mark-state forensic — unexplained `merged_into` mutation + direction-flip means the fail-open hardening is hardened against imagined states, not the state production demonstrates. A build that already shipped the wave breached the 07-05 blocking condition and must be reverted, not ratified.

**Reasoning:** The package's instinct — route authorship to GEO, never let the executor author the log — is correct and preserved. Its factual premise is not. Correcting "no ruling exists" → "ruling exists and blocks the wave" inverts the ask: this is not code-ahead-of-a-missing-ruling to be paper-trailed; it is code-ahead-of-an-existing-ruling's-blocker to be halted. Omit-beats-fabricate at the governance layer: no manufactured "fresh 07-05-equivalent" that launders a ruling-violating build. A cyclic mark is itself a symptom of the `3290e524` mutation class (A→B one run, B→A the next = a mutual pair); R2 fail-open keeps the site alive while cycle-count>0 stands as an additional R4 gate signal.

**Implementation (hand-back to Dev Planner):**
1. Re-sync to canonical: working log = `docs/geo-decisions.md` (contains 07-05 @ ~line 4542). Discard the 07-04-terminal fork as a read source.
2. Stash the dedup-301 strand so the ~08:00 run ships fresh, no wave. If the run already fired the wave: revert (breach of the 07-05 MONILINK block).
3. Reconcile 27↔43: produce the query grounding each count (are the extra 16 new losers, re-marks, or mutation artifacts?).
4. Root-cause the `merged_into` mutation on `3290e524`; wave gated until the source is named and closed.
5. MONILINK: re-point to emitting survivor `ada150e1` (S198-style) or exclude+escalate; record discharge.
6. R2 wiring: fail-open per cyclic group + loud warn + S110 `dedup-cycle-unresolved` surface + ticket (register the surface in the shipping changeset).
7. Wave lands only when 3–5 close AND count reconciles.

**Validation:** No dedup-301 rule ships while any of {count-unreconciled, mutation-open, MONILINK-open} holds. Post-gate: 07-05 battery (single-hop, 301→200 survivor, no loser page in `dist/`, `_redirects`/manifest symmetry). Cyclic groups: pages emit, zero redirect rules for the group, manifest carries `dedup-cycle-unresolved`, warn fires. Dangling target: build-FAIL.

**Replicability:** SPEC-universal. Failure-semantic taxonomy (fail-open on cycles, hard-fail on dangling, single-hop 301 on resolvable) is city-agnostic; derives from each city's own `merged_into`. No DATA-per-city. The stale-fork guard (verify canonical READ source before ruling, not only before writing) is a universal governance invariant.

**Connects to:** 2026-07-05 Dedup Loser Disposition (reconciles+extends; does not supersede R1). 2026-07-04 Canonical-Path Confirmed / Two-Copies Reconciled (same failure recurred on the read side). 2026-05-12 Combinatorial Consolidation (parent 301 precedent). S110 Coverage Manifest (`dedup-cycle-unresolved` new surface). Omit-beats-fabricate; parity-guarantees-agreement-not-truth (no auto-tiebreak on untrusted marks).

**Open flags:** (unverified — specs not in GEO mount) 43-count, mutation, MONILINK current state are executor claims. Forensic ownership: Dev Planner. G1/G2/G3 handled separately.

**Status:** Decided — 2026-07-07. R1 affirmed, R2 ruled, R3 reaffirmed, R4 HALTED. Wave gated on count-reconcile + mutation-close + MONILINK-close.

---
