# S137 — GSC Event-schema Triage

**Status:** Classified — no fix in this session. Triage spec for routing.
**Session:** S137
**Date:** 2026-05-18
**Superseded by:** `specs/gsc-schema-defects-2026-05-19-diagnostic.md` (post-2026-05-19-export classification)
**Source:** GSC export (Table.csv, last-crawled 2026-05-15/16/17) cross-referenced against current prod HTML on 4 sample URLs + DB/config probes.

## TL;DR

The 11 GSC Event-schema issues split:
- **2 real bugs** (data backfill, ~27-36 events affected, 8-11% of citation surface) — `location.address` empty subfields, `location.geo` missing.
- **2 known intentional omissions / structural gaps** — `performer` (no DB column), `organizer` (never emitted).
- **1 S134-intentional omission** — `Offer.validFrom` (removed by design 2026-05-11).
- **1 S134-classifier omission** — `offers` block omitted for listing-aggregator / no-URL events.
- **5 GSC-stale** — `image`, `endDate`, `eventStatus`, `description`, top-level `location` block — all present in current prod HTML; GSC report is from pre-fix crawl or sub-field flagging.
- **1 mixed (real+stale)** — `offers.url` (INFO-level intentional omission for non-merchant URLs; GSC may be flagging legit omissions).

**Recommendation:** Fold real-bug fix (venue data backfill, ~10 venues) into the Sprint 3 envelope-migration session. Don't open a standalone S137 fix session. Run URL Inspection batch first to clear the stale items.

## Step 0 — Deploy timeline verification

S134 (commit `733ad3f87`, 2026-05-11 21:38:41 +0300) shipped 4 days before earliest GSC crawl (2026-05-15). Prod evidence confirms deploy:
- `Offer.validFrom` absent on prod URLs (S134 removed it)
- Classifier-gated Offer omission observed (athinorama / no-URL events emit no `offers` block, merchant URLs do)

→ **S134 is live**; GSC crawl window (2026-05-15/16/17) saw post-S134 state.

## Step 1 — Production HTML probe (4 sample URLs)

JSON-LD shape inventory across the 4 brief-supplied URLs:

| Field | bbf00105 (Ίλιον Plus / "plus.ambassade") | e005c824 (Bolivar / Shimza) | 6b1d76d3 (Bolivar / Mahmut) | 603e7a77 (B-Side / Suneater) |
|---|---|---|---|---|
| `@type` | MusicEvent | MusicEvent | MusicEvent | MusicEvent |
| name / description | ✓ / ✓ | ✓ / ✓ | ✓ / ✓ | ✓ / ✓ |
| startDate / endDate | ✓ / ✓ | ✓ / ✓ | ✓ / ✓ | ✓ / ✓ |
| eventStatus | ✓ | ✓ | ✓ | ✓ |
| url | ✓ | ✓ | ✓ | ✓ |
| image | ✓ | ✓ | ✓ | ✓ |
| isAccessibleForFree | ✓ | ✓ | ✓ | ✓ |
| location (top-level) | ✓ | ✓ | ✓ | ✓ |
| location.address.streetAddress | ✓ "Kodrigktonos 17, Athens 104 34" | ✓ "Leoforos Poseidonos, Alimos 174 55" | ✓ same | ✗ **empty string** |
| location.address.{Locality,Region,Country} | ✓ Athens / Attica / GR | ✓ same | ✓ same | ✓ same (defaulted) |
| location.geo | ✓ via containedInPlace | ✓ | ✓ | ✗ **absent** (no venue coords) |
| offers | ✗ (no-URL) | ✓ (ra.co / known_merchant) | ✓ (ra.co) | ✗ (no URL / aggregator) |
| offers.validFrom | n/a | ✗ (S134) | ✗ (S134) | n/a |
| offers.category | n/a | ✗ | ✗ | n/a |
| **performer** | ✗ | ✗ | ✗ | ✗ |
| **organizer** | ✗ | ✗ | ✗ | ✗ |

## Step 2 — Venue data verification

`events` table sample for the 4 URLs:

