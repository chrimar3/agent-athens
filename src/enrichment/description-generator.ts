/**
 * Description Generator
 *
 * Builds prompts for AI description generation and validates responses.
 * Implements the Master Enrichment Template v2.0 optimized for AI answer engines.
 *
 * Key distinction:
 * - DESCRIPTION field: Rich narrative content (400-600 words)
 * - Site template: Renders metadata (title, date, venue, price) from DB fields
 *
 * @see docs/MASTER-ENRICHMENT-TEMPLATE.md
 * @see config/venue-intelligence.md (Reference Database)
 */

import { countWords, validateWordCount } from './word-counter';

// ============================================================================
// Types
// ============================================================================

export interface EventForEnrichment {
  id: string;
  title: string;
  date: string;
  time: string | null;
  venue: string | null;
  type: string | null;
  genre: string | null;
  price: string | null;
  // Extended fields for premium enrichment
  price_advance?: number | null;
  price_door?: number | null;
  neighborhood?: string | null;
  metro_station?: string | null;
  metro_line?: string | null;
  door_policy?: 'strict' | 'selective' | 'relaxed' | 'none' | null;
  door_policy_note?: string | null;
  time_doors?: string | null;
  time_peak?: string | null;
  ticket_url?: string | null;
  // Artist info
  artist_bio?: string | null;
  artist_genre?: string | null;
  artist_notable_works?: string | null;
}

export interface DescriptionValidationResult {
  valid: boolean;
  wordCount: number;
  errors: string[];
  citableSentences: number;
}

export interface EnrichedContent {
  description: string;
  tags: string[];
  tier: 'stub' | 'standard' | 'premium';
  verified_at: string;
}

// ============================================================================
// Tag Taxonomy (from Master Template v2.0)
// ============================================================================

export const TAG_TAXONOMY = {
  genre: [
    'Jazz', 'Electronic', 'Techno', 'House', 'Hard-techno', 'Melodic-techno',
    'Progressive', 'Darkwave', 'EBM', 'Industrial', 'Rebetiko', 'Laiko',
    'Entechno', 'Greek-singer-songwriter', 'Rock', 'Metal', 'Punk', 'Hip-hop',
    'Indie', 'Experimental', 'Classical', 'World', 'Greek-Traditional',
    'Mediterranean-Fusion', 'DJ-set', 'Live-band', 'Live-act',
    'Comedy', 'Opera', 'Theater', 'Dance', 'Shadow-Theater',
    'Photography', 'Contemporary-Art'
  ],
  neighborhood: [
    'Gazi', 'Exarchia', 'Psiri', 'Koukaki', 'Monastiraki', 'Metaxourgeio',
    'Kolonaki', 'Piraeus', 'Neos-Kosmos', 'Mets', 'Petralona', 'Kypseli',
    'Tavros', 'Athens-Riviera', 'Pagrati', 'Ampelokipoi', 'Kallithea',
    'Ellinikon', 'Galatsi', 'Marousi'
  ],
  atmosphere: [
    'Industrial-chic', 'Intimate', 'Underground', 'Mainstream', 'Tourist-friendly',
    'Local-favorite', 'Warehouse', 'Rooftop', 'Basement', 'Garden', 'Raw',
    'Polished', 'Inclusive', 'Selective-door', 'Historic', 'Listening-room',
    'Family-friendly', 'Academic', 'Site-specific'
  ],
  crowd: [
    '20s-30s', '30s-40s', 'Mixed-ages', 'Students', 'Young-professionals',
    'Expats', 'Greek-locals', 'Mixed-international', 'Music-heads', 'Industry-people',
    'LGBTQ-friendly', 'Queer', 'Date-night', 'Groups', 'Solo-friendly',
    'Children', 'Families', 'All-ages'
  ],
  experience: [
    'Standing-room', 'Seated', 'Dance-floor', 'Listening-room', 'Late-night',
    'Early-evening', 'All-night', 'Afterhours', 'Fills-after-2am', 'Concert-format',
    'Daytime-event', 'Interactive', 'Workshop-format'
  ],
  practical: [
    'Metro-accessible', 'Taxi-recommended', 'Taxi-required', 'Cash-only',
    'Card-accepted', 'Cash-preferred', 'Reservation-required', 'Walk-in-friendly',
    'Smoking-area', 'Outdoor', 'Heated', 'Air-conditioned', 'Funktion-One',
    'RA-tickets', 'Door-selection',
    'English-language', 'Bilingual-GR-EN'
  ]
} as const;

