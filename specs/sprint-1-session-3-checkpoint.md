# Sprint 1 Session 3 — checkpoint (HARD STOP at Step 7)

**Date:** 2026-04-30
**Trigger:** Schema completeness dropped from 98% baseline to 97% (8603/8886). 72 errors, all single category.

## State of work

✅ Steps 0-5 completed and green:
- Validator extension shipped (schema-validator.ts + schema-completeness.ts) with conditional offers + seller + sub-field rules + INFO level
- `SchemaOrgEvent.offers` type widened with `seller` field
- Emitter rewire applied (offers.url decision tree, inline seller, availability mapping)
- All 1773 tests pass; tsc clean
- Build runs to completion

❌ Step 7 hard stop: 72 errors of single category. Below 98% threshold.

## Failing-event sample IDs (5 representative)

- `049323c3--`
- `0728a935--`
- `0b464f3a--`
- `0be3b1af-cantina-social-evripidis-and-his-tragedies`
- `0e952537--up-the-hammers-xx-2026-legacy-edition`

## Failing offers block (sample)

```json
"offers": {
  "@type": "Offer",
  "price": "0",
  "priceCurrency": "EUR",
  "availability": "https://schema.org/InStock",
  "url": "https://agentathens.com/events/049323c3--/"
}
```

No `seller` field. Validator (correctly per Step 2 rules) flags this as `offers.seller is missing or not an Organization with name`.

## Root cause

**Spec contradiction between Step 4 and Step 2 for free events with offers:**

- **Step 4 (emitter):** "Free events (`price.type === 'open' || 'donation'`) — **unchanged**. No seller. No validFrom."
- **Step 2 (validator):** "`offers.seller` required AND must be Organization-typed object with `name` → FAIL if missing or wrong shape" (applies whenever offers is present)

61 `open` events + ~11 from related categories (likely `donation` or edge cases) = 72 events emit offers without seller, then fail the new validator check.

The spec didn't carve out free events from the seller requirement, but the emitter spec explicitly said free events have no seller. The two together produce 72 errors.

## Resolution paths (planner / Strategist call)

**(A) Validator-side carve-out (minimal change):**
- One-line edit: skip seller check when `offers.price === '0'` (free events have no merchant by definition).
- Pros: matches Strategist spec literally ("free events have no seller"). No emitter change.
- Cons: validator now has price-conditional logic — slightly less clean.

**(B) Emitter-side: add venue-as-seller to free events:**
- Free events emit `seller: { '@type': 'Organization', name: event.venue.name, ...(venue.website ? { url } : {}) }` — same shape as the non-merchant with-ticket path.
- Pros: validator stays uniform (offers always have seller). Free events get a meaningful seller signal (the venue hosting the free event).
- Cons: diverges from Strategist's "free events unchanged" but the divergence is harmless and arguably an improvement (Google understands "who is hosting this free event").

**(C) Validator-side carve-out broader:**
- Validator skips seller check when `offers.price === '0'` AND when `isAccessibleForFree === true`.
- Same as (A) but more defensive.

**My recommendation:** **(B)**. The original Strategist intent (per the broader spec) was "seller signals who is responsible for this Offer." For a free event, the venue *is* responsible. Emitting venue-as-seller is honest and consistent with the with-ticket non-merchant path. Single-source rule for the validator (always require seller) is also cleaner long-term.

## What's in the working tree (uncommitted)

- `src/utils/schema-validator.ts` — conditional offers + new sub-field + INFO rules
- `src/validators/schema-completeness.ts` — same rules in this validator's idiom
- `src/enrichment/quality-gates.ts` — `SchemaOrgEvent.offers.seller` type
- `src/generators/event-page.ts` — emitter rewire (free-event branch unchanged per spec; this is the conflict point)
- `src/utils/__tests__/schema-validator.test.ts` — 5 new tests, all green
- `src/validators/__tests__/schema-completeness.test.ts` — 8 new tests, all green
- `src/generators/__tests__/event-page.test.ts` — 8 new tests, all green
- `tests/schema-enhancements.test.ts` — Session 1 validFrom test updated to use future-date override (1 line)
- `.claude/notes/patterns.md` — leftover S1 currency note (still uncommitted)

**No commit made.** Working tree dirty per S2 protocol — validator and emitter ship together or not at all.

## Resume instructions for S3b

When the planner picks a resolution path:
- Path A: edit `src/validators/schema-completeness.ts` ~line 178 to gate seller check on `offers.price !== '0'`. Same one-line edit in `src/utils/schema-validator.ts`. Re-run Step 5/6/7. Commit.
- Path B: edit `src/generators/event-page.ts` free-event branch (~line 201-209) to add venue-as-seller. Re-run Step 5/6/7. Commit.
- Path C: same as Path A but additionally check `isAccessibleForFree`.

Estimated S3b time: 15 minutes after path selection. Tests for the carve-out should be added to whichever validator/emitter test file gets the change.

## Numbers

| Metric | Pre-S3 | S3 attempt | Target |
|---|---|---|---|
| Tests | 1752 pass | 1773 pass | ≥1773 |
| Schema completeness | 98% | 97% | ≥98% |
| Errors | 0 | 72 (single category) | 0 |
| Warnings | 213 | 211 | ≤213 |

The dip is small, the cause is single-category, and the fix is well-scoped. Distinct from the S2 attempt (8194 errors, fundamental coupling problem). This is one spec edge that needs a Strategist call.
