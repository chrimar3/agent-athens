# Component B Diagnostic — geo + streetAddress gap classification + geocoder spike

**Date:** 2026-05-21
**Session type:** Diagnostic-only (0 source files modified, 1 new spec file)
**Branch:** `main`
**Premise verification:** Yesterday's 25 geo / 4 streetAddress WARNs were re-derived fresh today (still 25/4 — zero drift on headline numbers).

---

## Step 1 — Re-derived gap counts

**Build status:** 3891/3935 pages fully valid (99%) / 25 warnings / 0 errors / 3901 INFO findings.

**Per-finding gap counts:**

```
25/3935 (1%) location.geo coordinates missing       ← WARN
 4/3935 (0%) streetAddress is empty                  ← WARN
 1/3935 (0%) geo coordinates missing (venue page)    ← WARN (NEW: was 0 yesterday)
```

**Per-venue breakdown (`place.byVenue`, pages with any warn):**

| Venue | Total pages | Warn pages |
|---|---:|---:|
| don't be a dick | 13 | 13 |
| crust | 18 | 4 |
| tba - atharea | 4 | 4 |
| cantina social | 24 | 2 |
| πλυφα | 58 | 2 |

Total: 25 warn pages (matches `place.event_template.warn`). Plus 1 warn on `place.venue_template` (newly appeared today — separate finding, scope of this diagnostic does not cover venue-template warns; flagged).

**DB-side cross-check** (`location_status IN (verified_athens, pass_through)` + `venue_lat IS NULL OR venue_lng IS NULL`):

| Venue | Events missing coords | Has address? |
|---|---:|---|
| Don't be a Dick | 11 | yes (`Φειδίου 4, Αθήνα 106 78`) |
| TBA - ATHarea | 4 | **no** |
| Crust | 2 | yes (`Πρωτογένους 13, Αθήνα 105 54`) |
| ΠΛΥΦΑ | 1 | yes (`Korytsas 39, Athens 104 47`) |
| Onassis Stegi | 1 | yes (`Λεωφ. Συγγρού 107-109, Αθήνα 117 45`) |
| Cantina Social | 1 | yes (`Leokoriou 6-8, Athens 105 54`) |

Total: 20 distinct events / 6 distinct venues. The validator's 25-page count > DB's 20-event count because some pages render in both EL and EN locales (Don't be a Dick's 11 DB events → 13 page-warns suggests 2 EN mirrors; Crust 2 events → 4 page-warns = 2 EN mirrors; ΠΛΥΦΑ + Cantina each 1 event → 2 pages = 1 EN mirror each).

---

## Step 2 — Per-venue A/B/C/D classification

**Cross-checked each gap venue against `data/venues-master.json` (294 venues, 100% with lat/lng — canonical coord store) using NFD-normalized lookup.**

| Venue | In `venues-master.json`? | Has lat/lng there? | Bucket |
|---|---|---|---|
| Crust | ✅ yes | ✅ yes | **A — sync gap** |
| ΠΛΥΦΑ | ✅ yes | ✅ yes | **A — sync gap** |
| Onassis Stegi | ✅ yes | ✅ yes | **A — sync gap** |
| Cantina Social | ✅ yes | ✅ yes | **A — sync gap** |
| Don't be a Dick | ❌ no | n/a | **B — needs geocode** |
| TBA - ATHarea | ❌ no | n/a | **D — unfixable** (no address, no web presence — confirmed yesterday) |

### Bucket distribution

| Bucket | Description | Venues | Events | Pages (validator) | Fix mechanism |
|---|---|---:|---:|---:|---|
| **A** | Coords in `venues-master.json`, DB sync gap | **4** | **5** | **~9** | `bun run scripts/backfill-venue-geo.ts` — existing infrastructure, no external lookup |
| **B** | Has address, no coords anywhere | **1** | **11** | **~13** | Geocode known street address (Step 3 spike target) |
| **C** | No address anywhere | 0 | 0 | 0 | — |
| **D** | Unfixable (TBA placeholder, no web presence) | **1** | **4** | **~4** | Accept-as-residual OR reclassify `location_status` |

