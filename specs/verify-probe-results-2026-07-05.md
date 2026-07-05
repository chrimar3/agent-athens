# [VERIFY] Probe Battery Results — 2026-07-05

Read-only probe battery from SESSION BRIEF v2, Part B. **Every finding is report-only
(Guard 3 — nothing fixed).** Feeds the Design Navigator state digest (M1).

Executor note: several probes' line-number / path premises had drifted; where a
literal command returned nothing at the cited location, the probe was widened to
locate the real surface and that is reported below.

---

## P1 — Sort mechanism → **CLIENT-JS (DOM reorder), NOT navigation**

Source: `src/templates/filter-bar.ts` (the filter-bar Sort pill, not the comparison-table column sort).

**Options are dummy-href links, not pre-generated pages** (`renderSortPanel`, L310–317):
```
<a href="#" class="filter-radio-row is-selected" data-sort="date">   ...
<a href="#" class="filter-radio-row" data-sort="price">              ...
```

**A click handler reorders the live DOM** (inline script, L406–443):
```js
var sortLinks = document.querySelectorAll('[data-sort]');
sortLinks.forEach(function(link) {
  link.addEventListener('click', function(e) {
    e.preventDefault();
    var sortBy = link.getAttribute('data-sort');
    ...
    if (sortBy === 'price') {
      headers.forEach(function(h) { h.remove(); });      // strip date-group headers
      cards.sort(function(a, b) {                         // reorder .event-card by data-price
        var pa = parseFloat(a.getAttribute('data-price') || '9999');
        var pb = parseFloat(b.getAttribute('data-price') || '9999');
        return pa - pb;
      });
      cards.forEach(function(card) { grid.appendChild(card); });
    } else {
      window.location.reload();                           // date = reload, not navigate
    }
  });
});
```

**Classification:** CLIENT-JS. `href="#"` + `preventDefault()` + in-place `grid.appendChild`
reordering. The date option is a full-page `reload()`, not navigation to a sorted static
page. No `<a href>` to any pre-generated sort URL exists.

Note: the comparison-TABLE column sort is a different component (hub-comparison-table
progressive enhancement, §5 Hub template) — not reported here per the brief's caveat.

---

## P2 — `design-system.css` yellow-budget on `.edp-save-btn` → **NO YELLOW (intent already satisfied)**

⚠️ Brief's cited line (1214) has drifted: L1200–1230 is the **Calendar Disclosure**
block (`.cal-disclosure__summary`), not a save-btn colour rule.

Actual `.edp-save-btn` styling (`src/styles/design-system.css` L1153–1201) — shares a
selector trio with `.edp-share-btn`, `.edp-calendar-btn`:
```css
.edp-save-btn, .edp-share-btn, .edp-calendar-btn {
  ...
  color: var(--text-secondary);      /* neutral, not yellow */
}
.edp-save-btn:hover, ... { color: var(--text-primary); border-color: var(--border-default); }
.edp-save-btn:focus-visible, ... { outline: 2px solid var(--focus-ring); outline-offset: 2px; }
.edp-save-btn__icon path { fill: none; stroke: currentColor; ... }
.edp-save-btn.is-saved .edp-save-btn__icon path { fill: currentColor; }   /* inherits text colour */
```

The only yellow in any "save" context is a **different component**:
```css
/* L1360 */ .saved-event-item a:hover { color: var(--accent-primary); }   /* saved-events LIST link */
```

**Finding:** The DN's "no yellow on save controls" intent is already met in shipped CSS —
the EDP save button uses neutral text tokens (`--text-secondary`/`--text-primary`) and
`currentColor` for the saved fill; no `#f5e642`/`--accent-primary` touches `.edp-save-btn`
or its `.is-saved` state. Nothing to change. (The EDP icon+label vs card icon-only
shape-flip variant remains UNSPECCED per brief — no yellow either way.)

---

## P3 — Brief 3 (F4 visual confirm + F12 filter-bar clip) → **SHIPPED**

Evidence (`git log --oneline`):
```
f599705ff  fix(ui): F12 mobile pill clip + F4 complete (Satori renders plain strings, dont escape)
46fff112d  docs(notes): F4 incomplete-fix lesson (Satori plain-string) + F12 box-math pattern
38474c976  fix(ui): F1 hero void + F4 tile double-escape + F8 stamp/result-count clip
```
CSS confirms the 44px coarse-pointer pill fix is present (`design-system.css`):
```
L1556:  .filter-pill { min-height: 44px; padding: 10px 16px; }
```
**Finding:** Both F4 and F12 shipped (commit `f599705ff`), with follow-up lesson logged
(`46fff112d`). The 44px pill min-height is live in CSS.

