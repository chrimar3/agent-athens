# S135 Geo + streetAddress Coverage Spec

**Filed:** 2026-05-11
**Status:** Spec only — no code or data changes in S135. Backfill deferred per gap classification.
**Inputs:** `specs/s135-step-0-verifications.md` (full diagnostic), `specs/s133-schema-warnings-inventory.md` (baseline).
**Successor session(s):** see Routing below.

---

## 1. Architectural reality

The S133 inventory captured 40 events missing `location.geo` coordinates and 23 events missing `streetAddress` in emitted JSON-LD. **The pre-plan brief assumed these would be fixed by editing `config/athens-venues.json`. That assumption is wrong.** The reality:

- **Geo + address live at the event level**, on the `events` table:
  - `venue_lat REAL`
  - `venue_lng REAL`
  - `venue_address TEXT`
  (Confirmed via `.schema events` against `data/events.db`, 2026-05-11.)
- **Populated by enrichment.** The enrichment-engine path that should populate these fields includes a web-search step at `src/enrichment/venue-context.ts:95-103` which is currently a **TODO with a generic fallback** — no real web-search implementation yet.
- **`config/athens-venues.json` is a location whitelist**, not a geo data source. Top-level shape: `{ version, last_updated, notes, venues: [] }`. Each venue entry has `canonical_name`, `variations[]`, `neighborhood`, optional `website`/`ticketing`/`sameAs`. **No lat/lng/address fields** at the venue level.
- **`venue_context` table has no lat/lng/address columns.** Schema (from migration 003): `venue_name, neighborhood, description, venue_type, capacity, established_year, last_updated, source, getting_there, what_to_expect, good_to_know, enrichment_status, enriched_at, image_path`. Seeded by `seedKnownVenues()` at `src/enrichment/venue-context.ts:192-279` for 8 known venues — but seeding `venue_context` does not populate event-level `venue_lat / venue_lng / venue_address`.

**Implication:** any backfill must target `events` rows directly (or fix the populator). No amount of editing `athens-venues.json` will close these warnings.

---

## 2. Gap classification

**Method:** SQL against `events` table with Tier-1 exhibition-aware date filter:

```sql
COALESCE(CASE WHEN type='exhibition' THEN end_date ELSE NULL END, start_date) >= date('now')
```

**Counts:**

| Slice | Count | Source |
|---|---|---|
| All events missing `venue_lat` (data-completeness view) | 84 | DB query |
| All events missing `venue_address` | 70 | DB query |
| Pageable + indexable events missing `location.geo` (SEO-relevant) | 40 | Build summary |
| Pageable + indexable events missing `streetAddress` | 23 | Build summary |

The build numbers are a subset of the DB numbers — the build filters to pageable + indexable events; the SQL filter is broader. **Both are real:** the 40 / 23 is what Google sees and what the inventory warning is about; the 84 / 70 is the underlying data-completeness problem. Closing the SEO warnings requires fixing the events that actually emit JSON-LD, which is a subset of the broader data gap.

### Top venues (geo gap, DB view)

```
Μέγαρο Μουσικής Αθηνών                     14
TBA                                         4   ← cannot be fixed (unknown venue)
Θέατρο Βράχων Μελίνα Μερκούρη               4
Κολλίνες Αρκαδίας                           4
Ace Hotel & Swim Club Athens                3
Bolivar                                     3
Βεάκειο Θέατρο, Πειραιάς                    3
Κατράκειο Θέατρο                            3
Half Note Jazz Club                         2
Petra Theater                               2
Plex                                        2
VRACHON THEATRE - MELINA MERKOURI           2   ← duplicate of "Θέατρο Βράχων Μελίνα Μερκούρη"
Θέατρο Γης                                  2
Θέατρο Δόρας Στράτου                        2
Μονή Λαζαριστών                             2
[≈24+ venues with 1 event each]
```

**Distribution shape:**

- Top 5 venues: 29 / 84 events = 35%
- Megaron Mousikis alone: 14 / 84 = 17%
- Long tail of 24+ single-event venues
- 1 unfixable venue (`TBA`, 4 events)
- 1 venue-name duplicate (Greek + Latin transliteration of Theatro Vrachon)

### Classification: **MIXED**

Specifically: **head-heavy mixed with an enrichment-coverage bug underneath.**

- Concentrated head (top ~10 venues): tractable by SQL UPDATE on `events` rows
- Long tail: only closeable systematically by fixing the enrichment populator
- Coverage bug (see §4 below): even seeded known venues have unpopulated event rows

---

## 3. streetAddress cross-check

**streetAddress gaps are a strict subset of geo gaps** at the field level:

| Subset | Count |
|---|---|
| Missing geo AND address | 70 |
| Missing geo ONLY (has address) | 14 |
| Missing address ONLY (has coords) | 0 |

