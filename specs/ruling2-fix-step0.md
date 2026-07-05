# Ruling 2 (Past-Event URLs) — Step 0 Discovery Findings

**Session:** GEO Ruling 2 implementation prep · **Type:** read-only discovery (HARD STOP after Step 0) · **Date:** 2026-07-04
**Boundary honored:** read-only. No src/config/dist edits, no build, no deploy, no tests run. This spec is the only write.
**Outcome in one line:** Mechanism largely GREEN and mostly already shipped — but the brief's plan needs **two corrections** (Step 1 is a no-op; the real hard problem is *archive URL enumeration*, not 410 syntax). **Recommend: do NOT proceed as written; re-scope Step 2 first.**

---

## Verdicts at a glance

| Probe | Question | Verdict |
|---|---|---|
| 0a | Can 410 be emitted in this deploy setup? | **GREEN** — Netlify `_redirects` per-path status; generator at `generate-site.ts:715`. But see the enumeration blocker below. |
| 0b | Is `classifyEventLifecycle` the single source, shipped? | **GREEN** — single classifier, consumed by all emitters; no parallel date-math found. |
| 0c | Exhibition `endDate` invariant present? | **GREEN — already satisfied.** Refutes the brief's feared "second bug." Step 1 is unnecessary. |
| 0d | Combinatorial "no 410s" audit to partition around? | **REFRAME** — no such audit exists. The real "never 410" assertions are a design comment + one lifecycle test. |
| 0e | Canonical / `/en/` self-canonical surface? | **GREEN — shipped and clean.** |

---

## 0a — 410 emission mechanism: EXISTS

- Deployed artifact: `dist/_redirects` (Netlify `_redirects` syntax). Confirmed live content uses `301!`, `301`, `302`.
- `netlify.toml` exists (build disabled, `publish = "dist"`, CLI deploy) and can also carry `[[redirects]]` with `status`/`force`.
- Generator: `src/generate-site.ts:714-725`. It (1) writes a base `_redirects` (netlify.app→.com, sitemap, `/en` 302s) via `writeFileIfChangedSync`, then (2) appends slug-change 301s from `generateRedirects(currentSlugs, previousSlugHistory)` (defined `src/generators/event-page.ts:967`).
- **Netlify supports explicit per-path 410** (`/path 410` or `/from /410.html 410`). The prior Dev-Planner note already documented the full-path pattern + the wildcard caveat (wildcard-410 falls through to 404; full-path 410 works). So the mechanism is viable — **this is NOT a "0a NONE → spike" outcome.**

⚠️ **The real unknown 0a surfaced is NOT syntax — it is *enumeration* (see "Implementation blocker" below).**

## 0b — single classifier: CONFIRMED (shipped, not just decided)

- One classifier module: `src/utils/event-lifecycle.ts` — `classifyEventLifecycle` (3-way: upcoming/past-active/past-expired), `getLifecyclePhase` (4-way: active/just-passed/cooling/archive), `shouldNoindexEvent`, `resolveEffectiveEnd`.
- Consumers, all reading from it (no independent date arithmetic per surface):
  - `generate-site.ts:258-261` — pageable filter (`!== 'past-expired'`); `:695` — `shouldNoindexEvent`.
  - `generators/event-page.ts:34` imports it; `:461` classify; `:463` `shouldNoindex`; canonical is **locale-derived** (`:442-449`), not date-derived; noindex meta `:606`.
  - `validators/schema-completeness.ts` — `NOINDEX_ON_INDEXABLE_PHASE` build-guard + `EventCompleted`/G1 invariants (`:390-394`).
- The module self-documents "Single source of truth… Do not introduce parallel phase classifiers." **S144 D6 is shipped.** No consolidation session needed.

## 0c — exhibition `endDate` invariant: ALREADY SATISFIED (brief's worst case refuted)

- `classifyEventLifecycle` keys on `resolveEffectiveEnd(event).date`, **not** raw `start_date`.
- `resolveEffectiveEnd` (`:96-108`): if `endDate` present → uses it **for any type**; else if run-implying type (`exhibition`/`theater`/`festival`, per `config/lifecycle-presumption.json`) → presumed end = `start + presumed_run_days` (exhibition 90 / theater 45 / festival 30); else `start_date`.
- Therefore a running exhibition with a **future `endDate`** → `dateOnly >= today` → `upcoming` / phase `active`. It **cannot** classify Cooling or Archive while live. The GEO binding invariant holds.
- **Consequence: implementation Step 1 (the exhibition fix) is a no-op — drop it.** The endDate branch was generalized in F2b/G1 (audit A2 F2/F3 consolidation) and is already correct.

