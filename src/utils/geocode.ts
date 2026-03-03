/**
 * Multi-city geocoding utility using OpenStreetMap Nominatim.
 *
 * Architecture: Config-driven bounding box validation prevents wrong-city results.
 * Rate limiting (1 req/sec) enforced per Nominatim TOS.
 * Confidence scoring: high (exact POI match), medium (partial), low (city-level — rejected).
 *
 * @see https://nominatim.org/release-docs/latest/api/Search/
 */

export interface GeocodeResult {
  lat: number;
  lon: number;
  displayName: string;
  confidence: 'high' | 'medium' | 'low';
  source: 'nominatim';
  osmType: string;       // 'node' | 'way' | 'relation'
  category: string;      // e.g., 'amenity', 'tourism', 'building'
  matchQuery: string;    // Which query variant succeeded
}

export interface GeocodeConfig {
  city: string;
  cityGreek?: string;     // Greek variant for fallback queries
  country: string;
  countryCode: string;    // ISO 3166-1 alpha-2, used as Nominatim filter
  boundingBox: {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
  };
  userAgent: string;
}

export const ATHENS_CONFIG: GeocodeConfig = {
  city: 'Athens',
  cityGreek: 'Αθήνα',
  country: 'Greece',
  countryCode: 'gr',
  boundingBox: {
    minLat: 37.85,
    maxLat: 38.10,
    minLon: 23.55,
    maxLon: 23.85,
  },
  userAgent: 'AgentAthens/1.0 (cultural-events-calendar; https://agentathens.netlify.app)',
};

// Rate limiting state
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL_MS = 1100; // >1 second per Nominatim TOS

async function rateLimitedFetch(url: string, headers: Record<string, string>): Promise<Response> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < MIN_REQUEST_INTERVAL_MS) {
    await new Promise(resolve => setTimeout(resolve, MIN_REQUEST_INTERVAL_MS - elapsed));
  }
  lastRequestTime = Date.now();
  return fetch(url, { headers });
}

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
  osm_type: string;
  class: string;
  type: string;
  importance: number;
  boundingbox: string[];
}

function isWithinBoundingBox(lat: number, lon: number, config: GeocodeConfig): boolean {
  const { minLat, maxLat, minLon, maxLon } = config.boundingBox;
  return lat >= minLat && lat <= maxLat && lon >= minLon && lon <= maxLon;
}

/**
 * Assign confidence based on Nominatim result quality.
 * - high: POI-level match (amenity, tourism, building, leisure)
 * - medium: street/neighborhood-level match
 * - low: city/admin-level match (essentially useless)
 */
function assignConfidence(result: NominatimResult): 'high' | 'medium' | 'low' {
  const poiClasses = ['amenity', 'tourism', 'building', 'leisure', 'shop', 'historic'];
  if (poiClasses.includes(result.class)) {
    return 'high';
  }

  const streetClasses = ['highway', 'place'];
  const streetTypes = ['neighbourhood', 'suburb', 'residential', 'street'];
  if (streetClasses.includes(result.class) && streetTypes.includes(result.type)) {
    return 'medium';
  }

  // City-level or administrative
  return 'low';
}

async function queryNominatim(
  query: string,
  config: GeocodeConfig
): Promise<NominatimResult | null> {
  const params = new URLSearchParams({
    q: query,
    format: 'json',
    limit: '3',
    countrycodes: config.countryCode,
    addressdetails: '1',
  });

  const url = `https://nominatim.openstreetmap.org/search?${params}`;

  try {
    const response = await rateLimitedFetch(url, {
      'User-Agent': config.userAgent,
      'Accept': 'application/json',
    });

    if (!response.ok) {
      console.error(`  Nominatim HTTP ${response.status} for: ${query}`);
      return null;
    }

    const results = await response.json() as NominatimResult[];
    if (!results.length) return null;

    // Find first result within bounding box
    for (const result of results) {
      const lat = parseFloat(result.lat);
      const lon = parseFloat(result.lon);
      if (isWithinBoundingBox(lat, lon, config)) {
        return result;
      }
    }

    return null; // All results outside bounding box
  } catch (err) {
    console.error(`  Nominatim error for "${query}":`, (err as Error).message);
    return null;
  }
}

/**
 * Geocode a venue name using Nominatim with fallback query strategies.
 *
 * Query order:
 *   1. "Venue Name, City, Country"
 *   2. "Venue Name, CityGreek" (Greek city name)
 *   3. "Venue Name" (bare — relies on countrycodes filter)
 *
 * Returns null if no valid match found or result is low confidence.
 */
export async function geocodeVenue(
  venueName: string,
  config: GeocodeConfig = ATHENS_CONFIG
): Promise<GeocodeResult | null> {
  // Skip obviously non-geocodable names
  const skipPatterns = ['Πολλαπλοί Χώροι', 'TBA', 'Online', 'Livestream', 'Διάφοροι χώροι'];
  if (skipPatterns.some(p => venueName.toLowerCase().includes(p.toLowerCase()))) {
    return null;
  }

  const queries = [
    `${venueName}, ${config.city}, ${config.country}`,
  ];
  if (config.cityGreek) {
    queries.push(`${venueName}, ${config.cityGreek}`);
  }
  queries.push(venueName);

  for (const query of queries) {
    const result = await queryNominatim(query, config);
    if (!result) continue;

    const confidence = assignConfidence(result);

    // Reject low-confidence (city-level) results
    if (confidence === 'low') continue;

    return {
      lat: parseFloat(result.lat),
      lon: parseFloat(result.lon),
      displayName: result.display_name,
      confidence,
      source: 'nominatim',
      osmType: result.osm_type,
      category: result.class,
      matchQuery: query,
    };
  }

  return null;
}

/**
 * Batch geocode multiple venue names with progress reporting.
 * Returns a map of venue name → GeocodeResult.
 */
export async function geocodeVenues(
  venueNames: string[],
  config: GeocodeConfig = ATHENS_CONFIG,
  options: { minConfidence?: 'high' | 'medium'; onProgress?: (done: number, total: number) => void } = {}
): Promise<Map<string, GeocodeResult>> {
  const { minConfidence = 'medium', onProgress } = options;
  const results = new Map<string, GeocodeResult>();

  for (let i = 0; i < venueNames.length; i++) {
    const name = venueNames[i];
    onProgress?.(i + 1, venueNames.length);

    const result = await geocodeVenue(name, config);
    if (result) {
      if (minConfidence === 'high' && result.confidence !== 'high') continue;
      results.set(name, result);
    }
  }

  return results;
}

/** Reset rate limiting state (for testing) */
export function _resetRateLimit(): void {
  lastRequestTime = 0;
}
