// Unit tests for event filtering logic
import { describe, test, expect, beforeAll, afterAll, setSystemTime } from "bun:test";
import { filterEvents, getFilteredEventCount } from "../filters";
import { DateTime } from "luxon";
import { ATHENS_TZ } from "../format-date";
import type { Event, Filters } from "../../types";
import { sampleConcert, sampleFreeExhibition, sampleTheaterPerformance, getTodayEvent, getTomorrowEvent } from "../../../tests/fixtures/events";

describe("filterEvents", () => {
  let testEvents: Event[];

  beforeAll(() => {
    setSystemTime(new Date('2026-09-20T22:30:00Z')); // Sep 21 in Athens, Sep 20 in UTC.
    const today = DateTime.now().setZone(ATHENS_TZ);
    testEvents = [
      sampleConcert,           // Ticketed concert
      sampleFreeExhibition,    // Open exhibition
      sampleTheaterPerformance, // Ticketed theater
      { ...getTodayEvent(), id: 'today', startDate: today.toISODate() + 'T20:00:00' },
      { ...getTomorrowEvent(), id: 'tomorrow', startDate: today.plus({ days: 1 }).toISODate() + 'T21:00:00' }
    ];
  });

  afterAll(() => setSystemTime());

  test("should return all events when no filters applied", () => {
    const filters: Filters = {};
    const result = filterEvents(testEvents, filters);
    expect(result.length).toBe(5);
  });

  test("should filter by event type (concert)", () => {
    const filters: Filters = { type: "concert" };
    const result = filterEvents(testEvents, filters);

    expect(result.length).toBeGreaterThan(0);
    result.forEach(event => {
      expect(event.type).toBe("concert");
    });
  });

  test("should filter by event type (exhibition)", () => {
    const filters: Filters = { type: "exhibition" };
    const result = filterEvents(testEvents, filters);

    expect(result.length).toBe(1);
    expect(result[0].type).toBe("exhibition");
  });

  test("should filter by event type (theater)", () => {
    const filters: Filters = { type: "theater" };
    const result = filterEvents(testEvents, filters);

    expect(result.length).toBeGreaterThan(0);
    result.forEach(event => {
      expect(event.type).toBe("theater");
    });
  });

  test("should filter open events", () => {
    const filters: Filters = { price: "open" };
    const result = filterEvents(testEvents, filters);

    expect(result.length).toBeGreaterThan(0);
    result.forEach(event => {
      expect(event.price.type).toBe("open");
    });
  });

  test("should filter ticketed events", () => {
    const filters: Filters = { price: "with-ticket" };
    const result = filterEvents(testEvents, filters);

    expect(result.length).toBeGreaterThan(0);
    result.forEach(event => {
      expect(event.price.type).toBe("with-ticket");
    });
  });

  test("should filter by genre (jazz)", () => {
    const filters: Filters = { genre: "jazz" };
    const result = filterEvents(testEvents, filters);

    result.forEach(event => {
      expect(event.genres).toContain("jazz");
    });
  });

  test("should filter events happening today", () => {
    const result = filterEvents(testEvents, { time: "today" });
    expect(result.map(event => event.id)).toEqual(['today']);
  });

  test("should filter events happening tomorrow", () => {
    const result = filterEvents(testEvents, { time: "tomorrow" });
    expect(result.map(event => event.id)).toEqual(['tomorrow']);
  });

  test("should filter events this week", () => {
    const result = filterEvents(testEvents, { time: "this-week" });
    expect(result.map(event => event.id)).toEqual(['today', 'tomorrow']);
  });

  test("should filter events this month", () => {
    const result = filterEvents(testEvents, { time: "this-month" });
    expect(result.map(event => event.id)).toEqual(['today', 'tomorrow']);
  });

  test("should combine multiple filters (type + price)", () => {
    const filters: Filters = {
      type: "concert",
      price: "with-ticket"
    };
    const result = filterEvents(testEvents, filters);

    result.forEach(event => {
      expect(event.type).toBe("concert");
      expect(event.price.type).toBe("with-ticket");
    });
  });

  test("should combine multiple filters (type + genre)", () => {
    const filters: Filters = {
      type: "concert",
      genre: "jazz"
    };
    const result = filterEvents(testEvents, filters);

    result.forEach(event => {
      expect(event.type).toBe("concert");
      expect(event.genres).toContain("jazz");
    });
  });

  test("should return empty array when no events match filters", () => {
    const filters: Filters = {
      type: "concert",
      genre: "non-existent-genre"
    };
    const result = filterEvents(testEvents, filters);
    expect(result.length).toBe(0);
  });

  test("should handle all-events time filter", () => {
    const filters: Filters = { time: "all-events" };
    const result = filterEvents(testEvents, filters);
    expect(result.length).toBe(5); // Should return all events
  });
});

