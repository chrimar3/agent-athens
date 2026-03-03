// Custom assertions for testing events and Schema.org data
import { expect } from "bun:test";
import type { Event, RawEvent } from "../../src/types";

/**
 * Assert that an object is a valid Event according to Schema.org
 */
export function assertValidEvent(event: any): void {
  expect(event).toBeDefined();
  expect(event["@context"]).toBe("https://schema.org");
  expect(event["@type"]).toMatch(/Event$/); // Ends with "Event"
  expect(event.id).toBeTruthy();
  expect(event.title).toBeTruthy();
  expect(event.startDate).toBeTruthy();
  expect(event.type).toBeTruthy();
  expect(event.venue).toBeDefined();
  expect(event.venue.name).toBeTruthy();
  expect(event.price).toBeDefined();
  expect(event.source).toBeTruthy();
}

/**
 * Assert that an object is a valid RawEvent (parser output)
 */
export function assertValidRawEvent(rawEvent: any): void {
  expect(rawEvent).toBeDefined();
  expect(rawEvent.title).toBeTruthy();
  expect(rawEvent.date).toMatch(/^\d{4}-\d{2}-\d{2}$/); // YYYY-MM-DD
  expect(rawEvent.venue).toBeTruthy();
  expect(rawEvent.location).toBeTruthy();
  expect(rawEvent.type).toBeTruthy();
  expect(rawEvent.price).toMatch(/^(open|with-ticket)$/);
  expect(rawEvent.source).toBeTruthy();
}

/**
 * Assert that a date string is valid ISO 8601
 */
export function assertValidISO8601(dateString: string): void {
  const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/;
  expect(dateString).toMatch(isoRegex);

  // Should be parseable as a date
  const date = new Date(dateString);
  expect(date.toString()).not.toBe("Invalid Date");
}

/**
 * Assert that venue has required coordinates
 */
export function assertValidVenue(venue: any): void {
  expect(venue).toBeDefined();
  expect(venue.name).toBeTruthy();
  expect(venue.address).toBeTruthy();

  if (venue.coordinates) {
    expect(venue.coordinates.lat).toBeGreaterThan(37.8); // Athens lat range
    expect(venue.coordinates.lat).toBeLessThan(38.1);
    expect(venue.coordinates.lon).toBeGreaterThan(23.6); // Athens lon range
    expect(venue.coordinates.lon).toBeLessThan(23.8);
  }
}

/**
 * Assert that price is valid
 */
export function assertValidPrice(price: any): void {
  expect(price).toBeDefined();
  expect(price.type).toMatch(/^(open|with-ticket|donation)$/);

  if (price.type === "with-ticket") {
    expect(price.currency).toBe("EUR");
    // Amount or range should be present
    expect(price.amount || price.range).toBeTruthy();
  }
}

/**
 * Assert that event type is valid
 */
export function assertValidEventType(type: string): void {
  const validTypes = ["concert", "exhibition", "cinema", "theater", "performance", "workshop", "other"];
  expect(validTypes).toContain(type);
}

/**
 * Assert that Schema.org JSON-LD is valid
 */
export function assertValidSchemaOrg(schemaJSON: any): void {
  expect(schemaJSON).toBeDefined();
  expect(schemaJSON["@context"]).toBe("https://schema.org");
  expect(schemaJSON["@type"]).toBeTruthy();

  // Required Schema.org Event properties
  expect(schemaJSON.name || schemaJSON.title).toBeTruthy();
  expect(schemaJSON.startDate).toBeTruthy();
  expect(schemaJSON.location || schemaJSON.venue).toBeTruthy();
}

/**
 * Assert event is in Athens
 */
export function assertAthensEvent(event: Event | RawEvent): void {
  const location = 'location' in event ? event.location : event.venue.address;
  const lowerLocation = location.toLowerCase();

  const hasAthens = lowerLocation.includes("athens") ||
                   lowerLocation.includes("αθηνα") ||
                   lowerLocation.includes("αθήνα");

  const venueCoords = typeof event.venue === 'object' ? event.venue?.coordinates?.lat : undefined;
  expect(hasAthens || venueCoords).toBeTruthy();
}

/**
 * Assert that events are sorted by date
 */
export function assertSortedByDate(events: Event[]): void {
  for (let i = 1; i < events.length; i++) {
    const prevDate = new Date(events[i - 1].startDate);
    const currDate = new Date(events[i].startDate);
    expect(currDate.getTime()).toBeGreaterThanOrEqual(prevDate.getTime());
  }
}

/**
 * Assert that event count matches expected
 */
export function assertEventCount(actual: number, expected: number, message?: string): void {
  expect(actual).toBe(expected);
}

/**
 * Assert that no duplicates exist in event array
 */
export function assertNoDuplicates(events: Event[]): void {
  const ids = events.map(e => e.id);
  const uniqueIds = new Set(ids);
  expect(uniqueIds.size).toBe(ids.length);
}

/**
 * Assert event has AI-generated description
 */
export function assertHasAIDescription(event: Event): void {
  expect(event.fullDescription).toBeTruthy();
  expect(event.fullDescription!.length).toBeGreaterThan(200); // Should be substantial

  // Check word count (~400 words)
  const wordCount = event.fullDescription!.split(/\s+/).length;
  expect(wordCount).toBeGreaterThan(300);
  expect(wordCount).toBeLessThan(500);
}
