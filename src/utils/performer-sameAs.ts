/**
 * Performer sameAs Lookup Module
 *
 * Loads config/performer-sameAs.json and provides a runtime lookup
 * for Schema.org performer blocks with sameAs links (Wikidata, Wikipedia, MusicBrainz).
 *
 * Used by event-page.ts to inject performer into JSON-LD.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

// Types for performer data
export interface PerformerEntry {
  type: 'Person' | 'MusicGroup';
  sameAs: string[];
}

export interface PerformerSchema {
  '@type': 'Person' | 'MusicGroup';
  name: string;
  sameAs: string[];
}

interface PerformerCache {
  _meta: { description: string; updated: string };
  performers: Record<string, PerformerEntry>;
}

// Event types that can have performers
const PERFORMER_EVENT_TYPES = new Set([
  'concert', 'dj_set', 'festival', 'performance', 'show', 'dance',
]);

// Load cache at module init
const CACHE_PATH = join(import.meta.dir, '../../config/performer-sameAs.json');
let performerCache: PerformerCache;
try {
  performerCache = JSON.parse(readFileSync(CACHE_PATH, 'utf-8'));
} catch {
  performerCache = { _meta: { description: '', updated: '' }, performers: {} };
}

// Build a lowercase lookup index for fuzzy matching
const lowercaseIndex = new Map<string, { name: string; entry: PerformerEntry }>();
for (const [name, entry] of Object.entries(performerCache.performers)) {
  lowercaseIndex.set(name.toLowerCase(), { name, entry });
}

/**
 * Extract an artist name from an event title.
 * Simplified version of extractArtistName from artist-lookup.ts
 * that avoids importing the DB-connected module.
 */
function extractArtist(title: string): string | null {
  let cleaned = title;

  // Remove location suffixes (e.g. "in Athens", "in Greece", "(US)")
  cleaned = cleaned
    .replace(/\s+in\s+(Athens|Greece)\s*!?\s*$/gi, '')
    .replace(/\s*\([A-Z]{2}\)\s*/g, ' ')
    .replace(/\s*@\s+.+$/, '');

  // Remove common noise words
  const noisePatterns = [
    /\bpresents?\b/gi,
    /\blive\b/gi,
    /\bconcert\b/gi,
    /\bperformance\b/gi,
    /\s+\d{4}\s*$/g,
  ];
  for (const pattern of noisePatterns) {
    cleaned = cleaned.replace(pattern, '');
  }

  // For festival lineups ("Release Athens 2026 / Artist"), try the last part after "/"
  // if the first part looks like an event/festival name
  const slashParts = cleaned.split(' / ').map(p => p.trim()).filter(Boolean);
  if (slashParts.length >= 2) {
    const firstLower = slashParts[0].toLowerCase();
    const isFestival = /release|ejekt|festival|athens/i.test(firstLower);
    if (isFestival) {
      // Take the first headliner after the festival name
      cleaned = slashParts[1];
    } else {
      cleaned = slashParts[0];
    }
  }

  // Split on other separators and take first part
  const separators = [':', '–', '—', ' - ', ' | '];
  for (const sep of separators) {
    if (cleaned.includes(sep)) {
      cleaned = cleaned.split(sep)[0].trim();
      break;
    }
  }

  // Remove quotes and clean up
  cleaned = cleaned
    .replace(/["""''«»‹›]/g, '')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

  if (cleaned.length < 3 || cleaned.length > 80 || /^\d+$/.test(cleaned)) {
    return null;
  }

  return cleaned;
}

/**
 * Look up a performer name in the cache.
 * Tries exact match first, then case-insensitive.
 */
function findPerformer(name: string): { canonicalName: string; entry: PerformerEntry } | null {
  // Exact match
  const exact = performerCache.performers[name];
  if (exact) return { canonicalName: name, entry: exact };

  // Case-insensitive match
  const lower = lowercaseIndex.get(name.toLowerCase());
  if (lower) return { canonicalName: lower.name, entry: lower.entry };

  return null;
}

/**
 * Get a Schema.org performer block for an event.
 *
 * @param title - Event title (artist name extracted from it)
 * @param eventType - Event type (only performer types get results)
 * @returns Schema.org performer object or null
 */
export function getPerformerSameAs(title: string, eventType?: string): PerformerSchema | null {
  // Only add performer for eligible event types
  if (eventType && !PERFORMER_EVENT_TYPES.has(eventType)) {
    return null;
  }

  const artistName = extractArtist(title);
  if (!artistName) return null;

  const match = findPerformer(artistName);
  if (!match) return null;

  return {
    '@type': match.entry.type,
    name: match.canonicalName,
    sameAs: match.entry.sameAs,
  };
}

/**
 * Check if an event type is eligible for performer blocks.
 */
export function isPerformerEventType(type: string): boolean {
  return PERFORMER_EVENT_TYPES.has(type);
}
