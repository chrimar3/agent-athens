#!/usr/bin/env bun
/**
 * Athens Location Filter
 *
 * Filters events to ensure they are ONLY in Athens, Greece.
 * Rejects events from Thessaloniki, Kalamata, Volos, Patras, etc.
 *
 * Usage:
 *   import { isAthensEvent } from './utils/athens-filter';
 *   if (!isAthensEvent(event)) return; // Skip non-Athens events
 */

export interface EventLocation {
  title?: string;
  venue_name?: string;
  venue_address?: string;
  venue_neighborhood?: string;
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
];

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
 * Main filter: Returns true if event is in Athens, false otherwise
 */
export function isAthensEvent(event: EventLocation): boolean {
  // Check title for non-Athens cities
  if (event.title && containsNonAthensCity(event.title)) {
    return false;
  }

  // Check venue name for non-Athens cities
  if (event.venue_name && containsNonAthensCity(event.venue_name)) {
    return false;
  }

  // Check venue address for non-Athens cities
  if (event.venue_address && containsNonAthensCity(event.venue_address)) {
    return false;
  }

  // Check neighborhood for non-Athens markers
  if (event.venue_neighborhood && containsNonAthensCity(event.venue_neighborhood)) {
    return false;
  }

  // If no non-Athens markers found, assume it's Athens
  // (Our sources are Greek event aggregators focused on Athens)
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