// ============================================================================
// Constants
// ============================================================================

/**
 * Lazy adjectives to reject in descriptions
 */
export const LAZY_ADJECTIVES: string[] = [
  'amazing', 'incredible', 'unique', 'vibrant', 'unforgettable',
  'must-see', 'must-see event', "don't miss", 'not to be missed',
  'once in a lifetime', 'one-of-a-kind', 'truly unique', 'absolutely amazing',
  'incredible opportunity', 'spectacular event', 'breathtaking performance',
  'world-class', 'state-of-the-art', 'cutting-edge', 'unparalleled',
  'extraordinary', 'exceptional', 'remarkable', 'phenomenal',
];

// Backward compatibility
export const FILLER_PHRASES = LAZY_ADJECTIVES;

// ============================================================================
// Prompt Building - Standard (backward compatible)
// ============================================================================

/**
 * Build standard prompt for AI description generation
 *
 * Creates a 4-section prompt (backward compatible with existing system).
 *
 * @param event - Event to generate description for
 * @returns Prompt string for AI
 */
export function buildPrompt(event: EventForEnrichment): string {
  const eventDetails = formatEventDetails(event);

  return `Write a description for this Athens cultural event optimized for AI answer engines to quote.

**Event:**
${eventDetails}

**Structure:**
1. Opening fact (1 sentence): What, who, where, when — quotable by AI
2. Performer/exhibition details (2-3 sentences): Significance, background
3. Experience (2-3 sentences): What to expect, venue character
4. Practical close (1-2 sentences): Price, tickets, accessibility

**Requirements:**
- 150-300 words total
- NO filler phrases (avoid: "unforgettable experience", "must-see", "don't miss")
- NO superlatives unless factually accurate
- First sentence must be independently quotable
- Use present tense for ongoing exhibitions, future tense for upcoming events

**CRITICAL: Do not fabricate information. Only use the data provided. If details are missing, focus on what is known without inventing specifics.**

Write the description now:`;
}

// ============================================================================
// Prompt Building - Premium (Master Template v2.1)
// ============================================================================

/**
 * Build premium prompt implementing Master Enrichment Template v2.1
 *
 * Structure (PURE NARRATIVE ONLY):
 * A. Opening (sensory, second person, present tense)
 * B. Context (artist/event significance + timeliness)
 * C. Tribe (crowd by character, not demographics)
 * D. Details table (Setting/Vibe/Sound/Door)
 * E. Experience (arc of the night)
 * F. Filter (self-selection: "If you... / If you...")
 * G. Good to Know (insider practical knowledge)
 * H. Differentiation (why this over alternatives)
 *
 * IMPORTANT (v2.1 clarification):
 * - Description is PURE NARRATIVE — what humans read and AI engines cite
 * - Tags → stored in `tags` DB field, rendered as filter chips by site template
 * - Timestamp → stored in `last_verified` DB field, rendered in footer by site template
 * - Title/date/venue/price → separate DB fields, rendered by site template
 * - DO NOT include tags or timestamps in the description prose
 *
 * @param event - Event with extended fields
 * @returns Premium prompt string for AI
 */
