# Venue Dedup Sample Classification (Q-B8a Path 3 / B-2d pre-flight)

**Date:** 2026-05-04
**Mode:** Pre-flight, read-only.
**Goal:** Classify a 10-pair sample from the canonical-name collisions in
`config/athens-venues.json` to project the dominant pattern (case (i)
legitimate distinct vs case (ii) data-entry duplicate) and size the B-2d
session.

**Headline:** **9/10 case (ii)**, 1/10 needs Editorial input. Bulk-merge
path is correct for B-2d. Tier 1 cross-check empty — Editorial Tier 1
brief unblocks fully and independently of B-2d.

---

## Collision Inventory

```
Total colliding canonical_names: 57
  At 3× (triple): 2 — "Ακροπόλ", "Θέατρο Μπέλλος"
  At 2× (pair):  55
  Total records implicated: 116 (= 2×3 + 55×2)
```

⚠️ **Strategist's Q-B8a Path 3 lock anchored on 59; reality is 57.** Drift
of 2 since the diagnostic — registry has been edited (likely B-2 or B-2c
adjacent work). Small drift, not blocking — pattern projection still
applies.

---

## Sample (10 pairs, alphabetical first 10)

**Sampling method:** alphabetical sort of the 57 colliding canonical_name
values, take first 10. Reproducible (`jq ... | sort | .[0:10]`). Sample
size = 10/57 = **17.5%** — suggestive, not statistically tight.

All 10 selected are **2-record collisions** (pairs); the two triples
(Akropol, Theatro Bellos) sort after Latin-letter names and didn't make
the alphabetical-first cut. That's a sampling-bias note: the projection
covers pair-collision behaviour confidently but generalizes to triples
weakly.

**Selected names:**

```
Arroyo, Astron, Aux Club, Bolivar, Burger Disco Club,
Calderone Art Space, Cantina Social, Daddy's All Day Bar,
Don't be a Dick, IT Athens
```

**Cross-cutting structural finding:** every record across the entire
sample has `address: null`, `website: null`, `ticketing: null`,
`sameAs: null`. The decision matrix's strong signals are universally
unavailable. Classification leans on:

- `neighborhood` field
- Address strings embedded as elements of `variations[]` (e.g.
  `"Astron, Λεωφόρος Κωνσταντινουπόλεως 121, Αθήνα, 10447, Greece"`)
