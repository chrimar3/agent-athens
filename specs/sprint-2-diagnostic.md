# Sprint 2 Diagnostic — Pre-Implementation Verification

**Date:** 2026-05-02
**Author:** Dev Planner (diagnostic, no implementation)
**Purpose:** Verify Sprint 2 brief assumptions against actual repo state. Output drives Sprint 2 sequencing, Component E disposition, and any pre-Sprint-2 cleanup sessions.
**Method:** Same diagnostic-first protocol as Sprint 1 (compressed 7 sessions to 4). Read-only, except Step 8 (build) which is required to baseline schema completeness.

---

## 🚨 Headline findings

1. **Sprint 1 gap surfaces (§1, §2):** `ticket_url_resolved` column **does NOT exist** in `events`. Only `ticket_url`, `ticket_url_status`, `ticket_url_resolved_at` (timestamp), `ticket_url_source` exist. **No emitter code references `ticket_url_resolved` either.** The Sprint 1 amendment that the brief assumes shipped (resolved-URL column + offers.url emit logic) was not landed. Pre-Sprint-2 cleanup session required.
2. **Step 9 sizing materially diverges from brief estimate:** real venue_direct_only count is **33** events (megaron 26 + onassis 7 + benaki 0), not "~1". Aggregator count **64** (athinorama 53 + clubber 11), not "~80". Component B sizing must adjust upward; Component E (resolver) sizing slightly downward.
3. **Schema completeness baseline holds at 97%** (8039/8278 valid, 0 errors, 239 warnings). No Sprint 1 closeout regression.
4. **Component E disposition recommendation: (A) new launchd plist** — fits existing pattern (5 plists today, all `daily-automated.sh <mode>` invocations). Netlify scheduled functions not configured; would be greenfield infra.

---

## 1. `ticket_url_resolved` column status (Step 1)

**Finding: GAP. The column does not exist.**

Actual `ticket_url*` columns in `events`:

| col # | name | type | notnull | default |
|------|------|------|---------|---------|
| 49 | `ticket_url` | TEXT | 0 | — |
| 50 | `ticket_url_status` | TEXT | 0 | — |
| 59 | `ticket_url_resolved_at` | TEXT | 0 | — *(ISO8601 timestamp)* |
| 60 | `ticket_url_source` | TEXT | 0 | — |

`ticket_url_resolved_at` is a **timestamp** (column purpose per migration 006 comment: "ISO8601 timestamp of last successful resolution"), **not** a column storing the resolved URL. The brief's contract dependency assumes a column that holds the canonical resolved URL string — that does not exist.

**Migration trail:** migration 006 (`006-ticket-url-audit.sql`) added `ticket_url_status`, `ticket_url_resolved_at`, `ticket_url_source`. Migration 008 (latest, `008-genres-check-constraint.sql`) adds genres CHECK constraint, NOT a resolved-URL column. No newer migration on `src/db/migrations/`.

**Disposition:** Pre-Sprint-2 cleanup session required.
- Add migration `009-ticket-url-resolved.sql` with `ALTER TABLE events ADD COLUMN ticket_url_resolved TEXT;` and an index if needed.
- This is a Sprint 1 closeout fix, not a Sprint 2 deliverable. Sprint 2 cannot start its emitter integration (Step 2) without it.

---

## 2. Emitter integration with `ticket_url_resolved` (Step 2)

**Finding: GAP. No emitter code references `ticket_url_resolved`.**

```
$ grep -rn "ticket_url_resolved" src/
src/db/migrations/008-genres-check-constraint.sql:102: ticket_url_resolved_at TEXT,
src/db/migrations/008-genres-check-constraint.sql:138: CREATE INDEX idx_ticket_url_resolved_at ...
src/db/migrations/006-ticket-url-audit.sql:8:  -- ticket_url_resolved_at : ISO8601 timestamp of last successful resolution.
src/db/migrations/006-ticket-url-audit.sql:33: ALTER TABLE events ADD COLUMN ticket_url_resolved_at TEXT;
src/db/migrations/006-ticket-url-audit.sql:36: CREATE INDEX IF NOT EXISTS idx_ticket_url_resolved_at ...
```

