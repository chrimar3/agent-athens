#!/usr/bin/env bun

/**
 * IndexNow Ping Script
 *
 * Notifies Bing/Yandex about updated URLs after deployment.
 * Reads sitemap.xml to discover all URLs, filters to high-value pages,
 * and submits them via the IndexNow API.
 *
 * Usage:
 *   bun run scripts/ping-indexnow.ts            # Submit URLs
 *   bun run scripts/ping-indexnow.ts --dry-run   # Show what would be submitted
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const PROJECT_DIR = join(import.meta.dir, '..');
const DIST_DIR = join(PROJECT_DIR, 'dist');

// Parse arguments
const dryRun = process.argv.includes('--dry-run');

async function main() {
  console.log(`🔔 IndexNow Ping${dryRun ? ' (DRY RUN)' : ''}\n`);

  // 1. Load config
  const configPath = join(PROJECT_DIR, 'config/indexnow.json');
  let config: { indexnow_key: string; indexnow_endpoint: string; host: string };
  try {
    config = JSON.parse(readFileSync(configPath, 'utf-8'));
  } catch (err) {
    console.error('❌ Failed to read config/indexnow.json:', err);
    process.exit(0); // Non-fatal
  }

  if (!config.indexnow_key || config.indexnow_key.length < 16) {
    console.log('⏭️  No valid IndexNow key configured. Skipping.');
    process.exit(0);
  }

  // 2. Parse sitemap.xml
  const sitemapPath = join(DIST_DIR, 'sitemap.xml');
  let sitemapXml: string;
  try {
    sitemapXml = readFileSync(sitemapPath, 'utf-8');
  } catch (err) {
    console.error('❌ Failed to read dist/sitemap.xml:', err);
    process.exit(0); // Non-fatal
  }

  // Extract all <loc> URLs
  const allUrls: string[] = [];
  const locRegex = /<loc>([^<]+)<\/loc>/g;
  let match;
  while ((match = locRegex.exec(sitemapXml)) !== null) {
    allUrls.push(match[1]);
  }

  console.log(`📊 Total URLs in sitemap: ${allUrls.length}`);

  // 3. Filter to high-value URLs
  // Load category slugs dynamically
  let categorySlugs: string[] = [];
  try {
    const categoriesConfig = JSON.parse(
      readFileSync(join(PROJECT_DIR, 'config/categories.json'), 'utf-8')
    );
    categorySlugs = categoriesConfig.categories.map((c: { slug: string }) => c.slug);
  } catch {
    console.log('⚠️  Could not load categories.json, continuing without category filter');
  }

  const baseUrl = `https://${config.host}`;
  const highValueUrls = new Set<string>();

  for (const url of allUrls) {
    const path = url.replace(baseUrl, '');

    // Homepage
    if (url === baseUrl || path === '' || path === '/') {
      highValueUrls.add(url);
      continue;
    }

    // Core time pages
    const coreTimePages = ['/today', '/tomorrow', '/this-week', '/this-weekend', '/this-month', '/next-month', '/all-events'];
    if (coreTimePages.includes(path)) {
      highValueUrls.add(url);
      continue;
    }

    // Category pages
    if (categorySlugs.some(slug => path === `/${slug}`)) {
      highValueUrls.add(url);
      continue;
    }

    // Individual event pages (/events/*)
    if (path.startsWith('/events/')) {
      highValueUrls.add(url);
      continue;
    }

    // Venue pages (/venues/*)
    if (path.startsWith('/venues/')) {
      highValueUrls.add(url);
      continue;
    }
  }

  const urlList = Array.from(highValueUrls);
  console.log(`🎯 High-value URLs to submit: ${urlList.length}`);

  if (urlList.length === 0) {
    console.log('No URLs to submit.');
    process.exit(0);
  }

  // 4. Submit to IndexNow
  const payload = {
    host: config.host,
    key: config.indexnow_key,
    keyLocation: `https://${config.host}/${config.indexnow_key}.txt`,
    urlList
  };

  if (dryRun) {
    console.log('\n--- DRY RUN: Would submit the following ---');
    console.log(`Endpoint: ${config.indexnow_endpoint}`);
    console.log(`Host: ${config.host}`);
    console.log(`Key: ${config.indexnow_key}`);
    console.log(`URL count: ${urlList.length}`);
    console.log('\nSample URLs (first 20):');
    urlList.slice(0, 20).forEach(u => console.log(`  ${u}`));
    if (urlList.length > 20) {
      console.log(`  ... and ${urlList.length - 20} more`);
    }
    process.exit(0);
  }

  try {
    const response = await fetch(config.indexnow_endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(payload)
    });

    console.log(`\n📡 IndexNow response: ${response.status} ${response.statusText}`);

    if (response.status === 200 || response.status === 202) {
      console.log('✅ URLs submitted successfully');
    } else {
      const body = await response.text();
      console.log(`⚠️  Unexpected response: ${body}`);
    }
  } catch (err) {
    console.error('⚠️  IndexNow API call failed:', err);
    // Non-fatal — exit 0
  }

  process.exit(0);
}

main();
