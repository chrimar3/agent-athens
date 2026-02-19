/**
 * Venue Validation for Agent Athens
 *
 * Ensures only Athens-based events are imported/enriched.
 * Rejects events from Thessaloniki, Komotini, and other Greek cities.
 */

/**
 * Known non-Athens venues to reject
 */
const NON_ATHENS_VENUES = [
  // Thessaloniki venues
  'Θεατρο Μονης Λαζαριστων',
  'Θέατρο Μονής Λαζαριστών',
  'Moni Lazariston',
  'Νοησις',
  'Noesis',

  // Komotini venues
  'Μεγαρο Μουσικης Κομοτηνης',
  'Μέγαρο Μουσικής Κομοτηνής',
  'Komotini Concert Hall',

  // Add more as discovered
];

/**
 * Venue name patterns that indicate non-Athens locations
 */
const NON_ATHENS_PATTERNS = [
  /θεσσαλονικ/i,
  /thessalonik/i,
  /κομοτην/i,
  /komotini/i,
  /πατρ/i,  // Patras
  /heraklion/i,
  /ηρακλει/i,
  /λαρισ/i,  // Larissa
  /larissa/i,
];

/**
 * Check if a venue is in Athens
 * @param venueName - The venue name to validate
 * @param venueAddress - Optional venue address for additional validation
 * @returns true if venue is in Athens, false otherwise
 */
export function isAthensVenue(venueName: string, venueAddress?: string): boolean {
  if (!venueName) {
    console.warn('⚠️  Empty venue name - rejecting');
    return false;
  }

  // Check exact matches
  if (NON_ATHENS_VENUES.some(v => venueName.toLowerCase().includes(v.toLowerCase()))) {
    console.warn(`⚠️  Non-Athens venue detected: ${venueName}`);
    return false;
  }

  // Check patterns
  if (NON_ATHENS_PATTERNS.some(pattern => pattern.test(venueName))) {
    console.warn(`⚠️  Non-Athens pattern detected in venue: ${venueName}`);
    return false;
  }

  // Check address if provided
  if (venueAddress) {
    if (NON_ATHENS_PATTERNS.some(pattern => pattern.test(venueAddress))) {
      console.warn(`⚠️  Non-Athens pattern detected in address: ${venueAddress}`);
      return false;
    }
  }

  return true;
}

/**
 * Validate event location before import/enrichment
 * @param event - Event object with venue information
 * @returns true if event should be processed, false otherwise
 */
export function shouldProcessEvent(event: {
  venue_name: string;
  venue_address?: string;
  title?: string;
}): boolean {
  const isValid = isAthensVenue(event.venue_name, event.venue_address);

  if (!isValid) {
    console.log(`🚫 REJECTED: ${event.title || 'Untitled'} at ${event.venue_name}`);
  }

  return isValid;
}

/**
 * Filter array of events to only Athens-based events
 * @param events - Array of events to filter
 * @returns Filtered array containing only Athens events
 */
export function filterAthensEvents<T extends { venue_name: string; venue_address?: string }>(
  events: T[]
): T[] {
  const before = events.length;
  const filtered = events.filter(e => isAthensVenue(e.venue_name, e.venue_address));
  const rejected = before - filtered.length;

  if (rejected > 0) {
    console.log(`📊 Venue filtering: ${filtered.length} Athens events, ${rejected} rejected (non-Athens)`);
  }

  return filtered;
}

/**
 * Clean database of non-Athens events
 * @param db - Database connection
 * @returns Number of events deleted
 */
export function cleanNonAthensEvents(db: any): number {
  const venues = NON_ATHENS_VENUES.map(v => `'${v}'`).join(',');
  const patterns = NON_ATHENS_PATTERNS.map(p => `venue_name LIKE '%${p.source.replace(/[\/\\^$*+?.()|[\]{}]/g, '')}%'`).join(' OR ');

  const query = `
    DELETE FROM events
    WHERE venue_name IN (${venues})
       OR ${patterns}
  `;

  try {
    const result = db.prepare(query).run();
    console.log(`🧹 Cleaned ${result.changes} non-Athens events from database`);
    return result.changes;
  } catch (error) {
    console.error('❌ Error cleaning non-Athens events:', error);
    return 0;
  }
}
