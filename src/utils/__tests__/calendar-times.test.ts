import { describe, test, expect } from "bun:test";
import {
  parseIsoLocal,
  formatICS,
  addHours,
  resolveEventTimes,
  type DateParts,
} from "../calendar-times";
import type { Event } from "../../types";

function makeEvent(overrides: Partial<Event>): Event {
  return {
    "@context": "https://schema.org",
    "@type": "Event",
    id: "test-event-id",
    title: "Test Event",
    description: "test",
    hasNativeGreek: false,
    startDate: "2026-06-15T20:00:00",
    type: "concert",
    genres: [],
    tags: [],
    venue: { name: "Test Venue", address: "Test Address" },
    price: "open",
    ticketUrlResolved: null,
    source: "test",
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    language: "el",
    ...overrides,
  } as Event;
}

describe("parseIsoLocal", () => {
  test("parses full ISO datetime to parts", () => {
    expect(parseIsoLocal("2026-06-15T20:30:45")).toEqual({
      Y: 2026,
      M: 6,
      D: 15,
      H: 20,
      Mi: 30,
      S: 45,
    });
  });

  test("parses date-only as end-of-day (23:59:00) — exhibition end branch", () => {
    expect(parseIsoLocal("2026-09-30")).toEqual({
      Y: 2026,
      M: 9,
      D: 30,
      H: 23,
      Mi: 59,
      S: 0,
    });
  });

  test("returns null for invalid input", () => {
    expect(parseIsoLocal("")).toBeNull();
    expect(parseIsoLocal("not-a-date")).toBeNull();
    expect(parseIsoLocal(undefined as unknown as string)).toBeNull();
  });
});

describe("formatICS", () => {
  test("formats parts as YYYYMMDDTHHMMSS with zero-padding", () => {
    const p: DateParts = { Y: 2026, M: 3, D: 5, H: 9, Mi: 7, S: 2 };
    expect(formatICS(p)).toBe("20260305T090702");
  });

  test("handles double-digit components without extra padding", () => {
    const p: DateParts = { Y: 2026, M: 12, D: 31, H: 23, Mi: 59, S: 59 };
    expect(formatICS(p)).toBe("20261231T235959");
  });
});

describe("addHours", () => {
  test("adds hours within same day", () => {
    const p: DateParts = { Y: 2026, M: 6, D: 15, H: 20, Mi: 0, S: 0 };
    expect(addHours(p, 3)).toEqual({ Y: 2026, M: 6, D: 15, H: 23, Mi: 0, S: 0 });
  });

  test("rolls over to next day", () => {
    const p: DateParts = { Y: 2026, M: 6, D: 15, H: 23, Mi: 0, S: 0 };
    expect(addHours(p, 3)).toEqual({ Y: 2026, M: 6, D: 16, H: 2, Mi: 0, S: 0 });
  });

  test("rolls over month boundary", () => {
    const p: DateParts = { Y: 2026, M: 6, D: 30, H: 23, Mi: 0, S: 0 };
    expect(addHours(p, 3)).toEqual({ Y: 2026, M: 7, D: 1, H: 2, Mi: 0, S: 0 });
  });

  test("rolls over year boundary", () => {
    const p: DateParts = { Y: 2026, M: 12, D: 31, H: 23, Mi: 0, S: 0 };
    expect(addHours(p, 3)).toEqual({ Y: 2027, M: 1, D: 1, H: 2, Mi: 0, S: 0 });
  });
});

describe("resolveEventTimes", () => {
  test("non-exhibition event: end = start + 3h", () => {
    const event = makeEvent({
      type: "concert",
      startDate: "2026-06-15T20:00:00",
    });
    const { start, end } = resolveEventTimes(event)!;
    expect(start).toEqual({ Y: 2026, M: 6, D: 15, H: 20, Mi: 0, S: 0 });
    expect(end).toEqual({ Y: 2026, M: 6, D: 15, H: 23, Mi: 0, S: 0 });
  });

  test("timePeak override replaces startDate's time (HH:MM regex guard)", () => {
    const event = makeEvent({
      type: "concert",
      startDate: "2026-06-15T20:00:00",
      timePeak: "22:30",
    });
    const { start, end } = resolveEventTimes(event)!;
    expect(start).toEqual({ Y: 2026, M: 6, D: 15, H: 22, Mi: 30, S: 0 });
    // end is start + 3h, so 22:30 + 3h = 01:30 next day
    expect(end).toEqual({ Y: 2026, M: 6, D: 16, H: 1, Mi: 30, S: 0 });
  });

  test("timePeak that doesn't match HH:MM regex is ignored", () => {
    const event = makeEvent({
      type: "concert",
      startDate: "2026-06-15T20:00:00",
      timePeak: "evening",
    });
    const { start } = resolveEventTimes(event)!;
    expect(start).toEqual({ Y: 2026, M: 6, D: 15, H: 20, Mi: 0, S: 0 });
  });

  test("exhibition with date-only endDate: end = 23:59:00 of that date", () => {
    const event = makeEvent({
      type: "exhibition",
      startDate: "2026-06-01T10:00:00",
      endDate: "2026-09-30",
    });
    const { start, end } = resolveEventTimes(event)!;
    expect(start).toEqual({ Y: 2026, M: 6, D: 1, H: 10, Mi: 0, S: 0 });
    expect(end).toEqual({ Y: 2026, M: 9, D: 30, H: 23, Mi: 59, S: 0 });
  });

  test("exhibition with no endDate: fallback to start + 3h", () => {
    const event = makeEvent({
      type: "exhibition",
      startDate: "2026-06-01T10:00:00",
      endDate: undefined,
    });
    const { end } = resolveEventTimes(event)!;
    expect(end).toEqual({ Y: 2026, M: 6, D: 1, H: 13, Mi: 0, S: 0 });
  });

  test("exhibition with unparseable endDate: fallback to start + 3h", () => {
    const event = makeEvent({
      type: "exhibition",
      startDate: "2026-06-01T10:00:00",
      endDate: "garbage",
    });
    const { end } = resolveEventTimes(event)!;
    expect(end).toEqual({ Y: 2026, M: 6, D: 1, H: 13, Mi: 0, S: 0 });
  });

  test("non-exhibition with endDate set: still uses start + 3h (endDate ignored for non-exhibition)", () => {
    const event = makeEvent({
      type: "concert",
      startDate: "2026-06-15T20:00:00",
      endDate: "2026-06-15T23:30:00",
    });
    const { end } = resolveEventTimes(event)!;
    expect(end).toEqual({ Y: 2026, M: 6, D: 15, H: 23, Mi: 0, S: 0 });
  });

  test("invalid startDate returns null", () => {
    const event = makeEvent({ startDate: "garbage" });
    expect(resolveEventTimes(event)).toBeNull();
  });
});