---

## P4 — Duplicate Satori SVG ids → **No author-controlled ids in source; rendered output not inspectable**

Real generator: `src/generators/og-image.ts` (726 lines). (Brief's `grep 'id='` returned
nothing — that is itself the signal below.)

- `grep 'id='` → **0 hits**
- `grep 'id:|clipPath|linearGradient|<defs|url(#|crypto|random|uuid|counter'` → **0 hits**
- `ls dist/og/` → **absent** (site not built this session — no PNG/SVG to sample)

**Finding:** The source hand-authors **no** SVG element ids and uses no id-generation
primitives. Any duplicate-id risk could only originate inside Satori/resvg's own render-time
id emission, which cannot be observed without a build. **To settle definitively:** run
`bun run src/generate-site.ts`, then grep `dist/og/*.svg` (or inspect intermediate SVG) for
repeated `id=`. Flagged as a negative-existence claim — the full 726-line file was grepped
for the relevant primitives, but rendered output was not examined.

---

## P5 — `.hub-answer-capsule` margin/padding block (verbatim; DN judges the "margin hole")

`src/styles/design-system.css` L2541–2547:
```css
.hub-answer-capsule {
  padding: var(--space-lg);
  background: var(--bg-surface);
  border-left: 4px solid var(--accent-primary);
  border-radius: var(--radius-md);
  margin-bottom: var(--space-xl);
}
```
No `margin-top` is set (defaults to 0). For the DN's comparison, the **canonical spec**
(§5 Hub → Part 1 Answer Capsule) reads:
```css
.hub-answer-capsule {
  padding: 32px;
  background: var(--bg-elevated);        /* shipped uses --bg-surface (#242424) */
  border-left: 3px solid var(--accent-primary);   /* shipped: 4px */
  border-radius: 0 12px 12px 0;          /* shipped: --radius-md (symmetric) */
  margin-bottom: 48px;                    /* shipped: --space-xl */
}
```
**Finding (values only, no disposition):** shipped CSS diverges from spec on background
token (`--bg-surface` vs `--bg-elevated`), border-left width (4px vs 3px), and border-radius
(symmetric `--radius-md` vs asymmetric `0 12px 12px 0`). `margin-bottom` uses `--space-xl`
(64px per the spacing scale) where the spec text says 48px. DN to rule.

---

## P6 — Phase-C prototype artifacts → `prototypes/redesign-v2/`

The real prototypes live in `prototypes/redesign-v2/` (untracked), NOT in `specs/`:
```
home.html            (379 KB)  — home first-viewport
hub-today.html       (168 KB)  — hub /today
event-upcoming.html  (179 KB)  — event-detail (upcoming state)
event-past.html      ( 66 KB)  — event-detail (past state)
baseline.css         ( 81 KB)  — captured baseline
proto-v2.css         (8.7 KB)  — prototype styles
tokens-v2.css        (3.0 KB)  — prototype tokens
build-prototypes.ts / screenshot.ts / verify-elements.ts  — tooling
shots/               (dir, ~30 screenshots)
```
Supporting checkpoints in `specs/`: `phase-c-prototype-checkpoint.md`,
`phase-0-reality-check.md`, `redesign-spec-v2.md`.

**Finding:** All three requested surfaces present — home first-viewport (`home.html`),
hub /today (`hub-today.html`), event-detail (`event-upcoming.html` + `event-past.html`).

---

## Executor cross-cutting note
Part A (design-system.md corrective sweep) could NOT run: **`design-system.md` does not
exist on disk or in git history** anywhere under the repo, `Project with Claude/` (incl. the
Obsidian vault), or `/Users/chrism` (depth 6). The decisions log (`.claude/notes/decisions.md:4823`)
nonetheless cites `docs/design-system.md §4` as canonical. The Design Navigator subsequently
pasted the full canonical content into the session — but as a lossy paste (markdown tables
flattened). Part A is held pending a decision on where the canonical file should live and how
to materialise a clean copy. See session report.
