# A0 Hard-Stop Calibration Audit — 2026-05-14

Read-only audit. No rule changes proposed. Decision lives with GEO Strategist.

---

## 1. Cohort summary

**Distinct events in hard-stop cohort (A0 concern_types only):** 66
**Total A0 concern rows on cohort events:** 72 (events can carry multiple A0 concerns)
**Round 5 silent-drop count comparison:** 60 → +6 events (+10%), within STOP threshold; explainable by intervening scraper runs.
**Corpus denominator (pageable events ≥ 2026-03-29):** 5,096

Per-concern_type distribution across **all** event_concerns rows (not cohort-restricted; for firing-rate denominator interpretation):

| concern_type | tier | rows | firing rate vs corpus |
|---|---|---|---|
| thin-context | B | 40 | 0.78% |
| date-conflict-or-unparseable | A0 | 29 | 0.57% |
| venue-mismatch-or-unknown | A0 | 21 | 0.41% |
| entity-resolution-uncertain | A0 | 12 | 0.24% |
| ticket-merchant-unverified | A0 | 10 | 0.20% |
| fabrication-temptation-resisted | B | 5 | — |
| credential-redirect-applied | B | 3 | — |
| incomplete-write | B | 3 | — |
| timeliness-stale-risk | B | 2 | — |
| neighborhood-mismatch | A0 | 0 | 0% |

---

## 2. Threshold definition

**Verbatim from `config/enrichment-gate-rules.yml`:**

> "If firing rate sustains >10% on any single rule, that rule is over-tuned (per S110f decision) — fix the rule, not the page-shape policy."

**Denominator interpretation (Step 0c.1):** YAML does not define the denominator. Three candidates:
- (a) per-rule firings / total events in corpus
- (b) per-rule firings / total A0 firings
- (c) per-rule firings / total event_concerns rows

This audit adopts **(a)** as the most conservative interpretation (largest denominator → smallest rate, most generous to rules). All four A0 concern_types currently fire well under 10% per interpretation (a): 0.20%–0.57%. Under (b) — denominator 72 — date-conflict at 40% would exceed the threshold; under (c) — denominator 105 — date-conflict at 28% would also exceed.

**Open question for Strategist:** which denominator was intended at S110f time?

---

## 3. Sample composition

10 representatives stratified per revised brief quotas (3/3/2/2 across 4 firing A0 categories).

| # | event_id | concern_type | source | venue | type | criteria satisfied |
|---|---|---|---|---|---|---|
| 1 | `7481fd1a657f60b0` | venue-mismatch-or-unknown | megaron.gr | Μέγαρο Μ.Α. | cinema | anchor (Verdi) + top src + top venue + cinema singleton |
| 2 | `e60d94163a647983` | venue-mismatch-or-unknown | onassis | Onassis Stegi | exhibition | onassis tail |
| 3 | `c5d4719c912329ac` | venue-mismatch-or-unknown | more.com | Ωδείο Αθηνών | concert | more.com src diversity |
| 4 | `8ad40e93de76c87c` | date-conflict-or-unparseable | athinorama.gr | EXA | concert | anchor (EXA) + 90d+ tail |
| 5 | `429aa68f4ddabe58` | date-conflict-or-unparseable | megaron.gr | Μέγαρο Μ.Α. | concert | most common src+venue combo |
| 6 | `67c409b85485d06a` | date-conflict-or-unparseable | ticketservices | Μέγαρο Μ.Α. | concert | ticketservices src + top venue |
| 7 | `35c929644d13a7e0` | entity-resolution-uncertain | residentadvisor | B side Athens | dj_set | residentadvisor src |
| 8 | `a2d58b901950b989` | entity-resolution-uncertain | ticketservices | Gustav Athens | concert | diff src + concert type |
| 9 | `1492b75165bfe100` | ticket-merchant-unverified | residentadvisor | Bolivar | dj_set | residentadvisor + Bolivar venue |
| 10 | `eeac5fc6a5d8b619` | ticket-merchant-unverified | athinorama.gr | Piraeus Club Academy | concert | also carries date-conflict |

