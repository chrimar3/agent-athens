# S133 — Noindex on "Visible" Exhibitions: No Divergence in Code

**Status**: Resolved — investigation revealed no code divergence. The apparent contradiction came from the brief's interactive SQL not matching production code predicates.
**Session**: S133
**Date**: 2026-05-11

## TL;DR

The brief claimed 7 (later 3) visible events had `noindex` tags, framed as "visibility filter says SHOW but lifecycle classifier says HIDE." Investigation traced both production predicates and confirmed they agree: all 3 events are correctly classified as past-active, correctly excluded from listings, and correctly get noindex pages (the 45-day retention window working as designed).

The divergence existed only between the brief's interactive SQL definition of "visible" (which treats `end_date IS NULL` as always visible for exhibitions) and the actual production code (which falls through to `start_date` when `endDate` is falsy). **No code change required.**

## The 3 affected events

```sql
SELECT id, type, start_date, end_date, location_status FROM events
WHERE id IN ('034943950692e12f', '441568031fc2ea5a', '4d931f3aeb45f235');
```

| ID prefix | Type | start_date | end_date | Days past | Title |
|-----------|------|-----------|----------|-----------|-------|
| 03494395 | exhibition | 2026-03-30T20:30:00 | `''` (empty) | 41.76 | Ο Κήπος του Επίκουρου – Έκθεση ζωγραφικής |
| 44156803 | exhibition | 2026-03-31T20:30:00 | `''` (empty) | 40.76 | (duplicate title; venue Μέγαρο Μουσικής) |
| 4d931f3a | exhibition | 2026-04-28 | `''` (empty) | 13.61 | Barbara Kruger: Untitled (Pride and Contempt) |

All three: `verified_athens`, not cancelled, end_date is empty string (not SQL NULL).

## Predicate 1 — Visibility (production code, listings/sitemaps)

`src/generate-site.ts:174-186`:

```typescript
const now = new Date();
const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
const upcomingEvents = locationFiltered.filter(event => {
  const startDate = new Date(event.startDate);

  // For exhibitions: show if currently running (end_date >= today) or starting soon
  if (event.type === 'exhibition' && event.endDate) {
    const endDate = new Date(event.endDate);
    endDate.setHours(23, 59, 59, 999);
    return endDate >= today;
  }

  // For other events: show if starting today or in the future
  return startDate >= today;
});
```

**Behavior for the 3 events**: `event.endDate === ''` is falsy → conditional short-circuits → falls through to `startDate >= today`. All three start dates are past 2026-05-11 → returns `false` → **NOT in upcomingEvents** → not in listings, not in hubs, not in editorial sitemap.

## Predicate 2 — Lifecycle (production code, page generation + noindex)

`src/utils/event-lifecycle.ts:44-68`:

```typescript
export function classifyEventLifecycle(event: {
  startDate: string;
  endDate?: string | null;
  type?: string;
}): LifecycleStatus {
  const isExhibition = event.type === 'exhibition';
  const relevantDate = (isExhibition && event.endDate) ? event.endDate : event.startDate;
  const dateOnly = relevantDate.substring(0, 10);
  const todayStr = getAthensTodayStr();

  if (dateOnly >= todayStr) {
    return 'upcoming';
  }

  // Event is in the past — check retention window
  const eventDate = new Date(dateOnly + 'T00:00:00Z');
  const todayDate = new Date(todayStr + 'T00:00:00Z');
  const daysDiff = Math.floor((todayDate.getTime() - eventDate.getTime()) / (86400 * 1000));

  if (daysDiff <= RETENTION_DAYS) {
    return 'past-active';
  }

  return 'past-expired';
}
```

**Behavior for the 3 events**: `(isExhibition && event.endDate)` → `event.endDate === ''` falsy → `relevantDate = event.startDate`. All three start dates are 13-42 days past, all within the 45-day `RETENTION_DAYS` window → returns `'past-active'`.

## How the two predicates compose

| Stage | Predicate | Result for these 3 |
|-------|-----------|---------------------|
| Page generation | `classifyEventLifecycle() !== 'past-expired'` (line 192 of generate-site.ts) | `past-active` ≠ `past-expired` → **page generated** at `dist/events/<prefix>--<slug>/` |
| Listings/hubs inclusion | `upcomingEvents` filter | falls through to `startDate >= today` → **excluded** |
| Sitemap inclusion | upcoming-only sitemap | **excluded** |
| Page's noindex meta | `isPast = lifecycle !== 'upcoming'` → noindex emitted | `past-active` → `isPast === true` → **noindex emitted** |

