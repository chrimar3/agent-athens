/**
 * The build's event populations, extracted from generate-site.ts so every
 * stage is under test. Order matters: the public view first (what the site
 * may state as fact), then publishable status, then rollover suspects.
 */
import type { Event } from '../types';
import { toPublishable } from './publishable';
import { isRolloverSuspect, selectListable } from './event-lifecycle';

const PUBLISHABLE_STATUSES = new Set(['verified_athens', 'pass_through']);

export function selectPublishedPopulation(all: Event[]): { events: Event[]; rolloverHeld: number } {
  let rolloverHeld = 0;
  const events = all.map(toPublishable).filter(event => {
    if (!PUBLISHABLE_STATUSES.has(event.locationStatus ?? '')) return false;
    if (isRolloverSuspect(event)) { rolloverHeld++; return false; }
    return true;
  });
  return { events, rolloverHeld };
}

/** Listings, hubs, search and counts: current/future events, one per duplicate group. */
export function selectUpcomingListing(events: Event[], now: Date): Event[] {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return selectListable(events.filter(event => {
    // Exhibitions stay while running (end of their end day).
    if (event.type === 'exhibition' && event.endDate) {
      const endDate = new Date(event.endDate);
      endDate.setHours(23, 59, 59, 999);
      return endDate >= today;
    }
    return new Date(event.startDate) >= today;
  }));
}
