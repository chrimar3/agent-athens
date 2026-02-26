#!/usr/bin/env bun
/**
 * Clean up orphaned and expired event images.
 *
 * Pass 1: Removes .webp files from data/images/ where the event ID no longer exists in DB.
 * Pass 2: Removes images for expired events (7-day buffer after end).
 *         Uses exhibition end_date rule (Tier 1): exhibitions expire by end_date, others by start_date.
 *
 * Usage:
 *   bun run scripts/cleanup-old-images.ts [--dry-run]
 */

import { Database } from 'bun:sqlite';
import { readdirSync, unlinkSync, existsSync } from 'fs';
import { join, resolve } from 'path';

const DB_PATH = resolve('data/events.db');
const IMAGES_DIR = resolve('data/images');
const dryRun = process.argv.includes('--dry-run');

function main() {
  if (!existsSync(IMAGES_DIR)) {
    console.log('📂 No images directory found — nothing to clean up.');
    return;
  }

  const files = readdirSync(IMAGES_DIR).filter(f => f.endsWith('.webp'));
  if (files.length === 0) {
    console.log('📂 No image files found — nothing to clean up.');
    return;
  }

  const db = new Database(DB_PATH);

  // --- Pass 1: Orphan cleanup (event deleted from DB but image file remains) ---
  console.log('🔍 Pass 1: Orphan cleanup...');

  const existingIds = new Set(
    (db.prepare('SELECT id FROM events').all() as Array<{ id: string }>).map(r => r.id)
  );

  let orphaned = 0;
  let kept = 0;

  for (const file of files) {
    const eventId = file.replace('.webp', '');

    if (!existingIds.has(eventId)) {
      orphaned++;
      if (dryRun) {
        console.log(`  [DRY RUN] Would delete orphan: ${file}`);
      } else {
        unlinkSync(join(IMAGES_DIR, file));
        console.log(`  🗑️  Deleted orphan: ${file}`);
      }
    } else {
      kept++;
    }
  }

  // --- Pass 2: Expired event cleanup (event exists but ended > 7 days ago) ---
  console.log('🔍 Pass 2: Expired event cleanup...');

  const expiredEvents = db.prepare(`
    SELECT id FROM events
    WHERE image_local IS NOT NULL
      AND COALESCE(
        CASE WHEN type='exhibition' THEN end_date ELSE NULL END,
        start_date
      ) < date('now', '-7 days')
  `).all() as Array<{ id: string }>;

  let expired = 0;

  for (const event of expiredEvents) {
    const filePath = join(IMAGES_DIR, `${event.id}.webp`);
    if (existsSync(filePath)) {
      expired++;
      if (dryRun) {
        console.log(`  [DRY RUN] Would delete expired: ${event.id}.webp`);
      } else {
        unlinkSync(filePath);
        console.log(`  🗑️  Deleted expired: ${event.id}.webp`);
      }
    }
  }

  // --- Clear image_local for events whose files we deleted ---
  const totalDeleted = orphaned + expired;
  if (!dryRun && totalDeleted > 0) {
    const dbWrite = new Database(DB_PATH);
    const imageFiles = new Set(
      readdirSync(IMAGES_DIR).filter(f => f.endsWith('.webp')).map(f => f.replace('.webp', ''))
    );
    const eventsWithLocal = dbWrite.prepare(
      "SELECT id FROM events WHERE image_local IS NOT NULL"
    ).all() as Array<{ id: string }>;

    let cleared = 0;
    for (const event of eventsWithLocal) {
      if (!imageFiles.has(event.id)) {
        dbWrite.prepare("UPDATE events SET image_local = NULL WHERE id = ?").run(event.id);
        cleared++;
      }
    }
    dbWrite.close();
    if (cleared > 0) {
      console.log(`  📝 Cleared image_local for ${cleared} events`);
    }
  }

  db.close();

  console.log(`\n📊 Summary: Kept: ${kept} | Orphaned: ${orphaned} | Expired: ${expired}${dryRun ? ' (dry run)' : ''}`);
}

main();
