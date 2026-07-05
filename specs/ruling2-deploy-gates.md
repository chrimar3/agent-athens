# GEO Ruling 2 — Pre-Deploy Gates (read-only verification)

**Date:** 2026-07-04 · **Type:** read-only verification, NO implementation, NO deploy.
**Result:** **BOTH GATES CLEAN.** No dead `/en/` URL in sitemap or hreflang; no orphaned schema edge on cooling pages. No MUST-FIX before Step 4. Deploy authorization is unblocked on these two grounds (band-size / `/en/`-coverage decisions from the checkpoint still stand separately).

---

## GATE 1 — archive-band events in sitemap or hreflang? **CLEAN**

Archive-phase (past-expired, 45–90d band) events appear in **NEITHER** the sitemap **NOR** any hreflang emission. Three independent mechanisms guarantee it — no single point of failure:

1. **Not in the source set (structural).** `generateEventPages(pageableEvents, …)` (generate-site.ts:656) is fed **only `pageableEvents`** (upcoming + past-active ≤45d). Archive events are past-expired → excluded from `pageableEvents` (generate-site.ts:260-261) → never iterated → never reach the sitemap `urls.push` (event-page.ts:928-931) or the per-page hreflang render. The sitemap's event URLs = `eventPageUrls` = pageable **non-noindex** only (active + just-passed).

2. **Page-level hreflang globally OFF.** `HREFLANG_GATE_OPEN = false` (utils/hreflang.ts:25); `renderHreflangLinks` returns `''` when the gate is closed. So **no** event/hub/venue page emits any hreflang today — dead `/en/` or otherwise. (Confirmed at the source, not inferred.)

3. **Sitemap emits no hreflang alternates.** `buildUrlEntry` hardcodes `const hreflangXml = ''` (generate-sitemaps.ts, S144 drop). `hasHreflang` is therefore always false → no `xmlns:xhtml`, no `xhtml:link` alternate rows. The sitemap carries bare `<loc>` entries only — it cannot point at a dead `/en/` archive URL.

**Bonus (dead-link leak):** `selectRelatedEvents` filters to `classifyEventLifecycle(e) === 'upcoming'` (event-page.ts). Related-events modules on live pages can only ever link **upcoming** events — an archive event can never surface as a related-card href either.

**Verdict:** no Guard-6 drift. No dead `/en/` URL is emitted anywhere this build. Nothing to fix.

---

## GATE 2 — does any preserved schema node reference the dropped `#event`? **CLEAN**

On a cooling page (Event node dropped, non-Event nodes kept), **no retained node references `#event`**, and the Offer drops **with** the Event rather than dangling.

**Structural reason (code trace):**
- The Offer is **nested inline** on `Event.offers` (event-page.ts:283 comment; :254 `schema.offers = offerDecision.offer`), i.e. it is part of the Event entity — not a separate `@graph` member. Dropping the `#event` node removes the Offer with it.
- The only `@id` reference edges are **outbound from the Event**: `Event.location → #venue`, `Event.organizer → #venue`, `Event.offers.seller → {seller host}#organization`. No node holds a reference **to** `#event`. The `#event` id is *set* on the Event entity and *referenced by nothing*.
- The venue Place, the site-publisher Organization, and (when the seller URL host is parseable) the seller Organization are all **standalone** members with outbound-only edges — none point back at `#event`.

**Empirical confirmation** (cooling with-ticket event, `omitEventNode: true`):
```
DEFAULT graph:   MusicEvent(#event), MusicVenue(#venue), Organization(#organization)
COOLING graph:   MusicVenue(#venue), Organization(#organization)     ← #event dropped
  @id ending #event present:            false
  substring "#event" anywhere retained: false      ← no dangling reference
  Offer/offers/priceSpecification kept: false      ← Offer dropped WITH the Event
  seller reference kept:                false
```

**Verdict:** no orphaned edge; retained graph is internally consistent (all references resolve; the dropped node is referenced by nothing). Page is never schema-silent (publisher Organization always remains). Nothing to fix.

---

## Deploy-gate summary

| Gate | Question | Result |
|---|---|---|
| 1 | Archive events in sitemap / carrying hreflang? | **CLEAN** — excluded by 3 independent mechanisms; related-events upcoming-only |
| 2 | Preserved node dangling a `#event` reference? | **CLEAN** — Offer drops with Event; no inbound reference to `#event` (empirically verified) |

Neither gate surfaces a MUST-FIX. The outstanding pre-deploy decisions remain the two from `ruling2-fix-checkpoint.md` (band size 6,246 vs. estimate; `/en/` bare-root-only coverage) — both policy/scope calls for Christos, not correctness defects. No implementation or deploy performed.
