# Operational TODOs

Parked follow-ups discovered during sessions but deliberately not in scope for the originating session. Each entry should name the source session and a clear unblock condition.

## Pending follow-ups

### Brief generator line 552 staleness (parked from S110f)
`scripts/generate-enrichment-brief.ts:552` hardcodes `"Read \`docs/enrichment-anti-patterns.md\` for 10 confirmed mistakes to avoid."` Actual count is now 14 (13 numbered anti-patterns + Stall-Triggering Phrasings section added in S110f §7). Update during next maintenance batch — also consider replacing the hardcoded count with a runtime read of the markdown file's section count if that's easy.

### Lock-mechanism race (parked from S110f Step 0)
`scripts/auto-enrich.sh:140-172` uses non-atomic check-then-create lock. Two `auto-enrich.sh` shells fired simultaneously on 2026-05-07 01:00 and both passed the lock check. See `specs/duplicate-shell-investigation.md` for full analysis. Suggested follow-up label: `S111-lock-hygiene` (30-45 min).

### Upstream date-leak (parked from S110f Step 0 verification fire diagnostic)
Source data extractor produced 2026-05-21 date for Giannis Parios @ Pallas Theater event whose actual performances were Jan-Feb 2025 (per pallastheater.com). S110f catches the symptom post-hoc (`date-conflict-or-unparseable` tier-A0 concern). Upstream extractor needs separate investigation — which source produced this, and how many other 2025-events-tagged-as-2026 are in the corpus. Sample event id: `6bf991c139208a42`.
