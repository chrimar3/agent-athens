#!/usr/bin/env bun
/**
 * 🏛️ Agent Athens - Master Scraper
 * "One scraper to rule them all"
 *
 * Scrapes events from all configured sources:
 * - more.com (ticketing platform)
 * - athinorama.gr (cultural guide)
 * - clubber.gr (electronic/clubs - iCal)
 * - ticketservices.gr (concerts/theater)
 * - halfnote.gr (jazz club - iCal)
 * - residentadvisor (electronic - GraphQL API)
 * - megaron.gr (Athens Concert Hall - classical)
 * - onassis (Onassis Stegi exhibitions)
 * - benaki (Benaki Museum exhibitions)
 *
 * Usage:
 *   bun run scripts/scrape-all.ts                    # Scrape all sources
 *   bun run scripts/scrape-all.ts --dry-run          # Don't save to DB
 *   bun run scripts/scrape-all.ts --source more      # Only scrape more.com
 *   bun run scripts/scrape-all.ts --source clubber,ra # Multiple sources
 *   bun run scripts/scrape-all.ts --crossref         # Also run price cross-reference
 */

import { Database } from 'bun:sqlite';
import { normalizeDateField } from '../src/utils/date-format';
import { normalizePriceType, normalizeGenres } from '../src/db/database';
import { join } from 'path';
import { loadQuarantine, filterQuarantined } from '../src/utils/quarantine';
import { createHash } from 'crypto';
import puppeteer from 'puppeteer-core';
import { scrapeSNFCC, ScrapedExhibition } from './scrape-snfcc';
import { scrapeOnassis, ScrapedExhibition as OnassisExhibition } from './scrape-onassis';
import { scrapeBenaki, ScrapedExhibition as BenakiExhibition } from './scrape-benaki';
import { scrapeMegaron } from './scrape-megaron';
import { log, logSummary, type SourceStats } from '../src/utils/logger';
import { shouldExcludeEvent } from '../src/validators/scope-filter';
import { validateSeasonalEvent } from '../src/validators/seasonal-filter';
import { categorizeEventSimple } from '../src/categorizer';
import { normalizeTheaterSpelling } from '../src/validators/event-categorizer';
import { extractOgImage } from '../src/utils/image-extractor';
import { upgradeAthinoramaImage } from '../src/utils/athinorama-image';
import type { DomDocument, DomElement } from './dom-eval-types';
import { ACTIVE_SOURCE_IDS } from '../src/config/active-source-ids';
import { checkImportDuplicate } from '../src/quality/import-gate';
import type { Event } from '../src/types';

// Browser surface for page.evaluate() callbacks — module-local on purpose;
// see scripts/dom-eval-types.ts for why this project compiles without lib.dom.
declare const document: DomDocument;
type HTMLElement = DomElement;

const DB_PATH = join(import.meta.dir, '../data/events.db');
const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

// ============================================================================
// TYPES
// ============================================================================

interface ScrapedEvent {
  id: string;
  title: string;
  description: string;
  start_date: string;
  end_date?: string | null;
  time: string;
  type: string;
  genres: string;
  venue_name: string;
  url: string;
  price_type: string;
  price_amount: number | null;
  price_range: string | null;
  source: string;
  location_status?: string;
  image_url?: string | null;
  ticket_url_status?: string;
}

interface ScrapeResult {
  source: string;
  events: ScrapedEvent[];
  success: boolean;
  error?: string;
  duration: number;
}

// SourceId is derived from the canonical id list (src/config/active-source-ids.ts)
// so SOURCES (Record<SourceId, …>) and the colophon's source count cannot drift
// — divergence is a compile error. Adding a scraper: add its id there first.
type SourceId = typeof ACTIVE_SOURCE_IDS[number];

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function generateEventId(title: string, date: string, venue: string): string {
  const normalized = `${title.toLowerCase().trim()}|${date}|${venue.toLowerCase().trim()}`;
  return createHash('md5').update(normalized).digest('hex').substring(0, 16);
}

function decodeWindows1253(buffer: ArrayBuffer): string {
  // bun-types' Encoding union omits 'windows-1253', but the Bun runtime
  // supports it (decodes Greek ICS feeds in production daily). The directive
  // below self-reports as unused when bun-types widens the union.
  // @ts-expect-error -- narrow bun-types Encoding union; runtime-verified
  const decoder = new TextDecoder('windows-1253');
  return decoder.decode(buffer);
}

function unescapeICalText(text: string): string {
  return text
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\n/g, '\n')
    .replace(/\\\\/g, '\\');
}

function parseICalDate(dateStr: string): { date: string; time: string } {
  const match = dateStr.match(/(\d{8})T(\d{6})/);
  if (!match) return { date: '', time: '' };
  const [, datePart, timePart] = match;
  const date = `${datePart.slice(0, 4)}-${datePart.slice(4, 6)}-${datePart.slice(6, 8)}`;
  const time = `${timePart.slice(0, 2)}:${timePart.slice(2, 4)}`;
  return { date, time };
}

// ============================================================================
// HTTP/1.1 FALLBACK UTILITY
// ============================================================================

/**
 * Fetch with HTTP/1.1 fallback for sites with HTTP/2 stream issues (like More.com)
 * Tries standard fetch first, falls back to curl with --http1.1 on failure
 */
async function fetchWithHttp1Fallback(url: string, options: {
  headers?: Record<string, string>;
  maxRetries?: number;
  timeoutMs?: number;
} = {}): Promise<{ ok: boolean; text: () => Promise<string>; status: number }> {
  const { headers = {}, maxRetries = 2, timeoutMs = 30000 } = options;

  // Add default User-Agent if not provided
  const defaultHeaders = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    ...headers
  };

  // Try standard fetch first
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Add timeout using AbortController
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(url, {
        headers: defaultHeaders,
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      return {
        ok: response.ok,
        text: () => response.text(),
        status: response.status
      };
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const isHttp2Error = errorMsg.includes('HTTP/2') ||
                           errorMsg.includes('stream') ||
                           errorMsg.includes('INTERNAL_ERROR');
      const isTimeout = errorMsg.includes('abort') || errorMsg.includes('timeout');

      // If HTTP/2 error or timeout on last attempt, try curl with --http1.1
      if ((isHttp2Error || isTimeout) && attempt === maxRetries) {
        console.log(`   ⚠️ HTTP/2 error, falling back to HTTP/1.1 for: ${url.substring(0, 60)}...`);
        try {
          const curlHeaders = Object.entries(defaultHeaders)
            .map(([k, v]) => `-H "${k}: ${v}"`)
            .join(' ');

          const proc = Bun.spawn(['curl', '-s', '--http1.1', '--max-time', '30', '-H', `User-Agent: ${defaultHeaders['User-Agent']}`, url], {
            stdout: 'pipe',
            stderr: 'pipe'
          });

          const text = await new Response(proc.stdout).text();
          const exitCode = await proc.exited;

          if (exitCode === 0 && text.length > 0) {
            return {
              ok: true,
              text: async () => text,
              status: 200
            };
          }
        } catch (curlError) {
          console.log(`   ❌ Curl fallback also failed: ${curlError}`);
        }
      }

      // Add delay between retries
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
  }

  // All attempts failed
  return { ok: false, text: async () => '', status: 0 };
}

/**
 * Fetch using curl directly (for sites where HTTP/2 is completely broken)
 * Faster than fetchWithHttp1Fallback since it skips the failing fetch attempts
 */
async function fetchWithCurl(url: string): Promise<{ ok: boolean; text: () => Promise<string>; status: number }> {
  try {
    const proc = Bun.spawn([
      'curl', '-s', '--http1.1', '--max-time', '15',
      '-H', 'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      url
    ], {
      stdout: 'pipe',
      stderr: 'pipe'
    });

    const text = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    if (exitCode === 0 && text.length > 0) {
      return {
        ok: true,
        text: async () => text,
        status: 200
      };
    }
  } catch (error) {
    // Curl failed
  }

  return { ok: false, text: async () => '', status: 0 };
}

// ============================================================================
// MORE.COM SCRAPER
// ============================================================================

