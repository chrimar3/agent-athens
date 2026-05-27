# Geo Finder (Wikidata QID → P625) — S116 Diagnostic

**Filed:** 2026-05-27 (Session 161)
**Status:** STOP — premise refuted. No code, no data, no deploy. Read-only diagnostic only.
**Brief:** "Verify QID coverage, spike QID→coordinate resolution, backfill `location.geo` for QID-having venues."
**Verdict:** The finder is not viable — and would have *negative* value. Two independent refutations below.

---

## 1. Gate 0b — QID coverage trips the STOP floor

- `config/athens-venues.json` shape: `{ version, last_updated, notes, venues: [...] }` — **346 venue records**.
- Venues whose `sameAs` contains a `wikidata.org/wiki/Q…` URL: **10 / 346 (2.9%)**.
  ```
  jq '[.venues[] | select(.sameAs|type=="array" and any(.;startswith("https://www.wikidata.org/wiki/Q")))] | length'  → 10
  ```
- Brief's gate: *"if near-zero (say <10), STOP … if meaningful (dozens+) proceed."* 10 sits **at the floor**, far below "dozens+". Gate trips → do not proceed to the spike.

## 2. Deeper refutation — the geo gap does not exist

`location.geo` is **already fully covered** by a richer source that predates this session:

- **`data/venues-master.json` = 296 venues, 296/296 with non-null `lat`/`lng` (100%).** This — not `athens-venues.json` (which has no coordinate fields) — is the coordinate source.
- The emitter already reads it: `src/utils/normalize.ts:9-22` loads master coords into `VENUE_COORDINATES`; `normalizeVenue()` (`:111-123`) attaches `coordinates`; emitted as `GeoCoordinates` at `src/generators/event-page.ts:209-216` (event JSON-LD, reused by `datafeed.ts`) and `src/generators/venue-page.ts:164-176` (venue JSON-LD, with a generic-Athens-center filter).
- `data/build-completeness.json`: **`fieldValidation.location.coverage = "full"`** (severity `fail` = hard-required, and it is met).
- All 5 spike QIDs already have curated master coords:
  | QID | Venue | Master coords |
  |-----|-------|---------------|
  | Q582203 | Megaron | 37.975, 23.757 |
  | Q43064509 | Onassis Stegi | 37.954, 23.7404 |
  | Q17511186 | SNFCC | 37.9395, 23.689 |
  | Q582625 | National Opera (Lyriki) | 37.9398, 23.692 |
  | Q816669 | Benaki | present (non-matched key) |

**The finder would resolve coordinates for venues that already have curated coordinates — closing zero geo, and risking a Tier-1 validator FAIL by overwriting a correct curated value with a divergent Wikidata P625 ("wrong is worse than absent").**

The brief's fallback ("pivot to OSM") is **also** unwarranted: OSM/Nominatim is another coordinate finder for an already-full field.

## 3. Validator law (confirmed, for the record)

- Missing/null `location.geo` = **WARNING** (`src/utils/schema-validator.ts` RECOMMENDED_FIELDS; `src/validators/schema-completeness.ts` warns).
- If geo is *present*, coordinates must be numbers or it's an **ERROR** (`src/enrichment/quality-gates.ts:350-359`). Empty-string/fake coord = penalty. Absent = fine.

## 4. Brief-vs-reality mismatches (path-verification ledger)

1. Step 0a's `jq '.event_level, .place_level'` returns **`null`** — those keys don't exist in the current `build-completeness.json`. Real coverage lives under `.fieldValidation`. The brief's jq is a stale premise (see `patterns.md` 2026-05-27 — jq-path-as-premise).
2. "Geo is an addressable gap" — inverted; closed by `venues-master.json` before the session. (This is the *second* time a geo brief assumed `athens-venues.json` is the geo source; S135 caught the same wrong assumption — see `specs/s135-geo-coverage-spec.md §1`.)

## 5. Routing

- Geo: **closed.** No finder. No OSM session.
- Next finder candidate: **`image`** (see `specs/geo-finder-residual-S116.md` and `specs/enddate-gap-S116.md §4`).
