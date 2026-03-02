#!/usr/bin/env bun
/**
 * Advanced Event Deduplication Script - Production Ready
 *
 * Multi-pass deduplication with recurring event protection:
 * Pass 0: Identify and protect recurring events (CRITICAL)
 *   - Theater/Performance runs (3+ shows over 7+ days)
 *   - Exhibition runs (5+ instances over 14+ days)
 *   - Weekly recurring events (4+ on same weekday)
 *   - Festival multi-day events (3+ with Festival/Φεστιβάλ in title)
 * Pass 1: URL-based (primary key - same URL = same event)
 * Pass 2: Exact match (title + venue + date + TIME)
 * Pass 3: Cross-source within 24 hours (STRICT)
 * Pass 4: Fuzzy title match (case-insensitive + trimmed)
 * Pass 5: Venue normalization (removes special chars)
 * Pass 6: Suspicious timestamp cleanup (CONSERVATIVE - only 00:00, 12:00)
 * Pass 7: Smart title matching (strips "live in Athens", Greek "στο [venue]", articles, venue aliases)
 *
 * Keeps highest quality version based on:
 * - Source priority (more.com > viva.gr > gazarte.gr > email)
 * - Description length (longer = more detailed)
 * - Title completeness (longer = more descriptive)
 *
 * Usage: bun run scripts/remove-duplicates.ts [--dry-run]
 */

import Database from 'bun:sqlite';

const db = new Database('data/events.db');
const DRY_RUN = process.argv.includes('--dry-run');
const REMOVAL_THRESHOLD = 0.20; // Alert if >20% would be removed

// Exhibition-safe date filter: running exhibitions (start_date in past, end_date in future) must not be excluded
const UPCOMING_FILTER = `COALESCE(CASE WHEN type='exhibition' THEN end_date ELSE NULL END, start_date) >= date('now')`;

if (DRY_RUN) {
  console.log('🔍 DRY RUN MODE - No changes will be made\n');
}

console.log('🧹 Advanced Event Deduplication - Production Ready\n');
console.log('='.repeat(60) + '\n');

// Track statistics
let totalRemoved = 0;
const removalsByPass: Record<string, number> = {};
let protectedCount = 0;

/**
 * PASS -1: Remove Non-Event Products (PRE-FILTER)
 * These are NOT events - they are ticket products, cards, passes, subscriptions
 * that should never have been imported as events.
 */
console.log('🗑️  PASS -1: Remove Non-Event Products (Pre-Filter)');
console.log('-'.repeat(60));

// Patterns that indicate non-event products
const NON_EVENT_PATTERNS = [
  '%κάρτα%',           // Theater cards (κάρτα ΚΘΒΕ, etc.)
  '%Δωροκάρτα%',       // Gift cards
  '%Προσφορά διημέρου%', // Multi-day combo ticket offers
  '%Εισιτήρια Διαρκείας%', // Season tickets
  '%Εισιτήριο Διαρκείας%', // Season ticket (singular)
  '%PASS%',            // Multi-show passes (ANESIS PASS, etc.)
  '% pass %',          // Lowercase pass
  '%art pass%',        // Art passes
  '%Season Pass%',     // Season passes
  '%2 DAY TICKET%',    // Multi-day tickets (EJEKT 2 DAY TICKET)
  '%3 DAY TICKET%',    // Multi-day tickets
];

const nonEventProducts = db.prepare(`
  SELECT id, title, venue_name, date(start_date) as date, source
  FROM events
  WHERE ${UPCOMING_FILTER}
    AND (
      ${NON_EVENT_PATTERNS.map(p => `title LIKE '${p}'`).join(' OR ')}
    )
  ORDER BY title
`).all() as Array<{ id: string; title: string; venue_name: string; date: string; source: string }>;

if (nonEventProducts.length > 0) {
  console.log(`Found ${nonEventProducts.length} non-event products:\n`);

  // Show what will be removed
  for (const product of nonEventProducts.slice(0, 10)) {
    console.log(`  🎫 "${product.title}" [${product.source}]`);
  }
  if (nonEventProducts.length > 10) {
    console.log(`  ... and ${nonEventProducts.length - 10} more\n`);
  }

  if (!DRY_RUN) {
    const deleteStmt = db.prepare(`
      DELETE FROM events
      WHERE ${UPCOMING_FILTER}
        AND (
          ${NON_EVENT_PATTERNS.map(p => `title LIKE '${p}'`).join(' OR ')}
        )
    `);
    const result = deleteStmt.run();
    totalRemoved += result.changes;
    removalsByPass['Non-event products'] = result.changes;
    console.log(`\n✅ Removed ${result.changes} non-event products\n`);
  } else {
    console.log(`\n${DRY_RUN ? 'Would remove' : 'Removed'} ${nonEventProducts.length} non-event products\n`);
  }
} else {
  console.log('✅ No non-event products found\n');
}

/**
 * PASS 0: Recurring Event Protection (CRITICAL - RUN FIRST)
 * Identifies and marks legitimate multi-date events
 */
console.log('🛡️  PASS 0: Recurring Event Protection');
console.log('-'.repeat(60));