export function buildPremiumPrompt(event: EventForEnrichment): string {
  const eventDetails = formatExtendedEventDetails(event);
  const venueContext = getVenueContext(event.venue);
  const artistContext = formatArtistContext(event);

  return `Write a premium event description following the Master Enrichment Template v2.1.

**CRITICAL DISTINCTION:**
- You are writing the DESCRIPTION FIELD ONLY (stored in database)
- The site template AUTOMATICALLY renders: title, date, time, venue, address, price, tickets
- DO NOT duplicate those fields in your description — focus on the narrative

**Event Data:**
${eventDetails}
${venueContext}
${artistContext}

**THE STRUCTURE (follow this order):**

**A. OPENING (2-3 sentences, ~50 words)**
- Transport the reader with SENSORY details (sight, sound, feel)
- Use "you" (second person) and PRESENT TENSE
- NO facts yet — pure experience
- Example: "The candles on the tables throw more light than the overheads. You're seated close enough to the stage that when the musician shifts weight on the stool, you hear the wood creak."

**B. CONTEXT (1-2 paragraphs)**
- Who is this artist/what is this event?
- Why does it matter? What tradition do they come from?
- Why NOW? (premiere, anniversary, rare appearance, new work)
- Use concrete details, not adjectives
- Include at least 2 CITABLE FACTS an AI would quote

**C. TRIBE (1 paragraph)**
- Describe WHO attends by CHARACTER, not demographics
- GOOD: "People who own his records on vinyl because they read the lyric sheets"
- BAD: "25-35 professionals"
- Create sense of belonging

**D. DETAILS TABLE (inline markdown)**
\`\`\`
| Aspect | Details |
|--------|---------|
| **Setting** | [venue type, ~capacity, key physical feature] |
| **Vibe** | [2-3 atmosphere descriptors] |
| **Sound** | [listening room / dance floor / background] |
| **Door** | [reservation required / walk-in / selective] |
\`\`\`

**E. EXPERIENCE (1 paragraph)**
- Describe the ARC of the night — how it unfolds
- What happens? How does it build?
- Example: "The set builds starting spare, voice and guitar finding each other, the band joining gradually."

**F. FILTER (1 paragraph)**
- Help readers self-select IN or OUT
- Use "If you... / If you..." structure
- Be HONEST about who won't enjoy it
- Example: "If you want high-energy bouzoukia, this isn't it. But if you want Greek songwriting at point-blank range..."

**G. GOOD TO KNOW (1 prose paragraph)**
- Genuinely useful insider knowledge
- Policies that catch people out
- Transport logistics tied to specific show times
- Seasonal considerations
- Tips locals would know

**H. DIFFERENTIATION (1-2 sentences)**
- Why THIS over alternatives?
- Specific, not "best" or "only"
- Example: "He keeps coming back to Half Note because 200 seats is the right number for songs that work best when the singer can see every face."

**REQUIREMENTS:**
- 400-600 words total
- Voice: Sensory first, second person ("you"), present tense
- NO lazy adjectives: "amazing", "incredible", "unique", "vibrant", "unforgettable"
- SHOW don't TELL: "bass hits your chest" not "great sound"
- At least 2 sentences that could be quoted standalone by an AI (citability test)
- Include the Details table inline
- PURE NARRATIVE ONLY — tags and timestamps are handled separately in the database

**CITABILITY TEST:**
Your description MUST include at least 2 sentences that:
1. Contain specific, factual information
2. Make sense quoted without context
3. Cannot work if you substitute a different artist/venue

**CRITICAL: Do not fabricate. Only use data provided. If info is missing, omit that aspect gracefully.**

Write the premium description now (400-600 words):`;
}

/**
 * Format artist context if available
 */
function formatArtistContext(event: EventForEnrichment): string {
  if (!event.artist_bio && !event.artist_notable_works) {
    return '';
  }

  const parts: string[] = ['\n**Artist Background (use naturally, don\'t quote verbatim):**'];

  if (event.artist_bio) {
    parts.push(event.artist_bio);
  }

  if (event.artist_genre) {
    parts.push(`Genre/Style: ${event.artist_genre}`);
  }

  if (event.artist_notable_works) {
    parts.push(`Notable works: ${event.artist_notable_works}`);
  }

  return parts.join('\n');
}

