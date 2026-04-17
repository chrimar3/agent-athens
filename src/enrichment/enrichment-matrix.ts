/**
 * Enrichment Matrix Configuration
 *
 * Enforces per-event-type word count ranges from the Variable Enrichment Matrix
 * defined in docs/MASTER-ENRICHMENT-TEMPLATE.md (lines 285-295).
 *
 * Previously, all events were told "400-600 words" and the quality gate classified
 * by actual word count at save time. This meant DJ sets and theater pieces got
 * bloated to 250-556 words when they should be 80-200.
 *
 * @see docs/MASTER-ENRICHMENT-TEMPLATE.md (Variable Enrichment Matrix)
 */

// ============================================================================
// Types
// ============================================================================

export type EventCategory =
  | 'exhibition'
  | 'concert_major'
  | 'concert_local'
  | 'kids_family'
  | 'festival_parent'
  | 'festival_sub'
  | 'theater_ancient'
  | 'theater_contemporary'
  | 'premium_showcase'
  | 'sports'
  | 'workshop'
  | 'dance'
  | 'lecture_talk'
  | 'cinema'
  | 'conference'
  | 'nightlife_dj'
  | 'performance'
  | 'show'
  | 'tech'
  | 'default';

export interface MatrixEntry {
  min: number;      // English primary target (proven across 274 descriptions)
  max: number;
  gr_min: number;   // Greek secondary target (typically ~85% of English)
  gr_max: number;
  structure: 'three-part-block' | 'hybrid' | 'full-8-section';
}

// ============================================================================
// Matrix Config
// ============================================================================

export const ENRICHMENT_MATRIX: Record<EventCategory, MatrixEntry> = {
  exhibition:           { min: 200, max: 300, gr_min: 170, gr_max: 260, structure: 'hybrid' },
  concert_major:        { min: 120, max: 200, gr_min: 100, gr_max: 170, structure: 'hybrid' },
  concert_local:        { min: 80,  max: 120, gr_min: 70,  gr_max: 100, structure: 'three-part-block' },
  kids_family:          { min: 120, max: 180, gr_min: 100, gr_max: 155, structure: 'hybrid' },
  festival_parent:      { min: 250, max: 400, gr_min: 215, gr_max: 340, structure: 'full-8-section' },
  festival_sub:         { min: 80,  max: 150, gr_min: 70,  gr_max: 130, structure: 'three-part-block' },
  theater_ancient:      { min: 180, max: 250, gr_min: 155, gr_max: 215, structure: 'hybrid' },
  theater_contemporary: { min: 120, max: 180, gr_min: 100, gr_max: 155, structure: 'hybrid' },
  premium_showcase:     { min: 400, max: 600, gr_min: 340, gr_max: 510, structure: 'full-8-section' },
  sports:               { min: 80,  max: 150, gr_min: 70,  gr_max: 130, structure: 'three-part-block' },
  workshop:             { min: 80,  max: 150, gr_min: 70,  gr_max: 130, structure: 'three-part-block' },
  dance:                { min: 120, max: 200, gr_min: 100, gr_max: 170, structure: 'hybrid' },
  lecture_talk:          { min: 80,  max: 150, gr_min: 70,  gr_max: 130, structure: 'three-part-block' },
  cinema:               { min: 80,  max: 120, gr_min: 70,  gr_max: 100, structure: 'three-part-block' },
  conference:           { min: 150, max: 250, gr_min: 130, gr_max: 215, structure: 'hybrid' },
  nightlife_dj:         { min: 80,  max: 120, gr_min: 70,  gr_max: 100, structure: 'three-part-block' },
  performance:          { min: 120, max: 200, gr_min: 100, gr_max: 170, structure: 'hybrid' },
  show:                 { min: 120, max: 200, gr_min: 100, gr_max: 170, structure: 'hybrid' },
  tech:                 { min: 120, max: 200, gr_min: 100, gr_max: 170, structure: 'hybrid' },
  default:              { min: 120, max: 200, gr_min: 100, gr_max: 170, structure: 'hybrid' },
};

// ============================================================================
// Timeliness Hints (per-event-type guidance for brief generation)
// ============================================================================

