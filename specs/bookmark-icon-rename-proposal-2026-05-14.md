# BOOKMARK_ICON Rename-Shape Proposal — Read-Only Diagnostic (2026-05-14)

**Stream**: Mini-session diagnostic, read-only, for Design Navigator review. Unblocks Session B (`.edp-save-btn` extension + class rename + pattern banking).
**Source HEAD**: `0ba844148`
**Scope**: enumerate the rename surface, classify the constant shape, score two candidate rename shapes against Design Navigator's three criteria, pre-classify three patterns for the `patterns.md` vs `decisions.md` fix-rot rule. **No source touched, no spec proposed beyond what Design Navigator asked for.**

---

## §1 — Reference Inventory

### Constants

| file:line | reference | use context |
|---|---|---|
| `src/templates/action-bar.ts:8` | `const BOOKMARK_ICON_20 = ...` | Definition — used on detail-page action bar (`.edp-save-btn`) |
| `src/templates/action-bar.ts:9` | `const BOOKMARK_ICON_16 = ...` | Definition — used on card save button (`.card-save-btn`) |
| `src/templates/action-bar.ts:26` | `${BOOKMARK_ICON_20}` | Inline embed inside `renderActionBarHtml` (detail-page edp-save-btn template) |
| `src/templates/action-bar.ts:37` | `${BOOKMARK_ICON_16}` | Inline embed inside `renderCardSaveButton` (card-save-btn template) |

### Related class selectors (post-d1cee688a state)

| file:line | selector | use context |
|---|---|---|
| `src/styles/design-system.css:1177` | `.edp-save-btn,` (compound) | edp-save-btn base styling |
| `src/styles/design-system.css:1195` | `.edp-save-btn:hover,` (compound) | edp-save-btn hover |
| `src/styles/design-system.css:1202` | `.edp-save-btn:focus-visible,` (compound) | edp-save-btn focus |
| `src/styles/design-system.css:1209` | `.edp-save-btn.is-saved {` | edp-save-btn saved state (block start) |
| `src/styles/design-system.css:1214` | `.edp-save-btn.is-saved svg { fill: var(--accent-primary); }` | **Active yellow-flip; Session B removes this** |
| `src/styles/design-system.css:1246` | `.card-save-btn__icon {` | Card-icon sizing block (new in d1cee688a) |
| `src/styles/design-system.css:1252` | `.card-save-btn__icon path {` | Card-icon path default rules (new in d1cee688a) |
| `src/styles/design-system.css:1261` | `.card-save-btn.is-saved .card-save-btn__icon path {` | Card-icon saved-state fill flip (new in d1cee688a) |
| `src/templates/action-bar.ts:9` | inline `class="card-save-btn__icon"` on SVG | New in d1cee688a |
| `src/templates/action-bar.ts:25` | inline `class="edp-save-btn"` on button | Pre-d1cee688a |
| `src/templates/action-bar.ts:37` | inline `class="card-save-btn"` on button | Pre-d1cee688a |
| `src/templates/action-bar.ts:113, 120` | `'.card-save-btn'` selector in JS event delegation | Runtime click handler |
| `src/templates/__tests__/action-bar.test.ts:72, 73, 90, 151, 152` | assertions on `card-save-btn` / `card-save-btn__icon` | Tests |

---

## §2 — Constant Shape Classification

### BOOKMARK_ICON_20 (action-bar.ts:8) verbatim

```
'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>'
```

### BOOKMARK_ICON_16 (action-bar.ts:9) verbatim

```
'<svg class="card-save-btn__icon" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>'
```

### Diff summary

| Attribute | _20 | _16 |
|---|---|---|
| `class` | (absent) | `card-save-btn__icon` |
| `width`/`height` | 20 | 16 |
| `viewBox` | `0 0 24 24` | `0 0 24 24` (same) |
| `fill` (SVG-level) | `none` | (absent — driven by CSS path rule) |
| `stroke` (SVG-level) | `currentColor` | (absent — driven by CSS path rule) |
| `stroke-width` | `2` | (absent) |
| `stroke-linecap`/`linejoin` | `round`/`round` | (absent) |
| `aria-hidden` | `true` | `true` (same) |
| `path d` | `M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z` | **identical glyph** |

### Verdict: **(3-mixed)** — currently; **(1-uniform)** post-Session-B

