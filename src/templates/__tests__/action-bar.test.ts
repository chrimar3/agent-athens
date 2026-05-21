import { describe, test, expect } from "bun:test";
import {
  renderActionBarHtml,
  renderCardSaveButton,
  renderSavedEventsScript,
  renderSaveButtonScript,
  renderCardSaveScript,
  renderShareButtonScript,
  renderSavedPageScript,
  escapeAttr,
  CALENDAR_ICON,
} from "../action-bar";
import {
  generateIcs,
  buildGCalUrl,
  buildOutlookUrl,
  resolveEventTimes,
} from "../../utils/calendar-times";
import type { Event } from "../../types";

function makeCalEvent(overrides: Partial<Event>): Event {
  return {
    "@context": "https://schema.org",
    "@type": "Event",
    id: "evt-123",
    title: "Test Event",
    description: "desc",
    hasNativeGreek: false,
    startDate: "2026-06-15T20:00:00",
    type: "concert",
    genres: [],
    tags: [],
    venue: { name: "Test Venue", address: "Test Address 1" },
    price: "open",
    ticketUrlResolved: null,
    source: "test",
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    language: "el",
    ...overrides,
  } as Event;
}

const CANONICAL = "https://agentathens.com/events/test-event/";

describe("escapeAttr", () => {
  test("escapes quotes and angle brackets", () => {
    expect(escapeAttr('DJ "Night" <Athens>')).toBe('DJ &quot;Night&quot; &lt;Athens&gt;');
  });

  test("escapes ampersands", () => {
    expect(escapeAttr("Rock & Roll")).toBe("Rock &amp; Roll");
  });

  test("escapes single quotes", () => {
    expect(escapeAttr("It's showtime")).toBe("It&#39;s showtime");
  });
});

describe("renderActionBarHtml", () => {
  const html = renderActionBarHtml("evt-123", "evt-slug", "Jazz Night", "https://agentathens.com/events/evt-slug/", "el");

  test("renders save button with correct data attributes", () => {
    expect(html).toContain('data-event-id="evt-123"');
    expect(html).toContain('data-event-slug="evt-slug"');
    expect(html).toContain('data-event-title="Jazz Night"');
    expect(html).toContain('data-save-event');
  });

  test("renders share button with canonical URL", () => {
    expect(html).toContain('data-share-url="https://agentathens.com/events/evt-slug/"');
  });

  test("renders Greek labels by default", () => {
    expect(html).toContain("Αποθήκευση");
    expect(html).toContain("Κοινοποίηση");
  });

  test("renders English labels for en locale", () => {
    const enHtml = renderActionBarHtml("evt-123", "evt-slug", "Jazz Night", "https://agentathens.com/events/evt-slug/", "en");
    expect(enHtml).toContain("Save");
    expect(enHtml).toContain("Share");
  });

  test("has aria-pressed on save button", () => {
    expect(html).toContain('aria-pressed="false"');
  });

  test("escapes title with special characters", () => {
    const specialHtml = renderActionBarHtml("e1", "s1", 'DJ "Athens" Night', "https://example.com", "el");
    expect(specialHtml).toContain('data-event-title="DJ &quot;Athens&quot; Night"');
  });

  test("includes bookmark SVG icon", () => {
    expect(html).toContain('<svg width="20" height="20"');
    expect(html).toContain("M19 21l-7-5-7 5V5");
  });
});

describe("renderCardSaveButton", () => {
  const html = renderCardSaveButton("card-1", "card-slug", "Concert Title");

  test("renders with card-save-btn class", () => {
    expect(html).toContain('class="card-save-btn"');
  });

  test("has correct data attributes with bare slug (no /events/ prefix)", () => {
    expect(html).toContain('data-event-id="card-1"');
    expect(html).toContain('data-event-slug="card-slug"');
    expect(html).not.toContain('data-event-slug="/events/');
  });

  test("has aria-pressed and aria-label", () => {
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('aria-label="Save"');
  });

  test("uses 16px icon", () => {
    expect(html).toContain('width="16"');
    expect(html).toContain('height="16"');
    expect(html).toContain('class="card-save-btn__icon"');
  });
});

