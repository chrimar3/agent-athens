# Schema Gaps Diagnostic — Post-Geocoding

**Date:** 2026-04-15
**Baseline:** Schema completeness jumped from 13% → 95% after Google Geocoding fallback + backfill fix

## Current State

- **Schema completeness:** 95% (9,695/10,217 pages fully valid)
- **Warnings:** 519 across all pages
- **Errors:** 3 (CollectionPage JSON-LD missing on hub pages — structural, not data)
- **Published events:** 9,561

## Gap 1: location.geo (residual)

- **Missing:** 155 events (1.6%) across 14 distinct venues
- **Build impact:** 216 pages flagged (155 events + ~61 venue/hub pages)
- **100% overlap with streetAddress gap** — same 14 venues lack both

### Venue Classification

| Venue | Events | Classification | Fixable? |
|-------|--------|---------------|----------|
| Ιλίσια | 66 | Ambiguous — neighborhood name, not a venue | Manual: identify actual venue |
| Οίκος Ερμηνείας Ελευθερία | 33 | Real venue | Manual lookup |
| Θέατρο ΕΝ-Α | 21 | Real venue | Manual lookup |
| Burger Disco Club | 18 | Real venue | Manual lookup |
| LYCABETTUS THEATER | 3 | Real venue (likely Θέατρο Λυκαβηττού) | Manual lookup — may be a variation |
| WE Πολυχώρος | 3 | Real venue | Manual lookup |
| Don't be a Dick | 3 | Real venue (bar) | Manual lookup |
| TBA - ATHarea | 2 | Placeholder | Accept gap |
| Οικία Κατακουζηνού | 1 | Real venue | Manual lookup |
| Κλειστό Γήπεδο Αμαρουσίου | 1 | Real venue (Maroussi gym) | Manual lookup |
| ΕΞΑ - ΑΘΗΝΑ | 1 | Real venue | Manual lookup |
| Δημοτικό Κηποθέατρο Παπάγου | 1 | Real venue | Manual lookup |
| The Ellinikon Experience Centre | 1 | Real venue | Manual lookup |
| OTEAcademy | 1 | Real venue | Manual lookup |

- **Root cause:** Neither Nominatim nor Google could resolve these names — ambiguous names, very new venues, or unusual naming
- **Fix type:** Manual coordinate lookup for top 4 (covers 138/155 events = 89%), accept gap for rest
- **Effort:** ~15 min manual work for top 4 venues

## Gap 2: streetAddress

- **Missing:** 155 events (1.6%) + 2 with generic address ("Athens, Greece")
- **Build impact:** 212 pages flagged
- **Master venue coverage:** 278/278 venues (100%) have real addresses
- **Root cause:** Same 14 ungeocoded venues — no venue in master = no address to propagate
- **Fix type:** Resolves automatically when Gap 1 is fixed (manual venue lookup includes address)

## Gap 3: doorTime

- **Missing:** 258 events (2.7%)
- **Build impact:** 317 pages flagged (258 events + ~59 venue/hub pages)

### By Source

| Source | Total Events | Has doorTime | % Coverage |
|--------|-------------|-------------|------------|
| athinorama.gr | 8,550 | 8,333 | 97.5% |
| more.com | 381 | 378 | 99.2% |
| residentadvisor | 244 | 241 | 98.8% |
| clubber.gr | 134 | 132 | 98.5% |
| ticketservices | 120 | 120 | 100% |
| megaron.gr | 62 | 36 | **58.1%** |
| halfnote | 49 | 49 | 100% |
| onassis | 5 | 5 | 100% |
| benaki | 5 | 5 | 100% |
| eventbrite | 4 | 4 | 100% |
| manual | 3 | 0 | **0%** |
| others (4 sources) | 4 | 0 | **0%** |

- **Root cause:** Mixed — megaron.gr scraper doesn't always extract door time (26 events missing); athinorama.gr has 217 events without doorTime (2.5% of their total, likely exhibitions or events that genuinely have no set door time)
- **Fix type:** 
  - megaron.gr scraper update could recover ~26 events
  - Remaining ~217 from athinorama may be exhibitions (no door time concept) — likely accept gap
  - Manual/small sources: accept gap (8 events total)
- **Policy question:** Should exhibitions default to opening time as doorTime?

## Gap 4: image

- **Missing from DB:** 535 events (5.6%)
- **Schema impact:** NOT a schema warning — the build generates OG fallback images for all events
- **JSON-LD uses:** Generated OG image URL (e.g., `/images/og/events/{id}.png`) when no event image exists
- **Validator does NOT flag this** — image field is populated in schema via fallback

### By Source (missing event image)

| Source | Missing | % Missing |
|--------|---------|-----------|
| athinorama.gr | 481 | 5.6% |
| residentadvisor | 20 | 8.2% |
| clubber.gr | 11 | 8.2% |
| more.com | 8 | 2.1% |
| onassis | 5 | 100% |
| benaki | 5 | 100% |

- **Root cause:** Some event listings don't include images; onassis/benaki scrapers may not extract images
- **Fix type:** Not blocking schema completeness. Visual improvement only — could enhance scrapers
- **Impact on schema:** Zero — OG fallback covers it

## Gap 5: Errors (3 pages)

- **Type:** CollectionPage JSON-LD block missing on 3 hub pages
- **Root cause:** Structural template issue — some hub pages don't generate the expected schema block
- **Fix type:** Template fix in generate-site.ts hub page generation
- **Impact:** 3 pages only — negligible

## Summary: Path from 95% → 98%+

| Fix | Events Fixed | Effort | New % |
|-----|-------------|--------|-------|
| Manual lookup for top 4 ungeocoded venues | 138 | 15 min | 96.4% |
| megaron.gr scraper doorTime fix | ~26 | 30 min | 96.7% |
| Manual lookup for remaining 10 venues | 17 | 20 min | 96.8% |
| Accept remaining doorTime gaps (exhibitions) | — | — | — |

**Realistic ceiling:** ~97% with reasonable effort. The remaining 3% is:
- ~217 athinorama events without doorTime (likely exhibitions — accept)
- 3 hub page errors (template fix, low priority)
- 2 placeholder venues (TBA — accept)

## Recommendations (ordered by impact)

1. **Manual venue lookup for top 4** — 15 min, fixes 138 events (Ιλίσια, Οίκος Ερμηνείας, Θέατρο ΕΝ-Α, Burger Disco Club)
2. **Check "LYCABETTUS THEATER"** — likely a variation of existing Θέατρο Λυκαβηττού in master (3 events, 2 min)
3. **megaron.gr doorTime parser** — scraper update, ~26 events recovered
4. **Accept remaining gaps** — exhibitions without doorTime, placeholder venues, tiny sources
5. **Hub page template fix** — 3 CollectionPage errors, low priority
