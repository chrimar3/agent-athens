#!/usr/bin/env bun
/**
 * Fix broken athinorama image URLs.
 *
 * Athinorama's og:image URLs (/lmnts/events/) return HTTP 502.
 * Each event page body contains working poster images at
 * /Content/ImagesDatabase/p/{250x300|300x380}/crop/both/...
 *
 * This script fetches each event page, extracts the body image,
 * and updates image_url in the database.
 *
 * Usage:
 *   bun run scripts/fix-athinorama-images.ts              # Fix all broken
 *   bun run scripts/fix-athinorama-images.ts --dry-run    # Preview only
 *   bun run scripts/fix-athinorama-images.ts --limit=10   # Cap requests
 */

import { Database } from 'bun:sqlite';
import { join } from 'path';

const DB_PATH = join(import.meta.dir, '../data/events.db');
const RATE_LIMIT_MS = 1500; // 1.5s between requests

// Parse CLI args
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limitArg = args.find(a => a.startsWith('--limit='))?.split('=')[1];
const limit = limitArg ? parseInt(limitArg, 10) : undefined;

/**
 * Extract the main poster image from an athinorama event page body.
 * Targets 250x300 or 300x380 sizes (event posters), ignoring 100x143 (thumbnails).
 */
function extractAthinoramaBodyImage(html: string): string | null {
  const pattern = /https?:\/\/www\.athinorama\.gr\/Content\/ImagesDatabase\/p\/(?:250x300|300x380)\/crop\/both\/[a-f0-9\/]+\.jpg[^"'\s]*/i;
  const match = html.match(pattern);
  if (!match) return null;

  // Clean: stop at quotes and decode HTML entities
  let url = match[0].split('"')[0].split("'")[0];
  url = url.replace(/&amp;/g, '&');
  return url;
}

async function fetchPage(url: string, retries = 2): Promise<string | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'el,en;q=0.9'
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return await response.text();
    } catch (error) {
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000));
      }
    }
  }
  return null;
}

async function main() {
  const db = new Database(DB_PATH);
  db.exec('PRAGMA journal_mode = WAL;');

  // Ensure image_source column exists
  const columns = db.prepare("PRAGMA table_info(events)").all() as Array<{ name: string }>;
  const existingCols = new Set(columns.map(c => c.name));
  if (!existingCols.has('image_source')) {
    db.run("ALTER TABLE events ADD COLUMN image_source TEXT");
    console.log('Added image_source column');
  }

  // Find events with broken /lmnts/events/ image URLs
  let query = `
    SELECT id, title, url, image_url FROM events
    WHERE source = 'athinorama.gr'
      AND image_url LIKE '%/lmnts/events/%'
      AND image_local IS NULL
    ORDER BY start_date DESC
  `;
  if (limit) {
    query += ` LIMIT ${limit}`;
  }

  const rows = db.prepare(query).all() as Array<{
    id: string;
    title: string;
    url: string;
    image_url: string;
  }>;

  console.log(`\n🔧 Athinorama Image Fix`);
  console.log(`   Found ${rows.length} events with broken /lmnts/events/ image URLs`);
  if (dryRun) console.log('   [DRY RUN MODE]');
  console.log('');

  const updateStmt = db.prepare(`
    UPDATE events
    SET image_url = ?,
        image_source = 'athinorama_body_fix',
        updated_at = datetime('now')
    WHERE id = ?
  `);

  const markNoImageStmt = db.prepare(`
    UPDATE events
    SET image_source = 'no_body_image',
        updated_at = datetime('now')
    WHERE id = ?
  `);

  let fixed = 0;
  let noImage = 0;
  let fetchFailed = 0;

  for (let i = 0; i < rows.length; i++) {
    const event = rows[i];
    const progress = `[${i + 1}/${rows.length}]`;

    // Fetch the event page
    const html = await fetchPage(event.url);
    if (!html) {
      fetchFailed++;
      console.log(`  ${progress} ❌ Fetch failed: ${event.title}`);
      continue;
    }

    // Extract body image
    const bodyImage = extractAthinoramaBodyImage(html);

    if (bodyImage) {
      if (!dryRun) {
        updateStmt.run(bodyImage, event.id);
      }
      fixed++;
      console.log(`  ${progress} ✅ ${event.title}`);
    } else {
      if (!dryRun) {
        markNoImageStmt.run(event.id);
      }
      noImage++;
      console.log(`  ${progress} ⚠️  No body image: ${event.title}`);
    }

    // Rate limit
    if (i < rows.length - 1) {
      await new Promise(r => setTimeout(r, RATE_LIMIT_MS));
    }
  }

  db.close();

  console.log(`\n📊 Summary:`);
  console.log(`   Fixed:        ${fixed}`);
  console.log(`   No image:     ${noImage}`);
  console.log(`   Fetch failed: ${fetchFailed}`);
  console.log(`   Total:        ${rows.length}`);
  if (dryRun) console.log('   [DRY RUN — no changes saved]');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
