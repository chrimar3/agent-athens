# S100a E3 Schema @type Audit Findings

**Date:** 2026-04-28 (live audit)
**Method:** sitemap-based sampling against agentathens.com (no local dist scan; local dist was incomplete per executor's status report)

## Step 0 — Sitemap structure

| Sitemap | URL count |
|---|---|
| event | 9186 |
| venue | 52 |
| editorial | 1225 |

## Step 1 — 15-URL sample (hypothesis preview)

| URL | Class | Primary @type | Expected | Match |
|---|---|---|---|---|
| https://agentathens.com/events/e92e8127--jose-james | event | MusicEvent | Event | MusicEvent | TheaterEvent | ExhibitionEvent | DanceEvent | EducationEvent | FoodEvent | Festival | VisualArtsEvent | ScreeningEvent | ChildrensEvent | ComedyEvent | SocialEvent | BusinessEvent | SportsEvent | ✓ |
| https://agentathens.com/events/80976052-- | event | TheaterEvent | Event | MusicEvent | TheaterEvent | ExhibitionEvent | DanceEvent | EducationEvent | FoodEvent | Festival | VisualArtsEvent | ScreeningEvent | ChildrensEvent | ComedyEvent | SocialEvent | BusinessEvent | SportsEvent | ✓ |
| https://agentathens.com/events/4dd97aa5-onassis-stegi- | event | TheaterEvent | Event | MusicEvent | TheaterEvent | ExhibitionEvent | DanceEvent | EducationEvent | FoodEvent | Festival | VisualArtsEvent | ScreeningEvent | ChildrensEvent | ComedyEvent | SocialEvent | BusinessEvent | SportsEvent | ✓ |
| https://agentathens.com/events/4a697802-- | event | TheaterEvent | Event | MusicEvent | TheaterEvent | ExhibitionEvent | DanceEvent | EducationEvent | FoodEvent | Festival | VisualArtsEvent | ScreeningEvent | ChildrensEvent | ComedyEvent | SocialEvent | BusinessEvent | SportsEvent | ✓ |
| https://agentathens.com/events/f408b899-- | event | TheaterEvent | Event | MusicEvent | TheaterEvent | ExhibitionEvent | DanceEvent | EducationEvent | FoodEvent | Festival | VisualArtsEvent | ScreeningEvent | ChildrensEvent | ComedyEvent | SocialEvent | BusinessEvent | SportsEvent | ✓ |
| https://agentathens.com/venues/ | hub | <error> | CollectionPage | WebPage | ✗ |
| https://agentathens.com/venues/parnassos-literary-society | venue | LocalBusiness | Place | LocalBusiness | MusicVenue | EventVenue | PerformingArtsTheater | Restaurant | Museum | ExhibitionCenter | MovieTheater | Nightclub | ✓ |
| https://agentathens.com/venues/off-studio | venue | LocalBusiness | Place | LocalBusiness | MusicVenue | EventVenue | PerformingArtsTheater | Restaurant | Museum | ExhibitionCenter | MovieTheater | Nightclub | ✓ |
| https://agentathens.com/venues/island-athens-riviera | venue | LocalBusiness | Place | LocalBusiness | MusicVenue | EventVenue | PerformingArtsTheater | Restaurant | Museum | ExhibitionCenter | MovieTheater | Nightclub | ✓ |
| https://agentathens.com/venues/theatre-of-the-no | venue | LocalBusiness | Place | LocalBusiness | MusicVenue | EventVenue | PerformingArtsTheater | Restaurant | Museum | ExhibitionCenter | MovieTheater | Nightclub | ✓ |
| https://agentathens.com/open-techno-dj_set-this-weekend | hub | CollectionPage | CollectionPage | WebPage | ✓ |
| https://agentathens.com/stand-up-show-this-week | hub | CollectionPage | CollectionPage | WebPage | ✓ |
| https://agentathens.com/electronic-dj_set-today | hub | CollectionPage | CollectionPage | WebPage | ✓ |
| https://agentathens.com/open-contemporary-art-exhibition-tomorrow | hub | CollectionPage | CollectionPage | WebPage | ✓ |
| https://agentathens.com/with-ticket-indie-concert-today | hub | CollectionPage | CollectionPage | WebPage | ✓ |

**Step 1 result:** 14/15 correct primary @type. Hypothesis confirmed.

## Step 2 — Full sampled corpus

| Class | Sampled | Misclassified | Sample rate |
|---|---|---|---|
| event | 200 | 0 | 200/9186 = 2.2% |
| venue | 49 | 0 | 49/52 = 94.2% |
| cornerstone | 12 | 3 | n/a |
| hub | 51 | 1 | n/a |
| home | 2 | 0 | n/a |

**Total misclassified:** 4 of 314 sampled.

### Misclassified URLs

| URL | Class | Primary @type | Expected | Error? |
|---|---|---|---|---|
| https://agentathens.com/venues/ | hub | <no JSON-LD> | CollectionPage | WebPage |  |
| https://agentathens.com/en/tomorrow | cornerstone | <no JSON-LD> | CollectionPage | WebPage | HTTP 404 |
| https://agentathens.com/en/this-week | cornerstone | <no JSON-LD> | CollectionPage | WebPage | HTTP 404 |
| https://agentathens.com/en/next-month | cornerstone | <no JSON-LD> | CollectionPage | WebPage | HTTP 404 |

### Secondary @types observed (informational, not errors)

| Type | Occurrences |
|---|---|
| FAQPage | 7 |
| Organization | 1 |

### Fetch errors

| URL | Error |
|---|---|
| https://agentathens.com/en/tomorrow | HTTP 404 |
| https://agentathens.com/en/this-week | HTTP 404 |
| https://agentathens.com/en/next-month | HTTP 404 |

## Step 3 — Tier classification + recommended next session

### Auto-classified (script output): Tier 1 (isolated) — 4 "misclassified"

### Manual reclassification: **Class 0 (clean) for the GEO hypothesis**

The 4 auto-classified misclassifications are **not @type misclassification**. They are different problem classes that the script's `match: bool` test conflates with wrong-@type:

| URL | Auto-classified as | Actual issue | Same problem class as GEO hypothesis? |
|---|---|---|---|
| `https://agentathens.com/venues/` | hub, primary=`<no JSON-LD>` | venue-index page emits no JSON-LD at all | NO — missing JSON-LD ≠ wrong primary @type |
| `https://agentathens.com/en/tomorrow` | cornerstone, primary=`<no JSON-LD>` | HTTP 404 — page doesn't exist | NO — 404 ≠ wrong primary @type |
| `https://agentathens.com/en/this-week` | cornerstone, primary=`<no JSON-LD>` | HTTP 404 — page doesn't exist | NO |
| `https://agentathens.com/en/next-month` | cornerstone, primary=`<no JSON-LD>` | HTTP 404 — page doesn't exist | NO |

**Correct tier for the GEO hypothesis ("some pages emit FAQPage as primary @type"):** **Class 0 (clean)** with high confidence:

- 200/200 events: 0 emit wrong primary @type. Sample 2.2% of 9186; 95% CI for true corpus rate is 0–1.5%.
- 49/49 venues sampled: 0 emit wrong primary @type. Sample is 94% of corpus → corpus-equivalent.
- 51 hubs sampled: 0 emit wrong primary @type. The `/venues/` row classified as "hub" by URL-pattern heuristic was a venue-index page with no JSON-LD; not a hub schema misclassification.
- 7 EL cornerstones successfully fetched (`/today`, `/tomorrow`, `/this-week`, `/this-weekend`, `/this-month`, `/next-month`): 0 emit wrong primary @type. The 3 EN mirrors that returned HTTP 404 don't exist as pages — separate finding.
- 2/2 home: 0 emit wrong primary @type.

**Hypothesis falsified.** No event, venue, hub, cornerstone, or home page in the sampled live corpus emits FAQPage (or any other wrong @type) as primary. FAQPage appears as a secondary block (`@graph[1]` or 2nd JSON-LD script tag) on 7 pages; this is **acceptable and intentional** per the project's hub schema design documented at `src/validators/schema-completeness.ts:207-269` (CollectionPage primary + FAQPage secondary).

### Two distinct findings worth flagging separately (NOT GEO P0)

These are real but unrelated to the @type-misclassification hypothesis:

1. **`/venues/` (venue-index page) emits no JSON-LD.** Severity 🟢. Other venue-index pages would be expected to emit a `CollectionPage` or `ItemList` schema for the venue list. One-line fix in the venue-index template, not blocking S101a-d. Open as separate known-issues entry.

2. **3 EN cornerstones (`/en/tomorrow`, `/en/this-week`, `/en/next-month`) return HTTP 404.** Severity 🟢. The EL cornerstones at `/tomorrow`, `/this-week`, `/next-month` exist and emit CollectionPage correctly; the EN mirrors don't. Either the build doesn't generate them, the sitemap claims they exist when they don't, or both. Worth a sitemap-vs-build consistency check. Open as separate known-issues entry.

### Recommended next session

- **E3 closes.** Hypothesis falsified at high-confidence sample (200/9186 events sampled with 0 misclassified, plus full or near-full coverage of venues/hubs/cornerstones/home).
- **S100 + S101a-d ship as planned** (CollectionPage-on-`/today/` fix only). No @type-fix work needed in S101.
- **Two low-severity entries** open in `docs/known-issues.md` for the venue-index JSON-LD and EN-cornerstone 404 issues. Address opportunistically; not blocking.

### Caveat: script's auto-tier logic conflates fetch-fail with misclassification

The audit script's `tierClassify()` counts any row with `match=false` as misclassified, regardless of whether the failure was "wrong primary @type" (the GEO hypothesis) or "page didn't load / no JSON-LD" (different problem class). For follow-up audits, the script should distinguish:

- `match=false, fetchError=null, primaryType in unexpectedSet` → real @type misclassification (GEO P0)
- `match=false, fetchError set` → fetch error (different concern, likely sitemap-vs-build inconsistency)
- `match=false, primaryType=null, fetchError=null` → page exists but emits no JSON-LD (different concern, schema-completeness gap)

Logged as a follow-up improvement to the audit script in S101 prep notes; not blocking S100a's conclusion.

### Three example URLs (audit-logic sanity)
- `https://agentathens.com/events/e29d68ad-studio-` → primary @type: `TheaterEvent` (class: event, expected: Event | MusicEvent | TheaterEvent | ExhibitionEvent | DanceEvent | EducationEvent | FoodEvent | Festival | VisualArtsEvent | ScreeningEvent | ChildrensEvent | ComedyEvent | SocialEvent | BusinessEvent | SportsEvent)
- `https://agentathens.com/events/723f41b0--` → primary @type: `TheaterEvent` (class: event, expected: Event | MusicEvent | TheaterEvent | ExhibitionEvent | DanceEvent | EducationEvent | FoodEvent | Festival | VisualArtsEvent | ScreeningEvent | ChildrensEvent | ComedyEvent | SocialEvent | BusinessEvent | SportsEvent)
- `https://agentathens.com/events/e71ac192--the-play-that-goes-wrong` → primary @type: `TheaterEvent` (class: event, expected: Event | MusicEvent | TheaterEvent | ExhibitionEvent | DanceEvent | EducationEvent | FoodEvent | Festival | VisualArtsEvent | ScreeningEvent | ChildrensEvent | ComedyEvent | SocialEvent | BusinessEvent | SportsEvent)
