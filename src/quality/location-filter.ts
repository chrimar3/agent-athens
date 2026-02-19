#!/usr/bin/env bun
/**
 * Location Filter - Spec-compliant Athens location verification
 *
 * Implements FR-B from spec 001-data-pipeline:
 * - Maintains venue whitelist from config/athens-venues.json
 * - Maintains location blacklist from config/rejected-locations.json
 * - Returns location_status: verified_athens | pass_through | unverified | rejected_non_athens | problematic
 * - Auto-merges venue variations to canonical names
 *
 * @see specs/001-data-pipeline/spec.md
 */

import { readFileSync } from 'fs';
import { join } from 'path';

// ============================================================================
// Types
// ============================================================================

export type LocationStatus =
  | 'verified_athens'      // Known Athens venue
  | 'pass_through'         // Not a real venue but allowed (e.g., "Πολλαπλοί Χώροι")
  | 'unverified'           // Unknown venue, needs review
  | 'rejected_non_athens'  // Non-Athens location
  | 'problematic';         // Generic/invalid venue entry (TBA, etc.)

export interface LocationResult {
  status: LocationStatus;
  matched_venue?: string;      // Canonical venue name if matched
  rejection_reason?: string;   // Why it was rejected/flagged
  original_venue?: string;     // Original venue name from event
}

export interface EventLocation {
  title?: string;
  description?: string;
  venue_name?: string;
  venue_address?: string;
  venue_neighborhood?: string;
  venue?: string | { name?: string; address?: string };
  location?: string;
}

// ============================================================================
// Config Types
// ============================================================================

interface VenueConfig {
  canonical_name: string;
  variations: string[];
  neighborhood?: string;
}

interface AthensVenuesConfig {
  venues: VenueConfig[];
  neighborhoods: string[];
  pass_through_venues: string[];
}

interface RejectedCity {
  greek: string;
  latin: string;
}

interface RejectedVenue {
  name: string;
  reason: string;
}

interface ProblematicEntry {
  name: string;
  reason: string;
}

interface RejectedLocationsConfig {
  cities: RejectedCity[];
  regions: RejectedCity[];
  venues: RejectedVenue[];
  problematic_entries: {
    entries: ProblematicEntry[];
  };
}

// ============================================================================
// Config Loading
// ============================================================================

let athensConfig: AthensVenuesConfig | null = null;
let rejectedConfig: RejectedLocationsConfig | null = null;

