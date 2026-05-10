# Imageless Events Diagnostic — 2026-05-08

Read-only diagnostic. No code changes. Numbers below are traced to queries against `data/events.db` and to source code at `src/generators/event-page.ts` + `src/generators/og-image.ts`.

## Numbers

- Total events visible on site (`location_status IN ('verified_athens','pass_through')` + future or running by exhibition end_date): **397**
- Imageless events (visible scope): **144** (36.3%)
- All-time imageless in DB (no date filter): 727 (context only — not the relevant denominator for site impact)

### By source

```
source           total  imageless  pct
athinorama.gr    138    127        92.0
onassis            7      7       100.0
residentadvisor  112      5         4.5
more.com          57      1         1.8
manual             1      1       100.0
halfnote          11      1         9.1
clubber.gr        10      1        10.0
benaki             1      1       100.0
ticketservices    23      0         0.0
snfcc              1      0         0.0
megaron.gr        35      0         0.0
greeksin.ai        1      0         0.0
```

athinorama.gr accounts for 127 / 144 = **88.2%** of imageless events. Per the >60% rule, this is the extraction-bug suspect.

### By type

```
type         total  imageless  pct
exhibition     9      8        88.9
festival       9      5        55.6
concert      232    122        52.6
performance    2      1        50.0
dj_set       124      8         6.5
theater       15      0         0.0
tech / show / cinema  small / 0%
```

Exhibition rate of 88.9% (sample of 9) confirms and exceeds the Sprint 2 D 63% pass-rate hypothesis. Concert volume (122 imageless) drives most of the absolute count and overlaps with the athinorama.gr concentration.

## Schema.org image field state

Sample imageless event: `id=665995ddf26a5ceb`, title `Δημήτρης Κόψης`, type `concert`, source `athinorama.gr`. Page at `dist/events/665995dd-exa-/index.html`.

JSON-LD `image` field state: **present**, value is a Satori-generated path:

```
"image": "https://agentathens.com/images/og/events/665995dd-exa-.png"
```

`og:image` meta tag carries the same URL with `og:image:width=1200`, `og:image:height=630`. The PNG file exists at the referenced location (15.7 KB).

## D11 OG image plumbing

- D11-generated OG images used in Schema.org `image` field: **YES** (`event-page.ts:295`)
- D11-generated OG images used in `og:image` / `twitter:image` meta: **YES** (`event-page.ts:480`, `event-page.ts:490`)
- D11-generated OG images used as detail-page hero background: **YES** (`event-page.ts:514`)
- D11-generated OG images used in card grid thumbnail: **NO** (`event-page.ts:625` uses `imageLocal || imageUrl || venueImage` only — no Satori fallback)

File paths where image is emitted in source:
- `src/generators/event-page.ts:295` (Schema.org `image`)
- `src/generators/event-page.ts:480` (`og:image` meta)
- `src/generators/event-page.ts:490` (`twitter:image` meta)
- `src/generators/event-page.ts:514` (hero background-image)
- `src/generators/event-page.ts:625-630` (card grid `imgSrc` — no Satori fallback)

Fallback chain in `getOgImage()` at `event-page.ts:121-135`: imageLocal → imageUrl → venueImage → `/images/og/events/{slug}.png`. Always returns a non-empty string, so `schema.image` is always set.

### Coverage check (systemic)

- Imageless events visible on site: **144**
- D11-generated OG image files present in `dist/images/og/events/` matching imageless event id-prefixes: **144**
- Coverage: **144 / 144 = 100%**
- Total OG files in `dist/images/og/events/`: 1017 (includes orphans from past events / events that gained photos — storage drift, not a coverage gap)
- Cache `dist/.og-cache.json`: 515 active entries (keyed by computed slug)

**Decision rule outcome:** N ≈ 144 → D11 fully covers. The gap is purely visible-UI in the card grid, plus a separate question about whether typographic OG images are an acceptable permanent strategy for SEO.

## Worst-source sample (5 events for manual verification)

Source: **athinorama.gr**

| id | title | source URL |
|---|---|---|
| 0c4f0132673b3287 | Jozef van Wissem | https://www.athinorama.gr/music/gig/jozef_van_wissem-10064104/ |
| d736bfd6c8025deb | Βασίλης Λέκκας | https://www.athinorama.gr/music/gig/basilis_lekkas-10069914/ |
| 08f57a30942b0592 | Phantomimes | https://www.athinorama.gr/music/gig/phantomimes-10089839/ |
| 1acf31d52bb93afa | Jesse Davis Quartet | https://www.athinorama.gr/music/gig/jesse_davis_quartet-10067504/ |
| b69432e41e57458e | Rio &amp; Kako | https://www.athinorama.gr/music/gig/rio_kai_kako-10089838/ |

To be filled in by Christos: extraction bug / source gap / mixed.

## Open questions for other projects

### For GEO Strategist

1. Schema.org `image` is recommended (not mandatory). Given current imageless count of 144 visible events (36.3% of the visible site), what is the citation impact estimate?
2. D11-generated Satori OG images are already used as the Schema.org `image` value (`event-page.ts:295`). Is this an acceptable permanent strategy, or should it be considered technical debt to be replaced with a photo-based fallback (e.g. venue photos, source-page hero images)?
3. Does the exhibition imageless rate of 88.9% (vs theater/dj_set at 0–6%) confirm the Sprint 2 D pass-rate anomaly hypothesis, and is the 9-event sample sufficient to act on?

### For Design Navigator

1. What is the current visible fallback when `image_url` is empty in the card grid — type-color block, blank, placeholder, or generated OG? (`event-page.ts:625-630` shows cards do NOT fall back to the Satori OG; only the detail-page hero does.)
2. Would D11 generated OG images work as a visible card thumbnail fallback, or is that visually inappropriate for in-app use (vs social sharing)?
3. Is a venue-photo fallback library worth the curation cost, or is a stylized placeholder sufficient?

### For Editorial Director (only if Design Navigator wants venue-photo fallback)

1. Is curating a venue-photo library in scope?

## Recommendation (Dev Planner only — pipeline view)

D11 plumbing is healthy and SEO-complete: 100% Satori coverage in JSON-LD, og:image, twitter:image, and detail-page hero. Two pipeline-side levers exist independent of the strategic decisions: (1) athinorama.gr extraction concentration (88.2% of imageless) — Christos's manual check of the 5 sampled URLs determines whether this is a scraper bug worth fixing for absolute-count reduction; (2) the card-grid render at `event-page.ts:625-630` could be wired to Satori as a Design Navigator-decided fallback if visually appropriate. Both are tractable but should wait on the cross-project answers above.
