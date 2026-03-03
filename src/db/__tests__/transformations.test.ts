// Database tests for data transformation functions
import { describe, test, expect } from "bun:test";
import { eventToRow, rowToEvent } from "../database";
import { sampleConcert, sampleFreeExhibition, sampleWorkshop } from "../../../tests/fixtures/events";
import type { Event, SemanticTags } from "../../types";

describe("eventToRow", () => {
  test("should convert Event to database row format", () => {
    const row = eventToRow(sampleConcert);

    expect(row).toMatchObject({
      $id: sampleConcert.id,
      $title: sampleConcert.title,
      $description: sampleConcert.description,
      $type: sampleConcert.type,
      $venue_name: sampleConcert.venue.name,
      $venue_address: sampleConcert.venue.address,
      $price_type: sampleConcert.price.type,
      $source: sampleConcert.source
    });
  });

  test("should handle venue coordinates correctly", () => {
    const row = eventToRow(sampleConcert);

    expect(row.$venue_lat).toBe(sampleConcert.venue.coordinates?.lat);
    expect(row.$venue_lng).toBe(sampleConcert.venue.coordinates?.lon);
  });

  test("should handle missing coordinates as null", () => {
    const eventWithoutCoords: Event = {
      ...sampleConcert,
      venue: {
        ...sampleConcert.venue,
        coordinates: undefined
      }
    };

    const row = eventToRow(eventWithoutCoords);

    expect(row.$venue_lat).toBeNull();
    expect(row.$venue_lng).toBeNull();
  });

  test("should serialize genres as JSON string", () => {
    const row = eventToRow(sampleConcert);

    expect(row.$genres).toBe(JSON.stringify(sampleConcert.genres));
    expect(typeof row.$genres).toBe("string");

    // Verify it can be parsed back
    const parsed = JSON.parse(row.$genres);
    expect(parsed).toEqual(sampleConcert.genres);
  });

  test("should serialize tags as JSON string", () => {
    const row = eventToRow(sampleFreeExhibition);

    expect(row.$tags).toBe(JSON.stringify(sampleFreeExhibition.tags));

    const parsed = JSON.parse(row.$tags);
    expect(parsed).toEqual(sampleFreeExhibition.tags);
  });

  test("should handle fullDescription correctly", () => {
    const eventWithFullDesc: Event = {
      ...sampleConcert,
      fullDescription: "A detailed 400-word description..."
    };

    const row = eventToRow(eventWithFullDesc);

    expect(row.$full_description).toBe("A detailed 400-word description...");
  });

  test("should set fullDescription to null when missing", () => {
    const eventWithoutFullDesc: Event = {
      ...sampleConcert,
      fullDescription: undefined
    };

    const row = eventToRow(eventWithoutFullDesc);

    expect(row.$full_description).toBeNull();
  });

  test("should handle price amount for ticketed events", () => {
    const row = eventToRow(sampleConcert);

    expect(row.$price_type).toBe("with-ticket");
    expect(row.$price_amount).toBe(sampleConcert.price.amount);
    expect(row.$price_currency).toBe("EUR");
  });

  test("should handle open events with no price amount", () => {
    const row = eventToRow(sampleFreeExhibition);

    expect(row.$price_type).toBe("open");
    expect(row.$price_amount).toBeNull();
  });

  test("should include price range when available", () => {
    const eventWithRange: Event = {
      ...sampleConcert,
      price: {
        type: "with-ticket",
        amount: 20,
        currency: "EUR",
        range: "€15-€25"
      }
    };

    const row = eventToRow(eventWithRange);

    expect(row.$price_range).toBe("€15-€25");
  });

  test("should serialize entire event as schema_json", () => {
    const row = eventToRow(sampleConcert);

    expect(typeof row.$schema_json).toBe("string");

    const parsed = JSON.parse(row.$schema_json);
    expect(parsed).toMatchObject({
      "@context": "https://schema.org",
      "@type": "MusicEvent",
      id: sampleConcert.id,
      title: sampleConcert.title
    });
  });

  test("should handle semanticTags when present", () => {
    const tags: SemanticTags = { mood: ["jazz"], audience: ["adults"], vibe: ["weekend"] };
    const eventWithTags: Event = {
      ...sampleConcert,
      semanticTags: tags
    };

    const row = eventToRow(eventWithTags);

    expect(row.$ai_context).toBe(JSON.stringify(tags));
  });

  test("should set ai_context to null when semanticTags missing", () => {
    const row = eventToRow(sampleConcert);

    expect(row.$ai_context).toBeNull();
  });

  test("should include timestamps", () => {
    const row = eventToRow(sampleConcert);

    expect(row.$created_at).toBe(sampleConcert.createdAt);
    expect(row.$updated_at).toBe(sampleConcert.updatedAt);
    expect(row.$scraped_at).toBeTruthy();
    expect(row.$scraped_at).toMatch(/^\d{4}-\d{2}-\d{2}T/); // ISO format
  });

  test("should handle venue neighborhood", () => {
    const row = eventToRow(sampleConcert);

    expect(row.$venue_neighborhood).toBe(sampleConcert.venue.neighborhood);
  });

  test("should set neighborhood to null when missing", () => {
    const eventWithoutNeighborhood: Event = {
      ...sampleConcert,
      venue: {
        ...sampleConcert.venue,
        neighborhood: undefined
      }
    };

    const row = eventToRow(eventWithoutNeighborhood);

    expect(row.$venue_neighborhood).toBeNull();
  });

  test("should handle URL field", () => {
    const row = eventToRow(sampleConcert);

    expect(row.$url).toBe(sampleConcert.url);
  });

  test("should default price currency to EUR", () => {
    const eventWithoutCurrency: Event = {
      ...sampleConcert,
      price: {
        type: "with-ticket",
        amount: 10
      }
    };

    const row = eventToRow(eventWithoutCurrency);

    expect(row.$price_currency).toBe("EUR");
  });
});

