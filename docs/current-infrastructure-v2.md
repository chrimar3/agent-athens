# Current Infrastructure (v2) — Deliberately Deferred Register

This document tracks design decisions where production deliberately diverges from a locked spec or full target state. Each entry has a reactivation trigger; quarterly review confirms whether deferral is still appropriate.

---

### Unclassifiable-Merchant Offer Coverage
- **State:** With-ticket events whose only ticket URL points to a non-
  merchant source (aggregator, manual-source, unclassified payment
  portal) emit no Offer block. Event-level signal carried by
  `isAccessibleForFree: false`. Initial baseline: ~84 events (~78
  athinorama + smaller clusters).
- **Why deferred:** Emitting an Offer without honest merchant grounding
  either fails the existing required-fields validator (Options A, C) or
  inserts an orphan seller into the entity graph (Option C). Omission
  consistent with EventCompleted, EventCancelled, and pure-informational
  open-events precedent.
- **Reactivation trigger:** Nightly URL resolver (Sprint 2 scope)
  populates `ticket_url_resolved` for aggregator sources. As resolver
  hits land, events transition from Offer-less back into the standard
  Offer emission path automatically.
- **Reactivation work (when triggered):** None at the emission layer —
  classifier reads `ticket_url_resolved` first, falls back to original
  `ticket_url`. Configuration work: add resolved merchants to
  `ticket-source-classification.json` if new merchants surface.
- **Quarterly review:** Confirm build-time omission count is trending
  down as resolver coverage expands. Rising count = scraper regression
  or aggregator drift.
- **Decision:** "Unclassifiable-Merchant Ticket Sources: Omit Offer
  (Classifier as Single Emission Gate)" (2026-05-11)

**Dev Planner footnote (S134 launch):** Live affected count at deploy: 38 upcoming (30 athinorama + 8 manual-source). The ~84 figure includes 4,335 past-active events outside citation surface (noindex per S133).

---

### Per-Venue schemaType (Museum / ArtGallery)
- **State:** `ExhibitionEvent` maps to the generic-valid `EventVenue` in
  `src/enrichment/quality-gates.ts:858-867` (VENUE_TYPE_MAP). Event-type
  alone cannot distinguish a Museum-class venue (Μπενάκη, Cycladic) from
  a multi-purpose EventVenue-class space (Τεχνόπολη, Στέγη) that also
  hosts exhibitions. The dispatch reaches three production surfaces
  (event-page Event.location, hub ListItem item.location, venue-page
  materialized member) — all uniformly emit `EventVenue` for exhibitions.
- **Why deferred:** Choosing Museum vs ArtGallery vs EventVenue is a
  per-venue classification, not an event-type inference. Sprint 2
  Component B (venue registry) is the canonical place for per-venue
  schemaType; until that lands, forcing a guess from event-type alone
  would mis-categorize ~10% of exhibition venues.
- **Reactivation trigger:** Sprint 2 Component B (venue registry) lands
  with `schemaType` as a database-backed field. Then `VENUE_TYPE_MAP`
  becomes a fallback for event-type-only inference and the venue
  registry overrides it per-venue.
- **Reactivation work (when triggered):** Add a venue-registry lookup at
  the three dispatch sites; fall through to `VENUE_TYPE_MAP[type] ||
  'EventVenue'` when the registry has no entry. Coverage manifest entry
  updates from "EventVenue uniformly" to "registry-overridden where
  populated, EventVenue fallback elsewhere."
- **Quarterly review:** Confirm the count of exhibition venues whose
  schemaType is overridden by the registry is rising. Static count =
  registry stagnation.
- **Risk if held longer:** Minimal — `EventVenue` is Schema.org-valid
  and search engines still parse the structured data cleanly. The
  semantic loss is "exhibition venue cannot be distinguished from
  generic event venue," a marginal SEO cost on ~10% of pages.
- **Decision:** Strategist 2026-05-20 (S139-fix-2 ruling). Pre-fix the
  map emitted `'ExhibitionCenter'` (not a Schema.org type); rejected by
  validator.schema.org. Allowlist-validated at test time via
  `src/enrichment/__tests__/quality-gates.test.ts`.

---

### Offer.validFrom Omission
- **State:** Offer entities ship without `validFrom`; ~151 GSC
  "Missing field 'validFrom' (optional)" warnings across event pages
  (gsc-schema-defects diagnostic, 2026-05-18).
- **Why deferred:** No structured on-sale timestamp source. Merchant
  feeds (More.com, Viva, Ticketmaster, Ticketservices) expose price,
  availability, and URL but not when tickets opened for sale.
  Synthesizing a value (e.g. event creation date, scrape date) would
  fabricate data with no grounding in actual merchant behavior.
- **Strategist ruling (2026-05-18):** GSC "Missing validFrom" is a
  cosmetic optional-field warning, not a ranking or rich-result
  penalty. Registered known-cosmetic; baseline-and-monitor.
- **Reactivation trigger:** Any of the four merchant feeds begins
  exposing a structured on-sale timestamp in its API response or
  sitemap-with-extensions output. Single-merchant coverage is enough
  to begin emitting partial validFrom (per-offer field, not aggregate).
- **Reactivation work (when triggered):** Plumb the timestamp through
  the offer-builder; emit ISO-8601 `validFrom` per Offer where the
  upstream feed provides it. Offer-shape validator
  (`validateOfferShape` in `src/validators/schema-completeness.ts`)
  treats the field as optional regardless — no validator change
  required at reactivation.
- **Quarterly review:** GSC schema-warnings dashboard. Re-evaluate if
  validFrom warning count materially shifts (either direction) or if
  Google reclassifies the field's importance (e.g. promotes from
  optional to required for Event Offer rich results).
- **Risk if held longer:** None expected — cosmetic warning, no rich-
  result eligibility impact at present.
- **NOT TO BE CONFLATED WITH:** `editorial-content.ts` `validFrom` (8
  hits in `src/utils/editorial-content.ts`). That field is intentional
  date-windowing for editorial content, live and correct. This DDR
  entry covers **Offer.validFrom** only — the field that was removed
  from emission in S134 (2026-05-11) when classifier-gated Offer
  emission landed.
- **Decision:** Strategist 2026-05-18, S141.
