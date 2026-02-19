#!/usr/bin/env bun
/**
 * SNFCC (Stavros Niarchos Foundation Cultural Center) Scraper
 *
 * Scrapes exhibitions and events from snfcc.org
 * Uses Puppeteer due to bot protection (403 on direct requests)
 *
 * Exhibition-specific fields:
 * - opening_hours: JSON object mapping days to hours
 * - closed_days: Days when the venue is closed
 * - permanent_collection: Boolean for permanent vs temporary
 * - end_date: Required for exhibitions
 *
 * Usage:
 *   bun run scripts/scrape-snfcc.ts              # Scrape SNFCC
 *   bun run scripts/scrape-snfcc.ts --dry-run    # Don't save to DB
 */

import { Database } from 'bun:sqlite';
import { join } from 'path';
import { createHash } from 'crypto';
import puppeteer from 'puppeteer-core';

const DB_PATH = join(import.meta.dir, '../data/events.db');
const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

// ============================================================================
// TYPES
// ============================================================================

interface ScrapedExhibition {
  id: string;
  title: string;
  description: string;
  start_date: string;
  end_date: string | null;
  time: string;
  type: 'exhibition' | 'concert' | 'performance' | 'workshop';
  genres: string;
  venue_name: string;
  url: string;
  price_type: string;
  price_amount: number | null;
  price_range: string | null;
  source: string;
  location_status: string;
  // Exhibition-specific
  opening_hours: Record<string, string> | null;
  closed_days: string | null;
  permanent_collection: boolean;
}

