/**
 * Search Index Generator
 *
 * Builds a JSON index at dist/search-index.json for client-side Fuse.js search.
 * Takes the already-filtered events array from generate-site.ts (location-verified,
 * date-filtered) — no duplicate filtering needed.
 *
 * Index includes: events, venues (deduplicated), categories (with counts).
 * All text fields have a normalized (*N) counterpart for accent-insensitive Greek search.
 */

import { readFileSync, existsSync } from 'fs';
import { writeFileIfChangedSync } from '../utils/write-if-changed';
import { join } from 'path';
import type { Event } from '../types';
import { normalizeGreek } from '../utils/normalize-greek';
import { displayNeighborhood } from '../utils/neighborhoods';
import { generateEventSlug, slugify } from './event-page';
import { getVenueIdentity } from '../utils/venue-identity';
import { filterEventsByCategory, type CategoryConfig } from '../templates/category-page';
import { GREEK_MONTHS_SHORT, parseISODate } from '../utils/format-date';

function formatShortGreekDate(isoDate: string): string {
  const p = parseISODate(isoDate);
  return p ? `${p.day} ${GREEK_MONTHS_SHORT[p.month - 1]}` : isoDate.substring(0, 10);
}

const DIST_DIR = join(import.meta.dir, '../../dist');

interface EventRecord {
  id: string;
  title: string;
  titleN: string;
  type: string;
  venue: string;
  venueN: string;
  neighborhood: string;
  neighborhoodN: string;
  date: string;
  slug: string;
  thumb: string;
  price: string;
}

interface VenueRecord {
  name: string;
  nameN: string;
  neighborhood: string;
  neighborhoodN: string;
  slug: string;
  eventCount: number;
}

interface CategoryRecord {
  slug: string;
  title: string;
  titleN: string;
  count: number;
}

interface PopularRecord {
  title: string;
  slug: string;
  venue: string;
  date: string;
  type: string;
}

interface SearchIndex {
  events: EventRecord[];
  venues: VenueRecord[];
  categories: CategoryRecord[];
  popular: PopularRecord[];
  generated: string;
}

/**
 * Generate search index from filtered events array and write to dist/search-index.json
 */
export function generateSearchIndex(events: Event[]): void {
  // Build event records
  const eventRecords: EventRecord[] = events.map(event => ({
    id: event.id,
    title: event.title,
    titleN: normalizeGreek(event.title),
    type: event.type,
    venue: event.venue.name,
    venueN: normalizeGreek(event.venue.name),
    neighborhood: displayNeighborhood(event.venue.neighborhood || ''),
    neighborhoodN: normalizeGreek(event.venue.neighborhood || ''),
    date: formatShortGreekDate(event.startDate),
    slug: generateEventSlug(event),
    thumb: event.imageLocal || event.imageUrl || event.venueImage || '',
    price: event.price.type === 'open' ? 'open' : 'with-ticket',
  }));

  // Build venue records (deduplicated by slug)
  // S146: slug source is getVenueIdentity, not raw slugify — heals empty-slug
  // collision for Greek venues in the search index. Pre-S146, all Greek-named
  // venues collapsed into a single venueMap entry with key='', appearing in
  // dist/search-index.json as one corrupted record consumed by search-overlay.ts.
  const venueMap = new Map<string, VenueRecord>();
  for (const event of events) {
    const slug = getVenueIdentity(event.venue).slug;
    const existing = venueMap.get(slug);
    if (existing) {
      existing.eventCount++;
    } else {
      venueMap.set(slug, {
        name: event.venue.name,
        nameN: normalizeGreek(event.venue.name),
        neighborhood: displayNeighborhood(event.venue.neighborhood || ''),
        neighborhoodN: normalizeGreek(event.venue.neighborhood || ''),
        slug,
        eventCount: 1,
      });
    }
  }
  const venueRecords = Array.from(venueMap.values())
    .sort((a, b) => b.eventCount - a.eventCount);

  // Build category records from config
  const categoriesConfig = JSON.parse(
    readFileSync(join(import.meta.dir, '../../config/categories.json'), 'utf-8')
  ) as { categories: CategoryConfig[] };

  const categoryRecords: CategoryRecord[] = categoriesConfig.categories.map(cat => {
    const filtered = filterEventsByCategory(events, cat);
    return {
      slug: cat.slug,
      title: cat.title,
      titleN: normalizeGreek(cat.title),
      count: filtered.length,
    };
  });

  // Build popular records (5 soonest upcoming events)
  const now = new Date().toISOString().slice(0, 10);
  const popular: PopularRecord[] = [...events]
    .filter(e => {
      const effectiveDate = (e.type === 'exhibition' && e.endDate) ? e.endDate.slice(0, 10) : e.startDate.slice(0, 10);
      return effectiveDate >= now;
    })
    .sort((a, b) => {
      const aDate = a.startDate.slice(0, 10);
      const bDate = b.startDate.slice(0, 10);
      return aDate.localeCompare(bDate);
    })
    .slice(0, 5)
    .map(e => ({
      title: e.title,
      slug: generateEventSlug(e),
      venue: e.venue.name,
      date: formatShortGreekDate(e.startDate),
      type: e.type,
    }));

  const indexPath = join(DIST_DIR, 'search-index.json');
  let generated = new Date().toISOString();
  if (existsSync(indexPath)) {
    try {
      const prev = JSON.parse(readFileSync(indexPath, 'utf-8'));
      const prevWithoutGen = { ...prev, generated: '' };
      const nextWithoutGen = { events: eventRecords, venues: venueRecords, categories: categoryRecords, popular, generated: '' };
      if (JSON.stringify(prevWithoutGen) === JSON.stringify(nextWithoutGen) && typeof prev.generated === 'string') {
        generated = prev.generated;
      }
    } catch {}
  }

  const index: SearchIndex = {
    events: eventRecords,
    venues: venueRecords,
    categories: categoryRecords,
    popular,
    generated,
  };

  writeFileIfChangedSync(indexPath, JSON.stringify(index));
}
