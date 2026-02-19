#!/usr/bin/env bun
/**
 * Migration: Add exhibition-specific fields to events table
 *
 * Adds:
 * - opening_hours TEXT (JSON)
 * - closed_days TEXT
 * - permanent_collection INTEGER
 *
 * Safe to run multiple times (uses IF NOT EXISTS pattern via column check)
 */

import { Database } from "bun:sqlite";
import { join } from "path";

const DB_PATH = join(import.meta.dir, "../data/events.db");

function migrate() {
  console.log("Running exhibition fields migration...\n");

  const db = new Database(DB_PATH);
  db.run("PRAGMA journal_mode = WAL;");

  // Check existing columns
  const tableInfo = db.prepare("PRAGMA table_info(events)").all() as Array<{ name: string }>;
  const existingColumns = new Set(tableInfo.map(col => col.name));

  const migrations = [
    {
      column: "opening_hours",
      sql: "ALTER TABLE events ADD COLUMN opening_hours TEXT",
      description: "Opening hours (JSON: day -> hours)"
    },
    {
      column: "closed_days",
      sql: "ALTER TABLE events ADD COLUMN closed_days TEXT",
      description: "Days when venue is closed"
    },
    {
      column: "permanent_collection",
      sql: "ALTER TABLE events ADD COLUMN permanent_collection INTEGER DEFAULT 0",
      description: "Boolean: permanent vs temporary exhibition"
    }
  ];

  let migrationsRun = 0;

  for (const migration of migrations) {
    if (existingColumns.has(migration.column)) {
      console.log(`  Column '${migration.column}' already exists`);
    } else {
      try {
        db.run(migration.sql);
        console.log(`  Added column '${migration.column}' - ${migration.description}`);
        migrationsRun++;
      } catch (error) {
        console.error(`  Failed to add column '${migration.column}':`, error);
      }
    }
  }

  // Add exhibition-specific index if not exists
  try {
    db.run(`
      CREATE INDEX IF NOT EXISTS idx_exhibition_dates
      ON events(type, start_date, end_date)
      WHERE type = 'exhibition'
    `);
    console.log("\n  Exhibition dates index created/verified");
  } catch (error) {
    console.error("  Index creation warning:", error);
  }

  db.close();

  console.log(`\nMigration complete. ${migrationsRun} column(s) added.`);
}

migrate();
