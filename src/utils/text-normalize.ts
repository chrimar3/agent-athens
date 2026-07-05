/**
 * Text normalization for cross-source event deduplication
 *
 * Shared utilities for canonicalizing titles and venues across
 * different sources that use different encoding, casing, and naming.
 *
 * @see scripts/merge-duplicates.ts — primary consumer
 * @see scripts/remove-duplicates.ts — could adopt these functions
 */

import { normalize } from './normalize-key';

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
  // residentadvisor date tails: "Rivo I Sat Aug 8", "Mayans with Max Styler
  // I Thu 30 July", "KAS:ST I Anfisa Letyago I Fri July 24" (strips the last
  // " I <day?> <month> <num>" / " I <day?> <num> <month>" segment only).
  /\s+i\s+(?:(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*\s+)?(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}|\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*)$/i,
];

// Leading articles
const LEADING_ARTICLES = /^(οι|η|ο|το|τα|the)\s+/i;

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

  // Final fold: accent-fold (Greek + Latin), final-sigma fold, punctuation
  // strip, whitespace collapse. Makes ALL-CAPS unaccented Greek titles
  // ("ΘΕΟΦΙΛΟΣ Sold") compare equal to accented ones ("Θεόφιλος Sold") —
  // the largest missed-duplicate class in specs/dedup-diagnostic.md.
  return normalize(result);
}

// ============================================================================
// Artist/Lineup Segment Extraction (duplicate-detector Layer 4)
// ============================================================================

// Marks a lineup or promoter-prefix split point, e.g.
// "Jafari: Monolink + Nick Jojo + Magda Kay" → ["jafari", "monolink", "nick jojo", "magda kay"]
// Literal pipe (residentadvisor: "MONILINK | NICK JOJO | MAGDA KAY"),
// spaced dashes (subtitle/lineup split), "pres."/"with" promoter connectors,
// and residentadvisor's spaced-I separator are all split points.
const LINEUP_DELIMITERS =
  /:|\+|&(?!amp;)|\/|,|\||–|—|\s-\s|\bvs\.?\b|\bb2b\b|\bpres\b\.?|\bwith\b|\si\s/gi;

/**
 * Split a title into candidate lineup segments for matching against a bare
 * headliner title from another source (e.g. "Monolink" vs a promoter's
 * full-lineup listing "Jafari: Monolink + Nick Jojo + Magda Kay"). Each
 * segment is run through canonicalizeTitle so segment equality lines up
 * with whole-title equality elsewhere in the matcher.
 *
 * Titles with no delimiter aren't lineup listings, so they yield no segments
 * — this keeps the caller from ever comparing a plain title against itself.
 */
export function extractArtistSegments(title: string): string[] {
  if (!title) return [];
  const parts = title.split(LINEUP_DELIMITERS);
  if (parts.length < 2) return [];
  return parts.map((p) => canonicalizeTitle(p)).filter((p) => p.length > 0);
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

const STOPWORDS_RAW = [
  // Greek articles and prepositions
  'οι', 'η', 'ο', 'το', 'τα', 'τη', 'τον', 'τους', 'στο', 'στη', 'στον',
  'στην', 'στα', 'στις', 'στους', 'από', 'για', 'με', 'και', 'σε',
  'του', 'της', 'των', 'μια', 'ένα',
  // English articles and prepositions
  'the', 'a', 'an', 'in', 'at', 'on', 'of', 'to', 'for', 'and', 'or',
  // Music-specific stopwords
  'live', 'with', 'feat', 'featuring', 'pres', 'presents', 'b2b',
  'vol', 'part', 'dj', 'mc',
  // Day names (noise in titles like "Deep Dish I Fri June 12")
  'mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun',
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
  // Month names
  'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
  'january', 'february', 'march', 'april', 'june', 'july', 'august',
  'september', 'october', 'november', 'december',
];

// Tokens are accent-folded via normalize(), so the stopword set must hold
// folded forms too ('από' → 'απο') or Greek stopwords would never match.
const STOPWORDS = new Set(STOPWORDS_RAW.map((w) => normalize(w)));

const MIN_TOKEN_LENGTH = 3;

export function extractSignificantTokens(title: string): string[] {
  if (!title) return [];

  // normalize() folds case + accents (Greek AND Latin — the old
  // stripLatinDiacritics helper left Greek accents in, so ALL-CAPS
  // unaccented Greek never token-matched accented Greek) and splits
  // punctuation to spaces.
  const tokens = normalize(decodeHtmlEntities(title)).split(' ').filter(Boolean);

  return tokens.filter(
    (token) => token.length >= MIN_TOKEN_LENGTH && !STOPWORDS.has(token)
  );
}

// ============================================================================
// Edit Distance (typo tolerance)
// ============================================================================

/**
 * True when a and b are identical or one single-character edit apart
 * (substitution, insertion, or deletion) — "monilink" ≈ "monolink".
 *
 * Policy (enforced by callers, not here): fuzzy matching only applies to
 * tokens/segments ≥5 chars with no digits, so sequels ("… 2" vs "… 3")
 * and short names ("anna"/"anny") never fuzzy-match.
 */
export function withinEditDistanceOne(a: string, b: string): boolean {
  if (a === b) return true;
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > 1) return false;

  if (la === lb) {
    // Exactly one substitution allowed
    let diffs = 0;
    for (let i = 0; i < la; i++) {
      if (a[i] !== b[i] && ++diffs > 1) return false;
    }
    return diffs === 1;
  }

  // One insertion/deletion: shorter must match longer with one skip
  const [short, long] = la < lb ? [a, b] : [b, a];
  let i = 0;
  let j = 0;
  let skipped = false;
  while (i < short.length && j < long.length) {
    if (short[i] === long[j]) {
      i++;
      j++;
    } else {
      if (skipped) return false;
      skipped = true;
      j++; // skip one char in the longer string
    }
  }
  return true;
}
