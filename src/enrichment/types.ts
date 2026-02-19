/**
 * Types for the Pre-Enrichment Pipeline
 *
 * Purpose: Enrich sparse scraped event data with contextual information
 * before AI description generation
 */

export interface VenueContext {
  venue_name: string;
  neighborhood?: string;
  description?: string;
  venue_type?: string;
  capacity?: number;
  established_year?: number;
  last_updated?: string;
}

export interface ArtistInfo {
  name: string;
  bio?: string;
  genre?: string;
  notable_works?: string[];
  career_highlights?: string;
  active_since?: number;
}

export interface EventEnrichment {
  venue_context?: VenueContext;
  artist_info?: ArtistInfo;
  genre_keywords: string[];
  event_type_context: string;
  enrichment_timestamp: string;
  enrichment_version: string;
}

export interface EnrichedEvent {
  // Original event fields
  id: string;
  title: string;
  start_date: string;
  venue_name: string;
  type: EventType;
  genre: string;
  price_type: 'open' | 'with-ticket';
  price_amount?: number;
  description?: string;

  // Enrichment data
  enrichment: EventEnrichment;
}

export type EventType =
  | 'concert'
  | 'exhibition'
  | 'cinema'
  | 'theater'
  | 'performance'
  | 'workshop';

export interface EnrichmentStats {
  total_events: number;
  enriched: number;
  venue_lookups: number;
  artist_lookups: number;
  cache_hits: number;
  web_searches: number;
  failures: number;
  avg_enrichment_time_ms: number;
}
