# S165 — Image finder REFUTED; athinorama thumbnail upgrader shipped instead

**Date:** 2026-05-27
**Stream:** GEO/SEO — image completeness *quality* (not a text-citation driver; per GEO ruling
this buys attribute-rich completeness + rich-result visual presence only).

## TL;DR
The briefed og:image **capture finder** for 174 missing-image concerts was **refuted by the
gap-is-open gate** (genuine absence, 5/5 spike). The diagnostic instead surfaced a real,
measured, reachable gap — 118 displayed events on **sub-floor 250×300 athinorama thumbnails** —
and shipped a deterministic **URL upgrader** (250×300 → 1200×1440) wired at capture-time + a
one-time backfill across both live image surfaces.

## Step 0 — gap-is-open gate (run FIRST)
- DB live (`data/events.db`), upcoming verified/pass_through:
  - **174 concerts** lack a real image — matches S161. Concerts are the concentration (174/190).
  - **All 174 are `image_source='not_found'`** — the existing finder (`scripts/enrich-images.ts`,
    which already calls `extractOgImage`) ran on every one and found nothing. **Zero untried.**
  - 173/174 are `athinorama.gr`.
- The completeness validator does **not** track `image` (`.fieldValidation` = `location`+`endDate`
  only), so the brief's `jq '.fieldValidation.image'` was always empty.

## Step 1 — diagnose: capture gap vs genuine absence
5/5 spike of athinorama `not_found` concert pages (crawler UA, no Referer): **no og:image, no
twitter:image, no `ImagesDatabase` poster** on any. The only `<img>` tags were footer member logos
(`footer-member-logos/ened.png`, `mht_athinorama.png`). → **Genuine absence.** A capture finder
closes ~0. **This is the S116 pattern — the 3rd refutation in the S161→S165 arc (geo, endDate,
image-capture). Do NOT re-propose a capture finder for these.**

Residual is already handled: `getOgImage()` (src/utils/og-image-fallback.ts) always returns a
value; every imageless event already renders a Satori OG tile (D11, decisions.md:3177, "permanent
strategy"). Nothing to build there.

## The surfaced gap (what we built for)
- **118 displayed-upcoming events** (theater-heavy; ~76 concerts) carry sub-floor athinorama
  **250×300** thumbnails. Short side 250 < the 300px quality floor.
- Athinorama's image server resizes on demand via the URL size segment:
  `/Content/ImagesDatabase/p/250x300/…` → `/p/1200x1440/…` returns **HTTP 200, image/webp,
  64–163 KB** under a Googlebot UA with **no Referer** (crawler-representative). Spike: **5/5**.
- **Why the brief's quality-floor gate would have backfired:** a strip-to-null gate (short side
  < 300) would have *deleted* the images of these 118 → coverage *down*. Correct move is
  **upgrade-then-gate, never blanket-strip.**

## Guard-6 surface set (Step 0b, resolved)
Event pages carry **no microdata image** (not a surface — do not check). The live surfaces:
- **on-page hero/card** ← `image_local` if present, else `image_url`
- **og:image / twitter:image / JSON-LD `image`** ← `image_local` (self-hosted webp)

**All 118 had an `image_local`**, and `optimize-image.ts` capped `MAX_WIDTH=800` with
`withoutEnlargement`. So a plain `image_url` rewrite would NOT have reached the GEO surfaces.

### Reusable lesson
**Self-hosted optimized images inherit the source's ceiling.** `withoutEnlargement:true` means a
250px source stays 250px regardless of `MAX_WIDTH` — the old self-hosted webps were 250×300, below
the *hard* floor (not merely sub-target). Upgrading them required re-downloading from the larger
source, not just a config bump. This is why "image_url-only" (Option A) was rejected.

## What shipped
1. `src/utils/athinorama-image.ts` — `upgradeAthinoramaImage(url)`: pure regex replace of the
   `/p/{W}x{H}/` segment → `/p/1200x1440/`. Idempotent, passthrough, no-throw. Mirrors
   `upgradeWordPressThumbnail`. Tests: `src/utils/__tests__/athinorama-image.test.ts` (6, green).
2. **Capture-time wiring** — `scripts/scrape-all.ts` applies the upgrader to `image_url` at both
   assignment branches in the athinorama image-extraction block (~L627/633). Future athinorama
   events upgrade on ingest; the normal download→optimize then self-hosts a high-res `image_local`.
3. `src/images/optimize-image.ts` — `MAX_WIDTH` 800 → 1200 (constant + doc note).
4. `scripts/upgrade-athinorama-images.ts` — one-time backfill, two scoped phases:
   - Phase 1: rewrite `image_url` for **all** athinorama sub-floor rows (10,297) → on-page hero +
     zeroes the global sub-floor count.
   - Phase 2: re-download + re-optimize `image_local` for the **118 displayed-upcoming** rows only
     (avoids re-fetching ~11k past/hidden rows). Upgrade-only, dry-run by default (`--apply` to write).

## Verification
- `bun test src/utils/__tests__/athinorama-image.test.ts` + `images.test.ts` → 24 pass.
- Full suite: 2643 pass; 2 fail are **pre-existing/unrelated** — EN exhibitions cornerstone
  (0 upcoming exhibitions in DB → no cornerstone built) and `geocodeVenues` batch (network flake).
- `bunx tsc --noEmit`: no new errors in touched files (pre-existing scraper DOM/encoding errors remain).
- Backfill: `image_url` global 250×300 → **0**; **118** displayed rows now `image_url` 1200×1440 +
  `image_local` regenerated (verified 1200×1440 webp).
- `bun run build` → upgraded event `1ede74a4` shows 1200×1440 in **all four live surfaces**
  (on-page `edp-hero-bg`, og:image, twitter:image, JSON-LD image); **zero `250x300`** on the page.

## Open items / routed
- **ROUTE TO DESIGN NAVIGATOR (observe only, do NOT converge this session):** the on-page imageless
  `.card-image--fallback` CSS gradient (S124) and the Satori OG PNG (D11) are two artifacts — the
  DN "one template, two render targets" ruling is not realized. This affects the *imageless* events
  (the 174 genuine-absence concerts), not the 118 upgraded here.
- **DEFERRED: build-time dimension floor gate.** Not built — after the upgrade there is nothing to
  gate (the 118 are 1200×1440; the 174 are already on the tile). Constraint for any future gate
  session: **upgrade-then-gate, NEVER blanket-strip** (a strip gate would have deleted the 118).