Stratification gaps: none. All quotas filled with layered criteria satisfied. Source coverage: 6 of 7 sources in cohort represented (missing: clubber.gr).

---

## 4. Per-representative inspection

### 4.1 `7481fd1a657f60b0` — Verdi "Nabucco" Unitel screening (venue-mismatch-or-unknown)

- **Source:** megaron.gr · **Venue field:** Μέγαρο Μουσικής Αθηνών · **Type:** cinema · **Date:** 2026-06-25T20:30:00
- **Description excerpt:** "You arrive at the Megaron after sundown. The 4.5-acre garden is lit for screening... Verdi's 'Nabucco' begins."
- **Concern text:** "Megaron event page locates this Unitel screening in the outdoor Garden of the Megaron (Κήπος του Μεγάρου), not the indoor halls. The brief venue 'Μέγαρο Μουσικής Αθηνών' is correct as the institution but the sub-location matters... Description includes the garden detail; flagging in case the system needs a sub-location field."
- **Apparent sub-rule:** sub-location attribute mismatch (NOT a true venue-unknown or capacity-conflict)
- **Registry check:** `Μέγαρο Μουσικής Αθηνών` IS canonical in `athens-venues.json` with 11 variations including Aithousa-specific entries.
- **Classification:** **FP**
- **Justification:** Venue IS in registry. Description correctly names institution AND sub-location (garden). The concern is a feature-gap signal (no sub-location field) misclassified as a venue mismatch — agent over-emitted.

### 4.2 `e60d94163a647983` — Tilda Swinton "Ongoing" at Onassis Ready (venue-mismatch-or-unknown)

- **Source:** onassis · **Venue field:** Onassis Stegi (Andrea Siggrou 107-109) · **Type:** exhibition · **Date:** 2026-06-28
- **Description excerpt:** "Tilda Swinton — Ongoing closes 28 June 2026 at Onassis Ready, the gathering point for new and existing works..."
- **Concern text:** "DB stores venue as 'Onassis Stegi' but onassis.org page + existing exemplar confirm this exhibition runs at Onassis Ready (Strati Tsirka 2, Agios Ioannis Rentis), not Onassis Stegi (Syngrou). These are separate Onassis Foundation venues..."
- **Apparent sub-rule:** venue-identity mismatch (DB metadata names wrong physical venue)
- **Registry check:** `Onassis Stegi` IS canonical (Neos Kosmos); `Onassis Ready` NOT in registry.
- **Classification:** **correct suppression**
- **Justification:** Structured venue_name + venue_address would mislead users about physical location (Syngrou vs Rentis). Description names correct venue, but structured fields are wrong. Suppression prevents shipping incorrect metadata. Registry expansion (add Onassis Ready) is the underlying fix.

### 4.3 `c5d4719c912329ac` — Blade Runner Live at Herodion (venue-mismatch-or-unknown)

- **Source:** more.com · **Venue field:** Ωδείο Αθηνών (Rigillis & Vas. Georgiou) · **Type:** concert · **Date:** 2026-06-04T21:00:00
- **Description excerpt:** "The Final Cut of Ridley Scott's Blade Runner projects onto an HD screen inside the Odeon of Herodes Atticus on 4 June 2026..."
- **Concern text:** "DB stores venue as 'Ωδείο Αθηνών' but more.com page + multiple confirmed sources show this is part of the Odeon of Herodes Atticus (Herodion) Farewell Celebrations June 2026 program."
- **Apparent sub-rule:** venue-identity mismatch (DB names wrong venue entirely — Ωδείο Αθηνών and Odeon of Herodes Atticus are two distinct Athens venues)
- **Registry check:** `Ωδείο Αθηνών` IS canonical. Odeon of Herodes Atticus / Herodion not surfaced in grep but likely present.
- **Classification:** **correct suppression**
- **Justification:** Two distinct venues, distinct addresses. Description correct; structured venue field wrong. Suppression appropriate. Fix is upstream scraper/normalizer at more.com adapter.

### 4.4 `8ad40e93de76c87c` — EXA anti-Valentine punk/hip-hop (date-conflict-or-unparseable)

