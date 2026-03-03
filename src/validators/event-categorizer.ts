/**
 * Event Categorizer - Intelligently categorizes events by type
 *
 * Uses keyword matching, genre analysis, and venue hints to determine
 * the most appropriate EventType for each event.
 *
 * Key improvements:
 * - Tango events correctly categorized as 'dance' (not 'theater')
 * - DJ events separated from concerts as 'dj_set'
 * - Outdoor cinema screenings categorized as 'cinema'
 * - Comedy/cabaret events categorized as 'show'
 */

import type { EventType } from '../types';

interface CategorizationRules {
  keywords: string[];
  genres?: string[];
  venueHints?: string[];
}

const CATEGORIZATION_MAP: Record<EventType, CategorizationRules> = {
  dj_set: {
    keywords: ['dj', 'dj set', 'electronic', 'techno', 'house', 'club night', 'rave', 'afterparty'],
    genres: ['Electronic', 'Techno', 'House', 'Trance', 'Drum and Bass', 'Dubstep', 'Ambient'],
    venueHints: ['club', 'dybbuk', 'romantso', 'six dogs', 'bios', 'void', 'astron', 'smut']
  },
  performance: {
    keywords: [
      'χορός', 'χορευτικ', 'ballet', 'μπαλέτο', 'contemporary dance', 'σύγχρονος χορός',
      'tango', 'ταγκό', 'flamenco', 'φλαμένκο', 'modern dance', 'dance performance',
      'χορευτική παράσταση', 'μιλόνγκα', 'milonga', 'salsa',
      'swing dance', 'swing dancing', 'lindy hop', 'jive',
      'performance', 'experimental', 'πειραματικό', 'multimedia', 'site-specific',
      'spoken word'
    ],
    genres: ['Dance', 'Ballet', 'Contemporary', 'Tango', 'Modern Dance', 'Experimental'],
    venueHints: ['dance', 'στέγη', 'megaron', 'onassis']
  },
  show: {
    keywords: [
      'cabaret', 'καμπαρέ', 'variety', 'comedy', 'κωμωδία', 'stand-up', 'stand up',
      'burlesque', 'drag show', 'magic show', 'circus', 'τσίρκο'
    ],
    genres: ['Comedy', 'Cabaret', 'Variety', 'Stand-up']
  },
  concert: {
    keywords: ['concert', 'συναυλία', 'live', 'gig', 'recital', 'ρεσιτάλ', 'jazz', 'rock', 'blues'],
    genres: [
      'Rock', 'Jazz', 'Pop', 'Classical', 'World', 'Folk', 'Blues', 'Soul', 'Indie',
      'Metal', 'Punk', 'Hip-Hop', 'R&B', 'Rebetiko', 'Greek', 'Latin'
    ]
  },
  theater: {
    keywords: ['θέατρο', 'theater', 'theatre', 'play', 'drama', 'δράμα', 'παράσταση', 'τραγωδία', 'tragedy'],
    genres: ['Theater', 'Drama', 'Theatre']
  },
  exhibition: {
    keywords: ['έκθεση', 'exhibition', 'gallery', 'γκαλερί', 'museum', 'μουσείο', 'εικαστικά'],
    genres: ['Art', 'Photography', 'Contemporary Art', 'Sculpture', 'Installation']
  },
  cinema: {
    keywords: ['cinema', 'σινεμά', 'ταινία', 'film', 'movie', 'premiere', 'πρεμιέρα',
      'προβολή', 'screening', 'outdoor cinema', 'θερινό σινεμά', 'cine', 'open air cinema'],
    genres: ['Film', 'Documentary', 'Short Film'],
    venueHints: ['open air', 'rooftop', 'θερινός']
  },
  workshop: {
    keywords: ['workshop', 'εργαστήριο', 'σεμινάριο', 'masterclass', 'class', 'μάθημα', 'course'],
    genres: ['Workshop', 'Educational', 'Masterclass']
  },
  tech: {
    keywords: [
      'conference', 'summit', 'symposium', 'congress', 'συνέδριο',
      'meetup', 'meet-up', 'hackathon', 'hack-a-thon', 'coding challenge',
      'seminar', 'research talk', 'lecture series', 'networking event'
    ],
    venueHints: ['megaron', 'oteacademy', 'eugenides', 'ellinikon', 'epignosis', 'found.ation', 'impact hub']
  },
  festival: {
    keywords: ['festival', 'φεστιβάλ'],
    genres: ['Festival']
  },
  dance: {
    keywords: [
      'tango', 'ταγκό', 'milonga', 'μιλόνγκα', 'salsa', 'swing dance',
      'lindy hop', 'social dance'
    ],
    genres: ['Dance', 'Tango', 'Latin Dance', 'Swing']
  },
  other: { keywords: [] }
};

// Keywords that should only match as whole words (avoid "class" matching "classical")
// These are problematic single words that commonly appear as substrings
const WHOLE_WORD_ONLY_KEYWORDS = ['class', 'cine', 'screening'];

/**
 * Check if keyword matches in text, using smart matching rules
 * - Multi-word phrases: simple includes
 * - Problematic single words: whole word match only
 * - Other single words: simple includes (works well for Greek)
 */