describe("rowToEvent", () => {
  test("should convert database row to Event object", () => {
    const row = {
      id: "test-event",
      title: "Test Event",
      description: "A test event",
      full_description: null,
      start_date: "2025-11-15T20:00:00+03:00",
      end_date: null,
      type: "concert",
      genres: JSON.stringify(["rock"]),
      tags: JSON.stringify(["trending"]),
      venue_name: "Test Venue",
      venue_address: "123 Test St",
      venue_neighborhood: "Psyrri",
      venue_lat: 37.98,
      venue_lng: 23.73,
      venue_capacity: null,
      price_type: "with-ticket",
      price_amount: 20,
      price_currency: "EUR",
      price_range: null,
      url: "https://example.com/event",
      source: "test-source",
      ai_context: null,
      schema_json: JSON.stringify({
        "@type": "MusicEvent",
        id: "test-event"
      }),
      created_at: "2025-10-01T12:00:00Z",
      updated_at: "2025-10-01T12:00:00Z"
    };

    const event = rowToEvent(row);

    expect(event).toMatchObject({
      "@context": "https://schema.org",
      "@type": "MusicEvent",
      id: "test-event",
      title: "Test Event",
      description: "A test event",
      type: "concert",
      language: "en"
    });
  });

  test("should parse genres from JSON", () => {
    const row = {
      id: "test",
      title: "Test",
      description: "",
      start_date: "2025-11-15T20:00:00+03:00",
      type: "concert",
      genres: JSON.stringify(["jazz", "blues"]),
      tags: JSON.stringify([]),
      venue_name: "Venue",
      venue_address: "Address",
      venue_neighborhood: null,
      venue_lat: null,
      venue_lng: null,
      venue_capacity: null,
      price_type: "open",
      price_amount: null,
      price_currency: "EUR",
      price_range: null,
      url: null,
      source: "test",
      ai_context: null,
      schema_json: JSON.stringify({ "@type": "Event" }),
      created_at: "2025-10-01T12:00:00Z",
      updated_at: "2025-10-01T12:00:00Z",
      end_date: null,
      full_description: null
    };

    const event = rowToEvent(row);

    expect(event.genres).toEqual(["jazz", "blues"]);
  });

  test("should parse tags from JSON", () => {
    const row = {
      id: "test",
      title: "Test",
      description: "",
      start_date: "2025-11-15T20:00:00+03:00",
      type: "concert",
      genres: JSON.stringify([]),
      tags: JSON.stringify(["open", "outdoor"]),
      venue_name: "Venue",
      venue_address: "Address",
      venue_neighborhood: null,
      venue_lat: null,
      venue_lng: null,
      venue_capacity: null,
      price_type: "open",
      price_amount: null,
      price_currency: "EUR",
      price_range: null,
      url: null,
      source: "test",
      ai_context: null,
      schema_json: JSON.stringify({ "@type": "Event" }),
      created_at: "2025-10-01T12:00:00Z",
      updated_at: "2025-10-01T12:00:00Z",
      end_date: null,
      full_description: null
    };

    const event = rowToEvent(row);

    expect(event.tags).toEqual(["open", "outdoor"]);
  });

  test("should handle empty genres/tags as empty arrays", () => {
    const row = {
      id: "test",
      title: "Test",
      description: "",
      start_date: "2025-11-15T20:00:00+03:00",
      type: "concert",
      genres: null,
      tags: "",
      venue_name: "Venue",
      venue_address: "Address",
      venue_neighborhood: null,
      venue_lat: null,
      venue_lng: null,
      venue_capacity: null,
      price_type: "open",
      price_amount: null,
      price_currency: "EUR",
      price_range: null,
      url: null,
      source: "test",
      ai_context: null,
      schema_json: JSON.stringify({ "@type": "Event" }),
      created_at: "2025-10-01T12:00:00Z",
      updated_at: "2025-10-01T12:00:00Z",
      end_date: null,
      full_description: null
    };

    const event = rowToEvent(row);

    expect(event.genres).toEqual([]);
    expect(event.tags).toEqual([]);
  });

  test("should reconstruct venue with coordinates", () => {
    const row = {
      id: "test",
      title: "Test",
      description: "",
      start_date: "2025-11-15T20:00:00+03:00",
      type: "concert",
      genres: JSON.stringify([]),
      tags: JSON.stringify([]),
      venue_name: "Half Note",
      venue_address: "17 Trivonianou St",
      venue_neighborhood: "Mets",
      venue_lat: 37.9648,
      venue_lng: 23.7432,
      venue_capacity: 200,
      price_type: "open",
      price_amount: null,
      price_currency: "EUR",
      price_range: null,
      url: null,
      source: "test",
      ai_context: null,
      schema_json: JSON.stringify({ "@type": "Event" }),
      created_at: "2025-10-01T12:00:00Z",
      updated_at: "2025-10-01T12:00:00Z",
      end_date: null,
      full_description: null
    };

    const event = rowToEvent(row);

    expect(event.venue).toEqual({
      name: "Half Note",
      address: "17 Trivonianou St",
      neighborhood: "Mets",
      coordinates: {
        lat: 37.9648,
        lon: 23.7432
      },
      capacity: 200
    });
  });

  test("should handle venue without coordinates", () => {
    const row = {
      id: "test",
      title: "Test",
      description: "",
      start_date: "2025-11-15T20:00:00+03:00",
      type: "concert",
      genres: JSON.stringify([]),
      tags: JSON.stringify([]),
      venue_name: "Unknown Venue",
      venue_address: "Unknown Address",
      venue_neighborhood: null,
      venue_lat: null,
      venue_lng: null,
      venue_capacity: null,
      price_type: "open",
      price_amount: null,
      price_currency: "EUR",
      price_range: null,
      url: null,
      source: "test",
      ai_context: null,
      schema_json: JSON.stringify({ "@type": "Event" }),
      created_at: "2025-10-01T12:00:00Z",
      updated_at: "2025-10-01T12:00:00Z",
      end_date: null,
      full_description: null
    };

    const event = rowToEvent(row);

    expect(event.venue.coordinates).toBeUndefined();
  });

  test("should reconstruct price for ticketed events", () => {
    const row = {
      id: "test",
      title: "Test",
      description: "",
      start_date: "2025-11-15T20:00:00+03:00",
      type: "concert",
      genres: JSON.stringify([]),
      tags: JSON.stringify([]),
      venue_name: "Venue",
      venue_address: "Address",
      venue_neighborhood: null,
      venue_lat: null,
      venue_lng: null,
      venue_capacity: null,
      price_type: "with-ticket",
      price_amount: 25,
      price_currency: "EUR",
      price_range: "€20-€30",
      url: null,
      source: "test",
      ai_context: null,
      schema_json: JSON.stringify({ "@type": "Event" }),
      created_at: "2025-10-01T12:00:00Z",
      updated_at: "2025-10-01T12:00:00Z",
      end_date: null,
      full_description: null
    };

    const event = rowToEvent(row);

    expect(event.price).toEqual({
      type: "with-ticket",
      amount: 25,
      currency: "EUR",
      range: "€20-€30"
    });
  });

  test("should reconstruct price for open events", () => {
    const row = {
      id: "test",
      title: "Test",
      description: "",
      start_date: "2025-11-15T20:00:00+03:00",
      type: "exhibition",
      genres: JSON.stringify([]),
      tags: JSON.stringify([]),
      venue_name: "Venue",
      venue_address: "Address",
      venue_neighborhood: null,
      venue_lat: null,
      venue_lng: null,
      venue_capacity: null,
      price_type: "open",
      price_amount: null,
      price_currency: "EUR",
      price_range: null,
      url: null,
      source: "test",
      ai_context: null,
      schema_json: JSON.stringify({ "@type": "Event" }),
      created_at: "2025-10-01T12:00:00Z",
      updated_at: "2025-10-01T12:00:00Z",
      end_date: null,
      full_description: null
    };

    const event = rowToEvent(row);

    expect(event.price.type).toBe("open");
    expect(event.price.amount).toBeNull();
    expect(event.price.currency).toBe("EUR");
    expect(event.price.range).toBeNull();
  });

  test("should parse semanticTags from ai_context", () => {
    const row = {
      id: "test",
      title: "Test",
      description: "",
      start_date: "2025-11-15T20:00:00+03:00",
      type: "concert",
      genres: JSON.stringify([]),
      tags: JSON.stringify([]),
      venue_name: "Venue",
      venue_address: "Address",
      venue_neighborhood: null,
      venue_lat: null,
      venue_lng: null,
      venue_capacity: null,
      price_type: "open",
      price_amount: null,
      price_currency: "EUR",
      price_range: null,
      url: null,
      source: "test",
      ai_context: JSON.stringify({ keywords: ["jazz", "live"] }),
      schema_json: JSON.stringify({ "@type": "Event" }),
      created_at: "2025-10-01T12:00:00Z",
      updated_at: "2025-10-01T12:00:00Z",
      end_date: null,
      full_description: null
    };

    const event = rowToEvent(row);

    expect(event.semanticTags).toBeDefined();
    expect(event.semanticTags).toHaveProperty('keywords', ["jazz", "live"]);
  });

  test("should handle null ai_context", () => {
    const row = {
      id: "test",
      title: "Test",
      description: "",
      start_date: "2025-11-15T20:00:00+03:00",
      type: "concert",
      genres: JSON.stringify([]),
      tags: JSON.stringify([]),
      venue_name: "Venue",
      venue_address: "Address",
      venue_neighborhood: null,
      venue_lat: null,
      venue_lng: null,
      venue_capacity: null,
      price_type: "open",
      price_amount: null,
      price_currency: "EUR",
      price_range: null,
      url: null,
      source: "test",
      ai_context: null,
      schema_json: JSON.stringify({ "@type": "Event" }),
      created_at: "2025-10-01T12:00:00Z",
      updated_at: "2025-10-01T12:00:00Z",
      end_date: null,
      full_description: null
    };

    const event = rowToEvent(row);

    expect(event.semanticTags).toBeUndefined();
  });

  test("should derive @type from SCHEMA_TYPE_MAP using row.type", () => {
    const row = {
      id: "test",
      title: "Test",
      description: "",
      start_date: "2025-11-15T20:00:00+03:00",
      type: "theater",
      genres: JSON.stringify([]),
      tags: JSON.stringify([]),
      venue_name: "Venue",
      venue_address: "Address",
      venue_neighborhood: null,
      venue_lat: null,
      venue_lng: null,
      venue_capacity: null,
      price_type: "open",
      price_amount: null,
      price_currency: "EUR",
      price_range: null,
      url: null,
      source: "test",
      ai_context: null,
      schema_json: JSON.stringify({ "@type": "SomeOldType" }),
      created_at: "2025-10-01T12:00:00Z",
      updated_at: "2025-10-01T12:00:00Z",
      end_date: null,
      full_description: null
    };

    const event = rowToEvent(row);

    // @type comes from SCHEMA_TYPE_MAP, NOT from schema_json
    expect(event["@type"]).toBe("TheaterEvent");
  });

  test("should map all known types via SCHEMA_TYPE_MAP", () => {
    const typeMap: Record<string, string> = {
      concert: "MusicEvent",
      dj_set: "MusicEvent",
      theater: "TheaterEvent",
      exhibition: "ExhibitionEvent",
      screening: "ScreeningEvent",
      cinema: "ScreeningEvent",
      workshop: "EducationEvent",
      tech: "EducationEvent",
      show: "Event",
      festival: "Festival",
      performance: "DanceEvent",
    };

    for (const [type, expectedSchemaType] of Object.entries(typeMap)) {
      const row = {
        id: "test",
        title: "Test",
        description: "",
        start_date: "2025-11-15T20:00:00+03:00",
        type,
        genres: JSON.stringify([]),
        tags: JSON.stringify([]),
        venue_name: "Venue",
        venue_address: "Address",
        venue_neighborhood: null,
        venue_lat: null,
        venue_lng: null,
        venue_capacity: null,
        price_type: "open",
        price_amount: null,
        price_currency: "EUR",
        price_range: null,
        url: null,
        source: "test",
        ai_context: null,
        schema_json: null,
        created_at: "2025-10-01T12:00:00Z",
        updated_at: "2025-10-01T12:00:00Z",
        end_date: null,
        full_description: null
      };

      const event = rowToEvent(row);
      expect(event["@type"]).toBe(expectedSchemaType);
    }
  });

  test("should fallback to 'Event' @type for unknown type", () => {
    const row = {
      id: "test",
      title: "Test",
      description: "",
      start_date: "2025-11-15T20:00:00+03:00",
      type: "unknown_type",
      genres: JSON.stringify([]),
      tags: JSON.stringify([]),
      venue_name: "Venue",
      venue_address: "Address",
      venue_neighborhood: null,
      venue_lat: null,
      venue_lng: null,
      venue_capacity: null,
      price_type: "open",
      price_amount: null,
      price_currency: "EUR",
      price_range: null,
      url: null,
      source: "test",
      ai_context: null,
      schema_json: null,
      created_at: "2025-10-01T12:00:00Z",
      updated_at: "2025-10-01T12:00:00Z",
      end_date: null,
      full_description: null
    };

    const event = rowToEvent(row);

    expect(event["@type"]).toBe("Event");
  });

  test("should include fullDescription when present", () => {
    const row = {
      id: "test",
      title: "Test",
      description: "Short",
      full_description: "A very long and detailed description...",
      start_date: "2025-11-15T20:00:00+03:00",
      type: "concert",
      genres: JSON.stringify([]),
      tags: JSON.stringify([]),
      venue_name: "Venue",
      venue_address: "Address",
      venue_neighborhood: null,
      venue_lat: null,
      venue_lng: null,
      venue_capacity: null,
      price_type: "open",
      price_amount: null,
      price_currency: "EUR",
      price_range: null,
      url: null,
      source: "test",
      ai_context: null,
      schema_json: JSON.stringify({ "@type": "Event" }),
      created_at: "2025-10-01T12:00:00Z",
      updated_at: "2025-10-01T12:00:00Z",
      end_date: null
    };

    const event = rowToEvent(row);

    expect(event.fullDescription).toBe("A very long and detailed description...");
  });

  test("should preserve timestamps", () => {
    const row = {
      id: "test",
      title: "Test",
      description: "",
      start_date: "2025-11-15T20:00:00+03:00",
      type: "concert",
      genres: JSON.stringify([]),
      tags: JSON.stringify([]),
      venue_name: "Venue",
      venue_address: "Address",
      venue_neighborhood: null,
      venue_lat: null,
      venue_lng: null,
      venue_capacity: null,
      price_type: "open",
      price_amount: null,
      price_currency: "EUR",
      price_range: null,
      url: null,
      source: "test",
      ai_context: null,
      schema_json: JSON.stringify({ "@type": "Event" }),
      created_at: "2025-10-01T10:00:00Z",
      updated_at: "2025-10-15T14:30:00Z",
      end_date: null,
      full_description: null
    };

    const event = rowToEvent(row);

    expect(event.createdAt).toBe("2025-10-01T10:00:00Z");
    expect(event.updatedAt).toBe("2025-10-15T14:30:00Z");
  });
});