// Add protection column if not exists
try {
  db.run(`
    ALTER TABLE events
    ADD COLUMN dedup_protected INTEGER DEFAULT 0
  `);
} catch (error) {
  // Column already exists, ignore
}

try {
  db.run(`
    ALTER TABLE events
    ADD COLUMN dedup_reason TEXT
  `);
} catch (error) {
  // Column already exists, ignore
}

// 1. Theater/Dance/Performance runs (3+ shows over 7+ days)
const theaterRuns = db.prepare(`
  SELECT title, venue_name, COUNT(*) as shows,
         MIN(date(start_date)) as first_show,
         MAX(date(start_date)) as last_show
  FROM events
  WHERE ${UPCOMING_FILTER}
    AND type IN ('theater', 'performance', 'cinema')
  GROUP BY title, venue_name
  HAVING COUNT(*) >= 3
    AND (julianday(MAX(start_date)) - julianday(MIN(start_date))) >= 7
`).all() as Array<{ title: string; venue_name: string; shows: number }>;

if (theaterRuns.length > 0) {
  console.log(`Found ${theaterRuns.length} theater/performance runs`);

  const protectTheaterStmt = db.prepare(`
    UPDATE events
    SET dedup_protected = 1, dedup_reason = 'THEATER_RUN'
    WHERE title = ? AND venue_name = ?
  `);

  if (!DRY_RUN) {
    theaterRuns.forEach(run => {
      protectTheaterStmt.run(run.title, run.venue_name);
      protectedCount += run.shows;
    });
  } else {
    theaterRuns.forEach(run => protectedCount += run.shows);
  }
}

// 2. Exhibition runs (5+ instances over 14+ days)
const exhibitionRuns = db.prepare(`
  SELECT title, venue_name, COUNT(*) as instances
  FROM events
  WHERE ${UPCOMING_FILTER}
    AND type = 'exhibition'
  GROUP BY title, venue_name
  HAVING COUNT(*) >= 5
    AND (julianday(MAX(start_date)) - julianday(MIN(start_date))) >= 14
`).all() as Array<{ title: string; venue_name: string; instances: number }>;

if (exhibitionRuns.length > 0) {
  console.log(`Found ${exhibitionRuns.length} exhibition runs`);

  const protectExhibitionStmt = db.prepare(`
    UPDATE events
    SET dedup_protected = 1, dedup_reason = 'EXHIBITION_RUN'
    WHERE title = ? AND venue_name = ?
  `);

  if (!DRY_RUN) {
    exhibitionRuns.forEach(run => {
      protectExhibitionStmt.run(run.title, run.venue_name);
      protectedCount += run.instances;
    });
  } else {
    exhibitionRuns.forEach(run => protectedCount += run.instances);
  }
}

// 3. Weekly recurring events (4+ instances on same weekday)
const weeklyEvents = db.prepare(`
  SELECT title, venue_name,
         COUNT(*) as occurrences,
         GROUP_CONCAT(DISTINCT strftime('%w', start_date)) as weekdays
  FROM events
  WHERE ${UPCOMING_FILTER}
  GROUP BY title, venue_name
  HAVING COUNT(*) >= 4
    AND LENGTH(weekdays) <= 1
`).all() as Array<{ title: string; venue_name: string; occurrences: number }>;

if (weeklyEvents.length > 0) {
  console.log(`Found ${weeklyEvents.length} weekly recurring events`);

  const protectWeeklyStmt = db.prepare(`
    UPDATE events
    SET dedup_protected = 1, dedup_reason = 'WEEKLY_RECURRING'
    WHERE title = ? AND venue_name = ?
  `);

  if (!DRY_RUN) {
    weeklyEvents.forEach(event => {
      protectWeeklyStmt.run(event.title, event.venue_name);
      protectedCount += event.occurrences;
    });
  } else {
    weeklyEvents.forEach(event => protectedCount += event.occurrences);
  }
}

// 4. Festival multi-day events (3+ shows with "Festival" or "Φεστιβάλ" in title)
const festivalEvents = db.prepare(`
  SELECT title, venue_name, COUNT(*) as shows
  FROM events
  WHERE ${UPCOMING_FILTER}
    AND (title LIKE '%Festival%' OR title LIKE '%Φεστιβάλ%')
  GROUP BY title, venue_name
  HAVING COUNT(*) >= 3
`).all() as Array<{ title: string; venue_name: string; shows: number }>;

if (festivalEvents.length > 0) {
  console.log(`Found ${festivalEvents.length} festival multi-day events`);

  const protectFestivalStmt = db.prepare(`
    UPDATE events
    SET dedup_protected = 1, dedup_reason = 'FESTIVAL'
    WHERE title = ? AND venue_name = ?
  `);

  if (!DRY_RUN) {
    festivalEvents.forEach(event => {
      protectFestivalStmt.run(event.title, event.venue_name);
      protectedCount += event.shows;
    });
  } else {
    festivalEvents.forEach(event => protectedCount += event.shows);
  }
}

console.log(`\n${DRY_RUN ? 'Would protect' : 'Protected'} ${protectedCount} recurring event instances\n`);

/**
 * PASS 1: URL-Based Deduplication (PRIMARY KEY)
 * Same URL = Same event, regardless of title variations
 */
