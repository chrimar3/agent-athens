#!/usr/bin/env bun
/**
 * Athens Location Filter - Enhanced with Venue Whitelist
 *
 * Three-tier filtering strategy for 100% accuracy:
 * 1. WHITELIST: Known Athens venues (highest confidence)
 * 2. BLACKLIST: Non-Athens cities (reject immediately)
 * 3. FALLBACK: Unknown venues (use heuristics)
 *
 * Usage:
 *   import { isAthensEvent } from './utils/athens-filter';
 *   if (!isAthensEvent(event)) return; // Skip non-Athens events
 */

import { readFileSync } from 'fs';
import { join } from 'path';

export interface EventLocation {
  title?: string;
  description?: string;  // ADD: Check description field too
  venue_name?: string;
  venue_address?: string;
  venue_neighborhood?: string;
  // Support RawEvent format as well
  venue?: string;
  location?: string;
}

/**
 * Load Athens venue whitelist from config
 *
 * Supports both old format (string array) and new format (object array with canonical_name/variations)
 */
let athensVenues: string[] = [];
let athensNeighborhoods: string[] = [];

try {
  const configPath = join(import.meta.dir, '../../config/athens-venues.json');
  const config = JSON.parse(readFileSync(configPath, 'utf-8'));

  // Handle new config format (object array with canonical_name/canonical and variations)
  if (config.venues && config.venues.length > 0) {
    if (typeof config.venues[0] === 'object') {
      // New format: extract all venue names (canonical/canonical_name + variations)
      for (const venue of config.venues) {
        // Support both "canonical_name" and "canonical" field names
        const venueName = venue.canonical_name || venue.canonical;
        if (venueName) {
          athensVenues.push(venueName);
        }
        if (venue.variations && Array.isArray(venue.variations)) {
          athensVenues.push(...venue.variations.filter((v: string) => v));
        }
      }
    } else {
      // Old format: array of strings
      athensVenues = config.venues;
    }
  }

  athensNeighborhoods = config.neighborhoods || [];
} catch (error) {
  console.warn('⚠️  Could not load athens-venues.json, using blacklist-only mode');
}

/**
 * Non-Athens cities to filter out
 */
const NON_ATHENS_CITIES = [
  // Thessaloniki (northern Greece)
  'Θεσσαλον',
  'Thessaloniki',
  'Σαλονίκ',
  'ΘΚΕΣΣΑΛΟΝΙΚΗ',
  'Μεγαρο Μουσικης Θεσσαλονικης',  // Specific problematic venue
  'Θεατρο Μονης Λαζαριστων',       // Moni Lazariston Theater
  'Θέατρο Μονής Λαζαριστών',
  'Moni Lazariston',
  'Νοησις',                         // Noesis Science Center
  'Noesis',

  // Komotini (northeastern Greece)
  'Κομοτην',
  'Komotini',
  'Μεγαρο Μουσικης Κομοτηνης',     // Komotini Concert Hall
  'Μέγαρο Μουσικής Κομοτηνής',

  // Kalamata (southwestern Greece)
  'Καλαμάτα',
  'Kalamata',

  // Patras (western Greece)
  'Πάτρα',
  'Patras',

  // Volos (central Greece)
  'Βόλος',
  'Volos',

  // Heraklion (Crete)
  'Ηράκλειο',
  'Heraklion',
  'Ηρακλειον',
  'Iraklio',

  // Chania (Crete)
  'Χανιά',
  'Chania',

  // Rhodes
  'Ρόδος',
  'Rhodes',

  // Ioannina (northwestern Greece)
  'Ιωάννινα',
  'Ioannina',

  // Larissa (central Greece)
  'Λάρισα',
  'Larissa',

  // Kavala (northern Greece)
  'Καβάλα',
  'Kavala',

  // Corfu
  'Κέρκυρα',
  'Corfu',

  // Tripoli (Peloponnese)
  'Τρίπολη',
  'Tripoli',

  // Lamia (central Greece)
  'Λαμία',
  'Lamia',

  // Kozani (northern Greece)
  'Κοζάνη',
  'Kozani',

  // Mykonos (island)
  'Μύκονος',
  'Mykonos',
];

/**
 * Check if venue name is in the Athens whitelist
 */
function isWhitelistedAthensVenue(venueName: string | undefined): boolean {
  if (!venueName) return false;

  const lowerVenue = venueName.toLowerCase().trim();

  return athensVenues.some(whitelistedVenue => {
    const lowerWhitelisted = whitelistedVenue.toLowerCase();

    // Exact match
    if (lowerVenue === lowerWhitelisted) return true;

    // Contains match (e.g., "Gazarte - Ground Stage" contains "Gazarte")
    if (lowerVenue.includes(lowerWhitelisted)) return true;

    // Reverse contains (e.g., "Gazarte" is in whitelist, event has "Gazarte Main Stage")
    if (lowerWhitelisted.includes(lowerVenue)) return true;

    return false;
  });
}

