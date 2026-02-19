#!/usr/bin/env bun
/**
 * Standalone Web Scraper
 *
 * Fetches HTML from websites in config/scrape-list.json and saves for Claude Code parsing
 * FREE - no API costs, uses Claude Code for parsing later
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

interface Site {
  id: string;
  name: string;
  url: string;
  tier: number;
  difficulty: string;
  expected_events: number;
  crawl_frequency: string;
  pages: string[];
  categories: string[];
  scrape_method?: string;
  has_newsletter?: boolean;
  is_aggregator?: boolean;
  seasonal?: boolean;
  robots_allowed?: boolean;
  skip?: boolean;
  notes?: string;
}

interface CrawlConfig {
  total_sites: number;
  expected_monthly_events: number;
  user_agent: string;
  default_delay_seconds: number;
  default_crawl_frequency: string;
  default_timeout_ms?: number;
  max_retries?: number;
}

interface ScrapeListConfig {
  crawl_config: CrawlConfig;
  sites: Site[];
  output_schema: any;
  deduplication: any;
}

interface CrawlTracker {
  [siteId: string]: {
    last_crawled: string;
    last_success: string;
    total_crawls: number;
    failed_crawls: number;
  };
}

const SCRAPE_LIST_PATH = './config/scrape-list.json';
const TRACKER_PATH = './data/crawl-tracker.json';
const HTML_OUTPUT_DIR = './data/html-to-parse';

/**
 * Load scrape list configuration
 */
function loadScrapeList(): ScrapeListConfig {
  const content = readFileSync(SCRAPE_LIST_PATH, 'utf-8');
  return JSON.parse(content);
}

/**
 * Load or initialize crawl tracker
 */
function loadCrawlTracker(): CrawlTracker {
  if (!existsSync(TRACKER_PATH)) {
    return {};
  }

  try {
    const content = readFileSync(TRACKER_PATH, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.warn('⚠️  Failed to load crawl tracker, starting fresh');
    return {};
  }
}

/**
 * Save crawl tracker
 */
function saveCrawlTracker(tracker: CrawlTracker): void {
  const dir = './data';
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  writeFileSync(TRACKER_PATH, JSON.stringify(tracker, null, 2));
}

/**
 * Check if site needs to be crawled based on frequency
 */
function shouldCrawlSite(site: Site, tracker: CrawlTracker): boolean {
  const lastCrawled = tracker[site.id]?.last_crawled;

  if (!lastCrawled) {
    return true; // Never crawled before
  }

  const lastCrawlDate = new Date(lastCrawled);
  const now = new Date();
  const hoursSinceLastCrawl = (now.getTime() - lastCrawlDate.getTime()) / (1000 * 60 * 60);

  // Map frequency to hours
  const frequencyMap: { [key: string]: number } = {
    'daily': 24,
    'bi-weekly': 84, // 3.5 days
    'weekly': 168, // 7 days
    'monthly': 720 // 30 days
  };

  const requiredHours = frequencyMap[site.crawl_frequency] || 24;

  return hoursSinceLastCrawl >= requiredHours;
}

/**
 * Fetch HTML from a URL with timeout and retry logic
 */
async function fetchHTML(
  url: string,
  userAgent: string,
  timeoutMs: number = 30000,
  retries: number = 2
): Promise<string> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (attempt > 0) {
        const backoffDelay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        console.log(`   ⏳ Retry ${attempt}/${retries} after ${backoffDelay}ms delay...`);
        await new Promise(resolve => setTimeout(resolve, backoffDelay));
      }

      // Create AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(url, {
          signal: controller.signal,
          headers: {
            'User-Agent': userAgent,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9,el;q=0.8',
            'Accept-Encoding': 'gzip, deflate',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
          },
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return await response.text();
      } catch (fetchError: any) {
        clearTimeout(timeoutId);

        // Check if it's a timeout
        if (fetchError.name === 'AbortError') {
          throw new Error(`Timeout after ${timeoutMs}ms`);
        }

        throw fetchError;
      }
    } catch (error: any) {
      lastError = error;

      // Don't retry on 404 or other client errors
      if (error.message.includes('HTTP 4')) {
        throw error;
      }

      // Continue to retry on timeouts and server errors
      if (attempt < retries) {
        console.log(`   ⚠️  Attempt ${attempt + 1} failed: ${error.message}`);
      }
    }
  }

  throw lastError || new Error('Failed to fetch after retries');
}

/**
 * Save HTML for Claude Code parsing
 */
function saveHTMLForParsing(siteId: string, siteName: string, url: string, html: string): string {
  if (!existsSync(HTML_OUTPUT_DIR)) {
    mkdirSync(HTML_OUTPUT_DIR, { recursive: true });
  }

  const timestamp = new Date().toISOString().split('T')[0];
  const safeId = siteId.replace(/[^a-z0-9]/gi, '-');
  const filename = `${timestamp}-${safeId}.html`;
  const filepath = join(HTML_OUTPUT_DIR, filename);

  // Create metadata file
  const metadataPath = filepath.replace('.html', '.json');
  const metadata = {
    site_id: siteId,
    site_name: siteName,
    url: url,
    fetched_at: new Date().toISOString(),
    html_length: html.length,
  };

  writeFileSync(filepath, html, 'utf-8');
  writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

  return filepath;
}

/**
 * Scrape a single site
 */
