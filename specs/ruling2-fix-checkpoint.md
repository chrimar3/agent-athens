# GEO Ruling 2 — Implementation Checkpoint (Steps 0→3 complete; deploy withheld)

**Date:** 2026-07-04 · **Model:** Sonnet 5 · **Freshness class:** dev-work (07-04→07-18 window)
**End state:** Steps 0→3 complete. `bun test` **2895 pass / 0 fail**, `bunx tsc --noEmit` **clean**. Exhibition lock proven **red-on-removal**. Cooling contract fully asserted (incl. no-Event-JSON-LD). Combinatorial partition green (all three siblings).
**Deploy:** **NOT run this session** (Step 4 withheld per instruction — mass-410 across the whole >45d surface lands mid-freshness-read; wants human review). Commits are **local, not pushed**. Christos authorizes deploy separately.

---

## Commits (three-commit shape, staged by explicit path — no `git add -A`)

| Ref | Scope |
|---|---|
| `8ce5e5af9` | **Implementation** — `event-page.ts` (generateArchiveGoneRules + `ARCHIVE_410_WINDOW_DAYS=90` + generateEventSchema `omitEventNode` + cooling wiring), `generate-site.ts` (emission + `generate410Page` + `loadBacklinkPreservedUrls` + `410.html` RESERVED + import), `event-lifecycle.ts` (design comment), `config/backlink-preserved-urls.json` |
| `434693b4c` | **Exhibition lock + flipped anchor** — `lifecycle-presumption.test.ts`: §1 red-on-removal lock; "never 410" anchor test renamed (executable assertions unchanged) |
| `e91f341e9` | **New test suites** — `archive-gone-rules.test.ts`, `cooling-schema.test.ts`; stale `@type`-fixture refresh in `event-page.test.ts` |

**Red-on-removal verification (for GEO ratification append):** stubbed `resolveEffectiveEnd` to drop its `if (event.endDate)` branch → both §1 lock tests (`GEO Ruling 2 §1 — exhibition-endDate invariant LOCK`) went **RED** (6 fail total under stub) → reverted → 19/19 green. The lock is on `resolveEffectiveEnd` (event-lifecycle.ts), asserted by `lifecycle-presumption.test.ts` in commit `434693b4c`.

---

## Diff summary (what changed, by concern)

- **Archive 410 (`event-page.ts`):** `generateArchiveGoneRules(events, {preservedUrls})` — keeps `classifyEventLifecycle === 'past-expired'` AND `resolveEffectiveEnd(event).date` within the trailing 90 days; emits `\`/events/{slug}/ /410.html 410!\`` (force flag defeats lingering-dist-dir shadowing). Event pages only.
- **Emission wiring (`generate-site.ts`):** appended below the slug-change 301s in the `_redirects` block (partitioned, commented section). Enumerated from `locationFiltered`. `generate410Page()` mirrors `generate404Page()`; `410.html` added to RESERVED; dormant allowlist loaded via `loadBacklinkPreservedUrls()`.
- **Cooling JSON-LD (`event-page.ts`):** `generateEventSchema(..., {omitEventNode})` filters the `#event` node from the `@graph` when `shouldNoindexEvent(event)` is true; non-Event nodes (venue Place, publisher/seller Organization) preserved — page never schema-silent.
- **Design comment (`event-lifecycle.ts`):** "never 410 (no phase emits one anywhere)" → clarified that the classifier emits no status code; archive drives a 410 at the emission layer; cooling/just-passed never 410.
- **Config seam:** `config/backlink-preserved-urls.json` — `{ "preserved_urls": [] }`, empty by design, zero-API-cost.

---

## ⚠️ Band count: 6,246 — NOT ~3,068 (correct-keying finding)

Confirmed against the live DB via `generateArchiveGoneRules(publishable)`:

| Metric | Value |
|---|--:|
| total events | 15,361 |
| publishable (`verified_athens` + `pass_through`) | 12,805 |
| **archive-410 band rules (45–90d, `resolveEffectiveEnd`-keyed)** | **6,246** (all unique sources) |

