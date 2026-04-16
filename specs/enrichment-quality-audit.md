# Enrichment Quality Audit

**Date**: 2026-04-15  
**Dataset**: 1,497 enrichment log entries across 514 enriched events  
**Source**: `data/events.db` tables `enrichment_log` + `enrichment_queue`

---

## 1. Issue Distribution (All Enriched Texts)

Every single enrichment log entry (1,497/1,497 = 100%) has at least one quality issue.

| Issue Code | Count | % of rows | Severity | Notes |
|---|---|---|---|---|
| MISSING_SECTION | 3,735 | 249.5% | warning | ~2.5 missing sections per row (practical block, tags, last verified) |
| SCHEMA_MISSING | 1,497 | 100.0% | warning | Schema.org JSON-LD never generated — universal gap |
| MISSING_PRACTICAL | 1,497 | 100.0% | warning | Missing time detail — universal gap |
| GENERIC_NO_EVENT_REFERENCE | 815 | 54.4% | warning | Description could apply to any event — no specific artist/title reference |
| NO_TIMELINESS | 788 | 52.6% | info | No "Why now?" hook — over half the descriptions |
| GENERIC_NO_VENUE_REFERENCE | 668 | 44.6% | warning | Premium descriptions should name the venue |
| NO_DIFFERENTIATION | 227 | 15.2% | info | No "Why this?" differentiation |
| NO_EXPERIENCE | 178 | 11.9% | info | Missing experiential/sensory content |
| TOO_LONG | 66 | 4.4% | warning | Exceeded maximum word count |
| NO_TABLE | 56 | 3.7% | warning | Missing Aspect/Details table |
| MULTIPLE_TABLES | 16 | 1.1% | warning | More than one table in description |
| LOW_SENSORY | 11 | 0.7% | warning | Insufficient sensory language |
| FACTS_IN_OPENING | 7 | 0.5% | warning | Facts before sensory hook in opening |
| HAS_MARKDOWN_TABLE | 4 | 0.3% | warning | Used markdown table (banned format) |
| OVER_MATRIX_MAX | 2 | 0.1% | warning | Exceeded matrix max word count |
| SPECULATION | 1 | 0.1% | warning | Contains speculative language |

### Key findings

- **Three universal issues**: SCHEMA_MISSING, MISSING_PRACTICAL, and MISSING_SECTION fire on 100% of entries. These are structural gates that the enrichment pipeline never satisfies — they are either false expectations in the gate checker or genuine missing steps.
- **The "generic" cluster** (NO_EVENT_REFERENCE + NO_VENUE_REFERENCE) hits ~50% of texts. Half the descriptions don't name the specific event or venue — a serious quality signal.
- **Timeliness** is missing in 52.6% of cases. The "Why now?" hook is the single most-missed editorial quality.
- **Actual content errors** (SPECULATION, FACTS_IN_OPENING, HAS_MARKDOWN_TABLE) are very rare (<1%). The subagent follows hard rules well.

---

## 2. Score Distribution

| Score | Count | % of total |
|---|---|---|
| 83 | 76 | 5.1% |
| 84 | 75 | 5.0% |
| 85 | 45 | 3.0% |
| 88 | 89 | 5.9% |
| 89 | 610 | 40.7% |
| 90 | 602 | 40.2% |

**Total**: 1,497 entries

### Key findings

- **81% of entries score 89-90** — a very tight clustering at the top of the range.
- **No entry scores below 83**. The floor is high.
- The bimodal cluster at 89/90 suggests the gate checker has a ceiling effect — most descriptions pass the same gates and fail the same gates, producing near-identical scores.
- The 83-85 cluster (13.1% of entries) represents the "lower tier" — likely missing more content gates.
- **No entries score 91+**, meaning the universal issues (SCHEMA_MISSING, MISSING_PRACTICAL, MISSING_SECTION) are hard-capping the score.

---

## 3. Score by Event Type

| Type | Avg Score | Count | Delta from mean |
|---|---|---|---|
| theater | 85.97 | 100 | -1.6 |
| exhibition | 86.40 | 5 | -1.2 |
| dj_set | 86.54 | 103 | -1.0 |
| workshop | 87.13 | 23 | -0.4 |
| cinema | 87.50 | 4 | 0.0 |
| show | 87.56 | 36 | +0.0 |
| concert | 87.95 | 193 | +0.4 |
| festival | 88.00 | 5 | +0.4 |
| performance | 88.43 | 35 | +0.8 |
| sports | 88.74 | 34 | +1.2 |
| dance | 89.00 | 9 | +1.4 |
| tech | 89.50 | 2 | +1.9 |

**Mean across all types**: ~87.6

### Key findings

- **Theater scores lowest** (85.97) — likely because theater descriptions have the most demanding structural requirements (hybrid/full-8-section) but many are short-form stubs.
- **DJ sets also score low** (86.54, n=103) despite being a large category. The stub-length targets (80-120 words) collide with quality gates that expect venue references and timeliness hooks.
- **Concerts are the workhorse** (n=193) and score near-mean, suggesting the pipeline is tuned best for this type.
- **Small-sample types** (tech n=2, cinema n=4, exhibition n=5) are unreliable for conclusions.