describe("renderSavedEventsScript", () => {
  const script = renderSavedEventsScript();

  test("is wrapped in script tags", () => {
    expect(script).toContain("<script>");
    expect(script).toContain("</script>");
  });

  test("defines window.__aaSaved namespace", () => {
    expect(script).toContain("window.__aaSaved");
  });

  test("uses correct localStorage key", () => {
    expect(script).toContain("agent-athens-saved");
  });

  test("enforces max 200 items", () => {
    expect(script).toContain("MAX = 200");
  });

  test("dispatches aa:saved-change custom event", () => {
    expect(script).toContain("aa:saved-change");
  });

  test("handles cross-tab sync via storage event", () => {
    expect(script).toContain("addEventListener('storage'");
  });

  test("wraps localStorage access in try/catch", () => {
    expect(script).toContain("try {");
    expect(script).toContain("catch(e)");
  });
});

describe("renderSaveButtonScript", () => {
  const script = renderSaveButtonScript();

  test("queries data-save-event buttons", () => {
    expect(script).toContain("[data-save-event]");
  });

  test("toggles is-saved class", () => {
    expect(script).toContain("is-saved");
  });

  test("updates aria-pressed attribute", () => {
    expect(script).toContain("aria-pressed");
  });

  test("guards against missing __aaSaved", () => {
    expect(script).toContain("if (!window.__aaSaved) return");
  });
});

describe("renderCardSaveScript", () => {
  const script = renderCardSaveScript();

  test("uses event delegation for card-save-btn clicks", () => {
    expect(script).toContain(".card-save-btn");
    expect(script).toContain("e.target.closest");
  });

  test("prevents card navigation with stopPropagation", () => {
    expect(script).toContain("stopPropagation");
  });

  test("prevents default action", () => {
    expect(script).toContain("preventDefault");
  });
});

describe("renderShareButtonScript", () => {
  const script = renderShareButtonScript();

  test("detects Web Share API", () => {
    expect(script).toContain("navigator.share");
  });

  test("falls back to clipboard API", () => {
    expect(script).toContain("navigator.clipboard");
  });

  test("falls back to execCommand copy", () => {
    expect(script).toContain("execCommand('copy')");
  });

  test("creates accessible toast with role=status", () => {
    expect(script).toContain("'role', 'status'");
    expect(script).toContain("'aria-live', 'polite'");
  });

  test("removes toast after 2 seconds", () => {
    expect(script).toContain("2000");
  });

  test("uses aa-toast class", () => {
    expect(script).toContain("aa-toast");
  });
});

describe("renderSavedPageScript", () => {
  test("renders Greek remove label for el locale", () => {
    const script = renderSavedPageScript("el");
    expect(script).toContain("Αφαίρεση");
  });

  test("renders English remove label for en locale", () => {
    const script = renderSavedPageScript("en");
    expect(script).toContain("Remove");
  });

  test("reads saved events list container", () => {
    const script = renderSavedPageScript("el");
    expect(script).toContain("saved-events-list");
  });

  test("handles empty state", () => {
    const script = renderSavedPageScript("el");
    expect(script).toContain("saved-empty");
  });

  test("uses safe DOM construction", () => {
    const script = renderSavedPageScript("el");
    expect(script).toContain("createElement");
    expect(script).toContain("textContent");
  });

  test("includes slug migration that strips /events/ prefix", () => {
    const script = renderSavedPageScript("el");
    expect(script).toContain("/events/");
    expect(script).toContain("migrate");
    // Handles both /events/ and /en/events/ prefixes
    expect(script).toContain("(en\\/)?events\\/");
  });

  test("migration is idempotent — only writes if entries changed", () => {
    const script = renderSavedPageScript("el");
    expect(script).toContain("if (changed)");
  });
});