function loadConfigs(): void {
  if (athensConfig && rejectedConfig) return; // Already loaded

  try {
    const athensPath = join(import.meta.dir, '../../config/athens-venues.json');
    athensConfig = JSON.parse(readFileSync(athensPath, 'utf-8'));
  } catch (error) {
    console.warn('⚠️  Could not load config/athens-venues.json');
    athensConfig = { venues: [], neighborhoods: [], pass_through_venues: [] };
  }

  try {
    const rejectedPath = join(import.meta.dir, '../../config/rejected-locations.json');
    rejectedConfig = JSON.parse(readFileSync(rejectedPath, 'utf-8'));
  } catch (error) {
    console.warn('⚠️  Could not load config/rejected-locations.json');
    rejectedConfig = { cities: [], regions: [], venues: [], problematic_entries: { entries: [] } };
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Normalize text for comparison (lowercase, trim)
 */
function normalize(text: string | undefined | null): string {
  if (!text) return '';
  return text.toLowerCase().trim();
}

/**
 * Minimum character length for substring matching
 * Short names like "AN", "IT", "EXA" would match inside random text
 * e.g., "AN" matches in "rANdom"
 */
const MIN_SUBSTRING_MATCH_LENGTH = 5;

/**
 * Check if text contains any of the search terms
 */
function containsAny(text: string, terms: string[]): string | null {
  const normalizedText = normalize(text);
  for (const term of terms) {
    if (normalizedText.includes(normalize(term))) {
      return term;
    }
  }
  return null;
}

/**
 * Extract venue name from various event formats
 */
function extractVenueName(event: EventLocation): string | undefined {
  if (event.venue_name) return event.venue_name;
  if (typeof event.venue === 'string') return event.venue;
  if (event.venue && typeof event.venue === 'object') {
    return event.venue.name || event.venue.address;
  }
  return undefined;
}

/**
 * Build blacklist terms from rejected config
 */
function getBlacklistTerms(): string[] {
  loadConfigs();
  if (!rejectedConfig) return [];

  const terms: string[] = [];

  // Add cities
  for (const city of rejectedConfig.cities) {
    terms.push(city.greek, city.latin);
  }

  // Add regions
  for (const region of rejectedConfig.regions) {
    terms.push(region.greek, region.latin);
  }

  return terms;
}

/**
 * Get rejected venues map
 */
function getRejectedVenues(): Map<string, string> {
  loadConfigs();
  if (!rejectedConfig) return new Map();

  const map = new Map<string, string>();
  for (const venue of rejectedConfig.venues) {
    map.set(normalize(venue.name), venue.reason);
  }
  return map;
}

/**
 * Get problematic entries map
 */
function getProblematicEntries(): Map<string, string> {
  loadConfigs();
  if (!rejectedConfig?.problematic_entries?.entries) return new Map();

  const map = new Map<string, string>();
  for (const entry of rejectedConfig.problematic_entries.entries) {
    map.set(normalize(entry.name), entry.reason);
  }
  return map;
}

// ============================================================================
// Main Filter Function
// ============================================================================

/**
 * Check event location and return detailed result
 *
 * Order of checks:
 * 1. Pass-through venues (bypass verification)
 * 2. Blacklist check (reject non-Athens)
 * 3. Problematic entries (flag for review)
 * 4. Specific rejected venues
 * 5. Whitelist check (approve + auto-merge)
 * 6. Neighborhood check
 * 7. Unknown → unverified
 */
export function checkLocation(event: EventLocation): LocationResult {
  loadConfigs();

  const venueName = extractVenueName(event);
  const normalizedVenue = venueName ? normalize(venueName) : '';

  // -------------------------------------------------------------------------
  // Step 0: Pass-through venues (e.g., "Πολλαπλοί Χώροι")
  // -------------------------------------------------------------------------
  if (venueName && athensConfig?.pass_through_venues) {
    for (const passThrough of athensConfig.pass_through_venues) {
      if (normalizedVenue.includes(normalize(passThrough)) ||
          normalize(passThrough).includes(normalizedVenue)) {
        return {
          status: 'pass_through',
          matched_venue: passThrough,
          original_venue: venueName,
        };
      }
    }
  }

  // -------------------------------------------------------------------------
  // Step 1: Blacklist check (reject non-Athens cities/regions)
  // -------------------------------------------------------------------------
  const blacklistTerms = getBlacklistTerms();
  const fieldsToCheck = [
    event.title,
    event.description,
    event.venue_name,
    event.venue_address,
    event.location,
    typeof event.venue === 'string' ? event.venue : event.venue?.name,
  ].filter(Boolean) as string[];

  for (const field of fieldsToCheck) {
    const match = containsAny(field, blacklistTerms);
    if (match) {
      return {
        status: 'rejected_non_athens',
        rejection_reason: `Contains non-Athens location: "${match}"`,
        original_venue: venueName,
      };
    }
  }

  // -------------------------------------------------------------------------
  // Step 1b: Problematic entries (TBA, generic names, etc.)
  // -------------------------------------------------------------------------
  if (venueName) {
    const problematic = getProblematicEntries();
    const reason = problematic.get(normalizedVenue);
    if (reason) {
      return {
        status: 'problematic',
        rejection_reason: reason,
        original_venue: venueName,
      };
    }
  }

  // -------------------------------------------------------------------------
  // Step 1c: Specifically rejected venues
  // -------------------------------------------------------------------------
  if (venueName) {
    const rejectedVenues = getRejectedVenues();
    const reason = rejectedVenues.get(normalizedVenue);
    if (reason) {
      return {
        status: 'rejected_non_athens',
        rejection_reason: reason,
        original_venue: venueName,
      };
    }
  }

  // -------------------------------------------------------------------------
  // Step 2: Whitelist check (approve + auto-merge to canonical name)
  // -------------------------------------------------------------------------
  if (venueName && athensConfig?.venues) {
    for (const venueConfig of athensConfig.venues) {
      const canonicalNorm = normalize(venueConfig.canonical_name);

      // Check canonical name - exact match always allowed
      if (normalizedVenue === canonicalNorm) {
        return {
          status: 'verified_athens',
          matched_venue: venueConfig.canonical_name,
          original_venue: venueName,
        };
      }

      // Substring matching only for longer names (avoid "AN" matching in "random")
      if (canonicalNorm.length >= MIN_SUBSTRING_MATCH_LENGTH) {
        if (normalizedVenue.includes(canonicalNorm) ||
            canonicalNorm.includes(normalizedVenue)) {
          return {
            status: 'verified_athens',
            matched_venue: venueConfig.canonical_name,
            original_venue: venueName,
          };
        }
      }

      // Check variations
      for (const variation of venueConfig.variations) {
        const variationNorm = normalize(variation);

        // Exact match always allowed
        if (normalizedVenue === variationNorm) {
          return {
            status: 'verified_athens',
            matched_venue: venueConfig.canonical_name, // Auto-merge to canonical
            original_venue: venueName,
          };
        }

        // Substring matching only for longer variations
        if (variationNorm.length >= MIN_SUBSTRING_MATCH_LENGTH) {
          if (normalizedVenue.includes(variationNorm) ||
              variationNorm.includes(normalizedVenue)) {
            return {
              status: 'verified_athens',
              matched_venue: venueConfig.canonical_name, // Auto-merge to canonical
              original_venue: venueName,
            };
          }
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // Step 3: Neighborhood check
  // -------------------------------------------------------------------------
  const neighborhood = event.venue_neighborhood || event.location;
  if (neighborhood && athensConfig?.neighborhoods) {
    for (const athensNeighborhood of athensConfig.neighborhoods) {
      if (normalize(neighborhood).includes(normalize(athensNeighborhood))) {
        return {
          status: 'verified_athens',
          original_venue: venueName,
        };
      }
    }
  }

  // -------------------------------------------------------------------------
  // Step 4: Unknown → unverified
  // -------------------------------------------------------------------------
  return {
    status: 'unverified',
    original_venue: venueName,
  };
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Check if event should appear on site
 * Only verified_athens and pass_through events are shown
 */
export function shouldShowOnSite(event: EventLocation): boolean {
  const result = checkLocation(event);
  return result.status === 'verified_athens' || result.status === 'pass_through';
}

/**
 * Check if event should be rejected (deleted/logged)
 */
export function shouldReject(event: EventLocation): boolean {
  const result = checkLocation(event);
  return result.status === 'rejected_non_athens';
}

/**
 * Legacy compatibility: Returns true if event is in Athens
 * @deprecated Use checkLocation() for full status information
 */
export function isAthensEvent(event: EventLocation): boolean {
  const result = checkLocation(event);
  return result.status !== 'rejected_non_athens';
}

/**
 * Filter events for site display
 */
export function filterForSite<T extends EventLocation>(events: T[]): T[] {
  return events.filter(shouldShowOnSite);
}

/**
 * Categorize events by location status
 */
export function categorizeEvents<T extends EventLocation>(events: T[]): {
  verified: T[];
  passThrough: T[];
  unverified: T[];
  rejected: T[];
  problematic: T[];
} {
  const result = {
    verified: [] as T[],
    passThrough: [] as T[],
    unverified: [] as T[],
    rejected: [] as T[],
    problematic: [] as T[],
  };

  for (const event of events) {
    const check = checkLocation(event);
    switch (check.status) {
      case 'verified_athens':
        result.verified.push(event);
        break;
      case 'pass_through':
        result.passThrough.push(event);
        break;
      case 'unverified':
        result.unverified.push(event);
        break;
      case 'rejected_non_athens':
        result.rejected.push(event);
        break;
      case 'problematic':
        result.problematic.push(event);
        break;
    }
  }

  return result;
}

/**
 * Get filter statistics
 */
export function getFilterStats<T extends EventLocation>(events: T[]): {
  total: number;
  verified: number;
  passThrough: number;
  unverified: number;
  rejected: number;
  problematic: number;
  showOnSite: number;
} {
  const categorized = categorizeEvents(events);

  return {
    total: events.length,
    verified: categorized.verified.length,
    passThrough: categorized.passThrough.length,
    unverified: categorized.unverified.length,
    rejected: categorized.rejected.length,
    problematic: categorized.problematic.length,
    showOnSite: categorized.verified.length + categorized.passThrough.length,
  };
}

/**
 * Log filter results
 */
export function logFilterResults<T extends EventLocation>(events: T[], label = 'Events'): void {
  const stats = getFilterStats(events);

  console.log(`\n📍 Location Filter - ${label}:`);
  console.log(`   Total: ${stats.total}`);
  console.log(`   ✅ Verified Athens: ${stats.verified}`);
  console.log(`   ↪️  Pass-through: ${stats.passThrough}`);
  console.log(`   ❓ Unverified: ${stats.unverified}`);
  console.log(`   ❌ Rejected: ${stats.rejected}`);
  console.log(`   ⚠️  Problematic: ${stats.problematic}`);
  console.log(`   🌐 Show on site: ${stats.showOnSite}`);
}
