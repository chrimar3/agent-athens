# Sprint 2 Retrospective — GEO Citability Foundations

**Sprint window:** 2026-04-29 (Component D plan) → 2026-05-04 (formal close).
**Components shipped:** D, A, C, B-1, B-2, B-2c, B-2d (4 planned + 3 follow-ups + 1 hygiene extraction).
**Adjacent shipped:** Session 111 pipeline staging fix.
**Sessions consumed:** 7 numbered + ~5 supplementary (pre-flights, diagnostics, contamination resolution).

---

## Outcome summary

| Metric | Sprint start | Sprint end |
|---|---|---|
| Place layer measurement | not_measured | measured |
| Layer flags total | 4/5 measured | 5/5 measured |
| Tests | 1410+ baseline | 1941/0/1 skip |
| Schema completeness | 7,734 / 7,973 (97%) | 0 errors stable through churn |
| Validator errors | 0 | 0 |
| INFO-tier reporter consumption | write-only | wired (validator → reporter → summary) |
| Ratchet infrastructure | none | shipped, armed at 3/244 INFO |
| Venue registry collisions (canonical_name) | 59 | 0 |
| Venue registry collisions (normalize-key) | unmeasured | 0 |
| Venue registry size | 408 | 347 (post-B-2d + Tier 1 enrichment) |
| addressRegion divergence | event-page hardcoded "Attica" / venue-page neighborhood-mistagged | both via getRegionName(), config-driven |
| Pipeline staging risk | git add -A scoops WIP | explicit allow-list + defense-in-depth guard |

The headline is the place_level flag flip from "not_measured" to "measured" —
the third such flip across Sprint 2 (Components A and C did the prior two).
Sprint 1's deferred-contract pattern (D's "ship structural slot first, populate
later") proved out cleanly: every layer flag flip was a one-line change in
the return literal.

The first non-zero ratchet measurement (3/244 INFO) fired the retrospective
trigger via Editorial Tier 1 sameAs delivery (Megaron Q582203, Onassis
Q43064509, Benaki Πολιτισμού Q816669).

---

## Cross-sprint patterns (file as canonical, propagate to Sprint 3 brief-drafting)

### 1. Severity-as-data
Validators take config-derived expectations from the orchestrator, not implicit
module-level reads. Coverage decisions and severity choices are computed once
at build start and passed as resolved values into validator functions. Locked
in B-1 (`expectedAddressRegion` parameter pattern), applied in B-2 (`sameAsSeverity`
parameter), reinforced in B-2c (ratchet `total` derived once, passed through).

**Why it matters:** validators stay testable (no module-mock dance), config
changes are diff-friendly, multi-city replicability is preserved (each city
passes its own values; validators stay city-agnostic).

### 2. Three measurement-shape precedents
The reporter now carries three distinct aggregate shapes, and Sprint 3+ work
should match against these rather than invent a fourth without justification:

- **Flat** (`hubs`, `venues`, `datafeed`): single `PageGroupReport`. For dimensions
  with no internal subdivision worth reporting.
- **Split** (`aria.hub_template + aria.event_template`): paired `PageGroupReport`s.
  For dimensions where template-level granularity is the action surface.
- **Per-key array** (`events.byType[]`, `place.byVenue[]`): `BucketReport[]` keyed
  by EventType or normalized venue slug. For dimensions where per-key
  identification is the action surface (Editorial unit of work).

Q-B2's hybrid lock added a fourth wrinkle to the per-key shape: `place.byVenue[]`
carries a categorical `sameAsState: 'present' | 'missing'` field beyond the
standard BucketReport. That precedent extends per-key with categorical
metadata — usable in Sprint 3+ if measurement layers need state markers.

### 3. Diagnostic-vs-system metric divergence

Lifted to standalone patterns.md entry — see `.claude/notes/patterns.md`
"Diagnostic-vs-system metric divergence" for full anchor (B-2d Session 112)
and generalization. Filed there to survive retrospective archival.

Sprint 2 instance: Strategist Q-B8a Path 3 anchored on 57 collisions via
`group_by(canonical_name)`; system resolves via `normalizeVenueKey()`,
producing 59 collisions when applied uniformly. Two case-folded uppercase
duplicates (ΣΤΑΥΡΟΣ ΤΟΥ ΝΟΤΟΥ, ΘΕΑΤΡΟ ΠΑΛΛΑΣ) escaped the script's classifier
and surfaced at Step 4's normalized-key check.