describe("Exhibition Tier 1: running exhibitions in time filters", () => {
  function makeExhibition(overrides: Partial<Event>): Event {
    return {
      "@context": "https://schema.org",
      "@type": "ExhibitionEvent",
      id: "test-exhibition-" + Math.random().toString(36).substring(7),
      title: "Running Exhibition",
      description: "An exhibition currently running",
      startDate: "2026-02-15T10:00:00+03:00",
      endDate: "2026-04-30T18:00:00+03:00",
      type: "exhibition",
      genres: ["contemporary-art"],
      tags: [],
      venue: { name: "Test Gallery", address: "Athens" },
      price: { type: "open" },
      source: "test",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      language: "el",
      hasNativeGreek: false,
      ticketUrlResolved: null,
      ...overrides,
    };
  }

  test("today filter includes running exhibitions (started weeks ago, still open)", () => {
    const now = new Date();
    const pastStart = new Date(now);
    pastStart.setDate(pastStart.getDate() - 30);
    const futureEnd = new Date(now);
    futureEnd.setDate(futureEnd.getDate() + 30);

    const runningExhibition = makeExhibition({
      startDate: pastStart.toISOString(),
      endDate: futureEnd.toISOString(),
    });
    const filtered = filterEvents([runningExhibition], { time: "today" });
    expect(filtered.length).toBe(1);
  });

  test("today filter excludes ended exhibitions", () => {
    const now = new Date();
    const pastStart = new Date(now);
    pastStart.setDate(pastStart.getDate() - 60);
    const pastEnd = new Date(now);
    pastEnd.setDate(pastEnd.getDate() - 2);

    const endedExhibition = makeExhibition({
      startDate: pastStart.toISOString(),
      endDate: pastEnd.toISOString(),
    });
    const filtered = filterEvents([endedExhibition], { time: "today" });
    expect(filtered.length).toBe(0);
  });

  test("today filter excludes future exhibitions (not yet started)", () => {
    const now = new Date();
    const futureStart = new Date(now);
    futureStart.setDate(futureStart.getDate() + 10);
    const futureEnd = new Date(now);
    futureEnd.setDate(futureEnd.getDate() + 40);

    const futureExhibition = makeExhibition({
      startDate: futureStart.toISOString(),
      endDate: futureEnd.toISOString(),
    });
    const filtered = filterEvents([futureExhibition], { time: "today" });
    expect(filtered.length).toBe(0);
  });

  test("this-weekend filter includes running exhibitions that span the weekend", () => {
    const now = new Date();
    const pastStart = new Date(now);
    pastStart.setDate(pastStart.getDate() - 30);
    const futureEnd = new Date(now);
    futureEnd.setDate(futureEnd.getDate() + 30);

    const runningExhibition = makeExhibition({
      startDate: pastStart.toISOString(),
      endDate: futureEnd.toISOString(),
    });
    const filtered = filterEvents([runningExhibition], { time: "this-weekend" });
    expect(filtered.length).toBe(1);
  });

  test("this-week filter includes running exhibitions", () => {
    const now = new Date();
    const pastStart = new Date(now);
    pastStart.setDate(pastStart.getDate() - 30);
    const futureEnd = new Date(now);
    futureEnd.setDate(futureEnd.getDate() + 30);

    const runningExhibition = makeExhibition({
      startDate: pastStart.toISOString(),
      endDate: futureEnd.toISOString(),
    });
    const filtered = filterEvents([runningExhibition], { time: "this-week" });
    expect(filtered.length).toBe(1);
  });

  test("this-month filter includes running exhibitions", () => {
    const now = new Date();
    const pastStart = new Date(now);
    pastStart.setDate(pastStart.getDate() - 30);
    const futureEnd = new Date(now);
    futureEnd.setDate(futureEnd.getDate() + 60);

    const runningExhibition = makeExhibition({
      startDate: pastStart.toISOString(),
      endDate: futureEnd.toISOString(),
    });
    const filtered = filterEvents([runningExhibition], { time: "this-month" });
    expect(filtered.length).toBe(1);
  });

  test("tomorrow filter includes running exhibitions (started weeks ago, still open)", () => {
    const now = new Date();
    const pastStart = new Date(now);
    pastStart.setDate(pastStart.getDate() - 30);
    const futureEnd = new Date(now);
    futureEnd.setDate(futureEnd.getDate() + 30);

    const runningExhibition = makeExhibition({
      startDate: pastStart.toISOString(),
      endDate: futureEnd.toISOString(),
    });
    const filtered = filterEvents([runningExhibition], { time: "tomorrow" });
    expect(filtered.length).toBe(1);
  });

  test("next-month filter includes running exhibitions that span into next month", () => {
    const now = new Date();
    const pastStart = new Date(now);
    pastStart.setDate(pastStart.getDate() - 30);
    const futureEnd = new Date(now);
    futureEnd.setDate(futureEnd.getDate() + 60);

    const runningExhibition = makeExhibition({
      startDate: pastStart.toISOString(),
      endDate: futureEnd.toISOString(),
    });
    const filtered = filterEvents([runningExhibition], { time: "next-month" });
    expect(filtered.length).toBe(1);
  });

  test("non-exhibition events with endDate are NOT affected by exhibition logic", () => {
    const now = new Date();
    const pastStart = new Date(now);
    pastStart.setDate(pastStart.getDate() - 30);
    const futureEnd = new Date(now);
    futureEnd.setDate(futureEnd.getDate() + 30);

    const pastConcert: Event = {
      "@context": "https://schema.org",
      "@type": "MusicEvent",
      id: "old-concert",
      title: "Old Concert",
      description: "A concert from the past",
      startDate: pastStart.toISOString(),
      endDate: futureEnd.toISOString(),
      type: "concert",
      genres: [],
      tags: [],
      venue: { name: "Test Venue", address: "Athens" },
      price: { type: "open" },
      source: "test",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      language: "el",
      hasNativeGreek: false,
      ticketUrlResolved: null,
    };
    const filtered = filterEvents([pastConcert], { time: "today" });
    expect(filtered.length).toBe(0);
  });
});

