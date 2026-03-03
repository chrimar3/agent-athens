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
  | 'default';

export interface MatrixEntry {
  min: number;
  max: number;
  en_min: number;  // English target (typically ~15% shorter than Greek)
  en_max: number;
  structure: 'three-part-block' | 'hybrid' | 'full-8-section';
}

// ============================================================================
// Matrix Config
// ============================================================================

export const ENRICHMENT_MATRIX: Record<EventCategory, MatrixEntry> = {
  exhibition:           { min: 200, max: 300, en_min: 170, en_max: 260, structure: 'hybrid' },
  concert_major:        { min: 120, max: 200, en_min: 100, en_max: 170, structure: 'hybrid' },
  concert_local:        { min: 80,  max: 120, en_min: 70,  en_max: 100, structure: 'three-part-block' },
  kids_family:          { min: 120, max: 180, en_min: 100, en_max: 155, structure: 'hybrid' },
  festival_parent:      { min: 250, max: 400, en_min: 215, en_max: 340, structure: 'full-8-section' },
  festival_sub:         { min: 80,  max: 150, en_min: 70,  en_max: 130, structure: 'three-part-block' },
  theater_ancient:      { min: 180, max: 250, en_min: 155, en_max: 215, structure: 'hybrid' },
  theater_contemporary: { min: 120, max: 180, en_min: 100, en_max: 155, structure: 'hybrid' },
  premium_showcase:     { min: 400, max: 600, en_min: 340, en_max: 510, structure: 'full-8-section' },
  default:              { min: 120, max: 200, en_min: 100, en_max: 170, structure: 'hybrid' },
};

// ============================================================================
// Classification
// ============================================================================

const PREMIUM_VENUES = ['Μέγαρο Μουσικής', 'Στέγη Ιδρύματος Ωνάση', 'ΚΠΙΣΝ', 'Ηρώδειο'];
const MAJOR_CONCERT_VENUES = ['Half Note', 'Gazarte', 'Σταυρός του Νότου', 'Fuzz', 'Gagarin'];
const KIDS_INDICATORS = ['παιδ', 'μωρ', 'νήπι', 'οικογέν', 'ages', 'ηλικ', 'kids', 'baby', 'toddler', 'children'];
const ANCIENT_INDICATORS = ['Αισχύλ', 'Σοφοκλ', 'Ευριπίδ', 'Αριστοφάν', 'Ιψεν', 'Ibsen', 'Τσέχωφ', 'Chekhov', 'Shakespeare'];

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
  if (PREMIUM_VENUES.some(v => venue.includes(v)) && type !== 'exhibition') {
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
  if (type === 'theater' || type === 'performance') {
    if (ANCIENT_INDICATORS.some(k => (event.title || '').includes(k))) {
      return 'theater_ancient';
    }
    return 'theater_contemporary';
  }

  // Concert/DJ classification
  if (type === 'dj_set') return 'concert_local';
  if (type === 'concert') {
    if (MAJOR_CONCERT_VENUES.some(v => venue.includes(v))) return 'concert_major';
    if (event.price_amount && event.price_amount >= 25) return 'concert_major';
    return 'concert_local';
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
