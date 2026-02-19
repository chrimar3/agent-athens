/**
 * Quality Gates Validation System
 *
 * Validates enriched content against the three-layer quality model:
 * - Schema Layer: JSON-LD validity, correct types
 * - 5-Question Layer: Information completeness
 * - Resonance Layer: Emotional engagement, voice quality
 *
 * @see docs/MASTER-ENRICHMENT-TEMPLATE.md
 */

import { TAG_TAXONOMY, FILLER_PHRASES, type EventForEnrichment } from './description-generator';

// ============================================================================
// Types
// ============================================================================

export interface QualityGateResult {
  passed: boolean;
  score: number; // 0-100
  issues: QualityIssue[];
  layer_scores: {
    schema: number;
    five_question: number;
    resonance: number;
  };
}

export interface QualityIssue {
  layer: 'schema' | 'five_question' | 'resonance' | 'technical';
  severity: 'error' | 'warning' | 'info';
  code: string;
  message: string;
}

export interface SchemaOrgEvent {
  '@context': 'https://schema.org';
  '@type': 'MusicEvent' | 'Event' | 'ExhibitionEvent' | 'TheaterEvent' | 'DanceEvent' | 'ComedyEvent' | 'ScreeningEvent' | 'EducationEvent' | 'Festival';
  name: string;
  description?: string;
  startDate: string;
  doorTime?: string;
  endDate?: string;
  eventStatus?: string;
  eventAttendanceMode?: string;
  location: {
    '@type': 'MusicVenue' | 'Place';
    name: string;
    address?: {
      '@type': 'PostalAddress';
      streetAddress?: string;
      addressLocality?: string;
      addressRegion?: string;
      postalCode?: string;
      addressCountry?: string;
    };
    geo?: {
      '@type': 'GeoCoordinates';
      latitude: number;
      longitude: number;
    };
  };
  performer?: {
    '@type': 'MusicGroup' | 'Person';
    name: string;
    genre?: string[];
  };
  offers?: {
    '@type': 'Offer';
    price: number | string;
    priceCurrency: string;
    availability?: string;
    url?: string;
  };
}

// ============================================================================
// Constants
// ============================================================================

/** Minimum word counts by tier */
const WORD_COUNT_REQUIREMENTS = {
  stub: { min: 50, max: 150 },
  standard: { min: 150, max: 300 },
  premium: { min: 250, max: 450 },
};

/** Required sections in premium descriptions */
const PREMIUM_REQUIRED_SECTIONS = [
  'practical block', // Info table with details
  'tags',
  'last verified',
];

/** Second-person pronouns (for resonance check) */
const SECOND_PERSON_MARKERS = ['you', 'your', "you're", "you'll", "you've"];

/** Sensory words (for resonance check) */
const SENSORY_WORDS = [
  'feel', 'feels', 'hear', 'sound', 'see', 'smell', 'taste', 'touch',
  'bass', 'lights', 'crowd', 'energy', 'air', 'warm', 'cool', 'dark',
  'bright', 'loud', 'quiet', 'soft', 'hard', 'smooth', 'rough',
];

/** Lazy adjectives that indicate generic content */
const LAZY_ADJECTIVES = [
  'amazing', 'incredible', 'fantastic', 'wonderful', 'great', 'excellent',
  'perfect', 'unforgettable', 'world-class', 'stunning', 'spectacular',
  'extraordinary', 'exceptional', 'vibrant',
];

// ============================================================================
// Main Validation Functions
// ============================================================================

/**
 * Validate enriched content against all quality gates
 */
