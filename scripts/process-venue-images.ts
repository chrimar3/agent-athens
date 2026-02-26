#!/usr/bin/env bun

/**
 * Venue Image Processing Script
 *
 * Two modes:
 *   --list     Show venues needing images, ranked by event count
 *   --process  Optimize raw images from data/venue-images-raw/ → data/venue-images/
 *              and update venue_context.image_path in the database
 */

import { Database } from 'bun:sqlite';
import { existsSync, readdirSync, mkdirSync } from 'fs';
import { join, basename, extname } from 'path';
import sharp from 'sharp';

const DB_PATH = join(import.meta.dir, '../data/events.db');
const RAW_DIR = join(import.meta.dir, '../data/venue-images-raw');
const OUT_DIR = join(import.meta.dir, '../data/venue-images');
const MAX_WIDTH = 800;
const WEBP_QUALITY = 80;

// ── Ensure image_path column exists (idempotent) ──────────────

function ensureSchema(db: Database): void {
  const cols = db.prepare("PRAGMA table_info(venue_context)").all() as { name: string }[];
  if (!cols.find(c => c.name === 'image_path')) {
    db.run("ALTER TABLE venue_context ADD COLUMN image_path TEXT");
    console.log('  Added image_path column to venue_context');
  }
}

// ── Greek transliteration + slugify ─────────────────────────

const GREEK_MAP: Record<string, string> = {
  'α': 'a', 'β': 'v', 'γ': 'g', 'δ': 'd', 'ε': 'e', 'ζ': 'z',
  'η': 'i', 'θ': 'th', 'ι': 'i', 'κ': 'k', 'λ': 'l', 'μ': 'm',
  'ν': 'n', 'ξ': 'x', 'ο': 'o', 'π': 'p', 'ρ': 'r', 'σ': 's',
  'ς': 's', 'τ': 't', 'υ': 'y', 'φ': 'f', 'χ': 'ch', 'ψ': 'ps',
  'ω': 'o',
};

function transliterateGreek(text: string): string {
  let result = '';
  for (const char of text) {
    result += GREEK_MAP[char] || char;
  }
  return result;
}

function slugify(text: string): string {
  return transliterateGreek(
    text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')  // Remove diacritics
      .replace(/&#\d+;/g, '')           // Remove HTML entities like &#171;
  )
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 60);
}

// ── --list mode ──────────────────────────────────────────────

function listVenuesNeedingImages(db: Database): void {
  const rows = db.prepare(`
    SELECT e.venue_name, COUNT(*) as cnt,
      vc.image_path
    FROM events e
    LEFT JOIN venue_context vc ON vc.venue_name = e.venue_name
    WHERE e.location_status IN ('verified_athens', 'pass_through')
      AND COALESCE(CASE WHEN e.type='exhibition' THEN e.end_date ELSE NULL END, e.start_date) >= date('now')
      AND e.image_local IS NULL
      AND e.image_url IS NULL
    GROUP BY e.venue_name
    ORDER BY cnt DESC
  `).all() as { venue_name: string; cnt: number; image_path: string | null }[];

  console.log('\nVenues needing images (by no-image event count):\n');
  console.log('  #  Events  Has Image?  Slug                          Venue');
  console.log('  ── ──────  ──────────  ────────────────────────────  ──────────────────────');

  let totalEvents = 0;
  let coveredEvents = 0;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const slug = slugify(r.venue_name);
    const hasImage = r.image_path ? '✅' : '  ';
    const idx = String(i + 1).padStart(3);
    console.log(`  ${idx}  ${String(r.cnt).padStart(5)}   ${hasImage}         ${slug.padEnd(30)} ${r.venue_name}`);
    totalEvents += r.cnt;
    if (r.image_path) coveredEvents += r.cnt;
  }

  console.log(`\n  Total no-image events: ${totalEvents}`);
  console.log(`  Covered by venue images: ${coveredEvents}`);
  console.log(`  Still uncovered: ${totalEvents - coveredEvents}`);

  // Check for raw files waiting to be processed
  if (existsSync(RAW_DIR)) {
    const rawFiles = readdirSync(RAW_DIR).filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f));
    if (rawFiles.length > 0) {
      console.log(`\n  📁 ${rawFiles.length} raw image(s) in data/venue-images-raw/ ready to process:`);
      for (const f of rawFiles) {
        console.log(`     ${f}`);
      }
      console.log(`\n  Run with --process to optimize and update DB.`);
    }
  }
}