All references are to `ticket_url_resolved_at` (the timestamp column), inside migration files only. Nothing in `src/generators/event-page.ts`, `src/templates/page.ts`, or `src/utils/`.

**Per the 2026-04-29 decision** (when `ticket_url_resolved` exists AND points to a `known_merchant`, emit as `offers.url`; otherwise omit), the emitter logic also has not been written.

**Disposition:** Folded into the same pre-Sprint-2 cleanup session as §1. Together they form a single coherent change: column + emit logic + tests for the resolved-URL contract.

---

## 3. Config schema extensibility for sameAs fields (Step 3)

**Finding: Schema is extensible. No validators block field addition.**

Current per-venue shape in `config/athens-venues.json` (v1.2, 2026-04-24):

```json
{
  "canonical_name": "Μέγαρο Μουσικής Αθηνών",
  "variations": [...],
  "neighborhood": "Ilisia",
  "website": "https://www.megaron.gr",
  "ticketing": {
    "provider": "megaron.gr",
    "search_pattern": "..."
  }
}
```

**Fields NOT present per-venue:** `wikidata_qid`, `google_place_id`, `official_url`, `sameAs`. Only `website` exists today.

**Schema validators:** None on `athens-venues.json`. The file is read directly by venue-page.ts and other consumers; no Zod/Ajv schema gates additions. Adding `wikidata_qid`, `google_place_id`, `sameAs` (array) etc. is safe — silently ignored by older readers, picked up by Sprint 2 emitter changes.

**Existing sameAs infrastructure (sibling, not blocker):** `config/performer-sameAs.json` (separate file, v1) maps performer names to `sameAs` arrays with Wikidata/Wikipedia/MusicBrainz URIs. Generated by `scripts/lookup-performer-sameAs.ts`. **Pattern to mirror for venues:** consider whether venue sameAs should live as inline fields on `athens-venues.json` entries, or in a separate `config/venue-sameAs.json` parallel to the performer file. Inline is simpler; separate is more cache-friendly and keeps venue config human-editable. Sprint 2 implementation choice.

**Disposition:** Component A (sameAs on venues) is unblocked. Decide inline-vs-separate as a Sprint 2 design choice, but no infrastructure work needed first.

---

## 4. Current venue Place schema shape (Step 4)

**Finding: Venue pages emit `LocalBusiness`, not `Place`. Already include nested `containedInPlace` with Wikidata sameAs at the geographical-region level. Venue itself does NOT have `sameAs`.**

`src/generators/venue-page.ts` (387 lines), key emission (lines 64–95):

```typescript
{
  '@type': 'LocalBusiness',
  '@type': 'PostalAddress',         // address sub-block
  'containedInPlace': buildContainedInPlace(venue.neighborhood),
  geo: { '@type': 'GeoCoordinates', latitude, longitude }   // when real coords
}
```

Sample dist output (`dist/venues/171-187/index.html` — Olympia Maria Callas Theatre):

```json
{
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  "name": "Ολύμπια - ...",
  "address": { "@type": "PostalAddress", ... },
  "url": "https://agentathens.com/venues/171-187/",
  "containedInPlace": {
    "@type": "Place",
    "name": "Municipality of Athens",
    "sameAs": "https://www.wikidata.org/wiki/Q1524",
    "geo": { ... },
    "containedInPlace": {
      "@type": "Place",
      "name": "Attica",
      "sameAs": "https://www.wikidata.org/wiki/Q178517",
      ...
    }
  }
}
```

**Observations:**
- `containedInPlace` already uses `sameAs` for the geographical region (Municipality → Attica → Greece, all Wikidata QIDs). The pattern is established at the region level.
- The **venue itself** has no `sameAs`. Component A's job is to add a top-level `sameAs` array drawing from new per-venue config fields.
- Top-level type is `LocalBusiness`, not `Place`. Component B (Place dual-type for venue_direct_only) needs to either:
  - Switch the emit `@type` to `["LocalBusiness", "Place"]` for venue_direct_only venues, or
  - Switch to `Place` and rely on subtype semantics. (LocalBusiness is a subtype of Place.)
- 55 venue pages exist in `dist/venues/`. `Megaron` does NOT currently have a venue page (search returned no match) — though it has 26 events. This is a separate finding (likely slug-mapping issue) but not blocking Sprint 2.

