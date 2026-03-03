// Database utilities for agent-athens
// Uses Bun's built-in SQLite support

import { Database } from "bun:sqlite";
import { readFileSync } from "fs";
import { join } from "path";
import { isAthensEvent } from "../utils/athens-filter";
import { SCHEMA_TYPE_MAP } from "../enrichment/quality-gates";
import type { Event } from "../types";

const DB_PATH = join(import.meta.dir, "../../data/events.db");
const SCHEMA_PATH = join(import.meta.dir, "schema.sql");

let dbInstance: Database | null = null;

/**
 * Get or create database connection
 */
export function getDatabase(): Database {
  if (!dbInstance) {
    dbInstance = new Database(DB_PATH, { create: true });
    dbInstance.exec("PRAGMA journal_mode = WAL;"); // Better concurrency
    dbInstance.exec("PRAGMA foreign_keys = ON;");
  }
  return dbInstance;
}

/**
 * Initialize database with schema
 */
export function initializeDatabase(): void {
  const db = getDatabase();
  const schema = readFileSync(SCHEMA_PATH, "utf-8");
  db.exec(schema);
  console.log("✅ Database initialized");
}

/**
 * Close database connection
 */
export function closeDatabase(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

/**
 * Convert Event object to database row
 */
export function eventToRow(event: Event): Record<string, any> {
  return {
    $id: event.id,
    $title: event.title,
    $description: event.description || "",
    $full_description: event.fullDescription || null,
    $start_date: event.startDate,
    $end_date: event.endDate || null,
    $type: event.type,
    $genres: JSON.stringify(event.genres),
    $tags: JSON.stringify(event.tags),
    $venue_name: event.venue.name,
    $venue_address: event.venue.address,
    $venue_neighborhood: event.venue.neighborhood || null,
    $venue_lat: event.venue.coordinates?.lat || null,
    $venue_lng: event.venue.coordinates?.lon || null,
    $venue_capacity: event.venue.capacity || null,
    $price_type: event.price.type,
    $price_amount: event.price.amount || null,
    $price_currency: event.price.currency || "EUR",
    $price_range: event.price.range || null,
    $url: event.url || null,
    $source: event.source,
    $ai_context: event.semanticTags ? JSON.stringify(event.semanticTags) : null,
    $schema_json: JSON.stringify(event),
    $created_at: event.createdAt || new Date().toISOString(),
    $updated_at: event.updatedAt || new Date().toISOString(),
    $scraped_at: new Date().toISOString(),
    // Image fields
    $image_url: event.imageUrl || null,
    $image_source: event.imageSource || null,
    $image_local: event.imageLocal || null,
    // Exhibition-specific fields
    $opening_hours: event.openingHours ? JSON.stringify(event.openingHours) : null,
    $closed_days: event.closedDays || null,
    $permanent_collection: event.permanentCollection ? 1 : 0
  };
}

/**
 * Convert database row to Event object
 * Priority: English description > Greek description > legacy full_description
 */
export function rowToEvent(row: any): Event {
  // Helper to convert Blob/Buffer to string if needed
  const bufferToString = (field: any): string | undefined => {
    if (!field) return undefined;
    if (typeof field === 'string') return field;
    if (typeof field === 'object') {
      return Buffer.from(field).toString('utf-8');
    }
    return undefined;
  };

  // Priority: English first (primary/proven), then Greek, then legacy
  const fullDescEn = bufferToString(row.full_description_en);
  const fullDescGr = bufferToString(row.full_description_gr);
  const fullDescLegacy = bufferToString(row.full_description);

  const fullDescription = fullDescEn || fullDescGr || fullDescLegacy || undefined;

  return {
    "@context": "https://schema.org",
    "@type": SCHEMA_TYPE_MAP[row.type] || 'Event',
    id: row.id,
    title: row.title,
    description: row.description || "",
    fullDescription: fullDescription,
    startDate: row.start_date,
    endDate: row.end_date,
    type: row.type,
    genres: JSON.parse(row.genres || "[]"),
    tags: JSON.parse(row.tags || "[]"),
    venue: {
      name: row.venue_name,
      address: row.venue_address,
      neighborhood: row.venue_neighborhood,
      coordinates: row.venue_lat && row.venue_lng
        ? { lat: row.venue_lat, lon: row.venue_lng }
        : undefined,
      capacity: row.venue_capacity
    },
    price: {
      type: row.price_type,
      amount: row.price_amount,
      currency: row.price_currency,
      range: row.price_range
    },
    semanticTags: row.ai_context ? JSON.parse(row.ai_context) : undefined,
    url: row.url,
    ticketUrl: row.ticket_url || undefined,
    source: row.source,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    language: fullDescEn ? "en" : "gr",
    // Time enrichment fields
    timeDoors: row.time_doors || undefined,
    timePeak: row.time_peak || undefined,
    timeSource: row.time_source || undefined,
    // Image fields
    imageUrl: row.image_url || undefined,
    imageSource: row.image_source || undefined,
    imageLocal: row.image_local || undefined,
    // Exhibition-specific fields
    openingHours: row.opening_hours ? JSON.parse(row.opening_hours) : undefined,
    closedDays: row.closed_days || undefined,
    permanentCollection: row.permanent_collection === 1,
    // Location verification status
    locationStatus: row.location_status || 'unverified'
  };
}

/**
 * Insert or update event
 * Returns: { success: boolean, isNew: boolean }
 * NOTE: Automatically filters out non-Athens events
 */
export function upsertEvent(event: Event, db?: Database): { success: boolean; isNew: boolean } {
  // Filter out non-Athens events
  if (!isAthensEvent({ venue_name: event.venue.name, venue_address: event.venue.address, title: event.title })) {
    console.log(`⚠️  Skipping non-Athens event: ${event.title}`);
    return { success: false, isNew: false };
  }

  const database = db || getDatabase();
  const row = eventToRow(event);

  // Check if event already exists
  const existing = database.prepare('SELECT id FROM events WHERE id = ?').get(event.id);
  const isNew = !existing;

  const stmt = database.prepare(`
    INSERT INTO events (
      id, title, description, full_description, start_date, end_date,
      type, genres, tags,
      venue_name, venue_address, venue_neighborhood, venue_lat, venue_lng, venue_capacity,
      price_type, price_amount, price_currency, price_range,
      url, source, ai_context, schema_json,
      created_at, updated_at, scraped_at,
      image_url, image_source,
      opening_hours, closed_days, permanent_collection
    ) VALUES (
      $id, $title, $description, $full_description, $start_date, $end_date,
      $type, $genres, $tags,
      $venue_name, $venue_address, $venue_neighborhood, $venue_lat, $venue_lng, $venue_capacity,
      $price_type, $price_amount, $price_currency, $price_range,
      $url, $source, $ai_context, $schema_json,
      $created_at, $updated_at, $scraped_at,
      $image_url, $image_source,
      $opening_hours, $closed_days, $permanent_collection
    )
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      description = excluded.description,
      start_date = excluded.start_date,
      end_date = excluded.end_date,
      type = excluded.type,
      genres = excluded.genres,
      tags = excluded.tags,
      venue_name = excluded.venue_name,
      venue_address = excluded.venue_address,
      venue_neighborhood = excluded.venue_neighborhood,
      venue_lat = excluded.venue_lat,
      venue_lng = excluded.venue_lng,
      price_type = excluded.price_type,
      price_amount = excluded.price_amount,
      price_range = excluded.price_range,
      url = excluded.url,
      updated_at = excluded.updated_at,
      scraped_at = excluded.scraped_at,
      image_url = COALESCE(excluded.image_url, image_url),
      image_source = COALESCE(excluded.image_source, image_source),
      opening_hours = excluded.opening_hours,
      closed_days = excluded.closed_days,
      permanent_collection = excluded.permanent_collection
  `);

  try {
    stmt.run(row);
    return { success: true, isNew };
  } catch (error) {
    console.error(`Error upserting event ${event.id}:`, error);
    return { success: false, isNew: false };
  }
}

/**
 * Get all events ordered by start date
 */
export function getAllEvents(db?: Database): Event[] {
  const database = db || getDatabase();
  const rows = database.prepare("SELECT * FROM events WHERE is_cancelled = 0 ORDER BY start_date ASC").all();
  return rows.map(rowToEvent);
}

/**
 * Get events by filter criteria
 */
export function getEventsByFilter(filters: {
  type?: string;
  priceType?: string;
  startDate?: string;
  endDate?: string;
  venue?: string;
}, db?: Database): Event[] {
  const database = db || getDatabase();
  const conditions: string[] = ["is_cancelled = 0"];
  const params: Record<string, any> = {};

  if (filters.type) {
    conditions.push("type = $type");
    params.$type = filters.type;
  }

  if (filters.priceType) {
    conditions.push("price_type = $priceType");
    params.$priceType = filters.priceType;
  }

  if (filters.startDate) {
    conditions.push("start_date >= $startDate");
    params.$startDate = filters.startDate;
  }

  if (filters.endDate) {
    conditions.push("start_date <= $endDate");
    params.$endDate = filters.endDate;
  }

  if (filters.venue) {
    conditions.push("venue_name LIKE $venue");
    params.$venue = `%${filters.venue}%`;
  }

  const query = `
    SELECT * FROM events
    WHERE ${conditions.join(" AND ")}
    ORDER BY start_date ASC
  `;

  const stmt = database.prepare(query);
  const rows = stmt.all(params);
  return rows.map(rowToEvent);
}

/**
 * Get event statistics
 */
export function getEventStats(db?: Database): {
  total: number;
  byType: Record<string, number>;
  byPriceType: Record<string, number>;
  upcomingCount: number;
} {
  const database = db || getDatabase();

  const total = database.prepare("SELECT COUNT(*) as count FROM events WHERE is_cancelled = 0").get() as { count: number };

  const byType = database.prepare(`
    SELECT type, COUNT(*) as count
    FROM events
    WHERE is_cancelled = 0
    GROUP BY type
  `).all() as Array<{ type: string; count: number }>;

  const byPriceType = database.prepare(`
    SELECT price_type, COUNT(*) as count
    FROM events
    WHERE is_cancelled = 0
    GROUP BY price_type
  `).all() as Array<{ price_type: string; count: number }>;

  const upcoming = database.prepare(`
    SELECT COUNT(*) as count
    FROM events
    WHERE is_cancelled = 0 AND start_date >= datetime('now')
  `).get() as { count: number };

  return {
    total: total.count,
    byType: Object.fromEntries(byType.map(r => [r.type, r.count])),
    byPriceType: Object.fromEntries(byPriceType.map(r => [r.price_type, r.count])),
    upcomingCount: upcoming.count
  };
}

/**
 * Delete old events (past retention period)
 * For exhibitions: use end_date (keep while still running)
 * For other events: use start_date
 */
export function cleanupOldEvents(retentionDays: number = 90, db?: Database): number {
  const database = db || getDatabase();
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

  // Exhibitions should stay as long as they're open (end_date >= cutoff)
  // Other events are deleted once start_date passes
  const stmt = database.prepare(`
    DELETE FROM events
    WHERE COALESCE(
      CASE WHEN type = 'exhibition' THEN end_date ELSE NULL END,
      start_date
    ) < $cutoff
  `);
  const result = stmt.run({ $cutoff: cutoffDate.toISOString() });

  return result.changes;
}

/**
 * Update an existing event
 */
export function updateEvent(event: Event, db?: Database): boolean {
  const database = db || getDatabase();
  const row = eventToRow(event);

  const stmt = database.prepare(`
    UPDATE events
    SET title = $title,
        description = $description,
        full_description = $full_description,
        start_date = $start_date,
        end_date = $end_date,
        type = $type,
        genres = $genres,
        tags = $tags,
        venue_name = $venue_name,
        venue_address = $venue_address,
        venue_neighborhood = $venue_neighborhood,
        venue_lat = $venue_lat,
        venue_lng = $venue_lng,
        venue_capacity = $venue_capacity,
        price_type = $price_type,
        price_amount = $price_amount,
        price_currency = $price_currency,
        price_range = $price_range,
        url = $url,
        source = $source,
        ai_context = $ai_context,
        schema_json = $schema_json,
        updated_at = $updated_at,
        opening_hours = $opening_hours,
        closed_days = $closed_days,
        permanent_collection = $permanent_collection
    WHERE id = $id
  `);

  try {
    stmt.run(row);
    return true;
  } catch (error) {
    console.error(`Error updating event ${event.id}:`, error);
    return false;
  }
}

/**
 * Update event enrichment (full description + AI context)
 */
export function updateEventEnrichment(
  eventId: string,
  fullDescription: string,
  aiContext: any,
  db?: Database
): boolean {
  const database = db || getDatabase();

  const stmt = database.prepare(`
    UPDATE events
    SET full_description = $fullDescription,
        ai_context = $aiContext,
        updated_at = $updatedAt
    WHERE id = $id
  `);

  try {
    stmt.run({
      $id: eventId,
      $fullDescription: fullDescription,
      $aiContext: JSON.stringify(aiContext),
      $updatedAt: new Date().toISOString()
    });
    return true;
  } catch (error) {
    console.error(`Error updating enrichment for ${eventId}:`, error);
    return false;
  }
}

/**
 * Update event timing information
 * Used by the time enrichment script to backfill door/peak times
 *
 * @param eventId - The event ID to update
 * @param timeDoors - Door opening time (e.g., "21:00")
 * @param timePeak - Peak/main event time (e.g., "22:00") - optional
 * @param timeSource - Where the time came from: 'scraped_listing' | 'scraped_detail'
 */
export function updateEventTiming(
  eventId: string,
  timeDoors: string | null,
  timePeak: string | null = null,
  timeSource: string = 'scraped_detail',
  db?: Database
): boolean {
  const database = db || getDatabase();

  const stmt = database.prepare(`
    UPDATE events
    SET time_doors = COALESCE($timeDoors, time_doors),
        time_peak = COALESCE($timePeak, time_peak),
        time_source = $timeSource,
        updated_at = datetime('now')
    WHERE id = $id
  `);

  try {
    const result = stmt.run({
      $id: eventId,
      $timeDoors: timeDoors,
      $timePeak: timePeak,
      $timeSource: timeSource
    });
    return result.changes > 0;
  } catch (error) {
    console.error(`Error updating timing for ${eventId}:`, error);
    return false;
  }
}

/**
 * Update event image URL
 * Used by the image enrichment script to backfill og:image URLs
 *
 * @param eventId - The event ID to update
 * @param imageUrl - The og:image URL (or null to mark as not_found)
 * @param imageSource - Where the image came from: 'scraped_listing' | 'scraped_detail' | 'backfill' | 'not_found'
 */
export function updateEventImage(
  eventId: string,
  imageUrl: string | null,
  imageSource: string = 'backfill',
  db?: Database
): boolean {
  const database = db || getDatabase();

  const stmt = database.prepare(`
    UPDATE events
    SET image_url = $imageUrl,
        image_source = $imageSource,
        updated_at = datetime('now')
    WHERE id = $id
  `);

  try {
    const result = stmt.run({
      $id: eventId,
      $imageUrl: imageUrl,
      $imageSource: imageSource
    });
    return result.changes > 0;
  } catch (error) {
    console.error(`Error updating image for ${eventId}:`, error);
    return false;
  }
}
