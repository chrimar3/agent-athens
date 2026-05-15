# Categorizer Audit — Megaron Plus Talk Misclassified as Concert

**Date:** 2026-05-14
**Trigger:** Live URL on agentathens.com — event `15e395128b7b285b` (Pavlopoulos AI/Justice discussion at Megaron Plus) breadcrumbed as **Συναυλία (Concert)**.
**Prior work:** `specs/categorization-audit.md` (Session 95, 2026-04-28) — system-wide source×type distribution. This audit is a narrow root-cause trace for a Megaron-specific failure mode that audit surfaced but did not deep-dive.
**Method:** Read-only — code reading + 1 DB row trace + 1 hand-classification of 34 rows + 3 sanity COUNT probes + grep across `src/` and `config/`.
**Source files modified:** none. Verified by `git status` post-write.
**Scheduled date of misclassified event:** 2026-05-29 (Παναθήναια demo date — credibility timing matters).

---

## A. Root-cause trace

### A.1 The specific event

```
id:              15e395128b7b285b
title:           Μύθοι και αλήθειες στην εποχή της Τεχνητής Νοημοσύνης
                 – Τεχνητή Νοημοσύνη και απονομή της Δικαιοσύνης
type:            concert            ← WRONG
venue_name:      Μέγαρο Μουσικής Αθηνών
source:          megaron.gr
url:             https://www.megaron.gr/event/mythoi-kai-alitheies-stin-...
start_date:      2026-05-29T20:30:00
enrichment_tier: stub
```

Format on the source page: panel discussion. Prokopis Pavlopoulos (former President of the Hellenic Republic, constitutional law professor) in conversation with Tasoula Eptakoili, opened by Nikiforos Diamantouros. The enrichment writer correctly framed it as "discussion … conversation, not lecture" in the description — making the breadcrumb mismatch visible on the published page.

### A.2 Walking the categorizer

The 4-pass categorizer at `src/categorizer/categorize-event.ts:409` (`categorizeEvent()`):

**Pass 1 — Venue lock** (`categorizeByVenue`, lines 230–271):
Megaron is listed in `config/venue-categories.json:115–121` `mixed_venues`. Check at lines 238–244 returns `null` (mixed venues are intentionally skipped to let title/keywords decide). **Correct skip.**

**Pass 2 — Keywords** (`categorizeByKeywords`, lines 276–342):
Iterates `priority_order` from `config/categorization-keywords.json`. Title contains "Τεχνητής Νοημοσύνης" (Artificial Intelligence), "Δικαιοσύνης" (Justice), "Μύθοι" (Myths). None match any category's `title_keywords` (no Greek talk-class keywords exist anywhere in config — see Section C). Returns `null`. **Correct null** given the current config.

**Pass 3 — URL path** (`categorizeByUrl`, lines 348–365):
Iterates `config/url-category-patterns.json` patterns. Only three patterns exist (`/music/gig/`, `/tickets/theater/`, `/tickets/music/`). The event URL `/event/mythoi-kai-alitheies.../` matches none. Returns `null`.

> **Note on `_excluded_sources`:** Lines 4–8 of `url-category-patterns.json` list `"megaron.gr — flat /event/<slug>/ structure, no type signal"` under `_excluded_sources`. **This field is documentation-only — the categorizer code never reads it.** `categorizeByUrl` simply iterates `config.patterns`. The "exclusion" is purely *absence of matching patterns*. Conceptually correct outcome, but the brief's framing ("megaron.gr is in `_excluded_sources` of Pass 3") overstates the architecture's awareness — Pass 3 doesn't *know* megaron.gr is excluded, it just has nothing to fire on.

**Pass 4 — Source hints** (`categorizeBySource`, lines 370–397):
Reads `source_type_hints` from `config/venue-categories.json:181–184`. **The brief's hypothesis ("Megaron source-hint defaults to concert") is wrong** — `source_type_hints` contains only `clubber.gr` and `residentadvisor`. `megaron.gr` is absent. Returns `null`.

**Fallback** (lines 426–439):
```typescript
if (event.currentType && event.currentType !== 'other') {
  return { type: event.currentType, confidence: 'low', reason: 'No matching rules, kept current type' };
}
return { type: 'concert', confidence: 'low', reason: 'No matching rules, defaulted to concert' };
```

