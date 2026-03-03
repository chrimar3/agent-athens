// Event filtering logic

import type { Event, Filters, TimeRange, PriceFilter } from '../types';

export function filterEvents(events: Event[], filters: Filters): Event[] {
  return events.filter(event => {
    // Type filter
    if (filters.type && event.type !== filters.type) {
      return false;
    }

    // Time filter
    if (filters.time && !matchesTimeRange(event, filters.time)) {
      return false;
    }

    // Price filter
    if (filters.price && filters.price !== 'all') {
      if (filters.price === 'open' && event.price.type !== 'open') return false;
      if (filters.price === 'with-ticket' && event.price.type === 'open') return false;
    }

    // Genre filter
    if (filters.genre && !event.genres.includes(filters.genre)) {
      return false;
    }

    return true;
  });
}

function matchesTimeRange(event: Event, timeRange: TimeRange): boolean {
  const eventDate = new Date(event.startDate);
  const now = new Date();
  now.setHours(0, 0, 0, 0); // Start of today

  switch (timeRange) {
    case 'today':
      const today = new Date(now);
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      // Exhibition Tier 1: running exhibitions (started in past, still open) match today
      if (event.type === 'exhibition' && event.endDate) {
        const endDate = new Date(event.endDate);
        endDate.setHours(23, 59, 59, 999);
        return eventDate <= tomorrow && endDate >= today;
      }
      return eventDate >= today && eventDate < tomorrow;

    case 'tomorrow':
      const tomorrowStart = new Date(now);
      tomorrowStart.setDate(tomorrowStart.getDate() + 1);
      const tomorrowEnd = new Date(now);
      tomorrowEnd.setDate(tomorrowEnd.getDate() + 2);
      return eventDate >= tomorrowStart && eventDate < tomorrowEnd;

    case 'this-week':
      const weekEnd = new Date(now);
      weekEnd.setDate(weekEnd.getDate() + 7);
      if (event.type === 'exhibition' && event.endDate) {
        const endDate = new Date(event.endDate);
        endDate.setHours(23, 59, 59, 999);
        return eventDate < weekEnd && endDate >= now;
      }
      return eventDate >= now && eventDate < weekEnd;

    case 'this-weekend':
      // Find next Friday-Sunday
      const dayOfWeek = now.getDay();
      const daysUntilFriday = (5 - dayOfWeek + 7) % 7;
      const friday = new Date(now);
      friday.setDate(friday.getDate() + daysUntilFriday);
      const monday = new Date(friday);
      monday.setDate(monday.getDate() + 3);
      if (event.type === 'exhibition' && event.endDate) {
        const endDate = new Date(event.endDate);
        endDate.setHours(23, 59, 59, 999);
        return eventDate < monday && endDate >= friday;
      }
      return eventDate >= friday && eventDate < monday;

    case 'this-month':
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      if (event.type === 'exhibition' && event.endDate) {
        const endDate = new Date(event.endDate);
        endDate.setHours(23, 59, 59, 999);
        return eventDate <= monthEnd && endDate >= now;
      }
      return eventDate >= now && eventDate <= monthEnd;

    case 'next-month':
      const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      const nextMonthEnd = new Date(now.getFullYear(), now.getMonth() + 2, 0);
      return eventDate >= nextMonthStart && eventDate <= nextMonthEnd;

    case 'all-events':
      return true;

    default:
      return true;
  }
}

export function getFilteredEventCount(events: Event[], filters: Filters): number {
  return filterEvents(events, filters).length;
}

/**
 * Check if an exhibition is currently open
 * An exhibition is "currently open" if:
 * - Its type is 'exhibition'
 * - Today's date is between start_date and end_date (inclusive)
 *
 * @param event - The event to check
 * @param referenceDate - Optional reference date (defaults to today)
 * @returns true if the exhibition is currently open
 */
export function isCurrentlyOpen(event: Event, referenceDate?: Date): boolean {
  if (event.type !== 'exhibition') return false;

  const now = referenceDate || new Date();
  now.setHours(0, 0, 0, 0); // Start of day

  const start = new Date(event.startDate);
  start.setHours(0, 0, 0, 0);

  // Must have already started
  if (now < start) return false;

  // If no end date, consider it open (ongoing/permanent)
  if (!event.endDate) return true;

  const end = new Date(event.endDate);
  end.setHours(23, 59, 59, 999); // End of day

  return now <= end;
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
