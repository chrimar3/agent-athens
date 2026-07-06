# Visibility Campaign — Remaining Work (checkpoint 2026-07-07, end of S200)

Canonical state lives in **specs/visibility-ceiling.md** (ranked map + phase-plan statuses). This file is the resume pointer.

## Done (S200)
- Phase 0 ranked map (committed e2b2c90b5).
- Phase 1 / C1b: dedup-301 chain-resolution hardening — verified build exit 0; **uncommitted**, interleaved with the foreign dedup-301 strand in `src/generate-site.ts`, `src/generators/event-page.ts`, `src/generators/__tests__/dedup-redirects.test.ts`.
- Phase 3 / C3 probe: re-scoped to 01:00-slot idle-hang + S181 eligibility fork.

## Next session, in order
1. **Verify the 08:00 Athens Jul 7 deploy landed** (deploy-cadence.log new entry + Netlify state=ready + `/today` fresh). If it froze again, read the pipeline log for which gate.
2. **Phase 2 / C5:** re-baseline measurement — GA4 AI-referral import (stale since Jun 3), first citation check over `tracked_prompts` into `manual_citation_log`, GSC index counts (OAuth fallback per S138).
3. **Phase 4 / C1a-durable:** pre-build/import-time "publishable venue with null address" signal (mistakes.md 2026-07-05 entry sketches it).
4. **Forensics:** what cleared 3290e524's mark between 09:02Z and 22:47Z Jul 6 (no code path nulls `merged_into`); 01:00-slot idle-hang.

## Blocked on GEO (do not execute)
Ruling recording + 43-loser 301-wave authorization (ships with next deploy); cycle fail-open disposition confirmation; 111 theater per-date duplicates; 263-URL Greek-slug migration (C2, dev-ready); llms.txt canonical event-count claim; theater/festival enrichment prioritization.