This is **decisive but not the upstream cause** — see A.3. The categorizer either preserves the type the scraper assigned (with low confidence) OR, if no `currentType` is set, hardcodes `'concert'`. Either way the event ends up `concert`.

### A.3 The upstream cause — the scraper, not the categorizer

The categorizer is *re-categorization* logic. It runs against rows already in the DB. The initial type comes from the scraper at `scripts/scrape-megaron.ts`.

**`scripts/scrape-megaron.ts:24`**:
```typescript
interface ScrapedEvent {
  ...
  type: 'concert' | 'theater' | 'dance';   // ← narrower than EventType union
  ...
}
```

**`scripts/scrape-megaron.ts:36–42`**:
```typescript
function categoryToType(category: string): ScrapedEvent['type'] {
  const lower = category.toLowerCase();
  if (lower.includes('μουσικ')) return 'concert';
  if (lower.includes('θέατρο') || lower.includes('θεατρ')) return 'theater';
  if (lower.includes('χορό') || lower.includes('χορ') || lower.includes('dance') || lower.includes('ballet')) return 'dance';
  return 'concert';  // ← DEFAULT for everything else
}
```

**`scripts/scrape-megaron.ts:106–107`**:
```typescript
const catMatch = card.match(/class="category-title"[^>]*>([^<]+)/i);
const type = catMatch ? categoryToType(catMatch[1].trim()) : 'concert';  // ← AND another default
```

megaron.gr's HTML provides `<div class="category-title">` text for each event card (likely `Συζήτηση`/`Ομιλία`/`Διάλεξη` for talk-class events, given Megaron Plus's programming). The scraper extracts this text, then maps it through `categoryToType`:

- "Συζήτηση" (discussion) → no match → `concert`
- "Ομιλία" (talk) → no match → `concert`
- "Διάλεξη" (lecture) → no match → `concert`

The scraper has **three concert defaults in 70 lines** (line 38 keyword match, line 41 fall-through, line 107 absent-category fallback) and a `ScrapedEvent['type']` union that has no member to express talk. Source-side category metadata is **actively discarded**.

### A.4 Validator role — dead code

`src/validators/event-categorizer.ts` exports a `categorizeEvent()` function distinct from the main categorizer. Of its exports, only `normalizeTheaterSpelling` is imported anywhere in `src/` or `scripts/` (`scripts/scrape-all.ts:39`). The validator's `categorizeEvent` and `recategorizeIfNeeded` are **not called by any production code path** for this event.

Additionally, the validator has dead venueHint logic at lines 207–215:
```typescript
if (rules.venueHints) {
  for (const hint of rules.venueHints) {
    if (venue.includes(hint.toLowerCase())) {
      // Only use venue hint if we haven't found a stronger match
      // Don't return immediately, continue checking
    }
  }
}
```
The comment says "continue checking" but the loop never returns and there's no follow-up branch — these venueHint matches are silently dropped. The validator's `performance.venueHints: ['dance', 'στέγη', 'megaron', 'onassis']` (line 38) and `tech.venueHints: ['megaron', ...]` (line 78) are functionally inert.

**Net:** there is effectively one classifier in this event's path (the main 4-pass), not two as the brief assumed. The validator is dead code for this event. This *narrows* Section E's shotgun-surgery scope but raises a separate cleanup question.

---

## B. Failure-mode class — scope of contamination

### B.1 Megaron, hand-classified

Query: `SELECT id, title FROM events WHERE venue_name LIKE '%Μέγαρο Μουσικής%' AND type='concert' AND start_date >= date('now') ORDER BY start_date` → **34 rows**.

Hand-classification by title (knowledge of Megaron Plus programming, Greek cultural-event naming conventions, and on-page evidence from megaron.gr where titles were ambiguous):

