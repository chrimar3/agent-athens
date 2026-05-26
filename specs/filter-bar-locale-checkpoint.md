# Filter-bar `/en/` chip behavior — checkpoint (deferred)

## Status: labels DONE (S156); chip navigation behavior DEFERRED

S156 made `filter-bar.ts` locale-aware for **labels only**. English hubs now render
English filter labels (Type/Price/Sort/Date, Concerts/Theatre/…, Free entry/Ticketed,
Clear/Reset/Close). EL unchanged.

**Still broken (deferred):** on `/en/` hubs, clicking a filter chip navigates to a
**bare-root Greek combo page** (`/concert-this-week`, `/open-this-week`, …) — `opt.url`
was intentionally left untouched. So English users still get dumped into Greek content
when they filter. Not a regression (was Greek-label→Greek-combo; now English-label→
Greek-combo); just the half not yet fixed.

## Why deferred / why not hub-routing
- **Half the `/en/` type hubs don't build** (inventory-gated: `answerCapsuleEn` + ≥3 events).
  Empirically MISSING on a normal build: `/en/exhibitions/`, `/en/cinema/`, `/en/tech/`,
  `/en/performances/`, `/en/workshops/`, `/en/dance/`. Pointing chips there = the same
  404 class we're fixing, and GEO forbade hiding options.
- **`/en/` has no combo pages** (GEO: don't generate them) → navigation can't compose
  type+price+date the way Greek combos do.
- So the only approach satisfying "no missing options / no 404 / no inventory asymmetry /
  composition" is **client-side in-page filtering on `/en/`**.

## The fix (next session, post-demo)
On `locale==='en'`, chips filter the current hub's rendered events via JS (show/hide
`.event-card` by type/price/date) instead of navigating. EL keeps combo-navigation.
Requires:
- Add `data-type` and `data-date` to `.event-card` root (currently `data-price` is on the
  root; `data-type` is only on a child `.card-image-wrapper`; no `data-date` exists).
- New filter JS (extend `renderFilterBarScript`, which already does client-side sort-by-price).
- Empty-state + live count updates.

## Owner: Dev, post-demo. Blocked on: dedicated session (new JS + card data-attrs).

## Related
- `docs/known-issues.md` — date-conditional-hub dangling links (`cornerstone-links.ts`);
  inventory-gated `/en/` hubs.
- Fifth locale-unaware surface found in S156: the **search overlay** (`search-overlay.ts`,
  `search-clear-btn` aria-label `Καθαρισμός`) still hardcodes Greek on `/en/`. Out of S156
  scope; log for a future locale pass.
