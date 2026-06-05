// Normalize raw sample events to Schema.org format

import { readFileSync } from 'fs';
import { join } from 'path';
import type { RawEvent, Event, EventType, Venue, Price } from '../types';
import { resolveEventSchemaType } from './comedy-format';
import { normalizeDateField } from './date-format';

// Load venue coordinates from canonical source (venues-master.json)
// This replaces the old 18-entry hardcoded map with all 80+ master venues
const masterVenuesRaw: Record<string, { lat: number; lng: number; neighborhood: string; name_en?: string }> = JSON.parse(
  readFileSync(join(import.meta.dir, '../../data/venues-master.json'), 'utf-8')
);
const VENUE_COORDINATES: Record<string, { lat: number; lon: number; neighborhood?: string }> = {};
for (const [key, venue] of Object.entries(masterVenuesRaw)) {
  const coords = { lat: venue.lat, lon: venue.lng, neighborhood: venue.neighborhood };
  VENUE_COORDINATES[key] = coords;
  // Also index by English name for scrapers that use English venue names
  if (venue.name_en && venue.name_en !== key) {
    VENUE_COORDINATES[venue.name_en] = coords;
  }
}

export function normalizeEvents(rawEvents: { events: RawEvent[] }): Event[] {
  const now = new Date().toISOString();

  return rawEvents.events.map((raw, index) => {
    const id = generateId(raw);
    const type = normalizeType(raw.type);
    const venue = normalizeVenue(raw.venue, raw.location);
    const price = normalizePrice(raw.price);
    const startDate = normalizeDate(raw.date, raw.time);
    // S175: compute signal fields before @type — comedy-format resolver
    // reads title/tags/genres/venue (parse-before-assign, same as rowToEvent).
    const genres = [raw.genre];
    const tags = generateTags(price, type);

    return {
      "@context": "https://schema.org",
      "@type": resolveEventSchemaType({ title: raw.title, type, tags, genres, venue }),
      id,
      title: raw.title,
      description: raw.description,
      startDate,
      type,
      genres,
      tags,
      venue,
      price,
      url: raw.url,
      source: raw.source,
      createdAt: now,
      updatedAt: now,
      language: "en",
      hasNativeGreek: false,
      ticketUrlResolved: null,
    };
  });
}

