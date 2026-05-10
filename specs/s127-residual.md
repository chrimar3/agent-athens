# S127 Residual — Items deferred from cornerstone content-hash gating session

**Session:** S127 — Generalize S101a content-hash gating from `/this-weekend` to all actual cornerstones
**Date:** 2026-05-10
**Outcome:** Gated `/today`, `/this-month`, `/open` (× Greek + English) using existing `hashEventSet` + `resolveLastModified` pattern. Manifest grew from 2 → 8 keys. `/this-weekend` (already gated in S101a) preserved.

This document tracks items surfaced during S127 Phase 1 reconnaissance and implementation that were intentionally deferred. Each item should be picked up in a future session if it remains relevant.

---

## 1. Unbuilt cornerstone references — `/tomorrow`, `/this-week`, `/next-month`

The original S126 audit framing assumed 7 cornerstones. Phase 1 reconnaissance discovered only **4 actually exist** as hub pages with `cornerstone: true` in `config/hub-pages.json`: `this-weekend`, `today`, `this-month`, `open`.

The other 3 (`/tomorrow`, `/this-week`, `/next-month`) are referenced as if cornerstones in:

- `src/generate-site.ts:1234-1235` — template-string nav links in a header/README block.
- `src/sitemap/generate-sitemaps.ts:30` — `dailyPrefixes = ['today', 'tomorrow', 'this-week', 'this-weekend', 'this-month', 'next-month']` for sitemap `<changefreq>daily</changefreq>` classification.
- `src/scripts/ping-indexnow.ts` and `src/audit-schema-types.ts` — submission/validation checklists.

But they have **no entry in `config/hub-pages.json`** and **no built directories under `dist/`**. They render only as combinatorial pages (e.g., `/concerts-tomorrow.html`, `/exhibitions-next-month.html`), not as standalone cornerstone hubs.

**To enable as gated cornerstones:**
1. Add hub configs in `config/hub-pages.json` (with `cornerstone: true`, `answerCapsuleEl`, `answerCapsuleEn`, `faqs`, etc., matching the shape of `today`/`this-month`).
2. Fix the exhibition-filter bug in `src/utils/filters.ts` (see item 2 below) — required before adding hub configs, otherwise the new hubs will silently miss running exhibitions.
3. Add tests mirroring the cornerstone gating contract.
4. Add slugs to `GATED_CORNERSTONES` in `src/generate-site.ts` (currently `['this-weekend', 'today', 'this-month', 'open']`).
5. Verify byte-equality invariant across two consecutive builds for the new cornerstones.

---

## 2. Filter-correctness gap — `/tomorrow` and `/next-month` exhibition handling (POSSIBLE TIER 1 IN PRODUCTION)

`src/utils/filters.ts:50` (`tomorrow` predicate) and `src/utils/filters.ts:91` (`next-month` predicate) filter on `start_date` only. They do **not** apply the `COALESCE(end_date, start_date)` exhibition pattern that `/today`, `/this-week`, `/this-month` correctly implement.

**Current production impact:**
- Cornerstone hubs `/tomorrow` and `/next-month` don't render today (item 1 above), so no direct cornerstone JSON-LD is affected.
- **But the same filter primitive feeds combinatorial pages**: `/concerts-tomorrow.html`, `/exhibitions-next-month.html`, etc. Running exhibitions whose `start_date` falls before tomorrow / outside next-month but whose `end_date` extends into those windows may be **silently absent** from those pages.
- This is a possible Tier 1 invariant violation per `.claude/CLAUDE.md`: "Exhibitions use end_date, not start_date".

**Mirror to `docs/known-issues.md` as 🟡 severity** — residual specs are per-session documents, but `known-issues.md` is the persistent registry, and a possible silent Tier 1 violation in production deserves the persistent slot.

**Fix plan:**
- Audit combinatorial-page exhibition coverage on production (e.g., spot-check `/exhibitions-next-month` against DB for known-running exhibitions).
- If affected, patch `src/utils/filters.ts:50` and `:91` to use `COALESCE(end_date, start_date)` matching the `today`/`this-week`/`this-month` pattern.
- Status: open, watch-only.

---

## 3. Static info pages — `/about`, `/editorial`, `/corrections` (× 2 locales)

`src/generate-site.ts:648, 685, 725, 778, 834, 879` — six JSON-LD blocks emit `'dateModified': todayIso` for the static info pages. `todayIso = DateTime.now().setZone('Europe/Athens').toISODate()` (line 624) is already date-only and Athens-TZ aware, so drift is at day-boundary granularity, **not** sub-second like the cornerstone hubs were.

**Severity:** lower than cornerstones — date-only drift is what AI engines see most frequently anyway, and these pages don't claim event-set-driven updates.

**Could be gated similarly** by hashing each page's stable content (intro paragraph, FAQ, etc.) and using `resolveLastModified` with `about`, `en/about`, `editorial`, etc. as manifest keys. But the win is small (date-only already vs. date-only after gating) and the implementation is tedious (each static page has different content shape). Defer unless a separate signal (Search Console, AI engine feedback) suggests these pages are hurting trust scores.

---

## 4. Datafeed and search-index `new Date()` sites

- `src/generators/datafeed.ts:34` — DataFeed schema `dateModified` (currently `new Date().toISOString()`)
- `src/generate-site.ts:1136` — datafeed lastUpdate
- `src/generators/search-index.ts:133, 154` — search index `generated` / `now`
- `src/generate-site.ts:1183` — search-index lastUpdate

These are **not in cornerstone JSON-LD path** but each renders timestamps that may or may not be consumed by external indexes:
- The DataFeed schema (`/feed.json`) is referenced by Google Merchant feeds and Schema.org DataFeed crawlers. Daily `dateModified` advance there may signal stale data noise.
- The search-index `/search.json` is used by the on-site client search, not external crawlers — drift there is invisible.

**Recommended**: gate the DataFeed `dateModified` (it's a public-schema artifact) using a hash over its `dataFeedElement` array. Skip the search-index drift (private artifact, unobserved by external indexes).

---

## 5. Per-event `dateModified` — `src/generators/event-page.ts:498`

`<meta name="date" content="${new Date().toISOString().split('T')[0]}">` on every event page (~5,000+ pages). Per-event drift across a much larger surface than cornerstones. Different test surface (per-event integration tests vs. hub-level).

**Out of scope for S127 by original brief decision.** Future session would need:
- A per-event hash strategy (probably hash over event's mutable fields: title, startDate, description, venue, price).
- Manifest key per event ID + locale.
- Test contract mirroring the hub-level one.
- Possibly a different gating threshold (do we gate when only `description` changes? title? venue? answer affects the ratio of stable-vs-fresh dates).

---

## Cross-cutting refinement — `cornerstones` as single source of truth (post-S127)

The cornerstone slug list now appears in two places:
- `config/hub-pages.json` — entries with `cornerstone: true`.
- `src/generate-site.ts` — `GATED_CORNERSTONES = ['this-weekend', 'today', 'this-month', 'open']`.

This duplication is intentional in S127 (gating is opt-in, not auto-enrolled), but it **drifts** if a third site ever needs the list (e.g., a sitemap priority bumper, an audit checker). Promotion to `src/config/cornerstones.ts` as a single source of truth would close this. Not a problem today; flag as follow-up architectural cleanup if a third use case emerges.