describe("generateIcs — RFC 5545 invariants (migrated from IIFE-string asserts)", () => {
  test("emits envelope markers", () => {
    const ics = generateIcs(makeCalEvent({}), CANONICAL);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("END:VCALENDAR");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("END:VEVENT");
  });

  test("uses TZID=Europe/Athens for DTSTART and DTEND", () => {
    const ics = generateIcs(makeCalEvent({}), CANONICAL);
    expect(ics).toMatch(/DTSTART;TZID=Europe\/Athens:\d{8}T\d{6}/);
    expect(ics).toMatch(/DTEND;TZID=Europe\/Athens:\d{8}T\d{6}/);
  });

  test("UID uses event.id with @agentathens.com domain", () => {
    const ics = generateIcs(makeCalEvent({ id: "evt-abc-123" }), CANONICAL);
    expect(ics).toContain("UID:evt-abc-123@agentathens.com");
  });

  test("declares Agent Athens PRODID", () => {
    const ics = generateIcs(makeCalEvent({}), CANONICAL);
    expect(ics).toContain("PRODID:-//Agent Athens//agentathens.com//EN");
  });

  test("DTSTAMP is UTC basic format ending in Z", () => {
    const ics = generateIcs(makeCalEvent({}), CANONICAL);
    expect(ics).toMatch(/DTSTAMP:\d{8}T\d{6}Z/);
  });

  test("exhibition with date-only endDate: DTEND uses 23:59:00 of that date (TZID-local)", () => {
    const ics = generateIcs(
      makeCalEvent({
        type: "exhibition",
        startDate: "2026-06-01T10:00:00",
        endDate: "2026-09-30",
      }),
      CANONICAL,
    );
    expect(ics).toContain("DTEND;TZID=Europe/Athens:20260930T235900");
  });

  test("non-exhibition: DTEND falls back to start + 3h", () => {
    const ics = generateIcs(
      makeCalEvent({ type: "concert", startDate: "2026-06-15T20:00:00" }),
      CANONICAL,
    );
    expect(ics).toContain("DTSTART;TZID=Europe/Athens:20260615T200000");
    expect(ics).toContain("DTEND;TZID=Europe/Athens:20260615T230000");
  });

  test("timePeak overrides startDate's time component in DTSTART", () => {
    const ics = generateIcs(
      makeCalEvent({
        type: "concert",
        startDate: "2026-06-15T20:00:00",
        timePeak: "22:30",
      }),
      CANONICAL,
    );
    expect(ics).toContain("DTSTART;TZID=Europe/Athens:20260615T223000");
  });

  test("escapes RFC 5545 special chars in SUMMARY (backslash first, then ;,)", () => {
    const ics = generateIcs(
      makeCalEvent({ title: "Title; with, comma\\back" }),
      CANONICAL,
    );
    // \ → \\, ; → \;, , → \,
    expect(ics).toContain("SUMMARY:Title\\; with\\, comma\\\\back");
  });

  test("folds lines > 75 octets with CRLF + leading space", () => {
    const longTitle =
      "A" + "x".repeat(120); // 121 chars, > 75 octets for ASCII
    const ics = generateIcs(makeCalEvent({ title: longTitle }), CANONICAL);
    // Fold continuation is "\r\n " (CRLF + space) per RFC 5545 §3.1
    expect(ics).toMatch(/SUMMARY:Axxx[^\r\n]*\r\n /);
  });
});

