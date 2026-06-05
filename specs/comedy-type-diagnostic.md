# /comedy/ Hub — Invalid Event-Type Diagnostic

**Date:** 2026-06-05 (read-only diagnostic; NO remap performed per brief guard)
**Hub filter:** tag-based — `config/hub-pages.json:671-679`, values: `Comedy`, `Stand-up`, `Standup`, `Stand up`

## Type distribution of comedy-hub membership

| type | count | sample IDs (8-char) |
|------|-------|---------------------|
| theater | 25 | 3f31c42f, 5e9311d5, 260fc9b4, … |
| show | 11 | 261c7b8c, 4aef7802, … |
| **other** | **5** | **92682a33, d04e5f55, 56d4e8a5, e8b05f6d, 3e7c62be** |
| dj_set | 2 | aae93840, 9cb82d5d |
| concert | 1 | 4a2fd47c |
| festival | 1 | 524b3a1a |

## Classification of the "ΑΛΛΟ" source

**The "ΑΛΛΟ" badge comes from `type = 'other'` — 5 events, all from `athinorama.gr`:**

| id | type | source | title |
|----|------|--------|-------|
| 92682a33 | other | athinorama.gr | Kevin Bridges - Here if you need me |
| d04e5f55 | other | athinorama.gr | Sexy laundry |
| 56d4e8a5 | other | athinorama.gr | Αι γυμνισταί |
| e8b05f6d | other | athinorama.gr | Αι γυμνισταί |
| 3e7c62be | other | athinorama.gr | Η ζωή στα χέρια της |

Note: `56d4e8a5` and `e8b05f6d` share the title "Αι γυμνισταί" — possible duplicate worth a separate dedup check.

## Key findings

1. **NOT a badge-label-map gap.** `BADGE_LABELS` in `src/templates/page.ts:30-43` maps every value present, including `other: 'ΑΛΛΟ'` and `festival: 'ΦΕΣΤΙΒΑΛ'`. The badge renders exactly what the data says.
2. **NOT a TypeScript-invalid value.** `'other'` and `'festival'` are both members of the `EventType` union (`src/types.ts:69-81`). The brief's valid-set list omitted `festival`, `dance`, `screening`, and `other`, which ARE canonical.
3. **The real gap is upstream classification.** The 5 `other` events are clearly classifiable by inspection: Kevin Bridges is touring stand-up (→ `show`), the rest are theater comedy plays (→ `theater`). The athinorama.gr scraper/classifier fell through to `other` for these.
4. `festival` (Ώπα Festival!, `524b3a1a`, more.com) renders as ΦΕΣΤΙΒΑΛ — valid type, valid label, no defect.

## Recommendation (for Planner — not implemented)

- Target the athinorama.gr type-classification fallback, not the badge map. A remap session should reclassify the 5 `other` events (1 → `show`, 4 → `theater`) and check why the classifier missed them.
- Separately verify the "Αι γυμνισταί" duplicate pair.