---

## 4. Word Count Distribution vs Matrix Targets

### Matrix targets (from `enrichment-matrix.ts`):

| Category | Min | Max | Structure |
|---|---|---|---|
| exhibition | 200 | 300 | hybrid |
| concert_major | 120 | 200 | hybrid |
| concert_local | 80 | 120 | three-part-block |
| kids_family | 120 | 180 | hybrid |
| festival_parent | 250 | 400 | full-8-section |
| festival_sub | 80 | 150 | three-part-block |
| theater_ancient | 180 | 250 | hybrid |
| theater_contemporary | 120 | 180 | hybrid |
| premium_showcase | 400 | 600 | full-8-section |
| default | 120 | 200 | hybrid |

### Average word counts from enrichment_log:

| Type | Avg Words | Min | Max | Count | Expected Range | Verdict |
|---|---|---|---|---|---|---|
| cinema | 359 | 168 | 590 | 4 | 120-200 | OVERSHOOTS by ~80% |
| concert | 404 | 92 | 599 | 193 | 80-200 | OVERSHOOTS — most are written at premium length |
| dance | 570 | 570 | 570 | 9 | 120-200 | MASSIVELY OVERSHOOTS (2.8x max) |
| dj_set | 253 | 93 | 596 | 103 | 120-200 | OVERSHOOTS by ~30% on average |
| exhibition | 313 | 209 | 597 | 5 | 200-300 | Slightly over (313 vs 300 max) |
| festival | 334 | 292 | 356 | 5 | 80-400 | IN RANGE |
| performance | 456 | 126 | 599 | 35 | 120-200 | OVERSHOOTS (2.3x max) |
| show | 411 | 155 | 602 | 36 | 120-200 | OVERSHOOTS (2x max) |
| sports | 512 | 167 | 572 | 34 | 120-200 | MASSIVELY OVERSHOOTS (2.6x max) |
| tech | 525 | 500 | 549 | 2 | 120-200 | MASSIVELY OVERSHOOTS |
| theater | 213 | 120 | 594 | 100 | 120-250 | IN RANGE (borderline) |
| workshop | 554 | 529 | 576 | 23 | 120-200 | MASSIVELY OVERSHOOTS (2.8x max) |

### 10 random samples:

| Type | Title | Words | Target | Verdict |
|---|---|---|---|---|
| performance | Ο Λούτσιο και το ταξίδι στον πλανήτη Κιαροσκούρο | 308 | 120-200 | OVER |
| concert | Leon of Athens | 532 | 80-200 | OVER |
| theater | Το ταξίδι της Σοφίας στις 4 εποχές | 168 | 120-180 | OK |
| theater | Ο γύρος του κόσμου με πέντε παραμύθια | 158 | 120-180 | OK |
| concert | Ηρώ Σαΐα | 592 | 80-200 | MASSIVELY OVER |
| concert | Διψάω | 533 | 80-200 | OVER |
| dj_set | Astron Club Night with Claudio PRC | 116 | 120-200 | OK |
| theater | Δον Κιχώτης | 160 | 120-180 | OK |
| performance | Rejuv pres. Solace pre-party | 555 | 120-200 | OVER |
| theater | Όταν ο Μίκης ήταν παιδί | 154 | 120-180 | OK |

### Key finding

**The subagent systematically over-writes.** 8 of 12 event types overshoot their matrix target on average, some by 2-3x. The only types consistently in range are theater and festival. The "HARD CONSTRAINT" language in the brief is not being enforced effectively — the gate only flags TOO_LONG on 4.4% of entries despite the average overshoot being massive, suggesting the TOO_LONG threshold is set too high (likely using `premium_showcase` max of 600 as a universal cap instead of the per-event matrix target).

---

## 5. Timeliness Comparison

### 5 texts flagged NO_TIMELINESS (missing "Why now?" hook):

**1. Η βασίλισσα των πάντων** (concert)
> I Vasilissa ton Panton is a baby theater performance at the Athens Concert Hall in Ambelokipoi, Athens, running through 10 May 2026. You lower yourself onto a floor cushion and your child sits in your lap, eye-level with the performer.

**2. Ο Κήπος του Επίκουρου** (exhibition)
> O Kipos tou Epikourou is a painting exhibition by Erietta Vordoni at Megaron Mousikis Athinon in Ampelokipoi, Athens, on 30 March 2026. Forty canvases in oil and mixed media line the walls...

**3. Μυρτώ Βασιλείου** (concert)
> Myrto Vasiliou performs at Stavros tou Notou Plus in Neos Kosmos, Athens, on 6 March 2026. You settle into a room built for close listening...

**4. By Heart | Tiago Rodrigues** (performance)
> Ten people sit on stage who were in the audience five minutes ago. They do not know each other...

**5. Rave Ritual** (dj_set)
> Rave Ritual is a DJ set at Temple in Gazi, Athens, on 27 March 2026. You descend to the basement and the Funktion-One catches your ribcage...

