# S2 Taxonomy Hygiene — Touchpoint Checklist

## Tag write barriers (4 sites — boundary contract)

Every site that writes the `tags` column MUST route through `filterEntityTags()`
from `src/utils/tag-filter.ts`. The filter is the single source of truth for
the entity-exclusion rule; UPDATE column shapes vary per call-site by design.

| # | Site | Lines | Columns written | Filter insertion point |
|---|---|---|---|---|
| 1 | `src/db/database.ts` (`upsertEvent`) | 202-246 | 31 INSERT / 23 UPDATE incl. `tags` | Inside `eventToRow()` or just before `stmt.run(row)` — wherever the row dict's `tags` JSON is finalized |
| 2 | `src/db/database.ts` (`updateEvent`) | 384-426 | 26 incl. `tags` | Same insertion pattern as site 1 |
| 3 | `scripts/run-enrichment-pipeline.ts` (interactive save) | 268-288 | 7 incl. `tags` | After `extractTags(description)`, before `JSON.stringify` |
| 4 | `scripts/save-batch.ts` (batch save) | 301-310 | 6 incl. `tags` | After `JSON.parse(tagsFile)`, before `JSON.stringify(tagsJson)` |

## Out-of-scope writes (audited, no filter needed)

| Site | Reason |
|---|---|
| `scripts/write-tags.ts` | Writes `temp-descriptions/<id>.tags.json` (file, not DB). Site 4 (`save-batch.ts`) is the consumer that hits the DB and IS filtered. |
| `src/quality/field-merger.ts:148` (`mergeJsonArray('tags', ...)`) | In-memory union only. Output flows to site 1 or 2; filtered at the DB barrier. |

## Prompt source (Step 5)

| Site | Lines | Action |
|---|---|---|
| `src/enrichment/description-generator.ts` (`suggestTagOptions`) | 495 | Remove neighborhood from suggestion list (5a — root-cause structural fix) |
| `src/enrichment/description-generator.ts` (premium prompt block) | 216-295 | Add soft-prior text (5b) |

## city-geodata.json schema extension (Step 3a)

Audit run: `grep -rn 'city-geodata' src/ tests/ scripts/ --include='*.ts'`

| File | Type | Risk from `name_forms` addition |
|---|---|---|
| `src/utils/schema-geo.ts:32` | Direct loader (production) | None — reads `country`, `region`, `municipality` keys; doesn't iterate |
| `tests/schema-enhancements.test.ts:181-195` | Test loader | None — reads `country.code`, `country.currency` only |
| `src/validators/schema-completeness.ts:341, 380` | **Passive reference** (doc comment + error string) — does NOT load the file; receives `expectedAddressRegion` as parameter | None |
| `src/validators/__tests__/schema-completeness.test.ts:541` | Passive reference (test comment) | None |

`name_forms` extension is additive; no consumer rejects unknown keys. Run
`tests/schema-enhancements.test.ts` after the extension to confirm.

## Stop-and-report triggers met during planning

- ✅ **Step 0a expansion (Guard 6):** Original audit identified 2 paths; full audit found 4 (including 2 scripts/ paths). Resolved via SHAPE 2 refactor — single filter helper, 4 wire-up sites.