interface ScrapeResult {
  events: ScrapedExhibition[];
  success: boolean;
  error?: string;
  duration: number;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function generateEventId(title: string, date: string, venue: string): string {
  const normalized = `${title.toLowerCase().trim()}|${date}|${venue.toLowerCase().trim()}`;
  return createHash('md5').update(normalized).digest('hex').substring(0, 16);
}

function parseGreekDate(dateStr: string): string | null {
  // Parse Greek dates like "15 Ιανουαρίου 2026" or "15/01/2026"
  const greekMonths: Record<string, string> = {
    'ιανουαρίου': '01', 'φεβρουαρίου': '02', 'μαρτίου': '03',
    'απριλίου': '04', 'μαΐου': '05', 'ιουνίου': '06',
    'ιουλίου': '07', 'αυγούστου': '08', 'σεπτεμβρίου': '09',
    'οκτωβρίου': '10', 'νοεμβρίου': '11', 'δεκεμβρίου': '12',
    'ιαν': '01', 'φεβ': '02', 'μαρ': '03', 'απρ': '04',
    'μαι': '05', 'ιουν': '06', 'ιουλ': '07', 'αυγ': '08',
    'σεπ': '09', 'οκτ': '10', 'νοε': '11', 'δεκ': '12'
  };

  // Try DD/MM/YYYY format
  const slashMatch = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (slashMatch) {
    const [, day, month, year] = slashMatch;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  // Try Greek text format
  const greekMatch = dateStr.toLowerCase().match(/(\d{1,2})\s+([α-ωά-ώ]+)\s*(\d{4})?/);
  if (greekMatch) {
    const [, day, monthStr, year] = greekMatch;
    const month = greekMonths[monthStr];
    if (month) {
      const finalYear = year || new Date().getFullYear().toString();
      return `${finalYear}-${month}-${day.padStart(2, '0')}`;
    }
  }

  return null;
}

// SNFCC opening hours (standard for the cultural center)
const SNFCC_OPENING_HOURS: Record<string, string> = {
  'mon': '06:00-00:00',
  'tue': '06:00-00:00',
  'wed': '06:00-00:00',
  'thu': '06:00-00:00',
  'fri': '06:00-00:00',
  'sat': '06:00-00:00',
  'sun': '06:00-00:00'
};

// ============================================================================
// SNFCC SCRAPER
// ============================================================================

async function scrapeSNFCC(): Promise<ScrapedExhibition[]> {
  console.log('   Launching browser for SNFCC...');
  const events: ScrapedExhibition[] = [];
  const today = new Date().toISOString().split('T')[0];

  let browser = null;
  try {
    browser = await puppeteer.launch({
      headless: true,
      executablePath: CHROME_PATH,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // Navigate to SNFCC events page (Greek version)
    console.log('   Navigating to SNFCC events page...');
    await page.goto('https://www.snfcc.org/el/events', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    // Wait for event cards to load
    await page.waitForSelector('[class*="event"], [class*="card"], article', { timeout: 10000 }).catch(() => {
      console.log('   Warning: No event cards found with standard selectors');
    });

    // Extract events from the page
    const extractedEvents = await page.evaluate(() => {
      const events: Array<{
        title: string;
        url: string;
        dateText: string;
        description: string;
        type: string;
      }> = [];

      // Try multiple selector patterns
      const selectors = [
        'article',
        '[class*="event-card"]',
        '[class*="card"]',
        '.events-list > *',
        '[class*="item"]'
      ];

      for (const selector of selectors) {
        const cards = document.querySelectorAll(selector);
        cards.forEach(card => {
          // Get title
          const titleEl = card.querySelector('h2, h3, h4, [class*="title"]');
          const title = titleEl?.textContent?.trim() || '';

          if (!title || title.length < 3) return;

          // Get link
          const linkEl = card.querySelector('a[href*="/event"], a[href*="/events"]') as HTMLAnchorElement;
          const url = linkEl?.href || '';

          // Get date text
          const dateEl = card.querySelector('[class*="date"], time, [class*="when"]');
          const dateText = dateEl?.textContent?.trim() || '';

          // Get description
          const descEl = card.querySelector('p, [class*="description"], [class*="excerpt"]');
          const description = descEl?.textContent?.trim() || '';

          // Determine type from keywords
          let type = 'other';
          const text = (title + ' ' + description).toLowerCase();
          if (text.includes('έκθεση') || text.includes('exhibition')) {
            type = 'exhibition';
          } else if (text.includes('συναυλία') || text.includes('concert')) {
            type = 'concert';
          } else if (text.includes('παράσταση') || text.includes('performance')) {
            type = 'performance';
          } else if (text.includes('εργαστήριο') || text.includes('workshop')) {
            type = 'workshop';
          }

          events.push({ title, url, dateText, description, type });
        });

        if (events.length > 0) break;
      }

      return events;
    });

    console.log(`   Found ${extractedEvents.length} potential events`);

    // Process extracted events
    for (const extracted of extractedEvents) {
      // Parse dates
      let startDate = parseGreekDate(extracted.dateText);
      let endDate: string | null = null;

      // Check for date range (e.g., "15 Ιαν - 30 Μαρ 2026")
      const rangeMatch = extracted.dateText.match(/(.+?)\s*[-–]\s*(.+)/);
      if (rangeMatch) {
        startDate = parseGreekDate(rangeMatch[1]);
        endDate = parseGreekDate(rangeMatch[2]);
      }

      // Default to today if no date found
      if (!startDate) {
        startDate = today;
      }

      // Skip past events (unless they have an end date in the future)
      if (startDate < today && (!endDate || endDate < today)) {
        continue;
      }

      const event: ScrapedExhibition = {
        id: generateEventId(extracted.title, startDate, 'SNFCC'),
        title: extracted.title,
        description: extracted.description,
        start_date: startDate,
        end_date: endDate,
        time: '',
        type: extracted.type as any,
        genres: extracted.type === 'exhibition' ? 'visual-arts' : '',
        venue_name: 'Κέντρο Πολιτισμού Ίδρυμα Σταύρος Νιάρχος (ΚΠΙΣΝ)',
        url: extracted.url || 'https://www.snfcc.org/el/events',
        price_type: 'open', // SNFCC events are typically free
        price_amount: 0,
        price_range: 'Δωρεάν',
        source: 'snfcc',
        location_status: 'verified_athens',
        // Exhibition-specific
        opening_hours: extracted.type === 'exhibition' ? SNFCC_OPENING_HOURS : null,
        closed_days: null,
        permanent_collection: false
      };

      events.push(event);
    }

    // Also check for exhibitions specifically
    console.log('   Checking exhibitions page...');
    await page.goto('https://www.snfcc.org/el/exhibitions', {
      waitUntil: 'networkidle2',
      timeout: 30000
    }).catch(() => {
      console.log('   Note: No dedicated exhibitions page found');
    });

    // Extract any additional exhibitions
    const exhibitionEvents = await page.evaluate(() => {
      const exhibitions: Array<{
        title: string;
        url: string;
        dateText: string;
        description: string;
      }> = [];

      document.querySelectorAll('article, [class*="exhibition"]').forEach(card => {
        const titleEl = card.querySelector('h2, h3, h4, [class*="title"]');
        const title = titleEl?.textContent?.trim() || '';

        if (!title || title.length < 3) return;

        const linkEl = card.querySelector('a') as HTMLAnchorElement;
        const url = linkEl?.href || '';

        const dateEl = card.querySelector('[class*="date"], time');
        const dateText = dateEl?.textContent?.trim() || '';

        const descEl = card.querySelector('p, [class*="description"]');
        const description = descEl?.textContent?.trim() || '';

        exhibitions.push({ title, url, dateText, description });
      });

      return exhibitions;
    });

    for (const ex of exhibitionEvents) {
      // Skip if already added
      if (events.some(e => e.title === ex.title)) continue;

      let startDate = parseGreekDate(ex.dateText) || today;
      let endDate: string | null = null;

      const rangeMatch = ex.dateText.match(/(.+?)\s*[-–]\s*(.+)/);
      if (rangeMatch) {
        startDate = parseGreekDate(rangeMatch[1]) || startDate;
        endDate = parseGreekDate(rangeMatch[2]);
      }

      if (startDate < today && (!endDate || endDate < today)) continue;

      events.push({
        id: generateEventId(ex.title, startDate, 'SNFCC'),
        title: ex.title,
        description: ex.description,
        start_date: startDate,
        end_date: endDate,
        time: '',
        type: 'exhibition',
        genres: 'visual-arts',
        venue_name: 'Κέντρο Πολιτισμού Ίδρυμα Σταύρος Νιάρχος (ΚΠΙΣΝ)',
        url: ex.url || 'https://www.snfcc.org/el/exhibitions',
        price_type: 'open',
        price_amount: 0,
        price_range: 'Δωρεάν',
        source: 'snfcc',
        location_status: 'verified_athens',
        opening_hours: SNFCC_OPENING_HOURS,
        closed_days: null,
        permanent_collection: false
      });
    }

    console.log(`   Extracted ${events.length} total events`);

  } catch (error) {
    console.log(`   Error during scraping: ${error}`);
    throw error;
  } finally {
    if (browser) await browser.close();
  }

  return events;
}

// ============================================================================
// DATABASE OPERATIONS
// ============================================================================

function saveEvents(events: ScrapedExhibition[], dryRun: boolean): number {
  if (dryRun || events.length === 0) return 0;

  const db = new Database(DB_PATH);
  let saved = 0;

  const stmt = db.prepare(`
    INSERT INTO events (
      id, title, description, start_date, end_date, type, genres,
      venue_name, url, price_type, price_amount, price_range, source,
      location_status, needs_enrichment, created_at, updated_at,
      opening_hours, closed_days, permanent_collection
    ) VALUES (
      $id, $title, $description, $start_date, $end_date, $type, $genres,
      $venue_name, $url, $price_type, $price_amount, $price_range, $source,
      $location_status, 1, datetime('now'), datetime('now'),
      $opening_hours, $closed_days, $permanent_collection
    )
    ON CONFLICT(id) DO UPDATE SET
      title = $title,
      description = $description,
      end_date = COALESCE($end_date, end_date),
      url = $url,
      price_type = COALESCE($price_type, price_type),
      price_amount = COALESCE($price_amount, price_amount),
      price_range = COALESCE($price_range, price_range),
      opening_hours = COALESCE($opening_hours, opening_hours),
      closed_days = COALESCE($closed_days, closed_days),
      permanent_collection = $permanent_collection,
      updated_at = datetime('now')
  `);

  for (const e of events) {
    try {
      stmt.run({
        $id: e.id,
        $title: e.title,
        $description: e.description,
        $start_date: e.start_date,
        $end_date: e.end_date,
        $type: e.type,
        $genres: e.genres,
        $venue_name: e.venue_name,
        $url: e.url,
        $price_type: e.price_type,
        $price_amount: e.price_amount,
        $price_range: e.price_range,
        $source: e.source,
        $location_status: e.location_status,
        $opening_hours: e.opening_hours ? JSON.stringify(e.opening_hours) : null,
        $closed_days: e.closed_days,
        $permanent_collection: e.permanent_collection ? 1 : 0
      });
      saved++;
    } catch (err) {
      console.log(`   Warning: Could not save ${e.title}: ${err}`);
    }
  }

  db.close();
  return saved;
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  SNFCC Scraper - Exhibitions & Events                        ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');

  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  if (dryRun) {
    console.log('DRY RUN MODE - No changes will be saved\n');
  }

  const start = Date.now();

  try {
    const events = await scrapeSNFCC();
    const duration = Date.now() - start;

    console.log('\n📊 Results:');
    console.log(`   Total events: ${events.length}`);
    console.log(`   Exhibitions: ${events.filter(e => e.type === 'exhibition').length}`);
    console.log(`   Other events: ${events.filter(e => e.type !== 'exhibition').length}`);
    console.log(`   Duration: ${(duration / 1000).toFixed(1)}s`);

    if (!dryRun && events.length > 0) {
      console.log('\n💾 Saving to database...');
      const saved = saveEvents(events, dryRun);
      console.log(`   Saved ${saved} events`);
    }

    // Print sample events
    if (events.length > 0) {
      console.log('\n📋 Sample events:');
      events.slice(0, 5).forEach((e, i) => {
        console.log(`   ${i + 1}. ${e.title}`);
        console.log(`      Type: ${e.type} | Date: ${e.start_date}${e.end_date ? ' - ' + e.end_date : ''}`);
      });
    }

  } catch (error) {
    console.log(`\nError: ${error}`);
    process.exit(1);
  }

  console.log('\nDone!\n');
}

// Export for use in scrape-all.ts
export { scrapeSNFCC, ScrapedExhibition };

// Only run main if this is the entry point
const isMainModule = import.meta.main || process.argv[1]?.includes('scrape-snfcc');
if (isMainModule) {
  main().catch(console.error);
}