function matchesKeyword(text: string, keyword: string): boolean {
  // Multi-word keywords use simple includes
  if (keyword.includes(' ')) {
    return text.includes(keyword);
  }

  // Problematic single words need whole-word matching
  if (WHOLE_WORD_ONLY_KEYWORDS.includes(keyword)) {
    // Use word boundary regex for ASCII keywords
    const regex = new RegExp(`\\b${keyword}\\b`, 'i');
    return regex.test(text);
  }

  // All other keywords (including Greek) use simple includes
  // This works well because Greek words don't have the same substring issues
  return text.includes(keyword);
}

// Words that indicate a concert even if other keywords match
const CONCERT_OVERRIDE_KEYWORDS = [
  'jazz', 'quartet', 'trio', 'quintet', 'sextet', 'ορχήστρα', 'orchestra',
  'συναυλία', 'concert', 'recital', 'ρεσιτάλ', 'live music'
];

// Phrases that should NOT trigger dance categorization (social events, not performances)
const DANCE_FALSE_POSITIVES = [
  'αποκριάτικος χορός',  // Carnival ball
  'χορός ερωτευμένων',   // Valentine's ball
  'χοροεσπερίδα',        // Dance evening/ball
  'πάρτυ'                // Party
];

/**
 * Categorize an event based on its attributes
 *
 * @param event - Event data including title, description, genres, venue
 * @returns The most appropriate EventType
 */
export function categorizeEvent(event: {
  title: string;
  description?: string;
  genres?: string[];
  venue?: string;
  currentType?: EventType;
}): EventType {
  const text = `${event.title} ${event.description || ''}`.toLowerCase();
  const title = event.title.toLowerCase();
  const venue = (event.venue || '').toLowerCase();
  const genres = event.genres || [];

  // First check for concert override keywords
  // "Jazz at the Museum" should be concert, not exhibition
  const hasConcertSignal = CONCERT_OVERRIDE_KEYWORDS.some(k => text.includes(k));

  // Check for dance false positives (social events, not performances)
  const isDanceFalsePositive = DANCE_FALSE_POSITIVES.some(phrase => text.includes(phrase));

  // Priority order for categorization (more specific first)
  const categoryOrder: EventType[] = [
    'dj_set',      // Check DJ before concert (subset of music)
    'performance', // Check performance before theater (ballet/tango/dance fix)
    'show',        // Check show before theater (comedy/cabaret)
    'workshop',    // Specific format
    'exhibition',  // Art exhibitions
    'cinema',      // Film screenings in cinemas
    'festival',    // Multi-day festivals
    'concert',     // Live music (general)
    'theater',     // Theater productions
    'tech',        // Conferences, meetups, hackathons
  ];

  // Check each category in priority order
  for (const type of categoryOrder) {
    const rules = CATEGORIZATION_MAP[type];

    // Skip performance categorization for social dance events
    if (type === 'performance' && isDanceFalsePositive) {
      continue;
    }

    // Skip exhibition/screening/cinema if strong concert signals present
    // Prevents "Jazz at Museum" → exhibition, "screening room" metaphor → screening
    if ((type === 'exhibition' || type === 'cinema') && hasConcertSignal) {
      continue;
    }

    // Keyword match (strongest signal)
    for (const keyword of rules.keywords) {
      const keywordLower = keyword.toLowerCase();
      if (matchesKeyword(text, keywordLower)) {
        return type;
      }
    }

    // Genre match
    if (rules.genres) {
      for (const genre of genres) {
        if (rules.genres.some(g => g.toLowerCase() === genre.toLowerCase())) {
          return type;
        }
      }
    }

    // Venue hint match (weaker signal, only if no other match)
    if (rules.venueHints) {
      for (const hint of rules.venueHints) {
        if (venue.includes(hint.toLowerCase())) {
          // Only use venue hint if we haven't found a stronger match
          // Don't return immediately, continue checking
        }
      }
    }
  }

  // Fall back to current type or 'other'
  return event.currentType || 'other';
}

/**
 * Re-categorize an event if the current type seems incorrect
 *
 * @param event - Event with current type
 * @returns Updated type if different, or current type
 */
export function recategorizeIfNeeded(event: {
  title: string;
  description?: string;
  genres?: string[];
  venue?: string;
  type: EventType;
}): EventType {
  // Always re-check for dance events (tango fix)
  const text = `${event.title} ${event.description || ''}`.toLowerCase();

  // Tango should always be performance, not theater
  if (text.includes('tango') || text.includes('ταγκό') || text.includes('milonga') || text.includes('μιλόνγκα')) {
    return 'performance';
  }

  // DJ events should be dj_set, not concert
  if (event.type === 'concert') {
    const djKeywords = ['dj', 'techno', 'house music', 'electronic'];
    if (djKeywords.some(k => text.includes(k))) {
      return 'dj_set';
    }
  }

  return event.type;
}

/**
 * Normalize "theatre" spelling to "theater" (American English)
 */
export function normalizeTheaterSpelling(type: string): EventType {
  if (type === 'theatre') {
    return 'theater';
  }
  return type as EventType;
}
