# GSC + Bing Remediation — Session 1 Checkpoint (2026-05-26, rev 2)

Checkpoint after 2.2 step 1. The 2.2 remainder grew into a data effort (DB re-classification + real-address backfill), so it + 2.3 + 1.5b are deferred to a fresh window.

## Landed this session (all on `main`)
- `780e1f180` — 1.5a + #2 + #3 decode-then-escape (meta / `<title>` / action-bar). Merged; base of S155/S156.
- `964ee8af2` — 1.2 pipe-split venue recovery + removed `ΚΥΤΤΑΡΟ LIVE|ΠΟΛΛΑΠΛΟΙ ΧΩΡΟΙ` config pollution.
- `e9b74ec55` — 1.3b type-conditional endDate (multi-day honest absence + WARN).
- `8abc5b6e6` — 2.1′ detail-page-scoped location build-halt + halt-count (NOT node-keyed).
- `6357a1e95` — 2.2 step 1: streetAddress falls back to config address. **Empty-streetAddress detail pages 21 → 7.**

All path-staged/isolated; `tsc` clean; per-feature tests green; build exits 0.

## Shared-tree constraints (UNCHANGED)
- Per-step path-staging only — never `-A`/`-a`. Re-probe `git status` + `git stash list` + shared-file divergence before EVERY commit (tree churns across/within sessions; S157 landed mid-session).
- **Do-not-touch**: `src/styles/design-system.css`, `tests/build/scroll-container-overscroll.test.ts`, `stash@{0}`, `stash@{1}` (both now confirmed safe to drop — nothing lives only in them — but dropping is Christos's call). Verify these 2 files unstaged + both stashes listed after each commit.
- `data/events.db` gitignored; `scripts/filter-athens-only.ts` **deletes** rejected_non_athens events — prefer a surgical `UPDATE` over a full re-classify run.

## Remaining Session 1 work (run on `main`, in order)

**2.2 remainder — bring empty-streetAddress 7 → 0, THEN promote to halt-error**
The 7 remaining (corrected grep `'"streetAddress":[[:space:]]*""'` over `dist/events` + `dist/en/events`):
- **4 × `TBA - ATHarea`** — config-pollution placeholders. Remove the 3 TBA symptom-patch entries in `config/athens-venues.json` (`canonical_name` = `στην Αθήνα TBA`, `TBA - Big Bar Athens`, `TBA - ATHarea`; all empty variations / "Unknown" neighborhood / no address). Then the current verified_athens TBA rows need re-applying to non-publishable — **surgical** DB update preferred: `UPDATE events SET location_status='problematic' WHERE venue_name LIKE 'TBA%' AND location_status='verified_athens'` (verify checkLocation returns problematic/unverified for `TBA - ATHarea` after the config removal first). Rebuild → these 4 drop out.
- **Patision65 (×2), Aux Club (×1)** — real venues in config but **without an `address` field**. Backfill real Athens addresses into their config entries (Tier-1: NO fabrication — research actual addresses; Patision65 ≈ Patision Ave 65). Rebuild → these 3 resolve via the step-1 fallback.
- **THEN promote `streetAddress` to a halt-error** in BOTH validator layers (`src/utils/schema-validator.ts` add `location.address.streetAddress` to MANDATORY; `src/validators/schema-completeness.ts` promote the existing `warnings.push('streetAddress is empty')` at ~377 to `errors.push`). ONLY after the corrected grep shows 0 — else 2.1′ halts the build. TDD: empty-streetAddress + no-config-fallback event → build exits non-zero; resolved → passes.

**2.3 — S110 manifest registration** — `src/validators/completeness-reporter.ts` (`buildCompletenessReport`/`writeCompletenessReport` → `data/build-completeness.json`): register `location = validated:full / FAIL`, `endDate = validated:partial / WARN`.

**1.5b — composer polish** (`src/utils/meta-descriptions.ts` ONLY) — `generateEventMetaDescription`: abbreviation-aware truncation (`truncateAtSentence` at ~:48 grabs "Mr."/"P." → fragments), strip `**` markdown, 120-char floor backstop. **Compose on decoded text; escaping stays at the emission seam** (event-page.ts, done in 1.5a). Do NOT add escaping/composition to `page.ts`. TDD: ≥120 chars for unenriched fixture; "Theodosis P."/"REVOLT!" → real sentences not fragments; len-0 residual (10 pages) → 0. Ref `specs/gsc-bing-diagnostic.md` §0.5.

## Owed at session close (ownership all-mine; safe to write)
- `.claude/notes/patterns.md`: (1) **tree-state-is-an-unverified-premise** — `git status` + `git stash list` + shared-file divergence pre-flight before authorizing a commit; re-probe at consumption time (Steps A/B went moot across a boundary). (2) **NEW, distinct — a diagnostic command is itself a premise**: a grep returning 0 may mean "no matches" OR "malformed pattern that matched nothing" — verify the command, not just its output (the Phase-0 `'"streetAddress": ?""'` literal-`?` bug gave a false 0 that propagated through 5 plan revisions as "2.2 has 0 backlog").
- **Recurrence ledger → 10 (NOT held at 9)**, Pattern-B (false-diagnostic): "2.2 has 0 backlog" was a wrong premise from Phase 0 that shaped 5 revisions; caught before code, but it was a live wrong-premise acted on in planning — log honestly as +1, not gate-caught.
- `.claude/notes/mistakes.md`: location-WARN-tolerated shipping defect (now gated by 2.1′); whitelist symptom-patch pollution — TWO instances now (`ΚΥΤΤΑΡΟ LIVE|…` pipe, removed in 1.2; `TBA -` placeholders, removal pending in 2.2 remainder); Phase-0 false-0 grep.
- `docs/known-issues.md`: ticketservices venue-concat (scraper fix deferred); 8 "Athens" hardcodes (Pattern-G batch, not before demo); mooted Phase-3 `--list`; config symptom-patch-pollution class (audit `config/athens-venues.json` for other empty-variation/"Unknown"-neighborhood auto-added junk entries).
- `docs/session-log.md`: append.
