/**
 * Search Index Generator
 *
 * Builds a JSON index at dist/search-index.json for client-side Fuse.js search.
 * Takes the already-filtered events array from generate-site.ts (location-verified,
 * date-filtered) — no duplicate filtering needed.
 *
 * Index includes: events, venues (deduplicated), categories (with counts).
 * All text fields have a normalized (*N) counterpart for accent-insensitive Greek search.
 * Titles and venue names are entity-decoded: the overlay renders them with
 * textContent, and pre-S154 rows store `&amp;`/`&#171;` literally. Slugs keep
 * deriving from the stored strings (no URL churn).
 */

import { readFileSync, existsSync } from 'fs';
import he from 'he';
import { writeFileIfChangedSync } from '../utils/write-if-changed';
import { join } from 'path';
import { computePagedVenueSlugs } from './venue-page';
import type { Event } from '../types';
import { normalizeGreek, transliterateGreekId } from '../utils/normalize-greek';
import { greeklishFold } from '../templates/search-overlay';
import { getAthensTodayStr, resolveEffectiveEnd } from '../utils/event-lifecycle';
import { displayNeighborhood } from '../utils/neighborhoods';
import { displayTitle, decodeFully } from '../utils/display-title';
import { generateEventSlug, slugify } from './event-page';
import { getVenueIdentity } from '../utils/venue-identity';
import { filterEventsByCategory, type CategoryConfig } from '../templates/category-page';
import { GREEK_MONTHS_SHORT, parseISODate } from '../utils/format-date';

function formatShortGreekDate(isoDate: string): string {
  const p = parseISODate(isoDate);
  return p ? `${p.day} ${GREEK_MONTHS_SHORT[p.month - 1]}` : isoDate.substring(0, 10);
}

const DIST_DIR = join(import.meta.dir, '../../dist');

const GREEK_LETTER = /[\u0370-\u03ff\u1f00-\u1fff]/;

/** Latin search key for Greek text: the page folds Latin queries the same way. */
export function greeklishKey(text: string): string {
  return greeklishFold(transliterateGreekId(text));
}

/** Latin key only where the text has Greek letters: a Latin-only string is
 *  already matched through its *N field, so a copy would only grow the index. */
function latinKey(text: string): string | undefined {
  return GREEK_LETTER.test(text) ? greeklishKey(text) : undefined;
}

interface EventRecord {
  id: string;
  title: string;
  titleN: string;
  titleL?: string;
  type: string;
  venue: string;
  venueN: string;
  venueL?: string;
  neighborhood: string;
  neighborhoodN: string;
  date: string;
  startDate: string;
  hasEnglish: boolean;
  slug: string;
  thumb: string;
  price: string;
}

interface VenueRecord {
  name: string;
  nameN: string;
  nameL?: string;
  neighborhood: string;
  neighborhoodN: string;
  slug: string;
  eventCount: number;
}

interface CategoryRecord {
  slug: string;
  title: string;
  titleN: string;
  titleL?: string;
  count: number;
}

interface PopularRecord {
  title: string;
  slug: string;
  venue: string;
  date: string;
  startDate: string;
  hasEnglish: boolean;
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
 * Generate search index from filtered events array and write to
 * `<outDir>/search-index.json` (defaults to dist/).
 *
 * outDir exists so tests can write to a temp dir. Before 2026-07-19 the path was
 * hardcoded, so running the suite overwrote the production deploy artifact with
 * fixture data — invisible to the deploy gate, since dist/ is gitignored.
 * Tests must always pass an explicit outDir; see __tests__/search-index.test.ts.
 */
export function generateSearchIndex(events: Event[], outDir: string = DIST_DIR): void {
  // Build event records
  const eventRecords: EventRecord[] = events.map(event => ({
    id: event.id,
    title: displayTitle(event.title, event.venue.name),
    titleN: normalizeGreek(displayTitle(event.title, event.venue.name)),
    titleL: latinKey(displayTitle(event.title, event.venue.name)),
    type: event.type,
    venue: decodeFully(event.venue.name),
    venueN: normalizeGreek(decodeFully(event.venue.name)),
    venueL: latinKey(decodeFully(event.venue.name)),
    neighborhood: displayNeighborhood(event.venue.neighborhood || ''),
    neighborhoodN: normalizeGreek(event.venue.neighborhood || ''),
    date: formatShortGreekDate(event.startDate),
    startDate: event.startDate,
    hasEnglish: Boolean(event.fullDescriptionEn),
    slug: generateEventSlug(event),
    thumb: event.imageLocal || event.imageUrl || event.venueImage || '',
    price: event.price.type,
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
        name: he.decode(event.venue.name),
        nameN: normalizeGreek(he.decode(event.venue.name)),
        nameL: latinKey(he.decode(event.venue.name)),
        neighborhood: displayNeighborhood(event.venue.neighborhood || ''),
        neighborhoodN: normalizeGreek(event.venue.neighborhood || ''),
        slug,
        eventCount: 1,
      });
    }
  }
  const pagedVenueSlugs = computePagedVenueSlugs(events);
  const venueRecords = Array.from(venueMap.values())
    .filter(venue => pagedVenueSlugs.has(venue.slug))
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
      titleL: latinKey(cat.title),
      count: filtered.length,
    };
  });

  // Build popular records (5 soonest upcoming events)
  const now = getAthensTodayStr();
  const popular: PopularRecord[] = [...events]
    .filter(e => {
      const effectiveDate = resolveEffectiveEnd(e).date;
      return effectiveDate >= now;
    })
    .sort((a, b) => {
      const aDate = a.startDate.slice(0, 10);
      const bDate = b.startDate.slice(0, 10);
      return aDate.localeCompare(bDate);
    })
    .slice(0, 5)
    .map(e => ({
      title: he.decode(e.title),
      slug: generateEventSlug(e),
      venue: he.decode(e.venue.name),
      date: formatShortGreekDate(e.startDate),
      startDate: e.startDate,
      hasEnglish: Boolean(e.fullDescriptionEn),
      type: e.type,
    }));

  const indexPath = join(outDir, 'search-index.json');
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