**Implication for fix sequencing:** any event missing address is also missing coords. Fixing the 70-event overlap closes both warnings in one pass. Only 14 events (largely Megaron Mousikis, which has its address but not coords) need geo-only backfill.

This consolidates the two warning categories into one fix path for 70 / 84 = 83% of the affected events.

---

## 4. Megaron Mousikis — enrichment coverage bug

Three event rows for the same venue show divergent population:

```
venue_name              venue_address                         venue_lat  venue_lng
Μέγαρο Μουσικής Αθηνών  Vassilissis Sofias Ave & Kokkali...   37.975     23.757
Μέγαρο Μουσικής Αθηνών  Βασιλίσσης Σοφίας & Κόκκαλη           37.975     23.757
Μέγαρο Μουσικής Αθηνών  Βασιλίσσης Σοφίας & Κόκκαλη           NULL       NULL
```

Megaron is in `seedKnownVenues()` and has populated rows. **Some events for the same venue fall through without geo population.** This is not a data-availability problem (the data exists in other rows for the same venue) — it's a populator-coverage problem.

**Hypothesis worth testing in the diagnostic session below:** the enrichment path likely populates `venue_lat / venue_lng` from an external source (Google Places or hard-coded venue table), but skips rows when something in that path errors silently or the event was created via a path that bypasses enrichment.

Resolving this would close most of the head-concentration gap (Megaron's 14 events plus likely similar patterns at other top venues).

---

## 5. Tier 1 reminder (for whoever picks this up)

Two non-negotiables for the backfill session(s):

1. **SQL UPDATE on existing rows is fine.** Direct `UPDATE events SET venue_lat = ?, venue_lng = ?, venue_address = ? WHERE id = ?` is acceptable for backfill of historical rows that won't re-enrich.

2. **Any new-row path MUST go through `upsertEvent()` — never direct INSERT.** The upsert function applies invariants (normalization, dedup-protection flags, timestamps, schema validity). Bypassing it bypasses those invariants and produces the exact class of bug S132 spent multiple sessions tracking down.

If the backfill involves modifying enrichment (rather than one-shot SQL fix), all writes flow through the existing enrichment write path which already routes through `upsertEvent()`.

---

## Routing recommendation

Three sequential successor sessions, in priority order:

### (A) Diagnostic — Megaron coverage bug (1 session, ~half-batch)

**Trigger:** before either backfill effort. Cheapest path to closing 17%+ of the gap.

**Question to answer:** why do some events for seeded venues fall through `venue_lat / venue_lng` population? Two hypotheses to test:

- The populator path errors silently for specific event sources
- The events were created via a non-enrichment path (legacy import, manual upsert) that bypasses the populator

**Exit criterion:** a fix that re-populates the existing Megaron-pattern rows AND prevents future rows from falling through. If the fix is small and localized, fold the backfill into this session.

### (B) Small backfill — top venues (1 session, maintenance batch)

**Trigger:** after (A), if the coverage bug doesn't auto-fix the head.

**Scope:** SQL UPDATE on `events` rows for the top concrete venues (excluding TBA, excluding duplicates pending separate dedup).

**Approach:**

1. Build a venue → (lat, lng, address) map for the top ~10 venues. Coords from Google Maps lookup (~30 sec per venue). Verify against each venue's official website or established directory listing — no fabrication, no estimates.
2. UPDATE existing event rows for those venues.
3. Verify build output: 40 / 23 warnings drop by the expected delta.

**Files:**

- `data/events.db` (writes via SQL)
- Document the venue → coord map somewhere reusable so this session is replayable (e.g. `scripts/backfill-top-venue-coords.ts`)

**Tier 1 boundary:** if any of the top venues is ambiguous (multiple physical locations, recent move), skip it rather than fabricate. Citation poison > coverage.

### (C) Enrichment Writer — venue-context.ts:95-103 web-search TODO (multi-session, major stream)

**Trigger:** after (A) and (B), or when long-tail coverage becomes the priority. Routes to the Enrichment Writer project.

**Scope:** implement the web-search path so future events from unknown venues get coords populated automatically. Out of maintenance-batch scope; needs its own scoping session.

**Non-goal:** does not backfill the existing 84 / 70 events. (B) handles the head; the long-tail residual either waits for the populator to re-run or is accepted as background noise.

### Out-of-scope flags surfaced for future sessions

- `TBA` venue (4 events with unknown location) — should these emit JSON-LD at all? Suppress at emission time, or hold from indexing.
- Venue-name deduplication: `Θέατρο Βράχων Μελίνα Μερκούρη` vs `VRACHON THEATRE - MELINA MERKOURI`. Affects multiple gap counts; needs its own session.

---

## What this spec does NOT cover

- Picking which of (A) / (B) / (C) runs first — that's the next scoping call when this spec is picked up.
- The implementation details of the populator fix — depends on what (A) finds.
- Schema-emission code changes — the emitter is fine; the bug is upstream data supply.
- Any change to `config/athens-venues.json` — explicitly not the right surface.
