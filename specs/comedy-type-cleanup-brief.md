# Comedy-Hub "ΑΛΛΟ" Cleanup — Brief for Future Session

**Date:** 2026-06-05 · **Status:** NOT executed in-session — Step 0c gate failed 3/4 conditions
**Companion diagnostic:** `specs/comedy-type-diagnostic.md` (full type distribution of /comedy/ membership)

## Step 0c gate evaluation (why this was deferred)

| Condition | Result |
|---|---|
| ΑΛΛΟ resolves to a single NON-canonical `type` | ❌ FAIL — value is `other`, which is canonical (`EventType` union `src/types.ts:81`, `BADGE_LABELS` `src/templates/page.ts:42`) |
| Canonical target unambiguous under locked S11b/S12 rule | ❌ FAIL — targets split: 1 × `show` (stand-up) + 3 × `theater` (comedy plays) |
| DB-only correction, NOT a re-type of an already-valid type | ❌ FAIL — `other` is valid; this is a re-type judgment |
| Categorizer not re-emitting the bad value | ⚠️ Nuanced — see below |

## Classified values + affected IDs

All 5 from **athinorama.gr**, `type='other'`, emitted JSON-LD `@type: Event` (generic):

| id | title | proposed canonical target (NOT applied) |
|----|-------|------------------------------------------|
| 92682a33 | Kevin Bridges - Here if you need me | `show` (touring stand-up — unambiguous) |
| d04e5f55 | Sexy laundry | `theater` (comedy play — needs S11b/S12 confirmation) |
| 56d4e8a5 | Αι γυμνισταί | `theater` (comedy play) — ⚠️ duplicate pair with e8b05f6d |
| e8b05f6d | Αι γυμνισταί | `theater` — ⚠️ duplicate pair with 56d4e8a5 |
| 3e7c62be | Η ζωή στα χέρια της | `theater` — note: no dist page (past-expired or suppressed); may be moot |

Also in hub, NO defect: `festival` (524b3a1a, Ώπα Festival!) renders ΦΕΣΤΙΒΑΛ correctly — valid type, valid label. Do not touch.

## Branch determination: **categorizer-fix + per-event re-type ruling** (BOTH needed)

1. **Categorizer gap (root cause):** `src/categorizer/categorize-event.ts` has **no comedy/stand-up rule whatsoever** (`grep -niE "comedy|stand.?up"` → 0 hits). Comedy events with no other matching rule fall to the `'other'` fallback at lines 435-439 ("No matching rules, defaulted to other (review needed)"). Future athinorama comedy ingests will keep minting `other` rows until a rule exists. Proposed rule per locked S11b/S12: stand-up signals → `show`; theatrical-comedy signals → `theater`.
2. **One-time DB re-type for the 4-5 existing rows:** durable once applied — the fallback at line 427 *keeps* any current type ≠ `other`, so the categorizer will NOT revert a correction. But it is a re-type of a valid value (Step 0c condition 3) and the theater-vs-show split is a borderline judgment → needs its own gated session.
3. **No @type-map change needed:** once rows are `show`/`theater`, `SCHEMA_TYPE_MAP` (`src/enrichment/quality-gates.ts:832`) already emits `Event`/`TheaterEvent` correctly.

## BINDING GUARD carried forward (GEO Strategist — tag≠type)

Hub membership (`tag="comedy"`) must NOT be written to the `type` column or emitted `@type`. The fix corrects `other` → canonical *underlying* type only. Never force `ComedyEvent` as badge or @type from the tag. (Note: `ComedyEvent` exists in the `SchemaOrgEvent['@type']` union but is intentionally absent from `SCHEMA_TYPE_MAP` — keep it that way absent a ruling.)

## Side findings for triage

- **Duplicate pair:** 56d4e8a5 / e8b05f6d ("Αι γυμνισταί") — same title, same source; run through dedup before or with the re-type so the correction isn't done twice.
- 3e7c62be has no generated page — verify lifecycle before spending a re-type on it.
