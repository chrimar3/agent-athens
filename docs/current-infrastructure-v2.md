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
