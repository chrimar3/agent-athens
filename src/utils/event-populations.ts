/**
 * The build's event populations, extracted from generate-site.ts so every
 * stage is under test. Order matters: the public view first (what the site
 * may state as fact), then publishable status, then rollover suspects.
 */
import type { Event } from '../types';
import { toPublishable } from './publishable';
import { isRolloverSuspect, selectListable } from './event-lifecycle';
import { getRejectedCityNames, titleNamesCity } from '../quality/location-filter';

const PUBLISHABLE_STATUSES = new Set(['verified_athens', 'pass_through']);

export function selectPublishedPopulation(all: Event[]): { events: Event[]; rolloverHeld: number; cityHeld: number } {
  let rolloverHeld = 0;
  let cityHeld = 0;
  const cities = getRejectedCityNames();
  const events = all.map(toPublishable).filter(event => {
    if (!PUBLISHABLE_STATUSES.has(event.locationStatus ?? '')) return false;
    if (isRolloverSuspect(event)) { rolloverHeld++; return false; }
    if (titleNamesCity(event.title, cities)) { cityHeld++; return false; }
    return true;
  });
  return { events: presumeInstanceRunEnds(events), rolloverHeld, cityHeld };
}

/**
 * Exhibitions scraped as one row per open day carry no end_date, so each row
 * alone presumed a 90-day run and the show read "open" months after closing.
 * When a title+venue was listed on two or more days and its source has since
 * written rows at least two days newer without listing it again, the run is
 * presumed to have ended on its last listed day. A presumption only: a source
 * can stop listing a show that still runs (Kruger's daily rows stopped 23 Jun;
 * it runs to 1 Nov), so this never becomes an end_date or EventCompleted, and
 * a stated end on any row of the run wins.
 * Exhibitions only: multi-date theatre listing is a pending user decision.
 */
function presumeInstanceRunEnds(events: Event[]): Event[] {
  const key = (e: Event) => `${e.source}|${e.title.trim().toLowerCase()}|${(e.venue?.name ?? '').trim().toLowerCase()}`;
  const isInstance = (e: Event) => e.type === 'exhibition' && !e.endDate;
  const runDays = new Map<string, Set<string>>();
  const statedEnd = new Map<string, string>();
  const sourceLastWrite = new Map<string, string>();
  for (const e of events) {
    const written = (e.createdAt ?? '').slice(0, 10);
    if (written > (sourceLastWrite.get(e.source) ?? '')) sourceLastWrite.set(e.source, written);
    if (e.type === 'exhibition' && e.endDate) {
      const end = e.endDate.slice(0, 10);
      if (end > (statedEnd.get(key(e)) ?? '')) statedEnd.set(key(e), end);
    }
    if (!isInstance(e)) continue;
    const days = runDays.get(key(e)) ?? new Set<string>();
    days.add(e.startDate.slice(0, 10));
    runDays.set(key(e), days);
  }
  return events.map(e => {
    const days = isInstance(e) ? runDays.get(key(e)) : undefined;
    if (!days || days.size < 2) return e;
    const lastDay = [...days].sort().at(-1)!;
    if ((statedEnd.get(key(e)) ?? '') >= lastDay) return e;
    // One missed listing day must not end a running show.
    const movedOn = (sourceLastWrite.get(e.source) ?? '') >= addDays(lastDay, 2);
    return movedOn ? { ...e, presumedEndDate: lastDay } : e;
  });
}

function addDays(isoDay: string, n: number): string {
  const d = new Date(`${isoDay}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
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
