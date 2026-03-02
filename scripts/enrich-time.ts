#!/usr/bin/env bun
/**
 * Time Enrichment Script
 *
 * Fetches event detail pages to extract missing time data.
 * This is Phase 2 of the data pipeline - runs after main scrape to backfill times.
 *
 * Usage:
 *   bun run scripts/enrich-time.ts                      # Enrich all missing times
 *   bun run scripts/enrich-time.ts --source athinorama  # One source only
 *   bun run scripts/enrich-time.ts --dry-run            # Preview what would be fetched
 *   bun run scripts/enrich-time.ts --limit 50           # Cap requests per run
 *   bun run scripts/enrich-time.ts --verbose            # Show detailed extraction info
 */

import { Database } from 'bun:sqlite';
import { join } from 'path';

const DB_PATH = join(import.meta.dir, '../data/events.db');
const RATE_LIMIT_MS = 1000; // 1 request per second
const MAX_RETRIES = 3;

// Sources that support time extraction from detail pages
// NOTE: more.com requires JavaScript rendering (Puppeteer) - time extraction for more.com
// should be done in scrape-more-enhanced.ts at scrape time, not here
const SUPPORTED_SOURCES = ['athinorama.gr', 'ticketservices'];

interface EventToEnrich {
  id: string;
  title: string;
  url: string;
  source: string;
  start_date: string;
  type: string;
}

interface TimeResult {
  timeDoors: string | null;
  timePeak: string | null;
  confidence: 'high' | 'medium' | 'low';
  method: string;
}

// ============================================================================
// HTTP UTILITIES
// ============================================================================

/**
 * Fetch with retries and exponential backoff
 */
async function fetchWithRetry(url: string, retries = MAX_RETRIES): Promise<string | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'el,en;q=0.9'
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return await response.text();
    } catch (error) {
      if (attempt < retries) {
        // Exponential backoff: 1s, 2s, 4s
        await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000));
        continue;
      }
      return null;
    }
  }
  return null;
}

/**
 * Fetch using curl for HTTP/1.1 fallback (for sites with HTTP/2 issues)
 */
async function fetchWithCurl(url: string): Promise<string | null> {
  try {
    const proc = Bun.spawn([
      'curl', '-s', '--http1.1', '--max-time', '15',
      '-H', 'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      '-H', 'Accept-Language: el,en;q=0.9',
      url
    ], {
      stdout: 'pipe',
      stderr: 'pipe'
    });

    const text = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    if (exitCode === 0 && text.length > 0) {
      return text;
    }
  } catch (error) {
    // Curl failed
  }
  return null;
}

// ============================================================================
// TIME VALIDATION
// ============================================================================

/**
 * Check if extracted time is valid for the event type
 * Returns warning if suspicious, but doesn't reject
 */
function validateTimeForType(time: string, eventType: string): { valid: boolean; suspicious: boolean; reason?: string } {
  const match = time.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    return { valid: false, suspicious: false, reason: 'Invalid time format' };
  }

  const hour = parseInt(match[1]);

  switch (eventType) {
    case 'concert':
    case 'theater':
    case 'classical':
    case 'opera':
      // Typical: 17:00-23:00
      if (hour < 17 || hour > 23) {
        return { valid: true, suspicious: true, reason: `Unusual for ${eventType}: expected 17:00-23:00` };
      }
      break;
    case 'dj_set':
      // Typical: 21:00-06:00 (wraps midnight)
      if (hour >= 7 && hour < 21) {
        return { valid: true, suspicious: true, reason: 'Unusual for dj_set: expected 21:00-06:00' };
      }
      break;
    case 'exhibition':
      // Typical: 09:00-22:00
      if (hour < 9 || hour > 22) {
        return { valid: true, suspicious: true, reason: 'Unusual for exhibition: expected 09:00-22:00' };
      }
      break;
    default:
      // Generic: 16:00-03:00 (wraps midnight)
      if (hour >= 4 && hour < 16) {
        return { valid: true, suspicious: true, reason: 'Unusual time: expected 16:00-03:00' };
      }
  }

  return { valid: true, suspicious: false };
}

