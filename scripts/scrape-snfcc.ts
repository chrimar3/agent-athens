#!/usr/bin/env bun
/**
 * SNFCC (Stavros Niarchos Foundation Cultural Center) Scraper
 *
 * Scrapes events from snfcc.org by navigating per-category pages.
 * Uses Puppeteer because the site has Akamai bot protection (403 on direct requests).
 *
 * IMPORTANT: The SNFCC website is WordPress with WPML. The URL /el/events is a
 * photo gallery page, NOT the events listing. Real events live at /ekdiloseis/
 * and are filterable by category at /event-category/<slug>/.
 *
 * Usage:
 *   bun run scripts/scrape-snfcc.ts              # Scrape SNFCC
 *   bun run scripts/scrape-snfcc.ts --dry-run    # Don't save to DB
 */

import { Database } from 'bun:sqlite';
import { join } from 'path';
import { createHash } from 'crypto';
import puppeteer from 'puppeteer-core';
import { normalizeDateField } from '../src/utils/date-format';

const DB_PATH = join(import.meta.dir, '../data/events.db');
const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

// ============================================================================
// TYPES
// ============================================================================

type SNFCCEventType = 'exhibition' | 'concert' | 'cinema' | 'performance' | 'workshop';

interface ScrapedExhibition {
  id: string;
  title: string;
  description: string;
  start_date: string;
  end_date: string | null;
  time: string;
  type: SNFCCEventType;
  genres: string;
  venue_name: string;
  url: string;
  price_type: string;
  price_amount: number | null;
  price_range: string | null;
  source: string;
  location_status: string;
  image_url: string | null;
  opening_hours: Record<string, string> | null;
  closed_days: string | null;
  permanent_collection: boolean;
}

// ============================================================================
// CATEGORY CONFIGURATION
// ============================================================================

// Each SNFCC category page maps to one of our event types.
// EXCLUDED: athlitismos (sports), xenagiseis (tours) — not cultural events.
const CATEGORY_PAGES: Array<{ slug: string; type: SNFCCEventType; label: string }> = [
  { slug: 'moysiki', type: 'concert', label: 'Music' },
  { slug: 'kinimatografos', type: 'cinema', label: 'Cinema' },
  { slug: 'parastaseis', type: 'performance', label: 'Performances' },
  { slug: 'ergastiria', type: 'workshop', label: 'Workshops' },
  { slug: 'ektheseis', type: 'exhibition', label: 'Exhibitions' },
  { slug: 'dialexeis-amp-amp-omilies', type: 'workshop', label: 'Lectures' },
];

// Title patterns that indicate non-events (announcements, programs, sports, etc.)
const EXCLUDE_TITLE_PATTERNS = [
  // Non-events
  /σιντριβάνι|fountain/i,
  /κατασκήνωση|camp\b/i,
  /patron.*program/i,
  /open\s+call/i,
  /ανοιχτή πρόσκληση/i,
  /youth\s+council/i,
  /marketplace/i,
  /ανοιχτό κάλεσμα/i,
  // Sports & fitness (excluded category — these appear on main page too)
  /\bpilates\b/i,
  /\byoga\b/i,
  /\bvolley\b/i,
  /\bbasket\b/i,
  /\btennis\b/i,
  /\bfootball\b/i,
  /\btai\s*chi\b/i,
  /\bkayak\b|καγιάκ/i,
  /\broller\s*skate/i,
  /αναρρίχηση|αναρρίχησης|climbing\s*wall/i,
  /σύμβουλος\s*άσκησης|exercise\s*consult/i,
  /άσκηση.*ισορροπία|balance.*exercise/i,
  /mini\s*(volley|basket|tennis|football)/i,
  /ηλεκτρονική\s*αγορά/i,
  /τρέξιμο|running\s*(team|club)/i,
  /ποδηλασία|cycling/i,
  /crossfit|zumba|kickboxing/i,
  /αθλητισμός\s*για\s*όλ/i,
  /\bfun\s*dance\b/i,
  // Tours (excluded category)
  /ξεναγήσεις\s*(στο|στην)|guided\s*tour/i,
  /αισθητηριακ.*ξενάγηση/i,
  // Members-only excursions to other venues
  /εκτός\s*των\s*τειχών/i,
  // Generic open day / accessibility programs (not specific events)
  /ένας\s*χώρος\s*ανοιχτός/i,
];

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function generateEventId(title: string, date: string, venue: string): string {
  const normalized = `${title.toLowerCase().trim()}|${date}|${venue.toLowerCase().trim()}`;
  return createHash('md5').update(normalized).digest('hex').substring(0, 16);
}

