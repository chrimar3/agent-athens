# Agent Athens — Site Audit Report

**Date:** 2026-02-26
**URL:** https://agentathens.com
**Auditor:** Claude Code (automated)

---

## Issue 1: Past Events Showing Up

### Severity: Low (by design, not a bug)

### Finding

One event with a `startDate` of **2026-02-25** (yesterday) appears on the homepage:

| Field | Value |
|-------|-------|
| Title | Συλλογή ΜΙΕΤ: Ελληνική τέχνη του 20ού αιώνα |
| Type | Exhibition |
| Start Date | 2026-02-25 |
| End Date | 2026-04-26 |
| Venue | Μουσείο Μπενάκη - Πειραιώς 138 |
| Display | "25 Φεβ - 26 Απρ · Ανοιχτή" |

### Root Cause

This is **intentional behavior** in `src/generate-site.ts` (lines 159-174):

```typescript
// For exhibitions: show if currently running (end_date >= today)
if (event.type === 'exhibition' && event.endDate) {
  const endDate = new Date(event.endDate);
  endDate.setHours(23, 59, 59, 999);
  return endDate >= today;  // ← exhibition ends April 26, so it passes
}

// For other events: show if starting today or future
return startDate >= today;
```

Exhibitions with a past `startDate` but a future `endDate` are intentionally kept because they're still open/running. This is correct for multi-week exhibitions, art shows, etc.

### Impact

- Only **1 event** out of 805 has a past start date
- The card correctly displays the date range "25 Φεβ - 26 Απρ" making it clear it's a running exhibition
- The `/today` page correctly **excludes** this event (it filters on `startDate == today`)

### Recommendation

**No fix needed.** If the user finds this confusing, possible UX improvements:
- Add a badge like "Τρέχει τώρα" (Running now) to distinguish running exhibitions from new events
- Group running exhibitions in a separate section below today's events

---

## Issue 2: Filter Buttons Not Working

### Severity: Medium — the buttons **do work**, but user perception suggests a UX problem

### Finding

The filter bar has **5 buttons**. Here is their actual status:

| Button | Label | Status | Behavior |
|--------|-------|--------|----------|
| Ημερομηνία (Date) | Active | **Works** — opens dropdown panel with 6 time options, each linking to a pre-generated page |
| Τύπος (Type/Genre) | Active | **Works** — opens grid panel with 10 event type tiles, each linking to a filtered page |
| Περιοχή (Area) | **Disabled** | **Does not work** — `disabled` attribute + `pointer-events: none` CSS + `opacity: 0.5` |
| Τιμή (Price) | Active | **Works** — opens panel with "Δωρεάν" (6 events) and "Με εισιτήριο" (799 events) |
| Ταξινόμηση (Sort) | Active | **Works** — client-side price sort (reorders DOM) or date sort (page reload) |

### Technical Verification

1. **JavaScript is present and correct** — inline `<script>` at line 38693 of the homepage HTML handles:
   - Panel open/close via `data-panel` attribute matching
   - Click-outside-to-dismiss via backdrop listener
   - Escape key handler
   - Mobile scroll locking
   - Price sort via DOM reordering

2. **All target pages exist** — every filter link returns HTTP 200:
   - `/today` → 200
   - `/concert` → 200
   - `/open` → 200
   - `/with-ticket` → 200
   - `/concert-today` → 200

3. **CSS is correct** — `design-system.css` has:
   - `.filter-panel { display: none; }` (hidden by default)
   - `.filter-panel.is-open { display: block; }` (shown when JS adds class)
   - Mobile: bottom-sheet animation via `@media (max-width: 767px)`

### Likely Cause of User-Perceived "Not Working"

Based on the investigation, the most probable explanations are:

#### A. Area (Περιοχή) button is visually disabled — user may be clicking it
- It's grayed out at `opacity: 0.5` with `pointer-events: none`
- No tooltip or explanation is shown
- Comment in source says "insufficient neighborhood data" but user sees nothing

#### B. Panels may not render properly on certain mobile browsers
- The panel CSS relies on `position: fixed` + `backdrop-filter: blur(4px)` + `-webkit-backdrop-filter`
- `backdrop-filter` has limited support on older Android WebView
- If the backdrop doesn't render, the panel might appear but be hard to notice

#### C. Touch event handling
- The JavaScript uses `click` events which work on mobile, but there's no `touchstart` optimization
- On some mobile browsers, there can be a 300ms delay before `click` fires
- No visual feedback (no `:active` or tap highlight) to indicate the button was pressed

#### D. The filter bar may scroll off-screen
- On the homepage with 805 events, the filter bar at the top scrolls away
- There is a `position: sticky` rule: `.filter-bar { position: sticky; top: var(--nav-height); }`
- If `--nav-height` is not set correctly, the sticky behavior may fail

### Recommendations

| Priority | Fix | Effort |
|----------|-----|--------|
| **P1** | Add tooltip or "(σύντομα)" label to disabled Περιοχή button | 5 min |
| **P2** | Add `:active` / tap feedback CSS to filter pills for mobile | 10 min |
| **P2** | Test sticky filter bar behavior on iOS Safari and Chrome Android | 30 min |
| **P3** | Add `-webkit-` prefixed backdrop-filter fallback | 5 min |
| **P3** | Consider adding `touch-action: manipulation` to filter pills to remove 300ms delay | 5 min |

---

## Date Distribution (for context)

The homepage currently shows 805 events with this date spread:

| Date | Count | Note |
|------|-------|------|
| 2026-02-25 | 1 | Running exhibition (past start, future end) |
| 2026-02-26 | 279 | Today |
| 2026-02-27 | 42 | Tomorrow |
| 2026-02-28 | 57 | Saturday |
| 2026-03-01 | 30 | |
| 2026-03-02 – 03-31 | ~220 | This month + next |
| 2026-04 – 2026-12 | ~176 | Far-future events |

---

## Overall Assessment

| Area | Status |
|------|--------|
| Past events filtering | Working correctly — exhibitions handled as designed |
| Date filter (Ημερομηνία) | Working — links to pre-generated pages |
| Type filter (Τύπος) | Working — links to pre-generated pages |
| Area filter (Περιοχή) | Intentionally disabled — needs better UX communication |
| Price filter (Τιμή) | Working — links to pre-generated pages |
| Sort (Ταξινόμηση) | Working — client-side DOM reordering |
| JavaScript execution | Present and correct |
| Target pages | All return HTTP 200 |
| CSS/styling | Correct, minor mobile concerns |

**Bottom line:** The filters work as built. The likely user confusion comes from (a) the disabled Area button with no explanation, and (b) possible mobile rendering/interaction issues that need hands-on device testing to confirm.
