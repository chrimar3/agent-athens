/**
 * Venue Context Lookup Module
 *
 * Purpose: Enrich event data with venue information including:
 * - Neighborhood location in Athens
 * - Venue description and atmosphere
 * - Capacity and establishment history
 *
 * Data sources (priority order):
 * 1. Database cache (fastest)
 * 2. Web search via Task agent (FREE)
 * 3. Generic context (fallback)
 */

import { Database } from 'bun:sqlite';
import { VenueContext } from './types';

const db = new Database('data/events.db');

const CACHE_VALIDITY_DAYS = 90; // Venue info stays valid for 3 months

/**
 * Get venue context from database cache, web search, or generic fallback
 */
export async function getVenueContext(
  venueName: string
): Promise<VenueContext> {
  console.log(`🏛️  Looking up venue: ${venueName}`);

  // 1. Check database cache
  const cached = getCachedVenueContext(venueName);
  if (cached && isRecentCache(cached.last_updated)) {
    console.log(`   ✅ Cache hit: ${venueName}`);
    return cached;
  }

  // 2. Try web search (using Task agent - FREE)
  console.log(`   🔍 Searching web for: ${venueName}`);
  const searchResult = await searchVenueInfo(venueName);

  if (searchResult) {
    console.log(`   ✅ Found via web search`);
    cacheVenueContext(searchResult);
    return searchResult;
  }

  // 3. Fallback to generic context
  console.log(`   ⚠️  Using generic context for: ${venueName}`);
  const generic = getGenericVenueContext(venueName);
  cacheVenueContext(generic);
  return generic;
}

/**
 * Get venue from database cache
 */
function getCachedVenueContext(venueName: string): VenueContext | null {
  const stmt = db.prepare(`
    SELECT * FROM venue_context
    WHERE venue_name = ?
  `);

  const result = stmt.get(venueName) as any;

  if (!result) return null;

  return {
    venue_name: result.venue_name,
    neighborhood: result.neighborhood,
    description: result.description,
    venue_type: result.venue_type,
    capacity: result.capacity,
    established_year: result.established_year,
    last_updated: result.last_updated,
  };
}

/**
 * Check if cached data is still recent (within validity period)
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
 * Search for venue information using Task agent (FREE web search)
 */
async function searchVenueInfo(
  venueName: string
): Promise<VenueContext | null> {
  // TODO: Implement Task agent web search
  // For now, return null to fall through to generic context
  // We'll implement this in the next step

  return null;
}

/**
 * Save venue context to database cache
 */
function cacheVenueContext(context: VenueContext): void {
  const stmt = db.prepare(`
    INSERT INTO venue_context (
      venue_name, neighborhood, description, venue_type,
      capacity, established_year, source
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(venue_name) DO UPDATE SET
      neighborhood = excluded.neighborhood,
      description = excluded.description,
      venue_type = excluded.venue_type,
      capacity = excluded.capacity,
      established_year = excluded.established_year,
      last_updated = CURRENT_TIMESTAMP,
      source = excluded.source
  `);

  stmt.run(
    context.venue_name,
    context.neighborhood || null,
    context.description || null,
    context.venue_type || null,
    context.capacity || null,
    context.established_year || null,
    'generic' // Will be 'web_search' when we implement that
  );
}

/**
 * Generate generic venue context as fallback
 */
function getGenericVenueContext(venueName: string): VenueContext {
  // Try to infer venue type from name
  const nameLower = venueName.toLowerCase();

  let venueType = 'cultural_venue';
  let description = `${venueName}, a cultural venue in Athens.`;

  if (
    nameLower.includes('club') ||
    nameLower.includes('note') ||
    nameLower.includes('blues')
  ) {
    venueType = 'music_club';
    description = `${venueName} is a music venue in Athens known for hosting live performances. The intimate club atmosphere provides an engaging setting for experiencing music in person.`;
  } else if (
    nameLower.includes('theater') ||
    nameLower.includes('theatre') ||
    nameLower.includes('stage')
  ) {
    venueType = 'theater';
    description = `${venueName} is a theatrical venue in Athens dedicated to live performance. The space provides a setting for dramatic works, offering audiences the immediacy of live storytelling.`;
  } else if (
    nameLower.includes('gallery') ||
    nameLower.includes('museum') ||
    nameLower.includes('annex')
  ) {
    venueType = 'gallery';
    description = `${venueName} is an art space in Athens featuring visual exhibitions. The gallery provides a dedicated environment for experiencing contemporary and historical art.`;
  } else if (
    nameLower.includes('cinema') ||
    nameLower.includes('movie') ||
    nameLower.includes('film')
  ) {
    venueType = 'cinema';
    description = `${venueName} is a cinema in Athens screening films in a professional theater environment. The venue offers quality projection and sound for cinematic viewing.`;
  } else if (
    nameLower.includes('snfcc') ||
    nameLower.includes('stavros') ||
    nameLower.includes('cultural center')
  ) {
    venueType = 'cultural_center';
    description = `${venueName} is a cultural institution in Athens offering diverse programming across arts, education, and community engagement. The center provides accessible facilities for cultural participation.`;
  }

  return {
    venue_name: venueName,
    description,
    venue_type: venueType,
  };
}

