/**
 * Outcome 1 — a dead source must not look like a quiet week.
 *
 * For ~2 months clubber.gr served HTML where the iCal feed used to be:
 * `ical.split('BEGIN:VEVENT')` returned one element, the loop never ran, and
 * scrape_stats recorded success=1 / 0 events / no error — indistinguishable
 * from a genuinely empty week. These tests pin that a non-iCal body is a HARD,
 * diagnosable failure that propagates out of scrapeClubber (so the main loop
 * records success=0 with a usable error_message), while a valid-but-empty
 * calendar remains a quiet success.
 *
 * Synthetic fixtures only — no network. Each fixture asserts its own
 * precondition so it fails loudly if it ever stops exercising the rule.
 */
import { describe, test, expect } from "bun:test";
import { assertClubberFeedIsICal, scrapeClubber } from "../../scripts/scrape-all";

// ── Synthetic fixtures ────────────────────────────────────────────────────────
const HTML_BODY = `<!DOCTYPE html>
<html lang="el">
<head><title>Clubber.gr — Nightlife</title></head>
<body><h1>Events</h1><p>Welcome to clubber.gr</p></body>
</html>`;

const ICAL_BODY = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "PRODID:-//clubber.gr//events//EN",
  "BEGIN:VEVENT",
  "SUMMARY:Synthetic Test Night",
  "DTSTART:20990101T210000",
  "URL:https://www.clubber.gr/e/synthetic-test-night",
  "LOCATION:Synthetic Club",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

const EMPTY_ICAL_BODY = ["BEGIN:VCALENDAR", "VERSION:2.0", "END:VCALENDAR"].join("\r\n");

test("fixture preconditions: HTML fixture is not iCal; iCal fixtures are", () => {
  expect(HTML_BODY.includes("BEGIN:VCALENDAR")).toBe(false);
  expect(ICAL_BODY).toContain("BEGIN:VCALENDAR");
  expect(ICAL_BODY).toContain("BEGIN:VEVENT");
  expect(EMPTY_ICAL_BODY).toContain("BEGIN:VCALENDAR");
  expect(EMPTY_ICAL_BODY.includes("BEGIN:VEVENT")).toBe(false);
});

// ── The guard itself ─────────────────────────────────────────────────────────
describe("assertClubberFeedIsICal", () => {
  test("HTML body throws — an empty feed and a non-feed must be distinguishable", () => {
    expect(() => assertClubberFeedIsICal(HTML_BODY, "text/html; charset=utf-8")).toThrow();
  });

  test("error message is diagnosable: names the sentinel and the served content-type", () => {
    let message = "";
    try {
      assertClubberFeedIsICal(HTML_BODY, "text/html; charset=utf-8");
    } catch (e) {
      message = e instanceof Error ? e.message : String(e);
    }
    expect(message).toMatch(/BEGIN:VCALENDAR/);
    expect(message).toMatch(/text\/html/);
  });

  test("valid iCal body does not throw", () => {
    expect(() => assertClubberFeedIsICal(ICAL_BODY, "text/calendar; charset=utf-8")).not.toThrow();
  });

  test("valid iCal served with a wrong content-type still passes (body sentinel is authoritative)", () => {
    // A misconfigured-but-valid feed must not be rejected on the header alone.
    expect(() => assertClubberFeedIsICal(ICAL_BODY, "text/html")).not.toThrow();
  });

  test("empty-but-valid calendar does not throw — a quiet week stays a success", () => {
    expect(() => assertClubberFeedIsICal(EMPTY_ICAL_BODY, "text/calendar")).not.toThrow();
  });
});

// ── End to end through scrapeClubber (mocked fetch, no network) ──────────────
function fetchStub(body: string, init: ResponseInit): typeof fetch {
  return (async () => new Response(body, init)) as unknown as typeof fetch;
}

describe("scrapeClubber (injected fetch)", () => {
  test("HTML body rejects — the error PROPAGATES so scrape_stats records success=0", async () => {
    const fn = fetchStub(HTML_BODY, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
    await expect(scrapeClubber(fn)).rejects.toThrow(/BEGIN:VCALENDAR/);
  });

  test("HTTP error rejects — no longer swallowed into a fake success", async () => {
    const fn = fetchStub("Server Error", { status: 500, headers: { "content-type": "text/html" } });
    await expect(scrapeClubber(fn)).rejects.toThrow(/HTTP 500/);
  });

  test("valid iCal body resolves with parsed events", async () => {
    const fn = fetchStub(ICAL_BODY, { status: 200, headers: { "content-type": "text/calendar; charset=utf-8" } });
    const events = await scrapeClubber(fn);
    expect(events.length).toBe(1);
    expect(events[0].title).toBe("Synthetic Test Night");
    expect(events[0].start_date).toBe("2099-01-01");
    expect(events[0].venue_name).toBe("Synthetic Club");
    expect(events[0].source).toBe("clubber.gr");
  });

  test("valid but empty calendar resolves with 0 events (genuinely quiet week)", async () => {
    const fn = fetchStub(EMPTY_ICAL_BODY, { status: 200, headers: { "content-type": "text/calendar" } });
    const events = await scrapeClubber(fn);
    expect(events).toEqual([]);
  });
});