export function validateQualityGates(
  event: EventForEnrichment,
  description: string,
  tier: 'stub' | 'standard' | 'premium',
  schemaJson?: SchemaOrgEvent
): QualityGateResult {
  const issues: QualityIssue[] = [];

  // Schema Layer validation
  const schemaIssues = schemaJson
    ? validateSchemaLayer(schemaJson, event)
    : [createIssue('schema', 'warning', 'SCHEMA_MISSING', 'Schema.org JSON-LD not provided')];
  issues.push(...schemaIssues);

  // 5-Question Layer validation
  const fiveQuestionIssues = validateFiveQuestionLayer(event, description);
  issues.push(...fiveQuestionIssues);

  // Resonance Layer validation (for standard and premium only)
  const resonanceIssues =
    tier !== 'stub' ? validateResonanceLayer(description, tier) : [];
  issues.push(...resonanceIssues);

  // Generic content detection (requires event context)
  const genericIssues = detectGenericContent(description, {
    title: event.title,
    venue: event.venue,
    type: event.type
  }, tier);
  issues.push(...genericIssues);

  // Technical validation
  const technicalIssues = validateTechnical(description, tier);
  issues.push(...technicalIssues);

  // Calculate scores
  const schemaScore = calculateLayerScore(schemaIssues, 25);
  const fiveQuestionScore = calculateLayerScore(fiveQuestionIssues, 40);
  const resonanceScore = tier === 'stub' ? 35 : calculateLayerScore(resonanceIssues, 35);

  const totalScore = schemaScore + fiveQuestionScore + resonanceScore;
  const errorCount = issues.filter(i => i.severity === 'error').length;

  return {
    passed: errorCount === 0 && totalScore >= 60,
    score: Math.round(totalScore),
    issues,
    layer_scores: {
      schema: Math.round(schemaScore),
      five_question: Math.round(fiveQuestionScore),
      resonance: Math.round(resonanceScore),
    },
  };
}

// ============================================================================
// Schema Layer Validation
// ============================================================================

/**
 * Validate Schema.org JSON-LD
 */
function validateSchemaLayer(schema: SchemaOrgEvent, event: EventForEnrichment): QualityIssue[] {
  const issues: QualityIssue[] = [];

  // Required fields
  if (!schema['@context'] || schema['@context'] !== 'https://schema.org') {
    issues.push(createIssue('schema', 'error', 'INVALID_CONTEXT', 'Invalid @context'));
  }

  if (!schema['@type']) {
    issues.push(createIssue('schema', 'error', 'MISSING_TYPE', 'Missing @type'));
  }

  if (!schema.name) {
    issues.push(createIssue('schema', 'error', 'MISSING_NAME', 'Missing event name'));
  }

  if (!schema.startDate) {
    issues.push(createIssue('schema', 'error', 'MISSING_DATE', 'Missing startDate'));
  }

  // Date format check (should include timezone)
  if (schema.startDate && !schema.startDate.includes('+') && !schema.startDate.includes('Z')) {
    issues.push(
      createIssue('schema', 'warning', 'NO_TIMEZONE', 'startDate missing timezone')
    );
  }

  // Price validation
  if (schema.offers) {
    if (typeof schema.offers.price === 'string' && schema.offers.price.includes('€')) {
      issues.push(
        createIssue(
          'schema',
          'error',
          'PRICE_NOT_NUMERIC',
          'Price must be numeric (15, not "€15")'
        )
      );
    }
    if (!schema.offers.priceCurrency) {
      issues.push(
        createIssue('schema', 'warning', 'MISSING_CURRENCY', 'Missing priceCurrency')
      );
    }
  }

  // Location validation
  if (!schema.location) {
    issues.push(createIssue('schema', 'error', 'MISSING_LOCATION', 'Missing location'));
  } else {
    if (!schema.location.name) {
      issues.push(createIssue('schema', 'warning', 'MISSING_VENUE_NAME', 'Missing venue name'));
    }
    if (schema.location.geo) {
      if (
        typeof schema.location.geo.latitude !== 'number' ||
        typeof schema.location.geo.longitude !== 'number'
      ) {
        issues.push(
          createIssue('schema', 'error', 'INVALID_COORDS', 'Coordinates must be numbers')
        );
      }
    }
  }

  return issues;
}

// ============================================================================
// 5-Question Layer Validation
// ============================================================================

/**
 * Validate information completeness (5 questions)
 */