### 5 texts WITHOUT NO_TIMELINESS (pass timeliness gate):

**1. Ντενεκεδούπολη ξανά!** (concert)
> Ntenekedoupoli xana! To megalo taxidi tou Meleniou is a children's performance with live music at the Michael Cacoyannis Foundation in Tavros, Athens, running Sundays through 29 March 2026. Fifty years after Eugenia Fakinou created Ntenekedoupoli — an object theater that premiered in 1975 and ran until 1982...

**2. Όλοι Μαζί Μπορούμε** (sports)
> Oloi Mazi Mporoume: Agones gia to Perivallon is a trail running event on Mount Hymettus near Athens on 29 March 2026... The All Together We Can foundation returns for its third consecutive year...

**3. ΤΖΑΜΑΛ** (concert)
> Ten years ago, Ilias Prassas released I Favela — a debut album that marked the start of Tzamal's solo run... Tzamal celebrates that decade...

**4. Street Rituals with IMPVLSIV** (dj_set)
> Street Rituals with IMPVLSIV is a DJ set at B side Athens near Omonia... Street Rituals is a recurring format...

**5. 170 τετραγωνικά / Moonwalk** (theater)
> ...now in its seventh consecutive season, with over 450 performances and the Dimitris Horn Award...

### What the gate considers "timely"

The pattern is clear: **timeliness = temporal anchoring beyond just the event date**. The passing descriptions include phrases like:
- "Fifty years after..." (anniversary hook)
- "returns for its third consecutive year" (recurrence)
- "Ten years ago..." (milestone)
- "seventh consecutive season" (longevity)

The failing descriptions open with a citation anchor + date but provide no "why *now*" context. The gate appears to look for temporal markers that answer "why is this event happening at this moment?" rather than just "when is it?"

---

## 6. Enrichment Brief Template

The enrichment brief is generated by `scripts/generate-enrichment-brief.ts` (743 lines). Key sections of the prompt sent to subagents:

### Structure sent per batch:
1. **Verification checklist** — batch ID, event IDs, output directory, isolation rules
2. **17 rules** — 8-section structure, voice, word count targets, details table, filter section, show-don't-tell banned adjectives, no-speculation, tribe, logistics (no metro line numbers), closer, no-fabrication, terminology, description-only, venue openings (must verify via WebSearch), credentials (verify or omit), opening diversity, closer diversity
3. **Exemplar references** — 2-3 type-matched exemplar files from `exemplars/`
4. **Anti-patterns** — pointer to `docs/enrichment-anti-patterns.md`
5. **Entity locking** — cultural terms that must stay untranslated (rebetiko, bouzouki, steki, etc.)
6. **Recent openings** — last 15 opening sentences for dedup
7. **Per-event cards** — ID, type, venue, price, date, URL, source, category, target word range, structure, venue intel (or WebSearch instruction), entity knowledge
8. **Execution instructions** — research → write → gate check → tags → save decision (auto-save if all ≥80, else leave for review)

### Notable design choices:
- **Per-event word targets** are computed from `enrichment-matrix.ts` and printed as "HARD CONSTRAINT"
- **Venue intel** is looked up from `config/venue-intelligence.md` and included inline (max 200 words)
- **Entity knowledge** is pulled from the `entity_knowledge` table
- **Batch isolation**: each batch writes to its own `temp-descriptions/batch-N/` directory
- **Token budget**: ~4,000 tokens max per brief (estimated at 0.75 tokens/word)

---

## Summary & Recommendations

### Critical issues (fix these first):

1. **Word count enforcement is broken.** The subagent overshoots matrix targets by 2-3x on most types. The TOO_LONG gate fires at 4.4% but the actual overshoot rate is ~70%. The gate checker likely uses a global max (600) instead of the per-event matrix target. **Fix the gate checker to use per-event targets.**

2. **Three universal issues inflate all scores equally.** SCHEMA_MISSING, MISSING_PRACTICAL, and MISSING_SECTION fire on 100% of entries. These either need to be (a) actually generated by the pipeline, or (b) removed from the gate if they're aspirational. Their universal presence means scores are artificially depressed and can never exceed ~90.

3. **The "generic" description problem.** 54% of descriptions don't reference the specific event/artist. This is the biggest editorial quality gap. The brief's rule #14 (venue openings) and #15 (credentials) may be causing the subagent to over-index on atmosphere and under-index on specificity.

### Moderate issues:

4. **Timeliness gap.** 52.6% miss the "Why now?" hook. The passing examples show clear temporal anchoring (anniversaries, milestones, seasons). Consider adding a timeliness prompt injection: "For each event, identify one temporal fact that answers 'Why now?'"

5. **Score ceiling effect.** 81% of entries score 89-90. The scoring system lacks discrimination at the top. Once universal issues are resolved, the spread should widen.

### Low priority:

6. **Content rule violations are rare.** SPECULATION (0.1%), HAS_MARKDOWN_TABLE (0.3%), FACTS_IN_OPENING (0.5%) — the subagent follows hard rules well. The editorial quality gaps are in the "soft" areas.
