// Event filtering logic

import type { Event, Filters, TimeRange, PriceFilter } from '../types';
import { DateTime } from 'luxon';
import { ATHENS_TZ } from './format-date';
import { resolveEffectiveEnd } from './event-lifecycle';
import { classifyDateFormat } from './date-format';

export function filterEvents(events: Event[], filters: Filters): Event[] {
  const timeWindow = filters.time ? buildDateWindow(filters.time) : null;
  return events.filter(event => {
    // Type filter
    if (filters.type && event.type !== filters.type) {
      return false;
    }

    // Time filter
    if (timeWindow && !matchesDateWindow(event, timeWindow)) {
      return false;
    }

    // Price filter
    if (filters.price && filters.price !== 'all') {
      if (filters.price === 'open' && event.price.type !== 'open') return false;
      if (filters.price === 'with-ticket' && event.price.type === 'open') return false;
    }

    // Match display labels against both scraper genres and enrichment tags.
    // Exact normalized tokens keep "Acid-jazz" off the plain Jazz page.
    if (filters.genre) {
      const wanted = normalizeGenreToken(filters.genre);
      const hasGenre =
        event.genres.some(g => normalizeGenreToken(g) === wanted) ||
        (event.tags ?? []).some(t => normalizeGenreToken(t) === wanted);
      if (!hasGenre) return false;
    }

    return true;
  });
}

/** Normalize genre labels across case, surrounding whitespace and separators. */
export function normalizeGenreToken(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_]+/g, '-');
}

interface DateWindow { start: string; end: string }

/** Compute each Athens date window once, even when filtering thousands of rows. */
function buildDateWindow(timeRange: TimeRange): DateWindow | null {
  const today = DateTime.now().setZone(ATHENS_TZ).startOf('day');
  let rangeStart = today;
  let rangeEnd: DateTime;

  switch (timeRange) {
    case 'today':
      rangeEnd = today.plus({ days: 1 });
      break;
    case 'tomorrow':
      rangeStart = today.plus({ days: 1 });
      rangeEnd = today.plus({ days: 2 });
      break;
    case 'this-week':
      rangeEnd = today.plus({ days: 7 });
      break;
    case 'this-weekend':
      // Luxon weekdays are Mon=1 through Sun=7. Saturday/Sunday belong to
      // the Friday that just passed; Monday begins the next weekend window.
      rangeStart = today.plus({ days: 5 - today.weekday });
      rangeEnd = rangeStart.plus({ days: 3 });
      break;
    case 'this-month':
      rangeEnd = today.startOf('month').plus({ months: 1 });
      break;
    case 'next-month':
      rangeStart = today.startOf('month').plus({ months: 1 });
      rangeEnd = rangeStart.plus({ months: 1 });
      break;
    case 'all-events':
    default:
      return null;
  }
  return { start: rangeStart.toISODate()!, end: rangeEnd.toISODate()! };
}

function matchesDateWindow(event: Event, window: DateWindow): boolean {
  // Canonical stored dates express Athens wall time. Day windows use that
  // date portion, matching lifecycle and display semantics even for legacy
  // rows whose historical timezone suffix is unreliable.
  const eventDay = event.startDate.substring(0, 10);
  if (classifyDateFormat(eventDay) !== 'date-only') return false;
  if (event.type === 'exhibition' && event.endDate) {
    const endDay = event.endDate.substring(0, 10);
    return classifyDateFormat(endDay) === 'date-only' && eventDay < window.end && endDay >= window.start;
  }
  return eventDay >= window.start && eventDay < window.end;
}

export function getFilteredEventCount(events: Event[], filters: Filters): number {
  return filterEvents(events, filters).length;
}

/**
 * Check if an exhibition is currently open
 * An exhibition is "currently open" if:
 * - Its type is 'exhibition'
 * - Today in Athens falls between the start and effective end (inclusive)
 * - A missing end date uses the existing bounded lifecycle presumption
 *
 * @param event - The event to check
 * @param referenceDate - Optional reference date (defaults to today)
 * @returns true if the exhibition is currently open
 */
export function isCurrentlyOpen(event: Event, referenceDate?: Date): boolean {
  if (event.type !== 'exhibition') return false;

  const today = DateTime.fromJSDate(referenceDate ?? new Date(), { zone: ATHENS_TZ }).toISODate();
  const startDay = event.startDate.substring(0, 10);
  if (!today || classifyDateFormat(startDay) !== 'date-only' || startDay > today) return false;

  // Use the same real end or bounded presumption as lifecycle classification.
  // Missing endDate is not evidence that an exhibition remains open forever.
  const endDay = resolveEffectiveEnd(event).date;
  return classifyDateFormat(endDay) === 'date-only' && endDay >= today;
}

/** An end-less event whose effective (presumed) end has not passed yet. */
export function isPresumedRunning(event: Event, referenceDate?: Date): boolean {
  const today = DateTime.fromJSDate(referenceDate ?? new Date(), { zone: ATHENS_TZ }).toISODate();
  return !!today && resolveEffectiveEnd(event).date >= today;
}

/**
 * Filter to only currently open exhibitions
 */
export function filterCurrentlyOpenExhibitions(events: Event[], referenceDate?: Date): Event[] {
  return events.filter(e => isCurrentlyOpen(e, referenceDate));
}

/**
 * Get all exhibitions (both current and upcoming)
 */
export function filterExhibitions(events: Event[]): Event[] {
  return events.filter(e => e.type === 'exhibition');
}

/**
 * Format exhibition date range for display
 * Returns format like "15 Jan - 30 Mar 2026" or "Ongoing" if no end date
 */
export function formatExhibitionDateRange(event: Event, locale: string = 'el-GR'): string {
  if (event.type !== 'exhibition') {
    return new Date(event.startDate).toLocaleDateString(locale, {
      day: 'numeric',
      month: 'short'
    });
  }

  const start = new Date(event.startDate);
  const startStr = start.toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short'
  });

  if (!event.endDate) {
    // "Ongoing" only while the presumed run lasts; past it, the end is unknown.
    if (!isPresumedRunning(event)) return startStr;
    const ongoingLabel = locale === 'en-US' ? 'Ongoing' : 'Συνεχίζεται';
    return `${startStr} - ${ongoingLabel}`;
  }

  const end = new Date(event.endDate);
  const endStr = end.toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
    year: start.getFullYear() !== end.getFullYear() ? 'numeric' : undefined
  });

  // Add year if start and end are in different years or if end is next year
  const needsYear = start.getFullYear() !== end.getFullYear() ||
                    end.getFullYear() > new Date().getFullYear();

  if (needsYear) {
    return `${startStr} - ${endStr} ${end.getFullYear()}`;
  }

  return `${startStr} - ${endStr}`;
}