function validateFiveQuestionLayer(
  event: EventForEnrichment,
  description: string
): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const lowerDesc = description.toLowerCase();

  // Q1: What is this? (genre, type, format)
  if (!event.type && !event.genre) {
    issues.push(
      createIssue(
        'five_question',
        'warning',
        'MISSING_WHAT',
        'Event type and genre both missing (What is this?)'
      )
    );
  }

  // Q2: Why now? (timeliness)
  const timelinessMarkers = [
    'first time',
    'returns',
    'debut',
    'premiere',
    'new album',
    'tour',
    'anniversary',
    'special',
    'limited',
    'one night',
    'πρώτη φορά',
    'επιστρέφει',
  ];
  const hasTimeliness = timelinessMarkers.some(m => lowerDesc.includes(m));
  if (!hasTimeliness) {
    issues.push(
      createIssue(
        'five_question',
        'info',
        'NO_TIMELINESS',
        'Consider adding timeliness hook (Why now?)'
      )
    );
  }

  // Q3: What's the experience? (vibe, crowd, setting)
  const experienceMarkers = ['atmosphere', 'vibe', 'crowd', 'expect', 'experience', 'feel'];
  const hasExperience = experienceMarkers.some(m => lowerDesc.includes(m));
  if (!hasExperience) {
    issues.push(
      createIssue(
        'five_question',
        'warning',
        'NO_EXPERIENCE',
        'Missing experience description (What\'s it like?)'
      )
    );
  }

  // Q4: What do I need to know? (practical details)
  const practicalRequired = ['date', 'time', 'venue', 'price'];
  const missingPractical = practicalRequired.filter(field => {
    const value = (event as Record<string, unknown>)[field];
    return !value;
  });
  if (missingPractical.length > 0) {
    issues.push(
      createIssue(
        'five_question',
        'warning',
        'MISSING_PRACTICAL',
        `Missing practical details: ${missingPractical.join(', ')}`
      )
    );
  }

  // Q5: Why this over alternatives? (differentiation)
  const diffMarkers = ['unlike', 'different', 'unique', 'only', 'rare', 'special', 'first'];
  const hasDifferentiation = diffMarkers.some(m => lowerDesc.includes(m));
  if (!hasDifferentiation) {
    issues.push(
      createIssue(
        'five_question',
        'info',
        'NO_DIFFERENTIATION',
        'Consider adding differentiation (Why this?)'
      )
    );
  }

  return issues;
}

// ============================================================================
// Resonance Layer Validation
// ============================================================================

/**
 * Validate emotional engagement and voice quality
 */
function validateResonanceLayer(
  description: string,
  tier: 'standard' | 'premium'
): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const lowerDesc = description.toLowerCase();
  const sentences = description.split(/[.!?]+/).filter(s => s.trim().length > 0);

  // Check for second person ("you")
  const hasSecondPerson = SECOND_PERSON_MARKERS.some(m =>
    lowerDesc.includes(m.toLowerCase())
  );
  if (!hasSecondPerson && tier === 'premium') {
    issues.push(
      createIssue(
        'resonance',
        'warning',
        'NO_SECOND_PERSON',
        'Premium descriptions should use "you" (second person)'
      )
    );
  }

  // Check for sensory language
  const sensoryCount = SENSORY_WORDS.filter(w => lowerDesc.includes(w)).length;
  if (sensoryCount < 2 && tier === 'premium') {
    issues.push(
      createIssue(
        'resonance',
        'warning',
        'LOW_SENSORY',
        'Premium descriptions need more sensory language'
      )
    );
  }

  // Check for filler phrases
  const foundFillers = FILLER_PHRASES.filter(p => lowerDesc.includes(p));
  if (foundFillers.length > 0) {
    issues.push(
      createIssue(
        'resonance',
        'error',
        'FILLER_PHRASES',
        `Remove filler phrases: ${foundFillers.join(', ')}`
      )
    );
  }

  // Check for "Show don't tell" violations (excessive adjectives)
  const tellingPhrases = [
    'amazing',
    'incredible',
    'fantastic',
    'wonderful',
    'excellent',
    'perfect',
    'best',
    'greatest',
  ];
  const tellingCount = tellingPhrases.filter(p => lowerDesc.includes(p)).length;
  if (tellingCount >= 2) {
    issues.push(
      createIssue(
        'resonance',
        'warning',
        'TELLING_NOT_SHOWING',
        'Too many superlatives — show, don\'t tell'
      )
    );
  }

  // Premium: check for filter section ("If you...")
  if (tier === 'premium') {
    if (!lowerDesc.includes('if you')) {
      issues.push(
        createIssue(
          'resonance',
          'info',
          'NO_FILTER',
          'Premium descriptions should include self-selection filter ("If you...")'
        )
      );
    }
  }

  // Premium: check opening is sensory (first 2 sentences shouldn't have dates/prices)
  if (tier === 'premium' && sentences.length >= 2) {
    const opening = (sentences[0] + sentences[1]).toLowerCase();
    const hasFactsInOpening =
      opening.includes('€') || /\d{1,2}\/\d{1,2}/.test(opening) || opening.includes('tickets');
    if (hasFactsInOpening) {
      issues.push(
        createIssue(
          'resonance',
          'warning',
          'FACTS_IN_OPENING',
          'Opening should be sensory, not facts — transport before inform'
        )
      );
    }
  }

  return issues;
}

