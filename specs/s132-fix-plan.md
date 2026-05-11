# S132 — Fix plan

**Inputs:** `specs/s132-defect-a-emission-sites.md`, `specs/s132-defect-c-generation-paths.md`, and (intended) GSC manual findings in `specs/s131-google-discoverability-diagnostic.md`.

## (A) Broken `/neighborhoods/*` internal links

**File:** `src/generators/event-page.ts`, line 388.
**Change:** Remove the entire conditional from the `navLinks` array (lines 385–389).
**Before (line 385–389):**

```ts
const navLinks = [
  categorySlug ? `<a href="/${categorySlug}/">${t.typeDiscoveryLabels[event.type] || typeLabel}</a>` : '',
  `<a href="/venues/${venueSlug}/">${t.moreEventsAt} ${event.venue.name}</a>`,
  neighborhoodSlug ? `<a href="/neighborhoods/${neighborhoodSlug}/">${t.eventsInArea} ${displayNeighborhood(event.venue.neighborhood!)}</a>` : ''
].filter(Boolean);
```

**After:**

```ts
const navLinks = [
  categorySlug ? `<a href="/${categorySlug}/">${t.typeDiscoveryLabels[event.type] || typeLabel}</a>` : '',
  `<a href="/venues/${venueSlug}/">${t.moreEventsAt} ${event.venue.name}</a>`
].filter(Boolean);
```

Also drop the now-unused `neighborhoodSlug` constant on line 383 (small dead-code cleanup).

**Impact:**
- Eliminates ~3,858 broken 404 internal links from the event corpus at the next build.
- Venue-section display of neighborhood (line 562) remains; user still sees "Kerameikos" text on the page, just no broken button.
- Existing test `Event Detail Page — Venue section: name, address, neighborhood all render` (line 159) still passes because line 562's `<div class="edp-venue-neighborhood">` renders the same neighborhood string.

## (C) Singular/plural hub cannibalization

**GSC evidence:** Manual GSC pass (S131 Step 5) was not completed before this session. The `## Manual GSC findings` section of `specs/s131-google-discoverability-diagnostic.md` is still the placeholder. Per the brief's decision tree, this defaults to **the English plural convention** — keep `/concerts`, `/theatre`, `/exhibitions`, `/performances` (curated category slugs) as canonical; deprecate the singular forms.

**File 1:** `src/generate-site.ts`, around line 394–404 (type-page generation loop).
**Change:** Build a `CURATED_BARE_TYPES` set from `config/categories.json` and skip `generatePage({ type }, events)` for those types only. Time/price/genre variants continue to emit.

```ts
// Build set of types covered by a curated category with a bare {type: X} filter.
// These would otherwise duplicate Path 2's curated pages (e.g., /concert vs /concerts).
const CURATED_BARE_TYPES = new Set(
  CATEGORIES_CONFIG.categories
    .filter((c: any) => {
      const f = c.filter || {};
      return typeof f.type === 'string' && !f.genresInclude && Object.keys(f).length === 1;
    })
    .map((c: any) => c.filter.type as string)
);

for (const type of EVENT_TYPES) {
  // S132: skip bare-type page if a curated category already covers this filter
  if (!CURATED_BARE_TYPES.has(type)) {
    generatedUrls.push(await generatePage({ type }, events));
    pagesGenerated++;
  }
  for (const time of TIME_RANGES) {
    generatedUrls.push(await generatePage({ type, time }, events));
    pagesGenerated++;
  }
}
```

**File 2:** `netlify.toml` — add 301 redirects from deprecated singulars to canonical plurals.

```toml
# S132 — collapse singular/plural hub cannibalization to single canonical form
[[redirects]]
  from = "/concert"
  to   = "/concerts"
  status = 301
  force = true

[[redirects]]
  from = "/theater"
  to   = "/theatre"
  status = 301
  force = true

[[redirects]]
  from = "/exhibition"
  to   = "/exhibitions"
  status = 301
  force = true

[[redirects]]
  from = "/performance"
  to   = "/performances"
  status = 301
  force = true
```

These are minimal (4 confirmed-identical-title collisions). Other categories with bare filters (`workshop`, `cinema`, `tech`, etc.) are also skipped by the same `CURATED_BARE_TYPES` rule but don't need redirects because either (a) their titles differ enough to not cannibalize (workshop), or (b) they share the same slug (cinema — Path 2 overwrites Path 1), or (c) external linkage is implausible at 26 days domain age.

**Sitemap impact:** `src/sitemap/` reads from build outputs; removing files from `dist/` automatically removes them from the next sitemap regeneration. No sitemap code change needed.

## What does NOT change

- `src/utils/schema-geo.ts` — Wikidata-backed `containedInPlace` schema chain. Untouched.
- `config/neighborhood-geodata.json` — untouched.
- `src/generators/venue-page.ts` — venue page neighborhood display. Untouched.
- `src/generators/event-page.ts:562` — venue-section neighborhood div. Untouched.
- `src/generators/event-page.ts:176` — schema JSON-LD `containedInPlace`. Untouched.
- `/api/*` routes — untouched.
- Shared layout/chrome — untouched.

## Test gates (Step 4)

1. **Test A**: Render `renderEventDetailPage(sampleConcert, [])` → assert HTML contains no substring `href="/neighborhoods/`. Add to `src/generators/__tests__/event-page.test.ts`.
2. **Test C**: After build, dist/ contains exactly one of `{concert.html, concerts.html}`; one of `{theater.html, theatre.html}`; one of `{exhibition.html, exhibitions.html}`; one of `{performance.html, performances.html}`. Add to `tests/build/canonical-hub-forms.test.ts` (a build-output assertion test, not a unit test).

**Note:** the brief's `tests/build/canonical-hub-forms.test.ts` path doesn't exist as a directory yet — there is no top-level `tests/` directory in this repo; tests live in `src/**/__tests__/` (verified via `find tests -maxdepth 2`). Will co-locate the build-output test next to the sitemap tests at `src/sitemap/__tests__/canonical-hub-forms.test.ts`, which is the closest existing build-output test surface.

## Risk surface

- **Test C requires a prior `bun run build`** because it asserts on `dist/`. We can either (a) gate the test on dist/ presence and skip if absent, or (b) make it a post-build verification script. Choose (a) for CI portability.
- Removing `/concert.html` may briefly show 301 redirects in GSC instead of 200 — that's the intended behavior (consolidates ranking to plural).
- 4 fewer files in build → marginally faster build, no negative impact.
