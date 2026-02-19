// Normalize raw sample events to Schema.org format

import type { RawEvent, Event, EventType, Venue, Price } from '../types';

const VENUE_COORDINATES: Record<string, { lat: number; lon: number; neighborhood?: string }> = {
  'Athens Concert Hall (Megaron)': { lat: 37.9813, lon: 23.7584, neighborhood: 'Kolonaki' },
  'Panathenaic Stadium': { lat: 37.9682, lon: 23.7408, neighborhood: 'Pangrati' },
  'Gagosian Athens': { lat: 37.9749, lon: 23.7341, neighborhood: 'Kolonaki' },
  'Megaron Athens Concert Hall': { lat: 37.9813, lon: 23.7584, neighborhood: 'Kolonaki' },
  'Technopolis City of Athens': { lat: 37.9785, lon: 23.7152, neighborhood: 'Gazi' },
  'Andie Art Gallery': { lat: 37.9838, lon: 23.7275, neighborhood: 'Psyrri' },
  'Floyd Live Music Venue': { lat: 37.9838, lon: 23.7275, neighborhood: 'Athens' },
  'Onassis Stegi': { lat: 37.9540, lon: 23.7404, neighborhood: 'Neos Kosmos' },
  'Arch Club': { lat: 37.9838, lon: 23.7275, neighborhood: 'Athens' },
  'Gazarte Ground Stage': { lat: 37.9791, lon: 23.7164, neighborhood: 'Gazi' },
  'Gazarte Roof Stage': { lat: 37.9791, lon: 23.7164, neighborhood: 'Gazi' },
  'Gazarte Main Stage': { lat: 37.9791, lon: 23.7164, neighborhood: 'Gazi' },
  'Fuzz Club': { lat: 37.9815, lon: 23.7220, neighborhood: 'Exarcheia' },
  'Half Note Jazz Club': { lat: 37.9648, lon: 23.7432, neighborhood: 'Mets' },
  'Gagarin 205': { lat: 38.0067, lon: 23.7282, neighborhood: 'Athens' },
  'Parnassos Literary Society': { lat: 37.9794, lon: 23.7268, neighborhood: 'Syntagma' },
  'Onassis Ready': { lat: 37.9540, lon: 23.7404, neighborhood: 'Athens' }
};

export function normalizeEvents(rawEvents: { events: RawEvent[] }): Event[] {
  const now = new Date().toISOString();

  return rawEvents.events.map((raw, index) => {
    const id = generateId(raw);
    const type = normalizeType(raw.type);
    const venue = normalizeVenue(raw.venue, raw.location);
    const price = normalizePrice(raw.price);
    const startDate = normalizeDate(raw.date, raw.time);

    return {
      "@context": "https://schema.org",
      "@type": getSchemaType(type),
      id,
      title: raw.title,
      description: raw.description,
      startDate,
      type,
      genres: [raw.genre],
      tags: generateTags(price, type),
      venue,
      price,
      url: raw.url,
      source: raw.source,
      createdAt: now,
      updatedAt: now,
      language: "en"
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
  // Combine date and time into ISO 8601 format
  const timeString = time || '20:00';
  return `${date}T${timeString}:00+03:00`; // Athens timezone (UTC+3 in summer)
}

function getSchemaType(type: EventType): string {
  const schemaMap: Record<EventType, string> = {
    'concert': 'MusicEvent',
    'exhibition': 'ExhibitionEvent',
    'cinema': 'ScreeningEvent',
    'theater': 'TheaterEvent',
    'performance': 'PerformanceEvent',
    'workshop': 'EducationEvent',
    'other': 'Event'
  };
  return schemaMap[type] || 'Event';
}

function generateTags(price: Price, type: EventType): string[] {
  const tags: string[] = [];

  if (price.type === 'open') {
    tags.push('open');
  }

  return tags;
}
