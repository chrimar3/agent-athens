#!/usr/bin/env bun
/**
 * Image Enrichment Script
 *
 * Fetches event source pages to extract og:image URLs for hotlinking.
 * Follows the same pattern as enrich-time.ts.
 *
 * Usage:
 *   bun run scripts/enrich-images.ts                        # Enrich all missing images
 *   bun run scripts/enrich-images.ts --source athinorama.gr # One source only
 *   bun run scripts/enrich-images.ts --dry-run              # Preview what would be fetched
 *   bun run scripts/enrich-images.ts --limit 50             # Cap requests per run
 *   bun run scripts/enrich-images.ts --verbose              # Show detailed extraction info
 */

import { Database } from 'bun:sqlite';
import { join } from 'path';
import { extractOgImage } from '../src/utils/image-extractor';

const DB_PATH = join(import.meta.dir, '../data/events.db');
const RATE_LIMIT_MS = 1000; // 1 request per second
const MAX_RETRIES = 3;

interface EventToEnrich {
  id: string;
  title: string;
  url: string;
  source: string;
  type: string;
}

// ============================================================================
// HTTP UTILITIES
// ============================================================================

async function fetchWithRetry(url: string, retries = MAX_RETRIES): Promise<string | null> {
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
        continue;
      }
      return null;
    }
  }
  return null;
}

async function fetchWithCurl(url: string): Promise<string | null> {
  try {
    const proc = Bun.spawn([
      'curl', '-s', '--http1.1', '--max-time', '15',
      '-H', 'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      '-H', 'Accept-Language: el,en;q=0.9',
      url
    ], {
      stdout: 'pipe',
      stderr: 'pipe'
    });

    const text = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    if (exitCode === 0 && text.length > 0) {
      return text;
    }
  } catch {
    // Curl failed
  }
  return null;
}

// ============================================================================
// DATABASE OPERATIONS
// ============================================================================

function getEventsToEnrich(db: Database, source: string | null, limit: number): EventToEnrich[] {
  let query: string;
  const params: any[] = [];

  if (source) {
    query = `
      SELECT id, title, url, source, type
      FROM events
      WHERE url IS NOT NULL
        AND url != ''
        AND image_source IS NULL
        AND location_status IN ('verified_athens', 'pass_through')
        AND source = ?
      ORDER BY start_date DESC
      LIMIT ?
    `;
    params.push(source, limit);
  } else {
    query = `
      SELECT id, title, url, source, type
      FROM events
      WHERE url IS NOT NULL
        AND url != ''
        AND image_source IS NULL
        AND location_status IN ('verified_athens', 'pass_through')
      ORDER BY start_date DESC
      LIMIT ?
    `;
    params.push(limit);
  }

  return db.prepare(query).all(...params) as EventToEnrich[];
}

function updateEventImage(
  db: Database,
  eventId: string,
  imageUrl: string | null,
  imageSource: string
): boolean {
  const stmt = db.prepare(`
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
    console.error(`   Failed to update event ${eventId}:`, error);
    return false;
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  🖼️  AGENT ATHENS - Image Enrichment                         ║');
  console.log('║     "Every event deserves its artwork"                       ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');

  // Parse arguments
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const verbose = args.includes('--verbose');

  // Parse --source flag
  const sourceIdx = args.indexOf('--source');
  const selectedSource = sourceIdx >= 0 ? args[sourceIdx + 1] : null;

  // Parse --limit flag
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1]) : 50;

  if (dryRun) {
    console.log('🔍 DRY RUN MODE - No changes will be saved\n');
  }

  console.log(`📋 Source: ${selectedSource || 'all'}`);
  console.log(`📊 Limit: ${limit} events`);
  console.log('');

  // Open database
  const db = new Database(DB_PATH);

  // Get events to enrich
  const events = getEventsToEnrich(db, selectedSource, limit);

  if (events.length === 0) {
    console.log('✅ No events need image enrichment!\n');
    db.close();
    return;
  }

  console.log(`📥 Found ${events.length} events to process\n`);

  // Group by source for reporting
  const bySource = events.reduce((acc, e) => {
    acc[e.source] = (acc[e.source] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  for (const [source, count] of Object.entries(bySource)) {
    console.log(`   ${source}: ${count} events`);
  }
  console.log('');

  // Deduplicate by URL to avoid fetching the same page multiple times
  const urlToEvents = new Map<string, EventToEnrich[]>();
  for (const event of events) {
    const existing = urlToEvents.get(event.url) || [];
    existing.push(event);
    urlToEvents.set(event.url, existing);
  }

  console.log(`🔗 Unique URLs to fetch: ${urlToEvents.size}`);
  console.log('─'.repeat(64));

  // Process events
  let urlsFetched = 0;
  let enriched = 0;
  let notFound = 0;
  let fetchFailed = 0;

  for (const [url, urlEvents] of urlToEvents) {
    urlsFetched++;

    // Progress indicator
    if (urlsFetched % 10 === 0 || urlsFetched === urlToEvents.size) {
      console.log(`📊 Progress: ${urlsFetched}/${urlToEvents.size} URLs (${enriched} images found)`);
    }

    // Fetch the page — use curl for more.com (HTTP/2 issues)
    const useCurl = url.includes('more.com');
    const html = useCurl ? await fetchWithCurl(url) : await fetchWithRetry(url);

    if (!html) {
      fetchFailed++;
      if (verbose) {
        console.log(`   ❌ Fetch failed: ${url.substring(0, 60)}...`);
      }
      // Mark all events with this URL as not_found
      if (!dryRun) {
        for (const event of urlEvents) {
          updateEventImage(db, event.id, null, 'not_found');
        }
      }
      // Rate limiting
      await new Promise(r => setTimeout(r, RATE_LIMIT_MS));
      continue;
    }

    // Extract image
    const result = extractOgImage(html, url);

    if (result) {
      if (!dryRun) {
        for (const event of urlEvents) {
          updateEventImage(db, event.id, result.imageUrl, 'backfill');
        }
      }
      enriched += urlEvents.length;
      if (verbose) {
        console.log(`   ✅ ${urlEvents[0].title.substring(0, 40)}... → ${result.imageUrl.substring(0, 60)} (${result.method})`);
      }
    } else {
      notFound++;
      if (!dryRun) {
        for (const event of urlEvents) {
          updateEventImage(db, event.id, null, 'not_found');
        }
      }
      if (verbose) {
        console.log(`   ⚪ No image: ${urlEvents[0].title.substring(0, 50)}...`);
      }
    }

    // Rate limiting
    if (urlsFetched < urlToEvents.size) {
      await new Promise(r => setTimeout(r, RATE_LIMIT_MS));
    }
  }

  // Close database
  db.close();

  // Summary
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  📊  SUMMARY                                                 ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`   URLs fetched:   ${urlsFetched}`);
  console.log(`   Events enriched: ${enriched}`);
  console.log(`   No image found:  ${notFound}`);
  console.log(`   Fetch failures:  ${fetchFailed}`);
  if (events.length > 0) {
    console.log(`   Coverage:        ${((enriched / events.length) * 100).toFixed(1)}%`);
  }
  console.log('');

  if (dryRun) {
    console.log('💡 Run without --dry-run to save changes\n');
  }
}

main().catch(console.error);