async function scrapeMore(): Promise<ScrapedEvent[]> {
  console.log('   Fetching more.com categories...');
  const events: ScrapedEvent[] = [];
  const categories = ['music', 'theatre'];
  const today = new Date().toISOString().split('T')[0];

  for (const category of categories) {
    const url = `https://www.more.com/gr-el/tickets/${category}/`;
    try {
      // Use curl directly for More.com (HTTP/2 is consistently broken)
      const response = await fetchWithCurl(url);
      if (!response.ok) continue;

      const html = await response.text();

      // Extract event links from listing
      const linkPattern = /href="(\/gr-el\/tickets\/(?:music|theatre|theater)\/[a-z0-9-]+\/)"/gi;
      const links = new Set<string>();
      let match;
      while ((match = linkPattern.exec(html)) !== null) {
        // Skip category pages and special pages
        if (!match[1].includes('/city/') && !match[1].includes('/offers/') && !match[1].includes('/new-events/')) {
          links.add(`https://www.more.com${match[1]}`);
        }
      }

      console.log(`   Found ${links.size} ${category} events`);

      // Process first 20 events per category (to avoid rate limits)
      let count = 0;
      let processed = 0;
      for (const eventUrl of links) {
        if (count >= 20) break;
        count++;

        try {
          // Use curl directly for More.com event pages (HTTP/2 is broken)
          if (processed % 5 === 0) {
            console.log(`   ... processing event ${processed + 1}/20`);
          }
          processed++;
          const eventResponse = await fetchWithCurl(eventUrl);
          if (!eventResponse.ok) continue;

          const eventHtml = await eventResponse.text();

          // Extract title from og:title or <title>
          const titleMatch = eventHtml.match(/og:title"\s+content="([^"|]+)/);
          const title = titleMatch ? titleMatch[1].replace(/\s*\|.*$/, '').trim() : null;
          if (!title) continue;

          // Extract venue from "venue-name":"..."
          const venueMatch = eventHtml.match(/"venue-name":"([^"]+)"/);
          const venueName = venueMatch ? venueMatch[1] : 'TBA';

          // Extract all dates (YYYY-MM-DD format)
          const dateMatches = eventHtml.match(/\b(202[5-7]-\d{2}-\d{2})\b/g);
          const futureDates = dateMatches
            ? [...new Set(dateMatches)].filter(d => d >= today).sort()
            : [];

          if (futureDates.length === 0) continue;

          // Extract price from "prices":"<span class='money'>XX€</span>"
          const priceMatch = eventHtml.match(/"prices":"[^"]*?(\d+)€/);
          const price = priceMatch ? parseInt(priceMatch[1]) : null;
          const priceRange = price ? `€${price}` : null;

          // Extract time from ISO datetime patterns (e.g., "2026-02-10T21:00:00")
          let eventTime = '';
          const isoTimeMatch = eventHtml.match(new RegExp(futureDates[0] + 'T(\\d{2}):(\\d{2})'));
          if (isoTimeMatch) {
            const h = parseInt(isoTimeMatch[1]), m = parseInt(isoTimeMatch[2]);
            if (h !== 0 || m !== 0) {
              eventTime = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
            }
          }
          // Fallback: JSON-LD startDate
          if (!eventTime) {
            const jsonLdTime = eventHtml.match(/"startDate"\s*:\s*\[?"?\d{4}-\d{2}-\d{2}T(\d{2}):(\d{2})/);
            if (jsonLdTime) {
              const h = parseInt(jsonLdTime[1]), m = parseInt(jsonLdTime[2]);
              if (h !== 0 || m !== 0) {
                eventTime = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
              }
            }
          }

          // Create event for first future date
          const startDate = futureDates[0];
          events.push({
            id: generateEventId(title, startDate, venueName),
            title,
            description: '',
            start_date: startDate,
            time: eventTime,
            type: category === 'music' ? 'concert' : category,
            genres: '',
            venue_name: venueName,
            url: eventUrl,
            price_type: price ? 'with-ticket' : 'tba',
            price_amount: price,
            price_range: priceRange,
            source: 'more.com'
          });

          await new Promise(r => setTimeout(r, 500)); // Rate limit
        } catch (e) {
          processed++;
          /* Event fetch error - continue to next */
        }
      }
      console.log(`   ✓ Processed ${processed} ${category} events, extracted ${events.length} valid`);
    } catch (e) {
      console.log(`   ⚠️ Error fetching ${category}: ${e}`);
    }
  }

  return events;
}

// ============================================================================
// ATHINORAMA SCRAPER
// ============================================================================

/**
 * Fetch with retry and exponential backoff for Athinorama
 * Returns null on complete failure (graceful degradation)
 */
async function fetchWithRetryAthinorama(url: string, maxRetries = 3): Promise<string | null> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15_000);

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        }
      });
      clearTimeout(timeoutId);

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.text();
    } catch (err: any) {
      const delay = Math.pow(2, attempt) * 1000;  // 2s, 4s, 8s
      console.warn(`   ⚠️ Attempt ${attempt}/${maxRetries} failed: ${err.message}`);
      if (attempt < maxRetries) {
        console.log(`   Retrying in ${delay}ms...`);
        await Bun.sleep(delay);
      }
    }
  }
  console.error(`   ❌ All ${maxRetries} attempts failed for ${url}`);
  return null;  // Graceful failure
}

/**
 * Extract the main poster image from an athinorama event page body.
 * Athinorama's og:image (/lmnts/events/) returns HTTP 502, but
 * /Content/ImagesDatabase/p/{250x300|300x380}/ URLs work.
 */
