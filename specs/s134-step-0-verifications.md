# S134 — Step 0 Verification Results

**Session:** S134 (Post-Sprint-1 Offers Emission Refactor)
**Date:** 2026-05-11
**Branch:** main (S133 shipped as commit `0bd0af628`)

## Summary

Six verifications executed in plan mode. Six diverged from the brief or surfaced acknowledged interims. Decision reasoning unchanged across all six — the brief's *conclusions* survived; its *premises* did not.

| Check | Brief premise | Reality | Plan implication |
|---|---|---|---|
| 0a Seller shape | (b) `@id`-referenced in `@graph` | (a) inline nested Organization | Sprint 1 acknowledged interim; no migration in S134 |
| 0b isAccessibleForFree | already emitted | confirmed at 3 sites | Prerequisite met |
| 0c Validator rule | rescope from event-keyed to Offer-keyed | unconditional, not yet price_type-conditional | Re-shape (not rescope) — introduce conditional + floor |
| 0d Emission sites | 3 expected | confirmed exactly 3 | No scope expansion |
| 0e Affected count | ~84 events | 38 upcoming + 4,335 past-active (noindex'd) | Strategist reasoning unchanged; telemetry records both |
| 0f `@graph` envelope | (not in brief) | absent in production | Confirms shape (a) stays; no envelope work in S134 |

---

## 0a — Seller shape

**Brief premise:** Seller emitted as `@id`-referenced Organization in `@graph` (shape b), per the locked 2026-04-28 Offers Implementation Spec.

**Reality:** Inline nested Organization (shape a). Code at `src/generators/event-page.ts:218`:

```typescript
'seller': {
  '@type': 'Organization',
  'name': event.venue.name,
  ...(event.venue.website ? { url: event.venue.website } : {})
}
```

For with-ticket events, `src/generators/event-page.ts:263-273` computes seller from `sellerHost` (or venue fallback):

```typescript
const seller: Record<string, any> = sellerHost
  ? {
      '@type': 'Organization',
      'name': hostToName(sellerHost),
      'url': `https://${sellerHost}/`
    }
  : {
      '@type': sellerTypeForVenue,
      'name': event.venue.name,
      ...
    };
