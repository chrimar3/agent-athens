/**
 * Shared date formatting constants and helpers.
 *
 * Single source of truth for month/day name arrays (Greek & English),
 * timezone constant, and ISO-date parsing helpers used across the codebase.
 */

import { DateTime } from 'luxon';

export const ATHENS_TZ = 'Europe/Athens';

// Greek
export const GREEK_DAYS = ['Κυριακή', 'Δευτέρα', 'Τρίτη', 'Τετάρτη', 'Πέμπτη', 'Παρασκευή', 'Σάββατο'];
export const GREEK_MONTHS = [
  'Ιανουαρίου', 'Φεβρουαρίου', 'Μαρτίου', 'Απριλίου', 'Μαΐου', 'Ιουνίου',
  'Ιουλίου', 'Αυγούστου', 'Σεπτεμβρίου', 'Οκτωβρίου', 'Νοεμβρίου', 'Δεκεμβρίου',
];
export const GREEK_MONTHS_SHORT = ['Ιαν', 'Φεβ', 'Μαρ', 'Απρ', 'Μάι', 'Ιούν', 'Ιούλ', 'Αύγ', 'Σεπ', 'Οκτ', 'Νοέ', 'Δεκ'];

// English
export const ENGLISH_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const ENGLISH_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
export const ENGLISH_MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Parse YYYY-MM-DD from ISO string without timezone conversion */
export function parseISODate(iso: string): { year: number; month: number; day: number } | null {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return { year: +m[1], month: +m[2], day: +m[3] };
}

/** Get Luxon DateTime in Athens timezone from parsed date parts */
export function toAthensDateTime(parts: { year: number; month: number; day: number }): DateTime {
  return DateTime.fromObject(parts, { zone: ATHENS_TZ });
}

/** Luxon weekday (1=Mon..7=Sun) → array index (0=Sun..6=Sat) */
export function weekdayIndex(luxonWeekday: number): number {
  return luxonWeekday === 7 ? 0 : luxonWeekday;
}