console.log('📍 PASS 1: URL-Based Deduplication');
console.log('-'.repeat(60));

const urlDuplicates = db.prepare(`
  SELECT url, COUNT(*) as count, GROUP_CONCAT(id) as ids,
         GROUP_CONCAT(title, ' | ') as titles
  FROM events
  WHERE ${UPCOMING_FILTER}
    AND url IS NOT NULL
    AND url != ''
    AND (dedup_protected = 0 OR dedup_protected IS NULL)
  GROUP BY url
  HAVING COUNT(*) > 1
  ORDER BY count DESC;
`).all() as Array<{ url: string; count: number; ids: string; titles: string }>;

if (urlDuplicates.length > 0) {
  console.log(`Found ${urlDuplicates.length} URL duplicate groups\n`);

  let urlRemovalCount = 0;

  const urlDeleteStmt = db.prepare(`
    DELETE FROM events WHERE id IN (
      SELECT id FROM (
        SELECT id,
          ROW_NUMBER() OVER (
            PARTITION BY url
            ORDER BY
              CASE source
                WHEN 'more.com' THEN 1
                WHEN 'viva.gr' THEN 2
                WHEN 'gazarte.gr' THEN 3
                ELSE 4
              END,
              LENGTH(title) DESC,
              LENGTH(COALESCE(description, '')) DESC,
              id
          ) as rn
        FROM events
        WHERE ${UPCOMING_FILTER}
          AND url IS NOT NULL
          AND url != ''
          AND (dedup_protected = 0 OR dedup_protected IS NULL)
      )
      WHERE rn > 1
    )
  `);

  if (!DRY_RUN) {
    const result = urlDeleteStmt.run();
    urlRemovalCount = result.changes;
    totalRemoved += urlRemovalCount;
    removalsByPass['URL-based'] = urlRemovalCount;
  } else {
    urlDuplicates.forEach(dup => {
      urlRemovalCount += (dup.count - 1);
    });
  }

  console.log(`${DRY_RUN ? 'Would remove' : 'Removed'} ${urlRemovalCount} URL duplicates\n`);
} else {
  console.log('✅ No URL duplicates found\n');
}

/**
 * PASS 2: Exact Match (Title + Venue + Date + TIME)
 * Includes time component to preserve different showtimes
 */
console.log('🎯 PASS 2: Exact Match (Title + Venue + Date + TIME)');
console.log('-'.repeat(60));

const exactDuplicates = db.prepare(`
  SELECT title, venue_name,
         date(start_date) as date,
         time(start_date) as time,
         COUNT(*) as count, GROUP_CONCAT(id) as ids
  FROM events
  WHERE ${UPCOMING_FILTER}
    AND (dedup_protected = 0 OR dedup_protected IS NULL)
  GROUP BY title, venue_name, date(start_date), time(start_date)
  HAVING COUNT(*) > 1
  ORDER BY count DESC;
`).all() as Array<{ title: string; venue_name: string; date: string; time: string; count: number; ids: string }>;

if (exactDuplicates.length > 0) {
  console.log(`Found ${exactDuplicates.length} exact duplicate groups\n`);

  let exactRemovalCount = 0;

  const exactDeleteStmt = db.prepare(`
    DELETE FROM events WHERE id IN (
      SELECT id FROM (
        SELECT id,
          ROW_NUMBER() OVER (
            PARTITION BY title, venue_name, date(start_date), time(start_date)
            ORDER BY
              CASE source
                WHEN 'more.com' THEN 1
                WHEN 'viva.gr' THEN 2
                WHEN 'gazarte.gr' THEN 3
                ELSE 4
              END,
              LENGTH(COALESCE(description, '')) DESC,
              id
          ) as rn
        FROM events
        WHERE ${UPCOMING_FILTER}
          AND (dedup_protected = 0 OR dedup_protected IS NULL)
      )
      WHERE rn > 1
    )
  `);

  if (!DRY_RUN) {
    const result = exactDeleteStmt.run();
    exactRemovalCount = result.changes;
    totalRemoved += exactRemovalCount;
    removalsByPass['Exact match + time'] = exactRemovalCount;
  } else {
    exactDuplicates.forEach(dup => {
      exactRemovalCount += (dup.count - 1);
    });
  }

  console.log(`${DRY_RUN ? 'Would remove' : 'Removed'} ${exactRemovalCount} exact duplicates\n`);
} else {
  console.log('✅ No exact duplicates found\n');
}

/**
 * PASS 3: Cross-Source Within 24 Hours (STRICT)
 * Tightened from 3 days to 24 hours to reduce false positives
 */
console.log('🌐 PASS 3: Cross-Source Within 24 Hours (STRICT)');
console.log('-'.repeat(60));

