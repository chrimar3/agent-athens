#!/usr/bin/env bun
/**
 * Ticket URL Validator
 *
 * Validates and tracks ticket URL status for events.
 * Also generates ticket URLs from venue mappings for events without them.
 *
 * Status values:
 * - valid: URL responds 200 and is not a homepage redirect
 * - expired: URL returns 404 or redirects to error page
 * - sold_out: URL indicates sold out (if detectable)
 * - unverified: Not yet checked
 * - generated: URL generated from venue mapping
 *
 * Usage:
 *   bun run scripts/validate-ticket-urls.ts              # Validate all URLs
 *   bun run scripts/validate-ticket-urls.ts --generate   # Generate missing URLs
 *   bun run scripts/validate-ticket-urls.ts --stats      # Show URL stats
 *   bun run scripts/validate-ticket-urls.ts --dry-run    # Don't update DB
 *
 * @see config/ticketing-mapping.json
 */

import Database from 'bun:sqlite';
import { readFileSync } from 'fs';
import { join } from 'path';

const DB_PATH = join(import.meta.dir, '../data/events.db');

// ============================================================================
// Types
// ============================================================================

interface TicketingConfig {
  platforms: Record<string, {
    name: string;
    base_url: string;
    search_pattern?: string;
  }>;
  venue_to_platform: Record<string, {
    platform: string;
    url_pattern: string;
    notes?: string;
  }>;
  door_only_venues: string[];
}

type TicketUrlStatus = 'valid' | 'expired' | 'sold_out' | 'unverified' | 'generated' | 'door_only';

interface EventForValidation {
  id: string;
  title: string;
  venue_name: string;
  ticket_url: string | null;
  ticket_url_status: string | null;
  url: string | null;
  start_date: string;
}

// ============================================================================
// Load Config
// ============================================================================

function loadTicketingConfig(): TicketingConfig {
  const configPath = join(import.meta.dir, '../config/ticketing-mapping.json');
  return JSON.parse(readFileSync(configPath, 'utf-8')) as TicketingConfig;
}

// ============================================================================
// Database
// ============================================================================

function openDatabase(): Database {
  const db = new Database(DB_PATH);
  db.exec('PRAGMA journal_mode = WAL;');
  return db;
}

// ============================================================================
// URL Validation
// ============================================================================

/**
 * Check if URL is valid and not a redirect to homepage
 */
async function validateUrl(url: string): Promise<{
  status: TicketUrlStatus;
  finalUrl: string | null;
  error?: string;
}> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; AgentAthens/1.0)',
      },
    });

    clearTimeout(timeout);

    const finalUrl = response.url;

    // Check for 404 or error status
    if (response.status === 404) {
      return { status: 'expired', finalUrl };
    }

    if (!response.ok) {
      return { status: 'expired', finalUrl, error: `HTTP ${response.status}` };
    }

    // Check if redirected to homepage (indicates event page doesn't exist)
    const urlObj = new URL(finalUrl);
    const isHomepage =
      urlObj.pathname === '/' ||
      urlObj.pathname === '' ||
      urlObj.pathname.endsWith('/events') ||
      urlObj.pathname.endsWith('/events/');

    if (isHomepage && !url.endsWith('/') && !url.endsWith('/events')) {
      return { status: 'expired', finalUrl, error: 'Redirected to homepage' };
    }

    return { status: 'valid', finalUrl };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Timeout or network error
    if (errorMessage.includes('abort') || errorMessage.includes('timeout')) {
      return { status: 'unverified', finalUrl: null, error: 'Timeout' };
    }

    return { status: 'expired', finalUrl: null, error: errorMessage };
  }
}

/**
 * Generate ticket URL from venue mapping
 */
function generateTicketUrl(
  venueName: string,
  eventTitle: string,
  config: TicketingConfig
): string | null {
  // Check if door-only venue
  if (config.door_only_venues.some(v =>
    venueName.toLowerCase().includes(v.toLowerCase()))) {
    return null;
  }

  // Check venue mapping
  const venueMapping = Object.entries(config.venue_to_platform).find(([venue]) =>
    venueName.toLowerCase().includes(venue.toLowerCase())
  );

  if (venueMapping) {
    const [, mapping] = venueMapping;
    const platform = config.platforms[mapping.platform];

    if (platform && platform.search_pattern) {
      // Generate search URL
      const searchQuery = encodeURIComponent(eventTitle.replace(/[^\w\s]/g, ' '));
      return `${platform.base_url}${platform.search_pattern}${searchQuery}`;
    }

    return mapping.url_pattern;
  }

  // Fallback to More.com search
  const morecom = config.platforms['more.com'];
  if (morecom) {
    const searchQuery = encodeURIComponent(`${eventTitle} ${venueName}`);
    return `${morecom.base_url}${morecom.search_pattern}${searchQuery}`;
  }

  return null;
}

