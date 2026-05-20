# S141 Orphan-@id-Reference Diagnostic

**Date:** 2026-05-20
**Sprint:** S141
**Step:** 0c (FAIL-vs-WARN severity decision)
**Build:** post-S139-fix-2 baseline, branch `main`

## Method

Walked all `dist/**/*.html` (5,126 pages). For each page:

1. Extracted `<link rel="canonical">` URL (without trailing slash) → global canonical-URL set.
2. Extracted every `<script type="application/ld+json">` block. Flattened `@graph` arrays.
3. For each entity in the page's flattened graph, collected its `@id` value (only when the entity has properties beyond `@id` — i.e. it is a definition, not a pure reference).
4. For each entity, recursively walked all properties to find pure-reference objects (dicts with exactly one key, `@id`).

Each pure reference was then classified into one of four buckets:

| Bucket | Definition |
|--------|-----------|
| `same-page-resolved` | Ref matches an `@id` defined on the same page |
| `external` | Ref's host ≠ `agentathens.com` (Wikidata QIDs, schema.org enums, etc.) |
| `cross-page-canonical` | Internal ref whose URL (sans fragment) matches a canonical URL of another emitted dist/ page |
| `true-orphan` | Internal ref that resolves to nothing — neither same-page nor an emitted page |

## Result

| Bucket                  | Count | % of refs |
|-------------------------|-------|-----------|
| same-page-resolved      | 4,142 | 100.00 %  |
| external                | 0     | 0.00 %    |
| cross-page-canonical    | 0     | 0.00 %    |
| **true-orphan**         | **0** | **0.00 %**|

**Total pure-refs:** 4,142
**Pages with ≥1 orphan:** 0 of 5,126 (0.00 %)
**Canonical URLs collected (Pass 1 set size):** 4,521

## Reference fragments observed

| Fragment        | Count | S141 scope |
|-----------------|-------|------------|
| `#venue`        | 3,868 | Place ✓ in-scope |
| `#organization` | 274   | Organization ✓ in-scope |

`#performer`, `#organizer`, `#place` fragments: **0 occurrences** (no current emitter surface; Organizer arrives in S142, Performer is future work). Rule remains forward-protective for those entity types.

## Decision

**Land orphan rule at FAIL directly.** Per the Step 0c branch table in the session plan:

- 0 true orphans → **FAIL** (no WARN+ratchet wrapping)
- No `config/completeness-ratchets.json` entry required for `orphanReferences`
- No emission-bug callout needed (none surfaced)
- Severity will be hardcoded to `errors[]` in the new validator helper

## Cross-validation

Two independent measurements concur:

1. **S139 gate** confirmed 0/0/0 fail across events/hubs/venues post-envelope-migration (gate confirmed in S139-fix-2).
2. **This diagnostic** confirms 0 orphan refs across the live `dist/` corpus.

Both measurements check different properties (build-time completeness check vs runtime ref-resolution) and both report clean → high confidence the envelope is built correctly and the rule will not retroactively fail the build when promoted to FAIL.

## Forward-protective scope

Even with 0 current orphans, the FAIL rule is meaningful as a regression gate:

- **S142** introduces Organizer emission — orphan rule will catch any `#organizer` reference that fails to resolve.
- Future **Performer** work (currently unscheduled) — orphan rule will catch any `#performer` reference that fails to resolve.
- Any future refactor of the @graph envelope that breaks same-page resolution will fail the build at validator time, not in production GSC reports.

## Out-of-scope fragments

The rule explicitly skips refs ending in `#offer`, `#event`, `#website`, or with no fragment. These are not in the S134 §3 entity-type scope (Place / Performer / Organization / Organizer). If future work needs to enforce orphan resolution for those types, extend the fragment-allowlist in the helper.
