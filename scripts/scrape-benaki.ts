#!/usr/bin/env bun

/**
 * Benaki Museum Exhibition Scraper
 *
 * Scrapes exhibitions from Benaki Museum (benaki.org)
 * Uses Puppeteer because the site uses dynamic loading
 */

import puppeteer from 'puppeteer';
import { upsertEvent, getDatabase } from '../src/db/database';
import { log } from '../src/utils/logger';
import { createHash } from 'crypto';
import type { Event } from '../src/types';
import { SCHEMA_TYPE_MAP } from '../src/enrichment/quality-gates';
import type { DomDocument } from './dom-eval-types';
import { chromeLaunchArgs, CHROME_IGNORE_DEFAULT_ARGS } from './lib/chrome-path';
import { guardPageRequests } from '../src/utils/outbound-url';
import { ListingLoads, loadListing } from '../src/utils/listing-loads';

// Browser surface for page.evaluate() callbacks — module-local on purpose;
// see scripts/dom-eval-types.ts for why this project compiles without lib.dom.
declare const document: DomDocument;

const SOURCE_ID = 'benaki';
const BASE_URL = 'https://www.benaki.org';

// Benaki Museum locations and their opening hours
const BENAKI_VENUES: Record<string, { name: string; address: string; neighborhood: string; hours: Record<string, string> }> = {
  'greek-culture': {
    name: 'Μουσείο Μπενάκη Ελληνικού Πολιτισμού',
    address: 'Κουμπάρη 1, Αθήνα',
    neighborhood: 'Κολωνάκι',
    hours: { 'mon': 'closed', 'tue': 'closed', 'wed': '10:00-18:00', 'thu': '10:00-00:00', 'fri': '10:00-18:00', 'sat': '10:00-18:00', 'sun': '10:00-16:00' }
  },
  'pireos': {
    name: 'Μουσείο Μπενάκη - Πειραιώς 138',
    address: 'Πειραιώς 138, Αθήνα',
    neighborhood: 'Γκάζι',
    hours: { 'mon': 'closed', 'tue': 'closed', 'wed': '10:00-18:00', 'thu': '10:00-22:00', 'fri': '10:00-18:00', 'sat': '10:00-18:00', 'sun': '10:00-16:00' }
  },
  'islamic': {
    name: 'Μουσείο Ισλαμικής Τέχνης',
    address: 'Αγ. Ασωμάτων 22, Αθήνα',
    neighborhood: 'Κεραμεικός',
    hours: { 'mon': 'closed', 'tue': 'closed', 'wed': '10:00-17:00', 'thu': '10:00-21:00', 'fri': '10:00-17:00', 'sat': '10:00-17:00', 'sun': '10:00-17:00' }
  }
};

interface ScrapedExhibition {
  title: string;
  description: string;
  start_date: string;
  end_date: string | null;
  url: string;
  venue_key: string;
  price_type: 'open' | 'with-ticket';
}

function generateEventId(title: string, startDate: string): string {
  const normalized = `${title.toLowerCase().trim()}-${startDate}`;
  return createHash('md5').update(normalized).digest('hex').substring(0, 16);
}

function parseDate(dateStr: string): string | null {
  // Parse dates like "22/01/2026" or "22.01.2026" or "22 Ιανουαρίου 2026"
  const greekMonths: Record<string, number> = {
    'ιανουαρίου': 1, 'φεβρουαρίου': 2, 'μαρτίου': 3, 'απριλίου': 4,
    'μαΐου': 5, 'ιουνίου': 6, 'ιουλίου': 7, 'αυγούστου': 8,
    'σεπτεμβρίου': 9, 'οκτωβρίου': 10, 'νοεμβρίου': 11, 'δεκεμβρίου': 12
  };

  // Numeric format: "22/01/2026" or "22.01.2026"
  const numMatch = dateStr.match(/(\d{1,2})[\/\.](\d{1,2})[\/\.](\d{4})/);
  if (numMatch) {
    const day = parseInt(numMatch[1]);
    const month = parseInt(numMatch[2]);
    const year = parseInt(numMatch[3]);
    return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
  }

  // Greek format: "22 Ιανουαρίου 2026"
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

  return null;
}

