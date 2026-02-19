/**
 * Artist/Performer Lookup Module
 *
 * Purpose: Enrich event data with artist/performer information
 * Data sources:
 * 1. Database cache (instant)
 * 2. Web search via Task tool (FREE, ~3-5 seconds)
 * 3. Generic fallback (if artist unknown)
 */

import { Database } from 'bun:sqlite';
import { ArtistInfo, EventType } from './types';

const db = new Database('data/events.db');

const CACHE_VALIDITY_DAYS = 180; // Artist info stays valid for 6 months

/**
 * Lookup artist information from cache or web search
 */
export async function lookupArtist(
  eventTitle: string,
  eventType: EventType,
  genre?: string
): Promise<ArtistInfo | null> {
  // Extract artist name from title
  const artistName = extractArtistName(eventTitle, eventType);

  if (!artistName) {
    console.log('   ⚠️  No artist name extracted from title');
    return null;
  }

  console.log(`🎭 Looking up artist: ${artistName}`);

  // 1. Check database cache
  const cached = getCachedArtistInfo(artistName);
  if (cached && isRecentCache(cached.last_updated)) {
    console.log(`   ✅ Cache hit: ${artistName}`);
    return cached;
  }

  // 2. Web search using Task tool (FREE but rate-limited)
  console.log(`   🔍 Searching web for: ${artistName}`);
  const searchResult = await searchArtistInfo(artistName, eventType, genre);

  if (searchResult) {
    console.log(`   ✅ Found via web search`);
    cacheArtistInfo(searchResult);
    return searchResult;
  }

  // 3. Return null (will use venue + genre context instead)
  console.log(`   ⚠️  Artist not found, will use genre context`);
  return null;
}

/**
 * Extract artist/performer name from event title
 * Handles common patterns and variations
 */
export function extractArtistName(
  title: string,
  type: EventType
): string | null {
  let cleaned = title;

  // Remove common noise words and patterns
  const noisePatterns = [
    /\bpresents?\b/gi,
    /\blive\b/gi,
    /\bconcert\b/gi,
    /\bexhibition\b/gi,
    /\bworkshop\b/gi,
    /\bperformance\b/gi,
    /\bfilm screening\b/gi,
    /\btheater\b/gi,
    /\s+\d{4}\s*$/g, // Year at end
    /\s*-\s*\d+\s*(Nov|Dec|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct)\s+\d{4}/gi, // Date patterns
  ];

  for (const pattern of noisePatterns) {
    cleaned = cleaned.replace(pattern, '');
  }

  // Split on common separators and take first part
  const separators = [':', '–', '—', ' - ', ' | '];
  for (const sep of separators) {
    if (cleaned.includes(sep)) {
      const parts = cleaned.split(sep);
      cleaned = parts[0].trim();
      break;
    }
  }

  // Remove quotes and clean up
  cleaned = cleaned
    .replace(/["""'']/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Validate: must be 3-80 characters, not just numbers
  if (
    cleaned.length < 3 ||
    cleaned.length > 80 ||
    /^\d+$/.test(cleaned)
  ) {
    return null;
  }

  // For exhibitions, remove "presents" or artist-less titles
  if (type === 'exhibition') {
    // Check if it's a generic exhibition title
    const genericPatterns = [
      /^exhibition of/i,
      /^group show/i,
      /^annual/i,
      /^contemporary art/i,
    ];

    for (const pattern of genericPatterns) {
      if (pattern.test(cleaned)) {
        return null;
      }
    }
  }

  return cleaned;
}

/**
 * Get artist info from database cache
 */
function getCachedArtistInfo(artistName: string): (ArtistInfo & { last_updated?: string }) | null {
  const stmt = db.prepare(`
    SELECT * FROM artist_info
    WHERE artist_name = ?
  `);

  const result = stmt.get(artistName) as any;

  if (!result) return null;

  return {
    name: result.artist_name,
    bio: result.bio,
    genre: result.genre,
    notable_works: result.notable_works
      ? JSON.parse(result.notable_works)
      : undefined,
    career_highlights: result.career_highlights,
    active_since: result.active_since,
    last_updated: result.last_updated,
  };
}

/**
 * Check if cached data is still recent
 */
function isRecentCache(lastUpdated?: string): boolean {
  if (!lastUpdated) return false;

  const cacheDate = new Date(lastUpdated);
  const now = new Date();
  const daysDiff =
    (now.getTime() - cacheDate.getTime()) / (1000 * 60 * 60 * 24);

  return daysDiff < CACHE_VALIDITY_DAYS;
}

/**
 * Search for artist information using Task tool web search
 * Returns structured artist data or null if not found
 */
async function searchArtistInfo(
  artistName: string,
  eventType: EventType,
  genre?: string
): Promise<ArtistInfo | null> {
  // For MVP, we'll skip web search and return null
  // This can be implemented later using Task tool
  // The enrichment will still work with venue + genre context

  // TODO: Implement Task tool web search
  // const result = await callTaskAgent(`Search for "${artistName}" ${eventType} Athens...`);

  return null;
}

/**
 * Save artist info to database cache
 */
function cacheArtistInfo(info: ArtistInfo): void {
  const stmt = db.prepare(`
    INSERT INTO artist_info (
      artist_name, bio, genre, notable_works,
      career_highlights, active_since, source
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(artist_name) DO UPDATE SET
      bio = excluded.bio,
      genre = excluded.genre,
      notable_works = excluded.notable_works,
      career_highlights = excluded.career_highlights,
      active_since = excluded.active_since,
      last_updated = CURRENT_TIMESTAMP,
      source = excluded.source
  `);

  stmt.run(
    info.name,
    info.bio || null,
    info.genre || null,
    info.notable_works ? JSON.stringify(info.notable_works) : null,
    info.career_highlights || null,
    info.active_since || null,
    'web_search'
  );
}

/**
 * Manually seed known Athens artists for common events
 * This reduces web search load for frequently occurring artists
 */
export function seedKnownArtists(): void {
  const knownArtists: ArtistInfo[] = [
    {
      name: 'Yiannis Vagianos',
      bio: 'Greek jazz composer and multi-instrumentalist known for blending Mediterranean musical traditions with contemporary jazz. Based in Athens, Vagianos leads various ensemble projects exploring the intersection of Greek folk elements and modern jazz improvisation.',
      genre: 'Contemporary Jazz, Mediterranean Jazz',
      notable_works: ['Second Take', 'Dream Modes'],
      career_highlights:
        'Regular performer at Half Note Jazz Club, known for quintet and quartet configurations',
    },
    {
      name: 'Simone Leigh',
      bio: 'American artist known for her large-scale sculptures and installations addressing themes of Black femininity, the body, and historical narratives. Her work combines ceramics, bronze, and architectural elements to create powerful statements about representation and identity.',
      genre: 'Contemporary Art, Sculpture',
      career_highlights:
        'First Black woman to represent United States at Venice Biennale (2022), major exhibitions at Guggenheim and ICA Boston',
    },
  ];

  for (const artist of knownArtists) {
    const stmt = db.prepare(`
      INSERT INTO artist_info (
        artist_name, bio, genre, notable_works,
        career_highlights, source
      ) VALUES (?, ?, ?, ?, ?, 'manual')
      ON CONFLICT(artist_name) DO NOTHING
    `);

    stmt.run(
      artist.name,
      artist.bio,
      artist.genre || null,
      artist.notable_works ? JSON.stringify(artist.notable_works) : null,
      artist.career_highlights || null
    );
  }

  console.log(`✅ Seeded ${knownArtists.length} known artists`);
}
