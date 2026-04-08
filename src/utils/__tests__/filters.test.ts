// Unit tests for event filtering logic
import { describe, test, expect, beforeAll } from "bun:test";
import { filterEvents, getFilteredEventCount } from "../filters";
import type { Event, Filters } from "../../types";
import { sampleConcert, sampleFreeExhibition, sampleTheaterPerformance, getTodayEvent, getTomorrowEvent } from "../../../tests/fixtures/events";

describe("filterEvents", () => {
  let testEvents: Event[];

  beforeAll(() => {
    testEvents = [
      sampleConcert,           // Ticketed concert
      sampleFreeExhibition,    // Open exhibition
      sampleTheaterPerformance, // Ticketed theater
      getTodayEvent(),         // Concert today
      getTomorrowEvent()       // Theater tomorrow
    ];
  });

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
    const filters: Filters = { time: "today" };
    const result = filterEvents(testEvents, filters);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    result.forEach(event => {
      const eventDate = new Date(event.startDate);
      expect(eventDate.getTime()).toBeGreaterThanOrEqual(today.getTime());
      expect(eventDate.getTime()).toBeLessThan(tomorrow.getTime());
    });
  });

  test("should filter events happening tomorrow", () => {
    const filters: Filters = { time: "tomorrow" };
    const result = filterEvents(testEvents, filters);

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    const dayAfter = new Date(tomorrow);
    dayAfter.setDate(dayAfter.getDate() + 1);

    result.forEach(event => {
      const eventDate = new Date(event.startDate);
      expect(eventDate.getTime()).toBeGreaterThanOrEqual(tomorrow.getTime());
      expect(eventDate.getTime()).toBeLessThan(dayAfter.getTime());
    });
  });

  test("should filter events this week", () => {
    const filters: Filters = { time: "this-week" };
    const result = filterEvents(testEvents, filters);

    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const weekEnd = new Date(now);
    weekEnd.setDate(weekEnd.getDate() + 7);

    result.forEach(event => {
      const eventDate = new Date(event.startDate);
      expect(eventDate.getTime()).toBeGreaterThanOrEqual(now.getTime());
      expect(eventDate.getTime()).toBeLessThan(weekEnd.getTime());
    });
  });

  test("should filter events this month", () => {
    const filters: Filters = { time: "this-month" };
    const result = filterEvents(testEvents, filters);

    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    monthEnd.setHours(23, 59, 59, 999);

    result.forEach(event => {
      const eventDate = new Date(event.startDate);
      expect(eventDate.getTime()).toBeGreaterThanOrEqual(now.getTime());
      expect(eventDate.getTime()).toBeLessThanOrEqual(monthEnd.getTime());
    });
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
    };
    const filtered = filterEvents([pastConcert], { time: "today" });
    expect(filtered.length).toBe(0);
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
