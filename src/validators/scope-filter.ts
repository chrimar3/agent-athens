/**
 * Scope Filter - Excludes non-cultural events from the database
 *
 * Filters out:
 * - Sports events (basketball, football, etc.)
 * - Corporate events (conferences, meetings, etc.)
 * - Personal events (weddings, baptisms, etc.)
 * - Religious services
 *
 * Allows dance events (ballet, tango, contemporary) via override keywords
 */

import { readFileSync } from 'fs';
import { join } from 'path';

interface ScopeConfig {
  excludedKeywords: string[];
  excludedVenues: string[];
  allowedKeywordsOverride: string[];
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
 * @param event - Event with title, venue, and optional description
 * @returns ScopeResult indicating if event is in scope
 */
export function shouldExcludeEvent(event: {
  title: string;
  venue?: string;
  description?: string;
}): ScopeResult {
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
export function filterInScopeEvents<T extends { title: string; venue_name?: string; description?: string }>(
  events: T[]
): { inScope: T[]; excluded: Array<{ event: T; reason: string }> } {
  const inScope: T[] = [];
  const excluded: Array<{ event: T; reason: string }> = [];

  for (const event of events) {
    const result = shouldExcludeEvent({
      title: event.title,
      venue: event.venue_name,
      description: event.description
    });

    if (result.inScope) {
      inScope.push(event);
    } else {
      excluded.push({ event, reason: result.reason || 'unknown' });
    }
  }

  return { inScope, excluded };
}
