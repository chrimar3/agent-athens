/**
 * Canonical active daily-scraper IDs — the single source of truth for "how many
 * sources we rebuild from" (S103 colophon stat + scrape-all.ts's SourceId).
 *
 * scrape-all.ts derives `type SourceId = typeof ACTIVE_SOURCE_IDS[number]` and
 * declares `SOURCES: Record<SourceId, …>`, so the registry and this list cannot
 * drift without a TypeScript error. The colophon reads ACTIVE_SOURCE_COUNT from
 * here — a lightweight import (no puppeteer/scraper graph pulled into the build).
 *
 * These are the 10 scrapers run by the daily pipeline. Legacy/one-off sources
 * still present in the events DB (manual, eventbrite, meetup, devoxx, greeksin,
 * hackathongreece) are NOT part of the daily rebuild and are intentionally
 * excluded — "sources we rebuild from", not "sources ever ingested".
 */
export const ACTIVE_SOURCE_IDS = [
  'more',
  'athinorama',
  'clubber',
  'ticketservices',
  'halfnote',
  'ra',
  'snfcc',
  'onassis',
  'benaki',
  'megaron',
  'cometogether', // 2026-08-11 (Phase 2B): cometogether.live/el — plain-fetch, server-rendered
] as const;

export const ACTIVE_SOURCE_COUNT = ACTIVE_SOURCE_IDS.length;