function generateId(raw: RawEvent): string {
  // FR-1.1: Deterministic ID Generation with normalization
  // This ensures same event from different sources produces identical ID

  // Normalize title: lowercase, collapse whitespace, remove punctuation (keep Greek letters)
  const normalizedTitle = (raw.title || '')
    .toLowerCase()
    .replace(/[^\w\sα-ωά-ώϊϋΐΰ]/g, '') // Keep alphanumeric + Greek letters
    .replace(/\s+/g, ' ')
    .trim();

  // Normalize date: extract YYYY-MM-DD only (handle various formats)
  const dateStr = raw.date || '';
  let normalizedDate = dateStr;
  // Handle ISO format with time
  if (dateStr.includes('T')) {
    normalizedDate = dateStr.split('T')[0];
  }
  // Handle DD/MM/YYYY format
  else if (dateStr.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
    const [day, month, year] = dateStr.split('/');
    normalizedDate = `${year}-${month}-${day}`;
  }
  // Convert any remaining slashes to dashes
  normalizedDate = normalizedDate.replace(/\//g, '-');

  // Normalize venue: use venue, location, or venue_name field
  // Remove stage suffixes, lowercase
  const venueRaw = raw.venue || raw.location || '';
  const normalizedVenue = venueRaw
    .toLowerCase()
    .replace(/\s+(main|roof|ground|upper|lower)\s+stage/gi, '')
    .replace(/\s+-\s+(main|roof|ground)\s+stage/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  const input = `${normalizedTitle}|${normalizedDate}|${normalizedVenue}`;
  const hash = Bun.hash(input).toString(16).slice(0, 16);
  return hash;
}

function normalizeType(rawType: string): EventType {
  const typeMap: Record<string, EventType> = {
    'concert': 'concert',
    'exhibition': 'exhibition',
    'cinema': 'cinema',
    'theater': 'theater',
    'performance': 'performance',
    'workshop': 'workshop',
    'other': 'other'
  };
  return typeMap[rawType.toLowerCase()] || 'other';
}

function normalizeVenue(venueName: string, location: string): Venue {
  const coords = VENUE_COORDINATES[venueName] || { lat: 37.9838, lon: 23.7276 };

  return {
    name: venueName,
    address: location,
    neighborhood: coords.neighborhood,
    coordinates: {
      lat: coords.lat,
      lon: coords.lon
    }
  };
}

function normalizePrice(priceString: string): Price {
  if (!priceString) {
    return { type: 'with-ticket', currency: 'EUR' };
  }

  const lower = priceString.toLowerCase().trim();

  // Check for free/open events (multiple Greek and English variations)
  const freePatterns = [
    'free', 'open', 'δωρεάν', 'ελεύθερη είσοδος', 'είσοδος ελεύθερη',
    'ελεύθερη', 'free entry', 'free admission', 'no charge'
  ];
  if (freePatterns.some(pattern => lower.includes(pattern))) {
    return { type: 'open' };
  }

  // Comprehensive price patterns (Issue 3 fix)
  const patterns: Array<{ regex: RegExp; handler: (match: RegExpMatchArray) => Price }> = [
    // €10 or €10.00 or € 10
    {
      regex: /€\s*(\d+(?:[.,]\d{2})?)/,
      handler: (match) => ({
        type: 'with-ticket',
        amount: parseFloat(match[1].replace(',', '.')),
        currency: 'EUR',
        range: `€${match[1]}`
      })
    },
    // 10€ or 10.00€ or 10 €
    {
      regex: /(\d+(?:[.,]\d{2})?)\s*€/,
      handler: (match) => ({
        type: 'with-ticket',
        amount: parseFloat(match[1].replace(',', '.')),
        currency: 'EUR',
        range: `€${match[1]}`
      })
    },
    // 10 EUR or 10 ευρώ
    {
      regex: /(\d+(?:[.,]\d{2})?)\s*(?:eur|ευρώ)/i,
      handler: (match) => ({
        type: 'with-ticket',
        amount: parseFloat(match[1].replace(',', '.')),
        currency: 'EUR',
        range: `€${match[1]}`
      })
    },
    // από 10€ or from €10 or from 10€
    {
      regex: /(?:από|from)\s*€?\s*(\d+)/i,
      handler: (match) => ({
        type: 'with-ticket',
        amount: parseInt(match[1]),
        currency: 'EUR',
        range: `από €${match[1]}`
      })
    },
    // 15-25€ (range after)
    {
      regex: /(\d+)\s*-\s*(\d+)\s*€/,
      handler: (match) => ({
        type: 'with-ticket',
        amount: parseInt(match[1]),
        currency: 'EUR',
        range: `€${match[1]}-€${match[2]}`
      })
    },
    // €15-€25 or €15-25
    {
      regex: /€\s*(\d+)\s*-\s*€?\s*(\d+)/,
      handler: (match) => ({
        type: 'with-ticket',
        amount: parseInt(match[1]),
        currency: 'EUR',
        range: `€${match[1]}-€${match[2]}`
      })
    }
  ];

  for (const { regex, handler } of patterns) {
    const match = priceString.match(regex);
    if (match) {
      return handler(match);
    }
  }

  // Fallback: try to find any number as price
  const numberMatch = priceString.match(/(\d+)/);
  if (numberMatch) {
    return {
      type: 'with-ticket',
      amount: parseInt(numberMatch[1]),
      currency: 'EUR',
      range: priceString
    };
  }

  // No price found - mark as with-ticket but no amount
  return { type: 'with-ticket', range: priceString, currency: 'EUR' };
}

function normalizeDate(date: string, time?: string): string {
  // Produce canonical naive-local (no timezone offset). DST offset is applied
  // at render time by formatSchemaDate(), never stored on-disk.
  const timeString = time || '20:00';
  return normalizeDateField(`${date}T${timeString}:00`);
}

function generateTags(price: Price, type: EventType): string[] {
  const tags: string[] = [];

  if (price.type === 'open') {
    tags.push('open');
  }

  return tags;
}
