#!/usr/bin/env bun
/**
 * Database Migration Runner
 *
 * Runs SQL migrations in order, tracking which have been applied.
 * Migrations are in src/db/migrations/ with format NNN-description.sql
 *
 * Usage:
 *   bun run scripts/run-migrations.ts           # Run all pending migrations
 *   bun run scripts/run-migrations.ts --status  # Show migration status
 *   bun run scripts/run-migrations.ts --dry-run # Show what would run
 */

import { Database } from "bun:sqlite";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";

const DB_PATH = join(import.meta.dir, "../data/events.db");
const MIGRATIONS_PATH = join(import.meta.dir, "../src/db/migrations");

interface MigrationRecord {
  id: number;
  name: string;
  applied_at: string;
}

function ensureMigrationTable(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

function getAppliedMigrations(db: Database): Set<string> {
  const rows = db.prepare("SELECT name FROM _migrations").all() as MigrationRecord[];
  return new Set(rows.map(r => r.name));
}

function getMigrationFiles(): string[] {
  try {
    const files = readdirSync(MIGRATIONS_PATH)
      .filter(f => f.endsWith('.sql'))
      .sort(); // Ensures NNN-prefix order
    return files;
  } catch {
    console.log("📁 Creating migrations directory...");
    require('fs').mkdirSync(MIGRATIONS_PATH, { recursive: true });
    return [];
  }
}

function runMigration(db: Database, filename: string, dryRun: boolean): boolean {
  const filePath = join(MIGRATIONS_PATH, filename);
  const sql = readFileSync(filePath, 'utf-8');

  if (dryRun) {
    console.log(`\n📝 Would run: ${filename}`);
    console.log("─".repeat(50));
    // Show first 500 chars of migration
    console.log(sql.slice(0, 500) + (sql.length > 500 ? '\n...(truncated)' : ''));
    return true;
  }

  console.log(`\n🔄 Running: ${filename}`);

  try {
    // Run the migration in a transaction
    db.exec("BEGIN TRANSACTION");

    // Split on semicolons but be careful about strings
    // Simple approach: execute the whole file
    db.exec(sql);

    // Record the migration
    db.prepare("INSERT INTO _migrations (name) VALUES (?)").run(filename);

    db.exec("COMMIT");
    console.log(`   ✅ Applied successfully`);
    return true;
  } catch (error) {
    db.exec("ROLLBACK");
    console.error(`   ❌ Failed: ${error}`);
    return false;
  }
}

function main(): void {
  const args = process.argv.slice(2);
  const statusOnly = args.includes('--status');
  const dryRun = args.includes('--dry-run');

  console.log("╔════════════════════════════════════════════════╗");
  console.log("║  agent-athens Database Migrations              ║");
  console.log("╚════════════════════════════════════════════════╝\n");

  // Open database
  const db = new Database(DB_PATH, { create: true });
  db.exec("PRAGMA journal_mode = WAL;");

  // Ensure migration tracking table exists
  ensureMigrationTable(db);

  // Get applied migrations
  const applied = getAppliedMigrations(db);
  const migrationFiles = getMigrationFiles();

  // Calculate pending
  const pending = migrationFiles.filter(f => !applied.has(f));

  // Status mode
  if (statusOnly) {
    console.log("📊 Migration Status:\n");
    console.log(`Applied: ${applied.size}`);
    console.log(`Pending: ${pending.length}`);
    console.log(`Total:   ${migrationFiles.length}\n`);

    if (migrationFiles.length > 0) {
      console.log("Migrations:");
      for (const file of migrationFiles) {
        const status = applied.has(file) ? '✅' : '⏳';
        console.log(`  ${status} ${file}`);
      }
    }

    db.close();
    return;
  }

  // Dry run mode
  if (dryRun) {
    console.log("🔍 DRY RUN - No changes will be made\n");
  }

  // Check if there's anything to do
  if (pending.length === 0) {
    console.log("✨ All migrations already applied!\n");
    db.close();
    return;
  }

  console.log(`📦 ${pending.length} migration(s) to apply:\n`);
  for (const file of pending) {
    console.log(`   • ${file}`);
  }

  // Run pending migrations
  let success = 0;
  let failed = 0;

  for (const file of pending) {
    if (runMigration(db, file, dryRun)) {
      success++;
    } else {
      failed++;
      // Stop on first failure
      console.error("\n⛔ Stopping due to migration failure");
      break;
    }
  }

  // Summary
  console.log("\n" + "═".repeat(50));
  if (dryRun) {
    console.log(`📝 Dry run complete: ${success} migration(s) would be applied`);
  } else {
    console.log(`✅ Applied: ${success}`);
    if (failed > 0) {
      console.log(`❌ Failed: ${failed}`);
    }
  }

  db.close();
}

main();
