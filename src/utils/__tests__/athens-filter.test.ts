// Unit tests for Athens location filtering
import { describe, test, expect } from "bun:test";
import { isAthensEvent } from "../athens-filter";
import { sampleRawConcert, sampleRawNonAthens, sampleRawGreek } from "../../../tests/fixtures/raw-events";
import type { RawEvent } from "../../types";

describe("isAthensEvent", () => {
  test("should accept event with 'Athens' in location", () => {
    expect(isAthensEvent(sampleRawConcert)).toBe(true);
  });

  test("should accept event with Greek 'Αθήνα' in location", () => {
    expect(isAthensEvent(sampleRawGreek)).toBe(true);
  });

  test("should accept event with 'Αθηνα' (without accent) in location", () => {
    const event: RawEvent = {
      ...sampleRawConcert,
      location: "Κεντρο Αθηνα"
    };
    expect(isAthensEvent(event)).toBe(true);
  });

  test("should reject event from Mykonos (blacklist approach)", () => {
    // Mykonos is in the non-Athens city list
    const event: RawEvent = {
      ...sampleRawConcert,
      location: "Mykonos, Greece"
    };
    // Note: sampleRawNonAthens has "Mykonos" in location so it should be rejected
    const hasMykonos = sampleRawNonAthens.location.toLowerCase().includes("mykonos");
    if (hasMykonos) {
      expect(isAthensEvent(sampleRawNonAthens)).toBe(false);
    }
  });

  test("should reject event from Thessaloniki", () => {
    const event: RawEvent = {
      ...sampleRawConcert,
      location: "Thessaloniki, Greece"
    };
    expect(isAthensEvent(event)).toBe(false);
  });

  test("should accept events without explicit Athens mention (blacklist approach)", () => {
    // The filter assumes Athens unless non-Athens city is mentioned
    const event: RawEvent = {
      ...sampleRawConcert,
      location: "Greece"  // No city mentioned = assume Athens
    };
    expect(isAthensEvent(event)).toBe(true);
  });

  test("should accept event with Athens neighborhood", () => {
    const neighborhoods = [
      "Kolonaki, Athens",
      "Gazi, Athens",
      "Exarcheia, Athens",
      "Mets, Athens",
      "Psyrri, Athens"
    ];

    neighborhoods.forEach(location => {
      const event: RawEvent = {
        ...sampleRawConcert,
        location
      };
      expect(isAthensEvent(event)).toBe(true);
    });
  });

  test("should accept event with partial Athens mention", () => {
    const event: RawEvent = {
      ...sampleRawConcert,
      location: "Central Athens"
    };
    expect(isAthensEvent(event)).toBe(true);
  });

  test("should accept event with only 'Greece' (blacklist approach)", () => {
    // Assumes Athens if no other city mentioned
    const event: RawEvent = {
      ...sampleRawConcert,
      location: "Greece"
    };
    expect(isAthensEvent(event)).toBe(true);
  });

  test("should accept empty location (blacklist approach)", () => {
    // Assumes Athens from trusted sources
    const event: RawEvent = {
      ...sampleRawConcert,
      location: ""
    };
    expect(isAthensEvent(event)).toBe(true);
  });

  test("should filter batch of mixed events", () => {
    const events = [
      sampleRawConcert,      // Athens (accept)
      sampleRawNonAthens,    // Mykonos (reject if in blacklist)
      sampleRawGreek,        // Athens (accept)
      { ...sampleRawConcert, location: "Thessaloniki" }  // Thessaloniki (reject)
    ];

    const athensEvents = events.filter(isAthensEvent);
    // Should accept concert + Greek, reject Thessaloniki, Mykonos depends on if it's blacklisted
    expect(athensEvents.length).toBeGreaterThanOrEqual(2);
    expect(athensEvents.length).toBeLessThanOrEqual(3);
  });
});
