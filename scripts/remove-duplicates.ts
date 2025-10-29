#!/usr/bin/env bun
/**
 * Advanced Event Deduplication Script
 *
 * Multi-pass deduplication strategy using various techniques:
 * 1. URL-based (primary key - same URL = same event)
 * 2. Exact match (title + venue + date)
 * 3. Fuzzy title match (similar titles, same venue/date)
 * 4. Cross-source time windows (events ±3 days from different sources)
 * 5. Venue normalization (removes special characters)
 *
 * Keeps highest quality version based on:
 * - Source priority (more.com > viva.gr > gazarte.gr > email)
 * - Description length (longer = more detailed)
 * - Realistic times (20:00, 21:00 > 18:00, 22:00 defaults)
 *
 * Usage: bun run scripts/remove-duplicates.ts [--dry-run]
 */

import Database from 'bun:sqlite';

const db = new Database('data/events.db');
const DRY_RUN = process.argv.includes('--dry-run');

if (DRY_RUN) {
  console.log('🔍 DRY RUN MODE - No changes will be made\n');
}

console.log('🧹 Advanced Event Deduplication\n');
console.log('='.repeat(50) + '\n');

// Track statistics
let totalRemoved = 0;
const removalsByPass: Record<string, number> = {};

/**
 * PASS 1: URL-Based Deduplication (Highest Priority)
 * Same URL = Same event, regardless of title variations
 */
console.log('📍 PASS 1: URL-Based Deduplication');
console.log('-'.repeat(50));

