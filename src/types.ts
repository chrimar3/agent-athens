// TypeScript interfaces for agent-athens

export interface Event {
  "@context": string;
  "@type": string;
  id: string;
  title: string;
  description: string;
  fullDescription?: string;  // Rich 400-word description
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
}

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
  faqs: HubFaq[];
  cornerstone?: boolean;
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
