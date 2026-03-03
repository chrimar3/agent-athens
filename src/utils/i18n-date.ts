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
import { DateTime } from 'luxon';

const ATHENS_TIMEZONE = 'Europe/Athens';

const ENGLISH_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const ENGLISH_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * Format a date for display in the given locale.
 * Returns e.g. "Τρίτη 18 Νοεμβρίου" (el) or "Tuesday 18 November" (en)
 */
export function formatDateOnly(isoDate: string, locale: Locale): string {
  if (locale === 'el') return formatGreekDateOnly(isoDate);

  // Parse date directly from ISO string (same approach as Greek formatter)
  const dateMatch = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (dateMatch) {
    const [, year, month, day] = dateMatch;
    const dt = DateTime.fromObject(
      { year: parseInt(year), month: parseInt(month), day: parseInt(day) },
      { zone: ATHENS_TIMEZONE }
    );
    const dayIndex = dt.weekday === 7 ? 0 : dt.weekday;
    return `${ENGLISH_DAYS[dayIndex]} ${dt.day} ${ENGLISH_MONTHS[dt.month - 1]}`;
  }

  // Fallback
  const dt = DateTime.fromISO(isoDate).setZone(ATHENS_TIMEZONE);
  const dayIndex = dt.weekday === 7 ? 0 : dt.weekday;
  return `${ENGLISH_DAYS[dayIndex]} ${dt.day} ${ENGLISH_MONTHS[dt.month - 1]}`;
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
