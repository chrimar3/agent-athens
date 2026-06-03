# S165 — Genre/About Emission Gate: Refutation Spec

**Status:** Refuted at Step 0 (read-only probe). No code change shipped.
**Date:** 2026-05-29
**Brief:** "Genre/About Emission Gate + Validator Extension" under the GEO Strategist
"omit beats empty" ruling. Prescribed (1) validator FAIL on empty `genre`/`about` arrays,
(2) emission-site gate so `[]`/`""` are omitted, (3) removal of the S164 `visual-arts`
type-level default, (4) coverage-manifest entries + a Tier-A invariant.
**Outcome:** Premise refuted on four independent counts. Report-only close-out chosen.
**Related:** `specs/image-finder-S165.md` (the prior refuted S165 — label collision; see §4).

---

## §1 — Premise table (claim → reality → evidence)

| Brief claim | Reality | Evidence |
|---|---|---|
| "The daily build emits `[]` until closed." Empty `genre`/`about` arrays/strings escape into rendered Schema.org JSON-LD. | **Zero empty emissions** in the current build. The brief's own §4 "Done when" criterion is already satisfied at baseline. | `grep -rE '"(genre\|about)":\s*(\[\]\|"")' dist/` → **0** matches. |
| Emit sites in `src/templates/` and `src/generators/` produce `genre`. Gating them is the unblock. | Event JSON-LD on detail pages emits **no `genre` field at all**. The 882 `"genre":` occurrences in `dist/` all live in `/api/*.json` (flat data feed, **not** a Schema.org surface) — 0 in `.html`. | `grep -rh '"genre":' dist/ --include='*.html'` → 0; `--include='*.json'` → 882. Sampled `dist/events/00013a1f--phantom-spell/index.html` JSON-LD: only `@type`, `name`, `description`, `location`, `offers`, `image`, `performer` — no `genre`/`about`. |
| Adding a FAIL rule to the validator "will fail build (intentional, Step 2 closes it same session)." | Validator is **warning-only and never blocks build.** A FAIL rule there would only WARN. Promoting it to gate-mode is a separate, larger change. | `src/generate-site.ts:1222-1224`: `// Schema completeness validation (warning-only, never blocks build).` `validateAllPages()` is called and `printSchemaSummary()` reports; no `process.exit(1)` is wired from validator output. |
| S164 left a `visual-arts` type-level default that needs removal per ruling §3. | **Confirmed type-level default.** `scrape-onassis.ts:201`: `const genres = type === 'exhibition' ? ['visual-arts'] : [];`. **But:** it feeds the source `Event.genres: string[]`, which flows into the API feed and is **never emitted to Schema.org JSON-LD**. An in-code comment (`:198-200`) documents the empty branch as a *deliberate* "schema-safer pending GEO Strategist guidance" decision. Removing it requires sign-off on whether the ruling extends to the API substrate. | `scripts/scrape-onassis.ts:198-201`; `src/types.ts:16` (`genres: string[]`); end-to-end trace: no `genre` key in any JSON-LD emit site (`src/generators/event-page.ts:147-252` Event node; `src/utils/schema-graph-builders.ts:37-109` ListItem node). |

**Additional latent fact (not in brief, surfaced by the probe):** the classifier
(`src/categorizer/categorize-event.ts:48,261`) computes a `genreHint` value, but **no
caller reads it.** Combined with the populated `genres[]` in source and 882 `genre` values
in the API feed, the genuine opportunity (if any) is the *inverse* of the brief: wire
`genre` *into* Event JSON-LD with omit-on-absence semantics. Out of scope for this session;
queued as the GEO Strategist's next ruling-bearing question.

---

## §2 — Substrate confusion

The brief conflated two distinct surfaces:

- **Source field:** `Event.genres: string[]` (`src/types.ts:16`), populated by scrapers
  (`scripts/scrape-onassis.ts`, `scripts/scrape-all.ts`), persisted to the DB, and emitted
  into the **flat `/api/*.json` data feed** (a project-internal data surface, not
  Schema.org).
- **Schema.org emission:** the `genre` / `about` keys on Event-subtype / Movie / CollectionPage
  nodes inside `<script type="application/ld+json">` on rendered HTML pages.

