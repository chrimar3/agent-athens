# Recon — Edge-Function 410 (named closure for the cross-locale asymmetry)

**Status:** RECON / not scheduled-as-code yet. Immediately-next item after GEO Ruling 2 ships (NOT backlog).
**Closes:** the interim cross-locale 410 asymmetry logged 2026-07-04 (`docs/geo-decisions.md`, `.claude/notes/decisions.md`).
**Type:** mechanism change (Netlify Edge Function) — distinct from the shipped `_redirects` approach. Needs its own design/test/deploy pass.

---

## Why this exists (the gap it closes)

The shipped archive-410 (`generateArchiveGoneRules`) emits **full-path `_redirects` rules, bare-root only** (~6,246 for the 45–90d band). It cannot cover `/en/events/{slug}/` cheaply because:

1. **Splat 410 is inert.** Netlify wildcard/splat 410 falls through to 404 (project's own prior finding, `specs/ruling2-fix-step0.md:26,52`). Only full-path 410 returns a true 410.
2. **The band is a date-defined subset, not a path prefix.** Archived slugs share no URL prefix distinguishing them from live event slugs, so no pattern rule can select "only the band."
3. **Doubling breaches the ceiling.** Adding exact `/en/` rules → ~12.5k, over Netlify's ~10k `_redirects` warning.

An Edge Function dissolves all three: it decides 410-vs-pass **programmatically at request time**, for **any** path in **either** locale, from **one** source of truth — no per-URL rule, no ceiling, no bare-root/`/en/` split.

## Sketch (to be designed, not final)

- **Trigger:** edge function bound to `/events/*` and `/en/events/*` (path patterns in `netlify.toml` `[[edge_functions]]`; the `[functions]` dir already exists).
- **Manifest:** build emits an archived-slug set (e.g. `dist/archived-slugs.json`) from the SAME `resolveEffectiveEnd`-keyed classifier the `_redirects` path uses — single source, no parallel date arithmetic. Bounded or unbounded is a free choice here (no rule-count ceiling), so this can also retire the 45–90d bound and cover the full >45d surface if GEO wants.
- **Logic:** on request, extract slug (strip locale prefix), look up in manifest → if archived, return 410 (with the `/410.html` body); else `context.next()` (let the static file / existing rules serve).
- **Precedence:** confirm edge function vs. static-file vs. `_redirects` ordering — the archived pages are absent from dist, so `next()` naturally 404s live-but-missing; the function only forces 410 on manifest hits. Verify no shadowing of live event pages.

## Open questions for the design session

1. Does the edge function coexist with, or replace, the bare-root `_redirects` 410s? (Replace is cleaner — one mechanism — but is a larger diff. Coexist risks double-handling.)
2. Manifest size/perf at request time (full >45d set ≈ 11.3k slugs today) — Set lookup is O(1), but confirm cold-start + memory budget.
3. Does removing the 45–90d bound (now possible) change the de-index strategy? (GEO call — unbounded 410 vs. bounded prune.)
4. Test surface: edge-function unit tests + a prod-verify matrix across both locales × {archive, cooling, just-passed, live}.

## Tripwire this also addresses

The interim asymmetry is "benign" only while `HREFLANG_GATE_OPEN = false`. The edge function makes the point moot (both locales 410 uniformly), so shipping it also defuses the bilingual-launch hreflang landmine named in the ledger.

## References

- `specs/ruling2-fix-checkpoint.md` — the shipped `_redirects` implementation + band count
- `specs/ruling2-deploy-gates.md` — GATE-1 (no dead `/en/` in sitemap/hreflang today)
- `specs/ruling2-fix-step0.md` — splat-410 fall-through finding
- `docs/geo-decisions.md` (2026-07-04 INTERIM FLAG entry) — the decision this closes