**Why it differs from the spike's 3,068:** the spike used raw `COALESCE(exhibition→end_date, start_date)`, which keys *non-exhibition* end_dates on `start_date`. Under correct `resolveEffectiveEnd` keying, multi-day events (theater/festival runs, any type with a real `end_date`) that **started** >90d ago but **ended** 45–90d ago correctly enter the band. This is the intended behavior — the 3,068 undercount would have left ~3,178 archived long-run URLs as 404-by-omission — but the count is ~2× the estimate.

**Ceiling check:** 6,246 + 4 base rules + 3 slug-change 301s ≈ **6,253**, i.e. **~62% of Netlify's ~10k ceiling**. Under the brief's "approaches 10k → STOP" threshold, so I proceeded. The band is bounded/self-sliding (steady-state ≈ events per 45-day window), but headroom is tighter than assumed. **Lever if desired:** tighten `ARCHIVE_410_WINDOW_DAYS` 90→75 (30-day window ≈ 4,164 rules) — one constant in `event-page.ts`. Flagging for the deploy-review decision.

### 10-URL sample of the 45–90d band
```
/events/580fe29c-138-20/ /410.html 410!
/events/8787e304-138-20/ /410.html 410!
/events/af5c16d7--/ /410.html 410!
/events/f92c0c55-studio-20/ /410.html 410!
/events/4a45d94a-nous-/ /410.html 410!
/events/ae47b2bd-cartel-/ /410.html 410!
/events/cebb1b30--/ /410.html 410!
/events/e6d38dc3--/ /410.html 410!
/events/4f79d1b5--/ /410.html 410!
/events/e85658a5-nous-/ /410.html 410!
```

---

## Step-0 grounding outcomes (carried)

- **0a — 410 mechanism:** Netlify `_redirects` force-410 (`410!`) to `/410.html`. Enumeration source = iterate-and-classify over `locationFiltered` (single-source `resolveEffectiveEnd` keying), NOT slugHistory (self-prunes to pageable) and NOT parallel SQL.
- **0b — cooling Event JSON-LD:** was a **confirmed gap** — Event JSON-LD emitted unconditionally at `event-page.ts` (robots-noindex and sitemap-membership were phase-gated; schema was not). Now fixed (node dropped on cooling, non-Event preserved).
- **`NOINDEX_ON_INDEXABLE_PHASE` interaction:** stays green — for a cooling page the guard either computes phase=cooling (skipped) or hits `if (!eventEntity) return empty` once the node is dropped; active/just-passed keep their Event node (shouldNoindex=false), so the guard's protection is intact. **No finding.**

---

## Phase-surface contract status (verified by tests)

| Phase | Contract | Status |
|---|---|---|
| Just-passed (0–14d) | 200 + indexed + Event node present + self-canonical `/en/` | ✅ asserted (cooling-schema integration) |
| Cooling (15–44d) | 200 + `noindex,follow` + **no Event JSON-LD** + non-Event nodes kept + sitemap-excluded | ✅ asserted (unit + integration) |
| Archive (45+) | 410 (bounded 45–90d) / natural 404 beyond | ✅ asserted (archive-gone-rules) |
| Exhibition future-endDate | never cooling/archive | ✅ locked red-on-removal |

---

## Remaining scope decisions for deploy review (Christos)

1. **Band size 6,246 vs. estimate 3,068** — accept, or tighten window to 75d (~4,164)? (One-constant change.)
2. **Locale coverage:** rules cover bare-root `/events/{slug}/`. The `/en/events/{slug}/` mirror (792-dir surface) also 404s for past events but is **not** 410'd this session — one rule per event per the pinned ~count model. Decision: leave `/en/` as-is (follow-up) or double the band to cover it (~12.5k rules → **would breach 10k**; would require window-tightening first). **Flagged, not folded in.**
3. **Deploy authorization** — Step 4 (`bun run src/generate-site.ts` → `netlify deploy --prod --no-build --dir=dist` → prod-verify the four phase curls) is withheld pending review.

**Next action:** Christos reviews → authorizes deploy → run Step 4 (build + deploy + prod `.com` verification). Then post-session notes (mistakes/patterns/decisions) + session-log append.
