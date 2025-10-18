// TypeScript interfaces for agent-athens

export interface Event {
  "@context": string;
  "@type": string;
  id: string;
  title: string;
  description: string;
  startDate: string;  // ISO 8601
  endDate?: string;
  type: EventType;
  genres: string[];
  tags: string[];
  venue: Venue;
  price: Price;
  semanticTags?: SemanticTags;
  url?: string;
  source: string;
  createdAt: string;
  updatedAt: string;
  language: string;
}

export type EventType = 'concert' | 'exhibition' | 'cinema' | 'theater' | 'performance' | 'workshop' | 'other';

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
  type: 'free' | 'paid' | 'donation';
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
export type PriceFilter = 'free' | 'paid' | 'all';

export interface PageMetadata {
  url: string;
  title: string;
  description: string;
  keywords: string;
  eventCount: number;
  lastUpdate: string;
  filters: Filters;
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
