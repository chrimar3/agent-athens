# S132 — Defect (C) generation path enumeration

**Scope:** Identify what produces both `/concert.html` AND `/concerts.html` (and analogues for theater/exhibition/performance).

## Two distinct generators converging on similar URLs

### Path 1: filter-based hub generator → singular slugs

`src/generate-site.ts:394–404`

```ts
for (const type of EVENT_TYPES) {
  generatedUrls.push(await generatePage({ type }, events));   // ← line 396: emits /concert.html
  for (const time of TIME_RANGES) {
    generatedUrls.push(await generatePage({ type, time }, events));  // emits /concert-today.html etc.
  }
}
```

The URL for `{type: 'concert'}` is computed by `buildURL()` in `src/utils/urls.ts:6` — joins the filter parts. For `{type: 'concert'}` alone, output slug = `concert`. Writes to `dist/concert.html` via `generatePage()` (line 1116).

**Singular slugs emitted by Path 1**: `concert`, `theater`, `exhibition`, `performance`, `workshop`, `dj_set`, `cinema`, etc. — one bare slug per `EVENT_TYPES` member.

### Path 2: curated category generator → plural slugs

`src/generate-site.ts:1145–1188` (`generateCategoryPages`), invoked at line 460.

Reads `config/categories.json` and writes to `dist/${category.slug}.html` (line 1154). Slugs in config are English plurals/idioms:

`concerts`, `clubs`, `rebetiko`, `jazz`, `performances`, `theatre`, `comedy`, `exhibitions`, `cinema`, `screenings`, `workshops`, `tech` (12 total).

Each category has a `filter` field defining what events it includes. The **bare-filter** categories (`{type: X}` with no extra narrowing) duplicate Path 1's output:

| Path 2 category | Filter | Path 1 collision | Identical title? |
|---|---|---|---|
| `concerts` | `{type: 'concert'}` | `/concert` | 🔴 yes — `Συναυλίες στην Αθήνα` |
| `theatre` | `{type: 'theater'}` | `/theater` | 🔴 yes — `Θέατρο στην Αθήνα` |
| `exhibitions` | `{type: 'exhibition'}` | `/exhibition` | 🔴 yes — `Εκθέσεις στην Αθήνα` |
| `performances` | `{type: 'performance'}` | `/performance` | 🔴 yes — `Παραστάσεις στην Αθήνα` |
| `workshops` | `{type: 'workshop'}` | `/workshop` | 🟡 different — `Εργαστήρια & Masterclasses` vs `Εργαστήρια στην Αθήνα` |
| `cinema` | `{type: 'cinema'}` | `/cinema` | same slug — Path 2 overwrites Path 1 file (no two-file collision) |
| `clubs` | `{type: 'dj_set'}` | `/dj_set` | different slug + non-Latin path → no collision |
| `comedy` | (likely genre/type combo) | unclear | TBD |
| `screenings` | (likely cinema variant) | unclear | TBD |
| `tech` | `{type: 'tech'}` | `/tech` | likely identical title |
| `rebetiko` / `jazz` | `{type: 'concert', genresInclude: [...]}` | none — extra filter narrows | not a duplicate |

**Confirmed 4 identical-title pairs**: concert/concerts, theater/theatre, exhibition/exhibitions, performance/performances.
**1 partial (different title)**: workshop/workshops.

## Root cause classification

Same root cause for all four 🔴 collisions: Path 1 emits a bare-type page for every `EVENT_TYPES` member, but Path 2 emits a curated category page for the same filter, and the title generators converge on the same Greek string.

**Single fix point**: line 396 of `src/generate-site.ts`. Skip `generatePage({ type }, events)` when a curated category exists with a bare `{type: X}` filter. Time-anchored variants (`/concert-today`, `/concert-this-weekend`) remain — they don't collide with anything.

## What stays, what goes

| Form | Decision | Why |
|---|---|---|
| `/concerts`, `/theatre`, `/exhibitions`, `/performances` | **KEEP** (canonical) | English plural is the curated-category convention; homepage already links here; richer metadata in `config/categories.json` |
| `/concert`, `/theater`, `/exhibition`, `/performance` | **REMOVE from build + 301-redirect to plural** | Identical-title cannibalization with the plural canonical |
| `/concert-today`, `/theater-this-weekend`, etc. | **KEEP** (unique URLs, no collision) | Time-anchored singulars have no plural duplicate; useful for crawl coverage |
| `/cinema`, `/workshop`, `/tech`, `/dj_set`, `/show`, `/festival`, `/other`, `/dance` | **REVIEW per-category** | Some collide on same slug (cinema), some on different titles (workshop). Resolve generically by treating "any curated bare-filter category" as the canonical and skipping Path 1's bare-type emission. |

## Generic rule for the fix (avoids hardcoding 4 pairs)

> Build a set `CURATED_BARE_TYPES` from `config/categories.json`: types covered by a curated category whose filter is exactly `{type: X}` (no `genresInclude`, no extra keys). Skip `generatePage({ type }, events)` for those types only; time/price/genre variants are unaffected.

This is config-driven and self-maintains as `config/categories.json` evolves.
