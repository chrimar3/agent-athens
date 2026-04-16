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
  source: 'nominatim' | 'google';
  osmType?: string;              // 'node' | 'way' | 'relation' (Nominatim only)
  category?: string;             // Nominatim class or Google primary type
  googleLocationType?: string;   // 'ROOFTOP' | 'RANGE_INTERPOLATED' etc. (Google only)
  matchQuery: string;            // Which query variant succeeded
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
  userAgent: 'AgentAthens/1.0 (cultural-events-calendar; https://agentathens.com)',
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

// ── Google Geocoding Types ─────────────────────

interface GoogleGeocodeResponse {
  status: 'OK' | 'ZERO_RESULTS' | 'OVER_DAILY_LIMIT' | 'OVER_QUERY_LIMIT' | 'REQUEST_DENIED' | 'INVALID_REQUEST' | 'UNKNOWN_ERROR';
  results: GoogleGeocodeResult[];
  error_message?: string;
}

interface GoogleGeocodeResult {
  geometry: {
    location: { lat: number; lng: number };
    location_type: 'ROOFTOP' | 'RANGE_INTERPOLATED' | 'GEOMETRIC_CENTER' | 'APPROXIMATE';
  };
  formatted_address: string;
  types: string[];
  address_components: Array<{
    long_name: string;
    short_name: string;
    types: string[];
  }>;
}

// Google rate limiting — separate from Nominatim (different TOS, different limits)
let googleLastRequestTime = 0;
const GOOGLE_MIN_INTERVAL_MS = 200; // 5 req/sec (conservative vs Google's 50/sec)

async function googleRateLimitedFetch(url: string): Promise<Response> {
  const now = Date.now();
  const elapsed = now - googleLastRequestTime;
  if (elapsed < GOOGLE_MIN_INTERVAL_MS) {
    await new Promise(resolve => setTimeout(resolve, GOOGLE_MIN_INTERVAL_MS - elapsed));
  }
  googleLastRequestTime = Date.now();
  return fetch(url);
}

/**
 * Assign confidence based on Google Geocoding result quality.
 * - high: ROOFTOP with establishment/POI types (exact building match)
 * - medium: ROOFTOP without POI, or RANGE_INTERPOLATED (street-level)
 * - low: GEOMETRIC_CENTER or APPROXIMATE (area centroid — rejected)
 */
function assignGoogleConfidence(result: GoogleGeocodeResult): 'high' | 'medium' | 'low' {
  const { location_type } = result.geometry;
  const types = result.types;

  const poiTypes = ['establishment', 'point_of_interest', 'premise', 'subpremise'];
  if (location_type === 'ROOFTOP' && types.some(t => poiTypes.includes(t))) {
    return 'high';
  }

  if (location_type === 'ROOFTOP' || location_type === 'RANGE_INTERPOLATED') {
    return 'medium';
  }

  return 'low';
}

async function queryGoogle(
  query: string,
  config: GeocodeConfig
): Promise<GoogleGeocodeResult | null> {
  const apiKey = process.env.GOOGLE_GEOCODING_API_KEY;
  if (!apiKey) return null;

  const params = new URLSearchParams({
    address: `${query}, ${config.city}, ${config.country}`,
    key: apiKey,
    bounds: `${config.boundingBox.minLat},${config.boundingBox.minLon}|${config.boundingBox.maxLat},${config.boundingBox.maxLon}`,
  });

  const url = `https://maps.googleapis.com/maps/api/geocode/json?${params}`;

  try {
    const response = await googleRateLimitedFetch(url);
    if (!response.ok) {
      console.error(`  Google Geocoding HTTP ${response.status} for: ${query}`);
      return null;
    }

    const data = await response.json() as GoogleGeocodeResponse;

    if (data.status !== 'OK' || !data.results.length) {
      if (data.status === 'REQUEST_DENIED') {
        console.error(`  Google Geocoding API key invalid: ${data.error_message}`);
      }
      return null;
    }

    // Find first result within bounding box
    for (const result of data.results) {
      const { lat, lng } = result.geometry.location;
      if (isWithinBoundingBox(lat, lng, config)) {
        return result;
      }
    }

    return null;
  } catch (err) {
    console.error(`  Google Geocoding error for "${query}":`, (err as Error).message);
    return null;
  }
}

// ── Shared Utilities ───────────────────────────

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

  // ── Google fallback (when Nominatim exhausted) ──
  const googleResult = await queryGoogle(venueName, config);
  if (googleResult) {
    const confidence = assignGoogleConfidence(googleResult);
    if (confidence !== 'low') {
      const { lat, lng } = googleResult.geometry.location;
      return {
        lat,
        lon: lng,
        displayName: googleResult.formatted_address,
        confidence,
        source: 'google',
        category: googleResult.types[0],
        googleLocationType: googleResult.geometry.location_type,
        matchQuery: `${venueName} [google]`,
      };
    }
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
  googleLastRequestTime = 0;
}