```
6b1d76d30f20c286 | Bolivar         | Leoforos Poseidonos, Alimos 174 55 | 37.9082 | 23.7146
e005c824591ff13e | Bolivar         | Leoforos Poseidonos, Alimos 174 55 | 37.9082 | 23.7146
bbf001053a4b8ee9 | Ίλιον Plus      | Kodrigktonos 17, Athens 104 34    | 37.9944 | 23.7369
603e7a779969f928 | B side Athens   | (empty)                            | NULL    | NULL
```

`config/athens-venues.json` shape: 347 venues; possible keys = `address, canonical_name, neighborhood, sameAs, ticketing, variations, website`. Bolivar and B-Side records lack the `address` key entirely — yet Bolivar's prod page has full address because the address lives on the **event row** (`events.venue_address`), not on the venue config record. So venue.json is **not** the canonical address source; `events.venue_*` is.

**Venue cluster hygiene**: `B-Side` (Omonoia) and `B side Athens` (Unknown) are 2 separate venue records in `athens-venues.json`. The 603e7a77 event uses the orphan `B side Athens` (no address, no coords). Likely cause for missing-location pattern: scraper writes to non-canonical venue name → never gets backfilled.

### Sizing the real-bug subset

```sql
-- 336 total upcoming events on citation surface
-- 27 (8%)  with empty/null venue_address
-- 36 (11%) with NULL venue_lat or venue_lng
-- 27       with BOTH missing
```

Top venues missing geo: Μέγαρο Μουσικής Αθηνών (11), Bolivar (4), B side Athens (3), Temple (2), SMUT Athens (2), Island Athens Riviera (2), IT Athens (2), Half Note Jazz Club (2), WE Πολυχώρος (1), TBA - ATHarea (1).

**Per-venue, not per-event, distribution** — 10 venues account for all 27-36 affected events.

## Step 3 — Validator coverage (read source, not run)

Substituted reading `src/utils/schema-validator.ts` for `bun run scripts/validate-schema.ts`. Source inspection gives the same answer with less noise: shows exactly which fields the validator covers and at what severity.

| Field | Validator severity |
|---|---|
| `location`, `location.@type`, `location.name`, `location.address` | MANDATORY (errors) |
| `description`, `startDate`, `eventStatus`, `eventAttendanceMode`, `url`, `isAccessibleForFree`, `inLanguage` | MANDATORY (errors) |
| `offers` (when not EventCompleted), `offers.seller` | MANDATORY (errors) |
| `image`, `endDate`, `location.geo`, `performer` | RECOMMENDED (warnings) |
| `offers.url` | INFO |
| `organizer` | **NOT IN VALIDATOR** |
| `offers.validFrom` | **NOT IN VALIDATOR** (removed S134) |
| `offers.category` | **NOT IN VALIDATOR** |
| `location.address.streetAddress` empty | warning (in `schema-completeness.ts:293-294`) |

**Validator coverage gap (S101a-B pattern recurrence risk):** Validator does not check `organizer`. If GSC penalizes `organizer` for MusicEvent rich-result eligibility, local validator won't see it.

## Step 4 — Per-issue classification (the 11)

### 1. Missing field `location` (top-level)
**Classification:** GSC-stale (4/4 samples emit `location` block; mandatory in validator, never empty).
**Action:** URL Inspection re-validation on the affected URLs. Expect GSC to resolve on next crawl.

### 2. Missing field `location.address` (sub-field of location)
**Classification:** Mixed — **real-bug** for the 27 events with empty `venue_address` in DB, **GSC-stale** for events where address is present.
**Edit-surface:** `src/generators/event-page.ts:170` emits `streetAddress: event.venue.address || ''` — empty string output for venues without address. Fix is **data, not template**: backfill `venue_address` for the 10 affected venues, OR normalize duplicate venue records (`B-Side` vs `B side Athens`).
**Blast radius:** ~27 events, ~10 venues. Manual address research per venue (1-2 hours total).

### 3. Missing field `location.geo`
**Classification:** Mixed — real-bug (36 events, 11 venues affected); also implicit in #2.
**Edit-surface:** `src/generators/event-page.ts:197-203` — `location.geo` only emitted if `event.venue.coordinates` is set. Fix is **data backfill**: geocode the 11 venues missing coords.
**Bundle with:** #2 (same data backfill pass — address + coords for the same 10-11 venues).

