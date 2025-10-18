// Database utilities for agent-athens
// Uses Bun's built-in SQLite support

import { Database } from "bun:sqlite";
import { readFileSync } from "fs";
import { join } from "path";
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
    $full_description: null, // Will be populated by enrichment
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
    $created_at: event.createdAt,
    $updated_at: event.updatedAt,
    $scraped_at: new Date().toISOString()
  };
}

/**
 * Convert database row to Event object
 */
export function rowToEvent(row: any): Event {
  return {
    "@context": "https://schema.org",
    "@type": row.schema_json ? JSON.parse(row.schema_json)["@type"] : "Event",
    id: row.id,
    title: row.title,
    description: row.description || "",
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
    source: row.source,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    language: "en"
  };
}

/**
 * Insert or update event
 */
export function upsertEvent(event: Event): boolean {
  const db = getDatabase();
  const row = eventToRow(event);

  const stmt = db.prepare(`
    INSERT INTO events (
      id, title, description, full_description, start_date, end_date,
      type, genres, tags,
      venue_name, venue_address, venue_neighborhood, venue_lat, venue_lng, venue_capacity,
      price_type, price_amount, price_currency, price_range,
      url, source, ai_context, schema_json,
      created_at, updated_at, scraped_at
    ) VALUES (
      $id, $title, $description, $full_description, $start_date, $end_date,
      $type, $genres, $tags,
      $venue_name, $venue_address, $venue_neighborhood, $venue_lat, $venue_lng, $venue_capacity,
      $price_type, $price_amount, $price_currency, $price_range,
      $url, $source, $ai_context, $schema_json,
      $created_at, $updated_at, $scraped_at
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
      scraped_at = excluded.scraped_at
  `);

  try {
    stmt.run(row);
    return true;
  } catch (error) {
    console.error(`Error upserting event ${event.id}:`, error);
    return false;
  }
}

/**
 * Get all events ordered by start date
 */
export function getAllEvents(): Event[] {
  const db = getDatabase();
  const rows = db.prepare("SELECT * FROM events WHERE is_cancelled = 0 ORDER BY start_date ASC").all();
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
}): Event[] {
  const db = getDatabase();
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

  const stmt = db.prepare(query);
  const rows = stmt.all(params);
  return rows.map(rowToEvent);
}

/**
 * Get event statistics
 */
export function getEventStats(): {
  total: number;
  byType: Record<string, number>;
  byPriceType: Record<string, number>;
  upcomingCount: number;
} {
  const db = getDatabase();

  const total = db.prepare("SELECT COUNT(*) as count FROM events WHERE is_cancelled = 0").get() as { count: number };

  const byType = db.prepare(`
    SELECT type, COUNT(*) as count
    FROM events
    WHERE is_cancelled = 0
    GROUP BY type
  `).all() as Array<{ type: string; count: number }>;

  const byPriceType = db.prepare(`
    SELECT price_type, COUNT(*) as count
    FROM events
    WHERE is_cancelled = 0
    GROUP BY price_type
  `).all() as Array<{ price_type: string; count: number }>;

  const upcoming = db.prepare(`
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
 */
export function cleanupOldEvents(retentionDays: number = 90): number {
  const db = getDatabase();
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

  const stmt = db.prepare("DELETE FROM events WHERE start_date < $cutoff");
  const result = stmt.run({ $cutoff: cutoffDate.toISOString() });

  return result.changes;
}

/**
 * Update event enrichment (full description + AI context)
 */
export function updateEventEnrichment(
  eventId: string,
  fullDescription: string,
  aiContext: any
): boolean {
  const db = getDatabase();

  const stmt = db.prepare(`
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
