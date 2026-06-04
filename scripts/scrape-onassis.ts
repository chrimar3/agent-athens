#!/usr/bin/env bun

/**
 * Onassis Stegi Event Scraper
 *
 * Scrapes the Onassis "What's On" listing (onassis.org/el/whats-on).
 * Uses Puppeteer (system Chrome) because the page is JS-rendered and blocks
 * direct requests. Parsing is a pure, testable function (`parseOnassisEvents`)
 * driven by precise selectors discovered in specs/onassis-rewrite-S164.md.
 *
 * The listing is mixed-type (exhibitions, cinema, music, theater, …). Type is
 * derived from the page's own Greek category label (authoritative), falling
 * back to the shared categorizer when the label is missing/unmapped. Dates are
 * "DD.MM[.YYYY] — DD.MM.YYYY" with an em-dash; see parseOnassisDateRange.
 */

import puppeteer from 'puppeteer';
import * as cheerio from 'cheerio';
import { upsertEvent } from '../src/db/database';
import { shouldExcludeEvent } from '../src/validators/scope-filter';
import { categorizeEventSimple } from '../src/categorizer';
import { log } from '../src/utils/logger';
import { createHash } from 'crypto';
import type { Event, EventType } from '../src/types';
import { SCHEMA_TYPE_MAP } from '../src/enrichment/quality-gates';

const SOURCE_ID = 'onassis';
const BASE_URL = 'https://www.onassis.org';
const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

// Onassis Stegi opening hours (only attached to exhibitions)
const ONASSIS_OPENING_HOURS = {
  'mon': 'closed',
  'tue': '11:00-20:00',
  'wed': '11:00-20:00',
  'thu': '11:00-20:00',
  'fri': '11:00-20:00',
  'sat': '11:00-20:00',
  'sun': '11:00-20:00'
};

interface ScrapedExhibition {
  title: string;
  description: string;
  start_date: string;
  end_date: string | null;
  url: string;
  image_url?: string;
  venue_name: string;
  price_type: 'open' | 'with-ticket';
  type: EventType;
  genres: string[];
}

function generateEventId(title: string, startDate: string): string {
  // NOTE: dedup identity key — OUT OF SCOPE (Defect 3, specs/onassis-dedup-S117-checkpoint.md).
  const normalized = `${title.toLowerCase().trim()}-${startDate}`;
  return createHash('md5').update(normalized).digest('hex').substring(0, 16);
}

/**
 * Map Onassis's explicit Greek category label to an EventType.
 * Mirrors scrape-megaron.ts:categoryToType — the page category is the most
 * authoritative type signal (the shared categorizer's keyword config has no
 * Greek terms). Unmapped/missing → 'other' (caller falls back to the categorizer).
 */
export function onassisCategoryToType(rawCategory: string): EventType {
  const c = (rawCategory || '').replace(/&amp;/g, '&').normalize('NFC').trim();
  switch (c) {
    case 'Έκθεση':                 return 'exhibition';
    case 'Κινηματογράφος':
    case 'Προβολές ταινιών':       return 'cinema';
    case 'Μουσική':
    case 'Συναυλία':
    case 'Όπερα':                  return 'concert';
    case 'Θέατρο':                 return 'theater';
    case 'Παράσταση':              return 'performance';
    case 'Χορός':                  return 'dance';
    case 'Εκπαιδευτικό πρόγραμμα':
    case 'Εργαστήριο':
    case 'Εκπαιδευτικά & Δράσεις':  return 'workshop';
    case 'Φεστιβάλ':               return 'festival';
    case 'Συζήτηση':
    case 'Διάλεξη':                return 'other';
    default:                       return 'other';
  }
}

function parseGreekDate(dateStr: string): string | null {
  // Parse "7 Μαρτίου 2026" or "7/3/2026" or "07.03.2026" → ISO YYYY-MM-DD
  const greekMonths: Record<string, number> = {
    'ιανουαρίου': 1, 'φεβρουαρίου': 2, 'μαρτίου': 3, 'απριλίου': 4,
    'μαΐου': 5, 'ιουνίου': 6, 'ιουλίου': 7, 'αυγούστου': 8,
    'σεπτεμβρίου': 9, 'οκτωβρίου': 10, 'νοεμβρίου': 11, 'δεκεμβρίου': 12,
    'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'may': 5, 'jun': 6,
    'jul': 7, 'aug': 8, 'sep': 9, 'oct': 10, 'nov': 11, 'dec': 12
  };

  // Greek format: "7 Μαρτίου 2026"
  const greekMatch = dateStr.match(/(\d{1,2})\s+(\S+)\s+(\d{4})/i);
  if (greekMatch) {
    const day = parseInt(greekMatch[1]);
    const monthStr = greekMatch[2].toLowerCase();
    const year = parseInt(greekMatch[3]);
    const month = greekMonths[monthStr];
    if (month) {
      return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
    }
  }

  // Numeric format: "7/3/2026" or "07.03.2026"
  const numMatch = dateStr.match(/(\d{1,2})[\/\.](\d{1,2})[\/\.](\d{4})/);
  if (numMatch) {
    const day = parseInt(numMatch[1]);
    const month = parseInt(numMatch[2]);
    const year = parseInt(numMatch[3]);
    return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
  }

  return null;
}