function extractAthinoramaBodyImage(html: string): string | null {
  const pattern = /https?:\/\/www\.athinorama\.gr\/Content\/ImagesDatabase\/p\/(?:250x300|300x380)\/crop\/both\/[a-f0-9\/]+\.jpg[^"'\s]*/i;
  const match = html.match(pattern);
  if (!match) return null;
  let url = match[0].split('"')[0].split("'")[0];
  url = url.replace(/&amp;/g, '&');
  return url;
}

/**
 * Extract time from an Athinorama detail page HTML.
 * Mirrors the 9 patterns from enrich-time.ts extractTimeAthinorama(),
 * but inlined here to avoid a second HTTP fetch.
 */
function extractTimeFromAthinoramaPage(html: string): string | null {
  // Pattern 1: startTime="21:00" (most reliable — theater/music structured data)
  const startTimeMatch = html.match(/startTime="(\d{2}):(\d{2})"/);
  if (startTimeMatch) {
    const h = parseInt(startTimeMatch[1]), m = parseInt(startTimeMatch[2]);
    if (h >= 0 && h <= 23) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  // Pattern 2: <time datetime="2026-02-10T21:00:00">
  const timeElMatch = html.match(/<time\s+datetime="\d{4}-\d{2}-\d{2}T(\d{2}):(\d{2})(?::\d{2})?"/);
  if (timeElMatch) {
    const h = parseInt(timeElMatch[1]), m = parseInt(timeElMatch[2]);
    if (h !== 0 || m !== 0) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  // Pattern 3: "Ώρα:" or "Ώρα έναρξης:" followed by time
  const greekMatch = html.match(/[Ωώ]ρα(?:\s+[έε]ναρξης)?:?\s*(\d{1,2})[:\.](\d{2})/i);
  if (greekMatch) {
    const h = parseInt(greekMatch[1]), m = parseInt(greekMatch[2]);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  // Pattern 4: JSON-LD "startDate": "2026-02-10T21:00:00"
  const jsonLdMatch = html.match(/"startDate"\s*:\s*"\d{4}-\d{2}-\d{2}T(\d{2}):(\d{2})(?::\d{2})?"/);
  if (jsonLdMatch) {
    const h = parseInt(jsonLdMatch[1]), m = parseInt(jsonLdMatch[2]);
    if (h !== 0 || m !== 0) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  // Pattern 5: Greek PM — <span class="time">Τετ. 9.30 μ.μ.</span>
  const pmMatch = html.match(/<span class="time">[^<]*?(\d{1,2})(?:\.(\d{2}))?\s*μ\.μ\./i);
  if (pmMatch) {
    let h = parseInt(pmMatch[1]);
    const m = pmMatch[2] ? parseInt(pmMatch[2]) : 0;
    if (h < 12) h += 12;
    if (h >= 12 && h <= 23) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  // Pattern 6: Greek AM — <span class="time">11 π.μ.</span>
  const amMatch = html.match(/<span class="time">[^<]*?(\d{1,2})(?:\.(\d{2}))?\s*π\.μ\./i);
  if (amMatch) {
    const h = parseInt(amMatch[1]), m = amMatch[2] ? parseInt(amMatch[2]) : 0;
    if (h >= 0 && h <= 23) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  return null;
}

export interface TheaterDateRange {
  startDate: string | null;
  endDate: string | null;
}

/**
 * Parse an athinorama theater-guide card's date range (S-F2a).
 * Card markup carries "Πρεμιέρα: </strong>DD/MM" and/or "Εως: </strong>DD/MM";
 * years are inferred relative to refDate (months behind the current month roll
 * into next year). Exported pure for fixture tests. The Greek strings here are
 * athinorama's source HTML labels, not our data vocabulary — our run-end token
 * lives in config/parsing-tokens.json.
 */
export function parseTheaterDateRange(card: string, refDate: Date): TheaterDateRange {
  const currentYear = refDate.getFullYear();
  const currentMonth = refDate.getMonth() + 1;
  const today = refDate.toISOString().split('T')[0];

  let startDate: string | null = null;
  let endDate: string | null = null;

  // Theater page format: "Εως: </strong>DD/MM" - date is AFTER the closing tag
  // Pattern 1: "Πρεμιέρα: </strong>DD/MM" followed by "Εως: </strong>DD/MM"
  const premiereMatch = card.match(/Πρεμιέρα:?\s*<\/strong>\s*(\d{1,2})\/(\d{1,2})/i);
  // Pattern 2: "Εως: </strong>DD/MM" (ongoing show with end date)
  const untilMatch = card.match(/Εως:?\s*<\/strong>\s*(\d{1,2})\/(\d{1,2})/i);

  if (premiereMatch && untilMatch) {
    // Both premiere and end date
    const [, startDay, startMonth] = premiereMatch;
    const [, endDay, endMonth] = untilMatch;
    let startYear = currentYear;
    let endYear = currentYear;

    const sm = parseInt(startMonth);
    const em = parseInt(endMonth);

    if (sm < currentMonth) startYear++;
    if (em < currentMonth || (em < sm && startYear === currentYear)) endYear++;

    startDate = `${startYear}-${String(sm).padStart(2, '0')}-${String(parseInt(startDay)).padStart(2, '0')}`;
    endDate = `${endYear}-${String(em).padStart(2, '0')}-${String(parseInt(endDay)).padStart(2, '0')}`;
  } else if (untilMatch) {
    // Ongoing show - use today as start, parse end
    const [, endDay, endMonth] = untilMatch;
    let endYear = currentYear;
    const em = parseInt(endMonth);
    if (em < currentMonth) endYear++;

    startDate = today; // Already running
    endDate = `${endYear}-${String(em).padStart(2, '0')}-${String(parseInt(endDay)).padStart(2, '0')}`;
  } else if (premiereMatch) {
    // Premiere - single performance
    const [, day, month] = premiereMatch;
    const d = parseInt(day);
    const m = parseInt(month);
    let year = currentYear;
    if (m < currentMonth || (m === currentMonth && d < refDate.getDate())) {
      year++;
    }
    startDate = `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  return { startDate, endDate };
}

async function scrapeAthinorama(): Promise<ScrapedEvent[]> {
  console.log('   Fetching athinorama.gr guides...');

  // Load mixed venues so we don't hardcode type for venues that host multiple event types
  const fs = require('fs');
  const venueConfigPath = join(import.meta.dir, '../config/venue-categories.json');
  const mixedVenues: string[] = JSON.parse(fs.readFileSync(venueConfigPath, 'utf-8')).mixed_venues || [];
  const mixedVenuesLower = mixedVenues.map((v: string) => v.toLowerCase().trim());

  // Early connectivity test before processing
  const testPage = await fetchWithRetryAthinorama('https://www.athinorama.gr/music/guide');
  if (!testPage) {
    console.warn('   ⚠️ Athinorama unreachable — skipping source');
    return [];  // Exit clean, don't crash pipeline
  }
  const events: ScrapedEvent[] = [];
  // Now includes theater with date range support
  const guides = [
    { url: 'https://www.athinorama.gr/music/guide', type: 'concert', hasDateRanges: false, cachedHtml: testPage },
    { url: 'https://www.athinorama.gr/theatre/guide', type: 'theater', hasDateRanges: true, cachedHtml: null as string | null },
  ];
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const today = now.toISOString().split('T')[0];

  for (const guide of guides) {
    try {
      // Use cached HTML from connectivity test or fetch with retry
      const html = guide.cachedHtml || await fetchWithRetryAthinorama(guide.url);
      if (!html) {
        console.warn(`   ⚠️ Failed to fetch ${guide.type} guide, skipping`);
        continue;
      }

      // Extract event cards - athinorama uses div.item.horizontal-dt.card-item
      const eventPattern = /<div class="item\s+horizontal-dt card-item">([\s\S]*?)(?=<div class="item\s+horizontal-dt card-item">|<div class="item adv-banner">|<\/div>\s*<\/div>\s*<\/div>\s*$)/gi;
      let match;
      let count = 0;

      // Remove the count < 40 limit - fetch ALL events
      while ((match = eventPattern.exec(html)) !== null) {
        const card = match[1];

        // Extract title from h2.item-title > a
        const titleMatch = card.match(/<h2 class="item-title[^"]*">\s*<a href="([^"]+)">([^<]+)<\/a>/i);
        if (!titleMatch) continue;
        const eventUrl = titleMatch[1];
        const title = titleMatch[2].trim();

        // Extract venue from nested h4 > a with /halls/ in href
        const venueMatch = card.match(/<h4><a href="[^"]*\/halls\/[^"]*">\s*([^<]+)<\/a><\/h4>/i);
        const venue = venueMatch ? venueMatch[1].trim() : 'TBA';

        // For theater: handle date ranges like "17/12 - Εως: 25/01" or "Εως 25/01"
        let startDate: string | null = null;
        let endDate: string | null = null;

        if (guide.hasDateRanges) {
          ({ startDate, endDate } = parseTheaterDateRange(card, now));

          // Skip if end date is in the past
          if (endDate && endDate < today) continue;
          // Skip if no valid date
          if (!startDate) continue;
        } else {
          // Music: single date format
          const dateMatch = card.match(/<strong>\s*(\d{1,2})\/(\d{1,2})\s*<\/strong>/);
          if (!dateMatch) continue;

          const day = parseInt(dateMatch[1]);
          const month = parseInt(dateMatch[2]);

          let year = currentYear;
          if (month < currentMonth || (month === currentMonth && day < now.getDate())) {
            year = currentYear + 1;
          }

          startDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          if (startDate < today) continue;
        }

        // For mixed venues scraped from theater guide, use 'other' so categorizer decides
        const isMixedVenue = mixedVenuesLower.includes(venue.toLowerCase().trim());
        const effectiveType = (guide.type === 'theater' && isMixedVenue) ? 'other' : guide.type;

        events.push({
          id: generateEventId(title, startDate!, venue),
          title,
          // S-F2a: run end-date is structured data (end_date below), never
          // description prose. Empty description → NULL at the saveEvents bind (G5).
          description: '',
          start_date: startDate!,
          end_date: endDate,
          time: '',
          type: effectiveType,
          genres: '',
          venue_name: venue,
          url: `https://www.athinorama.gr${eventUrl}`,
          price_type: 'tba',
          price_amount: null,
          price_range: null,
          source: 'athinorama.gr'
        });
        count++;
      }

      console.log(`   Found ${count} ${guide.type} events`);
    } catch (e) {
      console.log(`   ⚠️ Error fetching ${guide.type}: ${e}`);
    }
  }

  // Fetch prices AND times from ALL event pages
  console.log('   Fetching prices and times from event pages...');
  let pricesFound = 0;
  let timesFound = 0;
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    try {
      // Use retry helper for individual event pages (fewer retries, faster timeout)
      const eventHtml = await fetchWithRetryAthinorama(event.url, 2);
      if (!eventHtml) continue;

      // ---- IMAGE EXTRACTION ----
      if (!event.image_url) {
        // Athinorama og:image returns HTTP 502 — use body image instead
        const bodyImage = extractAthinoramaBodyImage(eventHtml);
        if (bodyImage) {
          // Upgrade the 250x300/300x380 listing thumbnail to a floor-passing 1200x1440 (S165)
          event.image_url = upgradeAthinoramaImage(bodyImage);
        } else {
          const imageResult = extractOgImage(eventHtml, event.url);
          if (imageResult) {
            event.image_url = upgradeAthinoramaImage(imageResult.imageUrl);
          }
        }
      }

      // ---- TIME EXTRACTION (same patterns as enrich-time.ts) ----
      if (!event.time) {
        const extractedTime = extractTimeFromAthinoramaPage(eventHtml);
        if (extractedTime) {
          event.time = extractedTime;
          timesFound++;
        }
      }

      // ---- PRICE EXTRACTION ----
      let priceMatch = null;

      // Pattern 1: "Είσ.: € 15-11" or "Είσ.: € 15" (standard Athinorama)
      priceMatch = eventHtml.match(/Είσ\.?:?\s*€?\s*(\d+)(?:\s*-\s*(\d+))?/i);

      // Pattern 2: "Τιμή: €15" or "Τιμή: 15€"
      if (!priceMatch) {
        priceMatch = eventHtml.match(/Τιμ[έή]:?\s*€?\s*(\d+)(?:\s*€)?(?:\s*-\s*€?\s*(\d+))?/i);
      }

      // Pattern 3: "Από €15" or "από 15€"
      if (!priceMatch) {
        priceMatch = eventHtml.match(/[Αα]πό\s*€?\s*(\d+)(?:\s*€)?/i);
      }

      // Pattern 4: "€15 - €20" or "€15-€20"
      if (!priceMatch) {
        priceMatch = eventHtml.match(/€\s*(\d+)(?:\s*-\s*€?\s*(\d+))?/);
      }

      // Pattern 5: "15€ - 20€" or "15€"
      if (!priceMatch) {
        priceMatch = eventHtml.match(/(\d+)\s*€(?:\s*-\s*(\d+)\s*€)?/);
      }

      // Pattern 6: "Εισιτήριο: 15" or "Εισιτήρια: 15-20"
      if (!priceMatch) {
        priceMatch = eventHtml.match(/Εισιτ[ήη]ρι[οα]:?\s*€?\s*(\d+)(?:\s*-\s*(\d+))?/i);
      }

      if (priceMatch) {
        const price1 = parseInt(priceMatch[1]);
        const price2 = priceMatch[2] ? parseInt(priceMatch[2]) : null;

        // Validate price range (5-200€ is reasonable)
        if (price1 >= 5 && price1 <= 200) {
          // Prices might be reversed (higher-lower), normalize to min-max
          const minPrice = price2 ? Math.min(price1, price2) : price1;
          const maxPrice = price2 ? Math.max(price1, price2) : price1;

          event.price_amount = minPrice;
          event.price_type = 'with-ticket';
          event.price_range = price2 ? `€${minPrice} - €${maxPrice}` : `€${minPrice}`;
          pricesFound++;
        }
      }

      // Progress indicator every 20 events
      if ((i + 1) % 20 === 0) {
        console.log(`   ... ${i + 1}/${events.length} pages processed, ${pricesFound} prices, ${timesFound} times`);
      }

      await new Promise(r => setTimeout(r, 300)); // Rate limit
    } catch (err) { /* Skip on error */ }
  }
  console.log(`   Found prices for ${pricesFound}/${events.length} events`);
  console.log(`   Found times for ${timesFound}/${events.length} events`);

  return events;
}

// ============================================================================
// CLUBBER.GR SCRAPER (iCal)
// ============================================================================

/**
 * Guard: an empty feed and a non-feed must be distinguishable.
 *
 * For ~2 months clubber.gr served HTML at the feed URL; `split('BEGIN:VEVENT')`
 * on a non-iCal body yields one element, the loop never runs, and scrape_stats
 * recorded success=1 / 0 events / no error — a dead source disguised as a quiet
 * week. The BODY SENTINEL (`BEGIN:VCALENDAR`, mandatory in every iCal stream per
 * RFC 5545) is the authoritative check: a content-type-only check would falsely
 * reject a misconfigured-but-valid feed (clubber.gr already mislabels assets —
 * it served text/html for a .jpg — so its headers cannot be trusted either way).
 * The served content-type goes into the error message for diagnosis, giving
 * scrape_stats a usable error_message instead of a silent zero.
 */
export function assertClubberFeedIsICal(body: string, contentType: string | null): void {
  if (body.includes('BEGIN:VCALENDAR')) return;
  const preview = body.slice(0, 120).replace(/\s+/g, ' ').trim();
  throw new Error(
    `clubber.gr feed is not iCal: body lacks BEGIN:VCALENDAR ` +
    `(content-type: ${contentType ?? 'unknown'}; body starts: "${preview}")`
  );
}

// `fetchFn` is injectable so tests exercise the non-feed guard with synthetic
// bodies and zero live network calls. Errors PROPAGATE (no internal swallow):
// the main loop records success=0 + error_message in scrape_stats, so a broken
// feed can no longer masquerade as a quiet week.
export async function scrapeClubber(fetchFn: typeof fetch = fetch): Promise<ScrapedEvent[]> {
  console.log('   Fetching clubber.gr iCal feed...');
  const events: ScrapedEvent[] = [];
  const today = new Date().toISOString().split('T')[0];

  {
    const response = await fetchFn('https://www.clubber.gr/events/?ical=1', {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'text/calendar, */*' }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const ical = await response.text();
    assertClubberFeedIsICal(ical, response.headers.get('content-type'));
    const eventBlocks = ical.split('BEGIN:VEVENT');

    for (let i = 1; i < eventBlocks.length; i++) {
      const block = eventBlocks[i].split('END:VEVENT')[0];
      const unfoldedBlock = block.replace(/\r?\n[ \t]/g, '');
      const lines = unfoldedBlock.split(/\r?\n/);

      const event: any = {};
      for (const line of lines) {
        const colonIndex = line.indexOf(':');
        if (colonIndex === -1) continue;
        const key = line.substring(0, colonIndex).split(';')[0].toUpperCase();
        const value = line.substring(colonIndex + 1);

        switch (key) {
          case 'SUMMARY': event.title = unescapeICalText(value); break;
          case 'DTSTART': event.dtstart = line; break;
          case 'URL': event.url = value; break;
          case 'LOCATION': event.venue = unescapeICalText(value); break;
        }
      }

      if (!event.title || !event.dtstart) continue;

      const { date, time } = parseICalDate(event.dtstart);
      if (!date || date < today) continue;

      events.push({
        id: generateEventId(event.title, date, event.venue || 'TBA'),
        title: event.title,
        description: '',
        start_date: date,
        time,
        type: 'concert',
        genres: '["electronic"]',
        venue_name: event.venue || 'TBA',
        url: event.url || 'https://www.clubber.gr/events/',
        price_type: 'with-ticket',
        ticket_url_status: 'door_only',
        price_amount: null,
        price_range: 'Door price',
        source: 'clubber.gr'
      });
    }

    console.log(`   Found ${events.length} events`);
  }

  return events;
}

// ============================================================================
// TICKETSERVICES.GR SCRAPER
// ============================================================================

async function scrapeTicketServices(): Promise<ScrapedEvent[]> {
  console.log('   Fetching ticketservices.gr listing...');
  const events: ScrapedEvent[] = [];
  const today = new Date().toISOString().split('T')[0];

  try {
    const response = await fetch('https://www.ticketservices.gr/en/LiveConcerts/', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const buffer = await response.arrayBuffer();
    const html = decodeWindows1253(buffer);

    // Parse events from listing
    const eventPattern = /<li[^>]+data-eventid='(\d+)'[^>]+data-dates='([^']*)'[^>]+data-areaids='([^']*)'[^>]*data-venues='([^']*)'[^>]+data-title='([^']*)'/g;
    const eventList: Array<{ id: string; dates: string[]; area: string; venue: string; title: string }> = [];

    let match;
    while ((match = eventPattern.exec(html)) !== null) {
      const [, eventId, datesStr, areaIds, venue, title] = match;
      const dates = datesStr.split('|').filter(d => d && d >= today);
      if (dates.length === 0) continue;

      // Only Athens area (area 1)
      if (!areaIds.includes('1')) continue;

      eventList.push({
        id: eventId,
        dates,
        area: areaIds,
        venue: venue.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/<br\s*\/?>/gi, ' ').trim(),
        title: title.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/<br\s*\/?>/gi, ' ').trim()
      });
    }

    console.log(`   Found ${eventList.length} Athens events, fetching prices...`);

    // First add all events without prices, then try to add prices
    for (const e of eventList) {
      for (const date of e.dates) {
        events.push({
          id: generateEventId(e.title, date, e.venue),
          title: e.title,
          description: '',
          start_date: date,
          time: '',
          type: 'concert',
          genres: '',
          venue_name: e.venue,
          url: `https://www.ticketservices.gr/event/${e.id}/`,
          price_type: 'tba',
          price_amount: null,
          price_range: null,
          source: 'ticketservices'
        });
      }
    }

    console.log(`   Extracted ${events.length} events with dates`);

    // Use Puppeteer to get prices (must click on show to see prices)
    let pricesFound = 0;
    let browser = null;
    try {
      browser = await puppeteer.launch({
        headless: true,
        executablePath: CHROME_PATH,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });

      const page = await browser.newPage();
      await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');

      // Process all unique events (prices are per event, not per date)
      const uniqueEvents = eventList;
      console.log(`   Fetching prices for ${uniqueEvents.length} events...`);

      for (let i = 0; i < uniqueEvents.length; i++) {
        const e = uniqueEvents[i];
        try {
          // Go to event page
          await page.goto(`https://www.ticketservices.gr/event/${e.id}/`, {
            waitUntil: 'networkidle2',
            timeout: 15000
          });

          // Wait for show list to load
          await page.waitForSelector('li[data-showid]', { timeout: 5000 }).catch(() => {});

          // Click on the first show's booking button to reveal prices
          const clicked = await page.evaluate(() => {
            const btn = document.querySelector('.openshow.cbtn_plain, a.openshow');
            if (btn) {
              (btn as HTMLElement).click();
              return true;
            }
            return false;
          });

          if (clicked) {
            // Wait for price content to load
            await new Promise(r => setTimeout(r, 2000));
          }

          // Extract prices AND time from the page
          const pageData = await page.evaluate(() => {
            const priceValues: number[] = [];
            const text = document.body.innerText;

            // Match prices like "30€", "28€", etc.
            const matches = text.match(/(\d+)\s*€/g);
            if (matches) {
              matches.forEach(m => {
                const p = parseInt(m.replace('€', '').trim());
                if (p >= 5 && p <= 300) priceValues.push(p);
              });
            }

            // Extract time from data-time attribute
            const timeEl = document.querySelector('[data-time]');
            const time = timeEl ? timeEl.getAttribute('data-time') : null;

            return {
              prices: [...new Set(priceValues)],
              time: time && /^\d{2}:\d{2}$/.test(time) ? time : null
            };
          });

          // Update time for all events with this title
          if (pageData.time) {
            for (const event of events) {
              if (event.title === e.title && event.source === 'ticketservices' && !event.time) {
                event.time = pageData.time;
              }
            }
          }

          if (pageData.prices.length > 0) {
            const minPrice = Math.min(...pageData.prices);
            const maxPrice = Math.max(...pageData.prices);
            const priceRange = minPrice === maxPrice ? `€${minPrice}` : `€${minPrice} - €${maxPrice}`;

            // Update all events with this title
            for (const event of events) {
              if (event.title === e.title && event.source === 'ticketservices') {
                event.price_type = 'with-ticket';
                event.price_amount = minPrice;
                event.price_range = priceRange;
              }
            }
            pricesFound++;

            // Progress indicator every 10 events
            if ((i + 1) % 10 === 0 || i === uniqueEvents.length - 1) {
              console.log(`   ... ${i + 1}/${uniqueEvents.length} events processed, ${pricesFound} with prices`);
            }
          }
        } catch (err) { /* Skip on error */ }
      }
    } catch (browserErr) {
      console.log(`   ⚠️ Browser error: ${browserErr}`);
    } finally {
      if (browser) await browser.close();
    }

    console.log(`   ✓ Found prices for ${pricesFound}/${eventList.length} unique events`);
  } catch (e) {
    console.log(`   ⚠️ Error: ${e}`);
  }

  return events;
}

// ============================================================================
// HALF NOTE JAZZ CLUB SCRAPER (iCal)
// ============================================================================

async function scrapeHalfNote(): Promise<ScrapedEvent[]> {
  console.log('   Fetching halfnote.gr iCal feed...');
  const events: ScrapedEvent[] = [];
  const today = new Date().toISOString().split('T')[0];

  try {
    const response = await fetch('https://www.halfnote.gr/events/?ical=1', {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'text/calendar, */*' }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const ical = await response.text();
    const eventBlocks = ical.split('BEGIN:VEVENT');

    for (let i = 1; i < eventBlocks.length; i++) {
      const block = eventBlocks[i].split('END:VEVENT')[0];
      const unfoldedBlock = block.replace(/\r?\n[ \t]/g, '');
      const lines = unfoldedBlock.split(/\r?\n/);

      const event: any = {};
      for (const line of lines) {
        const colonIndex = line.indexOf(':');
        if (colonIndex === -1) continue;
        const key = line.substring(0, colonIndex).split(';')[0].toUpperCase();
        const value = line.substring(colonIndex + 1);

        switch (key) {
          case 'SUMMARY': event.title = unescapeICalText(value); break;
          case 'DESCRIPTION': event.description = unescapeICalText(value); break;
          case 'DTSTART': event.dtstart = line; break;
          case 'URL': event.url = value; break;
        }
      }

      if (!event.title || !event.dtstart) continue;

      const { date, time } = parseICalDate(event.dtstart);
      if (!date || date < today) continue;

      // Extract price from description
      let price: number | null = null;
      let priceRange: string | null = null;
      if (event.description) {
        const priceMatch = event.description.match(/(?:από|τιμ[έή])\s*:?\s*(\d+)\s*€/i);
        if (priceMatch) {
          price = parseInt(priceMatch[1]);
          priceRange = `από €${price}`;
        }
      }

      events.push({
        id: generateEventId(event.title, date, 'Half Note Jazz Club'),
        title: event.title,
        description: '',
        start_date: date,
        time,
        type: 'concert',
        genres: '["jazz"]',
        venue_name: 'Half Note Jazz Club',
        url: event.url || 'https://www.halfnote.gr/events/',
        price_type: price ? 'with-ticket' : 'tba',
        price_amount: price,
        price_range: priceRange,
        source: 'halfnote',
        location_status: 'verified_athens'
      });
    }

    console.log(`   Found ${events.length} events`);
  } catch (e) {
    console.log(`   ⚠️ Error: ${e}`);
  }

  return events;
}

// ============================================================================
// RESIDENT ADVISOR SCRAPER (GraphQL)
// ============================================================================

async function scrapeResidentAdvisor(): Promise<ScrapedEvent[]> {
  console.log('   Fetching ra.co GraphQL API...');
  const events: ScrapedEvent[] = [];
  const today = new Date().toISOString().split('T')[0];

  const query = `{
    eventListings(
      filters: { areas: { eq: 549 }, listingDate: { gte: "${today}" } },
      pageSize: 100,
      page: 1
    ) {
      data {
        event {
          id
          title
          date
          startTime
          venue { name id }
          contentUrl
          cost
          images { filename type }
        }
      }
      totalResults
    }
  }`;

  try {
    const response = await fetch('https://ra.co/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0'
      },
      body: JSON.stringify({ query })
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const result = await response.json() as any;
    if (result.errors) throw new Error(JSON.stringify(result.errors));

    const raEvents = result.data.eventListings.data.map((item: any) => item.event);
    console.log(`   Found ${raEvents.length} events (${result.data.eventListings.totalResults} total)`);

    for (const e of raEvents) {
      const date = e.date.split('T')[0];
      const time = e.startTime?.match(/T(\d{2}:\d{2})/)?.[1] || '';

      // Parse cost
      let price: number | null = null;
      let priceRange: string | null = null;
      let priceType = 'tba';

      if (e.cost && e.cost !== 'TBA') {
        if (e.cost === '0' || e.cost.toLowerCase() === 'free') {
          price = 0;
          priceRange = 'Free';
          priceType = 'open';
        } else {
          const rangeMatch = e.cost.match(/(\d+)\s*[-–]\s*(\d+)/);
          if (rangeMatch) {
            price = parseInt(rangeMatch[1]);
            priceRange = `€${rangeMatch[1]} - €${rangeMatch[2]}`;
            priceType = 'with-ticket';
          } else {
            const singleMatch = e.cost.match(/(\d+(?:\.\d{2})?)/);
            if (singleMatch) {
              price = parseFloat(singleMatch[1]);
              priceRange = `€${Math.round(price)}`;
              priceType = 'with-ticket';
            }
          }
        }
      }

      events.push({
        id: generateEventId(e.title, date, e.venue.name),
        title: e.title,
        description: '',
        start_date: date,
        time,
        type: 'concert',
        genres: '["electronic"]',
        venue_name: e.venue.name,
        url: `https://ra.co${e.contentUrl}`,
        price_type: priceType,
        price_amount: price,
        price_range: priceRange,
        source: 'residentadvisor',
        image_url: e.images?.find((img: any) => img.type === 'FLYERFRONT')?.filename || null
      });
    }

    // Fetch prices from event pages for TBA events (up to 20)
    const tbaEvents = events.filter(e => e.price_type === 'tba');
    if (tbaEvents.length > 0) {
      console.log(`   Fetching prices for ${Math.min(tbaEvents.length, 20)} TBA events from event pages...`);
      let pricesFound = 0;

      for (let i = 0; i < Math.min(tbaEvents.length, 20); i++) {
        const event = tbaEvents[i];
        try {
          const pageResponse = await fetch(event.url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' }
          });
          if (!pageResponse.ok) continue;

          const pageHtml = await pageResponse.text();

          // Look for price patterns on RA event pages
          // Pattern 1: "€15" or "€15 - €20"
          let priceMatch = pageHtml.match(/(?:Cost|Price|Entry|Tickets?)[:\s]*€?\s*(\d+)(?:\s*[-–]\s*€?\s*(\d+))?/i);
          // Pattern 2: Just "€15" in the cost section
          if (!priceMatch) {
            priceMatch = pageHtml.match(/<span[^>]*>€(\d+)(?:\s*[-–]\s*€?(\d+))?<\/span>/i);
          }
          // Pattern 3: "15€" format
          if (!priceMatch) {
            priceMatch = pageHtml.match(/(\d+)\s*€(?:\s*[-–]\s*(\d+)\s*€)?/);
          }

          if (priceMatch) {
            const price1 = parseInt(priceMatch[1]);
            const price2 = priceMatch[2] ? parseInt(priceMatch[2]) : null;

            if (price1 >= 5 && price1 <= 100) {
              event.price_amount = price1;
              event.price_type = 'with-ticket';
              event.price_range = price2 ? `€${price1} - €${price2}` : `€${price1}`;
              pricesFound++;
            }
          }

          await new Promise(r => setTimeout(r, 500)); // Rate limit
        } catch (err) { /* Skip on error */ }
      }

      console.log(`   Found ${pricesFound} additional prices from event pages`);
    }
  } catch (e) {
    console.log(`   ⚠️ Error: ${e}`);
  }

  return events;
}

// ============================================================================
// PRICE CROSS-REFERENCE (Clubber ↔ RA)
// ============================================================================

async function crossReferenceClubberPrices(clubberEvents: ScrapedEvent[], raEvents: ScrapedEvent[]): Promise<number> {
  console.log('\n🔄 Cross-referencing Clubber ↔ RA prices...');

  // Expanded venue aliases (30+ Athens venues)
  const venueAliases: Record<string, string[]> = {
    // Electronic/Club venues
    'astron': ['astron club', 'astron', 'astron bar'],
    'dybbuk': ['dybbuk', 'dybbuk athens', 'dybuk'],
    'smut': ['smut athens', 'smut', 's.m.u.t.'],
    'universe': ['universe athens', 'universe', 'universe club'],
    'romantso': ['romantso', 'ρομαντσο', 'romanzo'],
    'oddity': ['oddity club', 'oddity', 'oddity athens'],
    '2ten': ['2ten', 'two ten'],
    'six dogs': ['six d.o.g.s', '6 d.o.g.s', 'six d.o.g.s.', '6dogs', 'six dogs athens'],
    'bios': ['bios athens', 'bios', 'βιος'],
    'temple': ['temple athens', 'temple club', 'temple'],
    'death disco': ['death disco athens', 'death disco', 'deathdisco'],
    'booze': ['booze cooperativa', 'booze', 'booze bar'],
    'an club': ['an club', 'a.n. club', 'an club athens'],
    'fuzz': ['fuzz club', 'fuzz live', 'fuzz athens', 'fuzz'],
    'piraeus academy': ['piraeus academy', 'piraeus 117 academy'],
    'piraeus 117': ['piraeus 117', 'piraeus 117 academy'],
    'void': ['void athens', 'void club', 'void'],
    'noise': ['noise athens', 'noise'],
    'island': ['island athens', 'island club', 'island'],
    'akrotiri': ['akrotiri', 'akrotiri beach bar', 'akrotiri lounge'],
    'bolivar': ['bolivar beach bar', 'bolivar', 'bolivar athens'],
    'second skin': ['second skin', 'second skin club'],
    'dude': ['dude', 'the dude', 'dude athens'],
    // Concert halls
    'gagarin': ['gagarin 205', 'gagarin', 'gagarin athens'],
    'floyd': ['floyd athens', 'floyd', 'floyd club'],
    'gazarte': ['gazarte', 'gazarte roof', 'gazarte athens', 'γκαζαρτε'],
    'technopolis': ['technopolis', 'τεχνοπολις', 'technopolis athens', 'gazi technopolis'],
    'stavros niarchos': ['snfcc', 'stavros niarchos foundation', 'κπισν', 'niarchos', 'snf'],
    'faliro': ['faliro pavilion', 'faliro arena', 'tae kwon do', 'taekwondo'],
    'olympic': ['olympic athletic center', 'oaka', 'ολυμπιακο'],
    // Cultural spaces
    'onassis': ['onassis stegi', 'stegi', 'onassis cultural', 'ονασης'],
    'megaron': ['megaron mousikis', 'megaron', 'μεγαρο μουσικης'],
    'herodion': ['herod atticus', 'herodion', 'ηρωδειο', 'herodes atticus'],
    'lycabettus': ['lycabettus theater', 'lycabettus', 'λυκαβηττος'],
  };

  function normalizeVenue(v: string): string {
    return v.toLowerCase().replace(/\s+/g, ' ').replace(/athens|club/gi, '').trim();
  }

  function venuesMatch(v1: string, v2: string): boolean {
    const n1 = normalizeVenue(v1);
    const n2 = normalizeVenue(v2);
    if (n1 === n2) return true;

    // Direct substring check for short venue names
    if (n1.length > 3 && n2.length > 3) {
      if (n1.includes(n2) || n2.includes(n1)) return true;
    }

    for (const [key, aliases] of Object.entries(venueAliases)) {
      const m1 = n1.includes(key) || aliases.some(a => n1.includes(a.toLowerCase()));
      const m2 = n2.includes(key) || aliases.some(a => n2.includes(a.toLowerCase()));
      if (m1 && m2) return true;
    }
    return false;
  }

  let updated = 0;
  for (const clubber of clubberEvents) {
    if (clubber.price_amount !== null) continue; // Already has price

    const date = clubber.start_date;
    const raMatch = raEvents.find(ra =>
      ra.start_date === date &&
      venuesMatch(clubber.venue_name, ra.venue_name) &&
      ra.price_amount !== null
    );

    if (raMatch) {
      clubber.price_amount = raMatch.price_amount;
      clubber.price_range = raMatch.price_range;
      clubber.price_type = raMatch.price_type;
      updated++;
      console.log(`   ✅ ${clubber.title.substring(0, 40)} → ${raMatch.price_range}`);
    }
  }

  console.log(`   Updated ${updated} clubber events with RA prices`);
  return updated;
}

// ============================================================================
// DATABASE OPERATIONS
// ============================================================================

/**
 * Record scrape statistics to the database for monitoring
 */
function recordScrapeStats(
  source: string,
  eventsFound: number,
  eventsNew: number,
  eventsUpdated: number,
  durationMs: number,
  success: boolean,
  errorMessage: string | null
): void {
  try {
    const db = new Database(DB_PATH);
    db.prepare(`
      INSERT INTO scrape_stats (source, scraped_at, events_found, events_new, events_updated, duration_ms, success, error_message)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      source,
      new Date().toISOString(),
      eventsFound,
      eventsNew,
      eventsUpdated,
      durationMs,
      success ? 1 : 0,
      errorMessage
    );
    db.close();
  } catch (err) {
    // Log but don't fail the scrape
    console.log(`   ⚠️ Failed to record scrape stats: ${err}`);
  }
}

// `dbArg` lets tests inject an in-memory DB; in production it defaults to the prod file
// and is owned/closed here. A caller-injected DB is left open for the caller to manage.
export function saveEvents(events: ScrapedEvent[], dryRun: boolean, dbArg?: Database): { saved: number; outOfScope: number; failed: number; dupSkipped: number } {
  if (dryRun || events.length === 0) return { saved: 0, outOfScope: 0, failed: 0, dupSkipped: 0 };

  const db = dbArg ?? new Database(DB_PATH);
  const ownsDb = !dbArg;
  let saved = 0;
  let outOfScope = 0;
  let failed = 0;
  let dupSkipped = 0;

  // Import-time duplicate gate at THIS seam (campaign Phase 4, 2026-07-07).
  // The gate was wired only into upsertEvent, but the daily pipeline writes
  // ~95% of rows through this raw INSERT — cross-source re-listings and
  // title-variant re-hashes (S140 Pavlopoulos class) entered ungated and were
  // only mopped up post-hoc by mark-duplicates. Contract mirrors upsertEvent:
  // NEW ids only (same-id re-scrapes take the ON CONFLICT UPDATE path), and
  // checkImportDuplicate fails OPEN internally — a gate error must never
  // silently drop a genuinely new event.
  const existsStmt = db.prepare('SELECT 1 FROM events WHERE id = ?');

  const stmt = db.prepare(`
    INSERT INTO events (
      id, title, description, start_date, end_date, time_doors, time_source, type, genres,
      venue_name, url, price_type, price_amount, price_range, source,
      location_status, image_url, image_source, ticket_url_status, needs_enrichment, created_at, updated_at
    ) VALUES (
      $id, $title, $description, $start_date, $end_date, $time_doors, $time_source, $type, $genres,
      $venue_name, $url, $price_type, $price_amount, $price_range, $source,
      $location_status, $image_url, $image_source, $ticket_url_status, 1, datetime('now'), datetime('now')
    )
    ON CONFLICT(id) DO UPDATE SET
      title = $title,
      url = $url,
      type = $type,
      end_date = COALESCE($end_date, end_date),
      price_type = COALESCE($price_type, price_type),
      price_amount = COALESCE($price_amount, price_amount),
      price_range = COALESCE($price_range, price_range),
      time_doors = COALESCE($time_doors, time_doors),
      time_source = COALESCE($time_source, time_source),
      image_url = COALESCE($image_url, image_url),
      image_source = COALESCE($image_source, image_source),
      ticket_url_status = COALESCE($ticket_url_status, ticket_url_status),
      updated_at = datetime('now')
  `);

  for (const e of events) {
    try {
      // Scope filter: exclude non-cultural events (sports, corporate, etc.)
      const scopeResult = shouldExcludeEvent({
        title: e.title,
        venue: e.venue_name,
        description: e.description,
        url: e.url
      });

      if (!scopeResult.inScope) {
        console.log(`   ⛔ Out of scope: ${e.title.substring(0, 50)}... (${scopeResult.reason})`);
        outOfScope++;
        continue;
      }

      // Seasonal filter: check if venue is open on event date
      const seasonalResult = validateSeasonalEvent(e.venue_name, e.start_date);
      if (!seasonalResult.valid) {
        console.log(`   🌴 Seasonal closure: ${e.title.substring(0, 40)}... (${seasonalResult.reason})`);
        outOfScope++;
        continue;
      }
      if (seasonalResult.warning) {
        console.log(`   ⚠️  Seasonal warning: ${e.title.substring(0, 40)}... (${seasonalResult.warning})`);
      }

      // Normalize theater/theatre spelling
      let eventType = normalizeTheaterSpelling(e.type);

      // Re-categorize event using the hybrid categorizer
      eventType = categorizeEventSimple({
        title: e.title,
        description: e.description,
        venue: e.venue_name,
        url: e.url,
        source: e.source,
        currentType: eventType
      });

      // Append time to start_date if available, and save time separately to time_doors.
      // normalizeDateField enforces canonical naive-local format at bind time.
      const startDateTime = e.time ? `${e.start_date}T${e.time}:00` : e.start_date;
      const timeSource = e.time ? 'scraped_listing' : null;

      // Duplicate gate — NEW ids only; see seam comment above the prepare().
      if (!existsStmt.get(e.id)) {
        const match = checkImportDuplicate(
          {
            id: e.id,
            title: e.title,
            startDate: normalizeDateField(startDateTime),
            endDate: e.end_date ? normalizeDateField(e.end_date) : undefined,
            type: eventType,
            source: e.source,
            venue: { name: e.venue_name },
          } as Event,
          db,
        );
        if (match) {
          console.log(
            `   🚫 [import-gate] Skipping duplicate: "${e.title.substring(0, 60)}" (${e.source}) ` +
            `duplicates ${match.existingId} [${match.pair.layer} ${match.pair.confidence.toFixed(2)}]`,
          );
          dupSkipped++;
          continue;
        }
      }

      stmt.run({
        $id: e.id,
        $title: e.title,
        // G5 (S-F2a): never persist empty-string descriptions — NULL instead.
        $description: e.description || null,
        $start_date: normalizeDateField(startDateTime),
        $end_date: e.end_date ? normalizeDateField(e.end_date) : null,
        $time_doors: e.time || null,
        $time_source: timeSource,
        $type: eventType,
        $genres: normalizeGenres(e.genres),
        $venue_name: e.venue_name,
        $url: e.url,
        $price_type: normalizePriceType(e.price_type),
        $price_amount: e.price_amount,
        $price_range: e.price_range,
        $source: e.source,
        $location_status: e.location_status || 'unverified',
        $image_url: e.image_url || null,
        $image_source: e.image_url ? 'scraped_listing' : null,
        $ticket_url_status: e.ticket_url_status || null
      });
      saved++;
    } catch (err) {
      // NOT a duplicate path: the only unique index is `id`, handled by ON CONFLICT(id)
      // DO UPDATE above — so a throw here is a real persistence failure (e.g. a CHECK or
      // NOT NULL violation). Log it loudly instead of hiding it, and count it so the
      // found-vs-persisted divergence is visible in the summary.
      failed++;
      log('ERROR', e.source, `save failed for ${e.id} (${e.title?.slice(0, 40)}): ${err}`);
    }
  }

  if (ownsDb) db.close();
  return { saved, outOfScope, failed, dupSkipped };
}

// ============================================================================
// MAIN ORCHESTRATOR
// ============================================================================

// Adapter to convert SNFCC events to standard format
async function scrapeSNFCCAdapter(): Promise<ScrapedEvent[]> {
  const snfccEvents = await scrapeSNFCC();
  return snfccEvents.map(e => ({
    id: e.id,
    title: e.title,
    description: e.description,
    start_date: e.start_date,
    end_date: e.end_date,
    time: e.time,
    type: e.type,
    genres: e.genres,
    venue_name: e.venue_name,
    url: e.url,
    price_type: e.price_type,
    price_amount: e.price_amount,
    price_range: e.price_range,
    source: e.source,
    location_status: e.location_status,
    image_url: e.image_url
  }));
}

// Adapter for Onassis Stegi events (mixed-type listing — type/genres derived by the scraper)
async function scrapeOnassisAdapter(): Promise<ScrapedEvent[]> {
  const events = await scrapeOnassis();
  return events.map(e => ({
    id: generateEventId(e.title, e.start_date, e.venue_name),
    title: e.title,
    description: e.description,
    start_date: e.start_date,
    end_date: e.end_date,
    // '11:00' is the exhibition opening time; non-exhibitions have no scraped clock
    // time, so leave it empty (avoids stamping a fabricated time on cinema/concerts).
    time: e.type === 'exhibition' ? '11:00' : '',
    type: e.type,                       // was hardcoded 'exhibition'
    genres: JSON.stringify(e.genres),   // was the blanket ['Art','Contemporary']
    venue_name: e.venue_name || 'Onassis Stegi',
    url: e.url,
    price_type: e.price_type,
    price_amount: null,
    price_range: null,
    source: 'onassis',
    location_status: 'verified_athens'
  }));
}

// Adapter for Benaki Museum exhibitions
async function scrapeBenakiAdapter(): Promise<ScrapedEvent[]> {
  const exhibitions = await scrapeBenaki();
  return exhibitions.map(e => ({
    id: generateEventId(e.title, e.start_date, e.venue_key),
    title: e.title,
    description: e.description,
    start_date: e.start_date,
    end_date: e.end_date,
    time: '10:00', // Default opening time
    type: 'exhibition',
    genres: JSON.stringify(['Art', 'History', 'Culture']),
    venue_name: e.venue_key === 'pireos' ? 'Μουσείο Μπενάκη - Πειραιώς 138' :
                e.venue_key === 'islamic' ? 'Μουσείο Ισλαμικής Τέχνης' :
                'Μουσείο Μπενάκη Ελληνικού Πολιτισμού',
    url: e.url,
    price_type: e.price_type,
    price_amount: null,
    price_range: null,
    source: 'benaki',
    location_status: 'verified_athens'
  }));
}

// Adapter for Megaron Mousikis concerts
async function scrapeMegaronAdapter(): Promise<ScrapedEvent[]> {
  const events = await scrapeMegaron();
  return events.map(e => ({
    id: generateEventId(e.title, e.start_date, e.venue_name),
    title: e.title,
    description: e.description,
    start_date: e.start_date,
    time: e.time,
    type: e.type as 'concert' | 'theater' | 'exhibition' | 'performance' | 'workshop' | 'cinema' | 'other',
    genres: JSON.stringify(['Classical', 'Concert']),
    venue_name: e.venue_name,
    url: e.url,
    price_type: e.price_type,
    price_amount: null,
    price_range: null,
    source: 'megaron.gr',
    location_status: 'verified_athens'
  }));
}

const SOURCES: Record<SourceId, { name: string; scraper: () => Promise<ScrapedEvent[]> }> = {
  more: { name: 'More.com', scraper: scrapeMore },
  athinorama: { name: 'Athinorama.gr', scraper: scrapeAthinorama },
  clubber: { name: 'Clubber.gr', scraper: scrapeClubber },
  ticketservices: { name: 'TicketServices.gr', scraper: scrapeTicketServices },
  halfnote: { name: 'Half Note Jazz', scraper: scrapeHalfNote },
  ra: { name: 'Resident Advisor', scraper: scrapeResidentAdvisor },
  snfcc: { name: 'SNFCC', scraper: scrapeSNFCCAdapter },
  onassis: { name: 'Onassis Stegi', scraper: scrapeOnassisAdapter },
  benaki: { name: 'Benaki Museum', scraper: scrapeBenakiAdapter },
  megaron: { name: 'Megaron Mousikis', scraper: scrapeMegaronAdapter },
};

async function main() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  🏛️  AGENT ATHENS - Master Scraper                           ║');
  console.log('║     "One scraper to rule them all"                           ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');

  // Parse args
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const doCrossRef = args.includes('--crossref');

  const sourceIdx = args.indexOf('--source');
  let selectedSources = sourceIdx >= 0
    ? args[sourceIdx + 1].split(',') as SourceId[]
    : Object.keys(SOURCES) as SourceId[];

  // Phase 2A: quarantined sources are skipped entirely — no scrape, no
  // scrape_stats row (a fake success row would poison deadSourcesSignal
  // history). Un-quarantining is a decisions-queue item.
  const quarantine = loadQuarantine(join(import.meta.dir, '..', 'config', 'quarantined-sources.json'));
  for (const id of selectedSources) {
    if (id in quarantine.sources) {
      const q = quarantine.sources[id];
      console.log(`⏸  QUARANTINED ${id} (since ${q.since}: ${q.reason}) — skipping`);
    }
  }
  selectedSources = filterQuarantined(selectedSources, quarantine);

  if (dryRun) {
    console.log('🔍 DRY RUN MODE - No changes will be saved\n');
  }

  console.log(`📋 Sources to scrape: ${selectedSources.join(', ')}\n`);

  // Run scrapers
  const results: ScrapeResult[] = [];
  const allEvents: ScrapedEvent[] = [];
  let clubberEvents: ScrapedEvent[] = [];
  let raEvents: ScrapedEvent[] = [];

  for (const sourceId of selectedSources) {
    const source = SOURCES[sourceId];
    if (!source) {
      log('WARN', 'system', `Unknown source: ${sourceId}`);
      continue;
    }

    console.log(`\n📥 ${source.name}`);
    console.log('─'.repeat(50));

    log('INFO', sourceId, `Starting scrape for ${source.name}`);
    const start = Date.now();
    try {
      const events = await source.scraper();
      const duration = Date.now() - start;

      results.push({ source: sourceId, events, success: true, duration });
      allEvents.push(...events);

      if (sourceId === 'clubber') clubberEvents = events;
      if (sourceId === 'ra') raEvents = events;

      // Record stats to database (events_new/updated will be calculated after save)
      if (!dryRun) {
        recordScrapeStats(sourceId, events.length, 0, 0, duration, true, null);
      }

      log('INFO', sourceId, `Completed: ${events.length} events in ${(duration / 1000).toFixed(1)}s`);
      console.log(`   ✅ ${events.length} events in ${(duration / 1000).toFixed(1)}s`);
    } catch (error: any) {
      const duration = Date.now() - start;
      results.push({ source: sourceId, events: [], success: false, error: error.message, duration });

      // Record failure stats
      if (!dryRun) {
        recordScrapeStats(sourceId, 0, 0, 0, duration, false, error.message);
      }

      log('ERROR', sourceId, `Scrape failed: ${error.message}`, error);
      console.log(`   ❌ Error: ${error.message}`);
    }
  }

  // Cross-reference if both clubber and RA were scraped
  if (doCrossRef && clubberEvents.length > 0 && raEvents.length > 0) {
    await crossReferenceClubberPrices(clubberEvents, raEvents);
  }

  // Summary
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  📊  SUMMARY                                                 ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  let totalEvents = 0;
  let totalWithPrice = 0;

  for (const r of results) {
    const status = r.success ? '✅' : '❌';
    const priceCount = r.events.filter(e => e.price_amount !== null).length;
    totalEvents += r.events.length;
    totalWithPrice += priceCount;

    console.log(`${status} ${SOURCES[r.source as SourceId].name.padEnd(20)} | ${String(r.events.length).padStart(4)} events | ${String(priceCount).padStart(4)} with price | ${(r.duration / 1000).toFixed(1)}s`);
  }

  console.log('─'.repeat(64));
  console.log(`   ${'TOTAL'.padEnd(20)} | ${String(totalEvents).padStart(4)} events | ${String(totalWithPrice).padStart(4)} with price`);

  // Save to database
  if (!dryRun && allEvents.length > 0) {
    console.log('\n💾 Saving to database...');
    const { saved, outOfScope, failed, dupSkipped } = saveEvents(allEvents, dryRun);
    // Measure health at row-creation, not scrape-report: surface found -> persisted divergence.
    log('INFO', 'system', `Found ${allEvents.length} -> Saved ${saved} (${failed} failed, ${outOfScope} out of scope, ${dupSkipped} import-gate dup)`);
    console.log(`   ✅ Found ${allEvents.length} → Saved ${saved} (${failed} failed, ${outOfScope} out-of-scope, ${dupSkipped} import-gate dup)`);
    if (failed > 0) {
      console.log(`   ❗ ${failed} events FAILED to persist — see ERROR logs above (was previously hidden)`);
    }
    if (outOfScope > 0) {
      console.log(`   ⛔ Filtered ${outOfScope} out-of-scope events (sports, corporate, etc.)`);
    }
    if (dupSkipped > 0) {
      console.log(`   🚫 [import-gate] Skipped ${dupSkipped} duplicate(s) of existing live rows — see lines above`);
    }
  }

  // Write structured summary to log file
  const summaryStats: SourceStats[] = results.map(r => ({
    source: r.source,
    events: r.events.length,
    errors: r.success ? 0 : 1,
    duration: r.duration
  }));
  logSummary(summaryStats);

  console.log('\n✨ Done!\n');
}

// Guard so importing this module (e.g. from tests) does not auto-run the scraper.
if (import.meta.main) {
  main().catch(console.error);
}
