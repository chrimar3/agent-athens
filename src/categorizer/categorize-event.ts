/**
 * Event Categorizer - Hybrid Rules-Based Categorization System
 *
 * Four-pass categorization:
 * 1. Venue-based rules (highest confidence) - some venues ONLY host one type
 * 2. Keyword rules (medium-high confidence) - scan title/description/genres
 * 3. URL path rules (medium confidence) - /music/gig/ → concert, etc.
 * 4. Source hints (medium confidence) - clubber.gr → dj_set, etc.
 *
 * Returns categorization result with confidence level for human review.
 */

import { join } from 'path';
import type { EventType } from '../types';

// Load config files
const CONFIG_PATH = join(import.meta.dir, '../../config');

interface VenueConfig {
  venue_type_map: Record<string, EventType>;
  venue_genre_override: Record<string, string>;
  mixed_venues: string[];
  source_type_hints: Record<string, EventType>;
}

interface KeywordConfig {
  priority_order: EventType[];
  categories: Record<EventType, CategoryRules>;
  whole_word_only: string[];
  concert_override_keywords: string[];
  schema_org_mapping: Record<EventType, string>;
}

interface CategoryRules {
  title_keywords: string[];
  description_keywords?: string[];
  genres?: string[];
  negative_keywords?: string[];
  notes?: string;
}

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface CategorizationResult {
  type: EventType;
  confidence: ConfidenceLevel;
  reason: string;
  genreHint?: string;
}

export interface EventInput {
  title: string;
  description?: string;
  fullDescription?: string;
  genres?: string[];
  venue?: string;
  url?: string;
  source?: string;
  currentType?: EventType;
}

interface UrlPatternConfig {
  patterns: Array<{
    url_contains: string;
    type: EventType;
    confidence: ConfidenceLevel;
  }>;
}

// Cache for loaded configs
let venueConfig: VenueConfig | null = null;
let keywordConfig: KeywordConfig | null = null;
let urlPatternConfig: UrlPatternConfig | null = null;

/**
 * Load venue categories config synchronously
 */
function loadVenueConfig(): VenueConfig {
  if (venueConfig) return venueConfig;

  try {
    const filePath = join(CONFIG_PATH, 'venue-categories.json');
    const fs = require('fs');
    const content = fs.readFileSync(filePath, 'utf-8');
    venueConfig = JSON.parse(content) as VenueConfig;
    return venueConfig;
  } catch (e) {
    // Return empty config if file doesn't exist
    venueConfig = {
      venue_type_map: {},
      venue_genre_override: {},
      mixed_venues: [],
      source_type_hints: {}
    };
    return venueConfig;
  }
}

/**
 * Load keyword categorization config synchronously
 */
function loadKeywordConfig(): KeywordConfig {
  if (keywordConfig) return keywordConfig;

  try {
    const filePath = join(CONFIG_PATH, 'categorization-keywords.json');
    const fs = require('fs');
    const content = fs.readFileSync(filePath, 'utf-8');
    keywordConfig = JSON.parse(content) as KeywordConfig;
    return keywordConfig;
  } catch (e) {
    // Return minimal config if file doesn't exist
    keywordConfig = {
      priority_order: ['concert'],
      categories: {
        concert: { title_keywords: ['concert', 'live'] }
      } as Record<EventType, CategoryRules>,
      whole_word_only: [],
      concert_override_keywords: [],
      schema_org_mapping: {} as Record<EventType, string>
    };
    return keywordConfig!;
  }
}

/**
 * Load URL pattern config synchronously
 */
function loadUrlPatternConfig(): UrlPatternConfig {
  if (urlPatternConfig) return urlPatternConfig;

  try {
    const filePath = join(CONFIG_PATH, 'url-category-patterns.json');
    const fs = require('fs');
    const content = fs.readFileSync(filePath, 'utf-8');
    urlPatternConfig = JSON.parse(content) as UrlPatternConfig;
    return urlPatternConfig;
  } catch (e) {
    urlPatternConfig = { patterns: [] };
    return urlPatternConfig;
  }
}

/**
 * Normalize venue name for matching
 */
