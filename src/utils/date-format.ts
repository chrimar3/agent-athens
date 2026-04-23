/**
 * Date-string format classification and canonical normalization.
 *
 * Single source of truth for format branching. Used on both the write path
 * (normalizeDateField, applied at every INSERT seam) and the render path
 * (formatSchemaDate, emits Schema.org JSON-LD).
 *
 * Canonical on-disk format for events.start_date / events.end_date:
 *   - all-day events:  YYYY-MM-DD                  (date-only)
 *   - timed events:    YYYY-MM-DDTHH:MM:SS         (naive-ts, Europe/Athens implied)
 *
 * Never store tz-aware strings. DST offset is applied at render time only,
 * via formatSchemaDate() using getAthensTimezone().
 */

export type DateFormat = 'date-only' | 'naive-ts' | 'tz-aware' | 'malformed';

const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
// Optional fractional seconds (.sss) are accepted and stripped by normalizeDateField.
// JS Date.toISOString() produces YYYY-MM-DDTHH:MM:SS.sssZ; many inputs flow through.
const NAIVE_TS_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?$/;
const TZ_AWARE_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

function isValidCalendarDate(y: number, mo: number, d: number): boolean {
  if (mo < 1 || mo > 12) return false;
  if (d < 1 || d > 31) return false;
  const probe = new Date(y, mo - 1, d);
  return probe.getFullYear() === y && probe.getMonth() === mo - 1 && probe.getDate() === d;
}

function isValidTime(h: number, mi: number, s: number): boolean {
  return h >= 0 && h <= 23 && mi >= 0 && mi <= 59 && s >= 0 && s <= 59;
}

export function classifyDateFormat(raw: string): DateFormat {
  if (!raw || typeof raw !== 'string') return 'malformed';

  let m = raw.match(DATE_ONLY_RE);
  if (m) {
    return isValidCalendarDate(+m[1], +m[2], +m[3]) ? 'date-only' : 'malformed';
  }

  m = raw.match(NAIVE_TS_RE);
  if (m) {
    return isValidCalendarDate(+m[1], +m[2], +m[3]) && isValidTime(+m[4], +m[5], +m[6])
      ? 'naive-ts'
      : 'malformed';
  }

  m = raw.match(TZ_AWARE_RE);
  if (m) {
    return isValidCalendarDate(+m[1], +m[2], +m[3]) && isValidTime(+m[4], +m[5], +m[6])
      ? 'tz-aware'
      : 'malformed';
  }

  return 'malformed';
}

/**
 * Normalize a date string to canonical naive-local form.
 * - date-only passes through.
 * - naive-ts passes through.
 * - tz-aware has its suffix (Z or +-HH:MM) stripped; clock-time is preserved as Athens-local.
 * - malformed throws (fail loud — never silently pass bad data through the seam).
 */
export function normalizeDateField(raw: string): string {
  const fmt = classifyDateFormat(raw);
  switch (fmt) {
    case 'date-only':
      return raw;
    case 'naive-ts':
      // Strip any fractional seconds. First 19 chars are YYYY-MM-DDTHH:MM:SS.
      return raw.slice(0, 19);
    case 'tz-aware':
      // Strip fraction + offset suffix. First 19 chars are the naive-ts portion.
      return raw.slice(0, 19);
    case 'malformed':
      throw new Error(`normalizeDateField: malformed date string: ${JSON.stringify(raw)}`);
  }
}