| Class | Count | % of 34 | Notes |
|---|---:|---:|---|
| Music-correct (genuinely concert) | 21 | 62% | Hadjidakis cycle, ELSON chamber, ERT National Symphony, Pittsburgh Youth Symphony, baroque gala (Cenčić), Paganini-winner Camerata Junior, Maraveyas, Encardia, Perris, Kalantzis, Idra Kayne, Storyville Ragtimers (Armstrong tribute), Greek Jazz–Standards, Καραβιώτης guitars-harp, Kalogerakia choir, Maraveyas, Burger Project garden party, Παπαδοδήμα vocal recital, Handel concertos, Γαλάζια Κυριακή ("A concert for everyone"), Divas Drive Trio, Maraveyas. |
| Talks / lectures / discussions | 3 confirmed + 2 ambiguous-leaning-talk | 9–15% | **Confirmed:** `15e39512` Pavlopoulos AI/Justice; `293f2e89` Tasios "Ancient Greek mythology and technology"; `44a392bd` "Music in Bosch's work" (Mundus inversus). **Ambiguous:** `60d8ea5f` "Music gives 'memory'" (scare-quoted), `2fd46546` "Dives into art". |
| Children's programs | 4 | 12% | `4b0d6f64` "AI and interactive music for children"; `1fff7b96` ANIMEGARON 2026 (anime); `0eef5542` "Labors of Heracles"; `50cff652` "Journey to the Center of Music". Likely `workshop` or `performance`, not `concert`. |
| Cinema screenings | 3 | 9% | `40948c02` Vienna Philharmonic **Προβολή Unitel** (filmed concert screening); `8dba6fd6` Donizetti Maria Stuarda **Προβολή Unitel**; `a92cfe09` Buster Keaton "The General" with live piano. |
| Festival | 1 | 3% | `4637db0d` Bobos Arts Festival — explicit festival in title. |
| **Total misclassification rate** | **11–13 / 34** | **32–38%** | Strict count = 11 (excludes ambiguous); inclusive = 13. |

**Headline finding:** roughly **one-third of megaron.gr concert-typed future events are not concerts**. The Pavlopoulos talk is not an isolated incident — it's representative.

### B.2 Source-side metadata is being discarded

The megaron.gr HTML provides explicit category text (`<div class="category-title">…</div>`). The scraper extracts it (`scrape-megaron.ts:106`) and immediately maps it through a 4-line keyword filter that funnels anything non-music/non-theater/non-dance into `concert`. The source signal is read and thrown away.

### B.3 Sanity probe — is this systemic across mixed_venues?

| Venue | concert-typed future rows | Note |
|---|---:|---|
| Rabbithole (incl. variants) | 0 | No leak — scraper either doesn't produce `concert` defaults or correctly categorizes. |
| Greek National Opera / Λυρική | 3 | Likely legitimate (opera IS music). |
| Christmas Theater | 0 | Likely few events at all, or correct scraper. |
| **Megaron Μουσικής (future, all types)** | **38 total: concert 34, theater 2, show 1, cinema 1** | Concert is wildly disproportionate. |

**Verdict: the contamination is Megaron-specific, not a general mixed_venue architectural problem.** The 4-pass categorizer's design (skip venue-lock for mixed_venues, defer to keywords/URL/source) is sound in principle — the failure is the upstream scraper for *one* source. This is good news for fix scope; it's bad news for the architecture's assumption that mixed_venues will surface their type via title keywords (Megaron Plus titles are precisely those that don't).

---

## C. Taxonomy-gap analysis

### C.1 Current `EventType` union

`src/types.ts:69–81`:
```typescript
export type EventType =
  | 'concert'      // Live music (incl. classical, jazz, opera, recitals)
  | 'dj_set'
  | 'exhibition'
  | 'cinema'
  | 'theater'
  | 'festival'
  | 'performance'  // Ballet, dance, experimental, spoken word
  | 'show'         // Cabaret, variety shows, stand-up comedy
  | 'workshop'
  | 'tech'         // Conferences, meetups, hackathons
  | 'dance'
  | 'other';
```

Same union duplicated in `.claude/CLAUDE.md` (canonical reference). 12 members.

### C.2 The gap

`grep -rn "'talk'|'lecture'|'discussion'|'panel'" src/ config/ --include='*.ts' --include='*.json'` (excluding `__tests__`): **zero hits.** No code path anywhere in `src/` or `config/` references these as event types.

### C.3 But the gap is already implicitly recognized

`src/validators/event-categorizer.ts:73–79` defines `tech` keywords:
```typescript
keywords: [
  'conference', 'summit', 'symposium', 'congress', 'συνέδριο',
  'meetup', 'meet-up', 'hackathon', 'hack-a-thon', 'coding challenge',
  'seminar', 'research talk', 'lecture series', 'networking event'
],
```

Note: `'seminar'`, `'research talk'`, `'lecture series'`, `'συνέδριο'`. **The codebase has been quietly folding talk-class events into `tech` because there was no better bin.** This is not "we never thought about talks" — it's "we noticed and stuffed them into the tech bucket because it's the closest existing fit."