describe("round-trip conversion", () => {
  test("should preserve data through eventToRow -> rowToEvent", () => {
    // Convert Event to row
    const row = eventToRow(sampleConcert);

    // Simulate database storage by creating a row object
    const dbRow = {
      id: row.$id,
      title: row.$title,
      description: row.$description,
      full_description: row.$full_description,
      start_date: row.$start_date,
      end_date: row.$end_date,
      type: row.$type,
      genres: row.$genres,
      tags: row.$tags,
      venue_name: row.$venue_name,
      venue_address: row.$venue_address,
      venue_neighborhood: row.$venue_neighborhood,
      venue_lat: row.$venue_lat,
      venue_lng: row.$venue_lng,
      venue_capacity: row.$venue_capacity,
      price_type: row.$price_type,
      price_amount: row.$price_amount,
      price_currency: row.$price_currency,
      price_range: row.$price_range,
      url: row.$url,
      source: row.$source,
      ai_context: row.$ai_context,
      schema_json: row.$schema_json,
      created_at: row.$created_at,
      updated_at: row.$updated_at
    };

    // Convert back to Event
    const event = rowToEvent(dbRow);

    // Verify key fields preserved
    expect(event.id).toBe(sampleConcert.id);
    expect(event.title).toBe(sampleConcert.title);
    expect(event.description).toBe(sampleConcert.description);
    expect(event.type).toBe(sampleConcert.type);
    expect(event.genres).toEqual(sampleConcert.genres);
    expect(event.tags).toEqual(sampleConcert.tags);
    expect(event.venue.name).toBe(sampleConcert.venue.name);
    expect(event.price.type).toBe(sampleConcert.price.type);
    expect(event.price.amount).toBe(sampleConcert.price.amount);
  });
});