The two constants share the same glyph (path d identical, viewBox identical, aria-hidden identical). They differ in:
- **Dimensions** (16 vs 20): legitimate size variant.
- **Styling paradigm** (inline-attr-styled vs class-driven): a *paradigm artifact*, not a use-context artifact. d1cee688a converted `_16` to class-driven styling for the card save button (Option 2 shape-based state); `_20` still uses pre-d1cee688a inline-attr styling because the detail-page button (`.edp-save-btn`) was banked as out-of-scope at the time.

Session B's `.edp-save-btn` Option 2 extension would convert `_20` to the same class-driven shape (matching glyph carried verbatim per d1cee688a's glyph-agnostic principle). **Post-Session-B, both constants would be size-uniform** — same glyph, same paradigm, differ only in width/height.

This is the strongest argument for treating the rename as a *paradigm-convergence opportunity* rather than a *current-state-distinct-encoding* exercise. The `_16`/`_20` suffix has always been a size encoding; the styling-paradigm asymmetry is incidental to the rename and will be eliminated by Session B regardless.

**Cross-reference to §6**: Design Navigator's classification of `(3-mixed) currently / (1-uniform) post-Session-B` shapes the rename strategy choice — see §7 candidates.

---

## §3 — Existing TS-Constant Naming Conventions

### Icon-domain constants (UPPER_SNAKE_CASE, embedded SVG content)

| Constant | file:line | Convention shape |
|---|---|---|
| `BOOKMARK_ICON_20` | `src/templates/action-bar.ts:8` | `<DOMAIN>_ICON_<SIZE>` |
| `BOOKMARK_ICON_16` | `src/templates/action-bar.ts:9` | `<DOMAIN>_ICON_<SIZE>` |
| `SHARE_ICON` | `src/templates/action-bar.ts:10` | `<DOMAIN>_ICON` (single-size) |
| `CALENDAR_ICON` | `src/templates/action-bar.ts:11` | `<DOMAIN>_ICON` (single-size) |
| `CHEVRON_SVG` | `src/templates/filter-bar.ts:99` | `<DOMAIN>_SVG` (alternate suffix; embedded inside template literal block) |

**Observation**: The codebase has THREE distinct icon-domain conventions:
1. `<DOMAIN>_ICON` — single-size icons (SHARE, CALENDAR). The dominant convention.
2. `<DOMAIN>_ICON_<SIZE>` — sized variants (BOOKMARK). Only used where multiple sizes exist; the suffix `_16`/`_20` numerically encodes pixel dimensions.
3. `<DOMAIN>_SVG` — embedded SVG inside a template literal block (CHEVRON in filter-bar). Different file, different idiom; outlier.

**No `<USE>_<DOMAIN>_ICON` precedent exists.** Adopting `CARD_BOOKMARK_ICON` / `ACTIONBAR_BOOKMARK_ICON` (use-encoded shape) introduces a new convention to the codebase — not breaking, but unprecedented for icons.

### General UPPER_SNAKE_CASE constant conventions (sampled)

| Constant | file:line | Inferred shape |
|---|---|---|
| `BASE_URL` | `src/config/site-url.ts:5` | `<DOMAIN>_<NOUN>` |
| `GA_MEASUREMENT_ID` | `src/config/analytics.ts:3` | `<DOMAIN>_<NOUN>_<TYPE>` |
| `ATHENS_TZ` | `src/utils/format-date.ts:10` | `<DOMAIN>_<NOUN>` |
| `GREEK_DAYS` / `GREEK_MONTHS` / etc. | `src/utils/format-date.ts:13–26` | `<LOCALE>_<NOUN>` |
| `HUB_EVENT_LIMIT` | `src/generators/hub-page.ts:42` | `<DOMAIN>_<NOUN>_<MEASURE>` |
| `LIGHT_TEXT_BADGES` | `src/templates/page.ts:45` | `<MODIFIER>_<NOUN>` (Set) |
| `ORGANIZATION_SCHEMA` | `src/utils/schema-geo.ts:186` | `<NOUN>_<TYPE>` |
| `PERFORMER_EVENT_TYPES` | `src/utils/performer-sameAs.ts:31` | `<DOMAIN>_<NOUN>_<TYPE>` (Set) |
| `MANDATORY_FIELDS` / `RECOMMENDED_FIELDS` / `INFO_FIELDS` | `src/utils/schema-validator.ts:24–57` | `<CLASSIFIER>_<NOUN>` |
| `NON_ATHENS_VENUES` / `NON_ATHENS_PATTERNS` | `src/utils/venue-validation.ts` | `<MODIFIER>_<NOUN>` |
| `TAG_TAXONOMY` | `src/enrichment/description-generator.ts:72` | `<DOMAIN>_<NOUN>` |