**Disposition:** Component A unblocked, Component B mostly unblocked. The dual-type sub-decision (which two types to emit) is Sprint 2 implementer's call but needs to align with the dual-type seller pattern (§11) — same syntactic shape (`@type` as array).

---

## 5. DataFeed-shaped surfaces today (Step 5)

**Finding: `dist/api/index.json` exists (61 KB, 1106 lines) — top-level all-events JSON. Custom-shaped, NOT DataFeed-compliant.**

Current shape (top-level wrapper):
```json
{
  "filters": {},
  "events": [
    { "@context": "https://schema.org", "@type": "ExhibitionEvent", "id": "...", "title": "...", ... },
    ...
  ]
}
```

Per-event entries DO have `@context` + event-type-specific `@type` (ExhibitionEvent, MusicEvent, etc.). But the wrapper is a custom `{filters, events}` shape, not `{ "@type": "DataFeed", "dataFeedElement": [...] }`.

**Additional: hundreds of category-filtered JSONs in `dist/api/`** (e.g., `concert.json`, `ballet-performance.json`, `ai-tech-this-month.json` etc.). Same `{filters, events}` shape.

**Existing alternate-link pattern (`src/templates/page.ts:127`):**
```html
<link rel="alternate" type="application/json" href="/api/${url}.json">
```
Each category HTML page already references its sibling JSON. **Homepage equivalent does not appear to exist** (no top-level alternate link pointing to `/api/index.json`).

**Sprint 2 implications:**
- Producing a DataFeed-shaped surface needs either:
  - **(i) Add a NEW file** `dist/api/datafeed.json` with proper `{ "@context": "https://schema.org", "@type": "DataFeed", "dataFeedElement": [...] }` wrapper. Existing `index.json` stays for current consumers (no BC break).
  - **(ii) Reshape `index.json`** to be DataFeed-compliant. BC break for any consumers reading `{filters, events}`.
- Recommendation: **(i)**. Surface area is small, BC risk is zero, and the existing `index.json` consumers (if any) continue working. New file slots cleanly into `writeJsonApiIfChangedSync` calls (see §6).
- Homepage `<link rel="alternate" type="application/feed+json" href="/api/datafeed.json">` adds discoverability.

---

## 6. Build pipeline write-pattern + insertion surface (Step 6)

**Finding: `writeFileIfChangedSync` (and helpers) is the dominant pattern. `generate-site.ts` is 1414 lines. Insertion surface is ~5–10 lines.**

```typescript
// src/generate-site.ts:6
import { writeFileIfChangedSync, writeHtmlIfChangedSync, copyFileIfChangedSync,
         writeJsonApiIfChangedSync, getWriteStats, resetWriteStats, formatWriteStats }
  from './utils/write-if-changed';
```

Existing call sites (sample):
- L237: `writeFileIfChangedSync(...)` for some content
- L566/573: `_redirects` file
- L1200: `llms.txt`
- L1251: `robots.txt`
- L1266: IndexNow key files (loop)

**For a new DataFeed-shaped surface, `writeJsonApiIfChangedSync` is the natural helper** — it's already the convention for `dist/api/*.json` outputs (the 1000s of category JSONs). New insertion: a single call near the end of `generate-site.ts` writing `dist/api/datafeed.json`.

**Estimated surface area for Component D + DataFeed wiring:** 5–10 lines in `generate-site.ts` + a small builder function (probably in `src/generators/datafeed.ts` or similar). The cache-aware helper means the file gets re-emitted only when content changes (no unnecessary deploys).

---

## 7. Scheduled-job infrastructure inventory (Step 7) — Component E options ranked

**Finding: launchd is the established mechanism. 5 production plists exist, all dispatching to `scripts/daily-automated.sh <mode>`. Netlify scheduled functions NOT configured.**

### Existing plists