const crossSourceDuplicates = db.prepare(`
  SELECT title, venue_name,
         COUNT(*) as count,
         MIN(date(start_date)) as earliest_date,
         MAX(date(start_date)) as latest_date,
         GROUP_CONCAT(DISTINCT source) as sources
  FROM events
  WHERE ${UPCOMING_FILTER}
    AND (dedup_protected = 0 OR dedup_protected IS NULL)
  GROUP BY LOWER(TRIM(title)), venue_name,
    CAST(julianday(start_date) AS INTEGER)
  HAVING COUNT(*) > 1
    AND COUNT(DISTINCT source) > 1
    AND (julianday(MAX(start_date)) - julianday(MIN(start_date))) <= 1
  ORDER BY count DESC;
`).all() as Array<{
  title: string;
  venue_name: string;
  count: number;
  earliest_date: string;
  latest_date: string;
  sources: string;
}>;

if (crossSourceDuplicates.length > 0) {
  console.log(`Found ${crossSourceDuplicates.length} cross-source duplicates (within 24h)\n`);

  let crossSourceRemovalCount = 0;

  const crossSourceDeleteStmt = db.prepare(`
    DELETE FROM events WHERE id IN (
      SELECT id FROM (
        SELECT id,
          ROW_NUMBER() OVER (
            PARTITION BY LOWER(TRIM(title)), venue_name,
              CAST(julianday(start_date) AS INTEGER)
            ORDER BY
              CASE source
                WHEN 'more.com' THEN 1
                WHEN 'viva.gr' THEN 2
                WHEN 'gazarte.gr' THEN 3
                ELSE 4
              END,
              LENGTH(COALESCE(description, '')) DESC,
              id
          ) as rn
        FROM events
        WHERE ${UPCOMING_FILTER}
          AND (dedup_protected = 0 OR dedup_protected IS NULL)
      )
      WHERE rn > 1
    )
  `);

  if (!DRY_RUN) {
    const result = crossSourceDeleteStmt.run();
    crossSourceRemovalCount = result.changes;
    totalRemoved += crossSourceRemovalCount;
    removalsByPass['Cross-source 24h'] = crossSourceRemovalCount;
  } else {
    crossSourceDuplicates.forEach(dup => {
      crossSourceRemovalCount += (dup.count - 1);
    });
  }

  console.log(`${DRY_RUN ? 'Would remove' : 'Removed'} ${crossSourceRemovalCount} cross-source duplicates\n`);
} else {
  console.log('✅ No cross-source duplicates found\n');
}

/**
 * PASS 4: Fuzzy Title Match (Case-Insensitive + Trimmed)
 * Catches title variations with different capitalization/spacing
 */
console.log('🔤 PASS 4: Fuzzy Title Match (Case-Insensitive)');
console.log('-'.repeat(60));

const fuzzyDuplicates = db.prepare(`
  SELECT LOWER(TRIM(title)) as normalized_title,
         venue_name,
         date(start_date) as date,
         COUNT(*) as count,
         GROUP_CONCAT(title, ' | ') as original_titles
  FROM events
  WHERE ${UPCOMING_FILTER}
    AND (dedup_protected = 0 OR dedup_protected IS NULL)
    AND LENGTH(title) >= 5
  GROUP BY LOWER(TRIM(title)), venue_name, date(start_date)
  HAVING COUNT(*) > 1
  ORDER BY count DESC;
`).all() as Array<{
  normalized_title: string;
  venue_name: string;
  date: string;
  count: number;
  original_titles: string;
}>;

if (fuzzyDuplicates.length > 0) {
  console.log(`Found ${fuzzyDuplicates.length} fuzzy title duplicate groups\n`);

  let fuzzyRemovalCount = 0;

  const fuzzyDeleteStmt = db.prepare(`
    DELETE FROM events WHERE id IN (
      SELECT id FROM (
        SELECT id,
          ROW_NUMBER() OVER (
            PARTITION BY LOWER(TRIM(title)), venue_name, date(start_date)
            ORDER BY
              LENGTH(title) DESC,
              CASE source
                WHEN 'more.com' THEN 1
                WHEN 'viva.gr' THEN 2
                ELSE 3
              END,
              LENGTH(COALESCE(description, '')) DESC,
              id
          ) as rn
        FROM events
        WHERE ${UPCOMING_FILTER}
          AND (dedup_protected = 0 OR dedup_protected IS NULL)
          AND LENGTH(title) >= 5
      )
      WHERE rn > 1
    )
  `);

  if (!DRY_RUN) {
    const result = fuzzyDeleteStmt.run();
    fuzzyRemovalCount = result.changes;
    totalRemoved += fuzzyRemovalCount;
    removalsByPass['Fuzzy title'] = fuzzyRemovalCount;
  } else {
    fuzzyDuplicates.forEach(dup => {
      fuzzyRemovalCount += (dup.count - 1);
    });
  }

  console.log(`${DRY_RUN ? 'Would remove' : 'Removed'} ${fuzzyRemovalCount} fuzzy duplicates\n`);
} else {
  console.log('✅ No fuzzy title duplicates found\n');
}

/**
 * PASS 5: Venue Normalization (Remove special characters)
 * Catches "Gazarte Main Stage" vs "Gazarte Main Stage!"
 */
console.log('🏛️  PASS 5: Venue Normalization');
console.log('-'.repeat(60));