The GEO Strategist "omit beats empty" ruling targets **Schema.org emission**. The brief's
prescribed work (validator + emission-site gate) operates on the **emission** surface — but
the defect the brief named (`[]` values, S164's `['visual-arts']`) lives in the **source-field**
surface. The two never connect: nothing wires `Event.genres` into Event JSON-LD.

**Lesson:** before scoping a fix against a ruling, classify which surface the ruling targets,
and probe whether the named defect actually lives on that surface. Rulings about one substrate
don't automatically govern the other. If the project wants source-field shape to also follow
omit-beats-empty (so the API feed never carries `""`/`[]`), that's a separate ruling that needs
its own scope (does it apply to `image_url`, `description`, etc., too?).

---

## §3 — Validator-mode confusion

The brief's Step 1 architecture rests on: "validator activated alone will fail build…
intentional, Step 2 closes the gap in same session."

The validator is wired warning-only. `src/generate-site.ts:1222-1224`:

```ts
// Schema completeness validation (warning-only, never blocks build).
// sameAsSeverity decided at build start (Sprint 2 Component B-2 ratchet).
const schemaResults = validateAllPages(DIST_DIR, sameAsSeverity);
printSchemaSummary(schemaResults);
```

Adding a "FAIL on empty array" rule inside `schema-completeness.ts` would emit a WARN line
in the build summary and exit 0. The build wouldn't break, the "Step 2 closes the gap" framing
loses its force, and the rule sits as advisory infrastructure against zero current violations.

Promoting `schema-completeness.ts` from advisory to gate-mode (exit 1 on any FAIL) is a real
session with build-invariant blast radius: every existing FAIL across the corpus becomes a
deployment blocker overnight. That promotion warrants its own brief, its own pre-flight
ratchet design (similar to the `sameAsSeverity` ratchet referenced in the comment), and its
own risk assessment in `mistakes.md`. **Out of scope here.**

---

## §4 — Label collision + naming convention (decided)

`specs/image-finder-S165.md` (and the shipped `S165` athinorama-thumbnail decision in
`.claude/notes/decisions.md`) already used the `S165` label on 2026-05-27. This brief reused
`S165` two days later for an unrelated topic. That's at least the **third** time the label
has been bound (image-finder refuted; athinorama upgrader shipped; this genre-emission brief
now refuted).

**Convention going forward (decided):** refuted briefs keep the **original S-number with a
`-refutation` suffix**. Numbers are **not** burned.

- *Rationale:* burning a number creates index gaps that read as missing sessions; suffixes
  preserve the linear ledger and make refutations searchable as a class (`grep -l "S.*-refutation"
  specs/`). The spec history stays continuous; the disposition is encoded in the filename.
- *Applies to:* spec file names (`specs/<topic>-S<n>-refutation.md`), and notes-entry titles
  (disambiguate from any shipped same-numbered entry by including the topic, e.g.
  `S165 (refutation, genre-emission-gate)`).
- *Logged in:* `.claude/notes/decisions.md`.
- *Pre-brief checklist item added:* planner greps `specs/` for the proposed S-number before
  issuing a brief. Logged in `.claude/notes/mistakes.md`.

---

## §5 — No code change. No deploy.

This session ships:

- This spec file.
- Append-only entries to `.claude/notes/decisions.md`, `.claude/notes/mistakes.md`,
  `.claude/notes/patterns.md`, `docs/session-log.md`.

It does **not** ship:

- Any change to `src/validators/schema-completeness.ts` (no new FAIL rule).
- Any change to `scripts/scrape-onassis.ts` (the `['visual-arts']` type-level default stays,
  pending GEO Strategist sign-off on whether the ruling extends to the API substrate).
- Any change to the emission sites (`src/generators/`, `src/templates/`, `src/utils/schema-graph-builders.ts`).
- Any change to coverage manifests or `docs/current-infrastructure-v2.md`'s Deferred Register.
- Any commit, push, or deploy.

Staging would be by explicit path (`specs/` + the four notes files) if the user asks to commit;
not part of this session's automatic close-out.

---

## Queued (not for this session)

- **Option 2 — Remove S164 `visual-arts` default.** Pending GEO Strategist ruling on whether
  "omit beats empty" extends to source-field / API-substrate.
- **Option 3 — Promote validator to gate-mode.** Needs its own brief: ratchet design,
  pre-flight corpus scan, risk assessment.
- **Option 4 — Wire `genre` into Event JSON-LD with omit-on-absence.** The inverse, real
  opportunity. Needs GEO Strategist scope: per-EventType field mapping (which classifier
  outputs map to `genre` on `MusicEvent`, to `about: Thing` on others?), absence policy
  (classifier-confidence threshold for omit vs emit), target-surface scope (Event JSON-LD
  only vs also CollectionPage / hub `itemListElement`?). Connect to the unused `genreHint`
  from `src/categorizer/categorize-event.ts`.