function parseGreekDate(dateStr: string): string | null {
  const greekMonths: Record<string, string> = {
    'ιανουαρίου': '01', 'φεβρουαρίου': '02', 'μαρτίου': '03',
    'απριλίου': '04', 'μαΐου': '05', 'ιουνίου': '06',
    'ιουλίου': '07', 'αυγούστου': '08', 'σεπτεμβρίου': '09',
    'οκτωβρίου': '10', 'νοεμβρίου': '11', 'δεκεμβρίου': '12',
    'ιαν': '01', 'φεβ': '02', 'μαρ': '03', 'απρ': '04',
    'μαι': '05', 'ιουν': '06', 'ιουλ': '07', 'αυγ': '08',
    'σεπ': '09', 'οκτ': '10', 'νοε': '11', 'δεκ': '12',
    // Nominative forms (used in some contexts)
    'ιανουάριος': '01', 'φεβρουάριος': '02', 'μάρτιος': '03',
    'απρίλιος': '04', 'μάιος': '05', 'ιούνιος': '06',
    'ιούλιος': '07', 'αύγουστος': '08', 'σεπτέμβριος': '09',
    'οκτώβριος': '10', 'νοέμβριος': '11', 'δεκέμβριος': '12',
  };

  // Try DD/MM/YYYY format
  const slashMatch = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (slashMatch) {
    const [, day, month, year] = slashMatch;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  // Try YYYY-MM-DD (ISO) passthrough
  const isoMatch = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return isoMatch[0];
  }

  // Try Greek text format: "15 Ιανουαρίου 2026" or "15 Ιαν 2026"
  const greekMatch = dateStr.toLowerCase().match(/(\d{1,2})\s+([α-ωά-ώΐ]+)\s*(\d{4})?/);
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

function parseDateRange(dateText: string): { startDate: string | null; endDate: string | null } {
  // Handle date ranges: "15 Ιαν – 30 Μαρ 2026" or "15/01 - 30/03/2026"
  const rangeMatch = dateText.match(/(.+?)\s*[-–—]\s*(.+)/);
  if (rangeMatch) {
    const startDate = parseGreekDate(rangeMatch[1].trim());
    const endDate = parseGreekDate(rangeMatch[2].trim());
    return { startDate, endDate };
  }
  return { startDate: parseGreekDate(dateText), endDate: null };
}

function shouldExcludeTitle(title: string): boolean {
  return EXCLUDE_TITLE_PATTERNS.some(pattern => pattern.test(title));
}

function isEventUrl(url: string): boolean {
  // Real SNFCC events have /event/ in their URL (WordPress custom post type)
  if (url.includes('/event/')) return true;
  // Reject known non-event URL patterns
  if (url.includes('/venue/')) return false;
  if (url.includes('/episkepsi/')) return false;
  if (url.includes('/to-kpisn/')) return false;
  if (url.includes('/scholeia-sto-kpisn/')) return false;
  if (url.includes('/supporters/')) return false;
  if (url.includes('/diathesi-choron/')) return false;
  if (url.includes('/photo-gallery/')) return false;
  return false; // Default: reject unknown URL patterns — only /event/ URLs are events
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
  const allEvents: ScrapedExhibition[] = [];
  const seenTitles = new Set<string>();
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

    // PHASE 1: Scrape category pages first — they give us correct event types
    for (const category of CATEGORY_PAGES) {
      const url = `https://www.snfcc.org/event-category/${category.slug}/`;
      console.log(`   Scraping ${category.label} (${category.slug})...`);

      try {
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

        // Wait for content to load
        await page.waitForSelector('article, .x-box, .item, [class*="event"]', { timeout: 10000 }).catch(() => {
          console.log(`   Warning: No cards found for ${category.label}`);
        });

        // Extract event cards from the page
        const extracted = await page.evaluate(() => {
          const events: Array<{
            title: string;
            url: string;
            dateText: string;
            description: string;
            imageUrl: string | null;
          }> = [];

          // The SNFCC site uses .x-box articles and .item list entries
          const selectors = [
            'li.item article.x-box a',
            'article.x-box a',
            '.post-list-container .item a',
            '.x-post-list .item a',
          ];

          for (const selector of selectors) {
            const links = document.querySelectorAll(selector);
            if (links.length === 0) continue;

            links.forEach(link => {
              const anchor = link as HTMLAnchorElement;
              const href = anchor.href || '';

              // Get title
              const titleEl = anchor.querySelector('h2, h3, h4, .title');
              const title = titleEl?.textContent?.trim() || '';
              if (!title || title.length < 3) return;

              // Get date text
              const dateEl = anchor.querySelector('.date, time, [class*="date"]');
              const dateText = dateEl?.textContent?.trim() || '';

              // Get description
              const descEl = anchor.querySelector('.description, .excerpt, p');
              const description = descEl?.textContent?.trim() || '';

              // Get image
              const imgEl = anchor.querySelector('img');
              const imageUrl = imgEl?.src || null;

              events.push({ title, url: href, dateText, description, imageUrl });
            });

            if (events.length > 0) break;
          }

          // Fallback: try broader selectors if nothing found
          if (events.length === 0) {
            document.querySelectorAll('article, .x-box').forEach(card => {
              const linkEl = card.querySelector('a') as HTMLAnchorElement | null;
              const href = linkEl?.href || '';

              const titleEl = card.querySelector('h2, h3, h4, .title');
              const title = titleEl?.textContent?.trim() || '';
              if (!title || title.length < 3) return;

              const dateEl = card.querySelector('.date, time, [class*="date"]');
              const dateText = dateEl?.textContent?.trim() || '';

              const descEl = card.querySelector('.description, .excerpt, p');
              const description = descEl?.textContent?.trim() || '';

              const imgEl = card.querySelector('img');
              const imageUrl = imgEl?.src || null;

              events.push({ title, url: href, dateText, description, imageUrl });
            });
          }

          return events;
        });

        console.log(`   Found ${extracted.length} items for ${category.label}`);

        // Process each extracted event
        for (const item of extracted) {
          // Skip duplicates (same event may appear in multiple categories)
          const titleKey = item.title.toLowerCase().trim();
          if (seenTitles.has(titleKey)) continue;

          // Skip non-events by title
          if (shouldExcludeTitle(item.title)) {
            console.log(`   Excluded (title): ${item.title.substring(0, 60)}...`);
            continue;
          }

          // Skip non-event URLs (venue pages, navigation, etc.)
          if (item.url && !isEventUrl(item.url)) {
            console.log(`   Excluded (url): ${item.title.substring(0, 50)} → ${item.url.substring(0, 60)}`);
            continue;
          }

          // Parse dates
          const { startDate: parsedStart, endDate: parsedEnd } = parseDateRange(item.dateText);
          const startDate = parsedStart || today;
          const endDate = parsedEnd;

          // Skip past events (unless they have an end date in the future)
          if (startDate < today && (!endDate || endDate < today)) {
            continue;
          }

          // Ensure event has a unique URL (not the category page itself)
          const eventUrl = item.url && !item.url.includes('/event-category/')
            ? item.url
            : `https://www.snfcc.org/ekdiloseis/`;

          const event: ScrapedExhibition = {
            id: generateEventId(item.title, startDate, 'ΚΠΙΣΝ'),
            title: item.title,
            description: item.description.substring(0, 500),
            start_date: startDate,
            end_date: endDate,
            time: '',
            type: category.type,
            genres: category.type === 'exhibition' ? 'visual-arts' :
                    category.type === 'concert' ? '' :
                    category.type === 'cinema' ? 'film' : '',
            venue_name: 'ΚΠΙΣΝ',
            url: eventUrl,
            price_type: 'open',
            price_amount: 0,
            price_range: 'Δωρεάν',
            source: 'snfcc',
            location_status: 'verified_athens',
            image_url: item.imageUrl,
            opening_hours: category.type === 'exhibition' ? SNFCC_OPENING_HOURS : null,
            closed_days: null,
            permanent_collection: false
          };

          seenTitles.add(titleKey);
          allEvents.push(event);
        }

        // Check for pagination (WordPress uses /page/2/, /page/3/, etc.)
        const hasNextPage = await page.evaluate(() => {
          const nextLink = document.querySelector('a.next, .nav-next a, a[rel="next"], .pagination .next');
          return nextLink ? (nextLink as HTMLAnchorElement).href : null;
        });

        if (hasNextPage) {
          console.log(`   Checking page 2 for ${category.label}...`);
          try {
            await page.goto(hasNextPage, { waitUntil: 'networkidle2', timeout: 30000 });
            // Re-extract from page 2 (same logic)
            const page2Events = await page.evaluate(() => {
              const events: Array<{
                title: string;
                url: string;
                dateText: string;
                description: string;
                imageUrl: string | null;
              }> = [];

              document.querySelectorAll('article, .x-box, li.item').forEach(card => {
                const linkEl = card.querySelector('a') as HTMLAnchorElement | null;
                const href = linkEl?.href || '';
                const titleEl = card.querySelector('h2, h3, h4, .title');
                const title = titleEl?.textContent?.trim() || '';
                if (!title || title.length < 3) return;
                const dateEl = card.querySelector('.date, time, [class*="date"]');
                const dateText = dateEl?.textContent?.trim() || '';
                const descEl = card.querySelector('.description, .excerpt, p');
                const description = descEl?.textContent?.trim() || '';
                const imgEl = card.querySelector('img');
                const imageUrl = imgEl?.src || null;
                events.push({ title, url: href, dateText, description, imageUrl });
              });
              return events;
            });

            for (const item of page2Events) {
              const titleKey = item.title.toLowerCase().trim();
              if (seenTitles.has(titleKey)) continue;
              if (shouldExcludeTitle(item.title)) continue;
              if (item.url && !isEventUrl(item.url)) continue;

              const { startDate: parsedStart, endDate: parsedEnd } = parseDateRange(item.dateText);
              const startDate = parsedStart || today;
              const endDate = parsedEnd;
              if (startDate < today && (!endDate || endDate < today)) continue;

              const eventUrl = item.url && !item.url.includes('/event-category/')
                ? item.url : `https://www.snfcc.org/ekdiloseis/`;

              seenTitles.add(titleKey);
              allEvents.push({
                id: generateEventId(item.title, startDate, 'ΚΠΙΣΝ'),
                title: item.title,
                description: item.description.substring(0, 500),
                start_date: startDate,
                end_date: endDate,
                time: '',
                type: category.type,
                genres: category.type === 'exhibition' ? 'visual-arts' : '',
                venue_name: 'ΚΠΙΣΝ',
                url: eventUrl,
                price_type: 'open',
                price_amount: 0,
                price_range: 'Δωρεάν',
                source: 'snfcc',
                location_status: 'verified_athens',
                image_url: item.imageUrl,
                opening_hours: category.type === 'exhibition' ? SNFCC_OPENING_HOURS : null,
                closed_days: null,
                permanent_collection: false
              });
            }
          } catch {
            console.log(`   Note: Could not load page 2 for ${category.label}`);
          }
        }

      } catch (err) {
        console.log(`   Error scraping ${category.label}: ${err}`);
        // Continue with other categories
      }
    }

    console.log(`   Found ${allEvents.length} events from category pages`);

    // PHASE 2: Scrape main events page for any events not found in categories
    console.log('   Scraping main events page (/ekdiloseis/)...');
    try {
      await page.goto('https://www.snfcc.org/ekdiloseis/', { waitUntil: 'networkidle2', timeout: 30000 });
      await page.waitForSelector('a[href*="/event/"]', { timeout: 10000 }).catch(() => {});

      const mainPageEvents = await page.evaluate(() => {
        const events: Array<{
          title: string;
          url: string;
          dateText: string;
          description: string;
          imageUrl: string | null;
        }> = [];

        document.querySelectorAll('a[href*="/event/"]').forEach(anchor => {
          const a = anchor as HTMLAnchorElement;
          const titleEl = a.querySelector('h2, h3, h4, .title') || a;
          const title = titleEl?.textContent?.trim() || '';
          if (!title || title.length < 3) return;

          const dateEl = a.querySelector('.date, time, [class*="date"]');
          const dateText = dateEl?.textContent?.trim() || '';
          const descEl = a.querySelector('.description, .excerpt, p');
          const description = descEl?.textContent?.trim() || '';
          const imgEl = a.querySelector('img');
          const imageUrl = imgEl?.src || null;

          events.push({ title, url: a.href, dateText, description, imageUrl });
        });
        return events;
      });

      let mainPageAdded = 0;
      for (const item of mainPageEvents) {
        const titleKey = item.title.toLowerCase().trim();
        if (seenTitles.has(titleKey)) continue;
        if (shouldExcludeTitle(item.title)) continue;
        if (item.url && !isEventUrl(item.url)) continue;

        const { startDate: parsedStart, endDate: parsedEnd } = parseDateRange(item.dateText);
        const startDate = parsedStart || today;
        const endDate = parsedEnd;
        if (startDate < today && (!endDate || endDate < today)) continue;

        // Keyword-based type detection (fallback — no category info from main page)
        let type: SNFCCEventType = 'performance';
        const text = (item.title + ' ' + item.description).toLowerCase();
        if (text.includes('έκθεση') || text.includes('exhibition')) type = 'exhibition';
        else if (text.includes('συναυλία') || text.includes('concert') || text.includes('μουσικ')) type = 'concert';
        else if (text.includes('κινηματογράφος') || text.includes('cinema') || text.includes('ταινί') || text.includes('προβολ')) type = 'cinema';
        else if (text.includes('εργαστήρι') || text.includes('workshop') || text.includes('σεμινάρι') ||
                 text.includes('γνωριμία') || text.includes('γνώσεις') || text.includes('μάθημα')) type = 'workshop';

        seenTitles.add(titleKey);
        allEvents.push({
          id: generateEventId(item.title, startDate, 'ΚΠΙΣΝ'),
          title: item.title,
          description: item.description.substring(0, 500),
          start_date: startDate,
          end_date: endDate,
          time: '',
          type,
          genres: type === 'exhibition' ? 'visual-arts' : type === 'cinema' ? 'film' : '',
          venue_name: 'ΚΠΙΣΝ',
          url: item.url,
          price_type: 'open',
          price_amount: 0,
          price_range: 'Δωρεάν',
          source: 'snfcc',
          location_status: 'verified_athens',
          image_url: item.imageUrl,
          opening_hours: type === 'exhibition' ? SNFCC_OPENING_HOURS : null,
          closed_days: null,
          permanent_collection: false
        });
        mainPageAdded++;
      }
      console.log(`   Added ${mainPageAdded} new events from main page (${mainPageEvents.length} total found)`);
    } catch (err) {
      console.log(`   Note: Could not load main events page: ${err}`);
    }

    console.log(`   Total: ${allEvents.length} events extracted`);

  } catch (error) {
    console.log(`   Error during scraping: ${error}`);
    throw error;
  } finally {
    if (browser) await browser.close();
  }

  return allEvents;
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
      location_status, image_url, image_source, needs_enrichment,
      created_at, updated_at,
      opening_hours, closed_days, permanent_collection
    ) VALUES (
      $id, $title, $description, $start_date, $end_date, $type, $genres,
      $venue_name, $url, $price_type, $price_amount, $price_range, $source,
      $location_status, $image_url, $image_source, 1, datetime('now'), datetime('now'),
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
      image_url = COALESCE($image_url, image_url),
      image_source = COALESCE($image_source, image_source),
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
        $start_date: normalizeDateField(e.start_date),
        $end_date: e.end_date ? normalizeDateField(e.end_date) : null,
        $type: e.type,
        $genres: e.genres,
        $venue_name: e.venue_name,
        $url: e.url,
        $price_type: e.price_type,
        $price_amount: e.price_amount,
        $price_range: e.price_range,
        $source: e.source,
        $location_status: e.location_status,
        $image_url: e.image_url,
        $image_source: e.image_url ? 'scraped_listing' : null,
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
  console.log('║  SNFCC Scraper - Events by Category                         ║');
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

    // Summary by type
    const typeCounts = new Map<string, number>();
    for (const e of events) {
      typeCounts.set(e.type, (typeCounts.get(e.type) || 0) + 1);
    }

    console.log('\n Results:');
    console.log(`   Total events: ${events.length}`);
    for (const [type, count] of typeCounts) {
      console.log(`   ${type}: ${count}`);
    }
    console.log(`   Duration: ${(duration / 1000).toFixed(1)}s`);

    if (!dryRun && events.length > 0) {
      console.log('\n Saving to database...');
      const saved = saveEvents(events, dryRun);
      console.log(`   Saved ${saved} events`);
    }

    // Print sample events
    if (events.length > 0) {
      console.log('\n Sample events:');
      events.slice(0, 8).forEach((e, i) => {
        console.log(`   ${i + 1}. [${e.type}] ${e.title}`);
        console.log(`      ${e.start_date}${e.end_date ? ' - ' + e.end_date : ''} | ${e.url.substring(0, 60)}`);
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
