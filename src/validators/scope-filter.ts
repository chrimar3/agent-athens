/**
 * Scope Filter - Excludes non-cultural events from the database
 *
 * Filters out:
 * - URLs in deny-listed paths (e.g., /tickets/sports/) — source-boundary policy, not overridable
 * - Sports events (basketball, football, etc.)
 * - Corporate events (conferences, meetings, etc.)
 * - Personal events (weddings, baptisms, etc.)
 * - Religious services
 *
 * Allows dance events (ballet, tango, contemporary) via override keywords (keyword/venue layer only)
 */

import { readFileSync } from 'fs';
import { join } from 'path';

interface ScopeConfig {
  excludedKeywords: string[];
  excludedVenues: string[];
  allowedKeywordsOverride: string[];
  excludedUrlPatterns?: string[];
  excludedTitlePatterns?: string[];
  rejectTitleEqualsVenue?: boolean;
}

/** Normalize a title/venue for artifact comparison: trim + collapse whitespace + lowercase. */
function normalizeForCompare(s: string): string {
  return s.trim().replace(/\s+/g, ' ').toLowerCase();
}

// Load scope configuration
const configPath = join(import.meta.dir, '../../config/event-scope.json');
const scopeConfig: ScopeConfig = JSON.parse(readFileSync(configPath, 'utf-8'));

export interface ScopeResult {
  inScope: boolean;
  reason?: string;
}

/**
 * Check if an event should be excluded from the cultural events database
 *
 * @param event - Event with title, venue, optional description, optional source URL
 * @returns ScopeResult indicating if event is in scope
 */
export function shouldExcludeEvent(event: {
  title: string;
  venue?: string;
  description?: string;
  url?: string;
}): ScopeResult {
  // URL-path deny-list runs first: source-boundary policy, not defeatable by allowedKeywordsOverride.
  // A URL like /tickets/sports/ is out of scope regardless of what the title or venue claims.
  if (event.url && scopeConfig.excludedUrlPatterns) {
    for (const pattern of scopeConfig.excludedUrlPatterns) {
      if (event.url.includes(pattern)) {
        return { inScope: false, reason: `excluded_url_pattern:${pattern}` };
      }
    }
  }

  // Scraper-artifact rejections run before allowedKeywordsOverride: filter-UI
  // strings and bare venue-name titles are never real events, so no content-level
  // override should resurrect them (mirrors the URL deny-list's not-overridable policy).
  const titleNorm = normalizeForCompare(event.title || '');

  if (scopeConfig.excludedTitlePatterns) {
    for (const pattern of scopeConfig.excludedTitlePatterns) {
      if (titleNorm.includes(normalizeForCompare(pattern))) {
        return { inScope: false, reason: `excluded_title_pattern:${pattern}` };
      }
    }
  }

  if (scopeConfig.rejectTitleEqualsVenue && event.venue) {
    if (titleNorm.length > 0 && titleNorm === normalizeForCompare(event.venue)) {
      return { inScope: false, reason: 'title_equals_venue' };
    }
  }

  const text = `${event.title} ${event.description || ''}`.toLowerCase();
  const venue = (event.venue || '').toLowerCase();

  // Check override keywords first (allow dance events at sports venues, etc.)
  for (const keyword of scopeConfig.allowedKeywordsOverride) {
    if (text.includes(keyword.toLowerCase())) {
      return { inScope: true };
    }
  }

  // Check excluded venues (sports stadiums, etc.)
  for (const excludedVenue of scopeConfig.excludedVenues) {
    if (venue.includes(excludedVenue.toLowerCase())) {
      return { inScope: false, reason: `excluded_venue:${excludedVenue}` };
    }
  }

  // Check excluded keywords (sports, corporate, religious, etc.)
  for (const keyword of scopeConfig.excludedKeywords) {
    if (text.includes(keyword.toLowerCase())) {
      return { inScope: false, reason: `excluded_keyword:${keyword}` };
    }
  }

  return { inScope: true };
}

/**
 * Filter an array of events, returning only in-scope cultural events
 *
 * @param events - Array of events to filter
 * @returns Filtered array of in-scope events
 */
export function filterInScopeEvents<T extends { title: string; venue_name?: string; description?: string; url?: string }>(
  events: T[]
): { inScope: T[]; excluded: Array<{ event: T; reason: string }> } {
  const inScope: T[] = [];
  const excluded: Array<{ event: T; reason: string }> = [];

  for (const event of events) {
    const result = shouldExcludeEvent({
      title: event.title,
      venue: event.venue_name,
      description: event.description,
      url: event.url
    });

    if (result.inScope) {
      inScope.push(event);
    } else {
      excluded.push({ event, reason: result.reason || 'unknown' });
    }
  }

  return { inScope, excluded };
}