/**
 * Normalize time to HH:MM format
 */
function normalizeTime(hour: number, minute: number = 0): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

// ============================================================================
// SOURCE-SPECIFIC TIME EXTRACTORS
// ============================================================================

/**
 * Extract time from Athinorama.gr detail pages
 * Patterns:
 * - startTime="21:00" attribute in schedule
 * - <time datetime="2026-02-10T21:00:00"> elements
 * - "Ώρα: 21:00" or "Ώρα έναρξης: 21:00" text
 * - JSON-LD with startDate time component
 */
function extractTimeAthinorama(html: string): TimeResult | null {
  // Pattern 1: startTime attribute (most reliable for Athinorama theater/music)
  // Example: startTime="21:00"
  const startTimeAttr = /startTime="(\d{2}):(\d{2})"/;
  const startTimeMatch = html.match(startTimeAttr);
  if (startTimeMatch) {
    const hour = parseInt(startTimeMatch[1]);
    const minute = parseInt(startTimeMatch[2]);
    if (hour >= 0 && hour <= 23) {
      return {
        timeDoors: normalizeTime(hour, minute),
        timePeak: null,
        confidence: 'high',
        method: 'startTime_attribute'
      };
    }
  }

  // Pattern 2: <time datetime="..."> element with time component
  // Example: <time datetime="2026-02-10T21:00:00">
  const timeElementPattern = /<time\s+datetime="(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::\d{2})?"/;
  const timeElementMatch = html.match(timeElementPattern);
  if (timeElementMatch) {
    const hour = parseInt(timeElementMatch[2]);
    const minute = parseInt(timeElementMatch[3]);
    if (hour !== 0 || minute !== 0) {
      return {
        timeDoors: normalizeTime(hour, minute),
        timePeak: null,
        confidence: 'high',
        method: 'time_element'
      };
    }
  }

  // Pattern 3: Greek text "Ώρα:" followed by time
  const greekTimePattern = /[Ωώ]ρα(?:\s+[έε]ναρξης)?:?\s*(\d{1,2})[:\.](\d{2})/i;
  const greekMatch = html.match(greekTimePattern);
  if (greekMatch) {
    const hour = parseInt(greekMatch[1]);
    const minute = parseInt(greekMatch[2]);
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      return {
        timeDoors: normalizeTime(hour, minute),
        timePeak: null,
        confidence: 'high',
        method: 'greek_text_pattern'
      };
    }
  }

  // Pattern 4: "Πότε:" section with time
  const potePattern = /Π[οό]τε:?[^<]*?(\d{1,2})[:\.](\d{2})/i;
  const poteMatch = html.match(potePattern);
  if (poteMatch) {
    const hour = parseInt(poteMatch[1]);
    const minute = parseInt(poteMatch[2]);
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      return {
        timeDoors: normalizeTime(hour, minute),
        timePeak: null,
        confidence: 'medium',
        method: 'pote_section'
      };
    }
  }

  // Pattern 5: JSON-LD startDate with time
  const jsonLdPattern = /"startDate"\s*:\s*"(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::\d{2})?"/;
  const jsonLdMatch = html.match(jsonLdPattern);
  if (jsonLdMatch) {
    const hour = parseInt(jsonLdMatch[2]);
    const minute = parseInt(jsonLdMatch[3]);
    if (hour !== 0 || minute !== 0) {
      return {
        timeDoors: normalizeTime(hour, minute),
        timePeak: null,
        confidence: 'high',
        method: 'json_ld_startDate'
      };
    }
  }

  // Pattern 6: Time in visible text like "21:00" within schedule divs
  const visibleTimePattern = /(?:daytimeschedule|showtime)[^>]*>(?:[^<]*<[^>]+>)*[^<]*?(\d{2}):(\d{2})/i;
  const visibleTimeMatch = html.match(visibleTimePattern);
  if (visibleTimeMatch) {
    const hour = parseInt(visibleTimeMatch[1]);
    const minute = parseInt(visibleTimeMatch[2]);
    if (hour >= 15 && hour <= 23) { // Only evening times for events
      return {
        timeDoors: normalizeTime(hour, minute),
        timePeak: null,
        confidence: 'medium',
        method: 'visible_time'
      };
    }
  }

  // Pattern 7: Meta property with time
  const metaPattern = /property="event:start_time"\s+content="(\d{2}):(\d{2})"/i;
  const metaMatch = html.match(metaPattern);
  if (metaMatch) {
    return {
      timeDoors: normalizeTime(parseInt(metaMatch[1]), parseInt(metaMatch[2])),
      timePeak: null,
      confidence: 'high',
      method: 'meta_property'
    };
  }

  // Pattern 8: Greek AM/PM time format for music events
  // Example: <span class="time">Τετ. 8.30 μ.μ.</span> → 20:30
  // Example: <span class="time">9 μ.μ.</span> → 21:00
  const greekPmPattern = /<span class="time">[^<]*?(\d{1,2})(?:\.(\d{2}))?\s*μ\.μ\./i;
  const greekPmMatch = html.match(greekPmPattern);
  if (greekPmMatch) {
    let hour = parseInt(greekPmMatch[1]);
    const minute = greekPmMatch[2] ? parseInt(greekPmMatch[2]) : 0;
    // Convert to 24-hour format (PM times)
    if (hour < 12) hour += 12;
    if (hour >= 12 && hour <= 23) {
      return {
        timeDoors: normalizeTime(hour, minute),
        timePeak: null,
        confidence: 'high',
        method: 'greek_pm_format'
      };
    }
  }

  // Pattern 9: Greek AM time format (less common for events)
  // Example: <span class="time">11 π.μ.</span> → 11:00
  const greekAmPattern = /<span class="time">[^<]*?(\d{1,2})(?:\.(\d{2}))?\s*π\.μ\./i;
  const greekAmMatch = html.match(greekAmPattern);
  if (greekAmMatch) {
    const hour = parseInt(greekAmMatch[1]);
    const minute = greekAmMatch[2] ? parseInt(greekAmMatch[2]) : 0;
    if (hour >= 0 && hour <= 23) {
      return {
        timeDoors: normalizeTime(hour, minute),
        timePeak: null,
        confidence: 'medium',
        method: 'greek_am_format'
      };
    }
  }

  return null;
}