// Range separators seen on Onassis: em-dash (—, U+2014), en-dash (–), hyphen, "έως", "to".
const RANGE_SEP = /\s*(?:—|–|-|έως|to)\s*/i;

/**
 * Classify and parse an Onassis date cell into start/end ISO dates.
 *
 * Real formats (specs/onassis-rewrite-S164.md):
 *   "17.05 — 28.06.2026"     range, shared year (start lacks year → inherits end's)
 *   "14.10.2025 — 28.05.2026" range, both years (cross-year)
 *   "07.03.2026"             single date → end null
 *   "Ongoing" / unparseable  → {null, null} (caller skips; never fabricate an end)
 *
 * This replaces the old fallback that ran parseGreekDate() on the whole range
 * string and matched the LAST date, writing the END date into start_date (S117).
 */
export function parseOnassisDateRange(dateText: string): { start_date: string | null; end_date: string | null } {
  if (!dateText) return { start_date: null, end_date: null };

  // Defensive: strip Greek time tokens (μ.μ./π.μ.) if a time leaks into the cell.
  const cleaned = dateText.replace(/\d{1,2}([.:]\d{2})?\s*(μ\.μ\.|π\.μ\.)/gi, '').trim();

  const parts = cleaned.split(RANGE_SEP).map(s => s.trim()).filter(Boolean);

  if (parts.length >= 2) {
    let startRaw = parts[0];
    const endRaw = parts[parts.length - 1];
    const endYear = endRaw.match(/(\d{4})/)?.[1];
    // Shared-year range: inject the end's year into a year-less "DD.MM" start.
    if (endYear && !/\d{4}/.test(startRaw) && /^\d{1,2}[./]\d{1,2}$/.test(startRaw)) {
      startRaw = `${startRaw}.${endYear}`;
    }
    return { start_date: parseGreekDate(startRaw), end_date: parseGreekDate(endRaw) };
  }

  // Single date or open-ended → never fabricate an end.
  return { start_date: parseGreekDate(cleaned), end_date: null };
}

/**
 * Pure parser — extract events from rendered Onassis "What's On" HTML.
 * Precise selectors: event cards are `article.sm-col-28-18` (the `article.bg-white`
 * wrapper holds the page chrome / filter strings and is intentionally excluded).
 */
export function parseOnassisEvents(html: string): ScrapedExhibition[] {
  const $ = cheerio.load(html);
  const events: ScrapedExhibition[] = [];

  $('article.sm-col-28-18').each((_, el) => {
    const $card = $(el);
    const title = $card.find('h3').first().text().trim();
    if (!title || title.length <= 3) return;

    const primaryCategory = $card.find('p.blue').first().text().trim();
    const dateText = $card.find('time').first().text().trim();
    const desc = $card.find('p.dark-grey').first().text().trim();
    const href = $card.find('a[href]').first().attr('href') || '';
    const url = href.startsWith('http') ? href : `${BASE_URL}${href}`;

    const { start_date, end_date } = parseOnassisDateRange(dateText);
    if (!start_date) return; // no usable date → skip (never fabricate)

    // The page's own category label is authoritative. Fall back to the shared
    // categorizer only when missing/unmapped — Onassis is a "mixed venue", so
    // the fallback won't venue-lock to a wrong type.
    let type = onassisCategoryToType(primaryCategory);
    if (type === 'other') {
      type = categorizeEventSimple({
        title,
        description: desc,
        venue: 'Onassis Stegi',
        url,
        source: SOURCE_ID,
        currentType: 'other',
      });
    }

    // Genres: 'visual-arts' is correct for exhibitions. Non-exhibition genres are
    // intentionally left empty (the existing codebase norm, schema-safer than a
    // wrong blanket genre) pending GEO Strategist guidance — see the spec.
    const genres = type === 'exhibition' ? ['visual-arts'] : [];

    events.push({
      title,
      description: desc || 'Event at Onassis Stegi',
      start_date,
      end_date,
      url,
      venue_name: 'Onassis Stegi',
      price_type: 'with-ticket',
      type,
      genres,
    });
  });

  return events;
}

