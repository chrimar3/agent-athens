// TypeScript interfaces for agent-athens

export interface Event {
  "@context": string;
  "@type": string;
  id: string;
  title: string;
  description: string;
  fullDescription?: string;  // Rich 400-word description (resolved: EN→GR→legacy)
  fullDescriptionEn?: string; // English description (from full_description_en column)
  fullDescriptionGr?: string; // Greek description (from full_description_gr or legacy)
  hasNativeGreek: boolean;    // true when full_description_gr column is populated
  startDate: string;  // ISO 8601
  endDate?: string;
  type: EventType;
  genres: string[];
  tags: string[];
  venue: Venue;
  price: Price;
  semanticTags?: SemanticTags;
  url?: string;
  ticketUrl?: string;  // Direct ticket purchase URL (more.com, viva.gr, etc.)
  // Formalized per decisions.md D11. Resolver cascade produces these values;
  // 'venue_registry' (legacy, pre-D11) retained for backward-compat during migration
  // but all new resolver output uses venue_registry_direct / venue_registry_search.
  ticketUrlStatus?:
    | 'direct'
    | 'detail_page'
    | 'venue_registry'  // legacy (pre-D11); kept for compat, not emitted by resolver
    | 'venue_registry_direct'
    | 'venue_registry_search'
    | 'crossref'
    | 'platform_search'
    | 'ai_discovered'
    | 'venue_fallback'
    | 'door_only'
    | 'expired'
    | 'unresolved'
    | 'open_entry';
  // Populated by Sprint 2.5 nightly resolver. Emitter prefers this over
  // ticketUrl when classifying for offers.url emission (see event-page.ts).
  // Required (not optional) so callers must explicitly express "not yet
  // resolved" via null rather than implicit undefined.
  ticketUrlResolved: string | null;
  source: string;
  createdAt: string;
  updatedAt: string;
  language: string;
  // Time enrichment fields
  timeDoors?: string;    // Door opening time (e.g., "21:00")
  timePeak?: string;     // Peak/main event time (e.g., "22:00")
  timeSource?: string;   // Where time came from: 'scraped_listing' | 'scraped_detail' | null
  // Exhibition-specific fields
  openingHours?: Record<string, string>;  // Day-of-week → hours, e.g., {"mon": "closed", "tue": "10:00-18:00"}
  closedDays?: string;                     // "Monday" or "Monday, Tuesday"
  permanentCollection?: boolean;           // true for permanent exhibitions
  // Image fields
  imageUrl?: string;       // og:image URL from source page (hotlinked)
  imageSource?: string;    // 'scraped_listing' | 'scraped_detail' | 'backfill' | 'not_found'
  imageLocal?: string;     // Self-hosted path, e.g. "/images/events/{id}.webp"
  // Venue fallback image (computed at build time from venue_context.image_path)
  venueImage?: string;
  // Location verification status
  locationStatus?: LocationStatus;
}

export type LocationStatus = 'verified_athens' | 'pass_through' | 'unverified' | 'rejected_non_athens' | 'problematic';

export type EventType =
  | 'concert'      // Live music (incl. classical, jazz, opera, recitals)
  | 'dj_set'       // DJ performances, electronic music nights
  | 'exhibition'   // Art exhibitions, museum shows, photography
  | 'cinema'       // Film screenings, outdoor cinema
  | 'theater'      // Theater productions (standardized spelling)
  | 'festival'     // Multi-day/multi-act festivals
  | 'performance'  // Ballet, dance, experimental, spoken word
  | 'show'         // Cabaret, variety shows, stand-up comedy
  | 'workshop'     // Interactive workshops, masterclasses
  | 'tech'         // Conferences, meetups, hackathons
  | 'dance'        // Dance events, tango nights
  | 'other';

export interface Venue {
  name: string;
  address: string;
  neighborhood?: string;
  coordinates?: {
    lat: number;
    lon: number;
  };
  capacity?: number;
  website?: string;  // Venue homepage; drives "Check venue website" Tier-5 CTA.
  sameAs?: string[];  // Identity links emitted as Schema.org sameAs; populated from VenueRecord via generate-site.ts attach.
}

/**
 * Canonical price model (Tier 1 rule per CLAUDE.md).
 * Union: 'open' | 'with-ticket' | 'donation'.
 *   - 'open':        free entry, no ticket needed
 *   - 'with-ticket': paid or RSVP-required entry
 *   - 'donation':    free entry, donations welcome (dormant — no scraper writer
 *                    yet, but active i18n + branching across offer-builder, cta,
 *                    resolver, page templates, i18n.ts)
 * Legacy 'tba' values are normalized at the write boundary by
 * normalizePriceType() in src/db/database.ts; 'tba' never reaches the DB.
 */
export interface Price {
  type: 'open' | 'with-ticket' | 'donation';
  amount?: number;
  currency?: string;
  range?: string;
}

export interface SemanticTags {
  mood: string[];
  audience: string[];
  vibe: string[];
}

export interface Filters {
  type?: EventType;
  time?: TimeRange;
  price?: PriceFilter;
  genre?: string;
}

export type TimeRange = 'today' | 'tomorrow' | 'this-week' | 'this-weekend' | 'this-month' | 'next-month' | 'all-events';
export type PriceFilter = 'open' | 'with-ticket' | 'all';

export interface PageMetadata {
  url: string;
  title: string;
  description: string;
  keywords: string;
  eventCount: number;
  lastUpdate: string;
  filters: Filters;
}

export interface FilterCountOption {
  value: string;
  label: string;
  count: number;
  url: string;
}

export interface FilterCounts {
  types: FilterCountOption[];
  prices: FilterCountOption[];
  timeRanges: FilterCountOption[];
}

export interface HubFaq {
  questionEl: string;
  answerEl: string;
  questionEn?: string;
  answerEn?: string;
}

export type HubFilter =
  | { type: 'date'; value: string }
  | { type: 'event_type'; value: string }
  | { type: 'event_types'; values: string[] }
  | { type: 'tag'; values: string[] }
  | { type: 'price_type'; value: string };

export interface HubConfig {
  slug: string;
  titleEl: string;
  titleEn: string;
  filter: HubFilter;
  answerCapsuleEl: string;
  answerCapsuleEn?: string;
  faqs: HubFaq[];
  cornerstone?: boolean;
  metaDescriptionEl?: string;
  metaDescriptionEn?: string;
  seasonalNarrativeEn?: string;
  seasonalNarrativeEl?: string;
}

export interface RawEvent {
  title: string;
  date: string;
  time?: string;
  venue: string;
  location: string;
  type: string;
  genre: string;
  price: string;
  description: string;
  url?: string;
  source: string;
}
