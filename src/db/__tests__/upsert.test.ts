// Database tests for upsert operations
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import type { Database } from "bun:sqlite";
import { upsertEvent, updateEvent } from "../database";
import { sampleConcert, sampleFreeExhibition } from "../../../tests/fixtures/events";
import {
  createTestDB,
  cleanupDB,
  eventExists,
  getEventById,
  countEvents
} from "../../../tests/helpers/db-helpers";
import type { Event } from "../../types";

describe("upsertEvent", () => {
  let db: Database;

  beforeEach(() => {
    db = createTestDB();
  });

  afterEach(() => {
    cleanupDB(db);
  });

  test("should insert new event", () => {
    const result = upsertEvent(sampleConcert, db);

    expect(result.success).toBe(true);
    expect(result.isNew).toBe(true);
    expect(eventExists(db, sampleConcert.id)).toBe(true);
  });

  test("should update existing event", () => {
    // Insert initial event
    upsertEvent(sampleConcert, db);

    // Update the event (same ID, different description)
    const updatedEvent: Event = {
      ...sampleConcert,
      description: "Updated description"
    };

    const result = upsertEvent(updatedEvent, db);

    expect(result.success).toBe(true);
    expect(result.isNew).toBe(false);

    // Verify the update
    const dbEvent = getEventById(db, sampleConcert.id);
    expect(dbEvent.description).toBe("Updated description");
  });

  test("should not duplicate events with same ID", () => {
    upsertEvent(sampleConcert, db);
    upsertEvent(sampleConcert, db);

    const count = countEvents(db);
    expect(count).toBe(1);
  });

  test("should insert multiple different events", () => {
    upsertEvent(sampleConcert, db);
    upsertEvent(sampleFreeExhibition, db);

    const count = countEvents(db);
    expect(count).toBe(2);
  });

  test("should preserve event data correctly", () => {
    upsertEvent(sampleConcert, db);

    const dbEvent = getEventById(db, sampleConcert.id);

    expect(dbEvent.title).toBe(sampleConcert.title);
    expect(dbEvent.type).toBe(sampleConcert.type);
    expect(dbEvent.venue_name).toBe(sampleConcert.venue.name);
    expect(dbEvent.price_type).toBe(sampleConcert.price.type);
  });

  test("should handle fullDescription correctly", () => {
    const eventWithDescription: Event = {
      ...sampleConcert,
      fullDescription: "A long description with about 400 words..."
    };

    upsertEvent(eventWithDescription, db);

    const dbEvent = getEventById(db, sampleConcert.id);
    expect(dbEvent.full_description).toBe(eventWithDescription.fullDescription);
  });

  test("should handle open events correctly", () => {
    upsertEvent(sampleFreeExhibition, db);

    const dbEvent = getEventById(db, sampleFreeExhibition.id);
    expect(dbEvent.price_type).toBe("open");
    expect(dbEvent.price_amount).toBeNull();
  });

  test("should handle ticketed events correctly", () => {
    upsertEvent(sampleConcert, db);

    const dbEvent = getEventById(db, sampleConcert.id);
    expect(dbEvent.price_type).toBe("with-ticket");
    expect(dbEvent.price_amount).toBe(sampleConcert.price.amount);
    expect(dbEvent.price_currency).toBe("EUR");
  });

  test("should handle venue coordinates", () => {
    upsertEvent(sampleConcert, db);

    const dbEvent = getEventById(db, sampleConcert.id);
    expect(dbEvent.venue_lat).toBeCloseTo(sampleConcert.venue.coordinates!.lat, 4);
    expect(dbEvent.venue_lng).toBeCloseTo(sampleConcert.venue.coordinates!.lon, 4);
  });

  test("should handle genres as JSON", () => {
    upsertEvent(sampleConcert, db);

    const dbEvent = getEventById(db, sampleConcert.id);
    const genres = JSON.parse(dbEvent.genres);

    expect(genres).toBeArray();
    expect(genres).toContain("jazz");
  });

  test("should handle tags as JSON", () => {
    upsertEvent(sampleFreeExhibition, db);

    const dbEvent = getEventById(db, sampleFreeExhibition.id);
    const tags = JSON.parse(dbEvent.tags);

    expect(tags).toBeArray();
    expect(tags).toContain("open");
  });

  test("should update timestamps correctly", () => {
    const firstInsert = upsertEvent(sampleConcert, db);
    const firstEvent = getEventById(db, sampleConcert.id);

    // Wait a tiny bit
    const updatedEvent: Event = {
      ...sampleConcert,
      description: "Updated"
    };

    const update = upsertEvent(updatedEvent, db);
    const secondEvent = getEventById(db, sampleConcert.id);

    expect(firstEvent.created_at).toBe(secondEvent.created_at); // Should not change
    // updated_at should change (but we can't reliably test this in fast tests)
  });

  // S2 taxonomy hygiene: integration tests confirming the entity-tag filter
  // fires at the DB write barrier (sites 1 + 2 in specs/s2-taxonomy-touchpoints.md).
  // Entity names used here MUST match the real athens-venues.json + city-geodata.json
  // — these tests run against the production exclusion set, not hermetic fixtures.
  test("upsertEvent: drops entity-name tags (venue variation + neighborhood + city) before DB write", () => {
    const dirtyEvent: Event = {
      ...sampleConcert,
      tags: ["Athens Concert Hall", "jazz", "Plaka", "rebetiko", "Athens"],
    };

    upsertEvent(dirtyEvent, db);
    const stored = JSON.parse(getEventById(db, dirtyEvent.id).tags);

    expect(stored).toEqual(["jazz", "rebetiko"]);
    expect(stored).not.toContain("Athens Concert Hall");
    expect(stored).not.toContain("Plaka");
    expect(stored).not.toContain("Athens");
  });

  test("updateEvent: drops entity-name tags before DB write", () => {
    upsertEvent(sampleConcert, db);

    const dirtyUpdate: Event = {
      ...sampleConcert,
      tags: ["Gazi", "Πλάκα", "techno", "Megaro Mousikis"],
    };
    updateEvent(dirtyUpdate, db);

    const stored = JSON.parse(getEventById(db, sampleConcert.id).tags);
    expect(stored).toEqual(["techno"]);
    expect(stored).not.toContain("Gazi");
    expect(stored).not.toContain("Πλάκα");
    expect(stored).not.toContain("Megaro Mousikis");
  });
});
