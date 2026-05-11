# S133 — Schema-Validator Warnings Inventory

**Status**: Classified — no fix in this session.
**Session**: S133
**Date**: 2026-05-11
**Source**: Today's build (`/tmp/s133-build.log`) and latest pipeline log (`logs/pipeline-2026-05-11.log`)

## TL;DR

42 warnings + 0 errors across 6346 generated pages (99% pass). Categorized into 4 patterns: 2 are data-gap (venue-level), 2 are template-level (hub pages). Plus INFO-level findings, separate from warning count by design.

## Current numbers (from today's build)

```
📋 Schema completeness: 6304/6346 pages fully valid (99%)
   📊 6271 event + 25 hub + 49 venue + 1 datafeed pages
   ✅ 6304 pass  ⚠️  42 warnings  ❌ 0 errors
   ℹ️  5989 pages with INFO findings (Sprint 2 Component B-2 — orthogonal to pass/warn/fail)
```

## Warning categories

### Category 1 — `location.geo` missing (40 events)

**Source**: Venues lack lat/lng coordinates in `athens-venues.json` or `venue_context` table.

**Fix shape**: Data backfill via geocoding (one-time per venue, not per event). Likely 5-10 venues account for all 40 events. Worth a single batch geocode pass.

**Effort**: Small. One script run. Has to be done outside the build pipeline.

**Priority**: Low — geo is for rich-result eligibility; absence doesn't block indexing.

### Category 2 — `streetAddress` empty (23 events)

**Source**: Same root cause as Category 1 — venues without complete address records. Overlap with Category 1 is likely high (a venue missing geo usually misses streetAddress too).

**Fix shape**: Same data backfill. Coalesce with Category 1.

**Effort**: Small.

**Priority**: Low — same reasoning.

### Category 3 — `CollectionPage.itemListElement` empty (2 hub pages)

**Source**: Template emits a `CollectionPage` JSON-LD even when the underlying event list is empty (hub for a niche genre/time combo with no current matches).

**Fix shape**: Conditional emit in the hub generator — skip the `CollectionPage` block when `itemListElement` would be empty, OR provide a `numberOfItems: 0` and skip the array entirely.

**Effort**: Small template change. Single file, single condition.

**Priority**: Low — empty CollectionPage is mildly weird for Google but not actively harmful.

### Category 4 — `FAQPage` JSON-LD missing (2 hub pages)

**Source**: Hub template should emit FAQ schema but doesn't for 2 specific hubs.

**Fix shape**: Find the conditional that gates FAQ emission and check what makes these 2 hubs miss it. Likely a content/data-availability check that's stricter than intended.

**Effort**: Small — investigation > fix.

**Priority**: Low.

## By event type (warnings only, excluding INFO)

```
concert     1031/1050 (98%)  ⚠️  19
dj_set      434/453 (96%)   ⚠️  19
theater     4609/4611 (100%) ⚠️  2
exhibition  24/24 (100%)
festival    34/34 (100%)
performance 18/18 (100%)
show        59/59 (100%)
workshop    12/12 (100%)
tech        8/8 (100%)
dance       2/2 (100%)
```

Concert + dj_set together account for 38 of 42 warnings (90%). These are the event types most affected by missing venue geo/address — likely because venue diversity is highest in those types (clubs and small concert venues vs more-curated theater scene).

## INFO-level findings (separate from warning count, no fix needed)

```
5938/6346 (94%) location.sameAs missing (Wikidata QID, Google Place URL, official URL)
170/6346 (3%)   offers.url is omitted (legitimate for non-merchant ticket sources)
48/6346 (1%)    venue sameAs missing (Wikidata QID, Google Place URL, official URL)
```

These were ratcheted from WARN to INFO in earlier sprints (severity decisions live in `src/validators/schema-completeness.ts:168-176`, `sameAsSeverity` parameter). They represent intentional non-coverage:

- `location.sameAs` (94% missing): unrealistic to backfill; not a Google-required field.
- `offers.url` omitted (3%): legitimate for events whose ticket source isn't a merchant URL (free events, door sales, etc.).
- `venue sameAs` (1%): same shape as location.sameAs but venue-level. Tracked by venueSameAs ratchet (3/242 populated).

Out of scope for any warnings-cleanup pass.

## Connection to GSC's "6 non-critical issues"

Per S132' notes, Google Search Console reported 6 non-critical structured-data issues. The categories above (especially #1/#2 — missing geo/address) align with what GSC would flag as non-critical. Closing the validator-depth gap from S132' (multi-block JSON-LD enumeration) means the local validator is now seeing what Google sees. This is good — the local validator can be the primary signal for fixes, rather than waiting for GSC.

## Recommendation for follow-up sessions

**Bundle suggestion**: Categories 1 + 2 are data backfill (one geocoding pass per missing venue). Categories 3 + 4 are template fixes on the hub generator. Two separate sessions:

- **Session A — Venue data backfill**: One script that geocodes missing venues (using a known geocoder; venue names are stable). Likely closes 60+ warnings if there's overlap between geo-missing and address-missing on the same venues.

- **Session B — Hub template fixes**: Investigate the 4 hub pages (2 + 2) and patch the conditional emit. Likely a one-line fix per condition.

Neither session needs a Plan. Both fit in a single maintenance batch.

## Validator file references

- `src/validators/schema-completeness.ts:168-176` — `sameAsSeverity` (INFO vs WARN decision)
- `src/validators/schema-completeness.ts:246-262` — warning emission for missing description, streetAddress, geo, image
- `src/validators/schema-completeness.ts:268-282` — placeholder detection (also warnings)

## Numbers reconciliation

Brief said 40 warnings. Today's build shows 42. The 2-warning increase reflects new events imported since the brief was written, not a regression. Distribution shape is identical (Categories 1/2 grew by 1-2 each).
