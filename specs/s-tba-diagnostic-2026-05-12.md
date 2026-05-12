# `price_type='tba'` Diagnostic — 2026-05-12

**Type:** Read-only diagnostic, prerequisite to S137 (Sprint 1 Session 2 offers refactor).
**Premise:** Audit (`specs/audit-2026-05-12.md` §3 + §10a) found 1,155 rows with `price_type='tba'` (154 in current events). CLAUDE.md Tier 1 rule states `price: "open" | "with-ticket"` — only 2 values. Goal: determine root cause and impact before S137 touches offer-emission paths.

---

## 1. Confirmed counts

```
=== Total ===
with-ticket   11,387
tba            1,155
open              73

=== Current (Tier-1 exhibition-aware filter) ===
with-ticket   266
tba           154
open           11
```

**Drift from audit baseline:**

| Metric | Audit | Now | Drift |
|---|---|---|---|
| Total `tba` | 1,155 | 1,155 | 0% |
| Current `tba` | 154 | 154 | 0% |
| Current `with-ticket` | 259 | 266 | +2.7% |
| Current `open` | 11 | 11 | 0% |

Within tolerance (<10% across the board). The +7 `with-ticket` is daily-pipeline ingest between audit and diagnostic. **Proceed.**

---

## 2. Writer paths

### Active writers (producing `'tba'`)

| Path | Line(s) | Trigger |
|---|---|---|
| `scripts/scrape-all.ts` | 330 | `price_type: price ? 'with-ticket' : 'tba'` — fallback when no price detected |
| `scripts/scrape-all.ts` | 598 | Hard-coded `'tba'` (athinorama-related scrape branch) |
| `scripts/scrape-all.ts` | 832 | Hard-coded `'tba'` (residentadvisor-related scrape branch) |
| `scripts/scrape-all.ts` | 1019 | Same pattern as line 330 (ternary on detected price) |
| `scripts/scrape-all.ts` | 1091–1125 | `let priceType = 'tba'` initial; overridden to `'open'` / `'with-ticket'` if detected; final value `'tba'` survives if no override |

All five sites are in `scripts/scrape-all.ts`. **The producer is the scrape layer.**

### Readers / branchers (consume `'tba'`)

| Path | Line(s) | Behavior |
|---|---|---|
| `scripts/backfill-ticket-urls.ts` | 87 | `price_type IN ('with-ticket','tba')` — treats `'tba'` as ticketed |
| `scripts/generate-enrichment-brief.ts` | 630, 641, 736 | Renders `'tba'` if `price_type` empty; treats `'tba'` as "isTicketed" (line 641) |
| `scripts/generate-rewrite-brief.ts` | 254, 342 | Same as brief generator |
| `scripts/scrape-all.ts` | 1134 | Filters out `'tba'` events in summary stats |

Readers consistently treat `'tba'` as a synonym for "ticketed but price unknown."

### Type-system signals

| Path | Line(s) | Signal |
|---|---|---|
| `src/db/database.ts` | 52–56 (comment) | "Constitution: `'open' \| 'with-ticket' \| 'tba' \| 'donation'`" — **constitution comment INCLUDES `'tba'`** |
| `src/db/database.ts` | 58–63 (`normalizePriceType`) | Maps `'paid' → 'with-ticket'`, `'free' → 'open'`, `'door' → 'with-ticket'`. **Does NOT remap `'tba'`** — `'tba'` falls through `return value` unchanged. |
| `src/db/database.ts` | 85 | `$price_type: normalizePriceType(event.price.type)` — every DB write passes through normalizer |

### Archived writers (`scripts/_archive/`)

`scripts/_archive/scrape-residentadvisor.ts`, `scripts/_archive/scrape-ticketservices.ts`, `scripts/_archive/scrape-halfnote.ts` — all use legacy vocab including `'tba'`, `'paid'`, `'free'`. Not currently active; `normalizePriceType` partially handles their legacy values (but not `'tba'`).

---

## 3. Type union state

**Three different unions live in `src/`:**

