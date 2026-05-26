// Meta description generators for all page types
// Pure functions, no side effects — optimized for Google SERP (155-char limit)

import type { Event, EventType, Filters } from '../types';
import { ENGLISH_MONTHS_SHORT, parseISODate } from './format-date';
import { getLocalityName } from './schema-geo';

export interface VenueMetaInput {
  name: string;
  neighborhood?: string;
  events: Array<{ title: string; startDate: string }>;
  eventCount: number;
}

const META_CHAR_LIMIT = 155;

const LIVE_PREFIX_TYPES: Set<EventType> = new Set([
  'concert', 'dj_set', 'performance', 'show',
]);

const HUB_TYPE_TRANSLATIONS: Record<string, string> = {
  'concert': 'συναυλίες',
  'theater': 'θέατρο',
  'exhibition': 'εκθέσεις',
  'cinema': 'κινηματογράφος',
  'performance': 'παραστάσεις',
  'workshop': 'εργαστήρια',
};

const HUB_TIME_TRANSLATIONS: Record<string, string> = {
  'today': 'σήμερα',
  'tomorrow': 'αύριο',
  'this-week': 'αυτή την εβδομάδα',
  'this-weekend': 'αυτό το Σαββατοκύριακο',
  'this-month': 'αυτόν τον μήνα',
  'next-month': 'τον επόμενο μήνα',
};

// --- Internal helpers ---

/** Parse ISO date string and format as "Mar 15, 2026" */
export function formatDateShort(isoDate: string): string {
  const p = parseISODate(isoDate);
  if (!p || p.month < 1 || p.month > 12) return '';
  return `${ENGLISH_MONTHS_SHORT[p.month - 1]} ${p.day}, ${p.year}`;
}

/** Find last sentence boundary (. ! ?) before maxLen */
function truncateAtSentence(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  const slice = text.substring(0, maxLen);
  const lastBoundary = Math.max(
    slice.lastIndexOf('. '),
    slice.lastIndexOf('! '),
    slice.lastIndexOf('? '),
    slice.lastIndexOf('.'),
    slice.lastIndexOf('!'),
    slice.lastIndexOf('?'),
  );
  if (lastBoundary > 0) {
    return text.substring(0, lastBoundary + 1);
  }
  return enforceCharLimit(text, maxLen);
}

/** Hard truncation at word boundary + "..." */
function enforceCharLimit(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const truncated = text.substring(0, limit - 3);
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace > limit * 0.4) {
    return truncated.substring(0, lastSpace) + '...';
  }
  return truncated + '...';
}

/**
 * 1.5b: normalize enrichment prose for a single-line meta attribute — strip
 * markdown markers and HTML comments, collapse newlines/whitespace runs. A
 * leading newline in fullDescription is what produced multi-line, effectively-
 * empty meta content; markdown leakage ("**Postponed") and headings come from
 * the same surface. Composer works on this CLEAN text; escaping stays at the
 * emission seam (event-page.ts, 1.5a).
 */