Implication: the taxonomy decision is not "add `talk`" but "split `tech` into `talk` + `tech`" (or some refinement). A philosophy panel and a crypto meetup are both currently `tech`; they should not be.

### C.4 Questions for downstream stakeholders (out of scope for this audit)

| Question | Owner | Why this audit can't answer it |
|---|---|---|
| One bucket `talk` or several (`talk`/`lecture`/`panel`/`book_presentation`)? | Editorial Director | Typology depends on editorial voice and filter UX, not engineering |
| Schema.org `@type` mapping — `EducationEvent`? `Event` plain? Different per subtype? | GEO Strategist | Affects SEO + structured-data eligibility; this audit only flags the question |
| Filter chip presence, hub-page existence, URL slug (`/talks/`?) | Design Navigator | Downstream of typology decision |
| Should `tech` be split, kept as catch-all, or absorbed into `talk`? | Editorial Director | Editorial classification call |

---

## D. Prevention mechanisms — six options with tradeoffs

Ordered by sequencing (what to do first if you do anything at all):

### D.1 ⚠️ Live-event handling during fix-pending window

**This addresses the credibility concern that prompted the audit. Decision belongs to the user, not Dev Planner — this section enumerates the options.**

| Option | Cost | Recall | Risk | Sequencing |
|---|---|---|---|---|
| **a. Leave the event published as `concert`** | $0, immediate | 0% | Wrong breadcrumb on a live page coinciding with the Παναθήναια May 29 demo. Credibility cost compounds with each visitor who notices. | Default if no decision is made. |
| **b. Unpublish (mark `is_cancelled=1` or filter out) until taxonomy lands** | ~5 min one-off | 100% (for this event) | Loses a real, discoverable cultural event from the index during an indeterminate window (typology decision is gated on Editorial Director availability). Doesn't scale if 11–13 other events have the same issue. | Reversible. Honest about system state. |
| **c. Manual DB type override to least-wrong bin** | ~10 min one-off. **No `type_override` column exists** in the events schema — verified via `.schema events`. So this option requires either (i) an in-place UPDATE that the next scraper re-import would clobber, or (ii) a new column or `dedup_protected`-style flag mechanism. | High (for this event); precedent-setting for the others | Substitutes one wrong label for a less-wrong label (`performance`? `other`?). Still not honest. Needs a UI signal "type pending review" to be acceptable, which is a separate change. | Worst option unless paired with UI flag + scraper-respect logic. |

**Recommendation framing (not decision):** Given the May 29 demo timing, option (b) — unpublish until the taxonomy decision lands — is the most honest move with the lowest precedent cost. Apply it to the 3 confirmed talks (`15e39512`, `293f2e89`, `44a392bd`). The 4 children's programs and 3 cinema screenings can be handled in a separate sweep; they're misclassified but less embarrassing on a credibility-audit reading.

If demo timing pressures this further, option (c) with a `dedup_protected=1` flag (existing column, used elsewhere to prevent scraper overwrites) and a manual `UPDATE events SET type='other'` is the tactical bridge. `'other'` is more honest than `'performance'` for a talk.

---

### D.2 Long-term prevention mechanisms (the systemic fix)

#### Option 1 — Broaden the megaron.gr scraper's type union (cheapest, highest impact)
**File:** `scripts/scrape-megaron.ts:24, 36–42, 107`.
Change `ScrapedEvent['type']` from `'concert' | 'theater' | 'dance'` to the full `EventType` union. Extend `categoryToType()` to honor megaron.gr's actual category labels (`Συζήτηση`, `Ομιλία`, `Διάλεξη`, `Σινεμά`, `Παιδικό`, `Φεστιβάλ`, etc.).
- **Blast radius:** 1 file. **Recall:** ~100% (depends on category text availability). **Cost:** ~30 min + verification by re-scraping. **Sequencing:** unblocks correct typing without requiring taxonomy expansion — works with existing types (`workshop`, `cinema`, `festival`). For talks, it's blocked on the taxonomy decision.

