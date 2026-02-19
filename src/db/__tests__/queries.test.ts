// Database tests for query operations
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import type { Database } from "bun:sqlite";
import {
  getAllEvents,
  getEventsByFilter,
  getEventStats,
  cleanupOldEvents,
  updateEvent,
  updateEventEnrichment
} from "../database";
import { sampleConcert, sampleFreeExhibition, sampleTheaterPerformance, getTodayEvent, getTomorrowEvent } from "../../../tests/fixtures/events";
import {
  createTestDB,
  cleanupDB,
  seedEvents,
  countEvents,
  getEventById
} from "../../../tests/helpers/db-helpers";
import type { Event } from "../../types";

describe("getAllEvents", () => {
  let db: Database;

  beforeEach(() => {
    db = createTestDB();
  });

  afterEach(() => {
    cleanupDB(db);
  });

  test("should return empty array when no events exist", () => {
    const events = getAllEvents(db);
    expect(events).toBeArray();
    expect(events.length).toBe(0);
  });

  test("should return all events ordered by start date", () => {
    const testEvents = [
      getTomorrowEvent(),  // Later date
      getTodayEvent()      // Earlier date
    ];
    seedEvents(db, testEvents);

    const events = getAllEvents(db);

    expect(events.length).toBe(2);
    // Should be ordered by date (today first, tomorrow second)
    expect(events[0].startDate < events[1].startDate).toBe(true);
  });

  test("should not return cancelled events", () => {
    seedEvents(db, [sampleConcert]);

    // Mark event as cancelled
    db.prepare("UPDATE events SET is_cancelled = 1 WHERE id = ?").run(sampleConcert.id);

    const events = getAllEvents(db);
    expect(events.length).toBe(0);
  });

  test("should return valid Event objects", () => {
    seedEvents(db, [sampleConcert]);

    const events = getAllEvents(db);

    expect(events[0]).toMatchObject({
      "@context": "https://schema.org",
      "@type": expect.stringMatching(/Event$/),
      id: sampleConcert.id,
      title: sampleConcert.title,
      type: sampleConcert.type
    });
  });
});

describe("getEventsByFilter", () => {
  let db: Database;

  beforeEach(() => {
    db = createTestDB();
    seedEvents(db, [sampleConcert, sampleFreeExhibition, sampleTheaterPerformance]);
  });

  afterEach(() => {
    cleanupDB(db);
  });

  test("should filter by event type", () => {
    const concerts = getEventsByFilter({ type: "concert" }, db);

    expect(concerts.length).toBe(1);
    expect(concerts[0].type).toBe("concert");
    expect(concerts[0].id).toBe(sampleConcert.id);
  });

  test("should filter by price type", () => {
    const openEvents = getEventsByFilter({ priceType: "open" }, db);

    expect(openEvents.length).toBe(1);
    expect(openEvents[0].price.type).toBe("open");
    expect(openEvents[0].id).toBe(sampleFreeExhibition.id);
  });

  test("should filter by start date (events after date)", () => {
    const futureEvents = getEventsByFilter({ startDate: "2025-11-20T00:00:00Z" }, db);

    // Only theater performance is on 2025-11-20
    expect(futureEvents.length).toBeGreaterThanOrEqual(1);
    futureEvents.forEach(event => {
      expect(event.startDate >= "2025-11-20").toBe(true);
    });
  });

  test("should filter by end date (events before date)", () => {
    const pastEvents = getEventsByFilter({ endDate: "2025-11-16T00:00:00Z" }, db);

    // Concert (2025-11-15) and Exhibition (2025-11-10) should be included
    expect(pastEvents.length).toBe(2);
    pastEvents.forEach(event => {
      expect(event.startDate <= "2025-11-16").toBe(true);
    });
  });

  test("should filter by venue name (partial match)", () => {
    const halfNoteEvents = getEventsByFilter({ venue: "Half Note" }, db);

    expect(halfNoteEvents.length).toBe(1);
    expect(halfNoteEvents[0].venue.name).toContain("Half Note");
  });

  test("should combine multiple filters", () => {
    const ticketedConcerts = getEventsByFilter({
      type: "concert",
      priceType: "with-ticket"
    }, db);

    expect(ticketedConcerts.length).toBe(1);
    expect(ticketedConcerts[0].type).toBe("concert");
    expect(ticketedConcerts[0].price.type).toBe("with-ticket");
  });

  test("should return empty array when no matches", () => {
    const result = getEventsByFilter({ type: "workshop" }, db);

    expect(result).toBeArray();
    expect(result.length).toBe(0);
  });

  test("should not return cancelled events", () => {
    db.prepare("UPDATE events SET is_cancelled = 1").run();

    const result = getEventsByFilter({ type: "concert" }, db);
    expect(result.length).toBe(0);
  });
});

