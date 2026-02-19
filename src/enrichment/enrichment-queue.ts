/**
 * Enrichment Queue Management
 *
 * Manages the queue of events that need AI enrichment.
 * Only returns verified Athens events that haven't been enriched yet.
 *
 * @see specs/001-data-pipeline/tasks.md (Task 5.4)
 * @see src/enrichment/__tests__/enrichment-queue.test.ts
 */

import type Database from 'bun:sqlite';

// ============================================================================
// Types
// ============================================================================

export interface EnrichmentQueueItem {
  id: string;
  title: string;
  date: string;
  time: string | null;
  venue: string | null;
  type: string | null;
  genre: string | null;
  price: string | null;
  source: string | null;
  location_status: string;
}

export interface EnrichmentQueueOptions {
  /** Maximum number of events to return */
  limit?: number;
}

export interface EnrichmentStats {
  /** Total verified/pass_through events */
  totalVerified: number;
  /** Events pending enrichment */
  pendingEnrichment: number;
  /** Already enriched events */
  enriched: number;
}

// ============================================================================
// Constants
// ============================================================================

/** Location statuses that are eligible for enrichment */
const ENRICHMENT_ELIGIBLE_STATUSES = ['verified_athens', 'pass_through'];

// ============================================================================
// Main Functions
// ============================================================================

/**
 * Get events that need enrichment
 *
 * Returns events where:
 * - needs_enrichment = 1
 * - location_status IN (verified_athens, pass_through)
 *
 * Sorted by date (soonest first) to prioritize upcoming events.
 *
 * @param db - Database connection
 * @param options - Optional limit
 * @returns Array of events needing enrichment
 */
export function getEnrichmentQueue(
  db: Database,
  options: EnrichmentQueueOptions = {}
): EnrichmentQueueItem[] {
  const { limit } = options;

  const statusPlaceholders = ENRICHMENT_ELIGIBLE_STATUSES.map(() => '?').join(',');

  // Check if this is the production schema (has start_date) or test schema (has date)
  const columns = db.prepare(`PRAGMA table_info(events)`).all() as Array<{ name: string }>;
  const hasStartDate = columns.some(c => c.name === 'start_date');

  let query: string;

  if (hasStartDate) {
    // Production schema - use actual column names with aliases
    query = `
      SELECT
        id,
        title,
        start_date as date,
        substr(start_date, 12, 5) as time,
        venue_name as venue,
        type,
        genres as genre,
        price_type as price,
        source,
        location_status
      FROM events
      WHERE needs_enrichment = 1
        AND location_status IN (${statusPlaceholders})
      ORDER BY start_date ASC
    `;
  } else {
    // Test schema - use simplified column names
    query = `
      SELECT
        id,
        title,
        date,
        time,
        venue,
        type,
        genre,
        price,
        source,
        location_status
      FROM events
      WHERE needs_enrichment = 1
        AND location_status IN (${statusPlaceholders})
      ORDER BY date ASC
    `;
  }

  if (limit) {
    query += ` LIMIT ${limit}`;
  }

  const stmt = db.prepare(query);
  const results = stmt.all(...ENRICHMENT_ELIGIBLE_STATUSES) as EnrichmentQueueItem[];

  return results;
}

/**
 * Mark an event as enriched
 *
 * Sets needs_enrichment = 0 and enriched_at to current timestamp.
 *
 * @param db - Database connection
 * @param eventId - Event ID to mark as enriched
 * @returns true if event was updated, false if not found
 */
export function markEnriched(db: Database, eventId: string): boolean {
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    UPDATE events
    SET needs_enrichment = 0,
        enriched_at = ?,
        updated_at = ?
    WHERE id = ?
  `);

  const result = stmt.run(now, now, eventId);

  return result.changes > 0;
}

/**
 * Get enrichment statistics
 *
 * @param db - Database connection
 * @returns Stats about enrichment progress
 */
export function getEnrichmentStats(db: Database): EnrichmentStats {
  const statusPlaceholders = ENRICHMENT_ELIGIBLE_STATUSES.map(() => '?').join(',');

  // Total verified/pass_through events
  const totalResult = db.prepare(`
    SELECT COUNT(*) as count
    FROM events
    WHERE location_status IN (${statusPlaceholders})
  `).get(...ENRICHMENT_ELIGIBLE_STATUSES) as { count: number };

  // Pending enrichment (needs_enrichment = 1)
  const pendingResult = db.prepare(`
    SELECT COUNT(*) as count
    FROM events
    WHERE needs_enrichment = 1
      AND location_status IN (${statusPlaceholders})
  `).get(...ENRICHMENT_ELIGIBLE_STATUSES) as { count: number };

  // Already enriched (needs_enrichment = 0)
  const enrichedResult = db.prepare(`
    SELECT COUNT(*) as count
    FROM events
    WHERE needs_enrichment = 0
      AND location_status IN (${statusPlaceholders})
  `).get(...ENRICHMENT_ELIGIBLE_STATUSES) as { count: number };

  return {
    totalVerified: totalResult.count,
    pendingEnrichment: pendingResult.count,
    enriched: enrichedResult.count,
  };
}

/**
 * Get a single event by ID for enrichment
 *
 * @param db - Database connection
 * @param eventId - Event ID
 * @returns Event or null if not found
 */
export function getEventForEnrichment(
  db: Database,
  eventId: string
): EnrichmentQueueItem | null {
  // Check if this is the production schema (has start_date) or test schema (has date)
  const columns = db.prepare(`PRAGMA table_info(events)`).all() as Array<{ name: string }>;
  const hasStartDate = columns.some(c => c.name === 'start_date');

  let query: string;

  if (hasStartDate) {
    // Production schema
    query = `
      SELECT
        id,
        title,
        start_date as date,
        substr(start_date, 12, 5) as time,
        venue_name as venue,
        type,
        genres as genre,
        price_type as price,
        source,
        location_status
      FROM events
      WHERE id = ?
    `;
  } else {
    // Test schema
    query = `
      SELECT
        id,
        title,
        date,
        time,
        venue,
        type,
        genre,
        price,
        source,
        location_status
      FROM events
      WHERE id = ?
    `;
  }

  const stmt = db.prepare(query);
  const result = stmt.get(eventId) as EnrichmentQueueItem | undefined;

  return result || null;
}

/**
 * Update event description after enrichment
 *
 * @param db - Database connection
 * @param eventId - Event ID
 * @param description - AI-generated description
 * @returns true if updated, false if not found
 */
export function updateEventDescription(
  db: Database,
  eventId: string,
  description: string
): boolean {
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    UPDATE events
    SET full_description = ?,
        needs_enrichment = 0,
        enriched_at = ?,
        updated_at = ?
    WHERE id = ?
  `);

  const result = stmt.run(description, now, now, eventId);

  return result.changes > 0;
}