| Path | Line | Declared union |
|---|---|---|
| `src/types.ts` | 97 | `'open' \| 'with-ticket' \| 'donation'` (canonical Event type) |
| `src/types.ts` | 117 | `PriceFilter = 'open' \| 'with-ticket' \| 'all'` (filter type) |
| `src/enrichment/types.ts` | 44 | `'open' \| 'with-ticket'` |
| `src/enrichment/enrichment-engine.ts` | 30 | `'open' \| 'with-ticket'` |
| `src/ticketing/offer-builder.ts` | 42 | `'open' \| 'donation' \| 'with-ticket'` (offer-builder input contract) |
| `src/ingest/*` (5 files) | — | `'open' \| 'with-ticket'` |
| **CLAUDE.md** Tier 1 | — | `'open' \| 'with-ticket'` |
| **`db/database.ts:56` comment** | — | `'open' \| 'with-ticket' \| 'tba' \| 'donation'` |
| **DB reality** | — | `{ with-ticket, tba, open }` (no `'donation'` observed at corpus level — Step 1 total) |

**NO TypeScript union anywhere includes `'tba'`.** The constitution comment in `db/database.ts:56` is the only code reference treating `'tba'` as legitimate — and it's a comment, not a type.

This means:
- TypeScript would refuse to compile a literal `price.type = 'tba'` written through the typed Event interface.
- But `eventToRow()` casts via `event.price.type` (a `string`-narrowed union) and writes the raw value through `normalizePriceType` (which lets `'tba'` pass).
- Writers in `scripts/scrape-all.ts` construct event objects that satisfy a less-strict shape and emit `'tba'` strings that survive into the DB.

**Verdict: the type system is the constraint that should have caught this but didn't, because the scrape-side construction path doesn't typecheck against the strict Event union.**

---

## 4. Validator behavior

`src/validators/schema-completeness.ts:18` defines:

```ts
const PLACEHOLDER_VALUES = ['tba', 'unknown', 'n/a', 'tbd', 'none'];
```

And `isPlaceholder()` at line 63–66 returns true for any string in the array (case-insensitive trim).

**Where `isPlaceholder` is actually called** (line 275–287):

```ts
const fieldsToCheckForPlaceholders = [
  ['name', schema.name],
  ['description', schema.description],
  ['streetAddress', location?.address?.streetAddress],
] as const;

for (const [field, value] of fieldsToCheckForPlaceholders) {
  if (isPlaceholder(value)) {
    warnings.push(`${field} contains placeholder value "${value}"`);
  }
}
```

**The placeholder check applies to `name`, `description`, `streetAddress` only — not `price_type`, not `offers.price`, not anything in the Offer block.**

The validator processes JSON-LD output (extracted via regex from generated HTML), not DB rows. By the time JSON-LD is emitted, `price_type` is no longer a top-level field — it's been transformed into `Offer.price` or omitted entirely. So even if PLACEHOLDER_VALUES were applied to the Offer block, the literal `'tba'` would never reach it.

**Verdict: validator is structurally blind to `price_type='tba'`. The 99% schema-valid metric is correct given what the validator checks; it just doesn't check this field's lineage.**

---

## 5. Schema.org emission behavior

### Detail-page JSON-LD (`src/generators/event-page.ts`)

For `price_type='tba'`:

```ts
// event-page.ts:211
schema.isAccessibleForFree = event.price.type === 'open' || event.price.type === 'donation';
// 'tba' → false (treated as paid/with-ticket signal)

// event-page.ts:213
const offerDecision = buildOfferOrOmit({ price: event.price, ... });
```

`buildOfferOrOmit` (`src/ticketing/offer-builder.ts:105–177`):

- Line 116: `if (event.price.type === 'open' || event.price.type === 'donation')` — `'tba'` does NOT match, skip.
- Line 141: `classifyTicketSource(event)` runs against the event's **ticket URL host** (not the DB `source` string).
- Line 142: if classifier returns `omit_offer` (listing_aggregator, unclassified, or null URL) → return `{ omit: true }` → **no Offer block emitted**.
- Line 146–177: otherwise emit Offer with `priceCurrency`, `availability`, `seller`. Critical lines 171–174:

```ts
const priceStr = event.price.amount != null ? String(event.price.amount).trim() : '';
if (priceStr !== '') {
  offer.price = priceStr;
}
```

**If `event.price.amount` is null (common for `'tba'` rows), `offer.price` is NOT set.** The Offer is emitted with `priceCurrency` + `availability` + `seller` + (optionally) `url` — but no `price` field. **This is structurally malformed Schema.org** (Offer requires `price` or `priceSpecification`), but the validator (§4) doesn't check this.

