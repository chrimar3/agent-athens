// Test helpers for database operations
import { Database } from "bun:sqlite";
import { readFileSync } from "fs";
import { join } from "path";
import type { Event } from "../../src/types";
import { eventToRow } from "../../src/db/database";

/**
 * Create an in-memory test database
 */
export function createTestDB(): Database {
  const db = new Database(":memory:");
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");

  // Load and execute schema
  const schemaPath = join(import.meta.dir, "../../src/db/schema.sql");
  const schema = readFileSync(schemaPath, "utf-8");
  db.exec(schema);

  return db;
}

/**
 * Seed database with sample events
 */
export function seedEvents(db: Database, events: Event[]): void {
  const insert = db.prepare(`
    INSERT INTO events (
      id, title, description, full_description, start_date, end_date,
      type, genres, tags, venue_name, venue_address, venue_neighborhood,
      venue_lat, venue_lng, venue_capacity, price_type, price_amount,
      price_currency, price_range, url, source, ai_context, schema_json,
      created_at, updated_at, scraped_at
    ) VALUES (
      $id, $title, $description, $full_description, $start_date, $end_date,
      $type, $genres, $tags, $venue_name, $venue_address, $venue_neighborhood,
      $venue_lat, $venue_lng, $venue_capacity, $price_type, $price_amount,
      $price_currency, $price_range, $url, $source, $ai_context, $schema_json,
      $created_at, $updated_at, $scraped_at
    )
  `);

  for (const event of events) {
    const row = eventToRow(event);
    insert.run(row);
  }
}

/**
 * Count total events in database
 */
export function countEvents(db: Database): number {
  const result = db.prepare("SELECT COUNT(*) as count FROM events").get() as { count: number };
  return result.count;
}

/**
 * Get all event IDs from database
 */
export function getAllEventIds(db: Database): string[] {
  const rows = db.prepare("SELECT id FROM events ORDER BY id").all() as { id: string }[];
  return rows.map(r => r.id);
}

/**
 * Clear all events from database
 */
export function clearEvents(db: Database): void {
  db.exec("DELETE FROM events");
}

/**
 * Close and cleanup database
 */
export function cleanupDB(db: Database): void {
  db.close();
}

/**
 * Execute a query and return results
 */
export function query<T = any>(db: Database, sql: string, params?: any): T[] {
  if (params) {
    return db.prepare(sql).all(params) as T[];
  }
  return db.prepare(sql).all() as T[];
}

/**
 * Execute a query and return single result
 */
export function queryOne<T = any>(db: Database, sql: string, params?: any): T | null {
  if (params) {
    return db.prepare(sql).get(params) as T | null;
  }
  return db.prepare(sql).get() as T | null;
}

/**
 * Check if an event exists in the database
 */
export function eventExists(db: Database, eventId: string): boolean {
  const result = db.prepare("SELECT id FROM events WHERE id = ?").get(eventId);
  return result !== null;
}

/**
 * Get event by ID
 */
export function getEventById(db: Database, eventId: string): any {
  return db.prepare("SELECT * FROM events WHERE id = ?").get(eventId);
}

/**
 * Get events by type
 */
export function getEventsByType(db: Database, type: string): any[] {
  return db.prepare("SELECT * FROM events WHERE type = ? ORDER BY start_date").all(type);
}

/**
 * Get events by price type (free/paid)
 */
export function getEventsByPriceType(db: Database, priceType: string): any[] {
  return db.prepare("SELECT * FROM events WHERE price_type = ? ORDER BY start_date").all(priceType);
}

/**
 * Get events by date range
 */
export function getEventsByDateRange(db: Database, startDate: string, endDate: string): any[] {
  return db.prepare(`
    SELECT * FROM events
    WHERE start_date >= ? AND start_date < ?
    ORDER BY start_date
  `).all(startDate, endDate);
}
