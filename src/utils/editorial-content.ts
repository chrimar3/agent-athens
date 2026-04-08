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
 * Returns null if event ID is not in editorial content.
 */
export function getFeaturedVignette(eventId: string, locale: Locale): string | null {
  const content = loadEditorialContent();
  const entry = content.featuredEvents[eventId];
  if (!entry) return null;
  return locale === 'el' ? entry.vignetteEl : entry.vignetteEn;
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
