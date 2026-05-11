# S135 Step 0 + Step 1 Verifications

**Session:** S135
**Date:** 2026-05-11
**Build log:** `/tmp/s135-build-warnings.log`

## Step 0 — Inventory drift check

Compared against `specs/s133-schema-warnings-inventory.md` baseline (40 / 23 / 2 / 2).

Source: `grep -E 'geo coordinates|streetAddress|CollectionPage: itemListElement|FAQPage' /tmp/s135-build-warnings.log`

Verbatim build output:

```
40/6351 (1%) location.geo coordinates missing
23/6351 (0%) streetAddress is empty
 2/6351 (0%) CollectionPage: itemListElement is empty
 2/6351 (0%) FAQPage JSON-LD block missing
```

| Category | S133 baseline | S135 current | Drift |
|---|---|---|---|
| Missing geo coordinates | 40 | 40 | 0% |
| Empty streetAddress | 23 | 23 | 0% |
| CollectionPage.itemListElement empty | 2 | 2 | 0% |
| FAQPage JSON-LD missing | 2 | 2 | 0% |

**Verdict:** Zero drift. Inventory holds. Proceed.

**Note on grep pattern:** initial grep `'itemListElement empty'` returned 0 because the build message reads "CollectionPage: itemListElement is empty" (preposition order). Pattern corrected. Recording this so the next-session grep doesn't repeat the false-zero.

---

## Step 1 — Gap diagnostic against `events` table

### Schema confirmation

`.schema events` confirmed actual column names. **Plan-text divergences:**

- `venue_street_address` does not exist → actual column is `venue_address`
- `venue` does not exist as a column → grouping is by `venue_name`
- `venue_lat` / `venue_lng` exist as `REAL` ✓

This was caught by the "If something fails — Step 1 query errors" branch in the plan. Columns confirmed before querying; no invented names used.

### Date filter

Used the canonical Tier-1 exhibition-aware filter:

```sql
COALESCE(CASE WHEN type='exhibition' THEN end_date ELSE NULL END, start_date) >= date('now')
```

### Raw results

**Geo gap (events missing `venue_lat`):** **84 total**

Top venues:

```
venue_name                                    gap_count
--------------------------------------------  ---------
Μέγαρο Μουσικής Αθηνών                        14
TBA                                           4
Θέατρο Βράχων Μελίνα Μερκούρη                 4
Κολλίνες Αρκαδίας                             4
Ace Hotel & Swim Club Athens                  3
Bolivar                                       3
Βεάκειο Θέατρο, Πειραιάς                      3
Κατράκειο Θέατρο                              3
Half Note Jazz Club                           2
Petra Theater                                 2
Plex                                          2
VRACHON THEATRE - MELINA MERKOURI             2
Θέατρο Γης                                    2
Θέατρο Δόρας Στράτου                          2
Μονή Λαζαριστών                               2
[then 24+ venues with 1 event each]
```

**streetAddress gap (events missing `venue_address`):** **70 total**

Top venues are the same set, minus Megaron Mousikis (which has address but no coords).

### Counts vs build summary

DB query returns 84 / 70 but build output shows 40 / 23. The build filters to **pageable + indexable** subset; my SQL covers all events meeting the date filter (includes hidden / quality-gated / non-pageable). The 40 / 23 is the SEO-relevant slice; the 84 / 70 is the data-completeness slice. **Spec needs to call this out** — the gap "shape" is the same but the absolute number depends on which filter you apply.

### Overlap analysis

| Subset | Count |
|---|---|
| Missing geo AND missing address | 70 |
| Missing geo ONLY (has address) | 14 |
| Missing address ONLY (has coords) | 0 |
| Total missing geo | 84 |
| Total missing address | 70 |

**streetAddress is a strict subset of geo at the field level.** Any event missing address is also missing coords. Fixing the 70-event overlap covers both warnings in one pass; the residual 14 events (mostly Megaron) need geo-only backfill.

### Megaron Mousikis pattern (notable)

```
venue_name              venue_address                         venue_lat  venue_lng
----------------------  ------------------------------------  ---------  ---------
Μέγαρο Μουσικής Αθηνών  Vassilissis Sofias Ave & Kokkali...   37.975     23.757    [populated]
Μέγαρο Μουσικής Αθηνών  Βασιλίσσης Σοφίας & Κόκκαλη           37.975     23.757    [populated]
Μέγαρο Μουσικής Αθηνών  Βασιλίσσης Σοφίας & Κόκκαλη           NULL       NULL      [coords missing]
```

Same venue, same address text, **but some event rows have coords and others don't**. This is not a "venue data missing" problem — it's an **enrichment coverage bug**: some events fall through the populator path even when the data is knowable.

Megaron is in `seedKnownVenues()` at `src/enrichment/venue-context.ts:192-279`, which only seeds `venue_context` (no geo columns there anyway). The actual lat/lng populator for events is a separate (and apparently flaky) path.

### Venue-deduplication signal (out of S135 scope)

