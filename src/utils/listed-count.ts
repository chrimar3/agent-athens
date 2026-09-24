/**
 * The one "listed events" count: how many events the site lists.
 *
 * Composes the build's own population selectors (src/utils/event-populations.ts)
 * in the order src/generate-site.ts applies them — publishable status,
 * rollover hold-back, current/future window, one per duplicate group — so a
 * report can never state a different number than the site shows. Reports
 * that also print row counts must label those as rows, not events listed.
 */
import type { Database } from 'bun:sqlite';
import type { Event } from '../types';
import { getAllEvents } from '../db/database';
import { selectPublishedPopulation, selectUpcomingListing } from './event-populations';

export function selectListedEvents(all: Event[], now: Date = new Date()): Event[] {
  return selectUpcomingListing(selectPublishedPopulation(all).events, now);
}

/** Idempotent: counting an already-listed population returns its length. */
export function countListedEvents(all: Event[], now: Date = new Date()): number {
  return selectListedEvents(all, now).length;
}

/** Same count from a database handle; getAllEvents applies the cancelled and hard-stop exclusions. */
export function countListedEventsInDb(db: Database, now: Date = new Date()): number {
  return countListedEvents(getAllEvents(db), now);
}
