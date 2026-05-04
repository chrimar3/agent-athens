/**
 * Editorial content loader for cross-cutting content:
 * pull quotes, featured event vignettes, and per-hub section editorials.
 *
 * Reads from config/editorial-content.json with build-time caching.
 * Gracefully returns empty results when config is missing.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import type { Locale } from '../i18n/strings';

// ── Types ──────────────────────────────────────────────

interface PullQuote {
  textEl: string;
  textEn: string;
  hubs: string[];
  season: string | null;
}

interface Vignette {
  vignetteEl: string;
  vignetteEn: string;
  // S101a: optional date window for editorial picks. When present, the entry is
  // only "live" between validFrom and validUntil (both inclusive, ISO YYYY-MM-DD).
  // Entries without these fields keep the always-return behavior for backward
  // compat with non-pick featured vignettes.
  validFrom?: string;
  validUntil?: string;
  rank?: number;
}

interface SectionEditorial {
  textEl: string;
  textEn: string;
}

interface EditorialContent {
  pullQuotes: PullQuote[];
  featuredEvents: Record<string, Vignette>;
  sectionEditorials: Record<string, SectionEditorial>;
}

// ── Cached loader ──────────────────────────────────────

let _cache: EditorialContent | null = null;

function loadEditorialContent(): EditorialContent {
  if (_cache) return _cache;
  try {
    const raw = readFileSync(
      join(import.meta.dir, '../../config/editorial-content.json'),
      'utf-8'
    );
    _cache = JSON.parse(raw) as EditorialContent;
    return _cache;
  } catch {
    // Config missing or malformed — return empty structure
    return { pullQuotes: [], featuredEvents: {}, sectionEditorials: {} };
  }
}

// ── Public API ─────────────────────────────────────────

/**
 * Returns locale-appropriate pull quote texts for a given hub.
 * Returns [] if no quotes match or config is missing.
 */
export function getPullQuotes(hub: string, locale: Locale): string[] {
  const content = loadEditorialContent();
  const key = locale === 'el' ? 'textEl' : 'textEn';
  return content.pullQuotes
    .filter((q) => q.hubs.includes(hub))
    .map((q) => q[key]);
}

/**
 * Returns the locale-appropriate vignette for a featured event.
 * Returns null if event ID is not in editorial content, OR if the entry has a
 * date window (validFrom/validUntil) and currentDate falls outside it.
 *
 * Entries without validFrom/validUntil are always returned (backward-compat for
 * non-pick featured vignettes seeded before S101a).
 *
 * @param currentDate ISO YYYY-MM-DD (Athens local). Defaults to today in
 *                    Europe/Athens. Pass explicit date for deterministic tests.
 */
export function getFeaturedVignette(
  eventId: string,
  locale: Locale,
  currentDate?: string
): string | null {
  const content = loadEditorialContent();
  const entry = content.featuredEvents[eventId];
  if (!entry) return null;

  if (entry.validFrom || entry.validUntil) {
    const today = currentDate ?? new Date().toLocaleDateString('en-CA', {
      timeZone: 'Europe/Athens',
    });
    if (entry.validFrom && today < entry.validFrom) return null;
    if (entry.validUntil && today > entry.validUntil) return null;
  }

  return locale === 'el' ? entry.vignetteEl : entry.vignetteEn;
}

/**
 * Returns the editorial pick rank for an event, or null if no current pick.
 * Same date-window semantics as getFeaturedVignette: entry must be in-window
 * (or have no window fields). Returns null when entry has no rank set.
 *
 * Used by hub-page.ts to decide which comparison-table rows get the ★ marker.
 */
export function getFeaturedPickRank(
  eventId: string,
  currentDate?: string
): number | null {
  const content = loadEditorialContent();
  const entry = content.featuredEvents[eventId];
  if (!entry) return null;
  if (typeof entry.rank !== 'number') return null;

  if (entry.validFrom || entry.validUntil) {
    const today = currentDate ?? new Date().toLocaleDateString('en-CA', {
      timeZone: 'Europe/Athens',
    });
    if (entry.validFrom && today < entry.validFrom) return null;
    if (entry.validUntil && today > entry.validUntil) return null;
  }

  return entry.rank;
}

/**
 * Returns the locale-appropriate section editorial for a hub.
 * Returns null if hub has no editorial content.
 */
export function getSectionEditorial(hub: string, locale: Locale): string | null {
  const content = loadEditorialContent();
  const entry = content.sectionEditorials[hub];
  if (!entry) return null;
  return locale === 'el' ? entry.textEl : entry.textEn;
}
