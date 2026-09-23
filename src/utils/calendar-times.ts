import type { Event } from "../types";
import { DateTime } from "luxon";

export interface DateParts {
  Y: number;
  M: number;
  D: number;
  H: number;
  Mi: number;
  S: number;
}

export function pad(n: number): string {
  return (n < 10 ? "0" : "") + n;
}

export function parseIsoLocal(iso: string | undefined | null): DateParts | null {
  if (!iso) return null;
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?)?$/);
  if (!match) return null;
  const parts = { Y: +match[1], M: +match[2], D: +match[3], H: match[4] === undefined ? 23 : +match[4], Mi: match[5] === undefined ? 59 : +match[5], S: +(match[6] || 0) };
  return asAthensDate(parts).isValid ? parts : null;
}

function asAthensDate(p: DateParts): DateTime {
  return DateTime.fromObject({ year: p.Y, month: p.M, day: p.D, hour: p.H, minute: p.Mi, second: p.S }, { zone: "Europe/Athens" });
}

function fromDateTime(d: DateTime): DateParts {
  return { Y: d.year, M: d.month, D: d.day, H: d.hour, Mi: d.minute, S: d.second };
}

export function formatICS(p: DateParts): string {
  return `${p.Y}${pad(p.M)}${pad(p.D)}T${pad(p.H)}${pad(p.Mi)}${pad(p.S)}`;
}

export function addHours(p: DateParts, hours: number): DateParts {
  return fromDateTime(asAthensDate(p).plus({ hours }));
}

export interface ResolvedTimes {
  start: DateParts;
  end: DateParts;
  /** True when the event has no real clock time (date-only startDate, no
   *  timePeak). Builders must emit all-day entries — the 23:59 sentinel from
   *  parseIsoLocal is a parse default, not a showtime, and putting it in a
   *  calendar reads as a fabricated time. */
  allDay: boolean;
}

export function resolveEventTimes(event: Event): ResolvedTimes | null {
  const startParts = parseIsoLocal(event.startDate);
  if (!startParts) return null;

  const hasClockTime = /T\d{2}:\d{2}/.test(event.startDate)
    || Boolean(event.timePeak && /^\d{2}:\d{2}$/.test(event.timePeak));

  if (event.timePeak && /^\d{2}:\d{2}$/.test(event.timePeak)) {
    const pm = event.timePeak.match(/^(\d{2}):(\d{2})$/)!;
    startParts.H = +pm[1];
    startParts.Mi = +pm[2];
    startParts.S = 0;
    if (!asAthensDate(startParts).isValid) return null;
  }

  let endParts: DateParts;
  if (event.endDate) {
    const parsedEnd = parseIsoLocal(event.endDate);
    if (!parsedEnd || asAthensDate(parsedEnd) < asAthensDate(startParts)) return null;
    endParts = parsedEnd;
  } else {
    endParts = addHours(startParts, 3);
  }

  return { start: startParts, end: endParts, allDay: !hasClockTime };
}

