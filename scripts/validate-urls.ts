#!/usr/bin/env bun

/**
 * URL Validation Script
 *
 * Validates ticket/event URLs for all events in the database.
 * Logs warnings for broken URLs, homepage redirects, and timeouts.
 *
 * Can run as:
 * - Part of daily pipeline (add to scrape-all.ts)
 * - Standalone weekly check: `bun run scripts/validate-urls.ts`
 */

import { getAllEvents, updateEvent } from '../src/db/database';
import { validateEventURLAsync, isValidURLFormat, looksLikeHomepageRedirect } from '../src/utils/url-validator';
import { log, logSummary, type SourceStats } from '../src/utils/logger';

interface ValidationResult {
  eventId: string;
  title: string;
  url: string | undefined;
  valid: boolean;
  status?: number;
  issue?: string;
}

// Rate limit: wait between requests to avoid overwhelming servers
const RATE_LIMIT_MS = 500;

// Group results by issue type
interface ValidationStats {
  total: number;
  valid: number;
  noUrl: number;
  invalidFormat: number;
  homepageRedirect: number;
  notFound: number;
  serverError: number;
  timeout: number;
  otherError: number;
}

async function validateAllUrls(): Promise<ValidationStats> {
  const startTime = Date.now();
  log('INFO', 'url-validator', 'Starting URL validation');

  const events = getAllEvents();
  log('INFO', 'url-validator', `Validating URLs for ${events.length} events`);

  const stats: ValidationStats = {
    total: events.length,
    valid: 0,
    noUrl: 0,
    invalidFormat: 0,
    homepageRedirect: 0,
    notFound: 0,
    serverError: 0,
    timeout: 0,
    otherError: 0
  };

  const brokenUrls: ValidationResult[] = [];

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    const url = event.ticketUrl;

    // Progress log every 50 events
    if (i > 0 && i % 50 === 0) {
      log('INFO', 'url-validator', `Progress: ${i}/${events.length} events validated`);
    }

    // No URL - not an error, just track it
    if (!url) {
      stats.noUrl++;
      continue;
    }

    // Check basic format first (no network request)
    if (!isValidURLFormat(url)) {
      stats.invalidFormat++;
      brokenUrls.push({
        eventId: event.id,
        title: event.title,
        url,
        valid: false,
        issue: 'Invalid URL format'
      });
      log('WARN', 'url-validator', `Invalid URL format: ${event.title} - ${url}`);
      continue;
    }

    // Check for obvious homepage redirects (no network request)
    if (looksLikeHomepageRedirect(url)) {
      stats.homepageRedirect++;
      brokenUrls.push({
        eventId: event.id,
        title: event.title,
        url,
        valid: false,
        issue: 'Homepage redirect (pattern match)'
      });
      log('WARN', 'url-validator', `Homepage redirect pattern: ${event.title} - ${url}`);
      continue;
    }

    // Make HEAD request to validate URL
    try {
      const result = await validateEventURLAsync(url);

      if (result.valid) {
        stats.valid++;
      } else if (result.redirectsToHomepage) {
        stats.homepageRedirect++;
        brokenUrls.push({
          eventId: event.id,
          title: event.title,
          url,
          valid: false,
          status: result.status,
          issue: 'Redirects to homepage'
        });
        log('WARN', 'url-validator', `Homepage redirect (${result.status}): ${event.title} - ${url}`);
      } else if (result.status === 404) {
        stats.notFound++;
        brokenUrls.push({
          eventId: event.id,
          title: event.title,
          url,
          valid: false,
          status: 404,
          issue: '404 Not Found'
        });
        log('WARN', 'url-validator', `404 Not Found: ${event.title} - ${url}`);
      } else if (result.status && result.status >= 500) {
        stats.serverError++;
        brokenUrls.push({
          eventId: event.id,
          title: event.title,
          url,
          valid: false,
          status: result.status,
          issue: `Server error (${result.status})`
        });
        log('WARN', 'url-validator', `Server error (${result.status}): ${event.title} - ${url}`);
      } else {
        stats.otherError++;
        brokenUrls.push({
          eventId: event.id,
          title: event.title,
          url,
          valid: false,
          status: result.status,
          issue: `Unknown error (status: ${result.status})`
        });
        log('WARN', 'url-validator', `Unknown error (${result.status}): ${event.title} - ${url}`);
      }
    } catch (error) {
      // Timeout or network error
      stats.timeout++;
      brokenUrls.push({
        eventId: event.id,
        title: event.title,
        url,
        valid: false,
        issue: 'Timeout/Network error'
      });
      log('WARN', 'url-validator', `Timeout: ${event.title} - ${url}`);
    }

    // Rate limit
    await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_MS));
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);

  // Log summary
  log('INFO', 'url-validator', `Validation complete in ${duration}s`);
  log('INFO', 'url-validator', `Results: ${stats.valid} valid, ${stats.noUrl} without URL, ${brokenUrls.length} issues found`);

  // Log breakdown of issues
  if (brokenUrls.length > 0) {
    log('INFO', 'url-validator', 'Issue breakdown:');
    if (stats.invalidFormat > 0) log('INFO', 'url-validator', `  - Invalid format: ${stats.invalidFormat}`);
    if (stats.homepageRedirect > 0) log('INFO', 'url-validator', `  - Homepage redirect: ${stats.homepageRedirect}`);
    if (stats.notFound > 0) log('INFO', 'url-validator', `  - 404 Not Found: ${stats.notFound}`);
    if (stats.serverError > 0) log('INFO', 'url-validator', `  - Server errors: ${stats.serverError}`);
    if (stats.timeout > 0) log('INFO', 'url-validator', `  - Timeout: ${stats.timeout}`);
    if (stats.otherError > 0) log('INFO', 'url-validator', `  - Other errors: ${stats.otherError}`);
  }

  return stats;
}

