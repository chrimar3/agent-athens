# Silent-Drop Trace: Branch Enumeration

**Date:** 2026-05-14
**Purpose:** Pre-instrumentation enumeration of every branch point in the build pipeline that could influence whether a target event reaches a written `dist/` file. Drives Step 3 trace-call insertion.

**Files in scope:**
- `src/generate-site.ts` — selection filters (163-223), intermediate region (223-611), EN write loop (611-629), sweep call (1066-1073)
- `src/generators/event-page.ts` — EL write loop (639-672), `renderEventDetailPage` (257-523)
- `src/generators/orphan-sweep.ts` — `sweepOrphans` body (135-211)

**Scope notes:**
- Other try/catch sites in `generate-site.ts` (lines 54-67 venue-DB, 1156-1160 aria parse, 1407-1421 IndexNow) are NOT in the event-write path; excluded from instrumentation.
- The price-type vocab validation block (180-197) throws on error, aborting the build — wouldn't cause silent drop. Excluded.
- `validateEventSchema` (event-page.ts:662) appends to results array; doesn't drop. Branch noted but trace stage is informational only.

**Critical late discovery:** `sweepOrphans` (orphan-sweep.ts:175-179) deletes event HTML files when their slug is NOT in `validEventSlugs`. This is the strongest gate candidate because `validEventSlugs` is built fresh from `pageableEvents.map(generateEventSlug)` at line 1066 — if a slug is computed differently between write-time and sweep-time (or if a target isn't in `pageableEvents` for some reason), files would be deleted post-write. Hypothesis must be tested by trace.

---

## A. Selection filters (`src/generate-site.ts`)

| ID | Line | Type | Condition | Drop? | Notes |
|---|---|---|---|---|---|
| A1 | 163-169 | `.filter()` predicate | `!status \|\| status === 'unverified'` returns false; else `PUBLISHABLE_STATUSES.includes(status)` | Yes (drop if returns false) | First selection gate. Targets all have `verified_athens` → expected pass |
| A2 | 220-223 | `.filter()` predicate | `classifyEventLifecycle(event) !== 'past-expired'` | Yes | Second selection gate; produces `pageableEvents`. Targets are future → expected pass |

## B. Intermediate region (`src/generate-site.ts:223 → 611`)

| ID | Line | Type | Description | Drop? | Notes |
|---|---|---|---|---|---|
| B1 | 243-246 | `for...of pageableEvents` | Venue image attachment; `event.venueImage = venueImg` if found | No | Mutation only. Could throw if `event.venue` is undefined |
| B2 | 253-259 | `for...of pageableEvents` | Venue website + `sameAs` attachment | No | Mutation only |
| B3 | 589 | function call | `generateEventPages(pageableEvents)` → delegates into event-page.ts:615 | Indirect | EL write path entry point |
| B4 | 596 | filter assignment | `englishEvents = pageableEvents.filter(e => e.fullDescriptionEn)` | Yes (EN only) | EN upstream filter. Targets all have `fullDescriptionEn` truthy in DB → expected pass |
| B5 | 599-601 | `if (englishEvents.length > 0)` | mkdir guard | No | Directory creation only |
| B6 | 604-609 | `for...of pageableEvents` | Build venue-grouping map for related events | No | Read/group only |

## C. EN write loop (`src/generate-site.ts:611-629`)

| ID | Line | Type | Description | Drop? | Notes |
|---|---|---|---|---|---|
| C1 | 611 | `for...of englishEvents` | Loop entry per English event | — | One iteration per event in `englishEvents` |
| C2 | 612-613 | function call | `generateEventSlug(event)`; `bilingualSlugs.add(slug)` | No | Deterministic from id+venue.name+title |
| C3 | 616-620 | filter/sort/slice | `relatedEvents` derivation | No | Read only |
| C4 | 622 | function call | `renderEventDetailPage(event, relatedEvents, 'en')` — could throw | Yes (if throws, propagates uncaught — would crash build) | NO try/catch in loop |
| C5 | 624-626 | `if (!existsSync(pageDir))` mkdirSync | Directory creation | Could throw | NO try/catch |
| C6 | 627 | function call | `writeHtmlIfChangedSync(pageDir/index.html, html)` | Could throw or no-op | NO try/catch |
| C7 | 628 | array push | `generatedUrls.push('en/events/${slug}')` | No | Tracking only |

## D. EL write loop (`src/generators/event-page.ts:639-672`)

| ID | Line | Type | Description | Drop? | Notes |
|---|---|---|---|---|---|
| D1 | 639 | `for...of events` | Loop entry per pageable event | — | One iteration per event in `pageableEvents` |
| D2 | 640-641 | function call | `generateEventSlug(event)`; `slugMap.set(event.id, slug)` | No | Deterministic |
| D3 | 644 | function call | `classifyEventLifecycle(event)` | No | UI flag only |
| D4 | 646-648 | `if (lifecycle !== 'upcoming')` | `pastEventUrls.add(urlPath)` | No | Tracking only; no drop |
| D5 | 651-655 | filter/sort/slice | Related events | No | Read only |
| D6 | 658 | function call | `renderEventDetailPage(event, relatedEvents)` (default locale='el') | Yes (if throws) | NO try/catch |
| D7 | 661-662 | function calls | `generateEventSchema(event)` then `validateEventSchema(json, urlPath)` | No (validateEventSchema appends to schemaValidationResults) | Could throw inside generateEventSchema |
| D8 | 665-667 | `if (!existsSync(pageDir))` mkdirSync | Directory creation | Could throw | NO try/catch |
| D9 | 669 | function call | `writeHtmlIfChangedSync(pageDir/index.html, html)` | Could throw or no-op | NO try/catch |
| D10 | 671 | array push | `urls.push(urlPath)` | No | Tracking only |

## E. `renderEventDetailPage` (`src/generators/event-page.ts:257-523`)

Called by both write loops with different locale args. If this throws, the surrounding loop has no try/catch — error would propagate.

| ID | Line | Type | Description | Drop? | Notes |
|---|---|---|---|---|---|
| E1 | 259 | function call | `generateEventSlug(event)` | No | Deterministic |
| E2 | 262 | function call | `generateEventSchema(event, locale)` → `buildEventSchemaObject` (144-239) | Could throw | Many internal branches; out of scope to enumerate but worth bracketing in trace |
| E3 | 263 | function call | `generatePracticalBlock(event, null, locale)` | Could throw | External function |
| E4 | 266-267 | conditionals | `isExhibition`, `exhibitionIsOpen` | No | UI flags |
| E5 | 270-271 | function call + flag | `classifyEventLifecycle(event)`, `isPast` | No | UI flag |
| E6 | 274-280 | conditionals | dateDisplay computation; `formatExhibitionDateRange` could throw | Could throw | |
| E7 | 285 | string op | `event.type.replace('_', '-')` | Could throw on non-string type | |
| E8 | 289 | function call | `formatPrice(event, locale)` | Could throw on missing price | |
| E9 | 293-295 | locale gate | `descriptionSource = locale === 'en' ? event.fullDescriptionEn : (event.fullDescriptionGr \|\| event.fullDescription)` | No | Could be undefined |
| E10 | 296 | conditional | `hasFullDescription = descriptionSource && descriptionSource.length > 100` | No | Truthiness gate |
| E11 | 298 | conditional | `isEnglishFallback = locale === 'el' && !event.hasNativeGreek && Boolean(event.fullDescriptionEn)` | No | UI banner flag |
| E12 | 301-308 | `if (hasFullDescription) {} else {}` | descriptionHtml branch | No | Else branch uses `<p>${event.description}</p>` — could render `<p>undefined</p>` |
| **E13** | **311-312** | **assignment + .length access** | **`descriptionText = hasFullDescription ? String(descriptionSource) : event.description`; `needsReadMore = descriptionText.length > 400`** | **Could throw** | **CRITICAL: throws TypeError if `event.description` is undefined/null AND hasFullDescription is false. Strong candidate for silent crash inside renderEventDetailPage** |
| E14 | 322-323 | function call | `resolveCtaForEvent(event, t)` | Could throw | External function |
| E15 | 325-338 | ternary chain | ctaHtml + inlineCtaHtml branches | No | UI |
| E16 | 341-349 | conditionals | mapsUrl, sourceHtml branches | No | UI |
| E17 | 352-360 | conditional | relatedHtml ternary | No | UI |
| E18 | 364-374 | conditional | mobileBarHtml ternary | No | UI |
| E19 | 379-384 | conditional | hreflang ternary on `Boolean(event.fullDescriptionEn)` | No | UI |
| E20 | 398 | conditional | noindex meta on `isPast` | No | UI |
| E21 | 462-469 | IIFE | renderActionBarHtml + escapeAttr calls | Could throw | |

## F. `sweepOrphans` (`src/generators/orphan-sweep.ts:135-211`)

Called once per build at `generate-site.ts:1068`. If any TRACE_ID's slug is not in `validEventSlugs`, its file gets deleted — silent drop with no error.

| ID | Line | Type | Description | Drop? | Notes |
|---|---|---|---|---|---|
| F0 | gen-site:1066 | Set construction | `validEventSlugs = new Set(pageableEvents.map(generateEventSlug))` | — | Pre-trace: log whether each TRACE_ID's slug ends up in this set |
| F1 | 146 | `for...of walk(...)` | Iterate every file in dist/ | — | Path-keyed, not event-keyed |
| F2 | 147-152 | filter | `isHtml \|\| isApiJson` else `continue` | No | |
| F3 | 154 | function call | `extractEventSlugFromPath(distDir, path)` | No | Returns slug for event-html paths |
| F4 | 156-159 | `if (event-html)` | `if (validEventSlugs.has(slug)) continue; else eventOrphans.push(path)` | Yes (queues for delete) | THE GATE for surviving files |
| F5 | 162-163 | `if (event-json && in valid set)` | continue | No | API JSON kept |
| F6 | 167 | mtime check | `if (mtimeMs >= buildStartTime) continue` | No (only if armed) | |
| F7 | 175-179 | `for (path of eventOrphans)` | `unlinkSync(path)` — DELETE | **Yes — silent delete** | UNCONDITIONAL ARM (no env gate) |
| F8 | 181-187 | armed mtime delete | `if (armNonEvent) for ... unlinkSync` | Yes | Gated by SWEEP_ORPHANS=1; should be off in trace run |
| F9 | 189-196 | rmdirSync sweep | Removes empty parent dirs | No | After-effect of delete |

---

## Trace stage naming map

For Step 3 (`traceIfTarget` insertion). Each row maps an enumeration ID to a stage string and what data to capture.

| Enumeration ID | Stage string | Capture data |
|---|---|---|
| A1 | `select:filter-location_status` | `{location_status, branch_taken}` |
| A2 | `select:filter-lifecycle` | `{lifecycle, branch_taken}` |
| (post A2) | `select:pageable-included` | `{enrichment_tier, has_el_short, has_el_full, has_en, language_preference, needs_enrichment, enriched_at, image_local}` |
| B1 | `intermediate:venue-image-attach` | `{venue_image, has_venue_image_now}` |
| B2 | `intermediate:venue-website-attach` | `{venue_website, sameas_count}` |
| B4 | `en:filter-fullDescriptionEn` | `{full_description_en_truthy, branch_taken}` |
| C1 | `loop:en:enter-iteration` | `{slug}` |
| C4-pre | `render:en:pre-call` | `{slug, has_en_text}` |
| C4-post | `render:en:post-call` | `{slug, html_length}` |
| C5-pre | `write:en:mkdir-pre` | `{page_dir}` |
| C6-pre | `write:en:writeHtml-pre` | `{file_path, html_length}` |
| C6-post | `write:en:writeHtml-post` | `{file_path, succeeded: true}` |
| D1 | `loop:el:enter-iteration` | `{slug}` |
| D6-pre | `render:el:pre-call` | `{slug, has_el_text}` |
| D6-post | `render:el:post-call` | `{slug, html_length}` |
| D7 | `validate:el:schema-result` | `{schema_status, has_errors}` |
| D8-pre | `write:el:mkdir-pre` | `{page_dir}` |
| D9-pre | `write:el:writeHtml-pre` | `{file_path, html_length}` |
| D9-post | `write:el:writeHtml-post` | `{file_path, succeeded: true}` |
| E2-pre | `render:schema-build-pre` | `{locale}` |
| E2-post | `render:schema-build-post` | `{locale, schema_size}` |
| E3 | `render:practical-block-post` | `{locale}` |
| E9 | `render:descriptionSource-selected` | `{locale, description_source_truthy, description_source_length}` |
| E10 | `render:hasFullDescription-decision` | `{has_full_description, description_source_length}` |
| E12 | `render:descriptionHtml-branch` | `{branch_taken: 'full' \| 'fallback', event_description_truthy}` |
| **E13** | **`render:descriptionText-length-access`** | **`{description_text_truthy, description_text_type, length_access_safe}`** — capture BEFORE the .length call |
| E14 | `render:cta-resolved` | `{cta_kind}` |
| F0 | `sweep:validEventSlugs-built` | `{computed_slug, in_set, pageable_count}` — for each TRACE_ID |
| F4-keep | `sweep:slug-in-valid-set` | `{path, slug}` |
| F4-orphan | `sweep:slug-not-in-valid-set-DELETING` | `{path, slug, validset_size}` |
| F7-pre | `sweep:delete-pre` | `{path, slug}` |
| F7-post | `sweep:delete-post` | `{path}` |

---

## Open questions for trace to answer

1. **Does Verdi's slug end up in `validEventSlugs`?** If NO → upstream selection bug (despite location + lifecycle passing, something between line 223 and 1066 removes it from `pageableEvents` or its derivative). If YES → drop is at write-time, not sweep-time.

2. **Does Verdi enter the EL loop iteration at all?** D1 trace tells us. If no → drop is between line 223 and 639. If yes → drop is in render or write.

3. **Does Verdi enter the EN loop iteration?** C1 trace. Targets have `has_en=yes`, so should pass B4. If no → B4 filter dropped them despite DB saying they have fullDescriptionEn (mapper-side drop?).

4. **Does `renderEventDetailPage` throw on Verdi?** If E13 trace fires but no E14 trace fires, line 311-312 throws. With no try/catch in loops, this would crash the build — UNLESS something upstream IS catching. Verify build outcome: if build succeeds without targets in dist/ AND render throws, there's hidden error suppression somewhere.

5. **Does sweep delete Verdi's file?** F4-orphan + F7 trace tell us. If yes → file IS written but swept; bug is in `validEventSlugs` construction.

6. **Does the EL/EN write succeed (write:*:post)?** If post-trace fires but file is missing from dist post-build → sweep deleted it.

---

## Files to instrument in Step 3

- `src/generate-site.ts` — A1, A2, B1, B2, B4, C1, C4, C5, C6, F0
- `src/generators/event-page.ts` — D1, D6, D7, D8, D9, E2, E3, E9, E10, E12, E13, E14
- `src/generators/orphan-sweep.ts` — F4, F7

⚠️ **Step 6 revert must include `src/generators/orphan-sweep.ts`** — the original plan listed only generate-site.ts and event-page.ts. Adding a third file changes the stash command.