### 4. Pre-flight discipline outcomes (validates the 2026-05-02 rule)

Six confirmed brief-vs-reality drift catches across the Sprint 2 thread:

1. Component A pre-flight: zero-consumer assumption disconfirmed; `/api/index.json`
   was wired into every page.
2. Component B pre-flight: "drop sameAs into config = zero code change"
   assumption disconfirmed; 4-file wiring required.
3. Component B pre-flight: place schema emits from 5 sites with divergent
   shapes (literal grep missed 4/5 because helpers, not literals).
4. Component B-1 pre-flight: `getAllVenues` named differently than brief
   (`getAllVenueRecords`); dynamic-import-at-line-222 pattern surfaced as
   part of the same P1 finding.
5. Component B-2 pre-flight: `result.info[]` is write-only; reporter doesn't
   consume. Scoped reporter consumption into B-2.
6. Daily pipeline staging audit: `dd47f4519` was hand-authored, not pipeline
   contamination — Session 110 closeout had mis-attributed it. Real incidents
   were `adbaef38e` + `72ce32c73`. Incident count 5+, not 2.

Plus a seventh, surfaced post-Sprint-2 closeout work:
B-2d pre-flight: 59-anchor count had drifted to 57 by execution time.
Strategist locks should be revised in-flight when drift is observed.

Pre-flight discipline catches code-state drift; diagnostic discipline catches
measurement-semantic drift; plan-mode exploration (B-2d Phase 1) catches
code-coupling drift. All three are pre-decision investigations. Sprint 3
brief-drafting should expect all three.

### 5. Sample-and-project accuracy (B-2d evidence)
Pre-flight projected 51 MERGE / 6 HOLD / 1 address lift from a 10-sample
classification. Execution produced exactly 51 / 6 / 1. Zero variance on the
major axes. The pattern: when sample classification is decisive (≥7/10 in one
direction), Strategist routing can lock against the projection without further
sampling. Mixed samples (4-6 of either) trigger expanded review.

This validates Strategist Q-B8a Path 3 as a pattern (sample → bulk-resolve
with manual review on edge cases) for future config-cleanup work where the
universe is too large for full manual inspection.

### 6. Severity hierarchy must filter reporter aggregation
B-2 surfaced this: a page can be PASS *and* have INFO findings simultaneously.
INFO does NOT downgrade pass→warn. The severity hierarchy stays: ERROR → fail;
WARN → warn; INFO → counted but doesn't affect pass status. `classify()`
reads `errors[]` and `warnings[]` only. INFO populates a separate counter on
`PageGroupReport` and surfaces in `printSchemaSummary` as its own line, never
conflated with warnings.

### 7. Numerator must subset denominator's domain (Q-B8b)
When computing coverage ratios, the numerator MUST filter by denominator
membership, not just by the primary criterion. Otherwise the ratio is
semantically meaningless above edge cases (coverage > 1.0 possible). Generalizes
beyond ratchets to any "coverage of curated set" measurement.

### 8. Address-record-wins (B-2d holds)
When merging duplicate canonical_name records, the record whose variations[]
contains a parseable street address is canonical; the neighborhood-only stub
is deleted. Resolved 5 of 6 B-2d Editorial-review-queue cases mechanically,
without external verification. Pattern lifted to standalone patterns.md entry.

### 9. Wikidata building-entity vs institution-entity
For venues with both a building entity and an institution entity on Wikidata
(Onassis-shape: Q43064509 building vs Q109297692 institution), `sameAs` on
the venue Place record points at the **building**. Institution entity is the
sameAs target for Organization schema, not Place schema. Lifted to standalone
patterns.md entry.

### 10. Archival-vs-operational temporal threshold (Q-B9)
Temporal thresholds for archival distinctions should separate "dormant" from
"seasonal," not match the operational window. The 45-day pageableEvents
window is operational; 180-day was Strategist's recommended archival
threshold for Q-B9 inactive-tail revisit triggers. Same logic transfers to
other future "when does X go inactive?" questions. Lifted to standalone
patterns.md entry.

---

## Q-lock cadence (Strategist routing)