### 4. Missing field `performer`
**Classification:** **Intentional / known gap** — confirmed by `src/utils/schema-validator.ts:180` self-flagging `' (known gap — structured artist data pending)'`. DB has no performer column; would require schema extension + scraper rework.
**Action:** Document. Strategist call needed (see "Strategist input" below).

### 5. Missing field `organizer`
**Classification:** **Intentional / structural gap** — never emitted by `event-page.ts`, never validated, no DB column. Even more upstream gap than performer (no `' (known gap)'` self-flag exists).
**Action:** Document. Strategist call needed.
**Validator hygiene:** Should `organizer` be added to RECOMMENDED_FIELDS in `schema-validator.ts:48` to close the S101a-B-style blind spot?

### 6. Missing field `image`
**Classification:** GSC-stale (4/4 samples emit `image`; RECOMMENDED in validator).
**Action:** URL Inspection re-validation.

### 7. Missing field `offers`
**Classification:** S134 intentional-omit (for affected URLs) OR GSC-stale (for non-omitted URLs). 2/4 samples emit offers (ra.co = known_merchant), 2/4 don't (no URL / aggregator). Matches S134 classifier design exactly.
**Action:** No fix. Document S134 policy. For URLs GSC flags: if the URL is in the omit-classifier path (athinorama, manual-no-URL), this is **intentional and correct**. If GSC flags a URL that the classifier would emit for, that's stale crawl. Determine by sample URL → classifier output mapping.

### 8. Missing field `endDate`
**Classification:** GSC-stale (4/4 samples emit `endDate`; `event-page.ts:182-189` always emits endDate, defaulting to startDate when absent — Schema.org convention).
**Action:** URL Inspection re-validation.

### 9. Missing field `validFrom` (in `offers`)
**Classification:** **S134 intentional-omit** — confirmed dropped from Offer shape per 2026-05-11 Strategist decision. Not in validator. Not in any emitted Offer in prod (verified across 4 URLs).
**Action:** Document. Strategist confirm: does GSC's "Missing validFrom" actually impact rich-result eligibility? If yes, reconsider the omit. The locked Offers Implementation Spec (2026-04-28) mandated validFrom; Sprint 1 closure deferred it; current state omits it.

### 10. Missing field `eventStatus`
**Classification:** GSC-stale (4/4 samples emit `eventStatus`; mandatory in validator; `resolveEventStatus()` always returns a value).
**Action:** URL Inspection re-validation.

### 11. Missing field `description`
**Classification:** GSC-stale (4/4 samples emit `description`; mandatory in validator).
**Action:** URL Inspection re-validation.

### 12. Missing field `url` (in `offers`)
**Classification:** Mixed. INFO-level field. Legitimate omission for non-merchant ticket sources (free events, door sales). Real-omit only for cases where classifier emits Offer but doesn't populate URL — verified 0/2 of the offer-emitting samples have this case.
**Action:** Identify which URLs GSC flagged and check if they're in `offers.url` INFO-omit path. Strategist call: should we promote `offers.url` from INFO to warning to make this visible locally?

*(Note on the 11 vs 12 count: brief lists `validFrom` and `validFrom-in-offers` as the same item. Both refer to `Offer.validFrom`. Final count is 11.)*

## Per-bucket summary

