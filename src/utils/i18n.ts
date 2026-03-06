// i18n utilities for Greek-first, English-secondary strategy
// Date created: November 12, 2025

import type { Event } from '../types';
import { DateTime } from 'luxon';
import { ATHENS_TZ, GREEK_DAYS, GREEK_MONTHS, parseISODate, toAthensDateTime, weekdayIndex } from './format-date';

/**
 * Format date in Greek with proper Athens timezone
 * Example: "Τρίτη, 18 Νοεμβρίου 2025, 21:00"
 */
export function formatGreekDate(isoDate: string): string {
  const dt = DateTime.fromISO(isoDate).setZone(ATHENS_TZ);
  const dayName = GREEK_DAYS[weekdayIndex(dt.weekday)];
  const month = GREEK_MONTHS[dt.month - 1];
  const time = dt.toFormat('HH:mm');

  return `${dayName}, ${dt.day} ${month} ${dt.year}, ${time}`;
}

/**
 * Format date string for display (e.g., "Τετάρτη 21 Ιανουαρίου")
 * Note: We parse the date portion directly because source data sometimes has
 * incorrect timezone offsets. The local date portion is correct.
 */
export function formatGreekDateOnly(isoDate: string): string {
  const parts = parseISODate(isoDate);
  if (parts) {
    const dt = toAthensDateTime(parts);
    const dayName = GREEK_DAYS[weekdayIndex(dt.weekday)];
    return `${dayName} ${dt.day} ${GREEK_MONTHS[dt.month - 1]}`;
  }
  // Fallback
  const dt = DateTime.fromISO(isoDate).setZone(ATHENS_TZ);
  const dayName = GREEK_DAYS[weekdayIndex(dt.weekday)];
  return `${dayName} ${dt.day} ${GREEK_MONTHS[dt.month - 1]}`;
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
  const dt = DateTime.fromISO(isoDate).setZone(ATHENS_TZ);
  return dt.toFormat('HH:mm');
}

/**
 * Format price display in Greek
 */
export function formatPriceGreek(event: Event): string {
  if (event.price.type === 'open') {
    return 'Ελεύθερη είσοδος';
  }

  if (event.price.type === 'donation') {
    return 'Ελεύθερη συνεισφορά';
  }

  if (event.price.amount && event.price.amount > 0) {
    return `€${event.price.amount}`;
  }

  if (event.price.range) {
    // Normalize scraped "Δωρεάν" → "Ελεύθερη είσοδος" (spec: never "Δωρεάν")
    if (event.price.range === 'Δωρεάν') return 'Ελεύθερη είσοδος';
    return event.price.range;
  }

  return 'Επί πληρωμή';
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