/**
 * Quick validation - only checks URL format (no network requests)
 * Suitable for running during daily pipeline
 */
export async function quickValidate(): Promise<{ total: number; issues: number }> {
  const events = getAllEvents();
  let issues = 0;

  for (const event of events) {
    const url = event.ticketUrl;
    if (!url) continue;

    if (!isValidURLFormat(url) || looksLikeHomepageRedirect(url)) {
      issues++;
      log('WARN', 'url-validator', `Quick check failed: ${event.title} - ${url}`);
    }
  }

  return { total: events.length, issues };
}

// Run as standalone script
if (import.meta.main) {
  console.log('🔗 URL Validation Script');
  console.log('========================\n');

  const args = process.argv.slice(2);
  const quickMode = args.includes('--quick');

  if (quickMode) {
    console.log('Running quick validation (format check only)...\n');
    const result = await quickValidate();
    console.log(`\n✅ Quick validation complete`);
    console.log(`   Total events: ${result.total}`);
    console.log(`   URL issues found: ${result.issues}`);
  } else {
    console.log('Running full validation (with network requests)...');
    console.log('This may take several minutes due to rate limiting.\n');

    const stats = await validateAllUrls();

    console.log('\n📊 Validation Results:');
    console.log('======================');
    console.log(`Total events:      ${stats.total}`);
    console.log(`Valid URLs:        ${stats.valid}`);
    console.log(`No URL provided:   ${stats.noUrl}`);
    console.log(`Issues found:      ${stats.invalidFormat + stats.homepageRedirect + stats.notFound + stats.serverError + stats.timeout + stats.otherError}`);
    console.log('');
    console.log('Issue breakdown:');
    console.log(`  Invalid format:    ${stats.invalidFormat}`);
    console.log(`  Homepage redirect: ${stats.homepageRedirect}`);
    console.log(`  404 Not Found:     ${stats.notFound}`);
    console.log(`  Server errors:     ${stats.serverError}`);
    console.log(`  Timeout:           ${stats.timeout}`);
    console.log(`  Other errors:      ${stats.otherError}`);
  }
}
