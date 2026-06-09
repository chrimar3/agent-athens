# Comedy-card badge label — SHARED surface (deferred re-key)

**Status:** Registered, NOT re-keyed in-session (S176, 2026-06-09).
**Recon-gated decision (Step 0c):** SHARED → do not re-key in-session; register here.

## Decision

The S176 session re-keyed /theatre + /comedy **listing membership** to the
comedy-format signal (`isStandUpComedy`, the same signal that drives `@type`).
The brief made the **comedy-card badge label** a recon-gated clause: re-key
in-session only if the label is produced by ONE localized renderer. Recon found
it is **SHARED** across many surfaces, so the badge re-key is deferred to a
follow-up. This file is the explicit disposition — the badge is knowingly still
`event.type`-keyed, not silently so.

## Current keying (the surface to re-key later)

Badge label is looked up from `event.type`, NOT from the derived schema type:

- **`src/templates/page.ts:31`** — `BADGE_LABELS: Record<string, string>`
  maps EventType → Greek label (`theater → 'ΘΕΑΤΡΟ'`, `show → 'ΣΟΟΥ'`,
  `other → 'ΑΛΛΟ'`, …).
- **`src/templates/page.ts:267`** (inside `prepareCardData(event)`) —
  `const badgeLabel = BADGE_LABELS[event.type] || BADGE_LABELS.other;`

Consequence: a theatre-typed stand-up (`event.type='theater'`,
`@type='ComedyEvent'`) that still appears on a card renders the **ΘΕΑΤΡΟ** badge,
even though its `@type` is ComedyEvent. The membership re-key removes such
events from /theatre, but they still render cards on other surfaces (homepage,
date hubs, venue pages, related-events) carrying the ΘΕΑΤΡΟ label.

## Blast radius (why it is SHARED, not localized)

`prepareCardData()` feeds the badge to **6 call sites**:

1. `renderEventCard()` — `src/templates/page.ts:289` (hub/listing/date-grouped cards)
2. `renderEventCardList()` — `src/templates/card-variants.ts:15` (venue-page rows)
3. `renderFeatureCard()` — `src/templates/card-variants.ts:44`
4. `renderHeroSection()` featured card — `src/templates/card-variants.ts:138`
5. `renderHeroSection()` pick cards — `src/templates/card-variants.ts:165`
6. `renderFeaturedEventCard()` — `src/templates/card-variants.ts:210`

Plus **1 inline duplicate** of the same lookup (does NOT call `prepareCardData`):

7. `renderRelatedEventCard()` — `src/generators/event-page.ts:749`
   (`const badgeLabel = BADGE_LABELS[event.type] || BADGE_LABELS.other;`)

A correct re-key must touch the shared `prepareCardData` path **and** the inline
duplicate at `event-page.ts:749` together (Guard 6 — same logical knob in two
places), or the duplicate will silently keep the old behavior.

## Follow-up re-key (when scheduled)

- Re-key the badge label to read `resolveEventSchemaType(event)`
  (`src/utils/comedy-format.ts:60`) — the SAME signal as `@type` — instead of
  `event.type`. A stand-up then renders a comedy badge, not ΘΕΑΤΡΟ.
- Requires a comedy label in `BADGE_LABELS` (no `ComedyEvent` key today; add a
  ΚΩΜΩΝΤΙ/Stand-up label or map ComedyEvent → an existing label per Editorial).
- Apply to `prepareCardData()` (page.ts:267) AND the inline duplicate
  (event-page.ts:749) in the same change.
- Add a card-render test: a comedy-format event renders NO ΘΕΑΤΡΟ badge.

## S110 trigger condition (third paired surface)

When the badge re-key ships, register the badge as a third S110-paired surface:
assert that a card whose `@type` resolves to `ComedyEvent` never emits the
ΘΕΑΤΡΟ (theater) badge label. Until then the disposition is: **badge label is
event_type-keyed by known deferral, tracked here.**