| Round | Component | Locks |
|---|---|---|
| 1 | A | Q-A1, Q-A2 |
| 2 | C | Q-C1 |
| 3 | B | Q-B1, Q-B2, Q-B3, Q-B6 (4 routed; Q-B4, Q-B5, Q-B7 self-locked at Planner) |
| 4 | B-2c/B-2d | Q-B8a, Q-B8b, Q-B9, Q-B10 (4 routed) |

Total: 10 Strategist-routed questions across Sprint 2. Self-locked at Planner: 3.
Ratio (~77% routed, ~23% self-locked) feels right for an early-sprint thread
where citability framing dominates structural choices. Sprint 3+ may shift
toward higher Planner self-lock as patterns settle.

**Two self-locks worth checking against execution:**
- Q-B4 (extend existing validators, not standalone) — held cleanly through
  B-2 implementation. Right call.
- Q-B7 (DataFeed inherits per-event Place check, no separate measurement) —
  held cleanly. No DataFeed-specific Place gap surfaced.

---

## Calibration miss (file as Planner mistake)

S105 framing: "Component B is roughly the size of Component C — single session,
~3 files, validator + tests + per-template aggregate wiring. Tier 1 sameAs
data drops in as data, not code."

Actual: Component B took 4 sessions (B-1, B-2, B-2c, B-2d), 4-5 files per
session, with sameAs requiring full wiring (VenueRecord, Venue, generate-site
attach, both schema builders, reporter consumption). The "data drops in as
data" assumption was wrong — pre-flight P5 caught it.

