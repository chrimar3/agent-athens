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
      if (filters.price === 'free' && event.price.type !== 'free') return false;
      if (filters.price === 'paid' && event.price.type === 'free') return false;
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
      return eventDate >= now && eventDate < weekEnd;

    case 'this-weekend':
      // Find next Friday-Sunday
      const dayOfWeek = now.getDay();
      const daysUntilFriday = (5 - dayOfWeek + 7) % 7;
      const friday = new Date(now);
      friday.setDate(friday.getDate() + daysUntilFriday);
      const monday = new Date(friday);
      monday.setDate(monday.getDate() + 3);
      return eventDate >= friday && eventDate < monday;

    case 'this-month':
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
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
