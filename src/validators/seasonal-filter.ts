/**
 * Seasonal Venue Filter
 *
 * Validates events based on seasonal venue operations.
 * Uses config/seasonal-rules.json to determine:
 * - Which venues are closed in summer (e.g., Half Note, Stoa Athanaton)
 * - Which venues only operate in summer (e.g., Bolivar, Astir Beach)
 *
 * Returns rejection reason if event should be filtered out.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const CONFIG_PATH = join(import.meta.dir, '../../config/seasonal-rules.json');

interface SeasonalConfig {
  seasons: {
    summer: {
      months: number[];
      inactive_venues: string[];
      priority_venues: string[];
    };
    winter: {
      months: number[];
      full_operations: boolean;
    };
  };
  venue_seasonal_status: Record<string, {
    type: 'seasonal' | 'year_round';
    open_months: number[];
    closed_months: number[];
    note?: string;
  }>;
  validation_rules: {
    reject_if_closed: boolean;
    warn_if_seasonal_mismatch: boolean;
    log_seasonal_rejections: boolean;
  };
}

let config: SeasonalConfig | null = null;

/**
 * Load seasonal rules config
 */
function loadConfig(): SeasonalConfig {
  if (config) return config;

  try {
    const content = readFileSync(CONFIG_PATH, 'utf-8');
    config = JSON.parse(content) as SeasonalConfig;
    return config;
  } catch (e) {
    // Return permissive config if file doesn't exist
    config = {
      seasons: {
        summer: { months: [5, 6, 7, 8, 9], inactive_venues: [], priority_venues: [] },
        winter: { months: [10, 11, 12, 1, 2, 3, 4], full_operations: true }
      },
      venue_seasonal_status: {},
      validation_rules: {
        reject_if_closed: true,
        warn_if_seasonal_mismatch: true,
        log_seasonal_rejections: true
      }
    };
    return config;
  }
}

/**
 * Get current season based on month
 */
function getCurrentSeason(month: number): 'summer' | 'winter' {
  const cfg = loadConfig();
  return cfg.seasons.summer.months.includes(month) ? 'summer' : 'winter';
}

/**
 * Check if a venue is open on a specific date
 */
export function isVenueOpenOnDate(venueName: string, date: Date): {
  isOpen: boolean;
  reason?: string;
} {
  const cfg = loadConfig();
  const month = date.getMonth() + 1; // JavaScript months are 0-indexed

  // Normalize venue name for matching
  const normalizedVenue = venueName.toLowerCase().trim();

  // Check exact venue status
  for (const [configVenue, status] of Object.entries(cfg.venue_seasonal_status)) {
    if (normalizedVenue.includes(configVenue.toLowerCase())) {
      if (status.closed_months.includes(month)) {
        return {
          isOpen: false,
          reason: `${venueName} is closed in ${getMonthName(month)} (${status.note || 'seasonal closure'})`
        };
      }
      return { isOpen: true };
    }
  }

  // Check summer inactive venues
  const season = getCurrentSeason(month);
  if (season === 'summer') {
    for (const inactiveVenue of cfg.seasons.summer.inactive_venues) {
      if (normalizedVenue.includes(inactiveVenue.toLowerCase())) {
        return {
          isOpen: false,
          reason: `${venueName} is typically closed during summer months`
        };
      }
    }
  }

  // Default: assume venue is open
  return { isOpen: true };
}

/**
 * Validate an event against seasonal rules
 * Returns null if valid, or rejection reason if should be filtered
 */
export function validateSeasonalEvent(
  venueName: string,
  eventDate: string | Date
): { valid: boolean; reason?: string; warning?: string } {
  const cfg = loadConfig();

  // Parse date if string
  const date = typeof eventDate === 'string' ? new Date(eventDate) : eventDate;

  // Check if venue is open
  const venueStatus = isVenueOpenOnDate(venueName, date);

  if (!venueStatus.isOpen && cfg.validation_rules.reject_if_closed) {
    if (cfg.validation_rules.log_seasonal_rejections) {
      console.log(`[SEASONAL] Rejected: ${venueStatus.reason}`);
    }
    return {
      valid: false,
      reason: venueStatus.reason
    };
  }

  if (!venueStatus.isOpen && cfg.validation_rules.warn_if_seasonal_mismatch) {
    return {
      valid: true,
      warning: venueStatus.reason
    };
  }

  return { valid: true };
}

/**
 * Get month name for logging
 */
function getMonthName(month: number): string {
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  return months[month - 1] || 'Unknown';
}

/**
 * Clear config cache (for testing)
 */
export function clearSeasonalConfigCache(): void {
  config = null;
}

/**
 * Check if current date is in summer season
 */
export function isSummerSeason(date?: Date): boolean {
  const d = date || new Date();
  const month = d.getMonth() + 1;
  return getCurrentSeason(month) === 'summer';
}

/**
 * Get priority venues for current season
 */
export function getSeasonalPriorityVenues(): string[] {
  const cfg = loadConfig();
  const season = getCurrentSeason(new Date().getMonth() + 1);

  if (season === 'summer') {
    return cfg.seasons.summer.priority_venues || [];
  }

  return [];
}