// ============================================================================
// Main Operations
// ============================================================================

/**
 * Validate all existing ticket URLs
 */
async function validateAllUrls(
  db: Database,
  dryRun: boolean
): Promise<{ validated: number; valid: number; expired: number; errors: number }> {
  const events = db.prepare(`
    SELECT id, title, venue_name, ticket_url, ticket_url_status, start_date
    FROM events
    WHERE ticket_url IS NOT NULL
      AND location_status IN ('verified_athens', 'pass_through')
    ORDER BY start_date ASC
  `).all() as EventForValidation[];

  console.log(`\n🔍 Validating ${events.length} ticket URLs...\n`);

  let validated = 0;
  let valid = 0;
  let expired = 0;
  let errors = 0;

  const updateStmt = db.prepare(`
    UPDATE events
    SET ticket_url_status = ?, updated_at = datetime('now')
    WHERE id = ?
  `);

  // Process in batches to avoid rate limiting
  const batchSize = 5;
  for (let i = 0; i < events.length; i += batchSize) {
    const batch = events.slice(i, i + batchSize);

    const results = await Promise.all(
      batch.map(async event => {
        const result = await validateUrl(event.ticket_url!);
        return { event, result };
      })
    );

    for (const { event, result } of results) {
      validated++;

      if (result.status === 'valid') {
        valid++;
        if (!dryRun && event.ticket_url_status !== 'valid') {
          updateStmt.run('valid', event.id);
        }
        process.stdout.write('.');
      } else if (result.status === 'expired') {
        expired++;
        if (!dryRun) {
          updateStmt.run('expired', event.id);
        }
        console.log(`\n   ❌ ${event.title.slice(0, 40)}... → ${result.error || 'expired'}`);
      } else {
        errors++;
        if (!dryRun && !event.ticket_url_status) {
          updateStmt.run('unverified', event.id);
        }
        process.stdout.write('?');
      }
    }

    // Rate limit between batches
    if (i + batchSize < events.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  console.log('\n');
  return { validated, valid, expired, errors };
}

/**
 * Generate ticket URLs for events without them
 */
function generateMissingUrls(
  db: Database,
  config: TicketingConfig,
  dryRun: boolean
): { generated: number; doorOnly: number; noMatch: number } {
  const events = db.prepare(`
    SELECT id, title, venue_name, ticket_url, ticket_url_status, url, start_date
    FROM events
    WHERE (ticket_url IS NULL OR ticket_url = '')
      AND price_type NOT IN ('open', 'free')
      AND location_status IN ('verified_athens', 'pass_through')
    ORDER BY start_date ASC
  `).all() as EventForValidation[];

  console.log(`\n🔧 Generating URLs for ${events.length} events...\n`);

  let generated = 0;
  let doorOnly = 0;
  let noMatch = 0;

  const updateStmt = db.prepare(`
    UPDATE events
    SET ticket_url = ?, ticket_url_status = 'generated', updated_at = datetime('now')
    WHERE id = ?
  `);

  const doorOnlyStmt = db.prepare(`
    UPDATE events
    SET ticket_url_status = 'door_only', updated_at = datetime('now')
    WHERE id = ?
  `);

  for (const event of events) {
    // Check if door-only venue
    if (config.door_only_venues.some(v =>
      event.venue_name.toLowerCase().includes(v.toLowerCase()))) {
      doorOnly++;
      if (!dryRun) {
        doorOnlyStmt.run(event.id);
      }
      console.log(`   🚪 ${event.title.slice(0, 40)}... → door only (${event.venue_name})`);
      continue;
    }

    // Use existing URL if available
    if (event.url && event.url.includes('://')) {
      if (!dryRun) {
        updateStmt.run(event.url, event.id);
      }
      console.log(`   📎 ${event.title.slice(0, 40)}... → from source URL`);
      generated++;
      continue;
    }

    // Generate from venue mapping
    const generatedUrl = generateTicketUrl(event.venue_name, event.title, config);

    if (generatedUrl) {
      if (!dryRun) {
        updateStmt.run(generatedUrl, event.id);
      }
      console.log(`   ✨ ${event.title.slice(0, 40)}... → generated`);
      generated++;
    } else {
      noMatch++;
    }
  }

  return { generated, doorOnly, noMatch };
}

/**
 * Show ticket URL statistics
 */
function showStats(db: Database): void {
  const stats = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN ticket_url IS NOT NULL THEN 1 ELSE 0 END) as with_url,
      SUM(CASE WHEN ticket_url_status = 'valid' THEN 1 ELSE 0 END) as status_valid,
      SUM(CASE WHEN ticket_url_status = 'expired' THEN 1 ELSE 0 END) as status_expired,
      SUM(CASE WHEN ticket_url_status = 'generated' THEN 1 ELSE 0 END) as status_generated,
      SUM(CASE WHEN ticket_url_status = 'door_only' THEN 1 ELSE 0 END) as status_door_only,
      SUM(CASE WHEN ticket_url_status = 'unverified' OR ticket_url_status IS NULL THEN 1 ELSE 0 END) as status_unverified,
      SUM(CASE WHEN price_type NOT IN ('open', 'free') THEN 1 ELSE 0 END) as ticketed_events
    FROM events
    WHERE location_status IN ('verified_athens', 'pass_through')
  `).get() as {
    total: number;
    with_url: number;
    status_valid: number;
    status_expired: number;
    status_generated: number;
    status_door_only: number;
    status_unverified: number;
    ticketed_events: number;
  };

  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║  🎫 Ticket URL Statistics                                     ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  console.log('Events:');
  console.log(`   Total events:         ${stats.total}`);
  console.log(`   Ticketed events:      ${stats.ticketed_events}`);
  console.log(`   With ticket URL:      ${stats.with_url}`);

  console.log('\nURL Status:');
  console.log(`   Valid:                ${stats.status_valid}`);
  console.log(`   Expired:              ${stats.status_expired}`);
  console.log(`   Generated:            ${stats.status_generated}`);
  console.log(`   Door only:            ${stats.status_door_only}`);
  console.log(`   Unverified:           ${stats.status_unverified}`);

  // Coverage calculation
  const coverage = (stats.with_url / stats.ticketed_events) * 100;
  const validCoverage = (stats.status_valid / stats.with_url) * 100;

  console.log('\nCoverage:');
  console.log(`   URL coverage:         ${coverage.toFixed(1)}% of ticketed events`);
  console.log(`   Valid URLs:           ${validCoverage.toFixed(1)}% of URLs checked`);
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  const dryRun = args.includes('--dry-run');
  const statsOnly = args.includes('--stats');
  const generateOnly = args.includes('--generate');

  const db = openDatabase();
  const config = loadTicketingConfig();

  try {
    if (statsOnly) {
      showStats(db);
      return;
    }

    console.log('╔═══════════════════════════════════════════════════════════════╗');
    console.log('║  🎫 Agent Athens - Ticket URL Validator                       ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝');

    if (dryRun) {
      console.log('\n🔍 DRY RUN - No changes will be made');
    }

    if (!generateOnly) {
      // Step 1: Validate existing URLs
      console.log('\n📌 Step 1: Validating existing ticket URLs...');
      const validateResult = await validateAllUrls(db, dryRun);
      console.log(`   Validated: ${validateResult.validated}`);
      console.log(`   Valid: ${validateResult.valid}`);
      console.log(`   Expired: ${validateResult.expired}`);
      console.log(`   Errors: ${validateResult.errors}`);
    }

    // Step 2: Generate missing URLs
    console.log('\n📌 Step 2: Generating missing ticket URLs...');
    const generateResult = generateMissingUrls(db, config, dryRun);
    console.log(`\n   Generated: ${generateResult.generated}`);
    console.log(`   Door only: ${generateResult.doorOnly}`);
    console.log(`   No match: ${generateResult.noMatch}`);

    // Show final stats
    showStats(db);
  } finally {
    db.close();
  }
}

main().catch(console.error);