export async function scrapeOnassis(): Promise<ScrapedExhibition[]> {
  const startTime = Date.now();
  log('INFO', SOURCE_ID, 'Starting Onassis Stegi event scrape');

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: CHROME_PATH,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  let events: ScrapedExhibition[] = [];

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');

    // /el/exhibitions is dead (404); the listing lives at /el/whats-on.
    const urls = [
      `${BASE_URL}/el/whats-on`,
      `${BASE_URL}/onassis-stegi`,
    ];

    for (const url of urls) {
      try {
        log('INFO', SOURCE_ID, `Trying URL: ${url}`);
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });
        await page.waitForSelector('body', { timeout: 10000 });

        const html = await page.content();
        events = parseOnassisEvents(html);

        if (events.length > 0) break; // found real events, stop trying URLs
      } catch (err) {
        log('WARN', SOURCE_ID, `Failed to load ${url}: ${err}`);
      }
    }

    if (events.length === 0) {
      // Never fabricate. An empty scrape is a valid (logged) outcome.
      log('WARN', SOURCE_ID, 'Scrape returned 0 events');
    }
  } catch (error) {
    log('ERROR', SOURCE_ID, `Scrape failed: ${error}`);
  } finally {
    await browser.close();
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  log('INFO', SOURCE_ID, `Completed: ${events.length} events in ${duration}s`);

  return events;
}

/**
 * Save scraped events to the database.
 * Standalone path: applies the S117 scope-filter (the orchestrated scrape-all
 * path already does) so garbage can't slip through here either.
 */
export async function saveOnassisExhibitions(events: ScrapedExhibition[]): Promise<number> {
  let saved = 0;

  for (const exh of events) {
    const scope = shouldExcludeEvent({
      title: exh.title,
      venue: exh.venue_name,
      description: exh.description,
      url: exh.url,
    });
    if (!scope.inScope) {
      log('WARN', SOURCE_ID, `Excluded by scope-filter (${scope.reason}): ${exh.title}`);
      continue;
    }

    const event: Event = {
      // Schema/enrichment fields the DB mapper derives on read (rowToEvent);
      // set here to explicit scrape-time defaults — never fabricated values.
      "@context": 'https://schema.org',
      "@type": SCHEMA_TYPE_MAP[exh.type] || 'Event',
      hasNativeGreek: false,        // no Greek description exists at scrape time
      ticketUrlResolved: null,      // "not yet resolved" must be explicit null (D11)
      language: 'en',               // mirrors rowToEvent: 'en' when no descriptions yet
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      id: generateEventId(exh.title, exh.start_date),
      title: exh.title,
      description: exh.description,
      startDate: exh.start_date,
      endDate: exh.end_date || undefined,
      type: exh.type,
      genres: exh.genres,
      tags: [],
      venue: {
        name: exh.venue_name,
        address: 'Λεωφ. Συγγρού 107, Αθήνα',
        neighborhood: 'Κουκάκι'
      },
      price: {
        type: exh.price_type,
        currency: 'EUR'
      },
      url: exh.url,
      source: SOURCE_ID,
      locationStatus: 'verified_athens',
      // Exhibition-specific fields only when the event is actually an exhibition.
      ...(exh.type === 'exhibition'
        ? { openingHours: ONASSIS_OPENING_HOURS, permanentCollection: false }
        : {}),
    };

    try {
      upsertEvent(event);
      saved++;
      log('INFO', SOURCE_ID, `Saved [${event.type}]: ${event.title}`);
    } catch (error) {
      log('ERROR', SOURCE_ID, `Failed to save ${event.title}: ${error}`);
    }
  }

  return saved;
}

// Run as standalone script
if (import.meta.main) {
  const dryRun = Bun.argv.includes('--dry-run');

  console.log('🏛️  Onassis Stegi Event Scraper' + (dryRun ? ' (DRY RUN)' : ''));
  console.log('====================================\n');

  const events = await scrapeOnassis();

  console.log(`\n📊 Found ${events.length} events`);

  if (events.length > 0) {
    console.log('\nEvents:');
    for (const e of events) {
      console.log(`  - [${e.type}] ${e.title} (${e.start_date} → ${e.end_date ?? 'open-ended'})`);
    }
  }

  if (dryRun) {
    console.log('\n🟡 DRY RUN — nothing saved to the database.');
  } else if (events.length > 0) {
    console.log('\n💾 Saving to database...');
    const saved = await saveOnassisExhibitions(events);
    console.log(`✅ Saved ${saved} events`);
  }
}

export { ScrapedExhibition };
