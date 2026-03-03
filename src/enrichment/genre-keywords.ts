/**
 * Genre Keywords Mapping Module
 *
 * Purpose: Provide semantic keyword clusters for GEO optimization
 * These keywords help AI answer engines understand event context
 */

import { EventType } from './types';

/**
 * Genre-specific semantic keyword clusters
 * Used naturally in descriptions for better AI indexing
 */
export const GENRE_KEYWORDS: Record<string, string[]> = {
  // Music genres
  jazz: [
    'improvisation',
    'ensemble',
    'bebop',
    'swing',
    'acoustic performance',
    'quintet',
    'quartet',
    'saxophone',
    'piano trio',
    'bass',
    'drums',
    'composition',
    'modal jazz',
    'Mediterranean influences',
  ],
  rock: [
    'electric guitar',
    'amplified performance',
    'rock band',
    'live energy',
    'stage presence',
    'setlist',
    'encore',
    'crowd engagement',
  ],
  electronic: [
    'DJ set',
    'electronic music',
    'synthesizer',
    'live mixing',
    'dance floor',
    'sound system',
    'techno',
    'house music',
  ],
  classical: [
    'orchestral',
    'chamber music',
    'virtuoso',
    'conductor',
    'repertoire',
    'acoustic hall',
    'musical interpretation',
  ],
  indie: [
    'independent artist',
    'alternative music',
    'songwriting',
    'intimate performance',
    'emerging artist',
  ],

  // Visual arts
  'contemporary-art': [
    'installation',
    'gallery space',
    'curator',
    'conceptual art',
    'visual art',
    'exhibition design',
    'contemporary practice',
    'art criticism',
    'cultural institution',
    'artistic investigation',
  ],
  painting: [
    'canvas',
    'brushwork',
    'color palette',
    'composition',
    'visual narrative',
    'artistic technique',
  ],
  photography: [
    'photographic work',
    'visual storytelling',
    'exhibition prints',
    'lens-based art',
    'documentary approach',
  ],
  sculpture: [
    'three-dimensional work',
    'spatial intervention',
    'material exploration',
    'sculptural form',
  ],

  // Performance arts
  theater: [
    'theatrical performance',
    'stage production',
    'acting',
    'playwright',
    'drama',
    'ensemble cast',
    'direction',
    'script',
    'theatrical tradition',
    'stagecraft',
  ],
  dance: [
    'choreography',
    'movement',
    'dance performance',
    'physical expression',
    'contemporary dance',
  ],
  'stand-up-comedy': [
    'observational humor',
    'social commentary',
    'wit',
    'comedic timing',
    'audience engagement',
    'storytelling',
    'satire',
    'improvisation',
    'comedy special',
  ],

  // Film
  cinema: [
    'film screening',
    'cinematography',
    'director',
    'narrative cinema',
    'independent film',
    'documentary',
  ],
  documentary: [
    'non-fiction film',
    'real-world subjects',
    'investigative storytelling',
    'factual cinema',
  ],

  // Educational
  workshop: [
    'hands-on learning',
    'creative practice',
    'skill development',
    'participatory',
    'experiential learning',
    'facilitation',
    'artistic technique',
    'creative expression',
    'practical instruction',
  ],
  lecture: [
    'educational presentation',
    'expert knowledge',
    'academic discourse',
    'intellectual engagement',
  ],
};

/**
 * Event type-specific context descriptions
 */