- **Source:** athinorama.gr · **Venue:** EXA · **Type:** concert · **Date:** 2027-02-13
- **Description excerpt:** "The night before Valentine's Day, EXA opens at Ierofanton 13 for a special anti-Valentine punk and hip hop bill — pre-sale seven euros, nine at the door."
- **Concern text:** "Brief specifies 2027-02-13 but athinorama source page and neolaia ticket page (URL slug /event/2026-02-13/) both reference February 2026 dates... scraper may have grabbed a 2026 page and date-shifted to 2027 incorrectly. Verify with EXA directly before publish."
- **Apparent sub-rule:** date conflict (brief vs source disagree; URL slug evidence supports source)
- **Classification:** **correct suppression**
- **Justification:** Date genuinely contradictory. URL slug strongly suggests scraper year-shift bug. Suppression prevents shipping an event with wrong year. Fix is scraper-side year disambiguation.

### 4.5 `429aa68f4ddabe58` — Megaron children's sound workshop (date-conflict-or-unparseable)

- **Source:** megaron.gr · **Venue:** Μέγαρο Μουσικής Αθηνών · **Type:** concert · **Date:** 2026-05-09T20:30:00
- **Description excerpt:** "...children's sound workshop at Megaron Mousikis Athens on Saturday 9 May 2026. Admission with ticket."
- **Concern text:** "Brief shows 2026-05-09T20:30:00 but source page indicates 11:00 start time and three Saturdays (9, 16, 23 May 2026). Megaron scraper appears to be defaulting to a 20:30 concert slot when source time is non-standard."
- **Apparent sub-rule:** time-of-day default-fallback bug (also type misclassification per associated `incomplete-write` concern)
- **Classification:** **correct suppression**
- **Justification:** Structured time wrong (20:30 vs 11:00). Single-event representation collapses 3-Saturday workshop. Multiple data-quality issues. Suppression appropriate. Fix is scraper-side time handling + recurrence support.

### 4.6 `67c409b85485d06a` — Tropicality concert at Megaron (date-conflict-or-unparseable)

