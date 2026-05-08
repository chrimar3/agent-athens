# Operational TODOs

Parked follow-ups discovered during sessions but deliberately not in scope for the originating session. Each entry should name the source session and a clear unblock condition.

## Pending follow-ups

### Brief generator line 552 staleness (parked from S110f)
`scripts/generate-enrichment-brief.ts:552` hardcodes `"Read \`docs/enrichment-anti-patterns.md\` for 10 confirmed mistakes to avoid."` Actual count is now 14 (13 numbered anti-patterns + Stall-Triggering Phrasings section added in S110f §7). Update during next maintenance batch — also consider replacing the hardcoded count with a runtime read of the markdown file's section count if that's easy.

### Upstream date-leak (parked from S110f Step 0 verification fire diagnostic; updated post-S110g 2026-05-07)
Source data extractor produced 2026-05-21 date for Giannis Parios @ Pallas Theater event whose actual performances were Jan-Feb 2025 (per pallastheater.com). Sample event id: `6bf991c139208a42`. Upstream extractor needs separate investigation — which source produced this, and how many other 2025-events-tagged-as-2026 are in the corpus.

**S110f date-conflict gap empirically confirmed (run_id `1778180428-57709`, 2026-05-07 22:00):** This event was the only one of 5 saved in the S110g verification fire that was NOT filtered by S110f's chokepoint — it shipped to `dist/`. The agent did not flag a `date-conflict-or-unparseable` concern. Hypothesis: S110f's date-conflict rule fires only when dates are syntactically invalid or fail to parse; it does not catch syntactically-valid-but-empirically-wrong dates (2026-05-21 parses as a valid future date; the venue evidence that contradicts it lives outside the parser's reach). Calibration territory for the audit, not S110g's scope. Upstream fix remains the right durable solution; tightening the date-conflict rule is the temporary chokepoint.

### S110f calibration audit (parked from S110g Step 6 — sample-driven trigger)
S110g's verification fire produced the first real concerns dataset. S110f's `venue-mismatch-or-unknown` rule fired 50% of last-24h hard-stops, well over the 10% threshold — `HARDSTOP_FIRING_RATE_EXCEEDED` warning was emitted in the build report. Per-source firing: onassis 100% (2/2), more.com 66.7% (2/3), megaron 50% (1/2), residentadvisor 50% (1/2).

**Trigger:** Audit when hard-stop accumulation reaches **30 events** OR after **7 days (2026-05-14)**, whichever first. Re-evaluate `venue-mismatch-or-unknown` first; the 50% rate suggests rules likely over-tuned. Sample-driven not date-driven per S110g Step 6 refinement — original +3d was sized for the originally-specified ~50 hard-stops dataset.

Calibration thresholds (from S110f original plan):
- False-positive rate <10% → calibration good, no action
- False-positive rate 10–25% → tighten over-firing rules in `config/enrichment-gate-rules.yml`
- False-positive rate >25% → flip kill switch (already enabled at runtime), plan S110h-style full re-evaluation

Estimated time: ~1 operator-hour. Do not skip.

### scripts/auto-enrich.sh:393 doubly-stale comment sweep (parked from S110h)
`scripts/auto-enrich.sh:393` stale comment — `(default 900s, was 1800)` will be doubly stale post-S110h (commit `fb1b46cfb`, 2026-05-08, raised default 900 → 1200). Sweep on next wrapper-touch session, not now. Explicit boundary deferral: S110h's plan kept lines 388–397 out of scope; one-line annotation update doesn't justify a dedicated session, but it should land on the next wrapper edit.
