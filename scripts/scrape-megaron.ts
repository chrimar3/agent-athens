#!/usr/bin/env bun

/**
 * Megaron Mousikis (Athens Concert Hall) Event Scraper
 *
 * Scrapes classical concerts and cultural events from megaron.gr
 */

import { upsertEvent } from '../src/db/database';
import { info, logError } from '../src/utils/logger';
import { createHash } from 'crypto';
import type { Event, EventType } from '../src/types';

const SOURCE_ID = 'megaron';
const BASE_URL = 'https://www.megaron.gr';

interface ScrapedEvent {
  title: string;
  description: string;
  start_date: string;
  /** Null when the source states no clock time — never default one. */
  time: string | null;
  url: string;
  venue_name: string;
  type: EventType;
  price_type: 'with-ticket';
}

function generateEventId(title: string, startDate: string): string {
  const normalized = `${title.toLowerCase().trim()}-${startDate}`;
  return createHash('md5').update(normalized).digest('hex').substring(0, 16);
}

/**
 * Map megaron.gr listing `category-title` text to canonical EventType.
 *
 * Spike ground truth: specs/megaron-category-titles-spike.md (9 distinct strings observed 2026-05-14).
 * Talk-class categories (Διάλεξη, Συζήτηση) route to 'other' as a stopgap until the
 * taxonomy session adds a 'talk' EventType — see specs/categorizer-audit-2026-05-14.md.
 * Unknown / empty / non-matching categories also route to 'other' (review queue signal).
 */
export function categoryToType(rawCategory: string): EventType {
  const c = rawCategory
    .replace(/&amp;/g, '&')
    .normalize('NFC')
    .trim();

  switch (c) {
    case 'Μουσική':                return 'concert';
    case 'Όπερα':                  return 'concert';
    case 'Έκθεση':                 return 'exhibition';
    case 'Θέατρο':                 return 'theater';
    case 'Διάλεξη':                return 'other';
    case 'Συζήτηση':               return 'other';
    case 'Εκπαιδευτικά & Δράσεις': return 'workshop';
    case 'Εκδηλώσεις Τρίτων':      return 'other';
    case 'Online':                 return 'other';
    default:                       return 'other';
  }
}

export interface MegaronFetchOptions {
  fetchImpl?: typeof fetch;
  /** Wait before each retry; attempts = delaysMs.length + 1. */
  delaysMs?: number[];
  sleep?: (ms: number) => Promise<void>;
}

const CARD_MARKER = /class="tease tease--event-calendar"/;

/**
 * GET the /el/events listing, retrying 5xx, 429 and network errors with
 * backoff. Throws on the last failure or on any other non-2xx status.
 */
export async function fetchMegaronListing(opts: MegaronFetchOptions = {}): Promise<string> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const delays = opts.delaysMs ?? [5_000, 15_000];
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const calendarUrl = `${BASE_URL}/el/events`;

  for (let attempt = 0; ; attempt++) {
    let failure: string;
    try {
      info(SOURCE_ID, `Loading: ${calendarUrl}${attempt ? ` (retry ${attempt}/${delays.length})` : ''}`);
      const response = await fetchImpl(calendarUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'el-GR,el;q=0.9,en;q=0.8'
        }
      });
      if (response.ok) return await response.text();
      failure = `HTTP ${response.status}`;
      if (response.status < 500 && response.status !== 429) {
        throw new Error(`megaron: listing returned ${failure} (not retried) — check ${calendarUrl}`);
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('megaron:')) throw error;
      failure = String(error);
    }
    if (attempt >= delays.length) {
      throw new Error(`megaron: listing failed after ${attempt + 1} attempts (last: ${failure}) — the site may be down; rerun later with --source megaron`);
    }
    await sleep(delays[attempt]);
  }
}

/**
 * Throws when the listing cannot be fetched or carries no event cards at all
 * (the page structure changed), so scrape_stats records success=0 instead of
 * an empty success. A listing whose cards are all past-dated returns [].
 */
export async function scrapeMegaron(opts: MegaronFetchOptions = {}): Promise<ScrapedEvent[]> {
  info(SOURCE_ID, 'Starting Megaron Mousikis scrape');
  const html = await fetchMegaronListing(opts);
  const cardCount = html.split(CARD_MARKER).length - 1;
  if (cardCount === 0) {
    throw new Error('megaron: listing loaded but 0 event cards parsed — the card markup (tease--event-calendar) may have changed; inspect https://www.megaron.gr/el/events');
  }
  const deduped = parseMegaronListing(html);
  info(SOURCE_ID, `Completed: ${deduped.length} events from ${cardCount} cards`);
  return deduped;
}

