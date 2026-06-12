# F2b residual (S187, 2026-06-12/13)

## Conditional routing check (brief: "if NULL-end theater is dominated by single performances")

**Premise NOT confirmed — no action taken, routed to Editorial as data.** Of 284 live-window NULL-end theater rows (verified, start within ±90d): 24 future-start, 260 past-start. Only **46** are in the actual presumed-running band (start ≤45d ago); the rest already cooled. Source breakdown of the 46: **more.com 38**, ticketservices 2, snfcc 2, megaron 2, athinorama 2. more.com lists multi-month runs without captured end dates (samples: National Theatre "All My Sons", ΤΖΕΝΗ ΤΖΕΝΗ, Μάρτυρας Κατηγορίας — known long runs), so the presumption is plausibly CORRECT for the dominant slice; athinorama premiere-singles are 2/46. Per G1-b the window stays 45; whether more.com theater scraping should capture run ends at source (S186-style) is an Editorial/scraping question — that, not the window, is the lever if presumed-running singles ever dominate.

## Stale-artifact caveat (pre-existing, A2-F5/orphan-sweep territory)

`dist/events/` accumulates pages from prior builds; 3,142 files grep EventCompleted but only current-DB-backed pages are governed by F2b invariants (333 NULL-end run-implying pages verified: 0 violations). Stale pages carry pre-F2b markup until the orphan-sweep lands (protect-registry blocker, decisions.md S184).

## Step 3 invariant (b) — implementation deviation from brief

Brief asked for both invariants in `schema-completeness.ts` as FAIL. (a) is there (EventCompleted-without-endDate on run-implying @type → error). (b) "synthesized endDate for NULL-end row" is NOT HTML-observable (the validator can't see DB-null), so it ships as a **structural throw at emission** (`event-page.ts` buildEventSchemaObject) + the same omit-rule in `schema-graph-builders.ts` — stronger than a validator check: the state cannot be emitted at all. Unit-tested via the run-implying no-synth tests.

## Athens-midnight test flake class (fixed S187, watch for recurrences)

UTC-anchored test fixtures (`new Date(Date.now()...)`, `iso(0)`) are one day behind `getAthensTodayStr()` between 00:00–03:00 Athens. Three suites flaked mid-session when the clock crossed midnight. Fix pattern: anchor date fixtures to the exported `getAthensTodayStr()` (event-lifecycle.ts). Any remaining UTC-anchored date test is a latent flake.
