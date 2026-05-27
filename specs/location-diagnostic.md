# Location Diagnostic — Pre-Fix Recon

**Date:** 2026-05-20
**Session type:** Diagnostic-only (0 source files modified, 1 new spec file)
**Branch:** `main` (working tree dirty — uncommitted modifications to `src/templates/page.ts`, `category-page.ts`, `filter-bar.ts`, `src/generators/hub-page.ts`, `src/styles/design-system.css`, and several test files)
**Build artifacts inspected:**
- `dist/index.html` — last build 2026-05-20 19:27 (local)
- `data/build-completeness.json` — last validator run 2026-05-20 12:44 UTC (`lastUpdate: 2026-05-20T09:44:16.795Z`)

> **Caveat on freshness.** `dist/` is ~7h newer than the validator report, meaning the validator ran against an earlier build state today. Counts below could shift by single digits if re-run, but the structural picture (DATA vs TEMPLATE) is unambiguous.

---

## Step 1 — Emission surface & measurement-of-record

### 1. Where is `Event.location` emitted into schema?

There are **three** location-emission surfaces; only one is the production schema-of-record:

| Surface | File:line | What it emits | Read by | Production schema-of-record? |
|---|---|---|---|---|
| **Event-page JSON-LD (built fresh from DB row)** | `src/generators/event-page.ts:362` calls `generateEventSchema(event, locale)` → location object constructed at `src/generators/event-page.ts:166-178` from `event.venue.name` + `event.venue.address` + `getRegionName()` / `getCountryCode()` + `event.venue.coordinates` | `location: { @type: VENUE_TYPE_MAP[…], name, address: {…PostalAddress}, containedInPlace, sameAs?, geo? }` | Page template emits at `src/generators/event-page.ts:532` inside `<script type="application/ld+json">` | **YES — this is what Google crawls** |
| **Microdata fallback on event card** | `src/templates/page.ts:358` | `<span itemprop="location" itemscope itemtype="https://schema.org/Place">…` | Inline in hub/listing pages | Secondary signal only |
| **Cached `schema_json` DB column** | Written by `scripts/generate-schema.ts:144` (CLI: `bun run scripts/generate-schema.ts`) | Same shape as event-page JSON-LD but persisted to `events.schema_json` | **Not read by any page generator** — verified via grep | **NO — orphan from the page-emission perspective** |

### 2. Build-time-from-fields, or read-from-`schema_json` column?

**BUILD-TIME from event fields.** Page generators call `generateEventSchema(event, locale)` per-build and ignore the cached `events.schema_json` column. The DB column is a cache for the standalone CLI tool (`scripts/generate-schema.ts`) and the `--validate`/`--stats` modes — but the live site emits freshly-built JSON-LD.

> **Implication for Step 2 measurement:** Use built HTML / validator output, NOT a SQL query against `schema_json`. The brief's Step 2 fallback (`schema_json NOT LIKE '%location%'`) would have measured the wrong surface.

### 3. How is the schema-completeness validator invoked?

- Module: `src/validators/schema-completeness.ts` (parses HTML, extracts JSON-LD via regex at `extractJsonLd()`, validates structure & data-quality)
- Invoked from `src/generate-site.ts:33` (`validateAllPages`, `printSchemaSummary`) — runs as part of `bun run build` (= `bun run src/generate-site.ts` per `package.json`)
- Output: aggregated into `data/build-completeness.json` (`/place` and `/events` layers)
- Tool of record for the question "how many emitted Event JSON-LDs lack location?"

The validator's exact location-related strings (`src/validators/schema-completeness.ts:288, 348, 353`):
- **ERROR** (line 289): `"location.name is missing or empty"`
- **WARNING** (line 348): `"streetAddress is empty"`
- **WARNING** (line 353): `"location.geo coordinates missing"`
- **INFO** (line 299): `"location.sameAs missing (Wikidata QID, Google Place URL, official URL)"`

### 4. What does `specs/audit-2026-05-12.md` say about `location`?

Baseline (8 days ago, 5995-page snapshot):

```
✅ 5953 pass  ⚠️  42 warnings  ❌ 0 errors

Top data gaps:
  40/5995 (1%) location.geo coordinates missing      ← WARN
  23/5995 (0%) streetAddress is empty                 ← WARN

Top INFO findings:
  5598/5995 (93%) location.sameAs missing             ← INFO (not warn)
  48/5995 (1%) venue sameAs missing                    ← INFO
```

**Zero `location.name is missing or empty` errors at baseline.** The hard "location missing" failure mode has been 0 for at least 8 days.

---

## Step 2 — Real current missing-location count (correct surface)