**Headline:** the cheapest fix (**bucket A — pure DB sync**) covers 4 of 6 venues / 5 of 20 events / ~9 of 25 warn pages. The medium fix (**bucket B — geocode with known address**) covers Don't be a Dick exclusively (11 events / ~13 pages). Together that's 20-22 of 25 warn pages — viable demo-quality residual.

---

## Step 3 — Geocoder spike

### 3a — Default-queue overlap probe

```bash
bun run scripts/geocode-missing-venues.ts --dry-run --limit=5 --confidence=high
```

Output:
```
Venues in master: 294
Venues without geo in DB: 6
Venues not in master (to geocode): 2
  [1/2] ✗ Don't be a Dick (11 events) — no match
  [2/2] ✗ TBA - ATHarea (4 events) — no match
Geocoded: 0 venues (0 events) | Failed: 2 venues (15 events)
```

**Overlap status: FULL OVERLAP.** The script's default queue automatically picks exactly the bucket-B/D venues — it correctly skips bucket-A venues (which it sees in `venues-master.json`). No targeting flag needed.

**Default hit rate: 0/2.** This is the Session-55 pattern signature — but characterizing further before concluding.

### 3b — Target-specific spike (4 probes, direct `geocodeVenue()` invocation)

```typescript
// 3b probe samples (read-only direct API calls, rate-limited via geocode.ts)
[
  { q: "Don't be a Dick" },                         // name-only control
  { q: "Φειδίου 4, Αθήνα 106 78" },                 // address-as-query probe
  { q: "Crust" },                                    // bucket-A control (should hit)
  { q: "Don't be a Dick Exarchia Athens" },         // name + neighborhood hint
]
```

Result table:

| Probe | Hit? | Source | Confidence | Coords | Notes |
|---|---|---|---|---|---|
| `Don't be a Dick` (name only) | ✗ | — | — | — | All 3 Nominatim queries + Google fallback returned null/low. Default script path's failure mode. |
| `Φειδίου 4, Αθήνα 106 78` (address) | ✅ | Nominatim | medium | 37.983033, 23.7317873 | **Street-level match** (`category: highway`, Φειδίου in Εξάρχεια). Inside Athens bbox. matchQuery: `Φειδίου 4, Αθήνα 106 78, Athens, Greece` |
| `Crust` (bucket-A control) | ✅ | Nominatim | high | 37.9780297, 23.7254595 | **POI match** (`category: amenity`, "Crust, 13, Πρωτογένους, Ψυρρή"). Confirms geocoder works for OSM-indexed venues. |
| `Don't be a Dick Exarchia Athens` | ⚠️ | Google | high | 37.9844115, 23.7362955 | Google returned an "establishment" at **Char. Trikoupi 52** — a DIFFERENT address than our confirmed `Φειδίου 4`. **Suspicious match — could be a different business, not our venue.** Don't trust this result. |

### Verdict

**This is NOT a Session-55 recurrence.** S55 was Nominatim 0/65 because OSM had no coverage for cultural venues — a data-source coverage gap. Today's 0/2 from the default path is a **query-strategy gap**: `geocodeVenue(venueName)` only takes a name, never tries the known street address available in the DB. The geocoder itself is healthy (Crust hits cleanly; Φειδίου 4 resolves street-level).

**Bucket-B is geocodable** — just not via the default script path. The fix-session method needs a small enhancement to `geocodeVenue()` or `geocode-missing-venues.ts` to fall back to address-based queries when name fails.

### Fix-shape options (for next session — do not implement here)

1. **Extend `geocodeVenue()` signature** to `geocodeVenue(venueName, addressHint?, config)`. When name queries exhaust, try `${addressHint}` and `${venueName} ${addressHint}` as additional Nominatim queries before Google fallback. Smallest change to the geocoder; backward-compatible.
2. **Augment `geocode-missing-venues.ts`** to fetch DB `venue_address` per venue and pass as address hint to the extended `geocodeVenue()`. The script already queries the DB for venues — adding `venue_address` to the SELECT is trivial.
3. **Accept Φειδίου 4's medium-confidence street-level result** as the manual coord for Don't be a Dick. Slightly less accurate than a true POI match (anywhere on the Φειδίου street, not specifically the bar) but inside the right block and Athens-bbox-valid. One-row UPDATE.