// ── --process mode ──────────────────────────────────────────

async function processVenueImages(db: Database): Promise<void> {
  if (!existsSync(RAW_DIR)) {
    console.log('❌ No data/venue-images-raw/ directory found.');
    return;
  }

  const rawFiles = readdirSync(RAW_DIR).filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f));
  if (rawFiles.length === 0) {
    console.log('ℹ️  No images found in data/venue-images-raw/');
    return;
  }

  if (!existsSync(OUT_DIR)) {
    mkdirSync(OUT_DIR, { recursive: true });
  }

  console.log(`\n📸 Processing ${rawFiles.length} venue image(s)...\n`);

  const updateStmt = db.prepare(`
    UPDATE venue_context SET image_path = ? WHERE venue_name = ?
  `);
  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO venue_context (venue_name, image_path) VALUES (?, ?)
  `);

  // Build slug → venue_name lookup from DB
  const venueRows = db.prepare(`
    SELECT DISTINCT venue_name FROM events
    WHERE location_status IN ('verified_athens', 'pass_through')
  `).all() as { venue_name: string }[];

  const slugToVenue = new Map<string, string>();
  for (const r of venueRows) {
    slugToVenue.set(slugify(r.venue_name), r.venue_name);
  }

  // Also add venue_context entries
  const vcRows = db.prepare("SELECT venue_name FROM venue_context").all() as { venue_name: string }[];
  for (const r of vcRows) {
    const slug = slugify(r.venue_name);
    if (!slugToVenue.has(slug)) {
      slugToVenue.set(slug, r.venue_name);
    }
  }

  let processed = 0;
  let errors = 0;

  for (const file of rawFiles) {
    const slug = basename(file, extname(file));
    const venueName = slugToVenue.get(slug);

    if (!venueName) {
      console.log(`  ⚠️  ${file} — no matching venue for slug "${slug}"`);
      console.log(`      Known slugs: ${[...slugToVenue.keys()].slice(0, 5).join(', ')}...`);
      errors++;
      continue;
    }

    const inputPath = join(RAW_DIR, file);
    const outputPath = join(OUT_DIR, `${slug}.webp`);
    const publicPath = `/images/venues/${slug}.webp`;

    try {
      await sharp(inputPath)
        .resize(MAX_WIDTH, undefined, { withoutEnlargement: true })
        .webp({ quality: WEBP_QUALITY })
        .toFile(outputPath);

      // Update or insert venue_context
      const existing = db.prepare("SELECT venue_name FROM venue_context WHERE venue_name = ?").get(venueName);
      if (existing) {
        updateStmt.run(publicPath, venueName);
      } else {
        insertStmt.run(venueName, publicPath);
      }

      const inputStat = Bun.file(inputPath);
      const outputStat = Bun.file(outputPath);
      const inputSize = (await inputStat.arrayBuffer()).byteLength;
      const outputSize = (await outputStat.arrayBuffer()).byteLength;

      console.log(`  ✅ ${venueName}`);
      console.log(`     ${file} (${(inputSize / 1024).toFixed(0)}KB) → ${slug}.webp (${(outputSize / 1024).toFixed(0)}KB)`);
      console.log(`     DB: image_path = ${publicPath}`);
      processed++;
    } catch (err) {
      console.log(`  ❌ ${file} — ${err}`);
      errors++;
    }
  }

  console.log(`\n📊 Done: ${processed} processed, ${errors} errors`);
}

// ── Main ─────────────────────────────────────────────────────

const args = process.argv.slice(2);
const db = new Database(DB_PATH);
ensureSchema(db);

if (args.includes('--list')) {
  listVenuesNeedingImages(db);
} else if (args.includes('--process')) {
  await processVenueImages(db);
} else {
  console.log('Usage:');
  console.log('  bun run scripts/process-venue-images.ts --list     Show venues needing images');
  console.log('  bun run scripts/process-venue-images.ts --process  Optimize raw images & update DB');
}

db.close();
