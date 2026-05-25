# Language toggle — checkpoint

## Status: BLOCKED — routed to GEO Strategist (not a Dev task)

## Why deferred (3 findings)
1. **No element to wire.** The EL↔EN toggle was removed in a prior session;
   `src/templates/__tests__/page.test.ts` now guards its absence
   (`test("nav does not contain removed language toggle")` →
   `expect(html).not.toContain('class="lang-toggle"')`).
2. **No reusable counterpart URL.** S144 (2026-05-21) dropped hreflang globally:
   `const hreflangHtml = ''` in `event-page.ts`, `content-page.ts`, `page.ts`,
   and the sitemap. Only `hub-page.ts` (bilingual hubs) still computes en/el
   URLs, and not in a nav-reachable place.
3. **Recomputing slug→URL is forbidden** by the originating brief AND collides
   with the S144 GEO ruling that deliberately removed those URLs.

## What unblocks it (GEO decision, NOT Dev)
GEO Strategist must rule: given S144 dropped hreflang globally, is per-page
EL↔EN switching wanted at all? If yes, what is the counterpart-URL source that
does not reintroduce what S144 removed?

## Entanglement flag
S144's hreflang drop post-dates the English-default flip ruling (2026-05-25),
which assumed hreflang intact. GEO must reconcile its own flip ruling against
its own S144 drop before F1–F5 (full flip) proceeds. Toggle is downstream of
that reconciliation.

## Related (this session)
The nav-locale fix that shipped alongside this checkpoint already applies the
"hide where no counterpart exists" principle to the **Venues** nav item
(no `/en/venues/` → omitted on English nav). Same principle a future toggle
would need. See `src/templates/site-chrome.ts`.

## Owner: GEO Strategist. Revisit: post-demo, after GEO reconciliation.
