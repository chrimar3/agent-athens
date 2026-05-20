# S139-fix diagnostic — Offer-builder branch classification

**Date:** 2026-05-20
**Decision required:** branch (a) divergent vs (b) shared, per Strategist 2026-05-20 ruling.

## Verdict: **Branch (b) — shared builder exists**

`buildOfferOrOmit` is the canonical S134-gated Offer construction. It already handles every emit-vs-omit case correctly, including the unknown-price-paid omit that's missing on the ListItem surface.

## File:line evidence

**Shared builder:** `src/ticketing/offer-builder.ts:105` — `buildOfferOrOmit(event: OfferBuilderEvent): OfferDecision`
- Returns `{ omit: true }` for: past events (`EventCompleted`), classifier-omit (`listing_aggregator` / `unclassified`), with-ticket events with no `price.amount` (lines 171-177 — the case this fix needs)
- Returns `{ offer: OfferObject }` otherwise. Offer always has `price` when emitted (no bare price-less Offer can escape this builder).

**Event-page call site (clean, uses shared builder):** `src/generators/event-page.ts:27` imports `buildOfferOrOmit`, `:213` calls it, `:223` assigns the returned offer to `schema.offers`.

**ListItem call site (buggy, inline construction):** `src/utils/schema-graph-builders.ts:69-79` — the `buildItemListElements` function builds Offer inline. The bug is in the spread:
```typescript
...((event.price.type === 'open' || event.price.type === 'donation')
  ? { price: '0' }
  : (event.price.amount ? { price: event.price.amount.toString() } : {})),
```
When `event.price.type === 'with-ticket'` AND `event.price.amount` is falsy, the spread is `{}` — the resulting Offer lacks `price` but still has `priceCurrency` + `availability`. This is the malformed Offer validator.schema.org flagged.

## Shared builder signature

```typescript
export interface OfferBuilderEvent {
  price: { type: 'open' | 'donation' | 'with-ticket'; amount?: number; currency?: string; };
  ticketUrl?: string | null;
  ticketUrlResolved?: string | null;
  venue: { name: string; website?: string; };
  eventStatus?: string;
  selfCanonicalUrl?: string;
}

export function buildOfferOrOmit(event: OfferBuilderEvent): OfferDecision;
// OfferDecision = { omit: true } | { offer: OfferObject }
```

## Fix shape

Swap `schema-graph-builders.ts buildItemListElements` lines 67-80 from inline construction to a `buildOfferOrOmit` call. The function already accepts everything the ListItem path computes (Event fields + locally-computed `eventStatus` + the `@id` URL as `selfCanonicalUrl`). The inherited Offer is richer than the prior minimal-hub-Offer convention (carries `seller`, `url` for known merchants) — that's an enrichment, not a regression. The S101a-B comment about "minimal hub Offer (no seller — preserves Sprint 1 hub pattern)" is the documented prior convention; the Strategist's "use the shared builder" ruling supersedes it.

**Removed imports after swap (now unused in this module):** `availabilityForEventStatus`, `getCurrencyCode`, `classifyTicketSource`. The outer `availability.kind === 'emit' && !classifierOmits` gate is subsumed by `buildOfferOrOmit`'s internal logic — it returns `{ omit: true }` for both past events and classifier-omit cases.

## Validator coupling (Step 2)

`src/validators/schema-completeness.ts` emitted-Offer-shape FAIL rule currently covers the event-page surface only (top-level Event.offers via `flattenGraph`). Extension required: walk CollectionPage → mainEntity → itemListElement → item → offers and apply the same FAIL. Nested Offers don't surface via `flattenGraph` (which only unwraps `@graph` envelope members); the rule must explicitly descend the ItemList tree.

## S110 coverage manifest (Step 3)

Register "CollectionPage nested-ListItem Offer" as a validated surface so the emission/validation-scope ledger reflects reality.