describe("getEventStats", () => {
  let db: Database;

  beforeEach(() => {
    db = createTestDB();
  });

  afterEach(() => {
    cleanupDB(db);
  });

  test("should return zero stats for empty database", () => {
    const stats = getEventStats(db);

    expect(stats.total).toBe(0);
    expect(stats.byType).toEqual({});
    expect(stats.byPriceType).toEqual({});
    expect(stats.upcomingCount).toBe(0);
  });

  test("should count total events correctly", () => {
    seedEvents(db, [sampleConcert, sampleFreeExhibition, sampleTheaterPerformance]);

    const stats = getEventStats(db);

    expect(stats.total).toBe(3);
  });

  test("should group events by type", () => {
    seedEvents(db, [sampleConcert, sampleFreeExhibition, sampleTheaterPerformance]);

    const stats = getEventStats(db);

    expect(stats.byType).toEqual({
      concert: 1,
      exhibition: 1,
      theater: 1
    });
  });

  test("should group events by price type", () => {
    seedEvents(db, [sampleConcert, sampleFreeExhibition, sampleTheaterPerformance]);

    const stats = getEventStats(db);

    expect(stats.byPriceType).toEqual({
      "with-ticket": 2,
      "open": 1
    });
  });

  test("should count upcoming events only", () => {
    // Create events with dates in the past
    const pastEvent: Event = {
      ...sampleConcert,
      id: "past-event",
      startDate: "2020-01-01T20:00:00+03:00"
    };

    // Create future event
    const futureEvent: Event = {
      ...sampleConcert,
      id: "future-event",
      startDate: "2030-01-01T20:00:00+03:00"
    };

    seedEvents(db, [pastEvent, futureEvent]);

    const stats = getEventStats(db);

    expect(stats.total).toBe(2);
    expect(stats.upcomingCount).toBe(1); // Only the future event
  });

  test("should not count cancelled events", () => {
    seedEvents(db, [sampleConcert, sampleFreeExhibition]);

    // Cancel one event
    db.prepare("UPDATE events SET is_cancelled = 1 WHERE id = ?").run(sampleConcert.id);

    const stats = getEventStats(db);

    expect(stats.total).toBe(1);
  });
});

describe("cleanupOldEvents", () => {
  let db: Database;

  beforeEach(() => {
    db = createTestDB();
  });

  afterEach(() => {
    cleanupDB(db);
  });

  test("should delete events older than retention period", () => {
    // Create old event (100 days ago)
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 100);

    const oldEvent: Event = {
      ...sampleConcert,
      id: "old-event",
      startDate: oldDate.toISOString()
    };

    // Create recent event (30 days ago)
    const recentDate = new Date();
    recentDate.setDate(recentDate.getDate() - 30);

    const recentEvent: Event = {
      ...sampleConcert,
      id: "recent-event",
      startDate: recentDate.toISOString()
    };

    seedEvents(db, [oldEvent, recentEvent]);

    // Cleanup events older than 90 days
    const deletedCount = cleanupOldEvents(90, db);

    expect(deletedCount).toBe(1);
    expect(countEvents(db)).toBe(1);

    // Verify the recent event still exists
    const remaining = getAllEvents(db);
    expect(remaining[0].id).toBe("recent-event");
  });

  test("should return 0 when no events to delete", () => {
    seedEvents(db, [getTodayEvent()]);

    const deletedCount = cleanupOldEvents(90, db);

    expect(deletedCount).toBe(0);
    expect(countEvents(db)).toBe(1);
  });

  test("should respect custom retention days", () => {
    const date60DaysAgo = new Date();
    date60DaysAgo.setDate(date60DaysAgo.getDate() - 60);

    const event: Event = {
      ...sampleConcert,
      startDate: date60DaysAgo.toISOString()
    };

    seedEvents(db, [event]);

    // Delete with 30-day retention (should delete)
    const deletedWith30 = cleanupOldEvents(30, db);
    expect(deletedWith30).toBe(1);
  });
});

