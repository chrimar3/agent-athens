// i18n utilities for Greek-first, English-secondary strategy
// Date created: November 12, 2025

import type { Event } from '../types';
import { DateTime } from 'luxon';
import { SCHEMA_TYPE_MAP } from '../enrichment/quality-gates';

const ATHENS_TIMEZONE = 'Europe/Athens';

const GREEK_DAYS = ['Κυριακή', 'Δευτέρα', 'Τρίτη', 'Τετάρτη', 'Πέμπτη', 'Παρασκευή', 'Σάββατο'];
const GREEK_MONTHS = [
  'Ιανουαρίου', 'Φεβρουαρίου', 'Μαρτίου', 'Απριλίου', 'Μαΐου', 'Ιουνίου',
  'Ιουλίου', 'Αυγούστου', 'Σεπτεμβρίου', 'Οκτωβρίου', 'Νοεμβρίου', 'Δεκεμβρίου'
];

/**
 * Format date in Greek with proper Athens timezone
 * Example: "Τρίτη, 18 Νοεμβρίου 2025, 21:00"
 */
export function formatGreekDate(isoDate: string): string {
  const dt = DateTime.fromISO(isoDate).setZone(ATHENS_TIMEZONE);

  // luxon: 1=Mon, 2=Tue, ..., 7=Sun. Array: 0=Sun, 1=Mon, ..., 6=Sat
  const dayIndex = dt.weekday === 7 ? 0 : dt.weekday;
  const dayName = GREEK_DAYS[dayIndex];
  const day = dt.day;
  const month = GREEK_MONTHS[dt.month - 1];
  const year = dt.year;
  const time = dt.toFormat('HH:mm');

  return `${dayName}, ${day} ${month} ${year}, ${time}`;
}

/**
 * Format date string for display (e.g., "Τετάρτη 21 Ιανουαρίου")
 * Note: We parse the date portion directly because source data sometimes has
 * incorrect timezone offsets. The local date portion is correct.
 */
export function formatGreekDateOnly(isoDate: string): string {
  // Parse date directly from ISO string to avoid timezone conversion issues
  const dateMatch = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (dateMatch) {
    const [, year, month, day] = dateMatch;
    // Create a DateTime from the extracted date parts (treats as local)
    const dt = DateTime.fromObject(
      { year: parseInt(year), month: parseInt(month), day: parseInt(day) },
      { zone: ATHENS_TIMEZONE }
    );
    const dayIndex = dt.weekday === 7 ? 0 : dt.weekday;
    const dayName = GREEK_DAYS[dayIndex];
    const monthName = GREEK_MONTHS[dt.month - 1];
    return `${dayName} ${dt.day} ${monthName}`;
  }
  // Fallback
  const dt = DateTime.fromISO(isoDate).setZone(ATHENS_TIMEZONE);
  const dayIndex = dt.weekday === 7 ? 0 : dt.weekday;
  const dayName = GREEK_DAYS[dayIndex];
  const day = dt.day;
  const month = GREEK_MONTHS[dt.month - 1];
  return `${dayName} ${day} ${month}`;
}

/**
 * Format time string for display (e.g., "21:00")
 * Note: We extract the time directly from the ISO string because source data
 * sometimes has incorrect timezone offsets (e.g., +03:00 for winter dates).
 * The local time portion is correct, so we use it directly.
 */
export function formatGreekTime(isoDate: string): string {
  // Extract HH:MM directly from ISO string (format: YYYY-MM-DDTHH:MM:SS+TZ)
  const timeMatch = isoDate.match(/T(\d{2}:\d{2})/);
  if (timeMatch) {
    return timeMatch[1];
  }
  // Fallback to luxon parsing if no match
  const dt = DateTime.fromISO(isoDate).setZone(ATHENS_TIMEZONE);
  return dt.toFormat('HH:mm');
}

/**
 * Format price display in Greek
 */