| Plist | Schedule | Invocation |
|------|---------|-----------|
| `com.agentathens.daily.plist` (project root) | 08:00 daily | `daily-automated.sh` (no arg = full pipeline) |
| `config/launchd/com.agentathens.freshness.plist` | 08:00 daily | `daily-automated.sh freshness` |
| `config/launchd/com.agentathens.enrichment.plist` | 10:00 daily | `daily-automated.sh enrichment` |
| `config/launchd/com.agentathens.enrichment-13.plist` | (presumably 13:00) | `daily-automated.sh enrichment` (slot 2) |
| `config/launchd/com.agentathens.enrichment-16.plist` | (presumably 16:00) | enrichment slot 3 |
| `config/launchd/com.agentathens.enrichment-19.plist` | (presumably 19:00) | enrichment slot 4 |

There's also `com.agentathens.enrichment-check.plist` at project root (separate from launchd subdir).

### `netlify.toml` — Scheduled functions: NOT configured

```toml
[build]
  publish = "dist"
  command = "echo 'Deploy via CLI - no build needed'"
[functions]
  directory = "netlify/functions"
```

Functions directory is wired (used for click-tracking per the 2026-04-XX click storage work), but no `[[scheduled]]` blocks. Adding scheduled functions = greenfield Netlify infra setup.

### Component E options

| Option | Effort | Risk | Notes |
|------|------|------|------|
| **(A) New launchd plist** `com.agentathens.resolver.plist` invoking `daily-automated.sh resolver` (or a new resolver script directly) | LOW | LOW | Mirrors existing 5-plist pattern. New plist + new mode arg in `daily-automated.sh` (or new script). Independent schedule. **RECOMMENDED.** |
| **(B) Inline into existing daily plist** — extend `daily-automated.sh` to call resolver as part of the regular daily pipeline | LOWEST | LOW | No new plist. But couples resolver scheduling to the daily pipeline; cannot run resolver more/less frequently than daily without unwinding the coupling. |
| **(C) Netlify scheduled function** | HIGH | MEDIUM | Greenfield: function setup, env vars, scheduling syntax. Crosses host boundary (macOS local → Netlify cloud) — different debugging surface than the rest of the pipeline. Justified ONLY if resolver needs cloud-side execution (it does not, per Sprint 1 design). |

**Recommendation: (A).** Independent schedule, fits the project's chosen mechanism, no cross-host risk. (B) is a tempting shortcut but the coupling cost shows up the first time someone wants to retry resolution on a different cadence than the daily build. (C) is over-engineered for a job that runs against a local SQLite DB.

This is **Dev Planner's recommendation**, not a decision. Strategist owns the disposition call.

---

## 8. Schema completeness baseline (Step 8)

**Finding: 97% (8039/8278), 0 errors, 239 warnings. Build healthy — no Sprint 1 regression.**

```
✅ Site generation complete!
⏱️  Build time: 17.3s
📋 Schema completeness: 8039/8278 pages fully valid (97%)
   ✅ 8039 pass  ⚠️  239 warnings  ❌ 0 errors
```

Per the brief's correction, **97% is Sprint 1's actual baseline**, not the Round 7 March target. Sprint 2 measures improvement against this number.

**Top warnings driving the 3% gap (from build run):**
- 236/8282 (3%) `location.geo` coordinates missing
- 219/8282 (3%) `streetAddress` is empty
- 3/8282 (<1%) FAQPage JSON-LD block missing
- 2/8282 (<1%) CollectionPage `itemListElement` is empty

**Component D target:** Reduce the 239-warning count by addressing the geo + streetAddress gaps (which heavily overlap — venues without coordinates often also lack streetAddress).

---

## 9. Aggregator + venue_direct_only event counts (Step 9)

**Finding: brief estimate diverges materially. Real numbers below.**

Filter: `ticket_url IS NOT NULL AND start_date >= date('now') AND price_type = 'with-ticket' AND location_status IN ('verified_athens', 'pass_through')`

