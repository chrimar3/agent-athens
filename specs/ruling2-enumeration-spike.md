# Ruling 2 — Archive-410 Enumeration Spike (read-only)

**Session:** GEO Ruling 2 prep · **Type:** read-only enumeration spike · **Date:** 2026-07-04
**Boundary honored:** read-only. No src/config/dist edits, no build, no deploy, no tests run. This spec is the only write.
**Purpose:** resolve the open Step-0 blocker — *where does the archive-410 URL list come from?* — with real numbers.
**Outcome:** Source = **DB pass over the trailing 45–90d band (~3,068 rules)**. slugHistory is **refuted** as a source; unbounded >45d **breaches** Netlify's 10k limit.

---

## 1 — Archive surface by age band (the growth problem is real)

`COALESCE(exhibition→end_date, start_date) < now-45d`:

| Band | All events | Publishable (`verified_athens`+`pass_through`) |
|---|--:|--:|
| 45–90d (trailing window) | 3,466 | **3,068** |
| >90d | 8,790 | 8,229 |
| **Total >45d** | 12,256 | **11,297** |

**Interpretation:**
- **Unbounded 410 (all >45d) = ~11,297 rules and growing daily → REJECT.** Netlify warns above ~10k `_redirects` rules; the unbounded set already exceeds it before adding the existing slug-change 301s + hub rules. This is not a style preference — it's an operational ceiling breach.
- **Trailing 45–90d band = ~3,068 rules, bounded and self-sliding.** Events roll out of the band at 90d → their 410 rule is simply not re-emitted → path falls through to 404 (harmless once de-indexed). This directly satisfies the ruling's "bound `_redirects` growth (~90–180d prune)" clause and stays comfortably under 10k with headroom for 301s/hub rules.

## 2 — slugHistory ledger: EXISTS but REFUTED as a source

- Artifact: `dist/.slug-history.json` (file, not DB). Load/save at `event-page.ts:927/944`. Current population: **2,474 entries** (sample: `{"40406fe6…":["40406fe6-onassis-stegi-"], …}` — eventId → up-to-3 recent slugs).
- **Fatal flaw for our use:** `saveSlugHistory` merges **`currentSlugs` only** (`for (const [eventId, currentSlug] of currentSlugs)`), and `currentSlugs` derives from `pageableEvents` (= upcoming + past-active ≤45d). **An event that archives (>45d) drops out of `currentSlugs`, so the next build does not carry it forward — it is deleted from the ledger.** The file is a rolling snapshot of the *pageable* set (~2,474 ≈ pageable), NOT a durable history of every URL ever shipped.
- Its retention comment ("Keep max 3 historical slugs (90 days worth)") is **per-event slug renames**, not cross-event archive retention — orthogonal to our need.
- **Verdict:** slugHistory cannot enumerate archived URLs (they're gone within one build of archiving). Option (b) from `ruling2-fix-step0.md` is dead. Use the DB.

## 3 — The "never 410" assertion to flip (exact location)

`src/utils/__tests__/lifecycle-presumption.test.ts:143`:
```js
test('presumption long-expired → archive (page not generated; still never 410)', () => {
  const e = { startDate: daysFromNow(-140), endDate: null, type: 'exhibition' };
  expect(classifyEventLifecycle(e)).toBe('past-expired');
  expect(getLifecyclePhase(e)).toBe('archive');
});
```
**Nuance:** the executable assertions (`past-expired`, `archive`) stay **TRUE** after the fix — archive remains the phase. "Never 410" lives only in the **test name** and the design comment `event-lifecycle.ts:16` ("never 410 (no phase emits one anywhere — verified F2b Step 0)"). So the fix is not an assertion inversion; it is:
1. rename/re-scope this test (drop "still never 410" from the intent),
2. update the `event-lifecycle.ts:16` design comment,
3. add **new emission-layer tests** asserting archive → a 410 rule appears in the generated `_redirects` (the classifier layer is unchanged; 410 is an emission concern, consistent with 0b's single-classifier / separate-emitter split).

---

## Recommendation (enumeration source resolved — still awaiting implementation clearance)

- **Source of truth:** a **DB query over the trailing 45–90d publishable band** (`location_status IN ('verified_athens','pass_through')` AND effective-end in `[now-90d, now-45d)`), re-run each build. ~3,068 rules today, bounded, sliding, prune-free (aging out of the band *is* the prune).
- **Reject** unbounded >45d (11,297 → over Netlify's ceiling) and **reject** slugHistory (self-prunes to pageable).
- **Accept** that some band events may never have shipped a live URL; a 410 on a never-existent path is harmless (arguably better than 404) and the band keeps the count bounded.
- **Effective-end key must match the classifier** — use `resolveEffectiveEnd` semantics (endDate for any type; presumption windows for run-implying types), NOT the raw `COALESCE(exhibition→end_date, start_date)` used in this spike's exploratory SQL. Deriving the list from `classifyEventLifecycle`/DB-with-matching-COALESCE avoids a second date-arithmetic source (0b invariant).
- **Guard-6 span:** the 45/90 day constants + band query + emission + the flipped test + design comment must move together.

**No implementation performed. Awaiting clearance + confirmation of the 45–90d band as the chosen source.**
