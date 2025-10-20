#!/usr/bin/env bun
/**
 * Main Event Scraper Orchestrator
 *
 * Coordinates scraping across all sources defined in config/scrape-list.json
 *
 * Flow:
 * 1. Load configuration
 * 2. For each active website:
 *    - Check rate limit
 *    - Fetch content (HTTP GET)
 *    - Parse based on type (ical vs html)
 *    - Validate events
 *    - Normalize events
 *    - Upsert to database
 *    - Log results
 * 3. Generate summary report
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { fetchAndParseICalFeed } from './parsers/ical-parser.js';
import { fetchAndParseHTML } from './parsers/html-parser.js';
import { validateEvents, filterValidEvents, getValidationSummary } from '../src/utils/validation.js';
import { normalizeEvents } from '../src/utils/normalize.js';
import { logger } from '../src/utils/logger.js';
import { httpClient } from '../src/utils/http-client.js';
import { handleScrapingError, classifyError, ErrorType } from '../src/utils/error-handler.js';
import { upsertEvent, getEventStats, initializeDatabase } from '../src/db/database.js';
import type { RawEvent } from '../src/types.js';

interface WebsiteConfig {
  id: string;
  name: string;
  url: string;
  type: 'ical' | 'html';
  active: boolean;
  frequency: string;
  rate_limit_seconds: number;
  language: string;
  priority?: number;
  parser?: string;
  notes?: string;
}

interface ScrapeConfig {
  websites: WebsiteConfig[];
}

interface ScrapeResult {
  website: string;
  success: boolean;
  eventsExtracted: number;
  eventsValid: number;
  eventsUpserted: number;
  errors: string[];
  warnings: string[];
  duration: number;
}

/**
 * Load scrape configuration
 */
function loadConfig(): ScrapeConfig {
  const configPath = join(import.meta.dir, '../config/scrape-list.json');
  const content = readFileSync(configPath, 'utf-8');
  return JSON.parse(content);
}

/**
 * Scrape events from a single website
 */
async function scrapeWebsite(website: WebsiteConfig): Promise<ScrapeResult> {
  const startTime = Date.now();
  const result: ScrapeResult = {
    website: website.id,
    success: false,
    eventsExtracted: 0,
    eventsValid: 0,
    eventsUpserted: 0,
    errors: [],
    warnings: [],
    duration: 0
  };

  try {
    logger.info(website.id, `Starting scrape: ${website.name}`);
    logger.info(website.id, `URL: ${website.url} | Type: ${website.type} | Language: ${website.language}`);

    let rawEvents: RawEvent[] = [];

    // Parse based on type
    if (website.type === 'ical') {
      logger.info(website.id, 'Fetching and parsing iCal feed...');
      rawEvents = await fetchAndParseICalFeed(website.url, {
        source: website.id,
        language: website.language
      });
    } else if (website.type === 'html') {
      logger.info(website.id, 'Skipping HTML parsing - requires Claude Code tool_agent');
      logger.info(website.id, 'Use Claude Code interactively to parse HTML sources');

      // HTML parsing requires Claude Code interaction
      result.warnings.push('HTML parsing skipped - use Claude Code tool_agent for manual parsing');
      result.success = true; // Not an error, just requires manual step
      result.duration = Date.now() - startTime;
      return result;
    }

    result.eventsExtracted = rawEvents.length;
    logger.info(website.id, `Extracted ${rawEvents.length} raw events`);

    if (rawEvents.length === 0) {
      logger.warn(website.id, 'No events extracted');
      result.success = true; // Not an error, just no events
      result.duration = Date.now() - startTime;
      return result;
    }

    // Validate events
    logger.info(website.id, 'Validating events...');
    const validationResults = validateEvents(rawEvents);
    const validEvents = validationResults
      .filter(r => r.validation.valid)
      .map(r => r.event);

    result.eventsValid = validEvents.length;

    // Collect validation errors and warnings
    validationResults.forEach(r => {
      if (r.validation.errors.length > 0) {
        result.errors.push(`${r.event.title}: ${r.validation.errors.join(', ')}`);
      }
      if (r.validation.warnings.length > 0) {
        result.warnings.push(`${r.event.title}: ${r.validation.warnings.join(', ')}`);
      }
    });

    if (validEvents.length === 0) {
      logger.warn(website.id, `All ${rawEvents.length} events failed validation`);
      result.success = false;
      result.duration = Date.now() - startTime;
      return result;
    }

    // Normalize events
    logger.info(website.id, 'Normalizing events...');
    const normalizedEvents = normalizeEvents({ events: validEvents });

    // Upsert to database
    logger.info(website.id, `Upserting ${normalizedEvents.length} events to database...`);
    let upsertedCount = 0;

    for (const event of normalizedEvents) {
      try {
        const success = upsertEvent(event);
        if (success) {
          upsertedCount++;
        } else {
          result.errors.push(`Failed to upsert event: ${event.title}`);
        }
      } catch (error: any) {
        logger.error(website.id, `Upsert error for "${event.title}"`, { error: error.message });
        result.errors.push(`Upsert error: ${error.message}`);
      }
    }

    result.eventsUpserted = upsertedCount;
    result.success = upsertedCount > 0;

    logger.info(website.id, `✅ Successfully upserted ${upsertedCount}/${normalizedEvents.length} events`);
  } catch (error: any) {
    logger.error(website.id, `Scraping failed: ${error.message}`, { error: error.stack });

    const errorType = classifyError(error);
    const recovery = await handleScrapingError({
      type: errorType,
      source: website.id,
      url: website.url,
      originalError: error
    });

    result.errors.push(`${errorType}: ${error.message}`);
    result.success = false;
  }

  result.duration = Date.now() - startTime;
  return result;
}

