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

import { writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import type { Event } from '../types';
import { normalizeGreek } from '../utils/normalize-greek';
import { generateEventSlug, slugify } from './event-page';
import { filterEventsByCategory, type CategoryConfig } from '../templates/category-page';

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

interface SearchIndex {
  events: EventRecord[];
  venues: VenueRecord[];
  categories: CategoryRecord[];
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
    neighborhood: event.venue.neighborhood || '',
    neighborhoodN: normalizeGreek(event.venue.neighborhood || ''),
    date: event.startDate.substring(0, 10),
    slug: generateEventSlug(event),
    thumb: event.imageLocal || event.imageUrl || event.venueImage || '',
    price: event.price.type === 'open' ? 'open' : 'with-ticket',
  }));

  // Build venue records (deduplicated by slug)
  const venueMap = new Map<string, VenueRecord>();
  for (const event of events) {
    const slug = slugify(event.venue.name);
    const existing = venueMap.get(slug);
    if (existing) {
      existing.eventCount++;
    } else {
      venueMap.set(slug, {
        name: event.venue.name,
        nameN: normalizeGreek(event.venue.name),
        neighborhood: event.venue.neighborhood || '',
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

  const index: SearchIndex = {
    events: eventRecords,
    venues: venueRecords,
    categories: categoryRecords,
    generated: new Date().toISOString(),
  };

  writeFileSync(join(DIST_DIR, 'search-index.json'), JSON.stringify(index));
}
