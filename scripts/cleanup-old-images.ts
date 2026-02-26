#!/usr/bin/env bun
/**
 * Clean up orphaned event images.
 * Removes .webp files from data/images/ where the event ID no longer exists in DB.
 *
 * Usage:
 *   bun run scripts/cleanup-old-images.ts [--dry-run]
 */

import { Database } from 'bun:sqlite';
import { readdirSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';

const DB_PATH = join(import.meta.dir, '../data/events.db');
const IMAGES_DIR = join(import.meta.dir, '../data/images');
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

  const db = new Database(DB_PATH, { readonly: true });

  // Get all event IDs that still exist
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
        console.log(`  [DRY RUN] Would delete: ${file}`);
      } else {
        unlinkSync(join(IMAGES_DIR, file));
        console.log(`  🗑️  Deleted: ${file}`);
      }
    } else {
      kept++;
    }
  }

  // Clear image_local for events whose files we deleted
  if (!dryRun && orphaned > 0) {
    const dbWrite = new Database(DB_PATH);
    // Clear image_local for events where the file no longer exists
    const imageFiles = new Set(
      readdirSync(IMAGES_DIR).filter(f => f.endsWith('.webp')).map(f => f.replace('.webp', ''))
    );
    const eventsWithLocal = dbWrite.prepare(
      "SELECT id, image_local FROM events WHERE image_local IS NOT NULL"
    ).all() as Array<{ id: string; image_local: string }>;

    for (const event of eventsWithLocal) {
      if (!imageFiles.has(event.id)) {
        dbWrite.prepare("UPDATE events SET image_local = NULL WHERE id = ?").run(event.id);
      }
    }
    dbWrite.close();
  }

  db.close();

  console.log(`\n📊 Summary: Kept: ${kept} | Orphaned: ${orphaned}${dryRun ? ' (dry run)' : ''}`);
}

main();