This is the **deliberate two-rail design** of the 45-day retention window:
1. Pages stay generated (so historical Google index entries don't 404)
2. Pages carry noindex (so they don't accumulate ranking)
3. Pages don't appear in any current listing or sitemap (so internal site navigation doesn't surface them)

All three rails behave consistently. The 3 events are working as designed.

## Tier 1 compliance check

From `.claude/CLAUDE.md`:

```sql
-- ✅ CORRECT: Check end_date for exhibitions
WHERE COALESCE(CASE WHEN type='exhibition' THEN end_date ELSE NULL END, start_date) < date('now')
```

The Tier 1 rule says: for exhibitions, use end_date if available; otherwise fall back to start_date.

- `classifyEventLifecycle()`: `(isExhibition && event.endDate) ? event.endDate : event.startDate` ✓ **complies** (falls back to startDate when endDate is falsy/NULL)
- `upcomingEvents` filter: same shape — checks `event.type === 'exhibition' && event.endDate`, falls through to startDate otherwise ✓ **complies**

Both predicates comply with Tier 1.

## Where the brief went wrong

The brief's "visibility filter" was an interactive SQL query:

```sql
SELECT ... FROM events WHERE ... AND (type != 'exhibition' OR end_date IS NULL OR end_date >= date('now'))
```

This predicate treats `end_date IS NULL` (or empty) as **always visible** for exhibitions. It does NOT fall back to `start_date`. So it counts the 3 events as visible.

The brief then compared this to the production code's lifecycle classifier (which correctly falls back to start_date) and found a "divergence." But the brief's SQL is not the production predicate — it's a query the brief author wrote interactively to define "visible." The production code uses the truthy `event.endDate` check, which DOES fall back to start_date.

So there's no divergence in the code. There's a divergence between the brief author's mental model of "visible" and the production code's definition.

## What this means for future sessions

1. **The 45-day retention with noindex is deliberate.** Past-active exhibitions correctly carry noindex while their pages remain accessible. Don't "fix" this.

2. **When defining a `visible-now` SQL query for diagnostics, mirror the production predicate**, not a simpler shorthand:

   ```sql
   -- ✅ Matches production: falls back to start_date when end_date is NULL/empty
   WHERE (
     (type = 'exhibition' AND end_date IS NOT NULL AND end_date != '' AND end_date >= date('now'))
     OR ((type != 'exhibition' OR end_date IS NULL OR end_date = '') AND start_date >= date('now'))
   )

   -- ❌ Over-counts: treats NULL/empty end_date as always visible
   WHERE (type != 'exhibition' OR end_date IS NULL OR end_date >= date('now'))
     AND (type = 'exhibition' OR start_date >= date('now'))
   ```

3. **Empty-string end_dates need normalization.** All 3 events have `end_date = ''` (empty string), not SQL NULL. Some predicates check `IS NULL`, some check truthy/falsy in JS — these are NOT equivalent. Consider a data-cleanup pass to normalize empty strings to NULL, or update predicates to handle both consistently. Not for this session — log as open item if the inconsistency causes confusion again.

## What to do if you encounter a similar "noindex on visible" report

1. Check whether the events are in `event_concerns` (hard-stop): they may have been excluded for quality reasons unrelated to lifecycle.
2. Check the production `upcomingEvents` predicate at `src/generate-site.ts:174-186`, not an interactive SQL approximation.
3. Check `classifyEventLifecycle()` at `src/utils/event-lifecycle.ts:44-68`.
4. Both predicates must agree on what "visible" means. They currently do — both correctly fall back to start_date when end_date is falsy.

## Critical files

- `src/generate-site.ts:174-186` — production visibility predicate (upcomingEvents)
- `src/utils/event-lifecycle.ts:44-68` — lifecycle classifier
- `src/generators/event-page.ts:337-338, 465` — noindex emitter (keys on lifecycle)
- `.claude/CLAUDE.md` — Tier 1 rule reference

## Routing

This investigation needed neither Dev Planner code change nor GEO Strategist policy review. The framing turned out to be a measurement-vs-reality mismatch (interactive SQL vs production code), not a design question or a bug. Filed and closed.
