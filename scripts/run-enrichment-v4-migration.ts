#!/usr/bin/env bun
/**
 * Enrichment v4 Migration
 *
 * Extends enrichment_log with before/after tracking, creates entity_knowledge
 * and knowledge_feedback tables. Safe to run multiple times (idempotent).
 *
 * Usage: bun run scripts/run-enrichment-v4-migration.ts [--dry-run]
 */

import Database from 'bun:sqlite';

const DRY_RUN = process.argv.includes('--dry-run');
const DB_PATH = 'data/events.db';

function main(): void {
  console.log(`\n=== Enrichment v4 Migration ${DRY_RUN ? '(DRY RUN)' : ''} ===\n`);

  const db = new Database(DB_PATH);
  db.run('PRAGMA journal_mode = WAL;');
  db.run('PRAGMA foreign_keys = ON;');

  try {
    extendEnrichmentLog(db);
    createEntityKnowledge(db);
    createKnowledgeFeedback(db);
    verify(db);
    console.log(`\n=== Migration ${DRY_RUN ? 'would complete' : 'complete'} ===\n`);
  } finally {
    db.close();
  }
}

// Step 1: Add missing columns to enrichment_log
function extendEnrichmentLog(db: Database): void {
  console.log('1. Extending enrichment_log...');

  const columns = db.prepare("PRAGMA table_info(enrichment_log)").all() as { name: string }[];
  const existingCols = new Set(columns.map(c => c.name));

  const newColumns: Array<{ name: string; type: string }> = [
    { name: 'description_before', type: 'TEXT' },
    { name: 'description_after', type: 'TEXT' },
    { name: 'batch_number', type: 'INTEGER' },
    { name: 'session_id', type: 'TEXT' },
    { name: 'quality_score', type: 'INTEGER' },
    { name: 'quality_issues', type: 'TEXT' },
    { name: 'tags_applied', type: 'TEXT' },
  ];

  let added = 0;
  for (const col of newColumns) {
    if (existingCols.has(col.name)) {
      console.log(`   [skip] ${col.name} already exists`);
    } else {
      if (!DRY_RUN) {
        db.run(`ALTER TABLE enrichment_log ADD COLUMN ${col.name} ${col.type}`);
      }
      console.log(`   [${DRY_RUN ? 'would add' : 'added'}] ${col.name} ${col.type}`);
      added++;
    }
  }

  console.log(`   ${added} column(s) ${DRY_RUN ? 'would be' : ''} added\n`);
}

// Step 2: Create entity_knowledge table
function createEntityKnowledge(db: Database): void {
  console.log('2. Creating entity_knowledge table...');

  const existing = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='entity_knowledge'"
  ).get();

  if (existing) {
    console.log('   [skip] entity_knowledge already exists\n');
    return;
  }

  if (!DRY_RUN) {
    db.run(`
      CREATE TABLE entity_knowledge (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type TEXT NOT NULL,          -- 'artist' | 'venue' | 'festival' | 'promoter'
        name TEXT NOT NULL,
        canonical_name TEXT,                -- lowercased for matching
        bio TEXT,
        genre TEXT,                         -- JSON array
        notable_works TEXT,
        career_highlights TEXT,
        active_since INTEGER,
        athens_context TEXT,                -- Athens-specific notes
        fun_facts TEXT,
        source TEXT,
        source_url TEXT,
        confidence TEXT DEFAULT 'medium',   -- 'high' | 'medium' | 'low'
        last_verified TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        UNIQUE(entity_type, canonical_name)
      )
    `);
    db.run(`CREATE INDEX idx_ek_type_name ON entity_knowledge(entity_type, canonical_name)`);
  }

  console.log(`   [${DRY_RUN ? 'would create' : 'created'}] entity_knowledge (17 columns)\n`);
}

// Step 3: Create knowledge_feedback table
function createKnowledgeFeedback(db: Database): void {
  console.log('3. Creating knowledge_feedback table...');

  const existing = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='knowledge_feedback'"
  ).get();

  if (existing) {
    console.log('   [skip] knowledge_feedback already exists\n');
    return;
  }

  if (!DRY_RUN) {
    db.run(`
      CREATE TABLE knowledge_feedback (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_id INTEGER REFERENCES entity_knowledge(id),
        event_id TEXT,
        session_id TEXT,
        feedback_type TEXT NOT NULL,       -- 'correction' | 'addition' | 'stale'
        field_name TEXT,
        old_value TEXT,
        new_value TEXT,
        processed INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `);
  }

  console.log(`   [${DRY_RUN ? 'would create' : 'created'}] knowledge_feedback (10 columns)\n`);
}

// Step 4: Verify all changes
function verify(db: Database): void {
  console.log('4. Verification...');

  const logCols = db.prepare("PRAGMA table_info(enrichment_log)").all() as { name: string }[];
  const logColNames = logCols.map(c => c.name);
  const expectedLogCols = ['description_before', 'description_after', 'batch_number',
    'session_id', 'quality_score', 'quality_issues', 'tags_applied'];

  for (const col of expectedLogCols) {
    const exists = logColNames.includes(col);
    console.log(`   enrichment_log.${col}: ${exists ? 'OK' : DRY_RUN ? 'pending' : 'MISSING'}`);
  }

  const ekExists = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='entity_knowledge'"
  ).get();
  const ekCols = ekExists
    ? (db.prepare("PRAGMA table_info(entity_knowledge)").all() as any[]).length
    : 0;
  console.log(`   entity_knowledge: ${ekExists ? `OK (${ekCols} columns)` : DRY_RUN ? 'pending' : 'MISSING'}`);

  const kfExists = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='knowledge_feedback'"
  ).get();
  const kfCols = kfExists
    ? (db.prepare("PRAGMA table_info(knowledge_feedback)").all() as any[]).length
    : 0;
  console.log(`   knowledge_feedback: ${kfExists ? `OK (${kfCols} columns)` : DRY_RUN ? 'pending' : 'MISSING'}`);
}

main();
