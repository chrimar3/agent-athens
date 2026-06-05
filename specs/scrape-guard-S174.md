# S174 — Scrape-time Missing-Address Guard + Hard-Stop Arming

**Date:** 2026-06-05
**Goal:** Stop the streetAddress fail class regenerating at source; clear the 11-venue residual; arm the (currently toothless) location hard-stop.

## Step 0 — Edit surface grounded

- Exit line: `src/generate-site.ts:1591` — `main().catch(console.error)` (still unshipped, as checkpointed in S172 spec).
- Hard-stop throw: `src/generate-site.ts:1277`.
- Baseline: HEAD `build-completeness.json` → fail = **13** (residual from S172's 14; no new drift cluster — one fail aged out of the page window).
- **Brief premise corrected (ledger):** `src/ingest/` + `src/importers/` contain NO `venue_address` write site — `src/ingest/` is email/newsletter parsing only. The actual persistence seam for ALL scrapers is `src/db/database.ts:upsertEvent` (line 227): `scrape-all.ts` and the standalone scrapers all funnel through it, and it already hosts two ingest-chokepoint guards (S154 `decodeEventFields`, the `isAthensEvent` filter at :238). The brief's stop-condition ("no write site in import path → re-scope") resolves to: **the chokepoint is one layer lower, in the DB write**, which is *better* — it covers email-ingest and any future scraper for free.

## Step 1 — Seam decision: (A) chokepoint warn in `upsertEvent`

**Insertion point:** `upsertEvent`, after the Athens filter (only Athens-bound events matter), before the INSERT. Non-blocking: the event persists regardless (Constitution: completeness never blocks collection).

**Trigger condition — cascade-aware, not merely event-empty:** warn when
`!event.venue.address?.trim() && !findVenueConfig(event.venue.name)?.address?.trim()`
i.e. exactly when the JSON-LD streetAddress cascade (`event.venue.address || findVenueConfig(name)?.address || ''`) would bottom out at `''` and create a future build fail. This deliberately narrows the brief's literal "warn when address empty/missing": an event-level empty address whose venue config covers it is harmless (cascade fills it) — warning on those would fire constantly and train the operator to ignore the guard. The guard targets the *deploy-blocking class*, not cosmetic emptiness.

**Output:** structured greppable line
`[address-guard] venue="<name>" missing address (event=<id>, source=<source>) — streetAddress will emit empty; add to config/athens-venues.json`
deduped per venue per process run (Set) so one venue with 40 events warns once. Pipeline logs (`logs/pipeline-*.log`) capture stdout/stderr already → daily greppability for free.

**No import cycle:** `src/quality/location-filter.ts` imports nothing from `src/db/` (verified).

## Step 2 — TDD: guard shipped (commit fa1c28c88)

Red→green in `src/db/__tests__/upsert.test.ts` (3 tests: warn+persist for uncovered venue; silence for config-covered venue; per-venue dedup). Implementation: cascade-aware warn in `upsertEvent` after the Athens filter, module-level dedup Set, greppable `[address-guard]` prefix. db+quality suites 273 pass / 0 fail.

## Step 3 — 11/11 mangled venues resolved (zero skips)

| Venue | Address | Resolution note |
|---|---|---|
| Εν Αθήναις | Iakchou 19, Athens 118 54 | fragment "19" was the real number |
| Κιβωτός | Pireos 115, Athens 118 54 | fragment "18" was WRONG — verified 115 |
| ΦΙΑΤ | Falirou 97, Athens 117 41 | "conflict" was one building, two frontages (Syngrou 114 = entrance side); Falirou canonical |
| Εκάτη | Ekatis 11, Athens 113 64 | fragment "Θεσσαλονίκης" was a mis-capture; street is the theater's namesake |
| Σύγχρονο Θέατρο | Evmolpidon 45, Athens 118 54 | official site confirms |
| Θέατρο Κνωσός | Knosou 11, Athens 112 53 | Kato Patisia |
| Στοά | Biskini 55, Athens 157 71 | Zografou per official site; Acropolis fragment was garbage. Anchor "Syntagma" wrong |
| Θέατρο Τέχνης | Frynichou 14, Athens 105 58 | plain listings = Frynichou main stage; Υπόγειο is separate |
| Γερμανική Εκκλησία Αθηνών | Sina 66, Athens 106 72 | official site "Sina 66/68"; Kolonaki not Syntagma (anchor wrong) |
| ΘΕΑΤΡΟ RADAR | Pitheou 93, Athens 117 44 | Neos Kosmos, opposite Ag. Ioannis metro |
| Θέατρο Βασιλάκου | Profiti Daniil 3 & Plataion, Athens 104 35 | Kerameikos |

Config now holds **110 venues with address** (37 pre-S172 → 99 → 110). New wrong-anchor flags for Editorial: Στοά (Syntagma→Zografou), Γερμανική Εκκλησία (Syntagma→Kolonaki), ΘΕΑΤΡΟ RADAR (Central→Neos Kosmos), Θέατρο Βασιλάκου (Central→Kerameikos) — total anchor-flag list now 8.

## Step 4 — Hard-stop ARMED (commit d213608f9)

Gate read from output: post-build `jq '.events.totals.fail'` = **0** ✓; guard committed (fa1c28c88) ✓. Exit line `src/generate-site.ts:1591` → `main().catch((e) => { console.error(e); process.exit(1); })`. Armed verification: `bun run build; echo $?` → **0**, "missing required location: 0", full suite 2,685 pass / 0 fail. The 2.1′ rule ("never deploy incomplete Schema.org location") is enforced for the first time since it shipped.

## Step 5 — Drift re-check

Post-arming rebuild: **0 fails** — no new drift cluster since S172's wave-2 (the overnight 06-05 scrape introduced none; contrast 33/day measured on 06-04). Going forward, drift venues surface same-morning as `[address-guard]` lines in `logs/pipeline-*.log`, and a venue with no address anywhere blocks deploy by design — config backfill (or suppression) is the unblock.
