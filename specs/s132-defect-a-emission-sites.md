# S132 — Defect (A) emission site enumeration

**Scope:** Locate every `<a href="/neighborhoods/...">` emission in the source tree.

## Result: single emission site

`src/generators/event-page.ts:388`

```ts
neighborhoodSlug ? `<a href="/neighborhoods/${neighborhoodSlug}/">${t.eventsInArea} ${displayNeighborhood(event.venue.neighborhood!)}</a>` : ''
```

This is one entry in a 3-item `navLinks` array (lines 385–389):
1. type-hub link (`/<categorySlug>/`)
2. venue link (`/venues/<venueSlug>/`)
3. **neighborhood link (broken, the offender)**

The conditional emits an `<a>` only if `neighborhoodSlug` is truthy. Removing the conditional drops the 3rd nav link entirely.

## Untouched (verified by Guard-4 grep)

- `src/utils/schema-geo.ts` — `containedInPlace` schema chain referencing Wikidata QIDs. Not anchor emission. **Leave alone.**
- `config/neighborhood-geodata.json` — geodata only. **Leave alone.**
- `src/generators/event-page.ts:176` — `containedInPlace: buildContainedInPlace(...)` — schema JSON-LD. Not anchor. **Leave alone.**
- `src/generators/event-page.ts:562` — `<div class="edp-venue-neighborhood">${displayNeighborhood(...)}</div>` — display text in venue section. **Leave alone.** This is why the line-164 unit test ("neighborhood renders") will still pass when line 388 is dropped.
- `src/generators/event-page.ts:621-622` — `venueText` for related-card. Plain text concatenation, no anchor. **Leave alone.**
- `src/generators/venue-page.ts`, `src/templates/page.ts`, `src/templates/search-overlay.ts`, `src/generators/search-index.ts`, `src/generators/practical-block.ts` — mention "neighborhood" but no `href` emission containing the literal `/neighborhoods/` path. **Leave alone.**

## Why drop, not "strip anchor wrapper"

The brief's "strip `<a>` wrapper, keep text" guidance was for display text like address-line "in Exarchia". That surface already emits as plain text (`<div class="edp-venue-neighborhood">` on line 562). The line-388 emission is **not display text** — it's a navigation CTA labeled "Events in this area" (Greek: `t.eventsInArea`). Stripping the anchor would leave a button-shaped chunk of text with no destination — a worse UX than removing the button entirely. Drop it.

## Fix surface

One file, one line. Test-checked at lines 162–165 ("neighborhood renders" assertion) still passes because the venue-section div at line 562 is the rendering of record.
