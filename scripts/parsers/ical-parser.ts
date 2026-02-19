/**
 * iCal Parser
 *
 * Parses iCalendar (.ics) format event feeds
 * Primary use: Fuzz Club events feed
 */

import ical from 'node-ical';
import type { RawEvent } from '../../src/types.js';

export interface ICalParserOptions {
  source: string;
  language?: string;
}

/**
 * Parse iCal feed content and extract events
 *
 * @param icalContent - Raw .ics file content
 * @param options - Parser options (source name, language)
 * @returns Array of RawEvent objects
 */
export async function parseICalFeed(
  icalContent: string,
  options: ICalParserOptions
): Promise<RawEvent[]> {
  const events: RawEvent[] = [];

  try {
    // Parse iCal content
    const parsed = ical.parseICS(icalContent);

    // Extract VEVENT entries
    for (const key in parsed) {
      const event = parsed[key];

      // Only process VEVENT type (ignore VTIMEZONE, VCALENDAR, etc.)
      if (event.type !== 'VEVENT') {
        continue;
      }

      // Extract event data
      const rawEvent: RawEvent = {
        title: cleanText(event.summary || 'Untitled Event'),
        date: formatDate(event.start),
        time: formatTime(event.start),
        venue: extractVenue(event.location || ''),
        location: cleanText(event.location || ''),
        type: inferType(event.summary || '', event.description || ''),
        genre: inferGenre(event.summary || '', event.description || ''),
        price: extractPrice(event.description || ''),
        description: cleanText(event.description || ''),
        url: event.url || undefined,
        source: options.source
      };

      events.push(rawEvent);
    }

    return events;
  } catch (error) {
    console.error(`[ical-parser] Failed to parse iCal content:`, error);
    throw new Error(`iCal parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Format date to YYYY-MM-DD
 */
function formatDate(date: Date | undefined): string {
  if (!date) return new Date().toISOString().split('T')[0];

  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

/**
 * Format time to HH:MM
 */
function formatTime(date: Date | undefined): string | undefined {
  if (!date) return undefined;

  const d = new Date(date);
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');

  return `${hours}:${minutes}`;
}

/**
 * Clean text: remove HTML tags, extra whitespace, normalize
 */
function cleanText(text: string): string {
  return text
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .replace(/\\n/g, ' ')     // Replace \n with space
    .replace(/\s+/g, ' ')     // Collapse whitespace
    .trim();
}

/**
 * Extract venue name from location field
 * Example: "Fuzz Club, Pireos 209" -> "Fuzz Club"
 */
function extractVenue(location: string): string {
  // If location contains comma, take first part as venue
  if (location.includes(',')) {
    return location.split(',')[0].trim();
  }

  // Otherwise return full location
  return location.trim() || 'TBD';
}

/**
 * Infer event type from title and description
 */
function inferType(title: string, description: string): string {
  const combined = `${title} ${description}`.toLowerCase();

  // Check for concert-related keywords
  if (combined.match(/concert|live|band|music|gig|show|συναυλία/)) {
    return 'concert';
  }

  // Check for exhibition
  if (combined.match(/exhibition|expo|gallery|έκθεση/)) {
    return 'exhibition';
  }

  // Check for cinema
  if (combined.match(/cinema|movie|film|screening|σινεμά|ταινία/)) {
    return 'cinema';
  }

  // Check for theater
  if (combined.match(/theater|theatre|play|drama|θέατρο|παράσταση/)) {
    return 'theater';
  }

  // Check for performance/dance
  if (combined.match(/performance|dance|ballet|χορός/)) {
    return 'performance';
  }

  // Check for workshop
  if (combined.match(/workshop|seminar|class|εργαστήριο/)) {
    return 'workshop';
  }

  // Default to 'concert' for Fuzz Club (music venue)
  return 'concert';
}

/**
 * Infer genre from title and description
 */
function inferGenre(title: string, description: string): string {
  const combined = `${title} ${description}`.toLowerCase();

  // Common music genres
  const genres = [
    'jazz', 'rock', 'pop', 'electronic', 'techno', 'house',
    'indie', 'alternative', 'metal', 'punk', 'blues', 'soul',
    'funk', 'hip-hop', 'rap', 'reggae', 'ska', 'folk',
    'classical', 'acoustic', 'experimental'
  ];

  for (const genre of genres) {
    if (combined.includes(genre)) {
      return genre;
    }
  }

  return 'music'; // Default genre
}

/**
 * Extract price information from description
 */
function extractPrice(description: string): string {
  const text = description.toLowerCase();

  // Check for free/open
  if (text.match(/free|δωρεάν|ελεύθερη είσοδος|χωρίς εισιτήριο/)) {
    return 'open';
  }

  // Extract price patterns (€10, 10€, 10 euro)
  const priceMatch = text.match(/€?\s*(\d+)\s*€?/);
  if (priceMatch) {
    return `€${priceMatch[1]}`;
  }

  // Extract range (€10-€20, 10-20€)
  const rangeMatch = text.match(/€?\s*(\d+)\s*-\s*(\d+)\s*€?/);
  if (rangeMatch) {
    return `€${rangeMatch[1]}-€${rangeMatch[2]}`;
  }

  // Default to unknown
  return 'with-ticket';
}

/**
 * Fetch and parse iCal feed from URL
 */
export async function fetchAndParseICalFeed(
  url: string,
  options: ICalParserOptions
): Promise<RawEvent[]> {
  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const icalContent = await response.text();
    return parseICalFeed(icalContent, options);
  } catch (error) {
    console.error(`[ical-parser] Failed to fetch iCal feed from ${url}:`, error);
    throw error;
  }
}