// RFC 5545 §3.3.11 — escape order matters: backslash MUST come first
function escIcs(s: string | undefined): string {
  if (!s) return "";
  return String(s)
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

// RFC 5545 §3.1 line folding at 75 octets, multi-byte UTF-8 safe
function foldLine(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const decoder = new TextDecoder();
  let out = "";
  let start = 0;
  while (start < bytes.length) {
    let end = Math.min(start + (start === 0 ? 75 : 74), bytes.length);
    // Don't split inside a UTF-8 multi-byte sequence
    while (end > start && end < bytes.length && (bytes[end] & 0xc0) === 0x80) {
      end--;
    }
    const chunk = decoder.decode(bytes.slice(start, end));
    out += (start === 0 ? "" : "\r\n ") + chunk;
    start = end;
  }
  return out;
}

function nowUtcStamp(): string {
  const d = new Date();
  return (
    d.getUTCFullYear() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    "T" +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    "Z"
  );
}

// RFC 5545 §3.6.5: every TZID a calendar references must be defined in it.
// EU rule since 1996: EEST from the last Sunday of March 01:00 UTC (03:00 EET)
// to the last Sunday of October 01:00 UTC (04:00 EEST).
const ATHENS_VTIMEZONE = [
  "BEGIN:VTIMEZONE",
  "TZID:Europe/Athens",
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:+0200",
  "TZOFFSETTO:+0300",
  "TZNAME:EEST",
  "DTSTART:19970330T030000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:+0300",
  "TZOFFSETTO:+0200",
  "TZNAME:EET",
  "DTSTART:19971026T040000",
  "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
];

export function generateIcs(event: Event, canonicalUrl: string): string {
  const times = resolveEventTimes(event);
  if (!times) return "";
  const { start, end } = times;

  const venueName = event.venue?.name ?? "";
  const address = event.venue?.address ?? "";
  const loc = [venueName, address].filter(Boolean).join(", ");
  const uid = (event.id || "event") + "@agentathens.com";

  // RFC 5545: DATE ranges have an exclusive end, including exhibitions.
  const exhibitionRange = event.type === "exhibition" && /^\d{4}-\d{2}-\d{2}$/.test(event.endDate ?? "");
  const dtLines = times.allDay || exhibitionRange
    ? [
        "DTSTART;VALUE=DATE:" + formatDateOnly(start),
        "DTEND;VALUE=DATE:" + formatDateOnly(addOneDay(event.endDate ? end : start)),
      ]
    : [
        "DTSTART;TZID=Europe/Athens:" + formatICS(start),
        // No DTEND without a real end: RFC 5545 §3.6.1 reads a DATE-TIME start
        // with no end as ending at the start. The +3h in resolveEventTimes is a
        // display default for calendar deeplinks, not a fact to export.
        // A later-day end on a timed event is the run's end, not this
        // performance's — exporting it makes a multi-week calendar block.
        ...(event.endDate && event.endDate.slice(0, 10) === event.startDate.slice(0, 10)
          ? ["DTEND;TZID=Europe/Athens:" + formatICS(end)] : []),
      ];
  const usesTzid = dtLines.some(l => l.includes("TZID=Europe/Athens"));

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Agent Athens//agentathens.com//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    ...(usesTzid ? ATHENS_VTIMEZONE : []),
    "BEGIN:VEVENT",
    foldLine("UID:" + escIcs(uid)),
    "DTSTAMP:" + nowUtcStamp(),
    ...dtLines,
    foldLine("SUMMARY:" + escIcs(event.title)),
    foldLine("LOCATION:" + escIcs(loc)),
    foldLine("DESCRIPTION:" + escIcs(event.title) + "\\n" + escIcs(canonicalUrl)),
    foldLine("URL:" + canonicalUrl.replace(/[\r\n]/g, "")),
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  return lines.join("\r\n") + "\r\n";
}

// Convert Athens-local DateParts → UTC YYYYMMDDTHHMMSSZ (GCal `dates=` param format for timed events)
function athensPartsToUtcBasic(p: DateParts): string {
  return asAthensDate(p).toUTC().toFormat("yyyyMMdd'T'HHmmss'Z'");
}

// Add 1 day to a date-only DateParts — used for GCal exhibition end-exclusive format
function addOneDay(p: DateParts): DateParts {
  return fromDateTime(asAthensDate(p).startOf('day').plus({ days: 1 }));
}

function formatDateOnly(p: DateParts): string {
  return `${p.Y}${pad(p.M)}${pad(p.D)}`;
}

// Athens DST-aware ISO-8601 string for a wall-clock DateParts.
// e.g. { Y:2026, M:6, D:15, H:20, Mi:0, S:0 } → "2026-06-15T20:00:00+03:00" (summer DST)
// Used by buildOutlookUrl — Outlook accepts offset-bearing ISO and converts client-side.
export function partsToAthensIso(p: DateParts): string {
  return asAthensDate(p).toISO({ suppressMilliseconds: true })!;
}

// Date-only ISO (YYYY-MM-DD) — used by buildOutlookUrl when allday=true (exhibitions).
export function partsToDateOnlyIso(p: DateParts): string {
  return `${p.Y}-${pad(p.M)}-${pad(p.D)}`;
}

/**
 * Build an Outlook "compose" deeplink URL for adding the event to the user's
 * Outlook calendar. Consumes resolveEventTimes — must NOT re-derive dates.
 *
 * Required URL invariants (asserted in action-bar.test.ts):
 *   - URL path contains "deeplink/compose" (Outlook's add-event endpoint)
 *   - Query carries: path=/calendar/action/compose, rru=addevent, subject, body, location
 *   - Timed events: startdt/enddt = ISO-8601 with Athens offset (use partsToAthensIso)
 *   - Exhibitions with date-only endDate: allday=true + startdt/enddt as YYYY-MM-DD (use partsToDateOnlyIso)
 *   - All text values URL-encoded with encodeURIComponent (RFC 3986 — %20 not +)
 *   - Greek characters MUST round-trip through new URL(url).searchParams.get('subject')
 *
 * DECISION POINT — endpoint base URL:
 *   The Outlook deeplink endpoint has two viable hosts:
 *     (a) https://outlook.live.com/calendar/0/deeplink/compose  — personal Outlook (consumer)
 *     (b) https://outlook.office.com/calendar/0/deeplink/compose — Microsoft 365 (business)
 *   Pick one based on your audience (the implementation goes in the function body below).
 */
export function buildOutlookUrl(event: Event, canonicalUrl: string): string {
  const times = resolveEventTimes(event);
  if (!times) return "";

  const isExhibitionRange =
    event.type === "exhibition" && /^\d{4}-\d{2}-\d{2}$/.test(event.endDate ?? "");
  // Date-only events (no showtime) are all-day too — see resolveEventTimes.allDay.
  const isAllDay = isExhibitionRange || times.allDay;
  const startdt = isAllDay
    ? partsToDateOnlyIso(times.start)
    : partsToAthensIso(times.start);
  const enddt = isExhibitionRange
    ? partsToDateOnlyIso(addOneDay(times.end))
    : isAllDay
      ? partsToDateOnlyIso(addOneDay(event.endDate ? times.end : times.start))
      : partsToAthensIso(times.end);

  const venueName = event.venue?.name ?? "";
  const address = event.venue?.address ?? "";
  const location = [venueName, address].filter(Boolean).join(", ");

  const enc = encodeURIComponent;
  let url =
    "https://outlook.live.com/calendar/0/deeplink/compose" +
    `?path=${enc("/calendar/action/compose")}` +
    `&rru=addevent` +
    `&startdt=${enc(startdt)}` +
    `&enddt=${enc(enddt)}` +
    `&subject=${enc(event.title)}` +
    `&body=${enc(canonicalUrl)}` +
    `&location=${enc(location)}`;
  if (isAllDay) url += `&allday=true`;
  return url;
}

export function buildGCalUrl(event: Event, canonicalUrl: string): string {
  const times = resolveEventTimes(event);
  if (!times) return "";
  const { start, end } = times;

  let datesParam: string;
  if (event.type === "exhibition" && event.endDate && /^\d{4}-\d{2}-\d{2}$/.test(event.endDate)) {
    // All-day exhibition: YYYYMMDD/YYYYMMDD end-EXCLUSIVE (GCal convention)
    const endExclusive = addOneDay(end);
    datesParam = `${formatDateOnly(start)}/${formatDateOnly(endExclusive)}`;
  } else if (times.allDay) {
    // Date-only event with no showtime: single all-day entry — never the
    // 23:59 parse sentinel dressed up as a start time.
    datesParam = `${formatDateOnly(start)}/${formatDateOnly(addOneDay(event.endDate ? end : start))}`;
  } else {
    // Timed event: UTC basic format on both ends
    datesParam = `${athensPartsToUtcBasic(start)}/${athensPartsToUtcBasic(end)}`;
  }

  const venueName = event.venue?.name ?? "";
  const address = event.venue?.address ?? "";
  const location = [venueName, address].filter(Boolean).join(", ");

  // Manual encodeURIComponent (RFC 3986 — %20 for spaces) rather than URLSearchParams
  // (form-encoding — + for spaces) to match RFC 3986 convention specified in the brief.
  const enc = encodeURIComponent;
  return (
    "https://calendar.google.com/calendar/render" +
    `?action=TEMPLATE` +
    `&text=${enc(event.title)}` +
    `&dates=${enc(datesParam)}` +
    `&details=${enc(canonicalUrl)}` +
    `&location=${enc(location)}`
  );
}
