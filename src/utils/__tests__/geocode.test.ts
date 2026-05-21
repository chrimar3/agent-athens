import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import { geocodeVenue, geocodeVenues, _resetRateLimit, ATHENS_CONFIG } from '../geocode';
import type { GeocodeConfig } from '../geocode';

// ── Mock Nominatim Responses ────────────────────────

/** Megaron Mousikis — a well-known Athens concert hall */
const MEGARON_RESPONSE = [
  {
    lat: '37.9762',
    lon: '23.7493',
    display_name: 'Μέγαρο Μουσικής Αθηνών, Λεωφ. Βασιλίσσης Σοφίας, Αθήνα, Greece',
    osm_type: 'way',
    class: 'amenity',
    type: 'arts_centre',
    importance: 0.45,
    boundingbox: ['37.975', '37.977', '23.748', '23.751'],
  },
];

/** Result in Thessaloniki — should be rejected by Athens bounding box */
const THESSALONIKI_RESPONSE = [
  {
    lat: '40.6401',
    lon: '22.9444',
    display_name: 'Μέγαρο Μουσικής Θεσσαλονίκης, Θεσσαλονίκη, Greece',
    osm_type: 'way',
    class: 'amenity',
    type: 'arts_centre',
    importance: 0.35,
    boundingbox: ['40.639', '40.641', '22.943', '22.946'],
  },
];

/** City-level result — low confidence, should be rejected */
const CITY_LEVEL_RESPONSE = [
  {
    lat: '37.9838',
    lon: '23.7275',
    display_name: 'Αθήνα, Αττική, Ελλάδα',
    osm_type: 'relation',
    class: 'place',
    type: 'city',
    importance: 0.8,
    boundingbox: ['37.85', '38.08', '23.60', '23.82'],
  },
];

/** Street-level result — medium confidence */
const STREET_RESPONSE = [
  {
    lat: '37.9780',
    lon: '23.7340',
    display_name: 'Οδός Πατησίων, Αθήνα',
    osm_type: 'way',
    class: 'highway',
    type: 'residential',
    importance: 0.3,
    boundingbox: ['37.977', '37.979', '23.733', '23.735'],
  },
];

// ── Test Helpers ────────────────────────────────────

const originalFetch = globalThis.fetch;
let fetchMock: ReturnType<typeof mock>;

function mockFetchResponse(body: unknown, status = 200) {
  fetchMock = mock(() =>
    Promise.resolve(new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }))
  );
  globalThis.fetch = fetchMock as unknown as typeof fetch;
}

function mockFetchSequence(responses: Array<{ body: unknown; status?: number }>) {
  let callIndex = 0;
  fetchMock = mock(() => {
    const resp = responses[callIndex] ?? responses[responses.length - 1];
    callIndex++;
    return Promise.resolve(new Response(JSON.stringify(resp.body), {
      status: resp.status ?? 200,
      headers: { 'Content-Type': 'application/json' },
    }));
  });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
}

// Barcelona config — for multi-city tests
const BARCELONA_CONFIG: GeocodeConfig = {
  city: 'Barcelona',
  country: 'Spain',
  countryCode: 'es',
  boundingBox: {
    minLat: 41.32,
    maxLat: 41.47,
    minLon: 2.05,
    maxLon: 2.23,
  },
  userAgent: 'TestAgent/1.0',
};

// ── Tests ───────────────────────────────────────────

