# June Deploy-Drought — Diagnostic & Restore Record (2026-06-28)

## Root-cause class
**Armed build-FAIL invariant blocking deploy on streetAddress venue drift.**
(Known family — same as S104, 2026-06-12. NOT a deploy-side failure, NOT the
`claude -p` stdin hang, NOT the auth/billing "new class" the brief hypothesized.)

## Symptom
`agentathens.com` served stale data. Live sitemap `lastmod` stuck at 2026-06-13.

## Mechanism (confirmed by logs, not inferred)
1. The schema-completeness gate was armed to a hard build-FAIL on 2026-06-12
   ("F2b arming"): any event-detail page with empty
   `location.address.streetAddress` → `failCount > 0` → `process.exit(1)`
   (`src/generate-site.ts:1302`, `src/validators/schema-completeness.ts:424`).
2. The daily `full` pipeline (`com.agentathens.daily` → `daily-automated.sh`,
   default mode `full`, 08:00 Athens) runs `bun run build` at the SITE GENERATION
   phase. When the gate fails, the build exits non-zero and `run_deploy()`
   (`daily-automated.sh:478`) is never reached.
3. `logs/launchd-stdout.log` (2026-06-25) shows "Generating static site…" jumping
   straight to PIPELINE SUMMARY — no "Site generation completed", no DEPLOYMENT
   phase. Every daily run since has aborted the same way.
4. The streetAddress cascade is
   `event.venue.address || findVenueConfig(name)?.address || ''`
   (`event-page.ts:178`, `schema-graph-builders.ts:73`). `findVenueConfig` reads
   **`config/athens-venues.json`** (`location-filter.ts:104`) — NOT
   `venues-master.json` (that file only supplies coordinates via `normalize.ts`).

## Timeline / premise corrections vs. the brief
- **Real onset: June 8.** Last automated `deploy-success` in
  `logs/deploy-cadence.log` is `2026-06-08T05:47:42Z`. June 13 (the brief's date)
  was merely the last build that happened to pass the gate.
- **The `Claude CLI auth check failed` errors are a separate, older issue** —
  present intermittently in `logs/auto-enrich-*.log` back to 2026-04-28. They block
  *fresh enrichment* but did not stop deploys. As of 2026-06-25 all 4 daily
  enrichment runs fail → enrichment is now hard-down (tracked as a separate fire).
- **The operational defect:** `check-deploy-cadence` wrote a daily staleness line
  to `logs/deploy-cadence-ALERT.log` for ~2 weeks. It is a passive marker no one
  reads — not an active alert. This is the silent-drought recurrence.

## Blocking set (captured at restore time)
- 67 schema-completeness errors → 51 event-detail pages + 16 hub `CollectionPage`
  ListItem parity errors (drift had grown from 39 on 2026-06-24).
- 47 EL+EN event pages → **33 unique events** across **7 distinct venues**, all
  with empty `venue_address` and an `athens-venues.json` entry lacking `address`.

## Fix applied (Path A — verified backfill, gate kept armed)
Added a **verified** `address` to the 7 existing `config/athens-venues.json`
entries (canonical_name already matched the DB `venue_name`):

| Venue | streetAddress | Source |
|---|---|---|
| Μύρτιλλο | Τριφυλίας & Λάμψα, Αμπελόκηποι 115 24 | myrtillocafe.gr / guides |
| Από Κοινού | Ευπατριδών 4, Αθήνα | culturenow.gr |
| Εθνική Λυρική Σκηνή | Λεωφόρος Συγγρού 364, Καλλιθέα 176 74 | nationalopera.gr |
| Floyd | Πειραιώς 117, Αθήνα 118 54 | floyd.gr |
| Θέατρον Ελληνικός Κόσμος | Πειραιώς 254, Ταύρος 177 78 | hellenic-cosmos.gr |
| Θέατρο Χορν | Αμερικής 10, Αθήνα 106 71 | elculture / xo.gr |
| Θεατράλε | Κοσομούλη 30, Νέος Κόσμος | athinorama (event page) |

Rebuild after backfill: **0 errors** (was 67), build exit 0, SITE GENERATION
complete. Deployed via `netlify deploy --prod --no-build --dir=dist`.

## Follow-ups (not done this session)
1. **Enrichment auth fire** — all daily enrichment runs failing since (at least)
   2026-06-25; intermittent since April. Needs its own diagnostic. Possible
   mid-June Claude Code headless/billing change.
2. **Silent-drought prevention** — wire the existing `deploy-cadence` +
   enrichment-freshness signals to an *active* alert (local + email), so a future
   gate-block surfaces same-day instead of after 12 days.
3. **GEO policy call (not executor's):** should one address-less venue hard-block
   the entire build, or should incomplete pages be per-page noindex'd while the
   rest ship? Mechanism is implementable once GEO rules on the citability tradeoff.
4. Uncommitted `data/venues-master.json` geo edits (Σαρδανάπαλος, Cycladic) are
   unrelated to this gate (coordinates, not streetAddress) — leave for their owner.