export async function scrapeBenaki(): Promise<ScrapedExhibition[]> {
  const startTime = Date.now();
  log('INFO', SOURCE_ID, 'Starting Benaki Museum exhibition scrape');

  const browser = await puppeteer.launch({
    headless: true,
    ignoreDefaultArgs: [...CHROME_IGNORE_DEFAULT_ARGS],
    args: chromeLaunchArgs()
  });

  const exhibitions: ScrapedExhibition[] = [];

  try {
    const page = await browser.newPage();
    await guardPageRequests(page); // page scripts: no local/private targets
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');

    // Try the exhibitions page
    const url = `${BASE_URL}/index.php?option=com_landings&view=search&section=events&Itemid=601&lang=el`;
    log('INFO', SOURCE_ID, `Loading: ${url}`);

    const loads = new ListingLoads(SOURCE_ID);
    if (await loadListing(page, url, loads, { waitUntil: 'networkidle2', timeout: 30000 })) try {
      await page.waitForSelector('body', { timeout: 10000 });

      // Extract exhibition data
      const pageData = await page.evaluate(() => {
        const results: any[] = [];

        // Look for exhibition items
        const items = document.querySelectorAll('.event-item, .exhibition-item, article, .card, [class*="event"]');

        items.forEach(item => {
          const titleEl = item.querySelector('h2, h3, .title, a[class*="title"]');
          const dateEl = item.querySelector('.date, [class*="date"], .period');
          const linkEl = item.querySelector('a[href*="event"]');
          const descEl = item.querySelector('p, .description, .excerpt');
          const venueEl = item.querySelector('.venue, .location, [class*="location"]');

          if (titleEl) {
            results.push({
              title: titleEl.textContent?.trim() || '',
              dateText: dateEl?.textContent?.trim() || '',
              link: linkEl?.getAttribute('href') || '',
              desc: descEl?.textContent?.trim() || '',
              venue: venueEl?.textContent?.trim() || ''
            });
          }
        });

        return results;
      });

      for (const item of pageData) {
        if (item.title && item.title.length > 3) {
          // Parse date range (e.g., "22/01/2026 - 28/03/2026")
          let startDate = null;
          let endDate = null;

          const dateRangeMatch = item.dateText?.match(/(\d{1,2}[\/\.]\d{1,2}[\/\.]\d{4})\s*[-–]\s*(\d{1,2}[\/\.]\d{1,2}[\/\.]\d{4})/);
          if (dateRangeMatch) {
            startDate = parseDate(dateRangeMatch[1]);
            endDate = parseDate(dateRangeMatch[2]);
          }

          // Determine venue
          let venueKey = 'greek-culture';
          const venueText = (item.venue || item.title).toLowerCase();
          if (venueText.includes('πειραιώς') || venueText.includes('138')) {
            venueKey = 'pireos';
          } else if (venueText.includes('ισλαμ')) {
            venueKey = 'islamic';
          }

          if (startDate) {
            exhibitions.push({
              title: item.title,
              description: item.desc || `Exhibition at Benaki Museum`,
              start_date: startDate,
              end_date: endDate,
              url: item.link?.startsWith('http') ? item.link : `${BASE_URL}${item.link}`,
              venue_key: venueKey,
              price_type: 'with-ticket'
            });
          }
        }
      }
    } catch (err) {
      log('WARN', SOURCE_ID, `Failed to read page: ${err}`);
    }
    loads.assertAnyLoaded();

    if (exhibitions.length === 0) {
      // Never fabricate (Tier 1, S164): an empty parse is a logged outcome, not a cue for placeholder rows.
      log('WARN', SOURCE_ID, 'Page loaded but 0 exhibitions parsed — the selectors may no longer match benaki.org');
    }

  } catch (error) {
    // Errors propagate: scrape-all records success=0 + the cause.
    log('ERROR', SOURCE_ID, `Scrape failed: ${error}`);
    throw error;
  } finally {
    await browser.close();
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  log('INFO', SOURCE_ID, `Completed: ${exhibitions.length} exhibitions in ${duration}s`);

  return exhibitions;
}

/**
 * Save scraped exhibitions to database
 */
export async function saveBenakiExhibitions(exhibitions: ScrapedExhibition[]): Promise<number> {
  let saved = 0;

  for (const exh of exhibitions) {
    const venueInfo = BENAKI_VENUES[exh.venue_key] || BENAKI_VENUES['greek-culture'];

    const event: Event = {
      // Schema/enrichment fields the DB mapper derives on read (rowToEvent);
      // set here to explicit scrape-time defaults — never fabricated values.
      "@context": 'https://schema.org',
      "@type": SCHEMA_TYPE_MAP['exhibition'] || 'Event',
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
      type: 'exhibition',
      genres: ['visual-arts'],
      tags: [],
      venue: {
        name: venueInfo.name,
        address: venueInfo.address,
        neighborhood: venueInfo.neighborhood
      },
      price: {
        type: exh.price_type,
        currency: 'EUR'
      },
      url: exh.url,
      source: SOURCE_ID,
      locationStatus: 'verified_athens',
      openingHours: venueInfo.hours,
      permanentCollection: false
    };

    try {
      upsertEvent(event);
      saved++;
      log('INFO', SOURCE_ID, `Saved: ${event.title}`);
    } catch (error) {
      log('ERROR', SOURCE_ID, `Failed to save ${event.title}: ${error}`);
    }
  }

  return saved;
}

// Run as standalone script
if (import.meta.main) {
  console.log('🏛️  Benaki Museum Exhibition Scraper');
  console.log('====================================\n');

  const exhibitions = await scrapeBenaki();

  console.log(`\n📊 Found ${exhibitions.length} exhibitions`);

  if (exhibitions.length > 0) {
    console.log('\nExhibitions:');
    for (const exh of exhibitions) {
      const venue = BENAKI_VENUES[exh.venue_key]?.name || exh.venue_key;
      console.log(`  - ${exh.title}`);
      console.log(`    ${exh.start_date} to ${exh.end_date || 'ongoing'} @ ${venue}`);
    }

    console.log('\n💾 Saving to database...');
    const saved = await saveBenakiExhibitions(exhibitions);
    console.log(`✅ Saved ${saved} exhibitions`);
  }
}

export { ScrapedExhibition };