- **Source:** ticketservices · **Venue:** Μέγαρο Μουσικής Αθηνών · **Type:** concert · **Date:** 2026-05-17T20:00:00
- **Description excerpt:** "«Τροπικότητας από-ηχοι» is a concert at Megaron Mousikis Athinon, in Ilisia, Athens, on 17 May 2026 at 20:00."
- **Concern text:** "WebFetch on source ticketservices.gr/event/14504 returned event date 17 June 2026; brief metadata says 17 May 2026; Megaron's published calendar lists neither — date in description follows brief but unresolved."
- **Apparent sub-rule:** date conflict (brief vs upstream source disagree; canonical venue source doesn't list either)
- **Classification:** **correct suppression**
- **Justification:** Date conflict unresolved across three sources. Description follows brief metadata which may be wrong. Suppression appropriate until resolution.

### 4.7 `35c929644d13a7e0` — Groovepulse X HEB SED at B side (entity-resolution-uncertain)

- **Source:** residentadvisor · **Venue:** B side Athens · **Type:** dj_set · **Date:** 2026-05-09T22:00:00
- **Description excerpt:** "B side has held its position on Mavrokordatou 6 in Exarcheia since 2018... Saturday, May 9, the room belongs to Groovepulse X HEB SED..."
- **Concern text:** "HEB SED is described on Instagram (@hebsed_electronicmusic) as a project by @syback.music and @manzanares_moreno; full real names and base city were not confirmable via web search. Description treats them as the collaborative project on the bill without geographic claim."
- **Apparent sub-rule:** artist real-name/origin unverified, but project handle + collaborator handles known
- **Classification:** **borderline**
- **Justification:** Entity is partially identified (Instagram handle + two collaborator handles confirmed). Description handles the gap correctly — describes the project without fabricating names/origin. Hard-stop fires per rule, but description shows no fabrication occurred → suppression is over-cautious for this specific case. Underlying issue is the resolver threshold treating "real name unknown but handle confirmed" as full uncertainty.

### 4.8 `a2d58b901950b989` — Santouri trio at Gustav (entity-resolution-uncertain)

- **Source:** ticketservices · **Venue:** Gustav Athens · **Type:** concert · **Date:** 2026-05-13T21:00:00
- **Description excerpt:** "Santouri leads, lute and clarinet around it, and partway through the night Christos Tsiamoulis joins on oud and voice — the shape of «Σαντουρισμοί» at Gustav Athens on 13 May 2026, doors 20:30, set 21:00."
- **Concern text:** "Santouri trio members not named in retrieved sources — WebFetch returned plausible but unverified names which were discarded. Christos Tsiamoulis is verified as guest. Trio referred to generically as 'santouri trio' rather than naming uncertain players."
- **Apparent sub-rule:** ensemble member resolution incomplete, guest verified
- **Classification:** **borderline**
- **Justification:** Agent explicitly says it discarded unverified names. Guest is verified. Description uses generic descriptor for trio without naming uncertain members — exactly the desired fallback behavior. Concern fires per rule, but description shows correct anti-fabrication discipline → suppression is over-cautious for the specific case.

### 4.9 `1492b75165bfe100` — Mayans with Coeus at Bolivar (ticket-merchant-unverified)

- **Source:** residentadvisor · **Venue:** Bolivar · **Type:** dj_set · **Date:** 2026-05-14T21:00:00
- **Description excerpt:** "Thursday 14 May 2026, 21:00 — Mayans returns to Bolivar Beach Bar in Alimos with Coeus headlining..."
- **Concern text:** "No direct purchase page located for this Mayans w/ Coeus date — Bolivar typically sells at door or via venue site. RA event page returned 403. Door-pricing language used per Bolivar venue intel (€6-8 local-event range)."
- **Apparent sub-rule:** RA implicit merchant (source=ra.co) unverifiable due to 403; substitution ladder fired → door-pricing fallback used
- **Registry check:** `ra.co` IS in `ticket-source-classification.json` known_merchants.
- **Classification:** **borderline**
- **Justification:** Merchant verification did fail (403) so rule emission is technically correct, but the substitution ladder fired exactly as designed (no merchant named in description, door-pricing language used). Suppression duplicates the safety the substitution ladder already provided. Fix is rule-side: don't hard-stop when substitution ladder produced merchant-less output.

### 4.10 `eeac5fc6a5d8b619` — Nine Below Zero at Piraeus Club Academy (ticket-merchant-unverified)

- **Source:** athinorama.gr · **Venue:** Piraeus Club Academy · **Type:** concert · **Date:** 2026-12-04T20:00:00
- **Description excerpt:** "Originally booked for 17 April, Nine Below Zero's Athens night now lands at Piraeus Club Academy on Friday 4 December 2026 at 20:00 — original April tickets remain valid."
- **Concern text (primary):** "Athinorama lists more.com as merchant for Nine Below Zero tickets EUR 25-32, but no direct event purchase URL surfaced through web search; ticket_url_discovered omitted."
- **Secondary concern (date-conflict):** "Event was rescheduled from 17 April 2026 to 4 December 2026 per rockoverdose.gr; brief shows 2026-12-04 which matches the new date, but original April tickets remain valid per source."
- **Apparent sub-rule:** merchant named by aggregator but specific event URL unconfirmed; substitution ladder omitted merchant from description
- **Registry check:** `more.com` IS in known_merchants.
- **Classification:** **borderline** (for primary ticket-merchant concern)
- **Justification:** Merchant (more.com) in classification JSON. Direct URL absent but description didn't name it (`ticket_url_discovered omitted`). Substitution ladder fired correctly. Similar pattern to #9: hard-stop duplicates substitution safety. Secondary date-conflict is actually informational (reschedule notice, not a true conflict) → suggests date-conflict-or-unparseable also over-fires for reschedule cases.

---

## 5. Aggregate FP rates

### Per-concern_type classification breakdown

| concern_type | n | correct | borderline | FP | FP+borderline rate |
|---|---|---|---|---|---|
| venue-mismatch-or-unknown | 3 | 2 | 0 | 1 | 33% (1/3) |
| date-conflict-or-unparseable | 3 | 3 | 0 | 0 | 0% (0/3) |
| entity-resolution-uncertain | 2 | 0 | 2 | 0 | 100% (2/2) |
| ticket-merchant-unverified | 2 | 0 | 2 | 0 | 100% (2/2) |
| **total** | 10 | 5 | 4 | 1 | 50% (5/10) |

### Firing rates vs 10% over-tuning threshold (interpretation (a): per-rule firings / corpus = 5,096)

| concern_type | firings | rate (a) | over 10%? |
|---|---|---|---|
| date-conflict-or-unparseable | 29 | 0.57% | no |
| venue-mismatch-or-unknown | 21 | 0.41% | no |
| entity-resolution-uncertain | 12 | 0.24% | no |
| ticket-merchant-unverified | 10 | 0.20% | no |

**Under interpretation (a), no concern_type exceeds the project's 10% threshold.** Under interpretation (b) — per-rule / total A0 firings (72) — date-conflict at 40% would.

---

## 6. Verdi + EXA classifications (explicit)

- **Verdi (`7481fd1a657f60b0`):** classified **FP**. Venue is registered; concern was a sub-location attribute mismatch misclassified as venue-unknown. Agent over-emitted.
- **EXA (`8ad40e93de76c87c`):** classified **correct suppression**. Date genuinely contradictory across sources; URL slug evidence supports scraper year-shift bug.

---

## 7. Strategist prior tests

### Original 2-way prior

> "venue-mismatch sub-rules more likely to over-fire than date-conflict sub-rules"

- venue-mismatch FP+borderline: 33% (1/3)
- date-conflict FP+borderline: 0% (0/3)

**Result: supports the prior** at this sample size. Directionally clear. Statistical significance not meaningful at n=3 per arm.

### Revised 4-way prior (variant-load vs mechanical surfaces)

> "Variant-load surfaces (venue-mismatch + entity-resolution) more likely to over-fire than mechanical surfaces (date-conflict + ticket-merchant)"

- variant-load combined FP+borderline: (1+2)/(3+2) = 60% (3/5)
- mechanical combined FP+borderline: (0+2)/(3+2) = 40% (2/5)

**Result: weakly supports the prior**, but the framing breaks down at the ticket-merchant axis — ticket-merchant is mechanical-looking but produced 100% borderline because of substitution-ladder redundancy, not variant load. The 4-way prior's clean "variant vs mechanical" split doesn't match the actual failure modes observed.

**Reframe suggestion for Strategist:** the cleaner axis observed in this sample is **"agent over-emission when fallback handled the case"** (which hits entity-resolution and ticket-merchant — both 100% borderline) **vs. "structurally accurate concern emission"** (which hits date-conflict at 0% borderline and venue-mismatch at 33% mixed). This is an audit observation, not a Strategist call.

---

## 8. Concern_text sub-rule patterns observed

**venue-mismatch-or-unknown (n=3):**
- 1× sub-location attribute mismatch (Verdi: garden vs indoor)
- 2× venue-identity mismatch — DB stores wrong physical venue, description correct (Tilda → Onassis Ready not Stegi; Blade Runner → Herodion not Ωδείο Αθηνών)
- 0× venue-unknown (the "-or-unknown" arm did not fire in sample)
- 0× capacity/neighborhood conflict

**date-conflict-or-unparseable (n=3):**
- 1× year-shift scraper bug (EXA: 2027 vs 2026 URL slug)
- 1× time-of-day default-fallback bug + recurrence collapse (Megaron kids: 20:30 vs 11:00 across 3 Saturdays)
- 1× cross-source date disagreement, no canonical resolution (Tropicality: May vs June)
- 0× unparseable raw text (the "-or-unparseable" arm did not fire in sample)
- 0× end < start logical conflict

**entity-resolution-uncertain (n=2):**
- 2× partial identification (handle/role confirmed, real names unknown); description used careful generic descriptor; no fabrication

**ticket-merchant-unverified (n=2):**
- 2× merchant in registry, direct event URL unconfirmed, substitution ladder fired correctly (description didn't name merchant)

**Pattern signal:** the disjunctive "-or-" suffixes in concern_type names did not equally surface. Venue-mismatch fired entirely on the "mismatch" arm (0 unknowns); date-conflict fired entirely on the "conflict" arm (0 unparseables). Suggests the unknown/unparseable arms either rarely occur in practice or are absorbed by different rules upstream.

---

## 9. Statistical-power caveat

n=10 across 4 categories yields 2–3 representatives per category. **All per-concern_type FP rates are directional at best.** 100% borderline rates for entity-resolution (2/2) and ticket-merchant (2/2) are consistent within the sample but cannot be extrapolated to the full 12-event and 10-event cohorts respectively without wider sampling. Confidence intervals at n=2 span essentially [0%, 100%]. If precision is needed for routing decisions, Strategist should call for an expanded audit (≥5 per category, n=20+).

---

## 10. Recommendations (framing only — no rule changes proposed)

Strategist's calibration call has the following inputs from this audit:

**Per-concern_type FP+borderline rates (n=10):**
- venue-mismatch-or-unknown: 33%
- date-conflict-or-unparseable: 0%
- entity-resolution-uncertain: 100%
- ticket-merchant-unverified: 100%

**Firing rates vs 10% threshold (interpretation a):** all four well under threshold (0.20%–0.57%).

**Anchor verdicts:**
- Verdi: FP
- EXA: correct suppression

**Prior tests:**
- 2-way (venue > date on FP): supported, directionally
- 4-way (variant > mechanical on FP): weakly supported but framing doesn't match observed failure modes; substitution-ladder-redundancy emerged as a cleaner explanatory axis

**Strongest false-positive concentrations:**
- Substitution-ladder-redundancy: hard-stop firing when substitution ladder already neutralized fabrication risk (n=4: HEB SED, Santouri, Mayans, NBZ — all 4 of entity-resolution and ticket-merchant borderlines)
- Sub-location attribute misclassification: Verdi (n=1)

**Decision shape per Strategist's locked options:**
- **rules well-calibrated:** under interpretation (a), all four under 10% firing threshold — supports dismissing the HARDSTOP_FIRING_RATE_EXCEEDED warning at the rule-level firing rate axis. Per-rep FP rates argue against it on the qualitative axis.
- **rules over-firing:** entity-resolution + ticket-merchant patterns suggest over-firing is concentrated when substitution ladder fires. If interpretation (b) is correct (denominator = total A0 firings), date-conflict at 40% exceeds threshold structurally.
- **mixed:** most consistent with the data — date-conflict + venue-mismatch (mostly correct suppression) calibrated well; entity-resolution + ticket-merchant suppress events the substitution ladder already protected.

---

## 11. Open questions for Strategist

1. **Threshold denominator (Step 0c.1):** which of (a) / (b) / (c) was intended by S110f's "firing rate >10%" language? Audit assumed (a); the answer materially changes whether the warning is structural or rate-driven.
2. **Substitution-ladder-redundancy:** is the design intent that hard-stop fires *in addition to* substitution ladder (defense in depth), or *only when* substitution ladder cannot resolve? If the former, entity-resolution + ticket-merchant 100% borderline is expected; if the latter, those rules need a "substitution-applied" exemption.
3. **Sub-location field:** the Verdi case surfaced a system-level gap (no sub-location for outdoor garden vs indoor hall events at the same venue). Is this in scope for a future schema add, or is the current solution (description embeds the sub-location) the intended design?
4. **DB-metadata vs description divergence:** Tilda + Blade Runner both have correct descriptions paired with wrong structured venue fields. The hard-stop catches this and suppresses, which is the intended safety. But the fix is upstream (scraper normalization or venue mapping). Should there be a separate concern_type for "description-vs-metadata divergence" to make the failure mode more legible?
5. **Sample expansion:** does the Strategist want a wider audit (n≥20) before routing, or are these directional findings sufficient for the May 29 calibration deadline?

---

## Audit boundary verification

- No edits under `src/` or `config/`. ✓
- No writes to `data/events.db`. ✓
- No commits. ✓
- Only files touched: this spec + `/tmp/hardstop-cohort.tsv` + `/tmp/audit-payloads.txt` + `/tmp/audit-concerns.txt` + `/tmp/audit-events.txt`. ✓