describe("D1: genre filter consults the living tag taxonomy", () => {
  // The `genres` column is scraper-era (lowercase, usually empty); the
  // enrichment taxonomy lives in `tags` (Capitalized, hyphenated). Genre
  // pages are generated with display names like "Jazz" / "Drum and Bass",
  // so the filter must match across BOTH fields, case-insensitively, with
  // space/hyphen normalization — or genre pages render empty (D1).
  function makeConcert(overrides: Partial<Event>): Event {
    return {
      "@context": "https://schema.org",
      "@type": "MusicEvent",
      id: "genre-filter-fixture",
      title: "D1 Test Concert",
      description: "A concert",
      startDate: "2026-09-19T21:00:00+03:00",
      type: "concert",
      genres: [],
      tags: [],
      venue: { name: "Test Venue", address: "Athens" },
      price: { type: "with-ticket" },
      source: "test",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      language: "el",
      hasNativeGreek: false,
      ticketUrlResolved: null,
      ...overrides,
    };
  }

  test("capitalized page genre matches lowercase scraper genres", () => {
    const event = makeConcert({ genres: ["jazz"], tags: [] });
    // Fixture precondition: the mismatch under test actually exists
    expect(event.genres).toEqual(["jazz"]);
    expect(event.genres).not.toContain("Jazz");

    const result = filterEvents([event], { genre: "Jazz" });
    expect(result.length).toBe(1);
  });

  test("genre matches enrichment tags when genres is empty", () => {
    const event = makeConcert({ genres: [], tags: ["Jazz", "Intimate", "Listening-room"] });
    expect(event.genres.length).toBe(0); // precondition: genres carries nothing

    const result = filterEvents([event], { genre: "Jazz" });
    expect(result.length).toBe(1);
  });

  test("multi-word page genre matches hyphenated tag form", () => {
    const event = makeConcert({ type: "dj_set", genres: [], tags: ["Drum-and-Bass", "Late-night"] });
    const result = filterEvents([event], { genre: "Drum and Bass" });
    expect(result.length).toBe(1);
  });

  test("normalizes surrounding whitespace and underscore runs in either field", () => {
    const events = [
      makeConcert({ id: "scraper", genres: ["  Drum__and Bass  "], tags: undefined }),
      makeConcert({ id: "enriched", tags: ["  Drum-and-Bass  "] }),
    ];
    expect(filterEvents(events, { genre: "  drum and bass  " }).map(event => event.id))
      .toEqual(["scraper", "enriched"]);
  });

  test("unrelated vibe tags do not satisfy a genre filter", () => {
    const event = makeConcert({ genres: [], tags: ["Intimate", "Seated", "Metro-accessible"] });
    const result = filterEvents([event], { genre: "Jazz" });
    expect(result.length).toBe(0);
  });

  test("genre token match is exact, not substring", () => {
    const event = makeConcert({ genres: [], tags: ["Acid-jazz"] });
    // "Acid jazz" has its own genre page; it must not leak onto plain "Jazz"
    const result = filterEvents([event], { genre: "Jazz" });
    expect(result.length).toBe(0);
  });
});

describe("getFilteredEventCount", () => {
  let testEvents: Event[];

  beforeAll(() => {
    testEvents = [
      sampleConcert,
      sampleFreeExhibition,
      sampleTheaterPerformance
    ];
  });

  test("should return correct count of filtered events", () => {
    const filters: Filters = { type: "concert" };
    const count = getFilteredEventCount(testEvents, filters);

    const manualCount = testEvents.filter(e => e.type === "concert").length;
    expect(count).toBe(manualCount);
  });

  test("should return total count when no filters applied", () => {
    const filters: Filters = {};
    const count = getFilteredEventCount(testEvents, filters);
    expect(count).toBe(3);
  });

  test("should return 0 when no events match", () => {
    const filters: Filters = { type: "workshop" };
    const count = getFilteredEventCount(testEvents, filters);
    expect(count).toBe(0);
  });
});
