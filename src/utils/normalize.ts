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
  const slug = raw.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return `${slug}-${raw.date}`;
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
  if (priceString.toLowerCase() === 'free') {
    return {
      type: 'free'
    };
  }

  // Extract price range (e.g., "€8-€10" or "€50-€150")
  const match = priceString.match(/€(\d+)(?:-€(\d+))?/);
  if (match) {
    const amount = parseInt(match[1]);
    return {
      type: 'paid',
      amount,
      currency: 'EUR',
      range: priceString
    };
  }

  return {
    type: 'paid',
    range: priceString,
    currency: 'EUR'
  };
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

  if (price.type === 'free') {
    tags.push('free');
  }

  return tags;
}