// ============================================================================
// Generic Content Detection
// ============================================================================

/**
 * Detect generic content that could apply to any event
 *
 * CRITICAL: This function MUST receive event context (title, venue, type)
 * because the two most reliable signals that content is generic are:
 * 1. It doesn't mention the actual event/artist
 * 2. It doesn't mention the venue
 *
 * Without the event parameter, these checks are impossible.
 *
 * @param description - The description to check
 * @param event - Event context (title, venue, type)
 * @param tier - Enrichment tier (affects severity)
 */
export function detectGenericContent(
  description: string,
  event: { title: string; venue: string | null; type: string | null },
  tier: 'stub' | 'standard' | 'premium'
): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const lower = description.toLowerCase();

  // 1. Does the description mention the actual event/artist?
  // This is the MOST RELIABLE generic content signal.
  // A description that doesn't reference the specific event could apply to anything.
  const titleWords = event.title
    .split(/\s+/)
    .filter(w => w.length > 3)  // Skip articles, prepositions
    .map(w => w.toLowerCase().replace(/[^a-zα-ω0-9]/gi, '')); // Remove punctuation

  const mentionsEvent = titleWords.some(w => w && lower.includes(w));

  if (!mentionsEvent && tier !== 'stub') {
    issues.push({
      layer: 'resonance',
      severity: 'warning',
      code: 'GENERIC_NO_EVENT_REFERENCE',
      message: 'Description doesn\'t reference the specific event or artist — could apply to anything'
    });
  }

  // 2. Does it mention the venue?
  // Second most reliable signal. Premium content should ground the reader in a place.
  if (event.venue) {
    const venueWords = event.venue.toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 3);
    const mentionsVenue = venueWords.some(w => lower.includes(w));

    if (!mentionsVenue && tier === 'premium') {
      issues.push({
        layer: 'resonance',
        severity: 'warning',
        code: 'GENERIC_NO_VENUE_REFERENCE',
        message: 'Premium description should reference the venue by name'
      });
    }
  }

  // 3. Lazy adjective detection
  const foundLazy = LAZY_ADJECTIVES.filter(adj =>
    new RegExp(`\\b${adj}\\b`, 'i').test(description)
  );

  if (foundLazy.length > 0) {
    issues.push({
      layer: 'resonance',
      severity: tier === 'premium' ? 'error' : 'warning',
      code: 'LAZY_ADJECTIVES',
      message: `Remove lazy adjectives: ${foundLazy.join(', ')} — show don't tell`
    });
  }

  // 4. Sensory language check (Premium only)
  if (tier === 'premium') {
    const sensoryMarkers = ['you ', 'your ', 'sound', 'hear', 'feel',
      'smell', 'taste', 'see', 'watch', 'light', 'dark', 'warm',
      'cold', 'loud', 'quiet', 'bass', 'voice', 'crowd'];
    const hasSensory = sensoryMarkers.some(m => lower.includes(m));

    if (!hasSensory) {
      issues.push({
        layer: 'resonance',
        severity: 'warning',
        code: 'NO_SENSORY_LANGUAGE',
        message: 'Premium content should include sensory details — transport before inform'
      });
    }
  }

  // 5. Second-person "you" check (Standard+)
  if (tier !== 'stub' && !lower.includes('you')) {
    issues.push({
      layer: 'resonance',
      severity: 'warning',
      code: 'NO_SECOND_PERSON',
      message: 'Use "you" to put the reader in the room'
    });
  }

  return issues;
}