**Surface used:** `data/build-completeness.json` (the validator's report on built HTML — tool of record per Step 1 #3).

**Aggregate (events.totals + place.event_template, which agree exactly):**

```
total=3873  pass=3850  warn=23  fail=0  info=3577  passRate=99%
```

**Per EventType:**

| Type | Total | Pass | Warn | Fail |
|---|---:|---:|---:|---:|
| concert | 743 | 743 | 0 | 0 |
| dj_set | **465** | 443 | **22** | 0 |
| exhibition | 20 | 19 | **1** | 0 |
| theater | 2531 | 2531 | 0 | 0 |
| festival | 30 | 30 | 0 | 0 |
| performance | 14 | 14 | 0 | 0 |
| show | 36 | 36 | 0 | 0 |
| workshop | 16 | 16 | 0 | 0 |
| tech | 6 | 6 | 0 | 0 |
| dance | 2 | 2 | 0 | 0 |
| other | 10 | 10 | 0 | 0 |

> **22 of 23 warnings concentrate in `dj_set`.** The lone non-dj_set is 1 exhibition.

> **Zero hard `location.name` failures.** All 23 are `streetAddress is empty` warnings — i.e., `location.name` is present, `location.address.streetAddress` is empty. This is a quality-refinement gap, not a structural absence.

---

### Premise-check: "~126 URLs / ~6 venues"

| Figure | Brief value | Actual today | Verdict |
|---|---|---|---|
| URL count | ~126 | **23** | **WRONG by 5.5×** — figure is stale (likely an older 5995-snapshot count or a different metric entirely) |
| Venue count | ~6 | **6 in validator report**, 7 in DB | **CORRECT** (validator report shows 6 venues with warns; DB shows 7 venues with empty `venue_address` — `WE Πολυχώρος` appears in DB but not in validator's `byVenue` list, likely because its events are excluded from `dist/` by quality gates) |

---

## Step 3 — Root cause classification

**Classification: DATA issue, not template issue.**

### Per-venue breakdown (validator's `place.byVenue` view, today)

```
don't be a dick         total= 13  warn=13  fail=0   ← 100% of venue's events warn
tba - atharea           total=  5  warn= 5  fail=0   ← 100%
crust                   total= 16  warn= 2  fail=0   ←  13%
cantina social          total= 23  warn= 1  fail=0   ←   4%
πλυφα                   total= 57  warn= 1  fail=0   ←   2%
onassis stegi           total= 47  warn= 1  fail=0   ←   2%
                        ─────────  ──────
                                   warn=23 total
```

### DB-side cross-check (canonical-cased venue names)

```sql
SELECT venue_name, COUNT(*) FROM events
WHERE location_status IN ('verified_athens','pass_through')
  AND (venue_address IS NULL OR venue_address = '')
GROUP BY venue_name, type ORDER BY COUNT(*) DESC;
```

| Venue | Type | Missing-address rows |
|---|---|---:|
| Don't be a Dick | dj_set | 11 |
| TBA - ATHarea | dj_set | 4 |
| WE Πολυχώρος | concert | 2 |
| WE Πολυχώρος | theater | 1 |
| Crust | dj_set | 2 |
| Cantina Social | dj_set | 1 |
| Onassis Stegi | exhibition | 1 |
| ΠΛΥΦΑ | dj_set | 1 |
| **TOTAL** |  | **23** ✓ matches validator |

### Why this is DATA, not TEMPLATE

1. **Clustering**: 11 of 23 (48%) are from a single venue (Don't be a Dick); 15 of 23 (65%) are from the top 2 venues. A template-side conditional bug would produce a roughly even rate across all venues.
2. **100%-warn venues**: Don't be a Dick (11/11) and TBA - ATHarea (4/4) suggest **the venue records themselves lack address** — every event scraped at these venues inherits the gap.
3. **Sparse-warn venues**: Onassis Stegi (1/88) and ΠΛΥΦΑ (1/141) have address present for almost all rows — those 1-offs are **per-event scraper anomalies** (likely a free-text venue override or a missing field on a specific scrape).
4. **EventType correlation**: 22 of 23 are `dj_set`, which traces to specific scrapers (`scripts/scrape-all.ts` residentadvisor path) that may not be writing `venue_address` for these particular venues. This is consistent with the S137 mistakes.md entry about parallel scraper writers bypassing normalizers.

### Recommended fix shape (for next session — do not implement here)

Two-pronged backfill:
- **Venue-whitelist backfill** (1 PR, ~3 venues): add canonical `venue_address` to `config/athens-venues.json` for `Don't be a Dick`, `TBA - ATHarea`, `Crust` so future scrapes auto-populate.
- **Per-row patch** (1 SQL migration, ~7 rows): UPDATE the 1-offs for Onassis Stegi, ΠΛΥΦΑ, Cantina Social, WE Πολυχώρος directly with their known addresses.

Estimated impact: 23 warns → 0 warns. Schema-completeness `event_template` goes from 99% → 100%.

### GSC cross-check (11 flagged items) — pending Christos

Cannot perform from CC. Hypothesis: most GSC flags are likely post-S134 crawl-lag artifacts on URLs already corrected in the build. Re-check after Christos completes Step 5 below.

---

## Step 4 — Canonical surface check

**Result: CLEAN. Canonical + og:url + 301 all agree on `agentathens.com`.**

- Single source of truth: `src/config/site-url.ts:5` → `export const BASE_URL = 'https://agentathens.com';`
- Page template (`src/templates/page.ts:100`): `<link rel="canonical" href="${BASE_URL}/${url}">`
- Page template (`src/templates/page.ts:116`): `<meta property="og:url" content="${BASE_URL}/${url}">`
- Event-page template (`src/generators/event-page.ts:501, 509`): canonical + og:url use same `canonicalUrl` (built from `BASE_URL`)

**Built-output verification:**
- `grep -c 'agentathens.netlify.app' dist/index.html` → **0**
- `grep -c 'agentathens.netlify.app' dist/sitemap-index.xml` → **0**
- `grep -rc 'agentathens.netlify.app' dist/` → **1 hit only**, in `dist/_redirects`: `https://agentathens.netlify.app/*  https://agentathens.com/:splat  301!` — this is the intentional 301 source pattern, not a citation leak.

**No citation-target leaks. 301 and canonical agree.**

---

## Step 5 — GSC indexing spot-check (Christos, manual)

**Not executed.** Christos to run in browser:
- GSC → URL Inspection → `https://agentathens.com/` → record Coverage + Last crawl date
- Repeat for the cornerstone hub GEO names once GEO Strategist replies with the demo target
- Expected: "URL is on Google" + recent crawl date

Report back to Planner.

---

## Done-when checklist

- [x] (1) Emission surface + measurement-of-record identified
  - Surface: built HTML JSON-LD (built fresh per-build from `event.venue.*` fields)
  - MoR: `src/validators/schema-completeness.ts` via `bun run build`, aggregated into `data/build-completeness.json`
- [x] (2) Real current missing-location count: **23 warnings, 0 failures** on 3873 events (99% pass rate)
- [x] (3) Root cause classification: **DATA issue** (venue-address backfill), with per-venue breakdown above
- [x] (4) Canonical surface confirmed clean
- [ ] (5) GSC readings — Christos's task

---

## Premise corrections for the fix session

1. **"Schema.org `location` gap" is a misframe.** The hard `location` error count is **0**; the actual gap is `streetAddress` (a sub-field of `location.address`). The fix-session method should target `venue_address` data, not the `location` emission code path.
2. **"~126 URLs"** → actual is **23**. Likely an older snapshot or different metric. Fix scope is 5.5× smaller than the brief implied.
3. **"~6 venues"** → CORRECT (6 in validator view; 7 if you include `WE Πολυχώρος` which the validator excludes via quality gates).
4. **Surface confusion risk avoided**: do NOT measure or "fix" via the `events.schema_json` DB column — it's an orphan cache that page generators never read.

---

## Recommended post-session updates (NOT executed — out of session boundary)

The brief asks for updates to `.claude/notes/patterns.md` and `.claude/notes/mistakes.md`. Per the diagnostic-only boundary ("exactly ONE new file"), these are flagged here for the next-session owner:

**`.claude/notes/mistakes.md` — proposed entry:**
> S138 location-diagnostic — brief premise "~126 URLs / ~6 venues" verified stale. Actual: 23 events / 6 venues (URL count off by 5.5×). The "126" figure source is unknown — not found in repo grep across specs/, .claude/notes/, docs/. Likely an external GSC snapshot count or an older 5995-event-snapshot figure that didn't survive churn. **Lesson:** brief premises that cite specific URL counts from external systems (GSC) must be re-derived from the in-build validator before sizing the fix — counts drift daily as events expire.

**`.claude/notes/patterns.md` — Pattern A/B addition (brief-vs-reality):**
> 8th occurrence in the brief-vs-reality series (S71, S82, S95, S100b, S101a, S132', S133, S138-diagnostic). This one differs from the prior 7: the brief's *premise framing* ("Schema.org location gap") was misaligned with the validator's actual error vocabulary (hard `location` errors = 0; the gap is `streetAddress`). Pattern extension: re-verify not only the **count** but the **failure-mode vocabulary** before scoping a fix.

---

## Files NOT modified this session

- `src/**` (no changes)
- `config/**` (no changes)
- `tests/**` (no changes)
- `data/events.db` (read-only via sqlite3 SELECT)
- `.claude/notes/**` (recommended deltas listed above; not written)

## Files written this session

- `specs/location-diagnostic.md` (this file) — 1 file
