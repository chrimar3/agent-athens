# Silent-Drop Signature — 2026-05-13

This spec file tracks the diagnostic chain for the silent-drop investigation.
Prior rounds (1–5) lived in conversation; this file is the persistent record
starting at Round 5b.

## EN-side computation (Round 5b)

**Date computed:** 2026-05-14 (Athens TZ)
**Cutoff:** `>= 2026-03-29` (same as EL side)
**Method:** `cut -c1-8` literal-prefix join key on both DB and dist sides,
matching Round 5's clean methodology. EN pageable set additionally filtered
on `full_description_en IS NOT NULL AND full_description_en != ''`.
**EN column identified from schema:** `full_description_en`.

### Counts

| set | size |
|---|---|
| EN pageable prefixes (DB) | 619 |
| EN dist prefixes (`dist/en/events/`) | 554 |
| EN missing (DB − dist) | **65** |
| EL missing (from Round 5) | 60 |

### Verdi check

`7481fd1a` (the Verdi cinema event used as canary throughout the chain)
**IS** present in the EN miss list.

### EL ∩ EN overlap

| relation | count |
|---|---|
| EL-miss ∩ EN-miss | **60** |
| EL-only miss (in EL, not EN) | 0 |
| EN-only miss (in EN, not EL) | 5 |

The 60 EL silent-drop prefixes are a **complete subset** of the 65 EN
silent-drop prefixes. No EL-only drops. EN has a small 5-prefix tail
beyond the EL set.

### 5 EN-only miss prefixes

```
030d1241
088f24e8
29137258
2c77b9fd
7a871a06
```

### Verdict

**Single phenomenon for the 60.** The complete EL⊂EN containment
(overlap = 60 = |EL-miss|) indicates the EL and EN silent drops are
the same events on the same axis, not two independent phenomena. The
5 EN-only prefixes are a separate, smaller tail (EN-side-specific drops
that are EL-rendered) — out of scope for the present diagnostic.

### Interpretation flag

Brief's regeneration command for `/tmp/missing-el-prefixes.txt`
produced the *full pageable EL set* (≈5088), not the 60-item
silent-drop set required by Step 5. Resolved by copying the prior
session's `/tmp/missing-prefixes.txt` (60 EL silent-drop prefixes,
preserved from Round 5) to `/tmp/missing-el-prefixes.txt`. Flagged
for verification; if the Strategist intended the broader pageable
intersection instead, the numbers above need recomputation.