// ============================================================================
// Technical Validation
// ============================================================================

/**
 * Validate technical requirements
 */
function validateTechnical(
  description: string,
  tier: 'stub' | 'standard' | 'premium'
): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const lowerDesc = description.toLowerCase();

  // Word count
  const wordCount = countWords(description);
  const { min, max } = WORD_COUNT_REQUIREMENTS[tier];

  if (wordCount < min) {
    issues.push(
      createIssue(
        'technical',
        'error',
        'TOO_SHORT',
        `Description too short: ${wordCount} words (minimum ${min})`
      )
    );
  } else if (wordCount > max) {
    issues.push(
      createIssue(
        'technical',
        'warning',
        'TOO_LONG',
        `Description too long: ${wordCount} words (maximum ${max})`
      )
    );
  }

  // Premium: check for required sections
  if (tier === 'premium') {
    for (const section of PREMIUM_REQUIRED_SECTIONS) {
      if (!lowerDesc.includes(section)) {
        issues.push(
          createIssue(
            'technical',
            'warning',
            'MISSING_SECTION',
            `Premium description missing: ${section}`
          )
        );
      }
    }

    // Check for practical table
    if (!description.includes('|')) {
      issues.push(
        createIssue(
          'technical',
          'warning',
          'NO_TABLE',
          'Premium description should include practical details table'
        )
      );
    }
  }

  // Check for valid tags
  if (lowerDesc.includes('tags:')) {
    const tagsMatch = description.match(/tags:\s*([^\n]+)/i);
    if (tagsMatch) {
      const tags = tagsMatch[1].split(',').map(t => t.trim().replace(/`/g, ''));
      const validTags = Object.values(TAG_TAXONOMY).flat() as string[];
      const invalidTags = tags.filter(t => !validTags.includes(t) && t.length > 0);

      if (invalidTags.length > 0) {
        issues.push(
          createIssue(
            'technical',
            'info',
            'INVALID_TAGS',
            `Non-standard tags: ${invalidTags.join(', ')}`
          )
        );
      }
    }
  }

  return issues;
}

// ============================================================================
// Helper Functions
// ============================================================================

function createIssue(
  layer: QualityIssue['layer'],
  severity: QualityIssue['severity'],
  code: string,
  message: string
): QualityIssue {
  return { layer, severity, code, message };
}

function calculateLayerScore(issues: QualityIssue[], maxScore: number): number {
  const errorPenalty = 10;
  const warningPenalty = 5;
  const infoPenalty = 1;

  const errorCount = issues.filter(i => i.severity === 'error').length;
  const warningCount = issues.filter(i => i.severity === 'warning').length;
  const infoCount = issues.filter(i => i.severity === 'info').length;

  const totalPenalty =
    errorCount * errorPenalty + warningCount * warningPenalty + infoCount * infoPenalty;

  return Math.max(0, maxScore - totalPenalty);
}

function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter(w => w.length > 0).length;
}

// ============================================================================
// Schema Generation
// ============================================================================

// Complete Schema.org type mapping for all event types
export const SCHEMA_TYPE_MAP: Record<string, SchemaOrgEvent['@type']> = {
  concert: 'MusicEvent',
  dj_set: 'MusicEvent',
  classical: 'MusicEvent',
  opera: 'MusicEvent',
  theater: 'TheaterEvent',
  dance: 'DanceEvent',
  comedy: 'ComedyEvent',
  exhibition: 'ExhibitionEvent',
  screening: 'ScreeningEvent',
  cinema: 'ScreeningEvent',
  workshop: 'EducationEvent',
  show: 'Event',
  festival: 'Festival',
  performance: 'Event',
  other: 'Event',
};

/**
 * Get the correct Athens timezone offset, accounting for DST
 * Greece observes DST from last Sunday of March to last Sunday of October
 */
export function getAthensTimezone(date: Date): string {
  const year = date.getFullYear();
  const marchLastSunday = getLastSundayOfMonth(year, 2); // March (0-indexed)
  const octoberLastSunday = getLastSundayOfMonth(year, 9); // October (0-indexed)
  return (date >= marchLastSunday && date < octoberLastSunday) ? '+03:00' : '+02:00';
}

/**
 * Get the last Sunday of a given month
 */
function getLastSundayOfMonth(year: number, month: number): Date {
  // Get last day of the month
  const lastDay = new Date(year, month + 1, 0);
  const dayOfWeek = lastDay.getDay(); // 0 = Sunday
  lastDay.setDate(lastDay.getDate() - dayOfWeek);
  lastDay.setHours(3, 0, 0, 0); // DST switch happens at 03:00 local
  return lastDay;
}

/**
 * Format a date with Athens timezone for Schema.org
 */
export function formatSchemaDate(dateStr: string, timeStr?: string): string {
  // Parse the date
  const dateMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!dateMatch) return dateStr;

  const [, year, month, day] = dateMatch;
  const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  const tz = getAthensTimezone(date);

  if (timeStr && !dateStr.includes('T')) {
    return `${dateStr}T${timeStr}:00${tz}`;
  } else if (!dateStr.includes('T')) {
    return `${dateStr}T00:00:00${tz}`;
  }

  // If already has time, just ensure timezone
  if (!dateStr.includes('+') && !dateStr.includes('Z')) {
    return `${dateStr}${tz}`;
  }

  return dateStr;
}

/**
 * Generate Schema.org JSON-LD for an event
 */
export function generateSchemaOrg(event: EventForEnrichment): SchemaOrgEvent {
  // Determine event type using complete mapping
  const eventType: SchemaOrgEvent['@type'] = SCHEMA_TYPE_MAP[event.type || ''] || 'Event';

  // Format start date with correct timezone (DST aware)
  const startDate = formatSchemaDate(event.date, event.time);

  const schema: SchemaOrgEvent = {
    '@context': 'https://schema.org',
    '@type': eventType,
    name: event.title,
    startDate,
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: {
      '@type': event.type === 'concert' ? 'MusicVenue' : 'Place',
      name: event.venue || 'TBA',
    },
  };

  // Add door time
  if (event.time_doors) {
    schema.doorTime = event.time_doors;
  }

  // Add address if we have neighborhood
  if (event.neighborhood) {
    schema.location.address = {
      '@type': 'PostalAddress',
      addressLocality: 'Athens',
      addressRegion: event.neighborhood,
      addressCountry: 'GR',
    };
  }

  // Add price
  const price = event.price_advance || event.price_door;
  if (price) {
    schema.offers = {
      '@type': 'Offer',
      price: price,
      priceCurrency: 'EUR',
      availability: 'https://schema.org/InStock',
    };
    if (event.ticket_url) {
      schema.offers.url = event.ticket_url;
    }
  }

  // Add genre
  if (event.genre) {
    schema.performer = {
      '@type': 'MusicGroup',
      name: event.title.split(' - ')[0] || event.title, // Best guess at performer name
      genre: [event.genre],
    };
  }

  return schema;
}

/**
 * Quick validation for minimum requirements
 */
export function quickValidate(
  event: EventForEnrichment,
  description: string
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Must have title, date, venue
  if (!event.title) errors.push('Missing title');
  if (!event.date) errors.push('Missing date');
  if (!event.venue) errors.push('Missing venue');

  // Word count check
  const wordCount = countWords(description);
  if (wordCount < 50) {
    errors.push(`Description too short: ${wordCount} words`);
  }

  // No filler phrases
  const lowerDesc = description.toLowerCase();
  const hasFillers = FILLER_PHRASES.some(p => lowerDesc.includes(p));
  if (hasFillers) {
    errors.push('Contains filler phrases');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