**Lesson:** initial component sizing without pre-flight is unreliable. Sizing
estimates should be hedged ("X files if pre-flight confirms Y, larger
otherwise") rather than asserted. Sprint 3 brief-drafting should defer
sizing estimates to post-pre-flight.

---

## Adjacent shipped (Session 111 pipeline staging fix)

Not Sprint 2 scope but landed during the thread. The `git add -A` antipattern
in `daily-automated.sh:488–499` produced 5+ confirmed contamination incidents
(adbaef38e, 72ce32c73, 5d49315a1, 4a897a76b, 937f738de). Fix replaced with
explicit allow-list staging + defense-in-depth guard + .gitignore rule.
Empirical verification on first run: protected real WIP (S110b script edit)
that old code would have scooped into a 7-file contamination commit.

This is filed as Sprint 2-adjacent rather than Sprint 2 because it's
infrastructure hygiene, not citability work. Worth noting because the same
"audit → diagnose → fix → verify" cadence Sprint 2 used for measurement
work transferred cleanly to a different domain. The discipline pattern is
not domain-specific.

---

## Sprint 2 incident — Session 116 cross-stream contamination

**What happened:** During Sprint 2 closeout (Session 116), a concurrent
S2 taxonomy hygiene session ran in parallel. Its `git add -A` swept the
Tier 1 sameAs additions that were staged in this Planner thread's
working tree, bundling them into commit `ae0f0d5f1` ("S2 taxonomy
hygiene"). The bundling commit also carries a content-vs-message drift:
its message claims `neighborhood_aliases` additions that did not actually
ship. Detection was post-push.

**Resolution:** Option 2 (accept the bundling) was chosen as the safe path
once the contamination was discovered post-push. Reset/repair would have
required local-history rewriting that risked compounding the audit-trail
issue if executed imperfectly. Three commits ahead of origin shape: the
bundled commit (`ae0f0d5f1`) plus the two clean B-2d commits
(`eeeee8aea` mechanical merges, `b56bceb0f` Editorial-resolved).

**The sameAs additions ARE in HEAD** — Megaron Q582203, Onassis Q43064509,
Benaki Πολιτισμού Q816669 all live in the registry as intended, just
inside the wrong commit. Ratchet reads 3/244 INFO correctly. Functional
state is right; audit trail has a documented blemish.

**Discipline-rule extension (S116 mistakes.md entry):** S111's
explicit-allow-list pattern (pipeline scope) needs interactive-session
equivalent. Manual sessions should stage by path or hunk, never
`git add -A` against a working tree that contains other streams' work.
The Planner discipline pattern ("stage precisely, no -A") that B-1 onward
followed cleanly is the right standard; the breach was in a non-Planner-thread
session that didn't inherit the discipline. Filed as cross-sprint
discipline-rule extension; enforcement via tooling (git hooks, pre-commit)
is bigger investment than the problem warrants right now. Documentation-only
enforcement until incident frequency justifies tooling.

**Orphan stash@{0} (post-incident):** the parallel S2 taxonomy session's
`neighborhood_aliases` content — which their `ae0f0d5f1` commit message
*claims* to have shipped but didn't — sits in `stash@{0}`. The stash also
contains duplicate sameAs hunks that are now in HEAD via `ae0f0d5f1`, so
`git stash pop` will conflict. Recovery path was relayed to the parallel
session's owner: `git checkout stash@{0} -- config/athens-venues.json`
followed by manual surgery to keep only the neighborhood_aliases hunks
(deleting the duplicate sameAs hunks), then commit + drop stash. Until
they execute that, the stash sits as orphan local state and the
`neighborhood_aliases` claim from `ae0f0d5f1` remains structurally
unfulfilled. Not a Planner-side action item.

---

## Open items at Sprint 2 close

These items surfaced during Sprint 2 but route past the sprint boundary.
None block Sprint 3 starting.

1. **Pireos 138 Wikidata-entry-creation workstream** (Editorial deferred
   per path b). The Benaki Πειραιώς 138 venue has no distinct Wikidata QID;
   shipping wrong sameAs (e.g., reusing parent Q816669) is a worse failure
   mode than no sameAs. Workstream: create the Wikidata entity, then attach.
   Possible bundling with Tier 2 sameAs scoping below.

2. **Tier 2 sameAs scoping**. Tier 1 covered Megaron + Onassis + Benaki
   Πολιτισμού. Tier 2 candidate-set logic is the open question:
   per-neighborhood, per-category, per-event-frequency-tail, or some hybrid?
   Affects ratchet trajectory toward 50% WARN threshold (~122 venues).

3. **Benaki Koumpari naming convention**. Current canonical_name is
   `Μουσείο Μπενάκη Ελληνικού Πολιτισμού` (brand). Editorial Director's
   preferred form is `Μουσείο Μπενάκη — Κεντρικό (Κουμπάρη)` (building
   location). Decision: keep current name per Sprint 2 closeout discipline.
   Retro question: should canonical_names favor brand-as-displayed or
   building-as-physical-location? Affects Tier 2 sameAs scoping (canonical
   logic interacts with which records carry which QIDs).

4. **Interactive-session staging discipline**. Cross-sprint discipline-rule
   extension from S116 `ae0f0d5f1` contamination incident: precise staging
   applies to ALL sessions, not just CC sessions following Planner plans.
   The `git add -A` antipattern is broader than just the daily pipeline
   (S111 fix scope) — interactive sessions can recreate the same failure
   mode. Filed as cross-sprint pattern; enforcement via tooling (git hooks,
   pre-commit) is bigger investment than the problem warrants right now.
   Documentation-only enforcement until incident frequency justifies tooling.

5. **S110b temp-descriptions cleanup (PENDING)**. Investigation+results
   commit `8455932af` landed (documentation only); `temp-descriptions/`
   directory still has 18 entries (Mar/May files mixed) and
   `specs/s110b-investigation.md` exists. Cleanup deferred — fold into
   next pipeline-adjacent or enrichment-workspace session as a 5-min
   tail step. Pre-session checklist gate (per S111 protocol) catches
   this before any session that reads/writes temp-descriptions/.

---

## Sprint 3 readiness signals

Three patterns from Sprint 2 are loaded into Sprint 3 brief-drafting tools:

1. **Pre-flight + diagnostic + plan-mode-exploration as standard discipline**
   for every measurement-architecture component. Applied to all of D/A/C/B
   and validated 7 times.
2. **Three measurement-shape precedents** (flat / split / per-key-array, with
   per-key extensible to categorical metadata). Match against these before
   inventing a fourth.
3. **Severity-as-data, numerator subsets denominator, INFO doesn't downgrade
   pass** — three architectural rules now load-bearing. Sprint 3 measurement
   work that violates any of them needs explicit justification.

Sprint 3 first-component plan-drafting should pull this retrospective into
its own pre-flight reading.

---

**Sprint 2 formally closed:** ratchet 3/244 INFO live; retrospective shipped;
patterns lifted to durable storage; open items routed past the sprint boundary.
