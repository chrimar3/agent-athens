# Save-Drop Flood → Build-Halt Checkpoint — 2026-05-27

**Status:** ⚠️ Build currently halts. The P0 save-drop fix is correct and committed; this documents a **downstream data/config batch** the fix *revealed* (did not create). Triage required before the next deploy.

## What happened
The save-drop fix (genres `normalizeGenres` at the write boundary) made the daily scrape persist **528/532** events (was 129/538). A supervised real scrape added **+382 rows** (12694 → 13076). Running `bun run build` on the enlarged set then **halted**:

```
Build halted: 24 event-detail page(s) missing required location.
   (src/generate-site.ts:1278 — missing location.address.streetAddress)
```

## Root cause (a latent gap the save-drop was masking)
The 24 halting pages trace to exactly **3 venues** whose scrapers mark events `verified_athens` (so they're displayed) but do **not** populate `venue_address`, and which lack a `streetAddress` backfill:

| venue_name | source | new events | location_status |
|---|---|---|---|
| ΚΠΙΣΝ | snfcc | 24 | verified_athens |
| Μέγαρο Μουσικής Αθηνών | megaron.gr | 7 | verified_athens |
| Onassis Stegi | onassis | 1 | verified_athens |

(The other 351 newly-persisted rows are `location_status='unverified'` → hidden, not built, do **not** trip the halt.)

These events were **among the ~405 previously silent-dropped** at save time. Because they never persisted, their venues were never exercised by the build, so the missing-address gap stayed invisible. The fix persists them → the gap surfaces. **This is a revealed latent issue, not a regression in the fix.** (Precedent: S137/S138, ~126 URLs missing `location`.)

## ⏰ Urgency
Tomorrow's **08:00 Athens auto-pipeline** (`com.agentathens.daily`, full mode) will run the same scrape + build and **hit this same halt unsupervised** → the build won't complete → **no new deploy**. The currently-live site stays up (functional but stale); newest events won't appear until this is resolved.

## Triage options for the follow-up session (NOT done here — out of fix boundary)
1. **Recommended — backfill the 3 venues in `config/athens-venues.json`** with their (well-known) street addresses, so events resolve `location.address.streetAddress`:
   - ΚΠΙΣΝ / SNFCC — Λεωφ. Ανδρέα Συγγρού 364, Καλλιθέα 176 74
   - Μέγαρο Μουσικής Αθηνών — Βασ. Σοφίας & Κόκκαλη, 115 21
   - Onassis Stegi (Στέγη) — Λεωφ. Συγγρού 107–109, 117 45
   (Verify exact canonical forms against the venue-config schema before writing.)
2. Alternatively, fix the snfcc/megaron/onassis scraper adapters to populate `venue_address` for these fixed venues.
3. Or relax which events are `verified_athens` for these venues until addresses exist (less desirable — hides real events).

After option 1 or 2, re-run `bun run build` to confirm the halt clears, then deploy.

## What is NOT affected
- The save-drop **fix itself is correct, tested, and committed** (genres normalization + un-silenced catch + observability). `normalizeGenres` guarantees the genres CHECK; all 13,076 rows have valid genres.
- The commit is **code-only** (scripts/scrape-all.ts, src/db/database.ts, tests). It does not touch the DB or config; the halt is a data/config condition in the prod DB, independent of the commit.

## Evidence
- Scrape summary: `✅ Found 532 → Saved 528 (0 failed, 4 out-of-scope)` (`logs/save-drop-verify.log`).
- Build halt: `logs/save-drop-build.log` (`Build halted: 24 event-detail page(s) missing required location`).