```

**Resolution per Strategist:** Shape (a) is the Sprint 1 *acknowledged interim* — not drift. Locked spec mandates (b); Sprint 1 closure deliberately deferred the (a)→(b) migration to coincide with Sprint 3's broader `@graph` envelope work (canonical-page sequencing + `@id` scheme + orphan-seller validator promotion back to FAIL across Place, Performer, Organization, Organizer). S134 stays in shape (a). The brief's `⚠️ STOP if (a)` guard was based on a memory-flattened time axis between spec and production; the closure decision authorizing (a) was the canonical state, not the spec citation.

---

## 0b — isAccessibleForFree

**Brief premise:** Already emitted; value derives from `price_type` (false when with-ticket, true when open).

**Reality:** Confirmed at 3 emission sites:
- `src/generators/event-page.ts:211` — open/donation events: `isAccessibleForFree: true`
- `src/generators/event-page.ts:226` — with-ticket events: `isAccessibleForFree: false`
- `src/templates/page.ts:461` — hub JSON-LD: `"isAccessibleForFree": event.price.type === 'open' || event.price.type === 'donation'`

**Status:** Prerequisite met. The post-omission state can rely on `isAccessibleForFree: false` carrying the with-ticket signal independently of Offer presence.

---

## 0c — Validator rule shape

**Brief premise:** Current FAIL rule is keyed on `event.price_type === 'with-ticket'` requiring url/price/priceCurrency/availability/validFrom/seller. Step 4 rescopes from event-property to Offer-property.

**Reality:** No existing price_type-conditional rule. `src/validators/schema-completeness.ts:181` errors **unconditionally** if `!schema.offers && !isCompleted`:

```typescript
if (!schema.offers && !isCompleted) {
  errors.push("offers missing");
}
```

When offers DOES exist, structural validation runs at `src/validators/schema-completeness.ts:199-237` for fields: `price`, `priceCurrency`, `availability`, `seller`. `url` is INFO-level (line 238), not FAIL.

**Resolution:** Step 4 is a **re-shape**, not a rescope. Introduce price_type-conditional gating plus the `isAccessibleForFree: false` floor for the new "with-ticket + no Offer" state.

---

## 0d — Emission sites enumeration

**Brief premise:** 3 sites (event-page.ts JSON-LD detail + page.ts hub-card JSON-LD + page.ts microdata).

**Reality:** Confirmed exactly 3.

1. `src/generators/event-page.ts:212-288` — JSON-LD detail page (with-ticket conditional Offer at 276-288)
2. `src/templates/page.ts:476-485` — hub-card JSON-LD list items (emitted only when `availability.kind === 'emit'`)
3. `src/templates/page.ts:324` — microdata: `<span itemprop="offers" itemscope itemtype="https://schema.org/Offer">`

**Status:** No scope expansion. All three must be wired through `buildOfferOrOmit()` for the single-emission-gate invariant to hold.

---

## 0e — Affected count

**Brief premise:** ~84 events impacted by omission policy.

**Reality:**

Raw counts:
- `events WHERE price_type='with-ticket' AND ticket_url LIKE '%athinorama%'` → **9,427**

Live-citation-surface counts (current/future + non-cancelled + verified Athens):
- Athinorama upcoming: **30**
- Manual-source-no-URL upcoming: **8**
- ResidentAdvisor upcoming with-ticket: 0
- **Live impact total: 38 upcoming events**

Past-active set:
- Athinorama past-active within 45d retention window: **4,335**
- Sample noindex check: 8/8 sampled pages confirmed `noindex` present → out of citation surface

**Resolution per Strategist:** ~84 figure is *illustrative, not decisional*. Strategist's reasoning rests on five anchors (locked FAIL rules, `isAccessibleForFree` carrying the signal, omit-Offer precedent, EventCompleted analogy, 18-point partial-schema penalty) — none of which hinge on the specific figure. Three-location footnote pattern: Strategist text stays verbatim; Dev Planner footnotes carry empirical baseline (specs/, decisions.md, current-infrastructure-v2.md).

---

## 0f — `@graph` envelope state

**Not in original brief.** Added as Step 0 expansion per planner amendment A2 when Step 0a found shape (a).

**Reality:** `@graph` envelope is ABSENT in production. Grep confirmed:
- `grep -nA 3 '"@graph"' src/generators/event-page.ts src/templates/page.ts` → no matches
- `grep '"@graph"' dist/events/<sample>/index.html` → no matches
- Production emits `"@context": "https://schema.org"` but no `"@graph"` array at JSON-LD root

**Resolution per Strategist:** Sub-option (ii) — defer seller-shape migration to coincide with Sprint 3 envelope work. The (a)→(b) migration is structurally bound to envelope adoption (`@id` references require `@graph` to resolve in). Splitting them creates a partial state that delivers no value. Sprint 3 takes the consolidated migration: envelope + `@id` scheme + canonical-page sequencing + orphan-seller validator promotion to FAIL.

---

## Path corrections (mechanical)

| Brief said | Reality | Plan correction |
|---|---|---|
| Create `config/ticket-source-classification.json` | Exists (Sprint 1 Session 2) — athinorama already in `listing_aggregators` | Extend if needed; do NOT recreate |
| Create `src/utils/ticket-source-classifier.ts` | Exists (Sprint 1 Session 2) — 4-lane semantics already shipped | Extend with `classifyTicketSource(event)` wrapper in place |
| Create `src/schema/offer-builder.ts` | `src/schema/` doesn't exist | Brief prescribed `src/schema/offer-builder.ts`; corrected to `src/ticketing/offer-builder.ts` at Step 0 per actual repo layout. Co-located with existing `resolver.ts`, `validator.ts`, `cta.ts`, `venue-registry.ts`. |
| Append to `docs/current-infrastructure-v2.md` | Doesn't exist | Create as new file |

---

## Step 4b flag-don't-fix audit results

**Run during Step 4 (placeholder — to be filled in).**

Command:
```bash
grep -nE "orphan|seller\.@id|seller-shape" src/validators/schema-completeness.ts
```

Findings (executed 2026-05-11 during Step 4):
- `grep -nE "orphan|seller\.@id|seller-shape" src/validators/schema-completeness.ts` → **no matches**
- `grep -nE "orphan|seller\.@id|seller-shape" src/validators/*.ts` → **no matches**

**Result: nothing to flag.** Sprint 1 closure-intended state holds — neither orphan-seller nor seller.@id rules currently exist in any validator. Sprint 3's envelope migration will introduce orphan-seller as a new FAIL rule (per Strategist's deferred-migration scope); the validator's current "validate Offer-property shape when offers present" rule is shape-agnostic and will continue to work alongside that addition.

Per Strategist clarification 3: any orphan-seller or seller-shape rule currently at FAIL severity (Sprint 1 closure intended these at WARN until envelope migration ships) would be logged here for Sprint 3 planning. **Confirmed clear** — no audit action needed.

---

## Verification-bottlenecked observation

S133 divergence rate: 3 of 5 items reframed under verification. S134: 6 of 6. The trend isn't "briefs getting worse" — both sessions ultimately shipped the right work — it's "the verification protocol is doing more load-bearing work, and the brief stage is correspondingly less load-bearing." Planner effort allocation should shift from brief-completeness toward verification-step design. Recorded in S134 session-log entry as the explicit institutional framing.

---

## References

- `src/utils/ticket-source-classifier.ts:1-82` (existing classifier)
- `src/generators/event-page.ts:212-288` (Offer emission detail page)
- `src/templates/page.ts:324, 461, 476-485` (hub JSON-LD + microdata)
- `src/validators/schema-completeness.ts:181, 199-237` (rule reshape target)
- 2026-04-28 Offers Implementation Spec (locked; shape b mandated)
- Sprint 1 closure (commits 749de0fd5, 5d49315a1, 3eaec15df, 8021646d1) — authorized shape (a) interim
- S133 lifecycle work (`specs/s133-noindex-visibility-divergence.md`) — past-active noindex precedent
