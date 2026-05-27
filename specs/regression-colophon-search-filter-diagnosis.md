# Diagnosis: "colophon + search + filter broke together" (2026-05-27)

## Verdict: NOT a regression — stranded working-tree work (recovered)

The three threads were **not** a single cascade and **not** new breakage. They are the
S158c/S159 demo-hardening fixes (2026-05-26) that were **stashed and never re-applied**,
so the 2026-05-27 daily rebuild shipped `dist/` without them. This reproduces the S159
conclusion already on record: *"filters+search+colophon broke together were three
unrelated issues, not a cascade."* Independent inline `<script>`s can't cascade.

## Originating event
S158c/S159 UI work sat uncommitted → stashed 2026-05-27 01:33 as `stash@{0}`
("pre-save-drop-fix WIP", base `0e9a4298e` S158 close-out) to clear the tree for the
urgent save-drop fix → save-drop (`936cbf0d9`), streetAddress parity (`b1c5902eb`),
daily (`1d8b8f174`) committed on the clean tree → **stash never re-applied** → daily
rebuild shipped without the UI work.

## Per-thread

| Thread | Fault class | Source of fix | Remedy applied |
|---|---|---|---|
| **Colophon** | Recoverable lost work — wiring never committed (`86b0f4018` only *added* `colophon.ts`, 0 deletions) | `stash@{0}`: `site-chrome.ts` (+7 import + trigger left-of-search + dialog + script), `colophon.ts` (label "About me"→"About"), `colophon.test.ts` (ordering flip), `design-system.css` (colophon CSS) | `git checkout 79f4f9f1b -- <files>` |
| **Filter** | Recoverable — S158c iOS mobile bottom-sheet panel trapped by `position:fixed` ancestor + S159 mask clip | `stash@{0}`: `filter-bar.ts` (+19 relocate panel to `<body>`), `design-system.css` (`.filter-bar.has-open-panel .filter-bar-scroll { mask-image:none }`) | same checkout |
| **Search** | Recoverable — **reveal bug, NOT data**. `/search-index.json` present & non-empty (185 KB; 2 events / 2 venues / 12 categories). | `stash@{0}`: `search-overlay.ts` (+6: result groups `display:''`→`'block'`) | same checkout |

The brief's "no results = bad/empty index" (Step-2) hypothesis is **refuted by evidence**:
the index ships fine; the fault was a CSS/JS reveal.

## Recovery method (safety)
Selective `git checkout <stash-sha> -- <6 UI files>` — **not** wholesale `git stash apply`.
The same stash also carries stale `src/db/database.ts` (-29), `src/validators/schema-completeness.ts`
(-16, +test -43), `src/utils/schema-graph-builders.ts` that predate and would have reverted
the committed save-drop / streetAddress fixes. Boundary check (`git status --short`) confirmed
exactly the 6 UI files staged, nothing under `src/db/` or `src/validators/`.

## Verification (post-recovery)
- `colophon.test.ts`: 32 pass / 0 fail (the 4 previously-red integration tests now green).
- Full suite: 2606 pass / 1 skip / 1 fail. The single fail is **pre-existing & unrelated**:
  `en-cornerstone-presence` expects `dist/en/exhibitions/index.html`, which is not generated
  (no `/en/exhibitions/` hub builds). Outside the 3 threads; not caused by this recovery.
  (3 other failures in the first run were stale-`dist/` artifacts and pass after rebuild.)
- Clean build: exit 0.
- Puppeteer runtime (system Chrome, headless) — VISIBLE, not just DOM-present, 0 page errors:
  - Colophon: trigger 44×58 visible, left of search, dialog opens 640×757, Esc closes.
  - Search: overlay opens; "Jazz" → events/venues/categories groups `display:block`, h≈100, 1 item each; index fetch OK.
  - Filter (mobile 390×844, `/en/this-weekend/`): panel relocated to `<body>`, 420×327 at viewport bottom (517→844), visible in viewport.

## Carry-forwards (post-demo, do not block today)
1. **Deploy-gate gap** — the daily build shipped with 4 red `colophon.test.ts` tests; Constitution #4
   ("no deploy w/o passing tests") is not actually enforced at deploy.
2. **Stash-strand failure mode** — "clear the tree for an urgent fix, never re-apply" stranded demo
   work ~a day. Consider a pre-deploy `git stash list` warning in the daily pipeline.
3. **Pre-existing** — `/en/exhibitions/` cornerstone not generated (fails `en-cornerstone-presence`).