const venueNormalizedDuplicates = db.prepare(`
  SELECT title,
         LOWER(REPLACE(REPLACE(REPLACE(venue_name, '!', ''), '-', ''), '.', '')) as normalized_venue,
         date(start_date) as date,
         COUNT(*) as count,
         GROUP_CONCAT(venue_name, ' | ') as original_venues
  FROM events
  WHERE ${UPCOMING_FILTER}
    AND (dedup_protected = 0 OR dedup_protected IS NULL)
  GROUP BY title,
           LOWER(REPLACE(REPLACE(REPLACE(venue_name, '!', ''), '-', ''), '.', '')),
           date(start_date)
  HAVING COUNT(*) > 1
  ORDER BY count DESC;
`).all() as Array<{
  title: string;
  normalized_venue: string;
  date: string;
  count: number;
  original_venues: string;
}>;

if (venueNormalizedDuplicates.length > 0) {
  console.log(`Found ${venueNormalizedDuplicates.length} venue normalization duplicates\n`);

  let venueRemovalCount = 0;

  const venueDeleteStmt = db.prepare(`
    DELETE FROM events WHERE id IN (
      SELECT id FROM (
        SELECT id,
          ROW_NUMBER() OVER (
            PARTITION BY title,
              LOWER(REPLACE(REPLACE(REPLACE(venue_name, '!', ''), '-', ''), '.', '')),
              date(start_date)
            ORDER BY
              LENGTH(venue_name) DESC,
              CASE source
                WHEN 'more.com' THEN 1
                WHEN 'viva.gr' THEN 2
                ELSE 3
              END,
              id
          ) as rn
        FROM events
        WHERE ${UPCOMING_FILTER}
          AND (dedup_protected = 0 OR dedup_protected IS NULL)
      )
      WHERE rn > 1
    )
  `);

  if (!DRY_RUN) {
    const result = venueDeleteStmt.run();
    venueRemovalCount = result.changes;
    totalRemoved += venueRemovalCount;
    removalsByPass['Venue normalized'] = venueRemovalCount;
  } else {
    venueNormalizedDuplicates.forEach(dup => {
      venueRemovalCount += (dup.count - 1);
    });
  }

  console.log(`${DRY_RUN ? 'Would remove' : 'Removed'} ${venueRemovalCount} venue-normalized duplicates\n`);
} else {
  console.log('✅ No venue normalization duplicates found\n');
}

/**
 * PASS 6: Suspicious Timestamp Cleanup (CONSERVATIVE)
 * Only removes obvious scraper defaults (00:00, 12:00)
 */
console.log('⏰ PASS 6: Suspicious Timestamp Cleanup (CONSERVATIVE)');
console.log('-'.repeat(60));

const suspiciousTimestamps = db.prepare(`
  SELECT title, venue_name, date(start_date) as date,
         COUNT(*) as count,
         GROUP_CONCAT(time(start_date), ' | ') as times,
         GROUP_CONCAT(id, ',') as ids
  FROM events
  WHERE ${UPCOMING_FILTER}
    AND (dedup_protected = 0 OR dedup_protected IS NULL)
  GROUP BY title, venue_name, date(start_date)
  HAVING COUNT(*) > 1
    AND MIN(time(start_date)) IN ('00:00:00', '12:00:00')
  ORDER BY count DESC;
`).all() as Array<{
  title: string;
  venue_name: string;
  date: string;
  count: number;
  times: string;
  ids: string;
}>;

if (suspiciousTimestamps.length > 0) {
  console.log(`Found ${suspiciousTimestamps.length} suspicious timestamp groups\n`);

  let timestampRemovalCount = 0;

  const timestampDeleteStmt = db.prepare(`
    DELETE FROM events WHERE id IN (
      SELECT id FROM (
        SELECT id,
          ROW_NUMBER() OVER (
            PARTITION BY title, venue_name, date(start_date)
            ORDER BY
              CASE time(start_date)
                WHEN '00:00:00' THEN 2  -- Obvious default
                WHEN '12:00:00' THEN 2  -- Unlikely for evening events
                ELSE 1                   -- Realistic times
              END,
              CASE source
                WHEN 'more.com' THEN 1
                WHEN 'viva.gr' THEN 2
                ELSE 3
              END,
              LENGTH(COALESCE(description, '')) DESC,
              id
          ) as rn
        FROM events
        WHERE ${UPCOMING_FILTER}
          AND (dedup_protected = 0 OR dedup_protected IS NULL)
      )
      WHERE rn > 1
    )
  `);

  if (!DRY_RUN) {
    const result = timestampDeleteStmt.run();
    timestampRemovalCount = result.changes;
    totalRemoved += timestampRemovalCount;
    removalsByPass['Timestamp cleanup'] = timestampRemovalCount;
  } else {
    suspiciousTimestamps.forEach(dup => {
      timestampRemovalCount += (dup.count - 1);
    });
  }

  console.log(`${DRY_RUN ? 'Would remove' : 'Removed'} ${timestampRemovalCount} suspicious timestamp duplicates\n`);
} else {
  console.log('✅ No suspicious timestamp duplicates found\n');
}