#### Option 2 — Taxonomy expansion (`talk` / split `tech`)
**File:** `src/types.ts:69–81` + `.claude/CLAUDE.md` Data Model section + downstream (see Section E).
Add `'talk'` (or `'talk' | 'lecture' | 'panel'`) to the `EventType` union. Optionally split `'tech'` into `'tech'` (literal technology meetups) + `'talk'` (everything else currently stuffed in tech). Quote the prior critique: validator's `tech` keyword list already contains `'seminar'`, `'research talk'`, `'lecture series'` — the conceptual line is already drawn, just not in the type system.
- **Blast radius:** ≥10 files (see Section E). **Recall:** complete (eliminates the bin-doesn't-exist root cause). **Cost:** shotgun surgery — needs its own session. **Sequencing:** blocked on Editorial Director typology + GEO Strategist Schema.org mapping decisions.

#### Option 3 — Title-keyword secondary pass for Greek talk-keywords
**File:** `config/categorization-keywords.json`.
Add a category with keywords: `συζήτηση`, `ομιλία`, `διάλεξη`, `συνέδριο`, `ημερίδα`, `πάνελ`, `ομιλεί`, `παρουσιάζει το βιβλίο`, `keynote`. Route them to `'talk'` (requires Option 2 first) or `'tech'` (as a stopgap).
- **Blast radius:** 1 config file. **Recall:** moderate — depends on talk titles containing the keyword (the Pavlopoulos title doesn't — it says "Μύθοι και αλήθειες" with no talk-marker word). **Cost:** ~15 min. **Sequencing:** complementary to Option 1.

#### Option 4 — Megaron-specific URL-path exception
**File:** `config/url-category-patterns.json`.
If megaron.gr URLs encoded a series identifier (e.g., `/megaron-plus/`), add a pattern. Verified: they don't — flat `/event/<slug>/` confirmed. **Option not viable.**

#### Option 5 — Post-enrichment LLM-classifier correction pass
A pass that reads the enrichment description (which is written by an LLM that correctly identifies the format — the Pavlopoulos description explicitly said "discussion … conversation, not lecture") and adjusts the type accordingly.
- **Blast radius:** new script + DB write. **Recall:** highest (the LLM gets it right). **Cost:** highest (LLM API spend + pipeline integration + non-determinism risk). **Sequencing:** safety-net only — recommend only if Options 1+2+3 leave a long tail.

#### Option 6 — Generalize the "concerts-in-disguise" manual review checkpoint (already used in S73 for theater)
**File:** new manual-review script or existing `scripts/recategorize-events.ts` extension.
For events from `mixed_venues` sources, surface a low-confidence flag if the categorizer hits the literal fallback at `categorize-event.ts:435–438`. Send to manual review queue.
- **Blast radius:** 1–2 files. **Recall:** moderate. **Cost:** ~1 hour. **Sequencing:** immediately actionable; cheap insurance.

**Recommended sequencing:**
1. **Now (this session):** D.1 decision on live event handling.
2. **Next session:** Option 1 (scraper broadening) + Option 3 (Greek keyword pass routing to `tech` as stopgap). Both cheap, both immediate-recall.
3. **After typology decision lands:** Option 2 (taxonomy expansion + retarget Option 3's keywords to `talk`).
4. **Long tail:** Option 6 (review checkpoint) + Option 5 (LLM correction) if needed.

---

## E. Downstream fix scope — shotgun-surgery enumeration

**NOT executed in this session.** Listed so the implementation session can be scoped accurately. Numbered for tracking.

### Scraper-side (Option 1)
1. `scripts/scrape-megaron.ts` — broaden `ScrapedEvent['type']`, rewrite `categoryToType()` to honor megaron.gr's category-title text fully.
2. `scripts/scrape-megaron.ts` tests if any exist (verify in implementation session).

### Type system (Option 2)
3. `src/types.ts` lines 69–81 — `EventType` union expansion.
4. `.claude/CLAUDE.md` Data Model section — update canonical type list to match.
5. `docs/SYSTEM-REFERENCE.md` — DB schema / type docs (verify file exists; brief assumed it does).

### Categorizers
6. `src/categorizer/categorize-event.ts` — change the literal fallback at line 435–438 from `'concert'` to `'other'` (less misleading); update tests.
7. `src/categorizer/__tests__/categorize-event.test.ts` — fixtures + new talk-class tests.
8. `src/validators/event-categorizer.ts` — either (a) update `tech` keywords to split, (b) add `talk` category, or (c) **delete the file entirely if confirmed dead code** (only `normalizeTheaterSpelling` is imported). Verify via grep before deletion.

### Configs
9. `config/categorization-keywords.json` — Greek talk-keyword entries (Option 3).
10. `config/venue-categories.json` — consider adding `megaron.gr` to `source_type_hints` with a low-confidence default routing to manual review.
11. `config/url-category-patterns.json` — the `_excluded_sources` field is documentation-only; if the architecture wants this field to be active, the categorizer needs to read it. Currently it doesn't.

### Frontend / templates
12. Filter UI — grep `filter-bar` to find actual path; add talk chip if Option 2 lands.
13. Schema.org JSON-LD templates — `@type` mapping for talk-class events (Schema.org `Event`? `EducationEvent`?). Coordinate with GEO Strategist.
14. Hub routing — `hub-pages.json` (verify path) + hub generator. Talk hub page? Folded into another hub?
15. Breadcrumb type→label mapping — wherever `type` becomes Greek display text (`Συναυλία`, `Έκθεση`, etc.). New label needed for talk class.
16. URL canonicalization — type slugs (`/talks/`?). Affects sitemap.

### Data migration
17. Migration script — existing `type='concert'` rows that are actually talks/children/cinema/festival (~13 rows at Megaron, possibly more across other mixed_venues). Use the hand-classification in B.1 as the seed list.

### Documentation
18. `specs/categorization-audit.md` — supersede or cross-link from this audit.
19. `docs/known-issues.md` — add or update an entry per the workflow in `.claude/CLAUDE.md`.

**Estimated total scope: 15–19 files** (lower bound; more if the talk taxonomy splits into multiple types).

---

## F. Open questions surfaced by this audit

1. **Is `src/validators/event-categorizer.ts` dead code?** Only `normalizeTheaterSpelling` is imported anywhere. Either delete the rest or wire `categorizeEvent` into a path. Resolve before Section E item 8.
2. **Does `_excluded_sources` in `url-category-patterns.json` need to become functional**, or be deleted? It's currently a comment masquerading as data.
3. **Does the categorizer literal fallback `'concert'` at line 435–438 represent a deliberate design choice or a historical default?** Changing it to `'other'` would surface review-needed signal without changing recall on rules-matched events. Cheapest improvement of any option here.
4. **Are the other 11–13 Megaron misclassifications worth a sweep too**, or is the Pavlopoulos event the only one with sufficient credibility risk to warrant action before the systemic fix? D.1 answers for the headline event but not the rest.

---

## G. Brief-vs-reality corrections (logged per `feedback_verify_paths_in_briefs.md`)

| Brief said | Actually |
|---|---|
| DB column `venue` and `source_url` | `venue_name` and `url` |
| `mixed_venues` in `categorization-keywords.json` | `venue-categories.json` |
| `scripts/categorize-event.ts --id --trace` exists | Doesn't exist. `scripts/recategorize-events.ts` is the related script; no per-event trace flag. |
| `src/validators/event-categorizer.ts` = "inline rules + tests" for main categorizer | **Parallel classifier**, distinct codepath. **And effectively dead code** — only `normalizeTheaterSpelling` is imported. |
| Pass 3 actively excludes megaron.gr via `_excluded_sources` | `_excluded_sources` is documentation-only — categorizer doesn't read it. |
| Pass 4 source-hint defaults Megaron to `concert` | `megaron.gr` is **not in `source_type_hints` at all**. Source of `'concert'` label is the scraper's narrow type union + 3-layered concert defaults, not Pass 4. |
| One classifier per event path | One *live* classifier (the 4-pass); the validator is effectively dead code. |
| Single audit fix target | Two failure-mode layers: (1) scraper narrow type + 3 concert defaults; (2) taxonomy gap (no `talk` member). Both addressable but #1 is cheaper and unblocks correct cinema/festival/workshop labeling immediately. |

---

## H. Verification

- Spec file: `specs/categorizer-audit-2026-05-14.md` exists.
- `git status` should show only this new file + `.claude/notes/known-issues.md` + `.claude/notes/decisions.md` modifications (added in housekeeping step).
- Zero modifications to `src/`, `config/`, `data/events.db`, or `scripts/`.

---

## Appendix — full hand-classification of 34 Megaron rows

(Categorization is event-level judgment; for borderline cases the right answer is "verify on megaron.gr" before acting.)

| id | title (truncated) | Hand class | Confidence |
|---|---|---|---|
| 60d8ea5f1b3f4537 | Η μουσική χαρίζει «μνήμη» | Talk-or-music (scare-quoted suggests Megaron Plus) | Low |
| 24f44bc9b8ac557a | Μάνος Χατζιδάκις – Ο Μεγάλος Ερωτικός | Music | High |
| 0fd0530d8a5b10a8 | ΦΕΝΙΑ ΠΑΠΑΔΟΔΗΜΑ «Uccelli del mare» | Music (vocal) | High |
| 74629d5be9129f6a | Μουσική Δωματίου με την ΕΛΣΟΝ | Music (chamber) | High |
| 4637db0d100e4753 | Bobos Arts Festival | Festival | High |
| 67c409b85485d06a | Τροπικότητας από-ηχοι | Music (provisional) | Medium |
| a0181d27d064ba3c | Γαλάζια Κυριακή – Μια συναυλία για όλους | Music (title says συναυλία) | High |
| 44a392bd4b3651c0 | Mundus inversus: η μουσική στο έργο του Ιερώνυμου Μπος | **Talk** (academic, music-IN-Bosch) | High |
| b67cf032dc248676 | Σπύρος και Μάκης Καραβιώτης «Δυο κιθάρες και μια άρπα» | Music (guitars+harp) | High |
| a820ebee007ecf94 | «Η Ελληνική Jazz συναντά τα Standards» | Music (jazz) | High |
| 2d9f2883142941b3 | Γκαλά μπαρόκ με τον Max Emanuel Cenčić | Music (baroque countertenor) | High |
| 4b0d6f6437b803ea | Ηχορροές: AI και διαδραστική μουσική για παιδιά | **Children/workshop** | High |
| 98f094d709a2b438 | Εθνική Συμφωνική Ορχήστρα της ΕΡΤ | Music (symphony) | High |
| 1fff7b965b365312 | ANIMEGARON 2026 | **Children/anime festival** | High |
| 15e395128b7b285b | **Μύθοι και αλήθειες … Τεχνητής Νοημοσύνης** | **Talk** (HEADLINE) | High |
| 9ed1236737044b51 | Simon Zhu / Camerata Junior | Music (Paganini-winner) | High |
| 293f2e89038f6ef8 | **Αρχαία ελληνική μυθολογία και τεχνολογία – Θεοδόσης Π. Τάσιος** | **Talk** (Tasios lecture) | High |
| f6a40f4ff749fa82 | Divas Drive Trio | Music | High |
| 88849b9a5ae6ee8e | Κωστής Μαραβέγιας στον Κήπο | Music (Maraveyas) | High |
| 0eef5542c9d28362 | Οι άθλοι του Ηρακλή | **Children/theater** | High |
| a92cfe09ec95eb24 | "Buster Keaton: The General" με τον Στάθη Άννινο | **Cinema** (silent film + live piano) | High |
| 4d3fc1cacaa9a14a | Idra Kayne – Θοδωρής Οικονόμου "BLUE" | Music | High |
| 66be6267d645ffde | Pittsburgh Youth Symphony Orchestra | Music (symphony) | High |
| 4fe49f93dee73250 | Burger Project & Φίλοι – Πάρτι στον κήπο | Music (party) | High |
| 2fd4654651dac647 | Βουτιές στην τέχνη | Talk-or-workshop (likely Megaron Plus) | Low |
| 40948c023a05ab68 | Φιλαρμονική της Βιέννης – **Προβολή Unitel** | **Cinema** (filmed concert) | High |
| 1fd9ca547c7363b8 | Δημήτρης Καλαντζής: «Χθες το βράδυ» | Music (pianist) | High |
| 592ee803d603e2da | Encardia στον Κήπο του Μεγάρου | Music (Encardia) | High |
| 8dba6fd6795e0a24 | Donizetti "Maria Stuarda" – **Προβολή Unitel** | **Cinema** (filmed opera) | High |
| 30e2560209dd2a9e | Γιώργος Περρής: «Μαζί ή κανείς» | Music (Perris) | High |
| 726c2c344a9d289d | The Storyville Ragtimers (Armstrong tribute) | Music (jazz) | High |
| 09534161736a6841 | Τα Καλογεράκια στον Κήπο | Music (boys' choir) | High |
| 50cff6521af2164e | «Ταξίδι στο Κέντρο της Μουσικής» | **Children** | High |
| 96ade4dbf0eaaa06 | «Χαίντελ: Κοντσέρτα για εκκλησιαστικό» | Music (Handel concertos) | High |

**Summary:** 21 music / 3 confirmed talks / 2 ambiguous talks / 4 children / 3 cinema / 1 festival = 34.

---

*End of audit.*
