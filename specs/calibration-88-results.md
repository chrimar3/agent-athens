# Calibration Batch 88 — Rules 18-24 First-Draft Validation

**Date:** 2026-04-16
**Events:** 18 (12 in batch 8, 6 in batch 9)
**Types:** concert (6), theater (6), dj_set (6)
**Tiers:** three-part-block (8), hybrid (8), full-8-section (2)
**Exhibitions:** 0 (none in unenriched queue)
**Score range:** 92-98 (mean: 93.7)
**All 18 PASS.**

## Coverage Baseline (pre-calibration)

| Metric | Value |
|--------|-------|
| Total visible events | 677 |
| EN-enriched | 188 (28%) |
| Unenriched queue | 489 |

## Karagiozis Tier Clarification

Karagiozis (22ba18d16c103bb0) was briefed as **hybrid** (120-180w target). Landed at 183w — 3w over the 180 hard cap. Within +10% grace margin (ceiling 198w). **Passes Rule 18.** My earlier report incorrectly listed "3 full-8-section" — the actual count is 2 full-8-section, 8 hybrid, 8 three-part.

---

## A-E Calibration Matrix

| ID | Title | Tier | Words | Target | Gate | R18 wc | R19 struct | R20 entity | R21 given | R22 time | Notes |
|----|-------|------|-------|--------|------|--------|------------|------------|-----------|----------|-------|
| 8fadb917323e786c | Animal Farm | full-8 | 541 | 400-600 | 98 | ✓ | ✓ | ✓ (4x) | ✓ | T2: 3rd season return | Exemplary full-8. All 8 sections present. |
| e344a237f2e52577 | Easter Cantatas | full-8 | 486 | 400-600 | 98 | ✓ | ✓ | ✓ (4x) | ✓ | T3: Easter tradition, annual institution ambition | Strong credentials + venue context. Timeliness is T3 — "annual Easter institution" is contextual, not milestone. |
| 533a96a5b9f137c2 | Jesse Davis Quartet | hybrid | 192 | 120-200 | 93 | ✓ | ✓ | ✓ (2x) | ✓ | T1: new album Reflections (Apr 3) | Strong T1 hook. Insider detail (reservation policy, last-train warning) excellent. |
| c5edf1761e70ed83 | Η Παναγία Παρισίων | hybrid | 165 | 120-180 | 97 | ✓ | ✓ | ✓ (2x) | ✓ | T2: follows sold-out Les Mis seasons | Good credentials chain. |
| 1ebb98f2640008a4 | Τα γενέθλια Ριρίκας | hybrid | 159 | 120-180 | 93 | ✓ | ✓ | ✓ (3x) | ✓ | T2: 3rd consecutive season | Family continuity (father's theater) is a strong differentiator. |
| 36a2cce27c3042fc | Οι θεοί Ολύμπου | hybrid | 175 | 120-180 | 93 | ✓ | ✓ | ✓ (2x) | ✓ | T2: extended past original closing into spring 2026 | Scale differentiator (3,600-seat converted Olympic hall) well used. |
| 22ba18d16c103bb0 | Karagiozis | hybrid | 183 | 120-180 | 92 | ✓ (+3w, grace) | ✓ | ✓ (2x) | ✓ | T3: "This Sunday" + Aristophanes adaptation context | Spatharis successor credential is strong. Workshop detail is good insider. |
| 7294d250a3596169 | Around the World | hybrid | 158 | 120-180 | 92 | ✓ | ✓ | ✓ (2x) | ✓ | T3: "Sunday curtain" + school-holiday context | No-Greek-dialogue line is smart for international audience. |
| 8cd011f3b5af828a | Filippos+Decoup | hybrid | 175 | 120-180 | 92 | ✓ | ✓ | ✓ (3x) | ✓ | T3: Wednesday programming + 17 years of Dybbuk | "Arriving after 01:00 means fitting into gaps" is good insider. |
| 95ea8d015e43d7d9 | Psyvibes Sessions | 3-part | 114 | 80-120 | 97 | ✓ | ✓ | ✓ (2/3) | ✓ | T3: 7th edition, recurring residency | Filter section present even at 114w — impressive compression. |
| 5e2da0fcd930c916 | Organ-ization | 3-part | 121 | 80-120 | 92 | ✓ (+1w, grace) | ✓ | ✓ (2/3) | ✓ | T3: format context (Harlem organ trio tradition) | Craig Handy quote is strong attributed credential. Leslie cabinet detail is insider. |
| bad35f1453322e44 | ClubKid x Fragk | 3-part | 122 | 80-120 | 92 | ✓ (+2w, grace) | ✓ | ✓ (2/3) | ✓ | T3: 8-year residency since 2018 | Pizza-counter-above-club-below detail is excellent insider. |
| 6d568753a146934b | FM | 3-part | 100 | 80-120 | 93 | ✓ | ✓ | ✓ (2/3) | ✓ | T1: 40th anniversary of Indiscreet (1986) | Strong T1. Iron Maiden cover fact adds citability. |
| e624a795e4ffc11e | POSTPONED Cantina | 3-part | 101 | 80-120 | 93 | ✓ | ✓ | ✓ (2/3) | ✓ | T1: 20th anniversary (since 2006) | Handles postponement gracefully. Unmarked entrance is insider. |
| 6438ebf8b7d47477 | Warrel Dane tribute | 3-part | 112 | 80-120 | 93 | ✓ | ✓ | ✓ (2/3) | ✓ | T2: 4th consecutive year | Tight metal tribute piece. Late-start detail from venue KB. |
| ffa3d799775025cd | Shostakovich 120th | 3-part | 97 | 80-120 | 93 | ✓ | ✓ | ✓ (2/3) | ✓ | T1: 120th birth anniversary (born 1906) | Pre-electrification ceiling panels is excellent insider. Handled dj_set mislabel correctly. |
| 9815096a89946a7a | Mama Athens | 3-part | 117 | 80-120 | 92 | ✓ | ✓ | ✓ (2/3) | ✓ | T3: series since 2018, Cannibal Radio cohabitation | Cocktail-menu-by-frequency detail is great insider. |
| 0feba86fd441fe9f | I Leksi | 3-part | 99 | 80-120 | 93 | ✓ | ✓ | ✓ (2/3) | ✓ | T1: world premiere | Giordano Bruno framing gives the piece weight. SNFCC shuttle is insider. |

---

## Aggregate Compliance Rates

| Rule | Dimension | Pass | Rate | Notes |
|------|-----------|------|------|-------|
| R18 | Word count | 18/18 | 100% | 3 marginals within +10% grace (Karagiozis +3, Organ-ization +1, ClubKid +2). None >10% over. |
| R19 | Structure | 18/18 | 100% | All three-part blocks use 3 distinct moves. All hybrids use anchor+sections+closer. Both full-8 have complete section structure. No pre-Rule-19 failure (short events using 8 sections). |
| R20 | Entity anchoring | 18/18 | 100% | All ≤200w events have entity in 2+ of 3 sections. Both full-8 events have 4+ occurrences. No failures. |
| R21 | Given data first | 18/18 | 100% | All descriptions lead with Category 1 facts (title, artist, venue, genre, date) before atmospheric content. |
| R22 | Timeliness signal | 18/18 | 100% | Distribution: **Tier 1: 5** (FM 40th anniv, Shostakovich 120th, Jesse Davis new album, Cantina 20th anniv, I Leksi world premiere). **Tier 2: 4** (Animal Farm 3rd season, Panagia follows Les Mis, Ririkas 3rd season, Warrel Dane 4th year). **Tier 3: 9** (Easter Cantatas, Karagiozis, Around World, Filippos, Psyvibes, Organ-ization, ClubKid, Mama Athens, Gods of Olympus extended run). |

---

## Timeliness Signal Distribution (Rule 22 deep dive)

Per your flag: timeliness signals land 100% but quality skews toward Tier 3.

- **Tier 1 (milestone/anniversary/premiere): 5/18 (28%)**
- **Tier 2 (season count/sold-out follow-up): 4/18 (22%)**
- **Tier 3 (contextual/recurring/calendar): 9/18 (50%)**

Tier 3 dominance is partially structural: 8 of the 18 events are concert_local or dj_set with limited public history, making Tier 1/2 hooks genuinely unavailable. Of the 9 Tier-3 descriptions, at least 3 could arguably be upgraded:
- **Gods of Olympus** (36a2cce27c3042fc): "extended past original closing" could be framed as Tier 2 ("extended run due to demand") — the language is there but the emphasis is soft.
- **Easter Cantatas** (e344a237f2e52577): Easter timing is inherently seasonal (T3), but "establishing annual institution" could be framed as inaugural year if this is the first edition — research didn't clarify.
- **ClubKid** (bad35f1453322e44): "8-year residency since 2018" could be Tier 1 (anniversary) if framed as "eighth anniversary."

**Pattern:** The subagent tends to state duration facts without framing them as milestones. "Since 2018" is factually T1 (8th anniversary) but written as T3 (contextual duration). This is a brief-language issue, not a rule-compliance issue — the signal is present, the framing undersells it.

---

## Patterns Observed

### What lands cleanly (no enforcement needed):
1. **Citation anchor** — 18/18 use declarative "is" first sentence. This rule is fully internalized.
2. **Entity anchoring (R20)** — 18/18 pass. The brief's threshold instructions (2/3 for short, 3+ for long) are followed precisely.
3. **Structure matching tier (R19)** — 18/18 correct. No three-part block tries to be a mini-8-section. No full-8 event is truncated.
4. **Filter section** — Present in 16/18 descriptions, including several three-part blocks where it's not required. The "If you... / If you..." pattern is a signature strength.
5. **Facts before atmosphere (R21)** — 18/18. The brief's instruction to exhaust Category 1 facts first is well-followed.

### What works but could be sharper:
1. **Timeliness framing** — Signals present 18/18, but 50% are Tier 3. The subagent states temporal facts without escalating them to milestone framing.
2. **Word count precision** — 3 events land 1-3 words over hard cap. Grace margin absorbs this, but the "cut whole paragraphs" instruction (R18) may not fire when the overshoot is trivial.

### What fights the subagent's instincts:
1. **Closer diversity** — Closers are consistently strong and event-specific, but several use the same structural pattern: "[duration] + [scarcity/uniqueness phrase]." This is compliant with Rule 17 (no repeated "combination" or "will not reassemble") but stylistically convergent.

---

## Anomalies

1. **FM (6d568753a146934b)**: Missing citation anchor city name — "returning to Athens" appears in body but not the opening "is" sentence. Opens with "FM is a British AOR band returning to Athens to play their 1986 debut..." — technically the anchor is there but "Athens" is in a subordinate clause, not the declarative frame. Minor.

2. **POSTPONED Cantina (e624a795e4ffc11e)**: Correctly handled as a postponement notice rather than a standard description. Gate still scored 93/100. Question: should postponed events be enriched at all, or should they be flagged for queue removal?

3. **Crust neighborhood (bad35f1453322e44)**: Agent flagged that `athens-venues.json` lists Crust's neighborhood as "Koukaki" when it should be "Psyrri" (address: Protogenous 13). This is a data bug, not a description issue.

---

## Dimension F: Insider Detail (Rule 24) — Pending Enrichment Writer Review

The 18 description files have been copied to `specs/calibration-88-samples/` for the Enrichment Writer's independent Rule 24 audit.

**Preliminary observations from A-E review** (not authoritative — the Enrichment Writer's audit is):

- Both full-8-section events contain strong insider details:
  - Animal Farm: Yiannis Marinos Hall eye-level seating, aisle-clustering for families, peripheral sightlines for small viewers
  - Easter Cantatas: Lilian Voudouri Music Library (largest in southern Europe), unamplified acoustics in Teaching Hall
- Hybrid events generally include at least one insider detail (venue KB data or researched detail)
- Three-part blocks vary: some have excellent insider (Shostakovich ceiling panels, ClubKid pizza counter, Mama Athens frequency cocktails), others lean on venue KB facts (Psyvibes uses IT Athens capacity/entry range)
- No "insider omitted: topical load" was logged by any agent. Zero omissions claimed.

---

## Decision Recommendation

**Scenario A — Clean across the board.**

- Rules 18-22: **100% compliance** (18/18 on all five dimensions)
- No systemic failures
- No rule conflicts surfaced
- Gate scores: all ≥ 92, mean 93.7

**Recommendation:** Proceed to save after Enrichment Writer's Rule 24 audit confirms no systemic insider-detail issues. Next session: standard 15-event parallel enrichment.

**Conditional on:** Enrichment Writer does not independently push to Scenario C based on Rule 24 audit.

**Notes for next session:**
- Brief language tweak: encourage Tier 1/2 timeliness framing when duration facts are available (e.g., "8th anniversary" not "since 2018")
- Monitor word count precision — consider whether +1-3w marginals warrant a stricter post-write count instruction
- Fix Crust neighborhood in `athens-venues.json` (Koukaki → Psyrri)
- Decide policy on enriching postponed events (e624a795e4ffc11e)
