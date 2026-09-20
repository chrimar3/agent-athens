// D1: category pages (config/categories.json) filter with genresInclude,
// which historically consulted only the scraper-era `genres` column. The
// enrichment taxonomy lives in `tags`; the category filter must see both,
// or category pages under-render (e.g. /category/jazz showed 2 of 29
// upcoming jazz events).
import { describe, test, expect } from "bun:test";
import { filterEventsByCategory, type CategoryConfig } from "../category-page";
import type { Event } from "../../types";

function makeEvent(overrides: Partial<Event>): Event {
  return {
    "@context": "https://schema.org",
    "@type": "MusicEvent",
    id: "category-filter-fixture",
    title: "Category Test Event",
    description: "An event",
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

const jazzCategory: CategoryConfig = {
  slug: "jazz",
  title: "Jazz στην Αθήνα",
  titleEn: "Jazz in Athens",
  description: "test",
  filter: { types: ["concert", "festival"], genresInclude: ["jazz", "blues", "soul"] },
  icon: "🎷",
};

describe("D1: filterEventsByCategory consults tags as well as genres", () => {
  test("still matches lowercase scraper genres (existing behavior)", () => {
    const event = makeEvent({ genres: ["jazz"], tags: [] });
    expect(filterEventsByCategory([event], jazzCategory).length).toBe(1);
  });

  test("retains genre substring matching while requiring exact tag tokens", () => {
    const events = [
      makeEvent({ id: "scraper", genres: ["Acid Jazz"] }),
      makeEvent({ id: "enriched", tags: ["Acid-jazz"] }),
    ];
    expect(filterEventsByCategory(events, jazzCategory).map(event => event.id)).toEqual(["scraper"]);
  });

  test("normalizes whitespace and underscores for multi-word tag matching", () => {
    const event = makeEvent({ tags: ["  Drum__and Bass  "] });
    const category = { ...jazzCategory, filter: { genresInclude: ["  Drum-and-Bass  "] } };
    expect(filterEventsByCategory([event], category)).toEqual([event]);
  });

  test("matches enrichment tags when genres is empty", () => {
    const event = makeEvent({ genres: [], tags: ["Jazz", "Intimate"] });
    expect(event.genres.length).toBe(0); // precondition: genres carries nothing
    expect(filterEventsByCategory([event], jazzCategory).length).toBe(1);
  });

  test("type constraint still applies with tag-based genre match", () => {
    const event = makeEvent({ type: "theater", genres: [], tags: ["Jazz"] });
    expect(filterEventsByCategory([event], jazzCategory).length).toBe(0);
  });

  test("events with no genre signal anywhere do not match", () => {
    const event = makeEvent({ genres: [], tags: ["Intimate", "Seated"] });
    expect(filterEventsByCategory([event], jazzCategory).length).toBe(0);
  });
});