| Bucket | Count | Brief estimate | Slippage |
|------|------|------|------|
| **Aggregator total** | **64** | ~80 | -20% |
|   athinorama.gr | 53 | — | — |
|   clubber.gr | 11 | — | — |
| **venue_direct_only total** | **33** | ~1 (benaki only) | **+33×** |
|   megaron.gr | 26 | — | — |
|   onassis (substr match) | 7 | — | — |
|   benaki.org | 0 | (brief's example) | — |
| **known_merchant total** | **77** | not estimated | — |
|   more.com | 62 | — | — |
|   viva.gr | 15 | — | — |
| **Other (unclassified hosts)** | 71 | — | — |

**Sprint 2 implications:**
- Component B (dual-type Place schema for venue_direct_only) sizing was based on "1 venue" in the brief. **Real scope is ~33 events across 2 venues (Megaron + Onassis)**, with benaki currently empty but expected to repopulate.
- Component E (resolver) sizing was "~80 aggregator events". **Real scope 64.** Slightly less work.
- The 71 "other" bucket is a separate finding — those events have ticket URLs that don't match any of the canonical hosts (megaron, onassis, benaki, athinorama, clubber, more, viva). They're either smaller venues, smaller aggregators, or directly-pointing official-site URLs. **Triage of "other" is out of scope for Sprint 2**, but worth flagging as a future audit candidate (it's almost as large as known_merchant + venue_direct_only combined).

---

## 10. ARIA tooling availability (Step 10)

**Finding: NOT installed. Neither axe-core nor Pa11y exists project-locally or globally.**

```
$ which axe pa11y    → not found
$ ls node_modules/.bin/ | grep -i 'axe\|pa11y'    → empty
$ npm list -g … axe / pa11y    → empty
```

**Disposition for Component C:** Install path needed.

| Tool | Install | Notes |
|------|------|------|
| `@axe-core/cli` | `bun add -d @axe-core/cli` | CLI for axe-core; project standard for many React/Next builds. JSON output. |
| `pa11y` | `bun add -d pa11y` | Older but well-supported; supports WCAG 2.1 + Section 508 profiles. |

Recommendation deferred to Component C implementer. axe-core CLI is the more common modern choice; Pa11y is friendlier for batch CLI/CI runs.

**Estimated install cost:** ~5 minutes. Not a Sprint 2 blocker — ARIA audit is a Component C deliverable that includes the tooling decision.

---

## 11. Dual-type seller pattern readiness (Step 11)

**Finding: Pattern is filed in `.claude/notes/patterns.md` with full scope description, ready for Component B inheritance.**

```
## Dual-type seller for venue_direct_only (2026-05-02)

When a venue is the merchant of record (homepage as ticket_url, no
third-party platform), `seller["@type"]` emits as `["Place", "Organization"]`
to match the 2026-04-28 Canonical Entity Graph spec for venue-as-merchant
cases (Megaron, Onassis, Benaki — venues that self-merchant tickets).

**Scope of dual-type:** ONLY venue_direct_only classification.

**Other lanes stay scalar `"Organization"`:**
- known_merchant — host is the seller (Viva.gr, More.com, etc.)
- listing_aggregator — venue is de-facto seller, but not self-merchant
- unclassified — venue fallback
- Free events — venue as responsible Organization

**Validators paired:** Both schema-validator.ts and schema-completeness.ts
accept seller["@type"] as either scalar "Organization" OR array containing
"Organization" (matching the emitter contract).
```

**Verification of Component B alignment:** The pattern names `["Place", "Organization"]` for the seller dual-type (event schema offers.seller). Component B's job is to also emit dual-type at the venue page level (the venue's own JSON-LD top-level `@type`). The existing pattern provides the **syntactic precedent** (array `@type` is accepted) and the **classification rule** (only venue_direct_only gets dual-type). Component B inherits both, just at a different schema slot.

**Validator alignment:** The existing schema validators (`schema-validator.ts`, `schema-completeness.ts`) already accept array `@type` for seller. **Component B implementer must verify** the same validators accept array `@type` on the top-level venue object — likely already true if the validators are field-level rather than slot-specific, but worth a one-line check.

---

## 12. Sitemap-index DataFeed-reference feasibility (Step 12)

**Finding: No clean fit. The brief's "research-dependent" caveat is correct.**

Current `dist/sitemap-index.xml`:
```xml
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>https://agentathens.com/sitemap-events.xml</loc></sitemap>
  <sitemap><loc>https://agentathens.com/sitemap-venues.xml</loc></sitemap>
  <sitemap><loc>https://agentathens.com/sitemap-editorial.xml</loc></sitemap>
</sitemapindex>
```

Sitemap protocol (sitemaps.org) requires each `<loc>` to point to **another XML sitemap**, not arbitrary content. A `/api/datafeed.json` URL is not a valid `<loc>` target.

**Workable alternatives (none break existing infra):**

1. **Homepage `<link rel="alternate" type="application/feed+json" href="/api/datafeed.json">`.** Standards-compliant; appears in HTML head; crawler-friendly. **RECOMMENDED.**
2. **`llms.txt` entry.** The project already emits `llms.txt` (per `src/generate-site.ts:1200`). Add a "Data Feed" section pointing to `/api/datafeed.json`. AI-crawler-friendly.
3. **`robots.txt` `Sitemap:` directive** — same constraint as sitemap-index: must point to XML, not JSON. Not viable.

**Recommendation:** (1) + (2). Homepage alternate-link for standard discoverability + llms.txt entry for AI consumers. No sitemap-index modification.

---

## 13. Open questions for Strategist that emerged from diagnostic

1. **Sprint 1 cleanup ordering (BLOCKER):** Should the `ticket_url_resolved` column + emitter cleanup be handled as:
   - (i) A pre-Sprint-2 cleanup session (1 small session, ships before Sprint 2 starts), or
   - (ii) Folded into Sprint 2 Component E (resolver implementation also produces the column + emit logic)?
   - **Dev Planner lean:** (i). Keeps Sprint 2's Component E focused on resolver scheduling/orchestration, not column-add work. Cleaner audit trail.

2. **venue_direct_only sizing surprise (Component B):** Real scope is 33 events across 2 active venues (Megaron 26, Onassis 7) — not "1 event" as the brief framed. Does this change Component B's session-count allocation, or is the per-venue work small enough that 33 events fold into one session?

3. **DataFeed file decision (Component D):** New `/api/datafeed.json` (no BC break) vs. reshape existing `/api/index.json` (BC break). **Dev Planner lean:** new file. Existing `index.json` consumers (whatever they are) continue working; DataFeed surface is purpose-built for SEO/AI crawlers.

4. **sameAs config layout (Component A):** Inline on `athens-venues.json` entries, or sibling `config/venue-sameAs.json` mirroring `config/performer-sameAs.json`? Both work; sibling is cache-friendlier and keeps human-edited venue config tidy. **Dev Planner lean:** sibling file.

5. **Megaron venue-page absence:** Megaron is in `athens-venues.json` and has 26 events but does NOT appear in `dist/venues/`. Out of Sprint 2 scope, but flagged for separate triage — Component B will want a venue page to exist for the venue_direct_only flagship case.

---

## 14. Component E disposition recommendation

**Recommended: Option (A) — new launchd plist `com.agentathens.resolver.plist`.**

Rationale:
- Mirrors the established pattern (5 production plists, all `daily-automated.sh <mode>` invocations)
- Independent schedule from the daily pipeline (resolver may want different cadence — weekly initially, daily later)
- Same debugging surface as the rest of the pipeline (logs in `logs/`, stderr in launchd logs)
- Lowest greenfield cost: ~30 LOC plist + new mode in `daily-automated.sh` (or a standalone script the plist invokes directly)

**Rejected alternatives:**

- **(B) inline into daily pipeline** — tempting shortcut, but couples resolver cadence to the daily build forever. First time someone wants weekly retries, it costs more to unwind than (A) cost to build.
- **(C) Netlify scheduled function** — greenfield Netlify infra (no `[[scheduled]]` blocks today), crosses host boundary (macOS launchd → Netlify cloud), unjustified for a job that operates on a local SQLite DB.

**Strategist owns the final call.** This is Dev Planner's read; pivot if there's a constraint not visible in the diagnostic (e.g., a desire to migrate scheduling off the user's laptop).

---

## Done-state checklist

- [x] All 13 brief sections populated
- [x] Section 14 (Component E recommendation) added
- [x] No `src/` or `config/` files modified
- [x] Build still healthy (97% baseline confirmed)
- [x] Sprint 1 gap surfaced with disposition (§1, §2)
- [x] Sizing slippage documented (§9)
- [x] Open questions for Strategist captured (§13)

**Hand-off to Dev Planner.** Spec is the input to:
- Sprint 2 session count + sequencing decisions
- Component E disposition reply to Strategist
- Pre-Sprint-2 cleanup session (resolved-URL column + emit) — recommended to land before Sprint 2 Component E begins