/**
 * Format extended event details for premium prompt
 */
function formatExtendedEventDetails(event: EventForEnrichment): string {
  const lines: string[] = [
    `- Title: ${event.title}`,
    `- Date: ${event.date}`,
  ];

  if (event.time) lines.push(`- Time: ${event.time}`);
  if (event.time_doors) lines.push(`- Doors: ${event.time_doors}`);
  if (event.venue) lines.push(`- Venue: ${event.venue}`);
  if (event.neighborhood) lines.push(`- Neighborhood: ${event.neighborhood}`);
  if (event.metro_station) {
    const metroLine = event.metro_line ? ` (${event.metro_line})` : '';
    lines.push(`- Metro: ${event.metro_station}${metroLine}`);
  }
  if (event.type) lines.push(`- Type: ${event.type}`);
  if (event.genre) lines.push(`- Genre: ${event.genre}`);

  // Price formatting
  if (event.price_advance || event.price_door) {
    const advance = event.price_advance ? `€${event.price_advance}` : '';
    const door = event.price_door ? `€${event.price_door}` : '';
    if (advance && door && advance !== door) {
      lines.push(`- Price: ${advance} advance / ${door} door`);
    } else {
      lines.push(`- Price: ${advance || door}`);
    }
  } else if (event.price) {
    lines.push(`- Price: ${event.price === 'open' ? 'Free entry' : 'Ticketed'}`);
  }

  if (event.ticket_url) lines.push(`- Tickets: ${event.ticket_url}`);
  if (event.door_policy && event.door_policy !== 'none') {
    lines.push(`- Door Policy: ${event.door_policy}${event.door_policy_note ? ` — ${event.door_policy_note}` : ''}`);
  }
  if (event.time_peak) lines.push(`- Peak Time: ${event.time_peak}`);

  return lines.join('\n');
}

/**
 * Get venue context from reference database (if available)
 */
function getVenueContext(venue: string | null): string {
  if (!venue) return '';

  // Venue intelligence lookup - in production, reads from config/venue-intelligence.md
  const venueContextMap: Record<string, string> = {
    'Gazarte': `\n**Venue Intelligence (Gazarte):**
- Spaces: Main Stage (major acts), Ground Stage (rock/alt), Roof Stage (Greek/jazz, Acropolis views)
- Doors: 20:00-21:00, Music: ~21:30
- Capacity: ~600 across spaces
- Character: Quality programming, serious food, rooftop reservations essential
- Summer closure: Roof only May-Sep`,

    'Half Note Jazz Club': `\n**Venue Intelligence (Half Note):**
- Season: October-May only (closed summer)
- Capacity: ~200 seats
- Reservations: ESSENTIAL — book ahead, confirm same day, arrive 20 min early or lose table
- Entry: Table €15-20, bar seats €10-15 (no reservation needed but go early)
- Table sharing: If you book fewer than 4, you share with strangers
- Since 1979, ~250 concerts per season
- Metro: Akropoli (Red line), 10-min walk
- Last metro: ~midnight weekdays`,

    'Astron': `\n**Venue Intelligence (Astron):**
- Entry: €10-15
- Door Policy: Berlin-lite selection — singles > groups, "look like you dance"
- Drinks: Alfa beer ONLY, €5
- Finding it: NO SIGN — look for shaking windows on unmarked building
- Sound: Funktion-One, properly loud`,

    'SMUT Athens': `\n**Venue Intelligence (SMUT):**
- Entry: €15-20 via Resident Advisor
- Door Policy: STRICT — creative/fetish attire required many events
- Tickets: RA tickets = priority, not guaranteed entry
- Character: Queer techno, identity-driven, serious community
- Capacity: ~300`,

    'Six D.O.G.S': `\n**Venue Intelligence (Six D.O.G.S.):**
- Entry: €8-10 (€8 with wallet app)
- Door Policy: Relaxed
- Garden: Closes 23:00 (noise regulations)
- Indoor: Until late
- Character: 10+ years defining Athens electronic identity
- Metro: Monastiraki`,

    'Fuzz Club': `\n**Venue Intelligence (Fuzz Club):**
- Capacity: ~1500
- Sound: Concert-grade PA, standing room
- Character: Major touring acts, metal/rock/electronic
- Door: Walk-in friendly, tickets via platforms
- Metro: Kerameikos (Blue line)`,
  };

  return venueContextMap[venue] || '';
}

