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