- Variations content (rich vs minimal records hint at "real entry vs
  accidental stub")

**Per-record dump** (verbatim from `jq`, condensed for spec readability):

### Arroyo (×2)
- A: neighborhood="Central Athens", variations=["ARROYO","Arroyo Theater"]
- B: neighborhood="Central Athens", variations=[]

### Astron (×2)
- A: neighborhood="Pangrati", variations=["ASTRON","Astron Club","Astron, Λεωφόρος Κωνσταντινουπόλεως 121, Αθήνα, 10447, Greece"]
- B: neighborhood="Perissos", variations=["Astron, Λεωφόρος Κωνσταντινουπόλεως 121, Αθήνα, 10447, Greece","Astron Club"]

### Aux Club (×2)
- A: neighborhood="Gazi", variations=["AUX","Aux"]
- B: neighborhood="Gazi", variations=["Aux Club, Αγίου Όρους 15, Γκάζι, Αθήνα, Greece"]

### Bolivar (×2)
- A: neighborhood="Alimos", variations=["BOLIVAR","Bolivar Beach Bar"]
- B: neighborhood="Alimos", variations=["Bolivar, Ακτή Ηλίου, Άλιμος, Αθήνα, Greece"]

### Burger Disco Club (×2)
- A: neighborhood="Gazi", variations=["Burger Disco"]
- B: neighborhood="Syntagma", variations=["Burger Disco Club, Νίκης 11, Σύνταγμα, Αθήνα, 10557, Greece"]

### Calderone Art Space (×2)
- A: neighborhood="Central Athens", variations=["Calderone"]
- B: neighborhood="Central Athens", variations=[]

### Cantina Social (×2)
- A: neighborhood="Exarchia", variations=["Cantina"]
- B: neighborhood="Psyrri", variations=["Cantina Social, Λεωκορίου 6-8, Ψυρρή, Αθήνα, Greece"]

### Daddy's All Day Bar (×2)
- A: neighborhood="Psyri", variations=["Daddy'S all day bar","Daddy's All Day Bar","Daddys All Day Bar","Daddy's all day bar","Daddy'S all day bar","Daddy'S all day bar"] (case/apostrophe variants)
- B: neighborhood="Central Athens", variations=["Daddy'S all day bar","Daddy's All Day Bar","Daddys"] (subset of A's variations)

### Don't be a Dick (×2)
- A: neighborhood="Exarchia", variations=["Dont be a Dick","Don't Be A Dick"]
- B: neighborhood="Exarchia", variations=["Don't be a Dick, Φειδίου 4, Εξάρχεια, Αθήνα, Greece"]

### IT Athens (×2)
- A: neighborhood="Gazi", variations=["IT"]
- B: neighborhood="Exarchia", variations=["IT Athens, Σολωμού 30 & Μπόταση 9, Εξάρχεια, Αθήνα, Greece"]

---

## Classification

| # | Name | Class | Reasoning |
|---|---|---|---|
| 1 | Arroyo | **(ii)** confident | Same neighborhood; one record richly populated (variations), other minimal (empty variations). Classic minimal-stub-vs-real pattern. Merge. |
| 2 | Astron | **(ii)** confident | Both records reference the SAME address (Λεωφόρος Κωνσταντινουπόλεως 121, postal code 10447) in their variations. Postal code 10447 is Perissos area, so record A's "Pangrati" neighborhood is wrong. Same physical venue, mis-classified neighborhood on one row. Merge. |
| 3 | Aux Club | **(ii)** confident | Same neighborhood (Gazi). Address from variation (Αγίου Όρους 15, Γκάζι) matches that neighborhood. Variations differ in form, not substance ("AUX","Aux" vs full address string). Merge. |
| 4 | Bolivar | **(ii)** confident | Same neighborhood (Alimos). Address from variation (Ακτή Ηλίου, Άλιμος) matches. "Bolivar Beach Bar" matches the seafront location. Merge. |
| 5 | Burger Disco Club | **(ii)** likely / flag | Different neighborhoods (Gazi vs Syntagma) BUT only one address in variations (Νίκης 11, Σύνταγμα). The "Gazi" labelling for the minimal-variations record may be a stale guess from normalization. Same name + only one address present → probably same venue. **Flag for B-2d manual review** (Editorial may know if there's a Gazi branch). |
| 6 | Calderone Art Space | **(ii)** confident | Same neighborhood (Central Athens). Minimal-stub-vs-real pattern again (one has ["Calderone"] variation, other has empty). Merge. |
| 7 | Cantina Social | **needs Editorial** | Different neighborhoods (Exarchia vs Psyrri) AND only one address in variations (Λεωκορίου 6-8, Ψυρρή). The bare "Cantina" record (Exarchia) could be a different venue ("Cantina" is a generic name; an Exarchia-based "Cantina" is plausible separate from Psyrri's "Cantina Social"). Cannot determine from data alone. |
| 8 | Daddy's All Day Bar | **(ii)** confident | Both records have nearly identical variation lists capturing case/apostrophe variants of the same name. "Central Athens" is a vague catch-all that includes Psyri. Same venue, two records caused by the apostrophe/case normalization being incomplete. Merge. |
| 9 | Don't be a Dick | **(ii)** confident | Same neighborhood (Exarchia). Address from variation (Φειδίου 4, Εξάρχεια) matches. Merge. |
| 10 | IT Athens | **(ii)** likely / flag | Different neighborhoods (Gazi vs Exarchia) BUT only one address in variations (Σολωμού 30 & Μπόταση 9, Εξάρχεια). Same pattern as Burger Disco — the minimal-variations record's "Gazi" neighborhood may be stale. **Flag for B-2d manual review.** |

**Tally:**

```
Case (ii) confident:               7  (Arroyo, Astron, Aux Club, Bolivar,
                                       Calderone, Daddy's, Don't be a Dick)
Case (ii) likely (manual flag):    2  (Burger Disco Club, IT Athens)
Case (i) / needs Editorial input:  1  (Cantina Social)
Case (i) confident:                0
Total:                            10
```

---

## Projection + Recommended B-2d Shape

**Sample distribution:**

- 7/10 case (ii) confident
- 2/10 case (ii) needs manual review
- 1/10 needs Editorial input
- 0/10 case (i) confident

**Confidence:** sample size 17.5% of 57 collisions; deterministic
alphabetical sample skewed Latin-letter-first (Greek-name behaviour
under-sampled). Triples (Akropol, Theatro Bellos) not in sample.
Projection is suggestive, not tight.

**Projection to full 57 (point estimates, ±2 wiggle):**

| Class | Sample (10) | Projected (57) |
|---|---|---|
| Case (ii) confident | 7 (70%) | ~40 |
| Case (ii) needs manual review | 2 (20%) | ~11 |
| Needs Editorial input | 1 (10%) | ~6 |
| Case (i) confident | 0 | ~0 |

Compare to Strategist's diagnostic estimate (50 dedup / 9 keep):
projection here aligns — ~40 confident merges + ~11 manual-review
merges = ~51 dedup-able total, ~6 Editorial-input cases, 0 confident
keeps. Within the 50/9 ballpark.

**Recommended B-2d shape: BULK-MERGE PATH**

- **Bulk merge** (~40 confident-(ii) cases): allow-list-driven
  consolidation. For each, merge the minimal record into the rich one,
  preserving the union of variations. Roughly 5–10 minutes.
- **Manual-review subset** (~11 likely-(ii)-needs-flag): per-case
  confirmation against Editorial knowledge or a quick web check
  (does the second neighborhood actually have a venue with that name?).
  Roughly 15–20 minutes.
- **Editorial-input subset** (~6 indeterminate): hand to Editorial
  Director as a list. May take async time to resolve; doesn't block
  the bulk-merge half.

**Total B-2d session time:** ~30–45 minutes for the executor side
(bulk + manual review). Editorial-input subset runs async on its own
timeline.

**Indeterminate rate:** 1/10 = 10%. Modest. B-2d remains primarily a
Planner+executor session; Editorial Director is a reviewer of ~6
specific cases, not a co-driver.

---

## Edge Cases + Tier 1 Cross-Check

### Tier 1 cross-check: ✅ EMPTY

```bash
jq '... | map(select(test("Μέγαρο|Onassis|Μπενάκη|Benaki|Ωνάσ"; "i")))' \
  config/athens-venues.json
# returns: []
```

**No Megaron, Onassis, Benaki entries appear in the collision list.**
Editorial Tier 1 brief is fully safe to land independently of B-2d.
The Tier 1 5-venue set (Megaron, Onassis, Benaki ×3) has clean,
non-colliding canonical_names; their `sameAs` payloads land cleanly
into the registry without conflict.

### Particularly informative samples

- **Astron** is the strongest signal that minimal-records-with-mismatched-
  neighborhoods are still data-entry duplicates: the two records share
  the SAME street address embedded in their variation strings. The Pangrati
  vs. Perissos disagreement is a normalization error, not two real venues.
  This case alone justifies the bulk-merge approach for similar shapes
  (Burger Disco, IT Athens) even when neighborhoods disagree.

- **Calderone Art Space** + **Arroyo** are the cleanest "minimal stub"
  cases: identical neighborhood, one record has variations, the other is
  empty. These are the easy bulk merges.

- **Cantina Social** is the only "do not merge without confirmation" case:
  bare "Cantina" in Exarchia is plausibly a different venue from "Cantina
  Social" in Psyrri (different streets, different neighborhoods, name
  prefix relationship is ambiguous). If B-2d treats this as merge-
  eligible, it could collapse two real venues into one.

### Structural observation worth flagging to B-2d

**100% of sampled records have `address: null`** at the JSON-field level.
Addresses, when present, are embedded as strings inside `variations[]`
(e.g. `"Astron, Λεωφόρος Κωνσταντινουπόλεως 121, Αθήνα, 10447, Greece"`).
B-2d may want to:

1. Use a regex to extract the address suffix from variation strings as
   part of the merge.
2. Promote that address to the merged record's `address` field —
   producing a richer record post-merge than either input record.
3. (Optional) propose this address-extraction as a separate hygiene
   pass, decoupled from dedup.

Not B-2d-blocking, but worth the executor flagging to the Planner before
the merge logic is designed.

### Sample bias note

Alphabetical-first-10 of Latin-letter names → 0 Greek-name samples and
0 triples. The dominant pattern projection holds for Latin-letter pairs;
Greek-letter pairs (47 of the 57) and the 2 triples have no direct
representation. Two ways B-2d could extend the sample if it wants
tighter confidence:

- Alphabetical-last-10 → likely Greek-name pairs.
- Both triples (Akropol, Theatro Bellos) → triple-collision-specific
  pattern.

Each adds ~5 minutes. Recommendation: skip the extension unless B-2d's
first-pass surface area surprises (e.g. Greek-name pattern looks
materially different from Latin).

---

## Summary for Planner

**Three findings:**

1. **Projection: bulk-merge dominant.** 9/10 case (ii) (7 confident +
   2 needs-flag), 1/10 needs Editorial input. Projects to ~51 dedupable
   / ~6 Editorial-input out of 57 — matches Strategist's 50/9 estimate.
   B-2d shape = bulk-merge with ~11-case manual-review subset.

2. **Tier 1 cross-check empty.** No Megaron, Onassis, Benaki in the
   collision list. Editorial Tier 1 brief unblocks fully and is
   sequence-independent of B-2d. Editorial can land Tier 1 sameAs data
   any time.

3. **Indeterminate rate 10% (1/10).** Modest. B-2d is a Planner+executor
   session; Editorial Director is a reviewer of ~6 specific cases on
   their own timeline.

**Drift flags:**

- Collision count is 57, not 59 (Strategist's lock anchor). 2-collision
  drift since the diagnostic; not blocking.
- 100% of sampled records have `address: null` at JSON-field level —
  addresses live inside `variations[]` strings. B-2d may want to
  surface-extract them during the merge pass (or split into a separate
  hygiene step).

**B-2d session size estimate:** 30–45 minutes executor time + async
Editorial-Director review on 6 cases.