export const EVENT_TYPE_CONTEXT: Record<EventType, string> = {
  concert:
    'A live musical performance where audiences experience musicians performing in real-time. Concerts offer the energy and spontaneity of live music, often with opportunities to hear new interpretations of known works or premiere performances.',

  dj_set:
    'A DJ performance or electronic music night featuring curated mixes and live mixing. DJ sets create immersive sonic environments where rhythm and atmosphere build over extended sessions.',

  exhibition:
    'A curated display of visual art in a gallery or museum setting. Exhibitions allow viewers to engage with artworks in person, observing details, scale, and spatial relationships that reproductions cannot convey.',

  cinema:
    'A film screening featuring independent, international, classic, or art house cinema in a dedicated theater environment. Cinema screenings provide communal viewing experiences with professional projection and sound design.',

  theater:
    'A live theatrical performance featuring actors, staging, and dramatic narrative. Theater offers the immediacy of live storytelling, where performers and audiences share the same space and moment, creating a unique communal experience.',

  festival:
    'A multi-day or multi-act cultural celebration bringing together diverse performances and activities. Festivals create concentrated cultural experiences with a curated programme spanning multiple venues or stages.',

  performance:
    'A live artistic presentation that may combine elements of theater, dance, music, or multimedia. Performances often explore experimental or interdisciplinary approaches to live art, pushing boundaries of traditional formats.',

  show:
    'A staged entertainment production such as cabaret, variety, or stand-up comedy. Shows emphasize audience engagement and entertainment, from intimate comedy sets to elaborate variety productions.',

  workshop:
    'A participatory educational experience where attendees learn through hands-on practice. Workshops emphasize skill development and creative exploration in a supportive group environment, with guidance from experienced facilitators.',

  tech:
    'A technology-focused event such as a conference, meetup, hackathon, or seminar. Tech events bring together practitioners, researchers, and community members around shared technology interests.',

  dance:
    'A dance event featuring social dancing, performances, or dance workshops. Dance events range from tango milongas and swing nights to contemporary dance showcases.',

  other:
    'A cultural event in Athens that does not fit into standard categories.',
};

/**
 * Get semantic keywords for a genre and event type
 * Returns unique keywords combining both genre and type
 */
export function getGenreKeywords(
  genre: string,
  type: EventType
): string[] {
  const genreKeys = GENRE_KEYWORDS[genre] || [];
  const typeKeys = getEventTypeKeywords(type);

  // Combine and deduplicate
  return [...new Set([...genreKeys, ...typeKeys])];
}

/**
 * Get keywords specific to event type
 */
function getEventTypeKeywords(type: EventType): string[] {
  const typeKeywordMap: Record<EventType, string[]> = {
    concert: [
      'live music',
      'concert venue',
      'musical performance',
      'Athens music scene',
    ],
    dj_set: [
      'DJ set',
      'electronic music',
      'club night',
      'Athens nightlife',
    ],
    exhibition: [
      'art exhibition',
      'visual arts',
      'gallery',
      'Athens art scene',
    ],
    cinema: [
      'film screening',
      'cinema',
      'movie theater',
      'Athens cinemas',
    ],
    theater: [
      'theatrical performance',
      'theater production',
      'Athens theater',
    ],
    festival: [
      'festival',
      'multi-day event',
      'Athens festival',
    ],
    performance: [
      'live performance',
      'performing arts',
      'Athens cultural scene',
    ],
    show: [
      'cabaret',
      'variety show',
      'stand-up comedy',
      'Athens entertainment',
    ],
    workshop: [
      'educational workshop',
      'creative learning',
      'Athens workshops',
    ],
    tech: [
      'tech conference',
      'developer meetup',
      'hackathon',
      'Athens tech scene',
    ],
    dance: [
      'dance event',
      'tango',
      'social dance',
      'Athens dance scene',
    ],
    other: [],
  };

  return typeKeywordMap[type] || [];
}

/**
 * Get event type context description
 */
export function getEventTypeContext(type: EventType): string {
  return EVENT_TYPE_CONTEXT[type] || 'A cultural event in Athens.';
}

/**
 * Normalize genre string for lookup
 * Handles variations and common spellings
 */
export function normalizeGenre(genre: string): string {
  const normalized = genre.toLowerCase().trim();

  // Handle common variations
  const genreMap: Record<string, string> = {
    'stand-up': 'stand-up-comedy',
    standup: 'stand-up-comedy',
    comedy: 'stand-up-comedy',
    'contemporary art': 'contemporary-art',
    modern: 'contemporary-art',
    theatre: 'theater',
  };

  return genreMap[normalized] || normalized;
}