describe("buildGCalUrl", () => {
  test("starts with calendar.google.com/calendar/render?action=TEMPLATE", () => {
    const url = buildGCalUrl(makeCalEvent({}), CANONICAL);
    expect(url).toMatch(/^https:\/\/calendar\.google\.com\/calendar\/render\?action=TEMPLATE/);
  });

  test("timed event: dates= uses UTC YYYYMMDDTHHMMSSZ/YYYYMMDDTHHMMSSZ", () => {
    // 2026-06-15T20:00:00 Athens (summer, +03:00) → 17:00:00 UTC start; +3h end → 20:00:00 UTC
    const url = buildGCalUrl(
      makeCalEvent({ type: "concert", startDate: "2026-06-15T20:00:00" }),
      CANONICAL,
    );
    expect(url).toContain("dates=20260615T170000Z%2F20260615T200000Z");
  });

  test("exhibition with date-only endDate: dates= uses YYYYMMDD/YYYYMMDD (end-EXCLUSIVE)", () => {
    // Exhibition Jun 1 → Sep 30 → GCal dates 20260601/20261001 (Oct 1 = day after, end-exclusive)
    const url = buildGCalUrl(
      makeCalEvent({
        type: "exhibition",
        startDate: "2026-06-01T10:00:00",
        endDate: "2026-09-30",
      }),
      CANONICAL,
    );
    expect(url).toContain("dates=20260601%2F20261001");
  });

  test("text param contains URL-encoded title", () => {
    const url = buildGCalUrl(makeCalEvent({ title: "Jazz & Soul" }), CANONICAL);
    expect(url).toContain("text=Jazz%20%26%20Soul");
  });

  test("location param contains URL-encoded venue name and address", () => {
    const url = buildGCalUrl(
      makeCalEvent({
        venue: { name: "Stegi Onassis", address: "Syngrou 107" },
      }),
      CANONICAL,
    );
    expect(url).toContain("location=Stegi%20Onassis%2C%20Syngrou%20107");
  });

  test("details param contains the canonical URL", () => {
    const url = buildGCalUrl(makeCalEvent({}), CANONICAL);
    expect(url).toContain(`details=${encodeURIComponent(CANONICAL)}`);
  });

  test("Greek title round-trips through URL encoding", () => {
    const greekTitle = "Στέγη Ιδρύματος Ωνάση";
    const url = buildGCalUrl(makeCalEvent({ title: greekTitle }), CANONICAL);
    // Should not contain raw Greek (URL must be ASCII-safe); should decode back
    const params = new URL(url).searchParams;
    expect(params.get("text")).toBe(greekTitle);
  });
});

describe("buildOutlookUrl", () => {
  test("URL path contains Outlook compose deeplink", () => {
    const url = buildOutlookUrl(makeCalEvent({}), CANONICAL);
    expect(url).toContain("deeplink/compose");
  });

  test("carries the standard compose query params", () => {
    const url = buildOutlookUrl(makeCalEvent({}), CANONICAL);
    expect(url).toContain("path=%2Fcalendar%2Faction%2Fcompose");
    expect(url).toContain("rru=addevent");
  });

  test("timed event: startdt/enddt are Athens-offset ISO-8601", () => {
    // 2026-06-15T20:00:00 Athens → +03:00 (summer DST)
    const url = buildOutlookUrl(
      makeCalEvent({ type: "concert", startDate: "2026-06-15T20:00:00" }),
      CANONICAL,
    );
    expect(url).toContain(`startdt=${encodeURIComponent("2026-06-15T20:00:00+03:00")}`);
    expect(url).toContain(`enddt=${encodeURIComponent("2026-06-15T23:00:00+03:00")}`);
  });

  test("winter event: startdt uses +02:00 offset (no DST)", () => {
    const url = buildOutlookUrl(
      makeCalEvent({ type: "concert", startDate: "2026-01-15T20:00:00" }),
      CANONICAL,
    );
    expect(url).toContain(`startdt=${encodeURIComponent("2026-01-15T20:00:00+02:00")}`);
  });

  test("exhibition with date-only endDate: allday=true and date-only startdt/enddt", () => {
    const url = buildOutlookUrl(
      makeCalEvent({
        type: "exhibition",
        startDate: "2026-06-01T10:00:00",
        endDate: "2026-09-30",
      }),
      CANONICAL,
    );
    expect(url).toContain("allday=true");
    expect(url).toContain("startdt=2026-06-01");
    expect(url).toContain("enddt=2026-09-30");
  });

  test("subject param contains URL-encoded title", () => {
    const url = buildOutlookUrl(makeCalEvent({ title: "Jazz & Soul" }), CANONICAL);
    expect(url).toContain("subject=Jazz%20%26%20Soul");
  });

  test("body param contains the canonical URL", () => {
    const url = buildOutlookUrl(makeCalEvent({}), CANONICAL);
    expect(url).toContain(`body=${encodeURIComponent(CANONICAL)}`);
  });

  test("location param contains venue name + address", () => {
    const url = buildOutlookUrl(
      makeCalEvent({ venue: { name: "Stegi Onassis", address: "Syngrou 107" } }),
      CANONICAL,
    );
    expect(url).toContain("location=Stegi%20Onassis%2C%20Syngrou%20107");
  });

  test("Greek subject round-trips through URL encoding", () => {
    const greekTitle = "Στέγη Ιδρύματος Ωνάση";
    const url = buildOutlookUrl(makeCalEvent({ title: greekTitle }), CANONICAL);
    const params = new URL(url).searchParams;
    expect(params.get("subject")).toBe(greekTitle);
  });
});

