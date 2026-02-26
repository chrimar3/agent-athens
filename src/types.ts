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
  | 'concert'      // Live music performances
  | 'dj_set'       // DJ performances, electronic music nights
  | 'exhibition'   // Art exhibitions, museum shows
  | 'cinema'       // Film screenings
  | 'screening'    // Alternative venue screenings, outdoor cinema
  | 'theater'      // Theater productions (standardized spelling)
  | 'dance'        // Dance performances, ballet, contemporary
  | 'opera'        // Opera performances
  | 'classical'    // Classical/orchestral music
  | 'comedy'       // Stand-up, comedy shows
  | 'festival'     // Multi-day/multi-act festivals
  | 'performance'  // Hybrid/experimental performances
  | 'show'         // Cabaret, variety shows
  | 'workshop'     // Interactive workshops, masterclasses
  | 'conference'   // Tech/AI conferences, summits
  | 'meetup'       // Community meetups, tech gatherings
  | 'hackathon'    // Coding hackathons, innovation events
  | 'seminar'      // Academic seminars, research talks
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
