#!/usr/bin/env bun
/**
 * Main Orchestrator: Automated Web Scraping Pipeline
 *
 * Executes configured scrapers based on frequency, with timeout and retry handling.
 *
 * Usage:
 *   bun run scripts/scrape-all-sources.ts                    # Run all due sources
 *   bun run scripts/scrape-all-sources.ts --force            # Force all sources
 *   bun run scripts/scrape-all-sources.ts --source=viva.gr   # Run specific source
 *   bun run scripts/scrape-all-sources.ts --dry-run          # Preview without executing
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { loadState, saveState, shouldScrape, updateSourceState } from '../src/scraping/state-manager';
import { runSubprocess, runWithRetry } from '../src/scraping/subprocess-runner';
import type { ScrapeConfig, Source } from '../src/scraping/types';

// Parse CLI arguments
const args = process.argv.slice(2);
const force = args.includes('--force');
const dryRun = args.includes('--dry-run');
const specificSource = args.find(arg => arg.startsWith('--source='))?.split('=')[1];

console.log('🤖 Agent Athens - Web Scraping Orchestrator\n');

// Load configuration
const CONFIG_FILE = join(import.meta.dir, '../config/orchestrator-config.json');
let config: ScrapeConfig;

try {
  const configData = readFileSync(CONFIG_FILE, 'utf-8');
  config = JSON.parse(configData);
  console.log(`✅ Loaded config: ${config.sources.length} sources configured\n`);
} catch (error: any) {
  console.error('❌ Failed to load config:', error.message);
  process.exit(1);
}

// Load state
const state = loadState();
console.log(`✅ Loaded state: ${Object.keys(state.sources).length} sources tracked\n`);

// STEP 0: Email Ingestion (Priority 0 - runs before web scraping)
let emailIngestionRan = false;
if (config.email_ingestion && config.email_ingestion.enabled && !specificSource) {
  const emailState = state.email_ingestion || {
    last_scraped: null,
    last_success: null,
    last_failure: null,
    scrape_count: 0,
    failure_count: 0,
    events_imported: 0,
  };

  const isDue = shouldScrape(config.email_ingestion.frequency, emailState.last_scraped, force);

  if (isDue) {
    console.log('📧 STEP 0: Email Ingestion\n');
    console.log('━'.repeat(60));

    if (dryRun) {
      console.log('   🔍 [DRY RUN] Would fetch emails from Gmail');
      console.log(`   Last fetched: ${emailState.last_scraped ? new Date(emailState.last_scraped).toLocaleString() : 'Never'}`);
    } else {
      try {
        console.log('   Running: bun run scripts/ingest-emails.ts');
        const result = await runWithRetry(
          config.email_ingestion.command,
          config.email_ingestion.timeout_ms,
          config.email_ingestion.retry_count
        );

        if (result.success) {
          console.log('   ✅ Email ingestion completed');
          emailIngestionRan = true;

          // Update state
          if (!state.email_ingestion) {
            state.email_ingestion = {
              last_scraped: null,
              last_success: null,
              last_failure: null,
              scrape_count: 0,
              failure_count: 0,
              events_imported: 0,
            };
          }
          state.email_ingestion.last_scraped = new Date().toISOString();
          state.email_ingestion.last_success = new Date().toISOString();
          state.email_ingestion.scrape_count++;
          saveState(state);
        } else {
          console.error(`   ❌ Email ingestion failed: ${result.error}`);
          if (state.email_ingestion) {
            state.email_ingestion.last_failure = new Date().toISOString();
            state.email_ingestion.failure_count++;
            saveState(state);
          }
        }
      } catch (error: any) {
        console.error(`   ❌ Email ingestion error: ${error.message}`);
      }
    }

    console.log('━'.repeat(60));
    console.log('');
  } else {
    const lastFetched = emailState.last_scraped
      ? new Date(emailState.last_scraped).toLocaleString()
      : 'Never';
    console.log(`⏭️  Skipping email ingestion (${config.email_ingestion.frequency}, last: ${lastFetched})\n`);
  }
}

// Filter sources to scrape
let sourcesToScrape = config.sources.filter(source => source.enabled);

// Apply --source filter
if (specificSource) {
  sourcesToScrape = sourcesToScrape.filter(s => s.id === specificSource);
  if (sourcesToScrape.length === 0) {
    console.error(`❌ Source '${specificSource}' not found in config`);
    process.exit(1);
  }
  console.log(`🎯 Filtering to specific source: ${specificSource}\n`);
}

// Apply frequency filter (unless --force)
if (!force && !specificSource) {
  sourcesToScrape = sourcesToScrape.filter(source => {
    const sourceState = state.sources[source.id];
    const lastScraped = sourceState?.last_scraped || null;
    const isDue = shouldScrape(source.frequency, lastScraped, force);

    if (!isDue) {
      const lastDate = lastScraped ? new Date(lastScraped).toLocaleString() : 'Never';
      console.log(`⏭️  Skipping ${source.id} (${source.frequency}, last: ${lastDate})`);
    }

    return isDue;
  });
}

// Sort by priority (lower number = higher priority)
sourcesToScrape.sort((a, b) => a.priority - b.priority);

// Display execution plan
console.log('📋 Execution Plan:\n');
if (sourcesToScrape.length === 0) {
  console.log('   No sources due for scraping.');
  if (!force) {
    console.log('   💡 Use --force to run all sources regardless of frequency.\n');
  }
  process.exit(0);
}

for (const source of sourcesToScrape) {
  const sourceState = state.sources[source.id];
  const lastScraped = sourceState?.last_scraped
    ? new Date(sourceState.last_scraped).toLocaleString()
    : 'Never';

  console.log(`   ${source.priority}. ${source.name} (${source.id})`);
  console.log(`      Frequency: ${source.frequency}`);
  console.log(`      Last scraped: ${lastScraped}`);
  console.log(`      Timeout: ${source.scraper.timeout_ms}ms, Retries: ${source.scraper.retry_count}`);
  console.log('');
}

if (dryRun) {
  console.log('🔍 DRY RUN MODE - No scripts will be executed\n');
  process.exit(0);
}

// Execute scraping pipeline
console.log('🚀 Starting scraping pipeline...\n');
console.log('━'.repeat(60));

let successCount = 0;
let failureCount = 0;
const results: Array<{ source: string; success: boolean; eventsImported: number; error?: string }> = [];

for (let i = 0; i < sourcesToScrape.length; i++) {
  const source = sourcesToScrape[i];
  const isLast = i === sourcesToScrape.length - 1;

  console.log(`\n[${i + 1}/${sourcesToScrape.length}] ${source.name} (${source.id})`);
  console.log('━'.repeat(60));

  let pipelineSuccess = true;
  let eventsImported = 0;
  let pipelineError: string | undefined;

  try {
    // Step 1: Run scraper
    console.log(`\n🕷️  Step 1/3: Running scraper...`);
    console.log(`   Command: ${source.scraper.command.join(' ')}`);

    const scraperResult = await runWithRetry(
      source.scraper.command,
      source.scraper.timeout_ms,
      source.scraper.retry_count
    );

    if (!scraperResult.success) {
      pipelineSuccess = false;
      pipelineError = scraperResult.error || 'Scraper failed';
      console.error(`   ❌ Scraper failed: ${pipelineError}`);

      // Update state and continue to next source
      updateSourceState(state, source.id, false, 0, pipelineError);
      saveState(state);
      failureCount++;
      results.push({ source: source.id, success: false, eventsImported: 0, error: pipelineError });
      continue;
    }

    console.log(`   ✅ Scraper completed successfully`);
    if (scraperResult.stdout) {
      console.log(`   Output: ${scraperResult.stdout.substring(0, 200)}...`);
    }

    // Step 2: Run parser (if configured)
    if (source.parser) {
      console.log(`\n📝 Step 2/3: Running parser...`);
      console.log(`   Script: ${source.parser.script}`);

      const parserCommand = ['python3', `scripts/${source.parser.script}`];
      const parserResult = await runSubprocess(parserCommand, 60000); // 1 minute timeout for parser

      if (!parserResult.success) {
        pipelineSuccess = false;
        pipelineError = parserResult.error || 'Parser failed';
        console.error(`   ❌ Parser failed: ${pipelineError}`);

        updateSourceState(state, source.id, false, 0, pipelineError);
        saveState(state);
        failureCount++;
        results.push({ source: source.id, success: false, eventsImported: 0, error: pipelineError });
        continue;
      }

      console.log(`   ✅ Parser completed successfully`);
    } else {
      console.log(`\n📝 Step 2/3: No parser configured (skipping)`);
    }

    // Step 3: Run importer
    console.log(`\n💾 Step 3/3: Running importer...`);
    console.log(`   Script: ${source.importer.script}`);

    const importerCommand = ['bun', 'run', source.importer.script];
    const importerResult = await runSubprocess(importerCommand, 60000); // 1 minute timeout for importer

    if (!importerResult.success) {
      pipelineSuccess = false;
      pipelineError = importerResult.error || 'Importer failed';
      console.error(`   ❌ Importer failed: ${pipelineError}`);

      updateSourceState(state, source.id, false, 0, pipelineError);
      saveState(state);
      failureCount++;
      results.push({ source: source.id, success: false, eventsImported: 0, error: pipelineError });
      continue;
    }

    console.log(`   ✅ Importer completed successfully`);

    // Parse events imported from importer output
    const importMatch = importerResult.stdout.match(/imported (\d+) events?/i);
    if (importMatch) {
      eventsImported = parseInt(importMatch[1]);
      console.log(`   📊 Events imported: ${eventsImported}`);
    }

    // Update state with success
    updateSourceState(state, source.id, true, eventsImported);
    saveState(state);
    successCount++;
    results.push({ source: source.id, success: true, eventsImported });

    console.log(`\n✅ Pipeline completed for ${source.name}`);

  } catch (error: any) {
    pipelineSuccess = false;
    pipelineError = error.message;
    console.error(`\n❌ Pipeline error: ${pipelineError}`);

    updateSourceState(state, source.id, false, 0, pipelineError);
    saveState(state);
    failureCount++;
    results.push({ source: source.id, success: false, eventsImported: 0, error: pipelineError });
  }

  // Rate limiting (wait before next source, except for last source)
  if (!isLast && source.rate_limit_ms > 0) {
    console.log(`\n⏳ Rate limiting: Waiting ${source.rate_limit_ms}ms before next source...`);
    await new Promise(resolve => setTimeout(resolve, source.rate_limit_ms));
  }
}

// Final summary
console.log('\n');
console.log('━'.repeat(60));
console.log('📊 SCRAPING SUMMARY');
console.log('━'.repeat(60));
console.log(`\n✅ Successful: ${successCount}`);
console.log(`❌ Failed: ${failureCount}`);
console.log(`📝 Total sources processed: ${sourcesToScrape.length}\n`);

// Detailed results
console.log('Detailed Results:\n');
for (const result of results) {
  if (result.success) {
    console.log(`  ✅ ${result.source}: ${result.eventsImported} events imported`);
  } else {
    console.log(`  ❌ ${result.source}: ${result.error}`);
  }
}

// Total events imported
const totalEventsImported = results.reduce((sum, r) => sum + r.eventsImported, 0);
console.log(`\n📈 Total events imported: ${totalEventsImported}`);

// State file location
console.log(`\n💾 State saved to: data/scrape-state.json`);
console.log(`📋 Config: config/scrape-list.json\n`);

// Exit with appropriate code
process.exit(failureCount > 0 ? 1 : 0);