/**
 * PASS 7: Smart Title Matching
 * Normalizes titles by removing common suffixes/prefixes:
 * - "live in Athens", "Live in Athens", "live στην Αθήνα"
 * - "στο [venue]", "στον [venue]", "στη [venue]", "στην [venue]"
 * - Greek articles at start: "Οι", "Η", "Ο", "Το"
 * - Venue aliases: "Gazarte" matches "Gazarte - Ground Stage", "Gazarte Main Stage"
 */
console.log('🧠 PASS 7: Smart Title Matching');
console.log('-'.repeat(60));

// Helper function to normalize titles for comparison
function normalizeTitle(title: string): string {
  let normalized = title.toLowerCase().trim();

  // Remove "live in [city]" variations (English)
  normalized = normalized.replace(/\s+live\s+in\s+(athens|greece|thessaloniki|αθήνα|ελλάδα|θεσσαλονίκη)$/i, '');
  normalized = normalized.replace(/\s+live\s+@\s+[\w\s]+$/i, '');

  // Remove anniversary/tour suffixes
  normalized = normalized.replace(/\s+\d+th\s+anniversary.*$/i, '');

  // Remove "στο/στον/στη/στην [specific venue name]" suffix ONLY when it looks like a venue
  // But NOT when it's part of event series name like "Jazz στο Μουσείο"
  // Match: "... στο Caja de musica", "... στο Half Note"
  // Don't match: "Jazz στο Μουσείο" (museum as part of brand)
  normalized = normalized.replace(/\s+στο[νη]?\s+(caja|half note|gagarin|gazarte|six dogs|fuzz|temple|piraeus|floyd|arch)[\w\s]*$/i, '');

  // Remove Greek articles at start: Οι, Η, Ο, Το (case insensitive for Greek)
  normalized = normalized.replace(/^(οι|η|ο|το)\s+/i, '');

  // Remove common prefixes like "the"
  normalized = normalized.replace(/^the\s+/i, '');

  // Remove colon and everything after for series events (e.g., "Jazz στο Μουσείο: Artist Name")
  normalized = normalized.replace(/:\s+.+$/, '');

  // Remove punctuation and extra spaces
  normalized = normalized.replace(/[!?,.:;'"]/g, '');
  normalized = normalized.replace(/\s+/g, ' ').trim();

  return normalized;
}

// Helper function to normalize venue names
function normalizeVenue(venue: string): string {
  let normalized = venue.toLowerCase().trim();

  // Handle "- Ground Stage" and "- Roof Stage" standalone (viva.gr parsing quirk)
  // Evidence: Some events explicitly show "@ GAZARTE" or "GAZARTE - ROOF STAGE" in title
  // while venue field shows only "- Ground Stage" or "- Roof Stage"
  // CAVEAT: This assumes all "- Ground/Roof Stage" are Gazarte. If another venue
  // uses similar naming, this could cause false positive deduplication.
  // Risk is LOW because we also match on title + date, so worst case is
  // failing to deduplicate rather than wrongly merging different events.
  if (normalized === '- ground stage' || normalized === 'ground stage' ||
      normalized === '- roof stage' || normalized === 'roof stage') {
    return 'gazarte';
  }

  // Gazarte variations -> gazarte
  if (normalized.includes('gazarte')) {
    return 'gazarte';
  }

  // Caja de Música variations (with/without accent)
  if (normalized.includes('caja de m') || normalized.includes('caja de música')) {
    return 'caja de musica';
  }

  // Multiple venues indicator (not a real venue)
  if (normalized.includes('πολλαπλοι χωροι') || normalized.includes('multiple venues')) {
    return 'multiple_venues';
  }

  // Remove stage/hall suffixes
  normalized = normalized.replace(/\s*[-–]\s*(ground|main|roof)\s*stage$/i, '');
  normalized = normalized.replace(/\s*[-–]\s*αίθουσα\s*\w*$/i, '');

  // Remove punctuation
  normalized = normalized.replace(/[!?,.:;'"]/g, '');
  normalized = normalized.replace(/\s+/g, ' ').trim();

  return normalized;
}

// Get all upcoming events
const allEvents = db.prepare(`
  SELECT id, title, venue_name, date(start_date) as date, source,
         LENGTH(COALESCE(description, '')) as desc_len
  FROM events
  WHERE ${UPCOMING_FILTER}
    AND (dedup_protected = 0 OR dedup_protected IS NULL)
  ORDER BY date, title
`).all() as Array<{
  id: string;
  title: string;
  venue_name: string;
  date: string;
  source: string;
  desc_len: number;
}>;

// Build groups based on normalized title + normalized venue + date
const smartGroups = new Map<string, typeof allEvents>();

for (const event of allEvents) {
  const normalizedTitle = normalizeTitle(event.title);
  const normalizedVenue = normalizeVenue(event.venue_name);
  const key = `${normalizedTitle}|${normalizedVenue}|${event.date}`;

  if (!smartGroups.has(key)) {
    smartGroups.set(key, []);
  }
  smartGroups.get(key)!.push(event);
}

// Find groups with duplicates
const smartDuplicateGroups = Array.from(smartGroups.entries())
  .filter(([_, events]) => events.length > 1)
  .map(([key, events]) => ({
    key,
    events,
    count: events.length,
    titles: events.map(e => e.title).join(' | ')
  }));

if (smartDuplicateGroups.length > 0) {
  console.log(`Found ${smartDuplicateGroups.length} smart title match groups\n`);

  // Show some examples
  const examples = smartDuplicateGroups.slice(0, 5);
  for (const group of examples) {
    console.log(`  "${group.events[0].title}" (${group.count} events)`);
    for (const evt of group.events) {
      console.log(`    - "${evt.title}" @ ${evt.venue_name} [${evt.source}]`);
    }
  }
  if (smartDuplicateGroups.length > 5) {
    console.log(`  ... and ${smartDuplicateGroups.length - 5} more groups\n`);
  }

  let smartRemovalCount = 0;
  const idsToRemove: string[] = [];

  // For each group, keep the best event
  for (const group of smartDuplicateGroups) {
    // Sort by quality: source priority, then description length, then title length
    const sorted = group.events.sort((a, b) => {
      // Source priority
      const sourcePriority: Record<string, number> = {
        'more.com': 1,
        'viva.gr': 2,
        'gazarte.gr': 3,
      };
      const aPriority = sourcePriority[a.source] || 4;
      const bPriority = sourcePriority[b.source] || 4;
      if (aPriority !== bPriority) return aPriority - bPriority;

      // Description length (longer is better)
      if (a.desc_len !== b.desc_len) return b.desc_len - a.desc_len;

      // Title length (longer is more descriptive)
      return b.title.length - a.title.length;
    });

    // Mark all but the first (best) for removal
    for (let i = 1; i < sorted.length; i++) {
      idsToRemove.push(sorted[i].id);
      smartRemovalCount++;
    }
  }

  if (!DRY_RUN && idsToRemove.length > 0) {
    // Delete in batches to avoid SQL limits
    const batchSize = 100;
    for (let i = 0; i < idsToRemove.length; i += batchSize) {
      const batch = idsToRemove.slice(i, i + batchSize);
      const placeholders = batch.map(() => '?').join(',');
      db.prepare(`DELETE FROM events WHERE id IN (${placeholders})`).run(...batch);
    }
    totalRemoved += smartRemovalCount;
    removalsByPass['Smart title match'] = smartRemovalCount;
  }

  console.log(`\n${DRY_RUN ? 'Would remove' : 'Removed'} ${smartRemovalCount} smart-matched duplicates\n`);
} else {
  console.log('✅ No smart title match duplicates found\n');
}

/**
 * PASS 8: Festival Same-Day Deduplication
 * When multiple events have the same festival prefix + venue + date,
 * keep only the most comprehensive one (most artists listed).
 *
 * Example: "Release Athens 2026 / Helloween" and "Release Athens 2026 / Helloween, Saxon & more"
 * on the same date at the same venue are the same event with different ticket tiers.
 */
console.log('🎪 PASS 8: Festival Same-Day Deduplication');
console.log('-'.repeat(60));

// Known festival prefixes
const FESTIVAL_PREFIXES = [
  'Release Athens',
  'EJEKT FESTIVAL',
  'Rockwave Festival',
  'Plissken Festival',
  'SNF Nostos',
];

// Get events that might be festival duplicates (same venue + same date + festival-like title)
const festivalCandidates = db.prepare(`
  SELECT id, title, venue_name, date(start_date) as date, source,
         LENGTH(title) as title_len,
         LENGTH(COALESCE(description, '')) as desc_len
  FROM events
  WHERE ${UPCOMING_FILTER}
    AND (dedup_protected = 0 OR dedup_protected IS NULL)
    AND (
      title LIKE 'Release Athens%' OR
      title LIKE 'RELEASE ATHENS%' OR
      title LIKE 'EJEKT FESTIVAL%' OR
      title LIKE 'Rockwave%' OR
      title LIKE 'Plissken%' OR
      title LIKE 'SNF Nostos%'
    )
  ORDER BY date, venue_name, title
`).all() as Array<{
  id: string;
  title: string;
  venue_name: string;
  date: string;
  source: string;
  title_len: number;
  desc_len: number;
}>;

// Group by venue + date
const festivalGroups = new Map<string, typeof festivalCandidates>();

for (const event of festivalCandidates) {
  // Extract the main artist from the title
  // "Release Athens 2026 / Helloween" -> "helloween"
  // "Release Athens 2026 / Helloween, Saxon & more" -> "helloween"
  let mainArtist = '';
  const artistMatch = event.title.match(/\/\s*([^\/,&]+)/);
  if (artistMatch) {
    mainArtist = artistMatch[1].toLowerCase().trim();
    // Remove common suffixes like "& more", "and more", etc.
    mainArtist = mainArtist.replace(/\s*(&|and)\s*more.*$/i, '').trim();
  }

  // Skip if no artist found (generic festival title)
  if (!mainArtist) continue;

  // Extract festival + year
  let baseFestival = '';
  for (const prefix of FESTIVAL_PREFIXES) {
    if (event.title.toLowerCase().includes(prefix.toLowerCase())) {
      const yearMatch = event.title.match(/20\d{2}/);
      const year = yearMatch ? yearMatch[0] : '';
      baseFestival = `${prefix.toLowerCase()} ${year}`.trim();
      break;
    }
  }
  if (!baseFestival) continue;

  // Key includes the MAIN ARTIST so different artists are NOT grouped together
  const key = `${baseFestival}|${mainArtist}|${event.venue_name}|${event.date}`;

  if (!festivalGroups.has(key)) {
    festivalGroups.set(key, []);
  }
  festivalGroups.get(key)!.push(event);
}

// Find groups with duplicates
const festivalDuplicateGroups = Array.from(festivalGroups.entries())
  .filter(([_, events]) => events.length > 1)
  .map(([key, events]) => ({
    key,
    events,
    count: events.length
  }));

if (festivalDuplicateGroups.length > 0) {
  console.log(`Found ${festivalDuplicateGroups.length} festival same-day duplicate groups\n`);

  // Show examples
  for (const group of festivalDuplicateGroups.slice(0, 3)) {
    console.log(`  📅 ${group.key.split('|')[2]} @ ${group.key.split('|')[1]}`);
    for (const evt of group.events) {
      console.log(`    - "${evt.title}"`);
    }
  }
  if (festivalDuplicateGroups.length > 3) {
    console.log(`  ... and ${festivalDuplicateGroups.length - 3} more groups\n`);
  }

  let festivalRemovalCount = 0;
  const idsToRemove: string[] = [];

  // For each group, keep the event with the most artists (longest title with artists)
  for (const group of festivalDuplicateGroups) {
    // Sort: prefer titles with more artists (count "/" and "&" and ",")
    // Then by description length, then by title length
    const sorted = group.events.sort((a, b) => {
      // Count artists indicators in title
      const aArtists = (a.title.match(/[\/&,]/g) || []).length;
      const bArtists = (b.title.match(/[\/&,]/g) || []).length;
      if (aArtists !== bArtists) return bArtists - aArtists;

      // More description is better
      if (a.desc_len !== b.desc_len) return b.desc_len - a.desc_len;

      // Longer title is more descriptive
      return b.title_len - a.title_len;
    });

    // Keep first (best), remove rest
    for (let i = 1; i < sorted.length; i++) {
      idsToRemove.push(sorted[i].id);
      festivalRemovalCount++;
    }
  }

  if (!DRY_RUN && idsToRemove.length > 0) {
    const batchSize = 100;
    for (let i = 0; i < idsToRemove.length; i += batchSize) {
      const batch = idsToRemove.slice(i, i + batchSize);
      const placeholders = batch.map(() => '?').join(',');
      db.prepare(`DELETE FROM events WHERE id IN (${placeholders})`).run(...batch);
    }
    totalRemoved += festivalRemovalCount;
    removalsByPass['Festival same-day'] = festivalRemovalCount;
  }

  console.log(`\n${DRY_RUN ? 'Would remove' : 'Removed'} ${festivalRemovalCount} festival same-day duplicates\n`);
} else {
  console.log('✅ No festival same-day duplicates found\n');
}

/**
 * Final Verification
 */
console.log('='.repeat(60));
console.log('📊 FINAL SUMMARY');
console.log('='.repeat(60) + '\n');

const finalStats = db.prepare(`
  SELECT
    COUNT(*) as total,
    SUM(CASE WHEN dedup_protected = 1 THEN 1 ELSE 0 END) as protected,
    COUNT(DISTINCT url) as unique_urls,
    COUNT(DISTINCT title || venue_name || date(start_date)) as unique_events
  FROM events
  WHERE ${UPCOMING_FILTER};
`).get() as { total: number; protected: number; unique_urls: number; unique_events: number };

const initialCount = finalStats.total + totalRemoved;
const removalRate = totalRemoved / initialCount;

console.log(`Events before deduplication: ${initialCount}`);
console.log(`Protected (recurring): ${finalStats.protected}`);
console.log(`Events after deduplication: ${finalStats.total}`);
console.log(`Unique URLs: ${finalStats.unique_urls}`);
console.log(`Unique (title+venue+date): ${finalStats.unique_events}\n`);

if (!DRY_RUN) {
  console.log(`✅ Successfully removed ${totalRemoved} duplicates (${(removalRate * 100).toFixed(1)}%)\n`);

  if (Object.keys(removalsByPass).length > 0) {
    console.log('Breakdown by pass:');
    for (const [pass, count] of Object.entries(removalsByPass)) {
      console.log(`  ${pass}: ${count}`);
    }
    console.log('');
  }
} else {
  console.log(`💡 Would remove ${totalRemoved} duplicates (${(removalRate * 100).toFixed(1)}%)\n`);

  if (removalRate > REMOVAL_THRESHOLD) {
    console.log(`⚠️  WARNING: High removal rate (${(removalRate * 100).toFixed(1)}%)`);
    console.log(`   Threshold: ${REMOVAL_THRESHOLD * 100}%`);
    console.log(`   Review the report carefully before applying.`);
    console.log(`   Consider running with --dry-run first.\n`);
  }
}

if (finalStats.total !== finalStats.unique_events) {
  console.log(`⚠️  Warning: ${finalStats.total - finalStats.unique_events} potential duplicates remain`);
  console.log(`   Run script again or investigate manually\n`);
} else {
  console.log('✅ Database is fully deduplicated!\n');
}

db.close();
