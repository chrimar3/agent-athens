/**
 * Text normalization for cross-source event deduplication
 *
 * Shared utilities for canonicalizing titles and venues across
 * different sources that use different encoding, casing, and naming.
 *
 * @see scripts/merge-duplicates.ts — primary consumer
 * @see scripts/remove-duplicates.ts — could adopt these functions
 */

// ============================================================================
// Types
// ============================================================================

export interface VenueEntry {
  canonical_name: string;
  variations: string[];
  neighborhood?: string;
}

// ============================================================================
// Venue Aliases — patches for config gaps
// ============================================================================

// Maps lowercased venue names → lowercased canonical target.
// Applied ON TOP of the config-based lookup to handle:
// 1. Sub-halls that should map to parent venue
// 2. Duplicate/accented entries in the config
// 3. Cross-language aliases
const VENUE_ALIASES: Record<string, string> = {
  // Megaron sub-halls → main Megaron
  'αίθουσα διδασκαλίας μεγάρου μουσικής': 'μέγαρο μουσικής αθηνών',
  'αίθουσα διδασκαλίας του μεγάρου μουσικής αθηνών': 'μέγαρο μουσικής αθηνών',
  // Duplicate config entries (accent differences)
  'ίλιον plus': 'ιλιον plus',
  'ίλιον': 'ιλιον plus',
  // Cross-language aliases
  'myrtillo cafe': 'μύρτιλλο',
  'myrtillo': 'μύρτιλλο',
};

// ============================================================================
// HTML Entity Decoding
// ============================================================================

const NAMED_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
  '&nbsp;': ' ',
  '&laquo;': '«',
  '&raquo;': '»',
  '&ndash;': '–',
  '&mdash;': '—',
};

export function decodeHtmlEntities(text: string): string {
  if (!text) return '';

  let result = text;

  // Decode numeric entities: &#171; &#8211; &#39; etc.
  result = result.replace(/&#(\d+);/g, (_, code) => {
    return String.fromCharCode(parseInt(code, 10));
  });

  // Decode hex entities: &#x00AB; etc.
  result = result.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
    return String.fromCharCode(parseInt(hex, 16));
  });

  // Decode named entities
  for (const [entity, char] of Object.entries(NAMED_ENTITIES)) {
    result = result.replaceAll(entity, char);
  }

  return result;
}

// ============================================================================
// Title Canonicalization
// ============================================================================

// Prefixes to strip from titles (source-specific padding)
const TITLE_PREFIXES = [
  /^συναυλία μουσικής δωματίου\s+/i,
  /^συναυλία\s+(?=\S+\s)/i, // "Συναυλία X" but NOT "Συναυλία" alone
];

// Suffixes to strip
const TITLE_SUFFIXES = [
  /\s+live\s+in\s+(athens|greece|thessaloniki|αθήνα|ελλάδα|θεσσαλονίκη)$/i,
  /\s+live\s+@\s+[\w\s]+$/i,
];

// Leading articles
const LEADING_ARTICLES = /^(οι|η|ο|το|the)\s+/i;

export function canonicalizeTitle(title: string): string {
  if (!title) return '';

  let result = decodeHtmlEntities(title);

  // Lowercase
  result = result.toLowerCase();

  // Strip Greek quotes «»
  result = result.replace(/[«»]/g, '');

  // Strip prefixes
  for (const prefix of TITLE_PREFIXES) {
    result = result.replace(prefix, '');
  }

  // Strip suffixes
  for (const suffix of TITLE_SUFFIXES) {
    result = result.replace(suffix, '');
  }

  // Strip leading articles
  result = result.replace(LEADING_ARTICLES, '');

  // Collapse whitespace and trim
  result = result.replace(/\s+/g, ' ').trim();

  return result;
}

// ============================================================================
// Venue Canonicalization
// ============================================================================

// Cache: built once per venueConfig array identity
let _cachedConfig: VenueEntry[] | null = null;
let _cachedLookup: Map<string, string> | null = null;

function buildVenueLookup(venueConfig: VenueEntry[]): Map<string, string> {
  // Return cached if same config reference
  if (_cachedConfig === venueConfig && _cachedLookup) {
    return _cachedLookup;
  }

  const lookup = new Map<string, string>();

  for (const venue of venueConfig) {
    const canonical = venue.canonical_name.toLowerCase();

    // Map canonical_name itself
    lookup.set(canonical, canonical);

    // Map all variations
    for (const variation of venue.variations) {
      lookup.set(variation.toLowerCase(), canonical);
    }
  }

  // Apply VENUE_ALIASES on top (overrides config where needed)
  for (const [alias, target] of Object.entries(VENUE_ALIASES)) {
    lookup.set(alias, target);
  }

  _cachedConfig = venueConfig;
  _cachedLookup = lookup;
  return lookup;
}

export function canonicalizeVenue(
  venueName: string,
  venueConfig: VenueEntry[]
): string {
  if (!venueName) return '';

  const lookup = buildVenueLookup(venueConfig);
  const key = venueName.toLowerCase().trim();

  // Direct lookup first (exact match on canonical or variation)
  const direct = lookup.get(key);
  if (direct) return direct;

  // Try after decoding HTML entities
  const decoded = decodeHtmlEntities(key);
  const decodedMatch = lookup.get(decoded);
  if (decodedMatch) return decodedMatch;

  // Fallback: lowercased trimmed original
  return key;
}

// Reset cache (useful for tests)
export function _resetVenueCache(): void {
  _cachedConfig = null;
  _cachedLookup = null;
}

// ============================================================================
// Token Extraction
// ============================================================================

const STOPWORDS = new Set([
  // Greek articles and prepositions
  'οι', 'η', 'ο', 'το', 'τα', 'τη', 'τον', 'τους', 'στο', 'στη', 'στον',
  'στην', 'στα', 'στις', 'στους', 'από', 'για', 'με', 'και', 'σε',
  // English articles and prepositions
  'the', 'a', 'an', 'in', 'at', 'on', 'of', 'to', 'for', 'and', 'or',
  // Music-specific stopwords
  'live', 'with', 'feat', 'featuring', 'pres', 'presents', 'b2b',
  'vol', 'part', 'dj', 'mc',
]);

const MIN_TOKEN_LENGTH = 3;

export function extractSignificantTokens(title: string): string[] {
  if (!title) return [];

  const decoded = decodeHtmlEntities(title);

  // Split on non-alphanumeric (keep Greek letters)
  const tokens = decoded
    .toLowerCase()
    .split(/[^a-zA-Zα-ωά-ώϊϋΐΰ0-9]+/)
    .filter(Boolean);

  return tokens.filter(
    (token) => token.length >= MIN_TOKEN_LENGTH && !STOPWORDS.has(token)
  );
}