function cleanForMeta(text: string): string {
  return text
    .replace(/<!--[\s\S]*?-->/g, '') // drop HTML comments (e.g. timeliness-expires)
    .replace(/[*_`]/g, '')           // drop bold/italic/code markers
    .replace(/^#{1,6}\s+/gm, '')     // drop ATX headings
    .replace(/\s+/g, ' ')            // collapse newlines/runs to single spaces
    .trim();
}

/**
 * 1.5b: final guard — collapse whitespace, then floor short output to >=120
 * chars (Bing) with a config-driven city tagline. enforceCharLimit caps the
 * padded result at META_CHAR_LIMIT so the tagline can't overrun the SERP limit.
 */
function padToFloor(result: string): string {
  const out = result.replace(/\s+/g, ' ').trim();
  if (out.length >= 120) return out;
  const tail = ` Cultural events in ${getLocalityName()} on Agent Athens.`;
  return enforceCharLimit(`${out}${tail}`, META_CHAR_LIMIT);
}

// --- Exported generators ---

export function generateEventMetaDescription(event: Event): string {
  // Enriched override: prefer fullDescription when available
  if (event.fullDescription && event.fullDescription.length > 100) {
    const clean = cleanForMeta(event.fullDescription);
    let body = truncateAtSentence(clean, 140);
    // Floor backstop: a sentence-boundary cut can land on an abbreviation
    // ("Mr.", "Theodosis P.") and yield a fragment — prefer a hard word-boundary
    // cut of the rich text over the tiny fragment.
    if (body.length < 120) body = enforceCharLimit(clean, META_CHAR_LIMIT - 16);
    let withSuffix = `${body} Updated daily.`;
    if (withSuffix.length > META_CHAR_LIMIT) {
      withSuffix = `${enforceCharLimit(clean, META_CHAR_LIMIT - 16)} Updated daily.`;
    }
    return padToFloor(withSuffix);
  }

  const SEP = ' \u2014 '; // en-dash with spaces
  const prefix = LIVE_PREFIX_TYPES.has(event.type) ? 'Live ' : '';
  const venue = event.venue.name;
  const neighborhood = event.venue.neighborhood;
  const dateShort = formatDateShort(event.startDate);
  const priceDisplay = getPriceDisplay(event);

  // Build full template: {Prefix}{Title} — {Venue}, {Neighborhood} — {Date} — {Price}
  const venuePart = neighborhood ? `${venue}, ${neighborhood}` : venue;

  const parts = [`${prefix}${event.title}`, venuePart, dateShort, priceDisplay];

  // Progressive truncation: drop price, then date, then neighborhood, then
  // hard-truncate the title — keep the longest variant that fits the SERP limit.
  let result = parts.join(SEP);
  if (result.length > META_CHAR_LIMIT) result = [parts[0], parts[1], parts[2]].join(SEP);
  if (result.length > META_CHAR_LIMIT) result = [parts[0], parts[1]].join(SEP);
  if (result.length > META_CHAR_LIMIT) result = [parts[0], venue].join(SEP);
  if (result.length > META_CHAR_LIMIT) result = enforceCharLimit(`${prefix}${event.title}`, META_CHAR_LIMIT);

  // 1.5b: floor short unenriched composites toward 120 (Bing); whitespace-finalized.
  return padToFloor(result);
}

function getPriceDisplay(event: Event): string {
  if (event.price.type === 'open' || event.price.type === 'donation') {
    return 'Open entry';
  }
  if (event.price.amount) {
    return `From \u20AC${event.price.amount}`;
  }
  return 'Tickets available';
}

export function generateHubMetaDescription(filters: Filters, eventCount: number): string {
  // Build: "{Count} {TypeLabel} in Athens {TimeRange}. Curated daily from 10+ venues. Open events highlighted."
  let typeLabel: string;
  if (filters.type && HUB_TYPE_TRANSLATIONS[filters.type]) {
    typeLabel = HUB_TYPE_TRANSLATIONS[filters.type];
  } else {
    typeLabel = 'εκδηλώσεις';
  }

  // Price qualifier
  const priceQualifier = filters.price === 'open' ? 'δωρεάν ' : '';

  // Genre qualifier
  const genreQualifier = filters.genre ? `${filters.genre.toLowerCase()} ` : '';

  // Time range
  const timeRange = (filters.time && filters.time !== 'all-events' && HUB_TIME_TRANSLATIONS[filters.time])
    ? ` ${HUB_TIME_TRANSLATIONS[filters.time]}`
    : '';

  const firstSentence = `${eventCount} ${priceQualifier}${genreQualifier}${typeLabel} στην Αθήνα${timeRange}.`;
  const secondSentence = 'Ενημέρωση κάθε μέρα από 10+ χώρους.';
  const thirdSentence = 'Συναυλίες, θέατρο, εκθέσεις, DJ sets.';

  let result = `${firstSentence} ${secondSentence} ${thirdSentence}`;
  if (result.length <= META_CHAR_LIMIT) return result;

  // Drop third sentence
  result = `${firstSentence} ${secondSentence}`;
  if (result.length <= META_CHAR_LIMIT) return result;

  // Drop second sentence
  result = firstSentence;
  if (result.length <= META_CHAR_LIMIT) return result;

  return enforceCharLimit(result, META_CHAR_LIMIT);
}

export function generateVenueMetaDescription(venue: VenueMetaInput): string {
  // Template: "{Count} upcoming events at {Name}, {Neighborhood}. Next: {Title} on {Date}."
  const locationPart = venue.neighborhood
    ? `${venue.name}, ${venue.neighborhood}`
    : venue.name;

  const countWord = venue.eventCount === 1 ? 'event' : 'events';
  const basePart = `${venue.eventCount} upcoming ${countWord} at ${locationPart}.`;

  if (venue.events.length === 0) {
    if (basePart.length <= META_CHAR_LIMIT) return basePart;
    return enforceCharLimit(basePart, META_CHAR_LIMIT);
  }

  const nextEvent = venue.events[0];
  const dateStr = formatDateShort(nextEvent.startDate);
  const nextPart = ` Next: ${nextEvent.title} on ${dateStr}.`;

  let result = basePart + nextPart;
  if (result.length <= META_CHAR_LIMIT) return result;

  // Truncate next-event title to fit
  const available = META_CHAR_LIMIT - basePart.length - ` Next:  on ${dateStr}.`.length;
  if (available > 10) {
    const truncTitle = enforceCharLimit(nextEvent.title, available);
    result = `${basePart} Next: ${truncTitle} on ${dateStr}.`;
    if (result.length <= META_CHAR_LIMIT) return result;
  }

  // Fall back to base only
  if (basePart.length <= META_CHAR_LIMIT) return basePart;
  return enforceCharLimit(basePart, META_CHAR_LIMIT);
}

export function generateVenueIndexMetaDescription(venueCount: number): string {
  const word = venueCount === 1 ? 'venue' : 'venues';
  return `${venueCount} event ${word} in Athens with upcoming concerts, exhibitions, performances. Updated daily.`;
}