### Real-bug (data backfill required, ~27-36 events, ~10 venues)
- `location.address.streetAddress` (#2 above)
- `location.geo` (#3)
- **Edit-surface:** `events.venue_address`, `events.venue_lat`, `events.venue_lng` for ~10 venues. Either:
  - Update via `scripts/auto-verify-venues.ts` / venue research pass, OR
  - Normalize duplicate venue records in `athens-venues.json` (e.g. `B side Athens` → `B-Side`) and re-run pipeline.
- **Blast radius:** Read-only data backfill. No template changes. No new validator rules required (already cover this).

### Intentional / structural gap (no fix without Strategist input)
- `performer` (#4) — no DB column. Sprint 3 schema extension question.
- `organizer` (#5) — never emitted, not validated. **Validator coverage gap.**
- `offers.validFrom` (#9) — S134 removed by design.
- `offers` block omission (#7) — S134 classifier behavior.
- `offers.url` omission (#12) — INFO-level intentional for non-merchant URLs.

### GSC-stale (URL Inspection re-validation should clear)
- `location` top-level (#1)
- `image` (#6)
- `endDate` (#8)
- `eventStatus` (#10)
- `description` (#11)

**URL Inspection batch:** Submit the GSC-flagged URLs through Google Search Console's URL Inspection tool → "Request Indexing". Expected re-crawl: 1-7 days. After re-crawl, these issues should auto-resolve since current prod HTML satisfies them.

## Strategist input needed (gestrategist-call items)

1. **Performer / organizer**: Is structured artist/organizer data a Sprint 3 priority? Cost is non-trivial (DB schema + scraper extensions + entity resolution across artists). Benefit: rich-result eligibility for MusicEvent.
2. **Offer.validFrom**: Does GSC's flag actually penalize rich-result eligibility, or is it advisory? S134 made the omit call assuming advisory; if penalty is real, reconsider.
3. **Validator coverage extension**: Should we promote `organizer` to RECOMMENDED, and `offers.url` from INFO to RECOMMENDED, to close S101a-B-style blind spots between validator and GSC?

## Recommendation: Sprint 3 envelope folding vs. standalone session

**Fold into Sprint 3 envelope migration.** Reasons:
- Real-bug subset (venue data backfill, ~10 venues) is small. Bundling avoids a standalone session for a 1-2 hour task.
- Strategist-call items (performer, organizer, validFrom) are envelope-shaped: they reshape JSON-LD structure. Natural fit with `@graph` envelope + `@id` scheme work already deferred to Sprint 3.
- GSC-stale items resolve via URL Inspection regardless of code work — no session needed for them.
- Validator coverage gap (organizer) is a one-line addition to `schema-validator.ts:48` — can ride with envelope migration.

**Do not open standalone S137 fix session.** Instead:
1. Run URL Inspection batch on GSC-stale URLs (no code; manual step in GSC console).
2. Roll real-bug venue backfill + Strategist-call decisions into Sprint 3 envelope migration brief.
3. Promote `organizer` to validator coverage at the same time (one-line addition).

## Numbers reconciliation

- Brief said 11 issues; classified all 11 (treating `validFrom` and `validFrom-in-offers` as same item per JSON-LD shape).
- S133 inventory (2026-05-11) showed 42 warnings, 0 errors at build — consistent with current finding (top warnings are venue geo/address data gaps, same root cause as GSC #2/#3).
- 336 upcoming citation-surface events → 27-36 affected (8-11%) by real-bug subset.

## File references

- `src/generators/event-page.ts:155-203` — Event JSON-LD construction; location block at 165-177; geo gate at 197-203.
- `src/utils/schema-validator.ts:23-50` — MANDATORY + RECOMMENDED + INFO field lists.
- `src/validators/schema-completeness.ts:181, 199-237, 293-298` — Offer + streetAddress + geo validation.
- `events` table: `venue_address`, `venue_lat`, `venue_lng` — canonical address source (not `athens-venues.json`).
- `config/athens-venues.json` — venue cluster definitions (variations + neighborhood); has optional `address` field but unused in event-page emission path.
- S134 verification: `specs/s134-step-0-verifications.md` — documents validFrom removal + classifier-gated Offer policy.
- S133 inventory: `specs/s133-schema-warnings-inventory.md` — 42 warnings @ build, same root cause as GSC's #2/#3.

## Post-session updates (deferred — not done in this session)

- `.claude/notes/mistakes.md`: Add entry — validator-coverage gap on `organizer` (not validated locally; only surfaces via GSC). Pattern: when a schema field is "not emitted + not validated", it's invisible to local checks even when GSC penalizes.
- `.claude/notes/decisions.md`: S134 `Offer.validFrom` removal interacts with GSC validation lag — GSC will continue flagging "Missing validFrom" until crawl refresh. Document the lag as an expected post-S134 transient.
- Share summary with Planner.