describe('geocodeVenue', () => {
  beforeEach(() => {
    _resetRateLimit();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test('returns coordinates for known Athens venue', async () => {
    mockFetchResponse(MEGARON_RESPONSE);

    const result = await geocodeVenue('Μέγαρο Μουσικής Αθηνών');
    expect(result).not.toBeNull();
    expect(result!.lat).toBeCloseTo(37.9762, 3);
    expect(result!.lon).toBeCloseTo(23.7493, 3);
    expect(result!.confidence).toBe('high');
    expect(result!.source).toBe('nominatim');
  });

  test('rejects results outside Athens bounding box', async () => {
    // All three query variants return Thessaloniki result
    mockFetchResponse(THESSALONIKI_RESPONSE);

    const result = await geocodeVenue('Μέγαρο Μουσικής');
    expect(result).toBeNull();
  });

  test('assigns high confidence for amenity/tourism POI', async () => {
    mockFetchResponse(MEGARON_RESPONSE);

    const result = await geocodeVenue('Μέγαρο Μουσικής Αθηνών');
    expect(result!.confidence).toBe('high');
    expect(result!.category).toBe('amenity');
  });

  test('assigns medium confidence for street-level match', async () => {
    mockFetchResponse(STREET_RESPONSE);

    const result = await geocodeVenue('Πατησίων 123');
    expect(result).not.toBeNull();
    expect(result!.confidence).toBe('medium');
  });

  test('rejects low-confidence city-level results', async () => {
    mockFetchResponse(CITY_LEVEL_RESPONSE);

    const result = await geocodeVenue('Κάποιος Χώρος');
    expect(result).toBeNull();
  });

  test('returns null for unknown venue (empty results)', async () => {
    mockFetchResponse([]);

    const result = await geocodeVenue('Ανύπαρκτο Θέατρο Φαντασίας');
    expect(result).toBeNull();
  });

  test('tries Greek fallback query on first failure', async () => {
    // First query (English city) returns empty, second (Greek city) succeeds
    mockFetchSequence([
      { body: [] },                  // "Venue, Athens, Greece" — no results
      { body: MEGARON_RESPONSE },    // "Venue, Αθήνα" — found it
    ]);

    const result = await geocodeVenue('Μέγαρο Μουσικής Αθηνών');
    expect(result).not.toBeNull();
    expect(result!.lat).toBeCloseTo(37.9762, 3);
    expect(result!.matchQuery).toContain('Αθήνα');
  });

  test('skips non-geocodable names (Πολλαπλοί Χώροι, TBA)', async () => {
    mockFetchResponse(MEGARON_RESPONSE); // Should never be called

    const multi = await geocodeVenue('Πολλαπλοί Χώροι');
    expect(multi).toBeNull();

    const tba = await geocodeVenue('TBA');
    expect(tba).toBeNull();

    const online = await geocodeVenue('Online Event');
    expect(online).toBeNull();

    // Verify fetch was never called
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('handles HTTP errors gracefully', async () => {
    mockFetchResponse({ error: 'rate limited' }, 429);

    const result = await geocodeVenue('Test Venue');
    expect(result).toBeNull();
  });

  test('handles network errors gracefully', async () => {
    fetchMock = mock(() => Promise.reject(new Error('Network error')));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await geocodeVenue('Test Venue');
    expect(result).toBeNull();
  });

  test('validates bounding box is city-specific', async () => {
    // Athens coordinates should be rejected with Barcelona config
    mockFetchResponse(MEGARON_RESPONSE);

    const result = await geocodeVenue('Μέγαρο Μουσικής', undefined, BARCELONA_CONFIG);
    expect(result).toBeNull();
  });

  test('sends correct User-Agent header', async () => {
    mockFetchResponse(MEGARON_RESPONSE);

    await geocodeVenue('Test');
    expect(fetchMock).toHaveBeenCalled();

    const callArgs = (fetchMock as any).mock.calls[0];
    const url = callArgs[0] as string;
    const headers = callArgs[1]?.headers as Record<string, string>;
    expect(headers['User-Agent']).toBe(ATHENS_CONFIG.userAgent);
    expect(url).toContain('countrycodes=gr');
  });
});

// ── Google Fallback Mock Responses ─────────────

/** Google Geocoding — ROOFTOP establishment (high confidence) */
const GOOGLE_ROOFTOP_RESPONSE = {
  status: 'OK',
  results: [{
    geometry: {
      location: { lat: 37.9810, lng: 23.7330 },
      location_type: 'ROOFTOP',
    },
    formatted_address: 'Ippokratous 17, Athina 106 79, Greece',
    types: ['establishment', 'point_of_interest'],
    address_components: [],
  }],
};

/** Google Geocoding — APPROXIMATE city-level (low confidence, rejected) */
const GOOGLE_APPROXIMATE_RESPONSE = {
  status: 'OK',
  results: [{
    geometry: {
      location: { lat: 37.9838, lng: 23.7275 },
      location_type: 'APPROXIMATE',
    },
    formatted_address: 'Athens, Greece',
    types: ['locality', 'political'],
    address_components: [],
  }],
};

describe('Google fallback', () => {
  beforeEach(() => {
    _resetRateLimit();
    process.env.GOOGLE_GEOCODING_API_KEY = 'test-key';
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete process.env.GOOGLE_GEOCODING_API_KEY;
  });

  test('falls back to Google when Nominatim returns no results', async () => {
    // 3 Nominatim calls (empty) + 1 Google call (success)
    mockFetchSequence([
      { body: [] },
      { body: [] },
      { body: [] },
      { body: GOOGLE_ROOFTOP_RESPONSE },
    ]);

    const result = await geocodeVenue('Obscure Bar');
    expect(result).not.toBeNull();
    expect(result!.source as string).toBe('google');
    expect(result!.confidence).toBe('high');
    expect(result!.lat).toBeCloseTo(37.9810, 3);
    expect(result!.lon).toBeCloseTo(23.7330, 3);
    expect(result!.matchQuery).toContain('[google]');
  });

  test('does not call Google when Nominatim succeeds', async () => {
    mockFetchResponse(MEGARON_RESPONSE);

    const result = await geocodeVenue('Μέγαρο Μουσικής Αθηνών');
    expect(result!.source).toBe('nominatim');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('skips Google when no API key is set', async () => {
    delete process.env.GOOGLE_GEOCODING_API_KEY;
    mockFetchResponse([]);

    const result = await geocodeVenue('Unknown Venue');
    expect(result).toBeNull();
    // 3 Nominatim calls, 0 Google calls
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  test('rejects Google APPROXIMATE results as low confidence', async () => {
    mockFetchSequence([
      { body: [] },
      { body: [] },
      { body: [] },
      { body: GOOGLE_APPROXIMATE_RESPONSE },
    ]);

    const result = await geocodeVenue('Vague Place');
    expect(result).toBeNull();
  });

  test('assigns medium confidence for RANGE_INTERPOLATED', async () => {
    const interpolatedResponse = {
      status: 'OK',
      results: [{
        geometry: {
          location: { lat: 37.9800, lng: 23.7300 },
          location_type: 'RANGE_INTERPOLATED',
        },
        formatted_address: 'Ippokratous 99, Athina, Greece',
        types: ['street_address'],
        address_components: [],
      }],
    };
    mockFetchSequence([
      { body: [] }, { body: [] }, { body: [] },
      { body: interpolatedResponse },
    ]);

    const result = await geocodeVenue('Some Address');
    expect(result).not.toBeNull();
    expect(result!.confidence).toBe('medium');
    expect(result!.source as string).toBe('google');
  });

  test('rejects Google results outside Athens bounding box', async () => {
    const outsideBoundsResponse = {
      status: 'OK',
      results: [{
        geometry: {
          location: { lat: 40.6401, lng: 22.9444 },
          location_type: 'ROOFTOP',
        },
        formatted_address: 'Thessaloniki, Greece',
        types: ['establishment'],
        address_components: [],
      }],
    };
    mockFetchSequence([
      { body: [] }, { body: [] }, { body: [] },
      { body: outsideBoundsResponse },
    ]);

    const result = await geocodeVenue('Northern Venue');
    expect(result).toBeNull();
  });

  test('handles Google API errors gracefully', async () => {
    mockFetchSequence([
      { body: [] }, { body: [] }, { body: [] },
      { body: { status: 'REQUEST_DENIED', results: [], error_message: 'Invalid key' } },
    ]);

    const result = await geocodeVenue('Error Venue');
    expect(result).toBeNull();
  });
});

describe('addressHint (S151 — query-strategy extension)', () => {
  beforeEach(() => {
    _resetRateLimit();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete process.env.GOOGLE_GEOCODING_API_KEY;
  });

  test('uses address hint via Nominatim when name queries exhaust', async () => {
    // 3 name queries return empty → first address query hits
    mockFetchSequence([
      { body: [] },                  // name: "Don't be a Dick, Athens, Greece"
      { body: [] },                  // name: "Don't be a Dick, Αθήνα"
      { body: [] },                  // name: "Don't be a Dick"
      { body: STREET_RESPONSE },     // address: "Φειδίου 4, Athens, Greece" — hit
    ]);

    const result = await geocodeVenue("Don't be a Dick", 'Φειδίου 4, Αθήνα 106 78');
    expect(result).not.toBeNull();
    expect(result!.source).toBe('nominatim');
    expect(result!.confidence).toBe('medium');
    expect(result!.matchQuery).toContain('Φειδίου 4');
  });

  test('prefers address-driven Nominatim over name-driven Google fallback', async () => {
    // Anti-false-positive: without the address-hint path, the code would Google "Don't be a Dick"
    // and could match a different business (the Char. Trikoupi 52 case from spike).
    process.env.GOOGLE_GEOCODING_API_KEY = 'test-key';
    mockFetchSequence([
      { body: [] }, { body: [] }, { body: [] },  // 3 name queries empty
      { body: STREET_RESPONSE },                  // address query hits via Nominatim
    ]);

    const result = await geocodeVenue("Don't be a Dick", 'Φειδίου 4, Αθήνα 106 78');
    expect(result!.source).toBe('nominatim');
    // 4 fetch calls (3 name + 1 address). Should NOT have called Google (would be 5+).
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  test('falls through to Google when both name and address Nominatim queries fail', async () => {
    process.env.GOOGLE_GEOCODING_API_KEY = 'test-key';
    // 3 name + 3 address (city-suffixed / raw / venue+address) all empty, then Google hits.
    // 6 Nominatim calls × 1.1s rate limit > default 5s test timeout — bump to 10s.
    mockFetchSequence([
      { body: [] }, { body: [] }, { body: [] },  // name x3
      { body: [] }, { body: [] }, { body: [] },  // address x3
      { body: GOOGLE_ROOFTOP_RESPONSE },         // Google fallback
    ]);

    const result = await geocodeVenue("Don't be a Dick", 'Φειδίου 4');
    expect(result).not.toBeNull();
    expect(result!.source as string).toBe('google');
  }, 15000);

  test('skips address-hint path when hint is empty/undefined (backward-compatible)', async () => {
    // No addressHint passed — behaves exactly as before
    mockFetchResponse(MEGARON_RESPONSE);

    const result = await geocodeVenue('Μέγαρο Μουσικής Αθηνών');
    expect(result).not.toBeNull();
    expect(result!.source).toBe('nominatim');
  });

  test('skips address-hint path when hint is empty string', async () => {
    process.env.GOOGLE_GEOCODING_API_KEY = 'test-key';
    // empty hint should behave identically to no hint — go straight from name fail to Google
    mockFetchSequence([
      { body: [] }, { body: [] }, { body: [] },  // name x3 empty
      { body: GOOGLE_ROOFTOP_RESPONSE },          // Google fallback (no address attempted)
    ]);

    const result = await geocodeVenue('Some Venue', '');
    expect(result!.source as string).toBe('google');
    expect(fetchMock).toHaveBeenCalledTimes(4);  // 3 name + 0 address + 1 Google
  });
});

describe('geocodeVenues (batch)', () => {
  beforeEach(() => {
    _resetRateLimit();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test('returns results map for multiple venues', async () => {
    mockFetchResponse(MEGARON_RESPONSE);

    const results = await geocodeVenues(['Venue A', 'Venue B']);
    // Both should match since mock always returns same response
    expect(results.size).toBe(2);
  });

  test('filters by minConfidence when set to high', async () => {
    // Return street-level (medium confidence) results
    mockFetchResponse(STREET_RESPONSE);

    const results = await geocodeVenues(['Street Venue'], ATHENS_CONFIG, {
      minConfidence: 'high',
    });
    expect(results.size).toBe(0);
  });

  test('reports progress via callback', async () => {
    mockFetchResponse(MEGARON_RESPONSE);

    const progress: Array<[number, number]> = [];
    await geocodeVenues(['A', 'B', 'C'], ATHENS_CONFIG, {
      onProgress: (done, total) => progress.push([done, total]),
    });

    expect(progress).toEqual([
      [1, 3],
      [2, 3],
      [3, 3],
    ]);
  });
});