**Observation**: The dominant general-constant shape is `<DOMAIN>_<NOUN>` or `<MODIFIER>_<NOUN>`. Modifiers (LIGHT, MANDATORY, NON, etc.) consistently precede the noun. No precedent for *use-context* as a prefix in icon-domain constants specifically.

---

## §4 — d1cee688a Retroactive-Touch Boundary

**Commit**: `d1cee688a fix: shape-based saved-state for .card-save-btn (Option 2)` (2026-05-13).

**Files touched by d1cee688a**:
- `src/templates/action-bar.ts` — `BOOKMARK_ICON_16` mutation (added `class="card-save-btn__icon"`, removed inline SVG-level fill/stroke)
- `src/styles/design-system.css` — `.card-save-btn.is-saved` color rules removed; three new `.card-save-btn__icon` rules added
- `src/templates/__tests__/action-bar.test.ts` — assertion update (line 88–91, added `card-save-btn__icon` class check)
- `.claude/notes/decisions.md`, `.claude/notes/patterns.md`, `docs/session-log.md` — institutional appends (out of rename scope)

**References inside d1cee688a-modified source files that a rename would touch**:

| file:line | reference | rename target? |
|---|---|---|
| `action-bar.ts:8` | `const BOOKMARK_ICON_20 = ...` | Yes — both constants rename together |
| `action-bar.ts:9` | `const BOOKMARK_ICON_16 = ...` | Yes |
| `action-bar.ts:26` | `${BOOKMARK_ICON_20}` interpolation | Yes (consumer) |
| `action-bar.ts:37` | `${BOOKMARK_ICON_16}` interpolation | Yes (consumer) |
| `action-bar.ts:9` | inline `class="card-save-btn__icon"` | No (class name preserved; CSS selectors paired) |
| `design-system.css:1246, 1252, 1261` | `.card-save-btn__icon` selectors | No (class name preserved) |
| `action-bar.test.ts:90` | `expect(html).toContain('class="card-save-btn__icon"')` | No |

**Rename touch surface inside d1cee688a-modified files**: **4 lines in `action-bar.ts`** (2 definitions + 2 consumers). Other d1cee688a-modified files have no references that the rename would touch.

**Refactor cost classification**: **mechanical** (find-replace of 2 identifier names across 4 lines in 1 file, plus tests file if test fixtures hardcode the names).

---

## §5 — Yellow Accent Budget Baseline — Occurrence List + Use-Classification

### Integer baseline

**41** occurrences of `var(--accent-primary)` in `src/styles/design-system.css` (count via `grep -cE 'var\(--accent-primary\)' src/styles/design-system.css`).

### Drift vs memory

Memory states the yellow accent budget is "locked at 5 named contexts." Observed count: **41**. **Drift: +36** (or +800% relative to the memory-locked baseline). This is one of the most important findings of the mini-session and is surfaced here, not as a footnote. Two interpretations are possible — both routed to Design Navigator in §9. The drift does NOT block the rename proposal but materially affects audit-loop confidence in the yellow-budget gate.

### Post-Session-B trajectory

Session B's brief explicitly names removal of `design-system.css:1214` (`.edp-save-btn.is-saved svg { fill: var(--accent-primary); }`). Per minimal interpretation (line 1214 only): **41 → 40** post-Session-B.

If Session B fully extends Option 2 to `.edp-save-btn` (removing the color/border-color at lines 1210–1211 too — symmetric to what d1cee688a did for `.card-save-btn`): **41 → 38** post-Session-B.

Design Navigator's call on minimal vs full interpretation: scoped per Session B brief decisions, not this mini-session.

### Full occurrence list with selector context + classification