/**
 * Venue enrichment data from database
 */
export interface VenueEnrichment {
  description: string | null;
  getting_there: string | null;
  what_to_expect: string | null;
  good_to_know: string | null;
  neighborhood: string | null;
}

/**
 * Get venue enrichment from database (for injection into event prompts)
 */
export function getVenueEnrichment(db: import('bun:sqlite').Database, venueName: string | null): VenueEnrichment | null {
  if (!venueName) return null;

  try {
    const venue = db.prepare(`
      SELECT description, getting_there, what_to_expect, good_to_know, neighborhood
      FROM venue_context
      WHERE venue_name = ?
      AND enrichment_status = 'completed'
    `).get(venueName) as VenueEnrichment | undefined;

    return venue || null;
  } catch {
    return null;
  }
}

/**
 * Build venue context string for injection into event enrichment prompts
 */
export function buildVenueContextForPrompt(venueData: VenueEnrichment | null): string {
  if (!venueData) return '';

  const parts: string[] = [];

  if (venueData.description) {
    parts.push(`**Venue Context (use as foundation, don't repeat verbatim):**`);
    parts.push(venueData.description);
  }

  if (venueData.getting_there) {
    parts.push(`Getting there: ${venueData.getting_there}`);
  }

  if (venueData.what_to_expect) {
    parts.push(`What to expect: ${venueData.what_to_expect}`);
  }

  if (venueData.good_to_know) {
    parts.push(`Insider tip: ${venueData.good_to_know}`);
  }

  return parts.length > 0 ? '\n' + parts.join('\n') : '';
}

/**
 * Suggest relevant tags based on event data
 */
function suggestTagOptions(event: EventForEnrichment): string {
  const suggestions: string[] = [];

  // Genre tags
  suggestions.push(`Genre: ${TAG_TAXONOMY.genre.join(', ')}`);

  // Neighborhood
  if (event.neighborhood) {
    suggestions.push(`Neighborhood: ${event.neighborhood}`);
  } else {
    suggestions.push(`Neighborhood: ${TAG_TAXONOMY.neighborhood.join(', ')}`);
  }

  // Atmosphere
  suggestions.push(`Atmosphere: ${TAG_TAXONOMY.atmosphere.join(', ')}`);

  // Crowd
  suggestions.push(`Crowd: ${TAG_TAXONOMY.crowd.join(', ')}`);

  // Experience
  suggestions.push(`Experience: ${TAG_TAXONOMY.experience.join(', ')}`);

  // Practical
  suggestions.push(`Practical: ${TAG_TAXONOMY.practical.join(', ')}`);

  return suggestions.join('\n');
}

/**
 * Format event details for standard prompt
 */
function formatEventDetails(event: EventForEnrichment): string {
  const lines: string[] = [
    `- Title: ${event.title}`,
    `- Date: ${event.date}`,
  ];

  if (event.time) lines.push(`- Time: ${event.time}`);
  if (event.venue) lines.push(`- Venue: ${event.venue}`);
  if (event.type) lines.push(`- Type: ${event.type}`);
  if (event.genre) lines.push(`- Genre: ${event.genre}`);
  if (event.price) lines.push(`- Price: ${event.price}`);

  return lines.join('\n');
}