/** Parse the /el/events listing HTML into one ScrapedEvent per card (deduped by URL + date). */
export function parseMegaronListing(html: string): ScrapedEvent[] {
    const events: ScrapedEvent[] = [];
    // Split by event card class to get individual card sections
    const cards = html.split(CARD_MARKER);

    for (let i = 1; i < cards.length; i++) {
      const card = cards[i];

      // Extract date from data-date="19 02 2026,"
      const dateMatch = card.match(/data-date="(\d{1,2})\s+(\d{2})\s+(\d{4})/);
      if (!dateMatch) continue;

      const day = dateMatch[1].padStart(2, '0');
      const month = dateMatch[2];
      const year = dateMatch[3];
      const startDate = `${year}-${month}-${day}`;

      // Skip past events
      if (new Date(startDate) < new Date(new Date().toISOString().split('T')[0])) continue;

      // Extract event URL from col-1 link
      const urlMatch = card.match(/class="col-1">\s*<a[^>]+href="([^"]*\/event\/[^"]*)"/i);
      if (!urlMatch) continue;
      const eventUrl = urlMatch[1].startsWith('http') ? urlMatch[1] : `${BASE_URL}${urlMatch[1]}`;

      // Extract title from <h2> inside col-1
      const titleMatch = card.match(/class="col-1">[\s\S]*?<h2[^>]*>([\s\S]*?)<\/h2>/i);
      if (!titleMatch) continue;
      const rawTitle = titleMatch[1]
        .replace(/<br\s*\/?>/gi, ' – ')
        .replace(/<[^>]+>/g, '')
        .replace(/&#8211;/g, '–')
        .replace(/&#8212;/g, '—')
        .replace(/&#038;/g, '&')
        .replace(/&#8217;/g, "'")
        .replace(/&amp;/g, '&')
        .replace(/\s+/g, ' ')
        .trim();
      if (!rawTitle) continue;

      // Extract category from category-title div. Absent/unmatched categories fall through
      // to 'other' as a review-needed signal (see specs/categorizer-audit-2026-05-14.md).
      const catMatch = card.match(/class="category-title"[^>]*>([^<]+)/i);
      const type = catMatch ? categoryToType(catMatch[1]) : 'other';

      events.push({
        title: rawTitle,
        description: '',
        start_date: startDate,
        time: null,
        url: eventUrl,
        venue_name: 'Μέγαρο Μουσικής Αθηνών',
        type,
        price_type: 'with-ticket'
      });
    }

    // Deduplicate by URL + date
    const seen = new Set<string>();
    const deduped = events.filter(e => {
      const key = `${e.url}|${e.start_date}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return deduped;
}

export function toDbEvent(event: ScrapedEvent): Partial<Event> {
  return {
    id: generateEventId(event.title, event.start_date),
    title: event.title,
    description: event.description,
    startDate: event.time ? `${event.start_date}T${event.time}:00+03:00` : event.start_date,
    type: event.type,
    genres: ['classical'],
    venue: {
      name: event.venue_name,
      address: 'Βασιλίσσης Σοφίας & Κόκκαλη',
      neighborhood: 'Kolonaki'
    },
    price: { type: event.price_type, currency: 'EUR' },
    url: event.url,
    source: 'megaron.gr'
  };
}

async function main() {
  console.log('🎵 Megaron Mousikis Event Scraper');
  console.log('='.repeat(40));

  const scrapedEvents = await scrapeMegaron();

  console.log(`\n📊 Found ${scrapedEvents.length} events\n`);

  if (scrapedEvents.length > 0) {
    console.log('Events:');
    for (const event of scrapedEvents) {
      console.log(`  - ${event.title}`);
      console.log(`    ${event.start_date} @ ${event.venue_name}`);
    }
  }

  // Save to database
  console.log('\n💾 Saving to database...');
  let saved = 0;

  for (const event of scrapedEvents) {
    try {
      const dbEvent = toDbEvent(event);

      const result = upsertEvent(dbEvent as Event);
      if (result.success) {
        info(SOURCE_ID, `Saved: ${event.title}`);
        saved++;
      }
    } catch (error) {
      logError(SOURCE_ID, `Failed to save ${event.title}: ${error}`);
    }
  }

  console.log(`✅ Saved ${saved} events`);
}

if (import.meta.main) {
  main().catch(console.error);
}