### Classifier matching (`src/utils/ticket-source-classifier.ts:60–64`)

```ts
const host = extractHost(url);
if (!host) return 'unclassified';
if (knownMerchants.has(host)) return 'known_merchant';
if (listingAggregators.has(host)) return 'listing_aggregator';
if (venueDirectOnly.has(host)) return 'venue_direct_only';
return 'unclassified';
```

Match by URL host, not by DB source string. Config:

```json
known_merchants:     ["more.com", "megaron.gr", "ticketservices.gr", "ra.co", "viva.gr", "onassis.org"]
listing_aggregators: ["athinorama.gr", "clubber.gr"]
venue_direct_only:   ["halfnote.gr", "benaki.org"]
```

### Outcome for the 154 current `'tba'` rows

Joining Step 6 data + classifier behavior:

| Source (DB) | Count | Has `ticket_url` | Has `price_amount` | Classifier outcome | Offer emission |
|---|---|---|---|---|---|
| athinorama.gr | 78 | yes | varies | host `athinorama.gr` → listing_aggregator → omit_offer | **no Offer** ✓ |
| athinorama.gr | 15 | no | varies | null URL → unclassified → omit_offer | **no Offer** ✓ |
| residentadvisor | ≤52 | yes (likely `ra.co`) | 42 have amount | host `ra.co` → known_merchant → emit | **Offer emitted, with price** ✓ |
| residentadvisor | ≤52 | yes (`ra.co`) | 10 no amount | host `ra.co` → known_merchant → emit, no `price` field | **Offer emitted MALFORMED** ⚠️ |
| residentadvisor | 8 | no | varies | null URL → unclassified → omit_offer | **no Offer** ✓ |
| ticketservices | 1 | yes | yes | host `ticketservices.gr` → known_merchant → emit | **Offer emitted, with price** ✓ |

**Estimated latent-bug surface:** up to ~10 residentadvisor events emit Offers without a `price` field (Offer block has `@type`, `priceCurrency`, `availability`, `seller`, `url`, but no `price`). Validator does not flag this. End-users see the page render fine; Google may flag the Offer as incomplete in Search Console (though current GSC reports are clean per S133 finding — possibly because the malformed Offers are too few to trip aggregate thresholds).

Exact count not derivable from §1 SQL alone — would need to join `ticket_url IS NOT NULL AND price_amount IS NULL AND source = 'residentadvisor'`. The Step 6d data shows 18 residentadvisor 'tba' rows with no amount; if (subjective estimate) 70–90% have URLs, that's roughly 12–16 malformed Offers actually emitting.

### Hub/card microdata (`src/templates/page.ts:295–331`)

For `'tba'`:
- Line 295: `classifierOmits = event.price.type === 'with-ticket' && 'omit_offer' in classifyTicketSource(event)` — `'tba'` is NOT `'with-ticket'`, so `classifierOmits = false`.
- Line 299: `if (availability.kind === 'omit_offer' || classifierOmits)` — past-events only (since classifierOmits is false for 'tba').
- Lines 302–312 walk through `'open'` → has-amount → has-range — `'tba'` rows with null amount fall through to the "No-amount with-ticket event: omit BOTH price and availability" path at line 310–312.

**Hub-card emission for `'tba'` events:** the microdata path's "no-amount with-ticket" branch is entered (even though price_type is 'tba', not 'with-ticket' — the structural path is the same), producing a `<span class="card-price">` with display text but **no `<meta itemprop="price">`**. Microdata Offer is effectively omitted at the hub level. ✓

**Summary:** detail-page JSON-LD has a 10–16 event latent malformed-Offer leak; hub-card microdata is structurally safe. The 134-of-154 majority are correctly omitted via classifier dispatch.

---

## 6. Sample patterns

### Source concentration (154 current 'tba' rows)

```
athinorama.gr     93 (60.4%)
residentadvisor   60 (39.0%)
ticketservices     1 (0.6%)
```

Bimodal — two sources account for 99.4%. Single-source backfill at scrape-all.ts would close most.

### Type distribution

```
concert       91
dj_set        59
festival       4
```