async function scrapeSite(
  site: Site,
  config: CrawlConfig,
  tracker: CrawlTracker
): Promise<{ success: boolean; pagesFetched: number; errors: string[] }> {
  console.log(`\n🌐 Scraping: ${site.name} (${site.id})`);
  console.log(`   Tier: ${site.tier} | Difficulty: ${site.difficulty}`);
  console.log(`   Expected events: ${site.expected_events} | Frequency: ${site.crawl_frequency}`);

  // Skip sites marked as skip
  if (site.skip) {
    console.log(`   ⏭️  Skipping: ${site.notes || 'Marked as skip'}`);
    return { success: true, pagesFetched: 0, errors: [] };
  }

  // Skip sites that need social media scraping (not implemented yet)
  if (site.scrape_method === 'social_media_or_aggregator' || site.scrape_method === 'instagram') {
    console.log(`   ⏭️  Skipping: ${site.scrape_method} (not implemented yet)`);
    return { success: true, pagesFetched: 0, errors: [] };
  }

  // Skip sites with no pages
  if (!site.pages || site.pages.length === 0) {
    console.log(`   ⏭️  Skipping: No pages defined`);
    return { success: true, pagesFetched: 0, errors: [] };
  }

  const errors: string[] = [];
  let pagesFetched = 0;

  // Initialize tracker entry if doesn't exist
  if (!tracker[site.id]) {
    tracker[site.id] = {
      last_crawled: '',
      last_success: '',
      total_crawls: 0,
      failed_crawls: 0,
    };
  }

  // Fetch each page
  for (const pageUrl of site.pages) {
    try {
      console.log(`   📥 Fetching: ${pageUrl}`);

      const timeoutMs = config.default_timeout_ms || 30000;
      const maxRetries = config.max_retries || 2;

      const html = await fetchHTML(pageUrl, config.user_agent, timeoutMs, maxRetries);
      const filepath = saveHTMLForParsing(site.id, site.name, pageUrl, html);

      console.log(`   💾 Saved: ${filepath} (${Math.round(html.length / 1024)} KB)`);
      pagesFetched++;

      // Rate limit between pages
      await new Promise(resolve => setTimeout(resolve, config.default_delay_seconds * 1000));

    } catch (error: any) {
      console.error(`   ❌ Failed to fetch ${pageUrl}: ${error.message}`);
      errors.push(`${pageUrl}: ${error.message}`);
    }
  }

  // Update tracker
  tracker[site.id].last_crawled = new Date().toISOString();
  tracker[site.id].total_crawls++;

  if (errors.length > 0) {
    tracker[site.id].failed_crawls++;
  } else {
    tracker[site.id].last_success = new Date().toISOString();
  }

  const success = pagesFetched > 0;

  if (success) {
    console.log(`   ✅ Success: Fetched ${pagesFetched} pages`);
  } else {
    console.log(`   ❌ Failed: No pages fetched`);
  }

  return { success, pagesFetched, errors };
}

/**
 * Main scraping function
 */
async function main() {
  console.log('🕷️  Web Scraper Starting...\n');
  console.log('='.repeat(70));

  // Load configuration
  const scrapeList = loadScrapeList();
  const tracker = loadCrawlTracker();

  console.log(`\n📋 Configuration:`);
  console.log(`   Total sites: ${scrapeList.crawl_config.total_sites}`);
  console.log(`   Expected monthly events: ${scrapeList.crawl_config.expected_monthly_events}`);
  console.log(`   User agent: ${scrapeList.crawl_config.user_agent}`);
  console.log(`   Delay: ${scrapeList.crawl_config.default_delay_seconds}s between requests\n`);

  // Check command line args
  const args = process.argv.slice(2);
  const forceAll = args.includes('--force');
  const siteFilter = args.find(arg => arg.startsWith('--site='))?.split('=')[1];

  if (forceAll) {
    console.log('🔄 Force mode: Crawling all sites regardless of schedule\n');
  }

  if (siteFilter) {
    console.log(`🎯 Filter mode: Only crawling site "${siteFilter}"\n`);
  }

  // Filter sites to crawl
  let sitesToCrawl = scrapeList.sites;

  if (siteFilter) {
    sitesToCrawl = sitesToCrawl.filter(site => site.id === siteFilter);
    if (sitesToCrawl.length === 0) {
      console.error(`❌ No site found with id "${siteFilter}"`);
      process.exit(1);
    }
  }

  if (!forceAll) {
    sitesToCrawl = sitesToCrawl.filter(site => shouldCrawlSite(site, tracker));
  }

  console.log(`📊 Sites to crawl: ${sitesToCrawl.length}/${scrapeList.sites.length}\n`);
  console.log('='.repeat(70));

  if (sitesToCrawl.length === 0) {
    console.log('\n✅ No sites need crawling based on their schedules');
    console.log('💡 Use --force to crawl all sites anyway\n');
    return;
  }

  // Scrape each site
  const results = {
    total: sitesToCrawl.length,
    successful: 0,
    failed: 0,
    totalPages: 0,
    totalErrors: 0,
  };

  for (const site of sitesToCrawl) {
    const result = await scrapeSite(site, scrapeList.crawl_config, tracker);

    if (result.success) {
      results.successful++;
    } else {
      results.failed++;
    }

    results.totalPages += result.pagesFetched;
    results.totalErrors += result.errors.length;
  }

  // Save tracker
  saveCrawlTracker(tracker);

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('\n📊 Scraping Summary:');
  console.log(`   Sites processed: ${results.total}`);
  console.log(`   ✅ Successful: ${results.successful}`);
  console.log(`   ❌ Failed: ${results.failed}`);
  console.log(`   📄 Pages fetched: ${results.totalPages}`);
  console.log(`   ⚠️  Errors: ${results.totalErrors}`);

  console.log('\n💡 Next step:');
  console.log(`   Ask Claude Code: "Parse the HTML files in ${HTML_OUTPUT_DIR}/ and extract events to the database"\n`);

  console.log('✅ Web scraping completed successfully\n');
}

// Run
main().catch((error) => {
  console.error('\n❌ Scraping failed:', error.message);
  process.exit(1);
});