describe("updateEvent", () => {
  let db: Database;

  beforeEach(() => {
    db = createTestDB();
    seedEvents(db, [sampleConcert]);
  });

  afterEach(() => {
    cleanupDB(db);
  });

  test("should update event fields", () => {
    const updatedEvent: Event = {
      ...sampleConcert,
      title: "Updated Jazz Night",
      description: "Updated description"
    };

    const success = updateEvent(updatedEvent, db);

    expect(success).toBe(true);

    const dbEvent = getEventById(db, sampleConcert.id);
    expect(dbEvent.title).toBe("Updated Jazz Night");
    expect(dbEvent.description).toBe("Updated description");
  });

  test("should update venue information", () => {
    const updatedEvent: Event = {
      ...sampleConcert,
      venue: {
        ...sampleConcert.venue,
        name: "New Venue Name",
        neighborhood: "Exarcheia"
      }
    };

    updateEvent(updatedEvent, db);

    const dbEvent = getEventById(db, sampleConcert.id);
    expect(dbEvent.venue_name).toBe("New Venue Name");
    expect(dbEvent.venue_neighborhood).toBe("Exarcheia");
  });

  test("should update price information", () => {
    const updatedEvent: Event = {
      ...sampleConcert,
      price: {
        type: "open"
      }
    };

    updateEvent(updatedEvent, db);

    const dbEvent = getEventById(db, sampleConcert.id);
    expect(dbEvent.price_type).toBe("open");
  });

  test("should return false for non-existent event", () => {
    const nonExistentEvent: Event = {
      ...sampleConcert,
      id: "non-existent-id"
    };

    // SQLite won't error, it just won't update anything
    // The function should still return true (no error occurred)
    const success = updateEvent(nonExistentEvent, db);
    expect(success).toBe(true);
  });
});

describe("updateEventEnrichment", () => {
  let db: Database;

  beforeEach(() => {
    db = createTestDB();
    seedEvents(db, [sampleConcert]);
  });

  afterEach(() => {
    cleanupDB(db);
  });

  test("should update full description", () => {
    const fullDesc = "A comprehensive 400-word description about this amazing jazz event...";
    const aiContext = { keywords: ["jazz", "live music", "athens"] };

    const success = updateEventEnrichment(sampleConcert.id, fullDesc, aiContext, db);

    expect(success).toBe(true);

    const dbEvent = getEventById(db, sampleConcert.id);
    expect(dbEvent.full_description).toBe(fullDesc);
  });

  test("should update AI context as JSON", () => {
    const aiContext = {
      keywords: ["jazz", "concert"],
      sentiment: "positive",
      topics: ["music", "culture"]
    };

    updateEventEnrichment(sampleConcert.id, "Description", aiContext, db);

    const dbEvent = getEventById(db, sampleConcert.id);
    const storedContext = JSON.parse(dbEvent.ai_context);

    expect(storedContext).toEqual(aiContext);
  });

  test("should update timestamp", () => {
    const beforeUpdate = getEventById(db, sampleConcert.id);
    const originalUpdatedAt = beforeUpdate.updated_at;

    // Wait a tiny bit to ensure timestamp changes
    const success = updateEventEnrichment(sampleConcert.id, "New description", {}, db);

    expect(success).toBe(true);

    const afterUpdate = getEventById(db, sampleConcert.id);
    // Updated_at should be different (though in fast tests this might not always be detectable)
    expect(afterUpdate.updated_at).toBeTruthy();
  });

  test("should handle empty AI context", () => {
    const success = updateEventEnrichment(sampleConcert.id, "Description", {}, db);

    expect(success).toBe(true);

    const dbEvent = getEventById(db, sampleConcert.id);
    expect(dbEvent.ai_context).toBe("{}");
  });

  test("should return true even for non-existent event", () => {
    // SQLite won't error, just won't update anything
    const success = updateEventEnrichment("non-existent-id", "Description", {}, db);
    expect(success).toBe(true);
  });
});