// ============================================================================
// Description Validation
// ============================================================================

/**
 * Validate AI-generated description against Master Template v2.0 requirements
 *
 * Checks:
 * - Word count (400-600 for premium, 150-300 for standard)
 * - No lazy adjectives
 * - Required sections present
 * - Citability test (premium only)
 *
 * @param description - Description to validate
 * @param tier - 'standard' or 'premium' for different requirements
 * @returns Validation result with errors
 */
export function validateDescription(
  description: string,
  tier: 'standard' | 'premium' = 'standard'
): DescriptionValidationResult {
  const errors: string[] = [];

  const minWords = tier === 'premium' ? 400 : 150;
  const maxWords = tier === 'premium' ? 650 : 300;

  // Check word count
  const wordCountResult = validateWordCount(description);

  if (wordCountResult.count < minWords) {
    errors.push(`Description too short: ${wordCountResult.count} words (minimum ${minWords})`);
  } else if (wordCountResult.count > maxWords) {
    errors.push(`Description too long: ${wordCountResult.count} words (maximum ${maxWords})`);
  }

  // Check for lazy adjectives
  const lowerDescription = description.toLowerCase();
  const foundLazyAdjectives: string[] = [];

  for (const phrase of LAZY_ADJECTIVES) {
    if (lowerDescription.includes(phrase.toLowerCase())) {
      foundLazyAdjectives.push(phrase);
    }
  }

  if (foundLazyAdjectives.length > 0) {
    errors.push(`Contains lazy adjectives: ${foundLazyAdjectives.join(', ')}`);
  }

  // Check for "you" (second person)
  const hasSecondPerson = lowerDescription.includes('you');
  if (tier === 'premium' && !hasSecondPerson) {
    errors.push('Premium description should use second person ("you")');
  }

  // Premium tier: check for required sections
  let citableSentences = 0;

  if (tier === 'premium') {
    // Check for details table
    if (!description.includes('| Aspect') && !description.includes('| **Setting**')) {
      errors.push('Premium description missing Details table (Setting/Vibe/Sound/Door)');
    }

    // Note: Tags and "Last verified" are database fields, NOT part of the description
    // They are rendered by the site template, not written in the prose

    // Citability test: count sentences with specific facts
    citableSentences = countCitableSentences(description);
    if (citableSentences < 2) {
      errors.push(`Citability test failed: only ${citableSentences} citable sentence(s), need at least 2`);
    }
  }

  return {
    valid: errors.length === 0,
    wordCount: wordCountResult.count,
    errors,
    citableSentences,
  };
}

/**
 * Count sentences that pass the citability test
 *
 * A citable sentence:
 * - Contains specific factual information (names, numbers, dates, places)
 * - Makes sense quoted without surrounding context
 * - Cannot work if you substitute a different subject
 */
function countCitableSentences(description: string): number {
  // Split into sentences
  const sentences = description.split(/[.!?]+/).filter(s => s.trim().length > 20);

  let citableCount = 0;

  for (const sentence of sentences) {
    const s = sentence.toLowerCase();

    // Indicators of specific, citable content
    const hasNumber = /\d+/.test(sentence);
    const hasYear = /\b(19|20)\d{2}\b/.test(sentence);
    const hasPrice = /€\d+/.test(sentence);
    const hasTime = /\d{1,2}:\d{2}/.test(sentence) || /midnight|noon/i.test(sentence);
    const hasProperNoun = /[A-Z][a-z]+\s+[A-Z][a-z]+/.test(sentence); // Two capitalized words
    const hasSpecificPlace = /(metro|station|street|avenue)/i.test(sentence);
    const hasPolicyDetail = /(reservation|book ahead|confirm|arrive|policy)/i.test(sentence);
    const hasHistoricalFact = /(since|founded|established|formed|studied|played with)/i.test(sentence);

    // Count as citable if it has 2+ indicators
    const indicators = [
      hasNumber, hasYear, hasPrice, hasTime,
      hasProperNoun, hasSpecificPlace, hasPolicyDetail, hasHistoricalFact
    ].filter(Boolean).length;

    if (indicators >= 2) {
      citableCount++;
    }
  }

  return citableCount;
}

