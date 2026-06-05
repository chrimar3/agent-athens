/**
 * Entity-tag filter (S2 taxonomy hygiene)
 *
 * Drops venue, neighborhood, and city names from event tag arrays. Tags should
 * carry genre/mood/audience/descriptor signal — entity names belong in prose,
 * sameAs links, or structured address blocks, not as facet chips.
 *
 * Pure functions. Caller loads JSON config at module init (mirrors
 * src/utils/schema-geo.ts) and passes already-parsed objects in.
 */
import { readFileSync } from "fs";
import { join } from "path";
import { NEIGHBORHOOD_GREEK } from "./neighborhoods";
import { normalizeGreek } from "./normalize-greek";

export interface VenueEntry {
  canonical_name: string;
  variations: string[];
  neighborhood?: string;
}

export interface VenuesConfig {
  venues: VenueEntry[];
  neighborhoods: string[];
  pass_through_venues: string[];
  // S2 taxonomy hygiene: optional sibling map of canonical neighborhood →
  // transliteration variants (Psyri ↔ Psyrri/Psiri, Pangrati ↔ Pagrati, etc.).
  // Schema invariant: every key MUST also exist in `.neighborhoods`.
  // Empty arrays valid (slot reserved for canonical with no current variants).
  neighborhood_aliases?: Record<string, string[]>;
}

export interface CityGeoBlock {
  name: string;
  qid: string;
  lat: number;
  lng: number;
}

export interface CityGeodata {
  municipality: CityGeoBlock & { name_forms?: string[] };
  region: CityGeoBlock;
  country: CityGeoBlock & { code: string; currency: string };
}

export interface ExclusionConfig {
  venues: VenuesConfig;
  cityGeodata: CityGeodata;
}

// `normalizeGreek` does NFD + strip combining marks + lowercase. The combining-
// mark range (U+0300–U+036F) covers Latin diacritics too, so this single helper
// normalizes both scripts. We add hyphen→space collapse, whitespace collapse,
// and trim. Hyphen normalization catches "Neos-Kosmos" ↔ "Neos Kosmos" and any
// future Foo-Bar ↔ Foo Bar transliteration variant via the canonical entry.
function normalize(text: string): string {
  return normalizeGreek(text).replace(/[-\s]+/g, " ").trim();
}

function addNormalized(set: Set<string>, value: string | undefined): void {
  if (!value) return;
  const norm = normalize(value);
  if (norm) set.add(norm);
}

// Compound neighborhoods like "Gazi / Keramikos" expand to: full string + each
// split half + Greek forms of all three (when NEIGHBORHOOD_GREEK has them).
function addNeighborhoodWithCompounds(set: Set<string>, name: string): void {
  addNormalized(set, name);
  const greek = NEIGHBORHOOD_GREEK[name];
  if (greek) addNormalized(set, greek);

  if (name.includes(" / ")) {
    for (const part of name.split(" / ")) {
      const trimmed = part.trim();
      addNormalized(set, trimmed);
      const partGreek = NEIGHBORHOOD_GREEK[trimmed];
      if (partGreek) addNormalized(set, partGreek);
    }
  }
}

export function buildEntityExclusionSet(config: ExclusionConfig): Set<string> {
  const set = new Set<string>();

  for (const venue of config.venues.venues) {
    addNormalized(set, venue.canonical_name);
    for (const variation of venue.variations) {
      addNormalized(set, variation);
    }
  }

  for (const neighborhood of config.venues.neighborhoods) {
    addNeighborhoodWithCompounds(set, neighborhood);
  }

  // S2: explicit transliteration variants from the sibling map. Variants stay
  // variants (taxonomy correct) — they're not promoted to neighborhoods. The
  // canonical key was already added above via `.neighborhoods`; here we add
  // each value-array entry so "Psyrri"/"Psiri" filter even though `.neighborhoods`
  // has the canonical "Psyri" only.
  if (config.venues.neighborhood_aliases) {
    for (const variants of Object.values(config.venues.neighborhood_aliases)) {
      for (const variant of variants) {
        addNormalized(set, variant);
      }
    }
  }

  for (const passThrough of config.venues.pass_through_venues) {
    addNormalized(set, passThrough);
  }

  for (const form of config.cityGeodata.municipality.name_forms ?? []) {
    addNormalized(set, form);
  }

  return set;
}

export function filterEntityTags(
  tags: string[] | null | undefined,
  exclusion: Set<string>,
): string[] {
  if (!tags) return [];
  return tags.filter((tag) => !exclusion.has(normalize(tag)));
}

// Memoized default-config loader. Reads athens-venues.json + city-geodata.json
// once on first call; subsequent calls return the cached set. Test code that
// needs hermetic fixtures should call `buildEntityExclusionSet` directly with
// in-memory fixtures (see src/utils/__tests__/tag-filter.test.ts).
let _cachedDefaultExclusion: Set<string> | null = null;

export function loadDefaultExclusionSet(): Set<string> {
  if (_cachedDefaultExclusion) return _cachedDefaultExclusion;
  const venuesPath = join(import.meta.dir, "../../config/athens-venues.json");
  const cityPath = join(import.meta.dir, "../../config/city-geodata.json");
  const venues: VenuesConfig = JSON.parse(readFileSync(venuesPath, "utf-8"));
  const cityGeodata: CityGeodata = JSON.parse(readFileSync(cityPath, "utf-8"));
  _cachedDefaultExclusion = buildEntityExclusionSet({ venues, cityGeodata });
  return _cachedDefaultExclusion;
}

// Test-only: reset memoization. Useful when fixtures change between tests.
export function _resetDefaultExclusionCache(): void {
  _cachedDefaultExclusion = null;
}
