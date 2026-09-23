/**
 * .ics export: VTIMEZONE for Europe/Athens and no invented DTEND.
 */
import { describe, test, expect } from "bun:test";
import { DateTime } from "luxon";
import { generateIcs } from "../calendar-times";
import type { Event } from "../../types";

const URL = "https://agentathens.com/events/x/";

function makeEvent(overrides: Partial<Event>): Event {
  return {
    "@context": "https://schema.org",
    "@type": "Event",
    id: "ics-fixture",
    title: "ICS Fixture",
    description: "d",
    hasNativeGreek: false,
    startDate: "2026-10-15T21:00:00",
    type: "concert",
    genres: [],
    tags: [],
    venue: { name: "Venue", address: "Addr 1" },
    price: { type: "with-ticket" },
    ticketUrlResolved: null,
    source: "test",
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    language: "el",
    ...overrides,
  } as Event;
}

function block(ics: string, name: string): string {
  const m = ics.match(new RegExp(`BEGIN:${name}\\r\\n([\\s\\S]*?)END:${name}`));
  if (!m) throw new Error(`no ${name} block`);
  return m[1];
}

describe("timed event without a known end", () => {
  const ics = generateIcs(makeEvent({ endDate: undefined }), URL);

  test("precondition: fixture is timed and has no endDate", () => {
    expect(ics).toContain("DTSTART;TZID=Europe/Athens:20261015T210000");
  });

  test("DTEND is omitted rather than invented", () => {
    expect(ics).not.toMatch(/^DTEND/m);
    expect(ics).not.toMatch(/^DURATION/m);
  });

  test("a VTIMEZONE for Europe/Athens precedes the VEVENT", () => {
    expect(ics).toContain("BEGIN:VTIMEZONE\r\nTZID:Europe/Athens\r\n");
    expect(ics.indexOf("BEGIN:VTIMEZONE")).toBeLessThan(ics.indexOf("BEGIN:VEVENT"));
    expect(ics).toContain("BEGIN:DAYLIGHT");
    expect(ics).toContain("BEGIN:STANDARD");
  });
});

describe("timed event with a real end", () => {
  test("DTEND is kept, in Athens local time", () => {
    const ics = generateIcs(makeEvent({ startDate: "2026-10-15T21:00:00", endDate: "2026-10-15T23:30:00" }), URL);
    expect(ics).toContain("DTEND;TZID=Europe/Athens:20261015T233000");
    expect(ics).toContain("BEGIN:VTIMEZONE");
  });
});

describe("date-only (all-day) semantics are unchanged", () => {
  test("date-only single day: VALUE=DATE start and exclusive next-day end, no VTIMEZONE needed", () => {
    const ics = generateIcs(makeEvent({ startDate: "2026-10-15", endDate: undefined }), URL);
    expect(ics).toContain("DTSTART;VALUE=DATE:20261015");
    expect(ics).toContain("DTEND;VALUE=DATE:20261016");
    expect(ics).not.toContain("TZID=");
  });

  test("exhibition with date-only endDate: exclusive end the day after", () => {
    const ics = generateIcs(makeEvent({ type: "exhibition", startDate: "2026-06-01T10:00:00", endDate: "2026-09-30" }), URL);
    expect(ics).toContain("DTEND;VALUE=DATE:20261001");
  });
});

/**
 * Check the VTIMEZONE's rules against the IANA database (via luxon) rather
 * than against a restatement of them: each observance's transition instant is
 * its DTSTART wall time at TZOFFSETFROM, recurring on the last Sunday of
 * BYMONTH. One minute before, Athens must be at TZOFFSETFROM; at the instant,
 * TZOFFSETTO.
 */
describe("VTIMEZONE rules match the tz database", () => {
  const ics = generateIcs(makeEvent({}), URL);
  const tz = block(ics, "VTIMEZONE");

  function parseOffset(v: string): number {
    const m = v.match(/^([+-])(\d{2})(\d{2})$/)!;
    return (m[1] === "-" ? -1 : 1) * (+m[2] * 60 + +m[3]);
  }

  for (const kind of ["DAYLIGHT", "STANDARD"]) {
    test(`${kind} transitions agree with luxon for 2026–2035`, () => {
      const obs = block(tz, kind);
      const from = parseOffset(obs.match(/TZOFFSETFROM:(\S+)/)![1]);
      const to = parseOffset(obs.match(/TZOFFSETTO:(\S+)/)![1]);
      const [, hh, mm] = obs.match(/DTSTART:\d{8}T(\d{2})(\d{2})\d{2}/)!;
      const rrule = obs.match(/RRULE:(\S+)/)![1];
      expect(rrule).toContain("FREQ=YEARLY");
      expect(rrule).toContain("BYDAY=-1SU");
      const month = +rrule.match(/BYMONTH=(\d+)/)![1];

      for (let year = 2026; year <= 2035; year++) {
        const lastDay = DateTime.utc(year, month, 1).endOf("month");
        const lastSunday = lastDay.minus({ days: lastDay.weekday % 7 });
        const instant = DateTime.utc(year, month, lastSunday.day, +hh, +mm).minus({ minutes: from });
        const before = instant.minus({ minutes: 1 }).setZone("Europe/Athens").offset;
        const at = instant.setZone("Europe/Athens").offset;
        expect({ year, before }).toEqual({ year, before: from });
        expect({ year, at }).toEqual({ year, at: to });
      }
    });
  }
});

describe('a performance in a run does not export the run\'s end', () => {
  test('timed start with a later-day end (the run) → no DTEND (real row: 20260811T2100 → 20260829T2359)', async () => {
    const { generateIcs } = await import('../calendar-times');
    const { sampleConcert } = await import('../../../tests/fixtures/events');
    const ics = generateIcs({ ...sampleConcert, type: 'theater', startDate: '2026-08-11T21:00:00', endDate: '2026-08-29T23:59:00' } as any, 'https://agentathens.com/events/x/');
    expect(ics).toContain('DTSTART;TZID=Europe/Athens:20260811T210000');
    expect(ics).not.toContain('DTEND');
  });

  test('a same-day end is kept', async () => {
    const { generateIcs } = await import('../calendar-times');
    const { sampleConcert } = await import('../../../tests/fixtures/events');
    const ics = generateIcs({ ...sampleConcert, startDate: '2026-08-11T21:00:00', endDate: '2026-08-11T23:30:00' } as any, 'https://agentathens.com/events/x/');
    expect(ics).toContain('DTEND;TZID=Europe/Athens:20260811T233000');
  });
});