| Line | Selector | Property | Classification |
|---|---|---|---|
| 199 | `a` | `color` | non-save-affordance (global link color) |
| 204 | `a:hover` | `color` | non-save-affordance (global link hover) |
| 266 | `.skip-link` (inferred from context) | `background` | non-save-affordance (a11y skip-link) |
| 508 | `.event-card:hover .card-title` | `color` | non-save-affordance (card hover) |
| 513 | `.card-date` | `color` | non-save-affordance (card date treatment) |
| 794 | `(answer-capsule-like surface)` border | `border-left` | non-save-affordance (decoration) |
| 865 | `(edp-type-badge)` background fallback | `background: var(--edp-type-color, var(--accent-primary))` | **unclear** (only emits yellow when `--edp-type-color` is unset; runtime-dependent) |
| 899 | `.edp-meta-date` color fallback | `color: var(--edp-type-color, var(--accent-primary))` | **unclear** (same fallback pattern) |
| 908 | `(edp-cta-like button)` | `background` | non-save-affordance (CTA button) |
| 986 | `(text button)` | `color` | non-save-affordance |
| 994 | `.edp-read-more:hover` | `color` | non-save-affordance (read-more hover) |
| 1100 | `.practical-table a` | `color` | non-save-affordance (table link) |
| **1210** | `.edp-save-btn.is-saved` | `color` | **save-affordance** (color-based saved state) |
| **1211** | `.edp-save-btn.is-saved` | `border-color` | **save-affordance** |
| **1214** | `.edp-save-btn.is-saved svg` | `fill` | **save-affordance — Session B explicit removal target** |
| 1324 | `.saved-event-item a:hover` | `color` | **save-affordance-adjacent** (saved-events page link hover) |
| 1420 | `.filter-pill.is-active` | `background` | non-save-affordance (active filter state) |
| 1421 | `.filter-pill.is-active` | `border-color` | non-save-affordance |
| 1617 | `.filter-type-tile.is-selected` border fallback | `border-color: var(--tile-color, var(--accent-primary))` | **unclear** (fallback) |
| 1618 | `.filter-type-tile.is-selected` background fallback | `background` with color-mix on fallback | **unclear** (fallback) |
| 1706 | `.filter-radio-row.is-selected .filter-radio-circle` | `border-color` | non-save-affordance |
| 1713 | indicator dot inside filter-radio-circle | `background` | non-save-affordance |
| 1836 | `.event-card-list:hover .card-title` | `color` | non-save-affordance (list-mode card hover) |
| 1931 | `.hero-see-all:hover` | `color` | non-save-affordance |
| 1985 | `.hero-card--featured:hover .hero-card-title` | `color` | non-save-affordance |
| 2050 | `.hero-card--pick:hover .hero-pick-title` | `color` | non-save-affordance |
| 2148 | `.content-page-body a` | `color` | non-save-affordance (content-page link) |
| 2154 | `.content-page-body a:hover` | `color` | non-save-affordance |
| 2368 | `(menu/nav link, exact selector unread)` | `color` | non-save-affordance (likely) |
| 2441 | `.error-home-link` | inline declarations including `background` | non-save-affordance (404 page CTA) |
| 2450 | `.hub-answer-capsule` | `border-left` | non-save-affordance (decoration) |
| 2467 | `.hub-stats a:hover` | `color` | non-save-affordance |
| 2495 | `.hub-card:hover` | `border-color` | non-save-affordance |
| 2496 | `.hub-card:hover .hub-card-title` | `color` | non-save-affordance |
| 2521 | `.terminal-cta-links a` | `color` | non-save-affordance (CTA) |
| 2575 | `.hub-event-block h3 a:hover` | `color` | non-save-affordance |
| 2645 | `.section-label` | `border-left` | non-save-affordance (editorial section marker) |
| 2711 | `.hub-comparison-table .pick-star` | `color` | non-save-affordance (editor's pick ★) |
| 2726 | `.hub-see-all` | `color` | non-save-affordance |
| 2728 | `.hub-see-all` | `border` | non-save-affordance |
| 2733 | `.hub-see-all:hover` | `background` | non-save-affordance |

### Classification summary

| Bucket | Count |
|---|---|
| Save-affordance (active) | **4** (lines 1210, 1211, 1214, 1324) |
| Unclear (CSS-var fallback; runtime-dependent) | **4** (lines 865, 899, 1617, 1618) |
| Non-save-affordance | **33** (remaining) |
| **Total** | **41** |

**Interpretation**: If the "5 named contexts" budget meant save-affordance + adjacent contexts, the observed 4 save-affordance occurrences nearly matches; the 36 "extra" occurrences are non-save-affordance legitimate uses (link colors, hover treatments, decorations, CTAs, hub UI). The drift is most plausibly a **mechanism mismatch** — the budget was probably never intended to count every CSS use of `var(--accent-primary)`, but rather to count "primary use contexts" — and the locked-5 value was never enforced by a grep-based mechanism, so the count diverged. See §9 open question.

---

## §6 — Path B Template-Touching Evaluation

### Definition

Path B is the fallback rename strategy (parallel parent-scoped classes — adding a new class scope alongside the existing `.card-save-btn` / `.edp-save-btn` selectors, rather than renaming the existing classes). The question for Gate 4 STOP-trigger disambiguation: does Path B require ANY change to template-generated HTML output, or is it purely CSS selector restructuring?

### Emission sites for `card-save-btn` / `edp-save-btn` class strings

| file:line | Reference | Type |
|---|---|---|
| `src/templates/action-bar.ts:25` | `<button class="edp-save-btn" ...>` | Template emission (detail-page action bar) |
| `src/templates/action-bar.ts:37` | `<button class="card-save-btn" ...>` | Template emission (card save button) |
| `src/templates/action-bar.ts:113` | `document.querySelectorAll('.card-save-btn').forEach(...)` | Runtime click-handler selector (no class change needed) |
| `src/templates/action-bar.ts:120` | `var btn = e.target.closest('.card-save-btn')` | Runtime click delegation (no class change needed) |
| `src/templates/__tests__/action-bar.test.ts:72, 73, 90, 151, 152` | test assertions on `card-save-btn` / `card-save-btn__icon` | Tests (would need updating only if the class name itself changes; under Path B parallel-scope, original class names are PRESERVED) |

### Verdict: **Path B is CSS-only restructuring. No template emission changes required.**

Both button classes (`card-save-btn`, `edp-save-btn`) are already emitted by their respective `renderCardSaveButton()` and `renderActionBarHtml()` functions. Path B's "parallel parent-scoped classes" approach can layer new CSS selectors atop existing class names without touching the emission sites. The two runtime click handlers at `action-bar.ts:113, 120` continue to match against `.card-save-btn` (preserved class name).

**Gate 4 STOP-trigger disposition**: NOT triggered. Path B can be implemented in-session as CSS-only fallback if Path A (constant rename + class rename) is rejected by Design Navigator. No escalation required for Path B per se.

---

## §7 — Rename Shape Proposal — Scored Candidates

Per §2 classification: currently (3-mixed), post-Session-B (1-uniform). The rename strategy should anticipate the post-Session-B (1-uniform) end-state and propose a shape that holds in both interim and end states. Two candidates evaluated:

### Candidate A: `<DOMAIN>_ICON_<SIZE>` preserved as `BOOKMARK_ICON_SM` / `BOOKMARK_ICON_LG`

**Shape**: Replace numeric size suffix with t-shirt sizing (small / large). `BOOKMARK_ICON_16` → `BOOKMARK_ICON_SM`, `BOOKMARK_ICON_20` → `BOOKMARK_ICON_LG`.

Rationale: keeps `<DOMAIN>_ICON_<MODIFIER>` convention (consistent with §3 dominant pattern); abstracts pixel dimensions to semantic size, which won't drift if dimensions change later.

| Criterion | Result | Rationale |
|---|---|---|
| (a) Encodes use, not size | **partial fail** | Still encodes size (SM/LG), not use context. But §2 confirms size IS the actual distinguishing factor post-Session-B; "use" mapping is incidental to dimensions in this codebase. |
| (b) Consistent with existing TS-constant naming | **pass** | `<DOMAIN>_ICON_<MODIFIER>` is the dominant icon-domain convention (§3); SM/LG are common modifiers. |
| (c) Refactor cost ≤ single-commit mechanical swap | **pass** (4 lines, mechanical) | Per §4 touch boundary: 2 definitions + 2 consumers in `action-bar.ts`. Tests need no update (test fixtures assert on classes/HTML, not constant names). Pure find-replace. |

**Score**: 2.5 of 3. Strong on (b) and (c), partial on (a).

### Candidate B: `<USE>_BOOKMARK_ICON` use-encoded → `CARD_BOOKMARK_ICON` / `ACTIONBAR_BOOKMARK_ICON`

**Shape**: Encode the use context (which button each icon renders inside). `BOOKMARK_ICON_16` → `CARD_BOOKMARK_ICON`, `BOOKMARK_ICON_20` → `ACTIONBAR_BOOKMARK_ICON`.

Rationale: directly satisfies Design Navigator's "encodes use, not size" criterion; future size changes wouldn't trigger a rename; new use contexts (e.g., a third bookmark instance) would slot in cleanly as `<NEW_USE>_BOOKMARK_ICON`.

| Criterion | Result | Rationale |
|---|---|---|
| (a) Encodes use, not size | **pass** | Names map directly to consuming surface: CARD = `renderCardSaveButton`, ACTIONBAR = `renderActionBarHtml`. |
| (b) Consistent with existing TS-constant naming | **partial fail** | §3 found NO `<USE>_<DOMAIN>_ICON` precedent in icon-domain constants. SHARE_ICON, CALENDAR_ICON, BOOKMARK_ICON_n all follow `<DOMAIN>_ICON[_SIZE]`. Candidate B introduces a new convention. Not breaking (UPPER_SNAKE still applies), but the use-prefix order is novel. |
| (c) Refactor cost ≤ single-commit mechanical swap | **pass** (4 lines, mechanical) | Same touch boundary as Candidate A: 2 definitions + 2 consumers. Mechanical find-replace. |

**Score**: 2.5 of 3. Strong on (a) and (c), partial on (b).

### Tie + Recommendation

Both candidates score 2.5 of 3 — within the "close" threshold per §9 open-question item. Each trades one criterion partial-fail for another's strength: Candidate A keeps convention consistency at cost of "encodes use"; Candidate B encodes use at cost of convention novelty.

**Dev Planner's recommendation**: Candidate B (use-encoded). Reasoning:
- Design Navigator's *first* criterion is "encodes use, not size" — the highest-stakes signal. A criterion-(a) pass is structurally weightier than a criterion-(b) pass.
- The §3 convention novelty is small: introducing `<USE>_<DOMAIN>_ICON` adds one new pattern to a codebase that already has three (`<DOMAIN>_ICON`, `<DOMAIN>_ICON_<SIZE>`, `<DOMAIN>_SVG`). The convention surface is already heterogeneous.
- The (1-uniform) post-Session-B trajectory makes Candidate A's size-suffix lose information (both constants become essentially identical except for use context; size suffix becomes a vestige of the inline-styling era).

**Fallback**: Candidate A. Retained if Design Navigator prefers convention consistency over use-encoding novelty.

### Open candidate-selection question (close-scoring tie-break)

If Design Navigator prefers (b) convention-consistency stronger than the recommendation weights, she selects Candidate A; if she prefers (a) use-encoding stronger, Candidate B. Routed to her for the call.

---

## §8 — Pattern Banking Pre-Classification

Three patterns queued for Session B's bank step. Per Design Navigator's fix-rot rule:
- **Grep-verifiable in current production CSS (post-c8be54049 HEAD)** → `patterns.md`
- **Session-narrative only, no current production instance** → `decisions.md`
- **Both** → split: `patterns.md` referencing `decisions.md`

### DGP (Deferred-Gate Provisionality)

**Grep evidence**:
```
grep -n '\.edp-save-btn.*is-saved' src/styles/design-system.css
1209:.edp-save-btn.is-saved {
1214:.edp-save-btn.is-saved svg { fill: var(--accent-primary); }
```

**Status**: **Grep-verifiable**. Lines 1209/1210/1211/1214 are the active production code instance of a parallel selector (the detail-page save button) that the original Gate 1 audit's "5 contexts" budget enforcement either missed or did not surface at that time. The very existence of these lines, post-d1cee688a's banking of `.edp-save-btn` as out-of-scope, makes this a live production instance of DGP, not just a session-narrative observation.

**Classification**: `patterns.md` (or split `patterns.md` + `decisions.md` if the narrative is also worth banking). Already banked once in patterns.md from the S138 verification session; this current instance reaffirms the pattern with concrete line evidence.

### SCO (State-Cycle Observation)

SCO is a process pattern about WHEN to observe states (e.g., after every emission change, the state cycle of test → source → SSR → live must all be re-verified). It does NOT correspond to a state-override that grep can detect — it's a methodology, not a CSS rule.

**Grep evidence**: not applicable (process pattern, not a code surface).

**Classification**: `decisions.md` (session-narrative). Per Design Navigator's rule, patterns without grep-verifiable production instances belong in decisions, not patterns.

### Pattern A sub-pattern (search-exhaustiveness)

The pattern: when searching for a selector violation, the grep must enumerate **all** related selectors in the same class family, not just the first match. S138's verification surfaced this when `var(--accent-primary)` was found in two locations on `.card-save-btn` rather than the brief's anticipated one.

**Grep evidence**:
```
grep -cE '\.card-save-btn.*is-saved' src/styles/design-system.css
1
grep -nE '\.card-save-btn.*is-saved' src/styles/design-system.css
1261:.card-save-btn.is-saved .card-save-btn__icon path {
```

Currently only ONE production occurrence remains on `.card-save-btn.is-saved` (the fill-flip rule from d1cee688a). The two color rules at the original drift sites (color + svg fill) are gone post-d1cee688a. So at this snapshot, search-exhaustiveness is **NOT grep-verifiable as a current violation** on `.card-save-btn`.

However, the analogous instance lives on `.edp-save-btn`:
```
grep -nE '\.edp-save-btn.*is-saved' src/styles/design-system.css
1209:.edp-save-btn.is-saved {
1214:.edp-save-btn.is-saved svg { fill: var(--accent-primary); }
```
Two occurrences, same family — exactly the shape Pattern A predicts will appear when the search isn't exhaustive. **Grep-verifiable** as a current production instance, just on the sibling selector rather than the original violation site.

**Classification**: **Both** — patterns.md (cite the `.edp-save-btn` grep evidence as the current-instance anchor) + decisions.md (narrative of the d1cee688a-era retrospective + the S138 verification finding).

### Summary

| Pattern | Grep-verifiable? | Classification |
|---|---|---|
| DGP | yes (`.edp-save-btn` instance) | patterns.md (already banked) |
| SCO | no (process pattern) | decisions.md only |
| Pattern A sub-pattern | yes (`.edp-save-btn` instance — sibling-selector exhaustiveness) | both (patterns.md anchored on grep + decisions.md narrative) |

---

## §9 — Open Questions for Design Navigator

1. **Candidate selection — close scoring**: Both rename candidates score 2.5 of 3. Dev Planner recommends Candidate B (use-encoded) on the weight of criterion (a). Does Design Navigator prefer the weight balance differently? If she weights (b) convention-consistency higher, Candidate A is the selection.

2. **(3-mixed) → (1-uniform) trajectory**: §2 classifies the current constants as (3-mixed) but anticipates a (1-uniform) post-Session-B state. Should the rename land BEFORE Session B's Option 2 extension (rename in current mixed-paradigm state) or AFTER (rename when uniform)? "Before" allows the rename commit to be standalone; "after" allows the rename to operate on uniform constants where the size suffix is genuinely all that distinguishes them.

3. **Deprecated-aliases vs hard-swap**: Should the old constant names be retained as deprecated aliases during transition (e.g., `export const BOOKMARK_ICON_16 = CARD_BOOKMARK_ICON;`) or hard-swapped (delete old, rename usages)? Given the touch surface is only 2 consumers, hard-swap is feasible. Alias retention adds noise without much benefit; recommend hard-swap.

4. **Rename commit grouping**: Can the rename ride into Session B's commit (which already touches `action-bar.ts` and `design-system.css`), or does it need its own bookkeeping commit? Recommend riding into Session B's commit; the rename is mechanical and thematically aligned (both are "icon-domain rationalization post-d1cee688a").

5. **Path B escalation policy**: §6 confirms Path B is CSS-only restructuring (no template-touching). The Gate 4 STOP-trigger does NOT fire. Confirm in-session fallback (proceed to Path B without escalation) if Path A is rejected.

6. **Yellow budget drift interpretation** (per user refinement #3, verbatim): *"Yellow budget drift: memory states 5 locked named contexts; grep returns 41. Is the locked-5 budget stale (relaxed in a prior session, memory not updated)? Or is the count-mechanism wrong (should yellow budget count contexts where yellow is the *primary* color, not every CSS use)? Or is this real drift requiring its own cleanup pass?"* §5's classification table provides the raw evidence — 4 save-affordance / 4 unclear-fallback / 33 non-save-affordance — for Design Navigator's interpretation call.

7. **Pattern A sub-pattern**: §8 classifies this as **both** patterns.md + decisions.md with the `.edp-save-btn` instance as grep anchor. Confirm this split-routing matches Design Navigator's intent, or consolidate to one file.

---

**Done state for this spec**: 9 sections present, scoring tables for rename candidates, occurrence list + classification for yellow budget, pattern banking pre-classification with grep evidence inline, six open questions teed up for Design Navigator review. No source touched. Read-only diagnostic complete.