`Θέατρο Βράχων Μελίνα Μερκούρη` (4 events) and `VRACHON THEATRE - MELINA MERKOURI` (2 events) are the same physical venue under different name normalizations. Surface to a future venue-deduplication session; do not attempt in this maintenance batch.

### Unfixable subset

`TBA` venue (4 events) is "to be announced" — these events legitimately have unknown venues. Cannot be coord-backfilled. Should be either excluded from the warning count or held from emission until resolved. Flag to spec.

---

## Classification verdict

**MIXED**, leaning toward "head-heavy mixed":

- **Concentrated head:** top 5 venues = 29 / 84 events (35%). Megaron alone is 14 / 84 (17%). Tractable by SQL UPDATE on known venues.
- **Long tail:** ~24+ venues with 1 event each. Only the enrichment TODO at `src/enrichment/venue-context.ts:95-103` resolves this systematically.
- **Enrichment coverage bug:** same venue has populated AND unpopulated rows — not a data-availability gap. Needs investigation of why the populator skipped rows even for seeded venues.

Routing per plan Step 2:

- Head → small backfill session (SQL UPDATE on Megaron + top venues; manual coords)
- Long tail → Enrichment Writer session (implement `venue-context.ts:95-103`)
- Enrichment coverage bug → diagnostic session before either, to understand why seeded venues miss

---

## Step 3 — Hard-stop summary triage

**Outcome: no code change needed. Function already emits the S133 Insight 2 content goal.**

### Triage observation

`bun run build` emits a verbose `=== Hard-stop firing (S110f) ===` section to stdout containing:

- Total events processed last 24h (`27`)
- Hard-stopped events lifetime count + ratio (`39 (144.4% of last-24h)`)
- **By concern_type breakdown** with percentages and threshold warnings
- Soft flags by concern_type (tier B)
- Per-source breakdown
- Validator config drift / kill switch / overrides
- Threshold-exceeded warnings (`⚠ HARDSTOP_FIRING_RATE_EXCEEDED` for 4 concern types)

### Source confirmation

Read `src/validators/completeness-reporter.ts:343-459`. The function `printHardStopSummary()` at line 351 IS what produces this output. The S110f header at line 356 (`console.log('\n=== Hard-stop firing (S110f) ===');`) matches the build output verbatim.

The function:

1. Loads gate rules (line 353) and overrides (line 354)
2. Checks `event_concerns` table presence (line 358-364) — table IS present, no short-circuit
3. Queries A0 and B tier concern types from YAML rules
4. Counts last-24h events processed
5. Groups concerns by type, computes hard-stopped events excluding overrides
6. Prints total + by-concern-type + by-source + drift + kill-switch + threshold warnings

### Plan triage branches — none apply

- **3a (migration-011 guard short-circuits):** does not fire. `event_concerns` table exists and has rows.
- **3b (function returns zero rows):** does not fire. Function returns 39 hard-stopped events with full breakdown.
- **3c (print path broken):** does not fire. Output emits cleanly with all required fields.

### Why the original premise was wrong

The pre-plan brief described Step 3 as "ship hard-stop summary." Earlier exploration noted the function "outputs nothing if table missing or rules disabled" — true as a *worst-case behavior under degraded inputs* but not the *actual current runtime state*. Reading the function's guard logic without running the function led to a stale-by-design assumption.

This reinforces the repro-grep-the-fix-surface pattern (which is being banked in `.claude/notes/patterns.md` in Step 6): **run the suspected-broken function before assuming it's broken.** Exploration reports describe code paths; only execution reveals state.

### Real concern_type names (for future reference)

The plan's illustrative names were close but inexact. Actual values observed:

- `entity-resolution-uncertain` (was `entity-resolution-uncertain` ✓)
- `venue-mismatch-or-unknown` (plan said `venue-mismatch`)
- `date-conflict-or-unparseable` (plan said `date-conflict`)
- `neighborhood-mismatch` (not in plan's illustrative list)
- `ticket-merchant-unverified` (was `ticket-merchant-unverified` ✓)

### S135 scope adjustment

- **Dropped:** `src/validators/completeness-reporter.ts` from staged paths (no edits).
- **Code-file count:** 1 → **0**. S135 is now a pure documentation session: 4 specs + 2 institutional appends = 6 files.
- **Commit message:** updated to reflect Step 3 = no-op (already shipped by S110f).
- **Closure criterion satisfied:** the S133 Insight 2 content goal (excluded count + concern-type breakdown) is in the build output.

### Threshold-exceeded warnings observed (not S135's responsibility)

Build emits four `HARDSTOP_FIRING_RATE_EXCEEDED` warnings at the end of the S110f block:

- `entity-resolution-uncertain: 22.2%`
- `venue-mismatch-or-unknown: 51.9%`
- `date-conflict-or-unparseable: 59.3%`
- `ticket-merchant-unverified: 22.2%`

The warnings point to `decisions.md S110f` for context — rules likely over-tuned. **Not in scope for S135.** Surface to whoever owns gate-rule calibration.