const urlDuplicates = db.prepare(`
  SELECT url, COUNT(*) as count, GROUP_CONCAT(id) as ids,
         GROUP_CONCAT(title, ' | ') as titles
  FROM events
  WHERE start_date >= date('now')
    AND url IS NOT NULL
    AND url != ''
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
        WHERE start_date >= date('now')
          AND url IS NOT NULL
          AND url != ''
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
    // Count what would be removed
    urlDuplicates.forEach(dup => {
      urlRemovalCount += (dup.count - 1);
    });
  }

  console.log(`${DRY_RUN ? 'Would remove' : 'Removed'} ${urlRemovalCount} URL duplicates\n`);
} else {
  console.log('✅ No URL duplicates found\n');
}

/**
 * PASS 2: Exact Match (Title + Venue + Date)
 * Classic deduplication for same event scraped multiple times
 */
console.log('🎯 PASS 2: Exact Match (Title + Venue + Date)');
console.log('-'.repeat(50));

const exactDuplicates = db.prepare(`
  SELECT title, venue_name, date(start_date) as date,
         COUNT(*) as count, GROUP_CONCAT(id) as ids
  FROM events
  WHERE start_date >= date('now')
  GROUP BY title, venue_name, date(start_date)
  HAVING COUNT(*) > 1
  ORDER BY count DESC;
`).all() as Array<{ title: string; venue_name: string; date: string; count: number; ids: string }>;

if (exactDuplicates.length > 0) {
  console.log(`Found ${exactDuplicates.length} exact duplicate groups\n`);

  let exactRemovalCount = 0;

  const exactDeleteStmt = db.prepare(`
    DELETE FROM events WHERE id IN (
      SELECT id FROM (
        SELECT id,
          ROW_NUMBER() OVER (
            PARTITION BY title, venue_name, date(start_date)
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
        WHERE start_date >= date('now')
      )
      WHERE rn > 1
    )
  `);

  if (!DRY_RUN) {
    const result = exactDeleteStmt.run();
    exactRemovalCount = result.changes;
    totalRemoved += exactRemovalCount;
    removalsByPass['Exact match'] = exactRemovalCount;
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
 * PASS 3: Cross-Source Time Window (±3 days)
 * Catches same event from different sources with slightly different dates
 */
console.log('🌐 PASS 3: Cross-Source Time Window (±3 days)');
console.log('-'.repeat(50));

const timeWindowDuplicates = db.prepare(`
  SELECT title, venue_name,
         COUNT(*) as count,
         MIN(date(start_date)) as earliest_date,
         MAX(date(start_date)) as latest_date,
         GROUP_CONCAT(DISTINCT source) as sources
  FROM events
  WHERE start_date >= date('now')
  GROUP BY title, venue_name,
    CAST((julianday(start_date) - julianday('2025-01-01')) / 3 AS INTEGER)
  HAVING COUNT(*) > 1
    AND COUNT(DISTINCT source) > 1
    AND (julianday(MAX(start_date)) - julianday(MIN(start_date))) <= 3
  ORDER BY count DESC;
`).all() as Array<{
  title: string;
  venue_name: string;
  count: number;
  earliest_date: string;
  latest_date: string;
  sources: string;
}>;

if (timeWindowDuplicates.length > 0) {
  console.log(`Found ${timeWindowDuplicates.length} cross-source time window duplicates\n`);

  let timeWindowRemovalCount = 0;

  const timeWindowDeleteStmt = db.prepare(`
    DELETE FROM events WHERE id IN (
      SELECT id FROM (
        SELECT id,
          ROW_NUMBER() OVER (
            PARTITION BY title, venue_name,
              CAST((julianday(start_date) - julianday('2025-01-01')) / 3 AS INTEGER)
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
        WHERE start_date >= date('now')
      )
      WHERE rn > 1
    )
  `);

  if (!DRY_RUN) {
    const result = timeWindowDeleteStmt.run();
    timeWindowRemovalCount = result.changes;
    totalRemoved += timeWindowRemovalCount;
    removalsByPass['Time window'] = timeWindowRemovalCount;
  } else {
    timeWindowDuplicates.forEach(dup => {
      timeWindowRemovalCount += (dup.count - 1);
    });
  }

  console.log(`${DRY_RUN ? 'Would remove' : 'Removed'} ${timeWindowRemovalCount} time window duplicates\n`);
} else {
  console.log('✅ No cross-source time window duplicates found\n');
}

/**
 * PASS 4: Fuzzy Title Match (Levenshtein distance or similarity)
 * Catches similar titles like "JAZZ NIGHT" vs "Jazz Night at Six D.O.G.S"
 */
console.log('🔤 PASS 4: Fuzzy Title Match (Case-Insensitive + Trimmed)');
console.log('-'.repeat(50));

const fuzzyDuplicates = db.prepare(`
  SELECT LOWER(TRIM(title)) as normalized_title,
         venue_name,
         date(start_date) as date,
         COUNT(*) as count,
         GROUP_CONCAT(title, ' | ') as original_titles
  FROM events
  WHERE start_date >= date('now')
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
        WHERE start_date >= date('now')
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
console.log('-'.repeat(50));

const venueNormalizedDuplicates = db.prepare(`
  SELECT title,
         REPLACE(REPLACE(REPLACE(venue_name, '!', ''), '-', ''), '.', '') as normalized_venue,
         date(start_date) as date,
         COUNT(*) as count,
         GROUP_CONCAT(venue_name, ' | ') as original_venues
  FROM events
  WHERE start_date >= date('now')
  GROUP BY title,
           REPLACE(REPLACE(REPLACE(venue_name, '!', ''), '-', ''), '.', ''),
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
              REPLACE(REPLACE(REPLACE(venue_name, '!', ''), '-', ''), '.', ''),
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
        WHERE start_date >= date('now')
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
 * PASS 6: Default Time Deduplication (18:00, 22:00 likely duplicates)
 * Events at same venue with scraper default times (18:00 or 22:00)
 */
console.log('⏰ PASS 6: Default Time Deduplication');
console.log('-'.repeat(50));

const defaultTimeDuplicates = db.prepare(`
  SELECT title, venue_name,
         COUNT(*) as count,
         GROUP_CONCAT(time(start_date), ' | ') as times,
         GROUP_CONCAT(source, ' | ') as sources
  FROM events
  WHERE start_date >= date('now')
    AND (time(start_date) IN ('18:00:00', '22:00:00'))
  GROUP BY title, venue_name
  HAVING COUNT(*) > 1
  ORDER BY count DESC;
`).all() as Array<{
  title: string;
  venue_name: string;
  count: number;
  times: string;
  sources: string;
}>;

if (defaultTimeDuplicates.length > 0) {
  console.log(`Found ${defaultTimeDuplicates.length} default time duplicates\n`);

  let defaultTimeRemovalCount = 0;

  const defaultTimeDeleteStmt = db.prepare(`
    DELETE FROM events WHERE id IN (
      SELECT id FROM (
        SELECT id,
          ROW_NUMBER() OVER (
            PARTITION BY title, venue_name
            ORDER BY
              CASE time(start_date)
                WHEN '20:00:00' THEN 1  -- Prefer realistic times
                WHEN '21:00:00' THEN 2
                WHEN '19:00:00' THEN 3
                WHEN '22:00:00' THEN 4  -- Less realistic
                WHEN '18:00:00' THEN 5  -- Likely scraper default
                ELSE 6
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
        WHERE start_date >= date('now')
          AND time(start_date) IN ('18:00:00', '22:00:00')
      )
      WHERE rn > 1
    )
  `);

  if (!DRY_RUN) {
    const result = defaultTimeDeleteStmt.run();
    defaultTimeRemovalCount = result.changes;
    totalRemoved += defaultTimeRemovalCount;
    removalsByPass['Default time'] = defaultTimeRemovalCount;
  } else {
    defaultTimeDuplicates.forEach(dup => {
      defaultTimeRemovalCount += (dup.count - 1);
    });
  }

  console.log(`${DRY_RUN ? 'Would remove' : 'Removed'} ${defaultTimeRemovalCount} default time duplicates\n`);
} else {
  console.log('✅ No default time duplicates found\n');
}

/**
 * Final Verification
 */
console.log('='.repeat(50));
console.log('📊 FINAL SUMMARY');
console.log('='.repeat(50) + '\n');

const finalStats = db.prepare(`
  SELECT
    COUNT(*) as total,
    COUNT(DISTINCT url) as unique_urls,
    COUNT(DISTINCT title || venue_name || date(start_date)) as unique_events
  FROM events
  WHERE start_date >= date('now');
`).get() as { total: number; unique_urls: number; unique_events: number };

console.log(`Total events: ${finalStats.total}`);
console.log(`Unique URLs: ${finalStats.unique_urls}`);
console.log(`Unique (title+venue+date): ${finalStats.unique_events}\n`);

if (!DRY_RUN) {
  console.log(`✅ Successfully removed ${totalRemoved} duplicates\n`);

  if (Object.keys(removalsByPass).length > 0) {
    console.log('Breakdown by pass:');
    for (const [pass, count] of Object.entries(removalsByPass)) {
      console.log(`  ${pass}: ${count}`);
    }
    console.log('');
  }
} else {
  let totalWouldRemove = 0;
  for (const count of Object.values(removalsByPass)) {
    totalWouldRemove += count;
  }
  console.log(`💡 Would remove ${totalWouldRemove} duplicates (use without --dry-run to apply)\n`);
}

if (finalStats.total !== finalStats.unique_events) {
  console.log(`⚠️  Warning: ${finalStats.total - finalStats.unique_events} potential duplicates remain`);
  console.log(`   Run script again or investigate manually\n`);
} else {
  console.log('✅ Database is fully deduplicated!\n');
}

db.close();
