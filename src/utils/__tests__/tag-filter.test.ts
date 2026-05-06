// Unit tests for entity-tag filter (S2 taxonomy hygiene)
// TDD red phase: written before tag-filter.ts exists. All 18 should fail.

import { describe, test, expect, beforeAll } from "bun:test";
import { buildEntityExclusionSet, filterEntityTags } from "../tag-filter";

// ============================================================================
// Hermetic fixtures — keep tests independent of real config state
// ============================================================================

const ATHENS_VENUES_FIXTURE = {
  venues: [
    {
      canonical_name: "Μέγαρο Μουσικής Αθηνών",
      variations: ["Megaron", "Megaro Mousikis", "Athens Concert Hall"],
      neighborhood: "Ilisia",
    },
    {
      canonical_name: "Onassis Cultural Centre",
      variations: ["Onassis", "Στέγη"],
      neighborhood: "Neos Kosmos",
    },
  ],
  neighborhoods: ["Plaka", "Gazi", "Ampelokipoi", "Exarchia", "Kolonaki"],
  pass_through_venues: ["Πολλαπλοί Χώροι", "Multiple Venues"],
};

const ATHENS_CITY_FIXTURE = {
  municipality: {
    name: "Municipality of Athens",
    name_forms: ["Athens", "Athina", "Αθήνα", "Αθηνά"],
    qid: "Q1524",
    lat: 37.9838,
    lng: 23.7275,
  },
  region: { name: "Attica", qid: "Q170481", lat: 38.0, lng: 23.8 },
  country: { name: "Greece", code: "GR", currency: "EUR", qid: "Q41", lat: 39.0, lng: 22.0 },
};

const THESSALONIKI_VENUES_FIXTURE = {
  venues: [
    {
      canonical_name: "Μέγαρο Μουσικής Θεσσαλονίκης",
      variations: ["Thessaloniki Concert Hall"],
      neighborhood: "Center",
    },
  ],
  neighborhoods: ["Ladadika", "Ano Poli"],
  pass_through_venues: [],
};

const THESSALONIKI_CITY_FIXTURE = {
  municipality: {
    name: "Municipality of Thessaloniki",
    name_forms: ["Thessaloniki", "Salonika"],
    qid: "Q17151",
    lat: 40.6,
    lng: 22.95,
  },
  region: { name: "Central Macedonia", qid: "Q179876", lat: 40.6, lng: 22.95 },
  country: { name: "Greece", code: "GR", currency: "EUR", qid: "Q41", lat: 39.0, lng: 22.0 },
};

// ============================================================================
// buildEntityExclusionSet (Tests 1-6)
// ============================================================================

describe("buildEntityExclusionSet", () => {
  let athensExclusion: Set<string>;

  beforeAll(() => {
    athensExclusion = buildEntityExclusionSet({
      venues: ATHENS_VENUES_FIXTURE,
      cityGeodata: ATHENS_CITY_FIXTURE,
    });
  });

  test("1. excludes venue canonical_name", () => {
    expect(filterEntityTags(["Μέγαρο Μουσικής Αθηνών", "jazz"], athensExclusion)).toEqual(["jazz"]);
    expect(filterEntityTags(["Onassis Cultural Centre", "theater"], athensExclusion)).toEqual(["theater"]);
  });

  test("2. excludes venue variations (variations field, not aliases)", () => {
    expect(filterEntityTags(["Megaron", "jazz"], athensExclusion)).toEqual(["jazz"]);
    expect(filterEntityTags(["Megaro Mousikis", "jazz"], athensExclusion)).toEqual(["jazz"]);
    expect(filterEntityTags(["Athens Concert Hall", "classical"], athensExclusion)).toEqual(["classical"]);
    expect(filterEntityTags(["Στέγη", "theater"], athensExclusion)).toEqual(["theater"]);
  });

  test("3. excludes neighborhoods from venues config", () => {
    expect(filterEntityTags(["Plaka", "jazz"], athensExclusion)).toEqual(["jazz"]);
    expect(filterEntityTags(["Gazi", "rebetiko"], athensExclusion)).toEqual(["rebetiko"]);
    expect(filterEntityTags(["Ampelokipoi", "indie"], athensExclusion)).toEqual(["indie"]);
    expect(filterEntityTags(["Exarchia", "punk"], athensExclusion)).toEqual(["punk"]);
    expect(filterEntityTags(["Kolonaki", "classical"], athensExclusion)).toEqual(["classical"]);
  });

  test("4. excludes pass_through_venues", () => {
    expect(filterEntityTags(["Πολλαπλοί Χώροι", "festival"], athensExclusion)).toEqual(["festival"]);
    expect(filterEntityTags(["Multiple Venues", "festival"], athensExclusion)).toEqual(["festival"]);
  });

  test("5. excludes Greek forms for neighborhoods with NEIGHBORHOOD_GREEK mapping", () => {
    // Plaka → Πλάκα, Gazi → Γκάζι, Ampelokipoi → Αμπελόκηποι (per neighborhoods.ts)
    expect(filterEntityTags(["Πλάκα", "jazz"], athensExclusion)).toEqual(["jazz"]);
    expect(filterEntityTags(["Γκάζι", "rebetiko"], athensExclusion)).toEqual(["rebetiko"]);
    expect(filterEntityTags(["Αμπελόκηποι", "indie"], athensExclusion)).toEqual(["indie"]);
    expect(filterEntityTags(["Εξάρχεια", "punk"], athensExclusion)).toEqual(["punk"]);
    expect(filterEntityTags(["Κολωνάκι", "classical"], athensExclusion)).toEqual(["classical"]);
  });

  test("6. exclusion set values are normalized (lowercase, accent-stripped, trimmed)", () => {
    expect(athensExclusion.size).toBeGreaterThan(0);
    // Lowercased Latin
    expect(athensExclusion.has("megaron")).toBe(true);
    expect(athensExclusion.has("plaka")).toBe(true);
    // Accent-stripped Greek
    expect(athensExclusion.has("πλακα")).toBe(true);
    expect(athensExclusion.has("αμπελοκηποι")).toBe(true);
    // Lowercased + accent-stripped together
    expect(athensExclusion.has("μεγαρο μουσικης αθηνων")).toBe(true);
  });
});

