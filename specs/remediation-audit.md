# Remediation Audit Report — Session 65

**Date:** 2026-03-09
**Scope:** Verify ~15 potential issues from prior design audit, fix confirmed items

---

## Summary

| Category | Count |
|----------|-------|
| ALREADY-FIXED | 9 |
| DESIGN-DECISION | 1 |
| FIX-NOW (fixed this session) | 4 |
| FEATURE (future) | 1 |

---

## Verified Findings

### ALREADY-FIXED (no action needed)

| # | Item | Finding |
|---|------|---------|
| 1.1 | Search visibility | Search overlay groups hidden when empty, shown when results found, focus return implemented |
| 1.3 | External images | Fallback chain: imageLocal > imageUrl > venueImage > placeholder icon. `onerror` handler hides img, shows SVG |
| 2.2 | Typography scale | Full 8-level system with mobile overrides at 767px |
| 2.3 | Badge colors | 11 per-type CSS custom properties with light-text variant for dark badges |
| 2.5 | Mobile grid | 4 breakpoints: 1280px/1024px/768px/<768px (4/3/2/1 columns) |
| 2.6 | Capsule position | Hub answer capsule injected after `</header>`, inside `<main>` |
| 3.1b | validFrom format | `event.createdAt` is already ISO 8601 with Z timezone |
| 3.4 | Search focus return | `returnFocus` variable stores trigger element, restores on close with try-catch |
| 3.5 | Mobile menu ARIA | `aria-expanded`, `aria-hidden`, `aria-label` properly toggled. Escape key closes. Scroll lock |

### DESIGN-DECISION (intentional)

| # | Item | Finding |
|---|------|---------|
| 2.4 | Card elevation | Cards use `#1a1a1a` background + per-type gradient fallback. No shadow is intentional dark-theme design |

### FEATURE (future session)

| # | Item | Finding |
|---|------|---------|
| — | /this-week/ hub | Does not exist in `dist/`. Needs hub-page generator config entry + content |

---

## Fixes Applied

### Fix 1: og:description empty (592 pages affected)

**File:** `src/generators/event-page.ts` lines 417, 429
**Problem:** `event.description.substring(0, 200)` produced empty string for 584 events with no `description` field.
**Fix:** Replaced with `generateEventMetaDescription(event)` — same function already used for `<meta name="description">`.
**Result:** 0 empty og:description in current build (9 orphan pages from previous builds remain in dist/ but are noindex).

### Fix 2: startDate time (145+ events affected)

**File:** `src/generators/event-page.ts` lines 150-158
**Problem:** Date-only `start_date` with known `time_doors` produced `T00:00:00` instead of actual event time.
**Fix:** Added early branch: when `timeDoors` or `timePeak` exists, use `formatSchemaDate(startDate, timeDoors)` which produces correct `T21:30:00+03:00` format.
**Result:** 2086 events now have actual times in schema startDate. 53 remain at midnight (genuinely no known time).

### Fix 3: Heading hierarchy (all event detail pages)

**Files:** `src/generators/event-page.ts` (3 locations), `src/generators/practical-block.ts` (1 location), `src/styles/design-system.css` (4 selectors)
**Problem:** Section headings used `<h3>`, skipping `<h2>`. Hierarchy was h1 > h3, violating WCAG 2.1 Level A.
**Fix:** Changed all section-level headings to `<h2>`. Card titles within related events remain `<h3>` (correct h2 > h3 nesting).
**Result:** Proper h1 > h2 > h3 hierarchy on all event detail pages.

### Fix 4: Skip link bilingual (all pages)

**File:** `src/templates/site-chrome.ts` line 9-10
**Problem:** `renderSiteNav()` always rendered Greek skip link text, even on English pages.
**Fix:** Added `locale` parameter (default `'el'`). English pages pass `locale` and get "Skip to content".
**Result:** English pages show "Skip to content", Greek pages show "Metavasi sto periechomeno".

---

## Post-fix Verification

```
Tests:     1423 pass, 0 fail
Build:     3744 pages (8.2s)
TS check:  Pre-existing hasNativeGreek fixture errors only (unrelated)
```