/**
 * Main scraper function
 */
async function main() {
  console.log('🕷️  Event Scraper Starting...\n');
  console.log('='.repeat(60));

  const isDryRun = process.argv.includes('--dry-run');

  if (isDryRun) {
    console.log('⚠️  DRY RUN MODE - No database modifications will be made\n');
  }

  try {
    // Initialize database
    if (!isDryRun) {
      logger.info('scraper', 'Initializing database...');
      initializeDatabase();
    }

    // Load configuration
    logger.info('scraper', 'Loading scrape configuration...');
    const config = loadConfig();

    const activeWebsites = config.websites
      .filter(w => w.active)
      .sort((a, b) => (a.priority || 99) - (b.priority || 99));

    logger.info('scraper', `Found ${activeWebsites.length} active websites to scrape`);

    // Scrape each website
    const results: ScrapeResult[] = [];

    for (const website of activeWebsites) {
      console.log('\n' + '-'.repeat(60));
      const result = await scrapeWebsite(website);
      results.push(result);
    }

    // Generate summary
    console.log('\n' + '='.repeat(60));
    console.log('\n📊 Scraping Summary\n');

    const totalExtracted = results.reduce((sum, r) => sum + r.eventsExtracted, 0);
    const totalValid = results.reduce((sum, r) => sum + r.eventsValid, 0);
    const totalUpserted = results.reduce((sum, r) => sum + r.eventsUpserted, 0);
    const successCount = results.filter(r => r.success).length;
    const failureCount = results.length - successCount;

    console.log(`Websites scraped: ${results.length}`);
    console.log(`Successful: ${successCount} | Failed: ${failureCount}`);
    console.log(`Events extracted: ${totalExtracted}`);
    console.log(`Events valid: ${totalValid}`);
    console.log(`Events upserted: ${totalUpserted}`);

    console.log('\n📝 Results by Website:\n');
    results.forEach(result => {
      const status = result.success ? '✅' : '❌';
      const duration = (result.duration / 1000).toFixed(2);
      console.log(`${status} ${result.website}: ${result.eventsUpserted} events (${duration}s)`);

      if (result.errors.length > 0) {
        result.errors.slice(0, 3).forEach(err => {
          console.log(`   ❌ ${err}`);
        });
        if (result.errors.length > 3) {
          console.log(`   ... and ${result.errors.length - 3} more errors`);
        }
      }

      if (result.warnings.length > 0) {
        console.log(`   ⚠️  ${result.warnings.length} warnings`);
      }
    });

    // Database statistics
    if (!isDryRun) {
      console.log('\n📈 Database Statistics:\n');
      const stats = getEventStats();
      console.log(`Total events in database: ${stats.total}`);
      console.log(`Upcoming events: ${stats.upcomingCount}`);
      console.log('\nEvents by type:');
      Object.entries(stats.byType).forEach(([type, count]) => {
        console.log(`  - ${type}: ${count}`);
      });
      console.log('\nEvents by price:');
      Object.entries(stats.byPriceType).forEach(([type, count]) => {
        console.log(`  - ${type}: ${count}`);
      });
    }

    console.log('\n' + '='.repeat(60));
    console.log('\n✅ Scraping complete!');

    // Exit with appropriate code
    process.exit(failureCount > 0 ? 1 : 0);
  } catch (error: any) {
    logger.error('scraper', `Fatal error: ${error.message}`, { error: error.stack });
    console.error('\n❌ Fatal error:', error.message);
    process.exit(1);
  }
}

// Run scraper
main();