/**
 * Check if event contains any non-Athens city markers
 */
function containsNonAthensCity(text: string): boolean {
  if (!text) return false;

  const lowerText = text.toLowerCase();

  return NON_ATHENS_CITIES.some(city => {
    const lowerCity = city.toLowerCase();
    return lowerText.includes(lowerCity);
  });
}

/**
 * Check if neighborhood is in Athens
 */
function isAthensNeighborhood(neighborhood: string | undefined): boolean {
  if (!neighborhood) return false;

  const lowerNeighborhood = neighborhood.toLowerCase().trim();

  return athensNeighborhoods.some(athensNb => {
    const lowerAthensNb = athensNb.toLowerCase();
    return lowerNeighborhood.includes(lowerAthensNb) || lowerAthensNb.includes(lowerNeighborhood);
  });
}

/**
 * Main filter: Returns true if event is in Athens, false otherwise
 *
 * Three-tier filtering logic:
 * 1. Blacklist check (REJECT IMMEDIATELY - explicit city markers override whitelist)
 * 2. Whitelist check (high confidence for known Athens venues)
 * 3. Fallback heuristics (neighborhood check, default to Athens)
 */
export function isAthensEvent(event: EventLocation): boolean {
  // Extract venue name from different formats
  const venueName = event.venue_name ||
                    (typeof event.venue === 'string' ? event.venue : (event.venue as any)?.name);

  // TIER 1: BLACKLIST CHECK (reject non-Athens cities immediately)
  // Explicit location markers override venue whitelist
  // Check title for non-Athens cities
  if (event.title && containsNonAthensCity(event.title)) {
    return false;
  }

  // Check description for non-Athens cities (catches mislabeled venues)
  if (event.description && containsNonAthensCity(event.description)) {
    return false;
  }

  // Check venue name for non-Athens cities (database format)
  if (event.venue_name && containsNonAthensCity(event.venue_name)) {
    return false;
  }

  // Check venue for non-Athens cities (RawEvent format - string)
  // Note: venue can be either a string (RawEvent) or object (Event)
  if (event.venue) {
    const venueText = typeof event.venue === 'string'
      ? event.venue
      : (event.venue as any).name || (event.venue as any).address;
    if (venueText && containsNonAthensCity(venueText)) {
      return false;
    }
  }

  // Check venue address for non-Athens cities (database format)
  if (event.venue_address && containsNonAthensCity(event.venue_address)) {
    return false;
  }

  // Check location for non-Athens cities (RawEvent format)
  if (event.location && containsNonAthensCity(event.location)) {
    return false;
  }

  // Check neighborhood for non-Athens markers
  if (event.venue_neighborhood && containsNonAthensCity(event.venue_neighborhood)) {
    return false;
  }

  // TIER 2: WHITELIST CHECK (high confidence)
  // If venue is in whitelist and no blacklist markers found, it's definitely Athens
  if (isWhitelistedAthensVenue(venueName)) {
    return true;
  }

  // TIER 3: FALLBACK HEURISTICS
  // If neighborhood is known Athens neighborhood, accept
  if (isAthensNeighborhood(event.venue_neighborhood)) {
    return true;
  }

  // If no blacklist markers found and not whitelisted, assume Athens
  // (Our sources are Greek event aggregators primarily focused on Athens)
  return true;
}

/**
 * Filter an array of events to only Athens events
 */
export function filterAthensEvents<T extends EventLocation>(events: T[]): T[] {
  return events.filter(isAthensEvent);
}

/**
 * Get statistics about Athens vs non-Athens events
 */
export function getFilterStats<T extends EventLocation>(events: T[]): {
  total: number;
  athens: number;
  nonAthens: number;
  percentage: number;
} {
  const athens = events.filter(isAthensEvent);

  return {
    total: events.length,
    athens: athens.length,
    nonAthens: events.length - athens.length,
    percentage: events.length > 0 ? (athens.length / events.length) * 100 : 0,
  };
}

/**
 * Log filtering results
 */
export function logFilterResults<T extends EventLocation>(
  events: T[],
  label: string = 'Events'
): void {
  const stats = getFilterStats(events);

  console.log(`\n📍 Athens Filter - ${label}:`);
  console.log(`   Total: ${stats.total}`);
  console.log(`   ✅ Athens: ${stats.athens} (${stats.percentage.toFixed(1)}%)`);

  if (stats.nonAthens > 0) {
    console.log(`   ❌ Non-Athens: ${stats.nonAthens} (filtered out)`);
  }
}