/**
 * Extract time from TicketServices.gr detail pages
 * Patterns:
 * - data-time='20:30' attribute on show list items
 * - JSON-LD startDate
 * - "Ώρα:" field in event details
 */
function extractTimeTicketservices(html: string): TimeResult | null {
  // Pattern 1: data-time attribute on show list items (most reliable)
  // Example: data-time='20:30' or data-time="21:00"
  const dataTimePattern = /data-time=['"](\d{2}):(\d{2})['"]/i;
  const dataTimeMatch = html.match(dataTimePattern);
  if (dataTimeMatch) {
    const hour = parseInt(dataTimeMatch[1]);
    const minute = parseInt(dataTimeMatch[2]);
    if (hour >= 0 && hour <= 23) {
      return {
        timeDoors: normalizeTime(hour, minute),
        timePeak: null,
        confidence: 'high',
        method: 'data_time_attribute'
      };
    }
  }

  // Pattern 2: JSON-LD schema
  const jsonLdPattern = /"startDate"\s*:\s*"(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::\d{2})?"/;
  const jsonLdMatch = html.match(jsonLdPattern);
  if (jsonLdMatch) {
    const hour = parseInt(jsonLdMatch[2]);
    const minute = parseInt(jsonLdMatch[3]);
    if (hour !== 0 || minute !== 0) {
      return {
        timeDoors: normalizeTime(hour, minute),
        timePeak: null,
        confidence: 'high',
        method: 'json_ld_startDate'
      };
    }
  }

  // Pattern 3: data-showtime attribute (alternate format)
  const dataShowtimePattern = /data-showtime=['"](\d{2}):(\d{2})/i;
  const dataShowtimeMatch = html.match(dataShowtimePattern);
  if (dataShowtimeMatch) {
    return {
      timeDoors: normalizeTime(parseInt(dataShowtimeMatch[1]), parseInt(dataShowtimeMatch[2])),
      timePeak: null,
      confidence: 'high',
      method: 'data_showtime_attribute'
    };
  }

  // Pattern 4: Greek "Ώρα:" text
  const greekPattern = /[Ωώ]ρα:?\s*(\d{1,2})[:\.](\d{2})/i;
  const greekMatch = html.match(greekPattern);
  if (greekMatch) {
    const hour = parseInt(greekMatch[1]);
    const minute = parseInt(greekMatch[2]);
    if (hour >= 0 && hour <= 23) {
      return {
        timeDoors: normalizeTime(hour, minute),
        timePeak: null,
        confidence: 'medium',
        method: 'greek_text'
      };
    }
  }

  // Pattern 5: Time in format "21:00" with time class (visible display)
  const standalonePattern = /class="[^"]*time[^"]*"[^>]*>(\d{2}):(\d{2})/i;
  const standaloneMatch = html.match(standalonePattern);
  if (standaloneMatch) {
    return {
      timeDoors: normalizeTime(parseInt(standaloneMatch[1]), parseInt(standaloneMatch[2])),
      timePeak: null,
      confidence: 'medium',
      method: 'class_time'
    };
  }

  return null;
}

/**
 * Extract time from More.com detail pages
 * Patterns:
 * - JSON-LD doorTime or startDate
 * - Visible time in event details
 */
function extractTimeMore(html: string): TimeResult | null {
  // Pattern 1: doorTime in JSON-LD
  const doorTimePattern = /"doorTime"\s*:\s*"?(\d{2}):(\d{2})/;
  const doorMatch = html.match(doorTimePattern);
  if (doorMatch) {
    return {
      timeDoors: normalizeTime(parseInt(doorMatch[1]), parseInt(doorMatch[2])),
      timePeak: null,
      confidence: 'high',
      method: 'json_ld_doorTime'
    };
  }

  // Pattern 2: startDate with time in JSON-LD
  const startDatePattern = /"startDate"\s*:\s*"(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::\d{2})?"/;
  const startMatch = html.match(startDatePattern);
  if (startMatch) {
    const hour = parseInt(startMatch[2]);
    const minute = parseInt(startMatch[3]);
    if (hour !== 0 || minute !== 0) {
      return {
        timeDoors: normalizeTime(hour, minute),
        timePeak: null,
        confidence: 'high',
        method: 'json_ld_startDate'
      };
    }
  }

  // Pattern 3: "event-time" class or data attribute
  const eventTimePattern = /(?:event-time|data-time)['":\s]+(\d{2}):(\d{2})/i;
  const eventMatch = html.match(eventTimePattern);
  if (eventMatch) {
    return {
      timeDoors: normalizeTime(parseInt(eventMatch[1]), parseInt(eventMatch[2])),
      timePeak: null,
      confidence: 'medium',
      method: 'event_time_class'
    };
  }

  // Pattern 4: Greek "Ώρα:" in visible text
  const greekPattern = /[Ωώ]ρα(?:\s+[έε]ναρξης)?:?\s*(\d{1,2})[:\.](\d{2})/i;
  const greekMatch = html.match(greekPattern);
  if (greekMatch) {
    const hour = parseInt(greekMatch[1]);
    const minute = parseInt(greekMatch[2]);
    if (hour >= 0 && hour <= 23) {
      return {
        timeDoors: normalizeTime(hour, minute),
        timePeak: null,
        confidence: 'medium',
        method: 'greek_text'
      };
    }
  }

  return null;
}

/**
 * Main extraction dispatcher - routes to source-specific extractor
 */
function extractTime(html: string, source: string): TimeResult | null {
  switch (source) {
    case 'athinorama.gr':
      return extractTimeAthinorama(html);
    case 'ticketservices':
      return extractTimeTicketservices(html);
    case 'more.com':
      return extractTimeMore(html);
    default:
      return null;
  }
}

// ============================================================================
// DATABASE OPERATIONS
// ============================================================================

/**
 * Get events that need time enrichment
 */
function getEventsToEnrich(db: Database, sources: string[], limit: number): EventToEnrich[] {
  const placeholders = sources.map(() => '?').join(', ');

  // Find events where:
  // 1. start_date doesn't have time component (no 'T') OR
  // 2. time_doors is NULL
  // And source is in our supported list
  const query = `
    SELECT id, title, url, source, start_date, type
    FROM events
    WHERE source IN (${placeholders})
      AND url IS NOT NULL
      AND url != ''
      AND (
        start_date NOT LIKE '%T%'
        OR time_doors IS NULL
      )
      AND time_source IS NULL
      AND COALESCE(CASE WHEN type='exhibition' THEN end_date ELSE NULL END, start_date) >= date('now')
    ORDER BY start_date ASC
    LIMIT ?
  `;

  const stmt = db.prepare(query);
  return stmt.all(...sources, limit) as EventToEnrich[];
}

/**
 * Update event with extracted time (by ID)
 */
function updateEventTime(
  db: Database,
  eventId: string,
  timeDoors: string | null,
  timePeak: string | null,
  timeSource: string
): boolean {
  const stmt = db.prepare(`
    UPDATE events
    SET time_doors = COALESCE($timeDoors, time_doors),
        time_peak = COALESCE($timePeak, time_peak),
        time_source = $timeSource,
        updated_at = datetime('now')
    WHERE id = $id
  `);

  try {
    const result = stmt.run({
      $id: eventId,
      $timeDoors: timeDoors,
      $timePeak: timePeak,
      $timeSource: timeSource
    });
    return result.changes > 0;
  } catch (error) {
    console.error(`   Failed to update event ${eventId}:`, error);
    return false;
  }
}

/**
 * Update ALL events with same URL (for sources like ticketservices with duplicate URLs)
 * This ensures all rows for multi-date events get the time from a single fetch
 */
function updateEventTimeByUrl(
  db: Database,
  url: string,
  timeDoors: string | null,
  timePeak: string | null,
  timeSource: string
): number {
  const stmt = db.prepare(`
    UPDATE events
    SET time_doors = COALESCE($timeDoors, time_doors),
        time_peak = COALESCE($timePeak, time_peak),
        time_source = $timeSource,
        updated_at = datetime('now')
    WHERE url = $url AND time_doors IS NULL
  `);

  try {
    const result = stmt.run({
      $url: url,
      $timeDoors: timeDoors,
      $timePeak: timePeak,
      $timeSource: timeSource
    });
    return result.changes;
  } catch (error) {
    console.error(`   Failed to update events for URL:`, error);
    return 0;
  }
}

/**
 * Mark event as processed (even if no time found)
 */
function markEventProcessed(db: Database, eventId: string): boolean {
  const stmt = db.prepare(`
    UPDATE events
    SET time_source = 'not_found',
        updated_at = datetime('now')
    WHERE id = $id
  `);

  try {
    const result = stmt.run({ $id: eventId });
    return result.changes > 0;
  } catch (error) {
    return false;
  }
}

// ============================================================================
// MAIN ENRICHMENT LOGIC
// ============================================================================

async function enrichEventTime(
  event: EventToEnrich,
  verbose: boolean
): Promise<{ success: boolean; time: string | null; method: string | null; suspicious: boolean }> {
  // Fetch the detail page
  // Use curl for more.com (HTTP/2 issues), regular fetch for others
  const html = event.source === 'more.com'
    ? await fetchWithCurl(event.url)
    : await fetchWithRetry(event.url);

  if (!html) {
    if (verbose) {
      console.log(`   Failed to fetch: ${event.url.substring(0, 60)}...`);
    }
    return { success: false, time: null, method: null, suspicious: false };
  }

  // Extract time using source-specific logic
  const result = extractTime(html, event.source);

  if (!result || !result.timeDoors) {
    if (verbose) {
      console.log(`   No time found in: ${event.title.substring(0, 40)}...`);
    }
    return { success: false, time: null, method: null, suspicious: false };
  }

  // Validate the extracted time
  const validation = validateTimeForType(result.timeDoors, event.type);

  if (!validation.valid) {
    if (verbose) {
      console.log(`   Invalid time ${result.timeDoors} for: ${event.title.substring(0, 40)}...`);
    }
    return { success: false, time: null, method: null, suspicious: false };
  }

  if (validation.suspicious && verbose) {
    console.log(`   ⚠️  Suspicious time ${result.timeDoors}: ${validation.reason}`);
  }

  return {
    success: true,
    time: result.timeDoors,
    method: result.method,
    suspicious: validation.suspicious
  };
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  ⏰  AGENT ATHENS - Time Enrichment                          ║');
  console.log('║     "Every event deserves its moment"                        ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');

  // Parse arguments
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const verbose = args.includes('--verbose');

  // Parse --source flag
  const sourceIdx = args.indexOf('--source');
  const selectedSources = sourceIdx >= 0
    ? args[sourceIdx + 1].split(',').filter(s => SUPPORTED_SOURCES.includes(s))
    : SUPPORTED_SOURCES;

  // Parse --limit flag
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1]) : 100;

  if (dryRun) {
    console.log('🔍 DRY RUN MODE - No changes will be saved\n');
  }

  console.log(`📋 Sources: ${selectedSources.join(', ')}`);
  console.log(`📊 Limit: ${limit} events`);
  console.log('');

  // Open database
  const db = new Database(DB_PATH);

  // Get events to enrich
  const events = getEventsToEnrich(db, selectedSources, limit);

  if (events.length === 0) {
    console.log('✅ No events need time enrichment!\n');
    db.close();
    return;
  }

  console.log(`📥 Found ${events.length} events to process\n`);

  // Group by source for reporting
  const bySource = events.reduce((acc, e) => {
    acc[e.source] = (acc[e.source] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  for (const [source, count] of Object.entries(bySource)) {
    console.log(`   ${source}: ${count} events`);
  }
  console.log('');

  // Process events
  let processed = 0;
  let enriched = 0;
  let failed = 0;
  let suspicious = 0;

  console.log('─'.repeat(64));

  for (const event of events) {
    processed++;

    // Progress indicator
    if (processed % 10 === 0 || processed === events.length) {
      console.log(`📊 Progress: ${processed}/${events.length} (${enriched} enriched, ${failed} failed)`);
    }

    // Enrich the event
    const result = await enrichEventTime(event, verbose);

    if (result.success && result.time) {
      if (!dryRun) {
        // For ticketservices, update ALL rows with the same URL (multiple show dates)
        // For other sources, update by event ID
        let updatedCount: number;
        if (event.source === 'ticketservices') {
          updatedCount = updateEventTimeByUrl(db, event.url, result.time, null, 'scraped_detail');
        } else {
          updatedCount = updateEventTime(db, event.id, result.time, null, 'scraped_detail') ? 1 : 0;
        }

        if (updatedCount > 0) {
          enriched += updatedCount;
          if (result.suspicious) suspicious++;
          if (verbose) {
            const countSuffix = updatedCount > 1 ? ` (${updatedCount} rows)` : '';
            console.log(`   ✅ ${event.title.substring(0, 40)}... → ${result.time} (${result.method})${countSuffix}`);
          }
        } else {
          failed++;
        }
      } else {
        enriched++;
        if (result.suspicious) suspicious++;
        console.log(`   [DRY] ${event.title.substring(0, 40)}... → ${result.time} (${result.method})`);
      }
    } else {
      // Mark as processed even if no time found (to avoid re-processing)
      if (!dryRun) {
        markEventProcessed(db, event.id);
      }
      failed++;
    }

    // Rate limiting
    if (processed < events.length) {
      await new Promise(r => setTimeout(r, RATE_LIMIT_MS));
    }
  }

  // Close database
  db.close();

  // Summary
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  📊  SUMMARY                                                 ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`   Processed: ${processed}`);
  console.log(`   Enriched:  ${enriched} (${((enriched / processed) * 100).toFixed(1)}%)`);
  console.log(`   Failed:    ${failed}`);
  if (suspicious > 0) {
    console.log(`   ⚠️  Suspicious times: ${suspicious}`);
  }
  console.log('');

  if (dryRun) {
    console.log('💡 Run without --dry-run to save changes\n');
  }
}

main().catch(console.error);