// ============================================================================
// filterEntityTags (Tests 7-18)
// ============================================================================

describe("filterEntityTags", () => {
  let athensExclusion: Set<string>;

  beforeAll(() => {
    athensExclusion = buildEntityExclusionSet({
      venues: ATHENS_VENUES_FIXTURE,
      cityGeodata: ATHENS_CITY_FIXTURE,
    });
  });

  test("7. drops entity-name tag, keeps genres", () => {
    expect(filterEntityTags(["jazz", "Megaron", "rebetiko"], athensExclusion))
      .toEqual(["jazz", "rebetiko"]);
  });

  test("8. case-insensitive comparison, preserves original casing on output", () => {
    expect(filterEntityTags(["JAZZ", "MEGARON"], athensExclusion)).toEqual(["JAZZ"]);
    expect(filterEntityTags(["Jazz", "Megaron"], athensExclusion)).toEqual(["Jazz"]);
    expect(filterEntityTags(["jAzZ", "mEgArOn"], athensExclusion)).toEqual(["jAzZ"]);
  });

  test("9. Greek input: drops Greek entity tag, keeps Greek genre", () => {
    expect(filterEntityTags(["Πλάκα", "ρεμπέτικο"], athensExclusion)).toEqual(["ρεμπέτικο"]);
  });

  test("10. both transliterations of same neighborhood are dropped", () => {
    expect(filterEntityTags(["Plaka", "Πλάκα", "jazz"], athensExclusion)).toEqual(["jazz"]);
    expect(filterEntityTags(["Gazi", "Γκάζι", "techno"], athensExclusion)).toEqual(["techno"]);
  });

  test("11. accent-insensitive within Greek + case variants all dropped", () => {
    expect(filterEntityTags(["plaka", "ΠΛΆΚΑ", "Πλακα", "jazz"], athensExclusion)).toEqual(["jazz"]);
  });

  test("12. compound neighborhoods (Gazi / Keramikos): full + split forms dropped", () => {
    const compoundFixture = {
      ...ATHENS_VENUES_FIXTURE,
      neighborhoods: [...ATHENS_VENUES_FIXTURE.neighborhoods, "Gazi / Keramikos"],
    };
    const compoundExclusion = buildEntityExclusionSet({
      venues: compoundFixture,
      cityGeodata: ATHENS_CITY_FIXTURE,
    });
    expect(filterEntityTags(["Gazi", "Keramikos", "Gazi / Keramikos", "rock"], compoundExclusion))
      .toEqual(["rock"]);
    // Greek halves of compound also dropped: Gazi → Γκάζι, Keramikos → Κεραμεικός
    expect(filterEntityTags(["Γκάζι", "Κεραμεικός", "rock"], compoundExclusion))
      .toEqual(["rock"]);
  });

  test("13. empty input returns empty array", () => {
    expect(filterEntityTags([], athensExclusion)).toEqual([]);
  });

  test("14. null/undefined input returns empty array", () => {
    expect(filterEntityTags(null, athensExclusion)).toEqual([]);
    expect(filterEntityTags(undefined, athensExclusion)).toEqual([]);
  });

  test("15. whitespace-trimmed comparison drops padded entity tag", () => {
    expect(filterEntityTags(["  Plaka  ", "jazz"], athensExclusion)).toEqual(["jazz"]);
    expect(filterEntityTags(["\tMegaron\n", "rebetiko"], athensExclusion)).toEqual(["rebetiko"]);
  });

  test("16. multi-city: Thessaloniki config produces a different exclusion set", () => {
    const thessalonikiExclusion = buildEntityExclusionSet({
      venues: THESSALONIKI_VENUES_FIXTURE,
      cityGeodata: THESSALONIKI_CITY_FIXTURE,
    });
    // Thessaloniki neighborhood IS in Thessaloniki set
    expect(filterEntityTags(["Ladadika", "jazz"], thessalonikiExclusion)).toEqual(["jazz"]);
    expect(filterEntityTags(["Ano Poli", "jazz"], thessalonikiExclusion)).toEqual(["jazz"]);
    // Athens neighborhood is NOT in Thessaloniki set
    expect(filterEntityTags(["Plaka", "jazz"], thessalonikiExclusion)).toEqual(["Plaka", "jazz"]);
    // Conversely: Athens config doesn't drop Ladadika
    expect(filterEntityTags(["Ladadika", "jazz"], athensExclusion)).toEqual(["Ladadika", "jazz"]);
    // Thessaloniki city forms are also excluded
    expect(filterEntityTags(["Thessaloniki", "Salonika", "jazz"], thessalonikiExclusion)).toEqual(["jazz"]);
  });

  test("17. idempotency: filter(filter(x)) === filter(x)", () => {
    const tags = ["Plaka", "jazz", "Megaron", "rebetiko", "Πλάκα"];
    const once = filterEntityTags(tags, athensExclusion);
    const twice = filterEntityTags(once, athensExclusion);
    expect(twice).toEqual(once);
  });

  test("18. city name forms (Athens, Athina, Αθήνα) excluded via city-geodata.name_forms", () => {
    expect(filterEntityTags(["Athens", "Αθήνα", "Athina", "jazz"], athensExclusion))
      .toEqual(["jazz"]);
    // Case-insensitive on city forms too
    expect(filterEntityTags(["athens", "ATHINA", "ΑΘΗΝΑ"], athensExclusion))
      .toEqual([]);
  });

  // ============================================================================
  // Tests 19-21: neighborhood_aliases sibling map (S2 Option 3)
  // ============================================================================

  test("19. buildEntityExclusionSet includes alias variants from neighborhood_aliases", () => {
    const fixtureWithAliases = {
      ...ATHENS_VENUES_FIXTURE,
      // canonical "Plaka" already in .neighborhoods; alias "PlakaAlt" exercises the map
      neighborhood_aliases: {
        Plaka: ["PlakaAlt", "PlakaAlt2"],
      },
    };
    const exclusion = buildEntityExclusionSet({
      venues: fixtureWithAliases,
      cityGeodata: ATHENS_CITY_FIXTURE,
    });
    expect(exclusion.has("plakaalt")).toBe(true);
    expect(exclusion.has("plakaalt2")).toBe(true);
    // Canonical still in set
    expect(exclusion.has("plaka")).toBe(true);
  });

  test("20. filterEntityTags drops alias variant from sibling map (Psyrri → Psiri)", () => {
    const fixtureWithPsiriAlias = {
      ...ATHENS_VENUES_FIXTURE,
      neighborhoods: [...ATHENS_VENUES_FIXTURE.neighborhoods, "Psyrri"],
      neighborhood_aliases: { Psyrri: ["Psiri"] },
    };
    const exclusion = buildEntityExclusionSet({
      venues: fixtureWithPsiriAlias,
      cityGeodata: ATHENS_CITY_FIXTURE,
    });
    expect(filterEntityTags(["Psiri", "rebetiko"], exclusion)).toEqual(["rebetiko"]);
    expect(filterEntityTags(["Psyrri", "rebetiko"], exclusion)).toEqual(["rebetiko"]);
  });

  test("21. filterEntityTags drops alias variant from sibling map (Pangrati → Pagrati)", () => {
    const fixtureWithPagratiAlias = {
      ...ATHENS_VENUES_FIXTURE,
      neighborhoods: [...ATHENS_VENUES_FIXTURE.neighborhoods, "Pangrati"],
      neighborhood_aliases: { Pangrati: ["Pagrati"] },
    };
    const exclusion = buildEntityExclusionSet({
      venues: fixtureWithPagratiAlias,
      cityGeodata: ATHENS_CITY_FIXTURE,
    });
    expect(filterEntityTags(["Pagrati", "jazz"], exclusion)).toEqual(["jazz"]);
    expect(filterEntityTags(["Pangrati", "jazz"], exclusion)).toEqual(["jazz"]);
    // Hyphen normalization sanity: Neos-Kosmos ↔ Neos Kosmos
    const fixtureWithNeosKosmos = {
      ...ATHENS_VENUES_FIXTURE,
      neighborhoods: [...ATHENS_VENUES_FIXTURE.neighborhoods, "Neos Kosmos"],
    };
    const nkExclusion = buildEntityExclusionSet({
      venues: fixtureWithNeosKosmos,
      cityGeodata: ATHENS_CITY_FIXTURE,
    });
    expect(filterEntityTags(["Neos-Kosmos", "techno"], nkExclusion)).toEqual(["techno"]);
    expect(filterEntityTags(["Neos Kosmos", "techno"], nkExclusion)).toEqual(["techno"]);
  });
});