function normalizeVenueName(venue: string): string {
  return venue
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/&#\d+;/g, '') // Remove HTML entities
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

/**
 * Check if venue matches any key in the map (case-insensitive, with normalization)
 */
function findVenueMatch(venue: string, venueMap: Record<string, EventType>): EventType | null {
  const normalizedVenue = normalizeVenueName(venue).toLowerCase();

  // First try exact match
  for (const [key, type] of Object.entries(venueMap)) {
    if (normalizeVenueName(key).toLowerCase() === normalizedVenue) {
      return type as EventType;
    }
  }

  // Then try contains match ONLY when venue has extra info appended (like address)
  // This prevents "SNFCC" from matching "GREEK NATIONAL OPERA - SNFCC"
  for (const [key, type] of Object.entries(venueMap)) {
    const normalizedKey = normalizeVenueName(key).toLowerCase();
    // Only match if the venue string contains the key AND venue is longer
    // This handles cases like "Astron, Λεωφόρος..." matching "Astron"
    if (normalizedVenue.length > normalizedKey.length && normalizedVenue.includes(normalizedKey)) {
      return type as EventType;
    }
  }

  return null;
}

/**
 * Check if keyword matches in text
 * Uses whole-word matching for problematic keywords
 */
function matchesKeyword(text: string, keyword: string, wholeWordOnly: string[]): boolean {
  const keywordLower = keyword.toLowerCase();
  const textLower = text.toLowerCase();

  // Multi-word keywords use simple includes
  if (keyword.includes(' ')) {
    return textLower.includes(keywordLower);
  }

  // Check if this keyword requires whole-word matching
  if (wholeWordOnly.some(w => w.toLowerCase() === keywordLower)) {
    const regex = new RegExp(`\\b${escapeRegex(keywordLower)}\\b`, 'i');
    return regex.test(text);
  }

  // All other keywords use simple includes
  return textLower.includes(keywordLower);
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Check if any genre matches the category's genres
 */
function matchesGenre(eventGenres: string[], categoryGenres: string[]): boolean {
  if (!eventGenres?.length || !categoryGenres?.length) return false;

  const eventGenresLower = eventGenres.map(g => g.toLowerCase());
  const categoryGenresLower = categoryGenres.map(g => g.toLowerCase());

  return eventGenresLower.some(eg =>
    categoryGenresLower.some(cg => eg === cg)
  );
}

/**
 * Pass 1: Venue-Based Categorization (Highest Confidence)
 * Skips mixed venues. For locked venues, yields if a high-confidence URL
 * pattern contradicts the lock (e.g., /music/gig/ at a theater venue).
 */
function categorizeByVenue(event: EventInput): CategorizationResult | null {
  if (!event.venue) return null;

  const config = loadVenueConfig();

  // Check mixed venues FIRST — these need keyword analysis, not venue-lock
  // Must happen before venue_type_map to prevent substring false positives
  // (e.g. "Rabbithole" contains "IT" which is a dj_set venue)
  const isMixed = config.mixed_venues.some(mv =>
    normalizeVenueName(mv).toLowerCase() === normalizeVenueName(event.venue || '').toLowerCase()
  );

  if (isMixed) {
    return null; // Let keyword matching handle it
  }

  const venueType = findVenueMatch(event.venue, config.venue_type_map);

  if (venueType) {
    // Check if a high-confidence URL pattern contradicts the venue lock.
    // This handles concerts at theater venues (e.g., /music/gig/ at Θέατρο Παλλάς).
    if (event.url) {
      const urlConfig = loadUrlPatternConfig();
      const urlLower = event.url.toLowerCase();
      for (const pattern of urlConfig.patterns) {
        if (pattern.confidence === 'high' && pattern.type !== venueType && urlLower.includes(pattern.url_contains)) {
          return null; // URL contradicts venue lock — let keywords/URL pass decide
        }
      }
    }

    const genreHint = config.venue_genre_override[event.venue];
    return {
      type: venueType,
      confidence: 'high',
      reason: `Venue "${event.venue}" always hosts ${venueType} events`,
      genreHint
    };
  }

  return null;
}

/**
 * Pass 2: Keyword-Based Categorization (Medium-High Confidence)
 */
function categorizeByKeywords(event: EventInput): CategorizationResult | null {
  const config = loadKeywordConfig();
  const text = `${event.title} ${event.description || ''} ${event.fullDescription || ''}`.toLowerCase();
  const title = event.title.toLowerCase();
  const genres = event.genres || [];

  // Check for concert override keywords first
  const hasConcertSignal = config.concert_override_keywords.some(k =>
    matchesKeyword(text, k, config.whole_word_only)
  );

  // Check each category in priority order
  for (const categoryType of config.priority_order) {
    const rules = config.categories[categoryType];
    if (!rules) continue;

    // Check negative keywords first (skip this category if present)
    if (rules.negative_keywords?.some(nk => text.includes(nk.toLowerCase()))) {
      continue;
    }

    // Special handling: skip exhibition/cinema if concert signals present
    if ((categoryType === 'exhibition' || categoryType === 'cinema') && hasConcertSignal) {
      continue;
    }

    // Special handling: "κωμωδία" in theater context should stay theater
    if (categoryType === 'show' && text.includes('κωμωδία') && text.includes('θεατρ')) {
      continue;
    }

    // Check title keywords (stronger signal)
    for (const keyword of rules.title_keywords) {
      if (matchesKeyword(title, keyword, config.whole_word_only)) {
        return {
          type: categoryType,
          confidence: 'medium',
          reason: `Title contains "${keyword}"`
        };
      }
    }

    // Check description keywords
    if (rules.description_keywords) {
      for (const keyword of rules.description_keywords) {
        if (matchesKeyword(text, keyword, config.whole_word_only)) {
          return {
            type: categoryType,
            confidence: 'medium',
            reason: `Description contains "${keyword}"`
          };
        }
      }
    }

    // Check genre match
    if (rules.genres && matchesGenre(genres, rules.genres)) {
      return {
        type: categoryType,
        confidence: 'medium',
        reason: `Genre matches ${categoryType} category`
      };
    }
  }

  return null;
}

/**
 * Pass 3: URL Path-Based Rules (Medium Confidence)
 * Catches concerts at mixed venues when keywords miss (e.g., artist-name-only titles).
 */
function categorizeByUrl(event: EventInput): CategorizationResult | null {
  if (!event.url) return null;

  const config = loadUrlPatternConfig();
  const urlLower = event.url.toLowerCase();

  for (const pattern of config.patterns) {
    if (urlLower.includes(pattern.url_contains)) {
      return {
        type: pattern.type,
        confidence: pattern.confidence,
        reason: `URL contains "${pattern.url_contains}"`
      };
    }
  }

  return null;
}

/**
 * Pass 4: Source-Based Hints (Medium Confidence)
 */
function categorizeBySource(event: EventInput): CategorizationResult | null {
  if (!event.source) return null;

  const config = loadVenueConfig();
  const sourceType = config.source_type_hints[event.source];

  if (sourceType) {
    // Check for override keywords that suggest it's NOT a DJ set
    const text = `${event.title} ${event.description || ''}`.toLowerCase();
    const keywordConfig = loadKeywordConfig();

    const hasConcertSignal = keywordConfig.concert_override_keywords.some(k =>
      text.includes(k.toLowerCase())
    );

    if (hasConcertSignal && sourceType === 'dj_set') {
      return null; // Let keyword matching or current type handle it
    }

    return {
      type: sourceType,
      confidence: 'medium',
      reason: `Source "${event.source}" typically hosts ${sourceType} events`
    };
  }

  return null;
}

/**
 * Main Categorization Function
 *
 * Applies four-pass categorization:
 * 1. Venue rules (high confidence)
 * 2. Keyword rules (medium confidence)
 * 3. URL path rules (medium confidence)
 * 4. Source hints (medium confidence)
 * 5. Falls back to current type or 'concert'
 */
export function categorizeEvent(event: EventInput): CategorizationResult {
  // Pass 1: Venue-based (highest confidence)
  const venueResult = categorizeByVenue(event);
  if (venueResult) return venueResult;

  // Pass 2: Keyword-based (medium-high confidence)
  const keywordResult = categorizeByKeywords(event);
  if (keywordResult) return keywordResult;

  // Pass 3: URL path-based (medium confidence)
  const urlResult = categorizeByUrl(event);
  if (urlResult) return urlResult;

  // Pass 4: Source-based hints (medium confidence)
  const sourceResult = categorizeBySource(event);
  if (sourceResult) return sourceResult;

  // Fallback: use current type or default to 'concert'
  if (event.currentType && event.currentType !== 'other') {
    return {
      type: event.currentType,
      confidence: 'low',
      reason: 'No matching rules, kept current type'
    };
  }

  return {
    type: 'concert',
    confidence: 'low',
    reason: 'No matching rules, defaulted to concert'
  };
}

/**
 * Simple categorization function (backward compatible with old API)
 * Returns just the EventType
 */
export function categorizeEventSimple(event: EventInput): EventType {
  return categorizeEvent(event).type;
}

/**
 * Get schema.org @type for an event type
 */
export function getSchemaOrgType(eventType: EventType): string {
  const config = loadKeywordConfig();
  return config.schema_org_mapping[eventType] || 'Event';
}

/**
 * Check if an event should be flagged for human review
 */
export function needsHumanReview(result: CategorizationResult): boolean {
  return result.confidence === 'low';
}

/**
 * Clear config cache (useful for testing or after config changes)
 */
export function clearConfigCache(): void {
  venueConfig = null;
  keywordConfig = null;
  urlPatternConfig = null;
}