/**
 * Clean up AI-generated description
 */
export function cleanDescription(description: string): string {
  let cleaned = description.trim();

  // Remove surrounding quotes if present
  if ((cleaned.startsWith('"') && cleaned.endsWith('"')) ||
      (cleaned.startsWith("'") && cleaned.endsWith("'"))) {
    cleaned = cleaned.slice(1, -1);
  }

  // Collapse multiple newlines
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

  // Remove any markdown headers that might have been added
  cleaned = cleaned.replace(/^#+\s+.*\n/gm, '');

  return cleaned.trim();
}

/**
 * Extract tags from AI-generated description (legacy support)
 *
 * Note: As of v2.1, tags should NOT be in the description prose.
 * This function exists for parsing older descriptions that may still contain them.
 * New descriptions store tags in the separate `tags` database field.
 */
export function extractTags(description: string): string[] {
  const tagsMatch = description.match(/\*\*Tags:\*\*\s*([^\n]+)/i) ||
                    description.match(/Tags:\s*([^\n]+)/i);

  if (!tagsMatch) return [];

  const tagString = tagsMatch[1];
  return tagString
    .split(/[,`]/)
    .map(tag => tag.trim().replace(/`/g, ''))
    .filter(tag => tag.length > 0);
}

/**
 * Generate a fallback description when AI is unavailable
 */
export function generateFallbackDescription(event: EventForEnrichment): string {
  const parts: string[] = [];

  const dateFormatted = formatDateForDisplay(event.date);

  if (event.type === 'exhibition') {
    parts.push(
      `${event.title} is on display${event.venue ? ` at ${event.venue}` : ''}.`
    );
  } else {
    parts.push(
      `${event.title} takes place on ${dateFormatted}${event.venue ? ` at ${event.venue}` : ''}.`
    );
  }

  if (event.time) {
    parts.push(`The event begins at ${event.time}.`);
  }

  if (event.type && event.genre) {
    parts.push(`This ${event.type} features ${event.genre}.`);
  } else if (event.type) {
    parts.push(`This is a ${event.type} event.`);
  }

  if (event.price === 'open') {
    parts.push('Admission is free.');
  } else if (event.price === 'with-ticket') {
    parts.push('Tickets are required for entry.');
  }

  return parts.join(' ');
}

/**
 * Format date for display
 */
function formatDateForDisplay(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

/**
 * Determine enrichment tier based on available data
 */
export function determineEnrichmentTier(event: EventForEnrichment): 'stub' | 'standard' | 'premium' {
  let score = 0;

  // Basic data check
  if (event.title) score += 1;
  if (event.date) score += 1;
  if (event.venue) score += 1;

  // Extended data check
  if (event.genre) score += 1;
  if (event.type) score += 1;
  if (event.price || event.price_advance) score += 2;
  if (event.ticket_url) score += 1;
  if (event.neighborhood) score += 1;
  if (event.metro_station) score += 1;
  if (event.door_policy) score += 1;

  // Artist info boosts score
  if (event.artist_bio) score += 3;

  // Premium venues get premium treatment
  const premiumVenues = ['Gazarte', 'Half Note Jazz Club', 'Fuzz Club', 'SMUT Athens', 'Astron', 'Six D.O.G.S'];
  if (event.venue && premiumVenues.some(v => event.venue?.includes(v))) {
    score += 3;
  }

  if (score >= 10) return 'premium';
  if (score >= 5) return 'standard';
  return 'stub';
}
