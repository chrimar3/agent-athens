# Geo Finder Residual — S116

**Filed:** 2026-05-27 (Session 161)
**Purpose (Guard 5):** Account for venues the geo finder would *not* cover, so nothing is silently dropped.

---

## Residual for geo = EMPTY

The brief expected a residual of "venues without a QID" to hand to an OSM/Nominatim session. There is none to hand off, because **geo is already fully covered** for the addressable set via `data/venues-master.json` (296/296 venues with coordinates; `fieldValidation.location.coverage = "full"`). See `specs/geo-finder-S116.md`.

- The 336 venues without a QID are **not** a geo residual — their coordinates already exist in `venues-master.json`.
- An OSM/Nominatim finder is therefore **not** the correct next step. It would target an already-full field with a lower-reliability source.

## Redirect — the real "next finder"

Diagnosis re-pointed at the genuinely open gap (see `specs/enddate-gap-S116.md §4`):

- **`image`** — pageable coverage **64.2% (191 of 534 missing)**, concentrated in **concerts (174 missing, 30.4% covered)**. Genuinely open *and* citation-driving.
- Secondary: **venue `sameAs` emission** — `place.ratchet.venueSameAs.populated = 5` suggests only 5 venues emit `sameAs` in JSON-LD despite 10 having QIDs in config. Distinct from geo; worth its own diagnostic.

**Before the `image` finder is built:** the image *source/fallback policy* is a routed decision (GEO Strategist: what image source are we allowed to use / republish; Design Navigator: treatment when no image exists), not an executor call. The capture-layer spike (can the scraper grab the `og:image` it currently discards?) is the executor's; the policy ruling gates it.