## 0d — combinatorial "no 410s" audit: DOES NOT EXIST (reframe the partition)

- "Combinatorial" in this repo just means the price×category×window hub pages (`generate-site.ts:3` header comment). There is **no combinatorial-redirects generator and no test asserting "no 410s in `_redirects`."** A full `grep '410'` over `src/` + `tests/` finds only:
  - `event-lifecycle.ts:16` — design comment "never 410 (no phase emits one anywhere — verified F2b Step 0)."
  - `lifecycle-presumption.test.ts:7,143` — test "…archive (page not generated; still **never 410**)."
- So the true "no 410" guard is a **design invariant + one unit test**, which the fix must **deliberately flip** (not a combinatorial audit to route around).
- Redirects that a 410 pass coexists with: the base rules + slug-change **301s** (`generateRedirects`, event-page.ts:967) + hub 301s. Partition risk is **low and disjoint by construction** (an archived past-expired event is not simultaneously acquiring a new slug), but the fix must still guarantee **no 410 rule matches a hub or a live/slug-changed event path** — full-path 410 lines only, never a wildcard.

## 0e — canonical + `/en/`: SHIPPED and clean

- `event-page.ts:442-449`: canonical is locale-aware self — `${BASE_URL}${localePrefix}/events/${slug}/`; `/en/` pages self-canonical to `/en/…`, bare-root to `/…` (S144 fixed the prior cross-locale violation).
- hreflang `:581-582` → `en` + `x-default` to `/en/`. noindex pages excluded from sitemap (`:849` "sitemap-eligible URLs only (noindex pages excluded — F2b/G3)").

---

## 🚧 Implementation blocker (the actual hard problem — surfaced by 0a + 0c)

**Nothing today enumerates past-expired events.** `generateEventPages` iterates **`pageableEvents` only**, and `pageableEvents` excludes `past-expired` (`generate-site.ts:260-261`). `pastEventUrls` (`event-page.ts` → consumed at `generate-site.ts:1253`) covers **past-*active* (≤45d)** pages that WERE generated — not archived ones.

So "emit 410 for every >45d URL" has **no existing source list**. Before Step 2 can be written, a source-of-truth for *which archived hashes to 410* must be chosen:
- (a) a dedicated DB pass: events whose `classifyEventLifecycle === 'past-expired'` **and** that plausibly had a public URL (bounded to avoid 410-ing hashes that never shipped);
- (b) `slugHistory` (`loadSlugHistory`/`saveSlugHistory`) as the ledger of URLs ever emitted;
- (c) a time-bounded list (the ruling's own `_redirects`-growth cap — prune 410s after a de-indexing window).
This is a genuine design decision, not a placeholder path. It also intersects the ruling's "bound `_redirects` growth" clause.

**Also note (from prior recon, carried here):** production `.com` already returns **404** for >45d events (verified: Half Note / B-side / Bolivar all 404 live), even though some dirs **linger in local `dist/`**. So the fix is **404→410 signal upgrade**, not a live-content cleanup — the "stale past content already published at scale" fear is **not** realized in prod. Priority remains P1 (citability signal correctness) but the blast radius is smaller than the ruling assumed.

**Phase-surface status (Step 3) — largely shipped, needs verification not greenfield:**
- passed-banner: `event-page.ts:649,690` (`data-past`, `.event-passed-banner`) ✅ present.
- noindex in cooling/archive ✅ (`shouldNoindexEvent`); sitemap-exclusion of noindex ✅ (`:849`).
- `EventCompleted` handling + G1 guards ✅ (`schema-completeness.ts:390-394`).
- **Unverified sub-claim:** "Event JSON-LD REMOVED in cooling." noindex is confirmed; schema *removal* specifically is not yet confirmed — verify before asserting the cooling contract complete.

---

## Recommendation (HARD STOP — awaiting clearance)

Not outcome (1) "all green → implement as written," and not (2)/(3) either. Closest to green, but the brief's plan needs re-scoping:

1. **Drop Step 1** — exhibition invariant already correct (0c).
2. **Resolve the archive-enumeration source (0a blocker) before Step 2** — this is the real design decision; pick (a)/(b)/(c) above. Without it there is no list to 410.
3. **Reframe Step 2's guard** — flip the `never 410` design comment (`event-lifecycle.ts:16`) + test (`lifecycle-presumption.test.ts:143`); there is no combinatorial audit to partition around. Full-path 410 lines only.
4. **Step 3 is mostly verification** — confirm cooling schema-removal + EventCompleted + sitemap-absence against the built artifact; don't rebuild surfaces that already exist.

**Do not proceed to implementation without explicit clearance + a decision on the enumeration source.**