export const TIMELINESS_HINTS: Record<string, string> = {
  concert:     'Check for: album anniversary, tour cycle, return to Athens, career milestone. Fallback: seasonal slot or "first Athens date since [year]."',
  dj_set:      'Check for: residency duration, label anniversary, format origin. Fallback: "Week N of [format]" or "the Saturday slot that..."',
  exhibition:  'Check for: career retrospective, institutional milestone, curatorial debut. Fallback: "Running through [end date] — [N weeks] remaining."',
  cinema:      'Check for: anniversary screening, restoration, director retrospective. Fallback: seasonal programming or festival context.',
  theater:     'Check for: playwright anniversary, director\'s first staging, season count, award, premiere status. Fallback: "[Nth] consecutive season" or "Athens premiere."',
  festival:    'Edition number is always available. Also check: headline changes, venue shift, anniversary.',
  performance: 'Check for: premiere status, commission context, limited-run dates. Dance/spoken word often has very short runs — say so.',
  show:        'Check for: tour routing, residency length, one-off status. Cabaret and variety need "why this specific night."',
  workshop:    'Check for: enrollment deadline, capacity limit, series position. "Third of six sessions" or "last spots" creates urgency.',
  tech:        'Check for: industry cycle, speaker exclusivity, community milestone.',
  dance:       'Check for: premiere status, choreographer context, venue-specific staging that won\'t recur.',
  other:       'Find the one fact that answers "why this week and not next week?" If nothing, state "single-run" or "limited engagement."',
};

// ============================================================================
// Classification
// ============================================================================

const PREMIUM_VENUES = [
  'Μέγαρο Μουσικής', 'Στέγη Ιδρύματος Ωνάση', 'ΚΠΙΣΝ', 'Ηρώδειο',
  'Onassis Stegi', 'Onassis Ready', // English venue name variants
];
const MAJOR_CONCERT_VENUES = ['Half Note', 'Gazarte', 'Σταυρός του Νότου', 'Fuzz', 'Gagarin'];
const KIDS_INDICATORS = ['παιδ', 'μωρ', 'νήπι', 'οικογέν', 'ages', 'ηλικ', 'kids', 'baby', 'toddler', 'children'];
const ANCIENT_INDICATORS = ['Αισχύλ', 'Σοφοκλ', 'Ευριπίδ', 'Αριστοφάν', 'Ιψεν', 'Ibsen', 'Τσέχωφ', 'Chekhov', 'Shakespeare'];

/** Normalize venue name for matching: uppercase + strip Greek diacritics */
function normalizeVenue(s: string): string {
  return s.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** Case-insensitive, accent-insensitive venue list check */
function venueMatches(venue: string, list: string[]): boolean {
  const norm = normalizeVenue(venue);
  return list.some(v => norm.includes(normalizeVenue(v)));
}

/**
 * Classify an event into an enrichment category based on type, venue, price, and title.
 */
export function classifyEvent(event: {
  type: string;
  venue_name?: string | null;
  price_amount?: number | null;
  title?: string | null;
}): EventCategory {
  const type = event.type;
  const venue = event.venue_name || '';
  const title = (event.title || '').toLowerCase();

  // Premium venues -> premium_showcase (unless exhibition or kids)
  if (venueMatches(venue, PREMIUM_VENUES) && type !== 'exhibition') {
    if (KIDS_INDICATORS.some(k => title.includes(k))) {
      return 'kids_family';
    }
    return 'premium_showcase';
  }

  if (type === 'exhibition') return 'exhibition';
  if (type === 'festival') return 'festival_parent';

  // Kids/family detection
  if (KIDS_INDICATORS.some(k => title.includes(k))) {
    return 'kids_family';
  }

  // Theater classification
  if (type === 'theater') {
    if (ANCIENT_INDICATORS.some(k => (event.title || '').includes(k))) {
      return 'theater_ancient';
    }
    return 'theater_contemporary';
  }

  // Concert/DJ classification — both types check venue and price
  if (type === 'dj_set' || type === 'concert') {
    if (venueMatches(venue, MAJOR_CONCERT_VENUES)) return 'concert_major';
    if (event.price_amount && event.price_amount >= 25) return 'concert_major';
    return 'concert_local';
  }

  // New category-specific routing (previously fell through to default)
  if (type === 'dance') return 'dance';
  if (type === 'performance') return 'performance';
  if (type === 'workshop') return 'workshop';
  if (type === 'cinema') return 'cinema';
  if (type === 'show') return 'show';
  if (type === 'tech') return 'tech';

  // Log a warning when hitting default — indicates a category the matrix doesn't cover
  if (type !== 'other') {
    console.warn(`[enrichment-matrix] Event type "${type}" hit default fallback — consider adding a matrix row`);
  }

  return 'default';
}

/**
 * Get the word count target for an event based on its classification.
 */
export function getWordTarget(event: {
  type: string;
  venue_name?: string | null;
  price_amount?: number | null;
  title?: string | null;
}): MatrixEntry {
  const category = classifyEvent(event);
  return ENRICHMENT_MATRIX[category];
}

/**
 * Map matrix structure to quality gate tier.
 */
export function structureToTier(structure: MatrixEntry['structure']): 'stub' | 'standard' | 'premium' {
  switch (structure) {
    case 'three-part-block': return 'stub';
    case 'hybrid': return 'standard';
    case 'full-8-section': return 'premium';
  }
}