/**
 * Seed database with known Athens venues (manual curation)
 */
export function seedKnownVenues(): void {
  const knownVenues: VenueContext[] = [
    {
      venue_name: 'Half Note Jazz Club',
      neighborhood: 'Mets',
      description:
        "Athens' premier jazz venue since 1994, located at the foot of Pangrati hill. The intimate 130-seat club features acoustics specifically designed for small ensemble jazz, creating the proximity necessary for appreciating improvisational subtleties. Known for booking serious jazz musicians who prioritize artistic integrity over commercial appeal.",
      venue_type: 'jazz_club',
      capacity: 130,
      established_year: 1994,
    },
    {
      venue_name: 'Megaron Mousikis',
      neighborhood: 'Ilisia',
      description:
        "The Athens Concert Hall (Megaron Mousikis) serves as Greece's premier venue for classical music and cultural programming. Since its opening in 1991, the Megaron has cultivated Athens' reputation as a cultural hub, hosting international artists alongside Greek talent. The hall's acoustics are engineered for unamplified performance, ideal for chamber music and orchestral works.",
      venue_type: 'concert_hall',
      capacity: 1900,
      established_year: 1991,
    },
    {
      venue_name: 'Megaron Annex M',
      neighborhood: 'Ilisia',
      description:
        "Megaron Annex M, located in the service courtyard (Ypiresiaki Avli) of the Athens Concert Hall, provides an intimate gallery space for visual arts. This exhibition space within Athens's premier music institution reflects Megaron's commitment to interdisciplinary cultural programming, offering a contained environment suited to conceptual and contemporary exhibitions.",
      venue_type: 'gallery',
      capacity: 50,
    },
    {
      venue_name: 'SNFCC',
      neighborhood: 'Kallithea',
      description:
        "The Stavros Niarchos Foundation Cultural Center (SNFCC) represents one of Europe's most significant cultural institutions. Opened in 2016, the complex houses the National Library of Greece and Greek National Opera, plus extensive public facilities including the Maker Space, park, and educational programs. The SNFCC's mission centers on accessible cultural programming and community engagement.",
      venue_type: 'cultural_center',
      established_year: 2016,
    },
    {
      venue_name: 'SNFCC Maker Space',
      neighborhood: 'Kallithea',
      description:
        "Located within the Stavros Niarchos Foundation Cultural Center, the Maker Space provides Athens' premier public facility for creative technology and digital fabrication. Equipped with professional-grade 3D printers, design software, and educational resources, the space offers hands-on access to emerging technologies with expert facilitation.",
      venue_type: 'workshop_space',
    },
    {
      venue_name: 'Six D.O.G.S',
      neighborhood: 'Monastiraki',
      description:
        'Six D.O.G.S operates as a multi-purpose cultural venue in central Athens, hosting concerts, exhibitions, workshops, and community events. The space combines an indoor performance area with an outdoor courtyard, creating flexible environments for diverse cultural programming. Known for supporting independent artists and experimental work.',
      venue_type: 'multi_space',
      established_year: 2009,
    },
    {
      venue_name: 'Los Angeles Comedy Club',
      neighborhood: 'Athens',
      description:
        "Athens' dedicated stand-up comedy venue, following the American comedy club model with focused attention on performers and minimal distractions. Unlike traditional Greek entertainment venues that mix formats, this club prioritizes the material over spectacle, creating an atmosphere specifically designed for comedy performance.",
      venue_type: 'comedy_club',
    },
    {
      venue_name: 'CHNOPS',
      neighborhood: 'Athens',
      description:
        'CHNOPS Flavouring Curiosity takes its name from the six chemical elements composing 99% of living matter (Carbon, Hydrogen, Nitrogen, Oxygen, Phosphorus, Sulfur). The space functions as both culinary laboratory and creative studio, hosting events that blur boundaries between different forms of sensory experience, emphasizing creation as a fundamental human need.',
      venue_type: 'experiential_space',
    },
  ];

  for (const venue of knownVenues) {
    const stmt = db.prepare(`
      INSERT INTO venue_context (
        venue_name, neighborhood, description, venue_type,
        capacity, established_year, source
      ) VALUES (?, ?, ?, ?, ?, ?, 'manual')
      ON CONFLICT(venue_name) DO NOTHING
    `);

    stmt.run(
      venue.venue_name,
      venue.neighborhood || null,
      venue.description,
      venue.venue_type,
      venue.capacity || null,
      venue.established_year || null
    );
  }

  console.log(`✅ Seeded ${knownVenues.length} known venues`);
}