export function formatPriceGreek(event: Event): string {
  if (event.price.type === 'open') {
    return 'Δωρεάν είσοδος';
  }

  if (event.price.type === 'donation') {
    return 'Ελεύθερη συνεισφορά';
  }

  if (event.price.amount) {
    return `€${event.price.amount}`;
  }

  if (event.price.range) {
    return event.price.range;
  }

  return 'Επί πληρωμή';
}

/**
 * Get the correct Athens timezone offset, accounting for DST
 */
function getAthensTimezoneOffset(date: Date): string {
  const year = date.getFullYear();
  // Last Sunday of March
  const marchLast = new Date(year, 3, 0);
  marchLast.setDate(marchLast.getDate() - marchLast.getDay());
  marchLast.setHours(3, 0, 0, 0);
  // Last Sunday of October
  const octoberLast = new Date(year, 10, 0);
  octoberLast.setDate(octoberLast.getDate() - octoberLast.getDay());
  octoberLast.setHours(3, 0, 0, 0);
  return (date >= marchLast && date < octoberLast) ? '+03:00' : '+02:00';
}

/**
 * Generate Schema.org JSON-LD (always in English for AI parsing)
 * This is critical: Schema.org should ALWAYS be English regardless of content language
 */
export function toSchemaOrg(event: Event): string {
  // Map event type to Schema.org type using complete mapping
  const schemaType = SCHEMA_TYPE_MAP[event.type] || 'Event';

  const schema = {
    "@context": "https://schema.org",
    "@type": schemaType,
    "name": event.title,
    "description": `${event.type} event in Athens featuring ${event.title}`,
    "startDate": event.startDate,
    "endDate": event.endDate || event.startDate,
    "eventStatus": "https://schema.org/EventScheduled",
    "eventAttendanceMode": "https://schema.org/OfflineEventAttendanceMode",
    "location": {
      "@type": "Place",
      "name": event.venue.name,
      "address": {
        "@type": "PostalAddress",
        "streetAddress": event.venue.address || "",
        "addressLocality": "Athens",
        "addressRegion": "Attica",
        "postalCode": "",
        "addressCountry": "GR"
      }
    }
  };

  // Add pricing — isAccessibleForFree + complete offers for ALL events
  schema['isAccessibleForFree'] = (event.price.type === 'open' || event.price.type === 'donation');

  if (event.price.type === 'open' || event.price.type === 'donation') {
    schema['offers'] = {
      "@type": "Offer",
      "price": "0",
      "priceCurrency": "EUR",
      "availability": "https://schema.org/InStock"
    };
  } else {
    schema['offers'] = {
      "@type": "Offer",
      "price": event.price.amount ? event.price.amount.toString() : "",
      "priceCurrency": event.price.currency || "EUR",
      "availability": "https://schema.org/InStock",
      "url": event.ticketUrl || event.url || ""
    };
  }

  return JSON.stringify(schema, null, 2);
}

/**
 * Translate event type to Greek
 */
export function translateTypeToGreek(type: string): string {
  const translations: Record<string, string> = {
    'concert': 'Συναυλία',
    'exhibition': 'Έκθεση',
    'theater': 'Θέατρο',
    'cinema': 'Κινηματογράφος',
    'performance': 'Παράσταση',
    'workshop': 'Εργαστήριο',
    'other': 'Εκδήλωση'
  };

  return translations[type] || type;
}

/**
 * Generate bilingual keywords for meta tags
 */
export function generateKeywords(event: Event): string {
  const keywords: string[] = [];

  // Event title
  keywords.push(event.title);

  // Type (both Greek and English)
  keywords.push(translateTypeToGreek(event.type));
  keywords.push(event.type);

  // Genres
  if (event.genres && event.genres.length > 0) {
    keywords.push(...event.genres);
  }

  // Venue
  keywords.push(event.venue.name);

  // Neighborhood (Greek and transliteration)
  if (event.venue.neighborhood) {
    keywords.push(event.venue.neighborhood);
  }

  // Location
  keywords.push('Αθήνα');
  keywords.push('Athens');

  // Common terms
  keywords.push('εκδήλωση');
  keywords.push('event');

  return keywords.join(', ');
}