All evening/night entertainment types — no exhibitions, no theater. Matches the source profile (athinorama + residentadvisor scrape concert/dj_set listings; theater goes through different ingest paths that don't produce `'tba'`).

### Enrichment state

```
enrichment_tier   count   not_enriched (enriched_at IS NULL)
stub              154     128
```

**ALL 154 current 'tba' rows are at `enrichment_tier='stub'`** — the lowest tier, pre-enrichment. 128 / 154 (83%) have never been enriched at all. The 26 that have `enriched_at` set but stayed at `tier=stub` may indicate enrichment runs that didn't escalate the tier.

**The `'tba'` price doesn't trigger enrichment escalation** — enrichment knows the price is unknown but doesn't itself resolve it. The expectation in the data model seems to be that `'tba'` rows wait for the scraper to backfill the price on next scrape, or stay 'tba' if the source never publishes it.

### Tickle test on Megaron (cross-reference to S135's coverage observation)

Megaron is mentioned in S135's geo-coverage spec as having mixed populated/unpopulated rows for the same venue. `megaron.gr` is in the classifier's `known_merchants` set, so a Megaron `'tba'` event with a ticket URL on `megaron.gr` and null `price_amount` would also emit a malformed Offer. None of the 154 current `'tba'` rows are from megaron.gr at the source level — but Megaron events scraped via athinorama.gr would carry `source='athinorama.gr'` (listing_aggregator) and emit no Offer. So the Megaron path is structurally safe for `'tba'` even though the venue is in the merchant set.

---

## 7. Classification

**Mixed Type 1 (rule aspirational) + Type 3 (latent emission bug).** Not Type 2 (writer drift) — writers are operating against an in-code "constitution" comment that includes `'tba'`; they're not drifting from declared types in the absence of any union enforcement at the scrape boundary.

### Type 1 — Rule aspirational

- **CLAUDE.md states:** `price: "open" | "with-ticket"` (2-value union)
- **`src/db/database.ts:56` constitution comment states:** `'open' | 'with-ticket' | 'tba' | 'donation'` (4-value)
- **TypeScript unions across the codebase:** mix of 2-value and 3-value unions; NONE include `'tba'`
- **DB observed values:** `{ with-ticket, tba, open }` (3-value; 'donation' not observed in §1 counts)

The CLAUDE.md rule has never been enforced at the type or runtime level. The constitution comment in `db/database.ts` is the closer-to-truth statement of what the codebase actually supports.

**Resolution options for Type 1:**

- **(1a) Tighten:** correct the constitution comment + add a runtime check in `normalizePriceType` that throws on `'tba'`. Decide what to do with the 1,155 existing rows (drop, remap to `'with-ticket'`, hold for enrichment).
- **(1b) Widen:** update CLAUDE.md to acknowledge `'tba'` as a legitimate-but-temporary state. Add a Schema.org-aware emission path that handles `'tba'` correctly (probably omit Offer + signal `isAccessibleForFree:false` + don't emit malformed Offer). Add type-system inclusion (`'tba'` in the union).

### Type 3 — Latent emission bug

- ResidentAdvisor `'tba'` events with `ticket_url` (probably `ra.co`) and null `price_amount` emit an Offer block missing the `price` field.
- Validator at `src/validators/schema-completeness.ts` does not check Offer.price presence — the malformed Offers pass schema validation.
- Estimated impact: 10–16 events currently. Per-event lifetime impact is unknown (events come and go); cumulative lifetime estimate would require historical 'tba' + ra.co + null-amount join.
- This is independent of the Type 1 question — even if the type union is widened to include `'tba'` as legitimate, the offer-builder still needs explicit handling for the no-amount case to avoid emitting a malformed Offer.

### Type 2 (writer drift) — does not apply

Writers in `scripts/scrape-all.ts` produce `'tba'` deliberately as a documented sentinel; they're not drifting from a stricter type — there's no stricter type at the scrape boundary that they'd be drifting from. The drift is between the CLAUDE.md rule and the in-code reality, not between writers and types.

---

## 8. Implication for S137

**S137 is a prerequisite-blocked refactor**, not absorbed-by-S137.

S137's known scope is the offers emission refactor — specifically, tightening the classifier-gated dispatch in `src/ticketing/offer-builder.ts` and adjusting the seller-shape contract. S137 will touch:

- `buildOfferOrOmit()` signature / behavior
- `OfferBuilderEvent.price.type` union — currently `'open' | 'donation' | 'with-ticket'` (per offer-builder.ts:42)

**Two concrete S137 risks if `'tba'` is unresolved:**

1. **Type-union tightening forces a decision.** If S137 narrows `OfferBuilderEvent.price.type` further or adds runtime type-checking, callers passing `'tba'` rows will need to be remapped or rejected. S137 cannot land cleanly without deciding what `'tba'` is.

2. **Compound malformed-Offer emission.** S137 likely changes the Offer-block construction path. Any change to the price-handling lines (offer-builder.ts:171–174) without explicit handling of null `price_amount` will either:
   - Preserve the current latent bug (10–16 events still emit malformed Offers)
   - Make it worse (if the new path emits more Offer fields, the missing `price` becomes more visible)

**Recommended sequencing:**

1. **S136 (or pre-S137) — `'tba'` resolution session.** Decide Type 1 direction (tighten vs widen). If tighten: write a one-shot SQL backfill that maps the 1,155 rows to `'with-ticket'` (the readers already treat them that way), update `normalizePriceType` to throw on unknown values, update CLAUDE.md, update the constitution comment to match.
2. **Parallel or in-S137 — `offer-builder.ts` no-amount handling.** Either add an explicit branch that returns `{ omit: true }` for `with-ticket` + null `price_amount`, or emit a `priceSpecification` placeholder. This is the Type 3 fix.
3. **Then S137 lands** against a clean 2-value (or explicitly-widened) union.

**Alternative (absorbed):** S137 could fold both fixes into its own scope. This is plausible if S137's author is willing to budget the extra ~30 min for the SQL backfill and the offer-builder null-amount branch. But:
- The SQL backfill is a data write S137 wouldn't otherwise be making; it changes the commit's risk profile from pure-refactor to refactor + data migration.
- The offer-builder null-amount branch is reasonable to fold in if S137 is touching that file anyway.

**Dev Planner choice point:** prerequisite (separate S136 for `'tba'` cleanup) vs absorbed (S137 grows by ~30%). Prerequisite is the cleaner sequencing; absorbed is faster total throughput if S137 is willing to take both items in one commit.

---

## Done-when checklist

- [x] `specs/s-tba-diagnostic-2026-05-12.md` exists with all 8 sections
- [x] Classification (Type 1 / Type 2 / Type 3) is unambiguous — **Mixed Type 1 + Type 3**
- [x] S137 implication stated: **prerequisite OR absorbed** (Dev Planner choice; recommended prerequisite for cleaner sequencing)
- [ ] git status shows only the new spec file — verified in Step 8 below
- [x] No commit (commit decision sits with Dev Planner)

## What this diagnostic deliberately did NOT do

- Did not identify the writer that produced `'donation'` price_type (the canonical Event union allows it; not observed in current counts; not in audit scope)
- Did not write the SQL backfill migration (Type 1 resolution; sits with the next session)
- Did not patch `normalizePriceType` to throw / remap `'tba'`
- Did not patch `offer-builder.ts` no-amount branch
- Did not commit this spec (per brief)
- Did not modify CLAUDE.md or any institutional memory file

---

## Quick reference — key facts for Dev Planner sequencing

| Question | Answer |
|---|---|
| Total `'tba'` rows | 1,155 (corpus) / 154 (current) |
| Producer | `scripts/scrape-all.ts` (5 sites) |
| Type-system enforcement | None — no TS union includes `'tba'`; writers bypass at construction time |
| `normalizePriceType` handles `'tba'`? | No — passes through unchanged |
| Validator catches `'tba'`? | No — placeholder check applies to name/description/streetAddress only |
| JSON-LD emission for 'tba'? | Most: omitted via classifier dispatch. ~10–16 events emit malformed Offer (no `price` field) |
| CLAUDE.md says | `'open' \| 'with-ticket'` (2 values) |
| `db/database.ts:56` says | `'open' \| 'with-ticket' \| 'tba' \| 'donation'` (4 values; out of sync with CLAUDE.md) |
| `src/types.ts:97` says | `'open' \| 'with-ticket' \| 'donation'` (3 values; no 'tba') |
| Classification | Mixed Type 1 (rule aspirational) + Type 3 (latent emission bug) |
| S137 implication | Prerequisite (recommended) or absorbed (faster but riskier commit) |