describe("date-agreement (anti-drift gate): all three calendar targets derive from resolveEventTimes", () => {
  test("timed event: ICS DTEND, GCal dates= end, and resolver agree on the same instant", () => {
    const event = makeCalEvent({
      type: "concert",
      startDate: "2026-06-15T20:00:00",
    });
    const resolved = resolveEventTimes(event)!;
    // Resolver: end 23:00:00 Athens local (start + 3h)
    expect(resolved.end).toEqual({ Y: 2026, M: 6, D: 15, H: 23, Mi: 0, S: 0 });

    const ics = generateIcs(event, CANONICAL);
    const gcal = buildGCalUrl(event, CANONICAL);
    const outlook = buildOutlookUrl(event, CANONICAL);

    // ICS keeps Athens TZID-local: 23:00:00
    expect(ics).toContain("DTEND;TZID=Europe/Athens:20260615T230000");
    // GCal converts to UTC: summer +03:00 → 20:00:00 UTC
    expect(gcal).toContain("T200000Z");
    // Outlook carries Athens offset directly: 23:00:00+03:00
    expect(outlook).toContain(encodeURIComponent("2026-06-15T23:00:00+03:00"));
  });

  test("exhibition with date-only end: all three targets derive from the same resolver end date", () => {
    const event = makeCalEvent({
      type: "exhibition",
      startDate: "2026-06-01T10:00:00",
      endDate: "2026-09-30",
    });
    const resolved = resolveEventTimes(event)!;
    // Resolver: end is 23:59:00 on Sep 30 (date-only → end of day)
    expect(resolved.end).toEqual({ Y: 2026, M: 9, D: 30, H: 23, Mi: 59, S: 0 });

    const ics = generateIcs(event, CANONICAL);
    const gcal = buildGCalUrl(event, CANONICAL);
    const outlook = buildOutlookUrl(event, CANONICAL);

    // ICS: 23:59 on resolver's end date
    expect(ics).toContain("DTEND;TZID=Europe/Athens:20260930T235900");
    // GCal: end-exclusive next day (Oct 1) — different format, same source date
    expect(gcal).toContain("20261001");
    // Outlook: allday=true with date-only end matching the source date (Sep 30, inclusive)
    expect(outlook).toContain("allday=true");
    expect(outlook).toContain("enddt=2026-09-30");
  });
});

describe("CALENDAR_ICON", () => {
  test("is a 20px SVG with calendar paths", () => {
    expect(CALENDAR_ICON).toContain('width="20"');
    expect(CALENDAR_ICON).toContain("<rect");
    expect(CALENDAR_ICON).toContain('aria-hidden="true"');
  });
});
