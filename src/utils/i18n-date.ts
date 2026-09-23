/**
 * Locale-aware date and price formatting
 *
 * Delegates to existing Greek formatters for el, provides English
 * equivalents for en. Follows the same ISO-string parsing approach
 * as formatGreekDateOnly() to avoid timezone conversion issues.
 */

import type { Locale } from '../i18n/strings';
import { STRINGS } from '../i18n/strings';
import type { Event } from '../types';
import { formatGreekDateOnly, formatPriceGreek } from './i18n';
import { formatExhibitionDateRange } from './filters';
import { DateTime } from 'luxon';
import { ATHENS_TZ, ENGLISH_DAYS, ENGLISH_MONTHS, ENGLISH_MONTHS_SHORT, parseISODate, toAthensDateTime, weekdayIndex } from './format-date';

/**
 * Format a date for display in the given locale.
 * Returns e.g. "Τρίτη 18 Νοεμβρίου" (el) or "Tuesday 18 November 2026" (en).
 * English carries the year: /en/ readers are planning trips months out and
 * every baseline cold-tourist judge flagged the missing year as a trust gap.
 */
export function formatDateOnly(isoDate: string, locale: Locale): string {
  if (locale === 'el') return formatGreekDateOnly(isoDate);

  const parts = parseISODate(isoDate);
  if (parts) {
    const dt = toAthensDateTime(parts);
    return `${ENGLISH_DAYS[weekdayIndex(dt.weekday)]} ${dt.day} ${ENGLISH_MONTHS[dt.month - 1]} ${dt.year}`;
  }

  // Fallback
  const dt = DateTime.fromISO(isoDate).setZone(ATHENS_TZ);
  return `${ENGLISH_DAYS[weekdayIndex(dt.weekday)]} ${dt.day} ${ENGLISH_MONTHS[dt.month - 1]} ${dt.year}`;
}

/**
 * Start–end range for cards, e.g. "1 Sep - 1 Nov" / "1 Sep - Ongoing".
 * Greek delegates to formatExhibitionDateRange (output unchanged). English is
 * day-first like formatDateOnly and reads the Athens wall-clock date parts
 * directly, so the host timezone cannot shift a day.
 */
export function formatDateRange(event: Event, locale: Locale): string {
  if (locale === 'el') return formatExhibitionDateRange(event);

  const short = (iso: string): { text: string; year: number } | null => {
    const p = parseISODate(iso);
    if (!p) return null;
    const dt = toAthensDateTime(p);
    return { text: `${dt.day} ${ENGLISH_MONTHS_SHORT[dt.month - 1]}`, year: dt.year };
  };
  const start = short(event.startDate);
  if (!start) return '';
  // Non-exhibitions show only the start (mirrors formatExhibitionDateRange).
  if (event.type !== 'exhibition') return start.text;
  const end = event.endDate ? short(event.endDate) : null;
  if (!end) return `${start.text} - ${STRINGS.en.ongoing}`;

  const thisYear = DateTime.now().setZone(ATHENS_TZ).year;
  if (start.year !== end.year) return `${start.text} ${start.year} - ${end.text} ${end.year}`;
  if (end.year > thisYear) return `${start.text} - ${end.text} ${end.year}`;
  return `${start.text} - ${end.text}`;
}

/**
 * Format price for display in the given locale.
 */
export function formatPrice(event: Event, locale: Locale): string {
  if (locale === 'el') return formatPriceGreek(event);

  const t = STRINGS.en;

  if (event.price.type === 'open') return t.freeEntry;
  if (event.price.type === 'donation') return t.freeDonation;

  if (event.price.amount && event.price.amount > 0) {
    return `€${event.price.amount}`;
  }

  if (event.price.range) {
    if (event.price.range === 'Δωρεάν') return t.freeEntry;
    // If range contains €, it's already formatted
    if (event.price.range.includes('€')) return event.price.range;
    return event.price.range;
  }

  return t.ticketed;
}
