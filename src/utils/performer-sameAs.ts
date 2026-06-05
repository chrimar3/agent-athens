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
// S175: PerformingGroup added for comedy ensembles (Sooshi Mango is a trio —
// group entity, not Person; same precedent as S49's LPO → MusicGroup fix).
export interface PerformerEntry {
  type: 'Person' | 'MusicGroup' | 'PerformingGroup';
  sameAs: string[];
}

export interface PerformerSchema {
  '@type': 'Person' | 'MusicGroup' | 'PerformingGroup';
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

// Build a lowercase lookup index for fuzzy matching (skip null entries)
const lowercaseIndex = new Map<string, { name: string; entry: PerformerEntry }>();
for (const [name, entry] of Object.entries(performerCache.performers)) {
  if (entry !== null) {
    lowercaseIndex.set(name.toLowerCase(), { name, entry });
  }
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

  // Remove quotes and clean up. S175: also strip HTML-ENTITY quotes —
  // some DB titles carry literal &quot;/&#171; (e.g. 'Gabriel &quot;Fluffy&quot;
  // Iglesias'), which otherwise blocks registry matching.
  cleaned = cleaned
    .replace(/&quot;|&#34;|&#39;|&#171;|&#187;|&laquo;|&raquo;/gi, '')
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
  // Exact match (null means known not-found)
  const exact = performerCache.performers[name];
  if (exact === null) return null;
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
 * @param schemaType - Derived Schema.org @type (S175). ComedyEvent rows are
 *   performer-eligible regardless of EventType — they stay theater/other in
 *   the DB by design, so eligibility MUST key on the derived type or
 *   performer silently never emits on them.
 * @returns Schema.org performer object or null
 */
export function getPerformerSameAs(title: string, eventType?: string, schemaType?: string): PerformerSchema | null {
  const isComedyEvent = schemaType === 'ComedyEvent';

  // Only add performer for eligible event types (derived ComedyEvent qualifies)
  if (!isComedyEvent && eventType && !PERFORMER_EVENT_TYPES.has(eventType)) {
    return null;
  }

  const candidates: string[] = [];
  const artistName = extractArtist(title);
  if (artistName) candidates.push(artistName);

  // S175, ComedyEvent only: tour-billing titles put the comedian AFTER the
  // separator ("The Superior Comedy Tour - Mario Adrion"), where extractArtist
  // keeps the first segment. Try the remaining segments too — registry-gated,
  // so a segment only ever produces output on an exact curated match.
  if (isComedyEvent) {
    for (const sep of [' - ', ' | ', ':', '–', '—']) {
      if (title.includes(sep)) {
        for (const part of title.split(sep).slice(1)) {
          const cleaned = extractArtist(part.trim());
          if (cleaned && !candidates.includes(cleaned)) candidates.push(cleaned);
        }
      }
    }
  }

  for (const candidate of candidates) {
    const match = findPerformer(candidate);
    if (match) {
      return {
        '@type': match.entry.type,
        name: match.canonicalName,
        sameAs: match.entry.sameAs,
      };
    }
  }

  return null;
}

/**
 * Check if an event type is eligible for performer blocks.
 */
export function isPerformerEventType(type: string): boolean {
  return PERFORMER_EVENT_TYPES.has(type);
}