**Recommended:** option 1+2 (extend geocoder, run on Don't be a Dick), with option 3 as a fallback if the extended geocoder still fails for some reason. Option 3 alone is brittle — locks in a coordinate that's "close enough" without a re-checkable provenance.

**Spike threshold check:** 1 of 1 bucket-B venues resolves via address-based query → 100% hit rate **on the actual bucket-B residual**. Sample size of 1 is statistically limited, but bucket B IS only 1 venue — the threshold concept doesn't apply at this scale. The geocoder works for the one venue that needs it.

---

## Step 4 — streetAddress gap sanity-check

```sql
SELECT venue_name, COUNT(*) FROM events
WHERE location_status IN ('verified_athens','pass_through')
  AND (venue_address IS NULL OR venue_address='')
GROUP BY venue_name;
```

Result:
```
TBA - ATHarea | 4
```

**Identical to yesterday's residual.** No new web-fetchable venues entered the gap (no Crust/Don't-be-a-Dick-style additions). TBA-ATHarea remains the same unfixable cluster — 4 events, no address, no web presence (yesterday's WebSearch returned only Athens-GA results), name itself suggests scraper placeholder ("TBA" = to-be-announced).

---

## Recommendation for the fix session

**Two-pronged, smallest-viable:**

### Prong 1 — Sync (bucket A, ~9 warn pages)

```bash
bun run scripts/backfill-venue-geo.ts --dry-run --report   # preview
bun run scripts/backfill-venue-geo.ts                       # apply
bun run build                                                # verify
```

Expected delta: 25 geo warns → ~16 geo warns. Existing infrastructure, zero new code.

### Prong 2 — Address-based geocode (bucket B, ~13 warn pages)

Either:
- (a) Extend `geocodeVenue()` to accept an address hint; update `geocode-missing-venues.ts` to pass DB `venue_address`. Run on Don't be a Dick. Expected: street-level coord (confidence=medium), 13 warn pages → 0.
- (b) Manual coord UPDATE for Don't be a Dick using the street-level coordinates verified in Step 3b (37.983033, 23.7317873). One SQL row, but defer to (a) unless geocoder extension is non-trivial.

Expected combined delta: 25 geo warns → **~4 geo warns** (matches the TBA-ATHarea cluster which also lacks geo).

### Prong 3 — TBA-ATHarea residual (bucket D)

Out of scope for geo backfill. Routing options for a future session:
- Reclassify `TBA - ATHarea` events to `location_status='problematic'` (matches the "placeholder venue" semantics)
- Or, accept-as-residual and adjust the validator's geo WARN to allow a registered "TBA placeholder" exemption (more invasive)

---

## Done-when checklist

- [x] (1) Re-derived counts: 25 geo / 4 streetAddress / 1 venue-template (NEW — flagged, out of scope)
- [x] (2) A/B/C/D classification with explicit per-venue venues-master.json check: A=4 venues/5 events, B=1 venue/11 events, C=0, D=1 venue/4 events
- [x] (3) Geocoder spike completed with overlap-confirmed sample (default script's queue = bucket B+D); verdict: PROCEED with extended geocoder OR manual coord (not S55-recurrence; query-strategy gap, not source-coverage gap)
- [x] (4) streetAddress gap re-confirmed as same TBA-ATHarea unfixable cluster

## Files NOT modified this session

- All `src/`, `config/`, `scripts/` source — diagnostic only
- `data/events.db` — SELECT only
- `data/venues-master.json` — read only (verified bucket-A coords exist)
- Pre-existing dirty files from prior sessions (WE Πολυχώρος, parallel S143/S151 work) — untouched

## Files created this session

- `specs/component-b-diagnostic.md` (this file) — 1 file

## Flagged but out-of-scope

- `place.venue_template` shows 1 warn today (was 0 yesterday). Different surface (venue page, not event page). Not in Component B scope; flag for routing.
- The geocoder's Google fallback returned a suspicious "establishment" match for "Don't be a Dick Exarchia Athens" at Char. Trikoupi 52 (≠ our confirmed Φειδίου 4). Worth noting as a Google-fallback false-positive class — Google may be matching by name to a DIFFERENT business. Mitigation in the fix-session prong 2 is to prefer address-driven Nominatim hits over name-driven Google hits when both available.
