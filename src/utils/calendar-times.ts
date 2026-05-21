import type { Event } from "../types";
import { getAthensTimezone } from "../enrichment/quality-gates";

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
  const full = iso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
  if (full) {
    return { Y: +full[1], M: +full[2], D: +full[3], H: +full[4], Mi: +full[5], S: +full[6] };
  }
  const dateOnly = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) {
    return { Y: +dateOnly[1], M: +dateOnly[2], D: +dateOnly[3], H: 23, Mi: 59, S: 0 };
  }
  return null;
}

export function formatICS(p: DateParts): string {
  return `${p.Y}${pad(p.M)}${pad(p.D)}T${pad(p.H)}${pad(p.Mi)}${pad(p.S)}`;
}

export function addHours(p: DateParts, hours: number): DateParts {
  const d = new Date(p.Y, p.M - 1, p.D, p.H + hours, p.Mi, p.S);
  return {
    Y: d.getFullYear(),
    M: d.getMonth() + 1,
    D: d.getDate(),
    H: d.getHours(),
    Mi: d.getMinutes(),
    S: d.getSeconds(),
  };
}

export interface ResolvedTimes {
  start: DateParts;
  end: DateParts;
}

export function resolveEventTimes(event: Event): ResolvedTimes | null {
  const startParts = parseIsoLocal(event.startDate);
  if (!startParts) return null;

  if (event.timePeak && /^\d{2}:\d{2}$/.test(event.timePeak)) {
    const pm = event.timePeak.match(/^(\d{2}):(\d{2})$/)!;
    startParts.H = +pm[1];
    startParts.Mi = +pm[2];
    startParts.S = 0;
  }

  let endParts: DateParts;
  if (event.type === "exhibition" && event.endDate) {
    endParts = parseIsoLocal(event.endDate) || addHours(startParts, 3);
  } else {
    endParts = addHours(startParts, 3);
  }

  return { start: startParts, end: endParts };
}

// RFC 5545 §3.3.11 — escape order matters: backslash MUST come first
function escIcs(s: string | undefined): string {
  if (!s) return "";
  return String(s)
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

// RFC 5545 §3.1 line folding at 75 octets, multi-byte UTF-8 safe
function foldLine(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const decoder = new TextDecoder();
  let out = "";
  let start = 0;
  while (start < bytes.length) {
    let end = Math.min(start + 75, bytes.length);
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

export function generateIcs(event: Event, canonicalUrl: string): string {
  const times = resolveEventTimes(event);
  if (!times) return "";
  const { start, end } = times;

  const venueName = event.venue?.name ?? "";
  const address = event.venue?.address ?? "";
  const loc = [venueName, address].filter(Boolean).join(", ");
  const uid = (event.id || "event") + "@agentathens.com";

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Agent Athens//agentathens.com//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    foldLine("UID:" + uid),
    "DTSTAMP:" + nowUtcStamp(),
    "DTSTART;TZID=Europe/Athens:" + formatICS(start),
    "DTEND;TZID=Europe/Athens:" + formatICS(end),
    foldLine("SUMMARY:" + escIcs(event.title)),
    foldLine("LOCATION:" + escIcs(loc)),
    foldLine("DESCRIPTION:" + escIcs(event.title) + "\\n" + escIcs(canonicalUrl)),
    foldLine("URL:" + canonicalUrl),
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  return lines.join("\r\n") + "\r\n";
}

// Convert Athens-local DateParts → UTC YYYYMMDDTHHMMSSZ (GCal `dates=` param format for timed events)
function athensPartsToUtcBasic(p: DateParts): string {
  // Construct an Athens-local Date by using the offset string.
  // We need a Date that represents "p in Europe/Athens" — to do that without TZ libs,
  // build the wall-clock ISO with the correct DST-aware Athens offset.
  const tentative = new Date(p.Y, p.M - 1, p.D, p.H, p.Mi, p.S);
  const offset = getAthensTimezone(tentative); // e.g. "+03:00"
  const sign = offset[0] === "+" ? 1 : -1;
  const oh = parseInt(offset.slice(1, 3), 10);
  const om = parseInt(offset.slice(4, 6), 10);
  const offsetMinutes = sign * (oh * 60 + om);

  // UTC = local - offset
  const utcMs = Date.UTC(p.Y, p.M - 1, p.D, p.H, p.Mi, p.S) - offsetMinutes * 60_000;
  const d = new Date(utcMs);
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

// Add 1 day to a date-only DateParts — used for GCal exhibition end-exclusive format
function addOneDay(p: DateParts): DateParts {
  const d = new Date(p.Y, p.M - 1, p.D + 1);
  return {
    Y: d.getFullYear(),
    M: d.getMonth() + 1,
    D: d.getDate(),
    H: 0,
    Mi: 0,
    S: 0,
  };
}

function formatDateOnly(p: DateParts): string {
  return `${p.Y}${pad(p.M)}${pad(p.D)}`;
}

// Athens DST-aware ISO-8601 string for a wall-clock DateParts.
// e.g. { Y:2026, M:6, D:15, H:20, Mi:0, S:0 } → "2026-06-15T20:00:00+03:00" (summer DST)
// Used by buildOutlookUrl — Outlook accepts offset-bearing ISO and converts client-side.
export function partsToAthensIso(p: DateParts): string {
  const localDate = new Date(p.Y, p.M - 1, p.D, p.H, p.Mi, p.S);
  const offset = getAthensTimezone(localDate);
  return (
    `${p.Y}-${pad(p.M)}-${pad(p.D)}T${pad(p.H)}:${pad(p.Mi)}:${pad(p.S)}${offset}`
  );
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

  const isAllDay =
    event.type === "exhibition" && /^\d{4}-\d{2}-\d{2}$/.test(event.endDate ?? "");
  const startdt = isAllDay
    ? partsToDateOnlyIso(times.start)
    : partsToAthensIso(times.start);
  const enddt = isAllDay
    ? partsToDateOnlyIso(times.end)
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
