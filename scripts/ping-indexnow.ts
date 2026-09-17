#!/usr/bin/env bun

/**
 * IndexNow Ping Script
 *
 * Notifies Bing/Yandex about updated URLs after deployment.
 * Reads all sitemaps to discover URLs, filters to high-value pages,
 * and submits them via the IndexNow API.
 *
 * Usage:
 *   bun run scripts/ping-indexnow.ts                                     # Submit all high-value URLs
 *   bun run scripts/ping-indexnow.ts --dry-run                           # Show what would be submitted
 *   bun run scripts/ping-indexnow.ts --paths=/this-weekend/,/en/this-weekend/  # Targeted re-ping (skips sitemap discovery)
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const PROJECT_DIR = join(import.meta.dir, '..');
const DIST_DIR = join(PROJECT_DIR, 'dist');

// Rule 5: every failure path exits 1 with ONE stderr line the retrier can act on.
function fail(what: string, tryNext: string): never {
  console.error(`ping-indexnow: FAILED — ${what} — try: ${tryNext}`);
  process.exit(1);
}

// Parse arguments — validated BEFORE config/dist are read or anything is pinged.
const unknownArgs = process.argv.slice(2).filter(a => a !== '--dry-run' && !a.startsWith('--paths='));
if (unknownArgs.length > 0) {
  fail(`unknown argument(s): ${unknownArgs.join(' ')}`, '--dry-run and/or --paths=/a/,/b/');
}
const dryRun = process.argv.includes('--dry-run');
const pathsArg = process.argv.find(a => a.startsWith('--paths='));
const explicitPaths = pathsArg
  ? pathsArg.slice('--paths='.length).split(',').map(p => p.trim()).filter(Boolean)
  : null;
if (pathsArg && explicitPaths && explicitPaths.length === 0) {
  fail('--paths= given without any paths', '--paths=/this-weekend/,/en/this-weekend/ (or omit --paths to ping the sitemap set)');
}

async function main() {
  console.log(`🔔 IndexNow Ping${dryRun ? ' (DRY RUN)' : ''}\n`);

  // 1. Load config
  // INDEXNOW_CONFIG overrides the path for tests only; production leaves it
  // unset and reads config/indexnow.json exactly as before.
  const configPath = process.env.INDEXNOW_CONFIG || join(PROJECT_DIR, 'config/indexnow.json');
  let config: { indexnow_key: string; indexnow_endpoint: string; host: string };
  let raw: string;
  try {
    raw = readFileSync(configPath, 'utf-8');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if ((err as NodeJS.ErrnoException)?.code !== 'ENOENT') {
      // Present but unreadable (permissions, a directory, I/O error) is NOT the
      // same as "no key configured" — the configured key has become unusable.
      fail(`could not read ${configPath} (${msg})`, 'fix the file\'s permissions, or delete it if IndexNow should be skipped');
    }
    // ABSENT is the deliberate skip (the daily pipeline must not fail when no
    // key is configured), so it must NOT write to stderr: Rule 5 reserves
    // stderr for the single FAILED line that accompanies a non-zero exit.
    console.log(`⏭️  No IndexNow config at ${configPath} — skipping IndexNow ping.`);
    process.exit(0);
  }
  try {
    config = JSON.parse(raw);
  } catch (err: unknown) {
    // Malformed JSON used to be swallowed into the same exit 0 as "absent",
    // so a corrupted key file looked identical to having no key at all.
    const msg = err instanceof Error ? err.message : String(err);
    fail(`${configPath} is not valid JSON (${msg})`, 'fix the file, or delete it if IndexNow should be skipped');
  }

  if (!config.indexnow_key || config.indexnow_key.length < 16) {
    console.log('⏭️  No valid IndexNow key configured. Skipping.');
    process.exit(0);
  }

  // 2. Parse all sitemaps (unless --paths supplied — then skip discovery and use explicit paths)
  if (explicitPaths && explicitPaths.length > 0) {
    const baseUrl = `https://${config.host}`;
    const targetedUrls = explicitPaths.map(p => `${baseUrl}${p.startsWith('/') ? p : `/${p}`}`);
    console.log(`🎯 Targeted ping: ${targetedUrls.length} explicit URL${targetedUrls.length === 1 ? '' : 's'}`);
    targetedUrls.forEach(u => console.log(`   ${u}`));
    await submitUrls(targetedUrls, config, dryRun);
    return;
  }

  const sitemapFiles = ['sitemap-events.xml', 'sitemap-editorial.xml', 'sitemap-venues.xml'];
  const allUrls: string[] = [];
  const locRegex = /<loc>([^<]+)<\/loc>/g;

  for (const filename of sitemapFiles) {
    const sitemapPath = join(DIST_DIR, filename);
    try {
      const sitemapXml = readFileSync(sitemapPath, 'utf-8');
      let match;
      while ((match = locRegex.exec(sitemapXml)) !== null) {
        allUrls.push(match[1]);
      }
    } catch {
      console.log(`⚠️  Skipping ${filename} (not found)`);
    }
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

    // Normalize: strip /en/ prefix for matching (English pages mirror Greek structure)
    const normalizedPath = path.replace(/^\/en\//, '/');

    // Core time pages
    const coreTimePages = ['/today', '/tomorrow', '/this-week', '/this-weekend', '/this-month', '/next-month', '/all-events'];
    if (coreTimePages.includes(normalizedPath)) {
      highValueUrls.add(url);
      continue;
    }

    // Category pages
    if (categorySlugs.some(slug => normalizedPath === `/${slug}`)) {
      highValueUrls.add(url);
      continue;
    }

    // Individual event pages (/events/* or /en/events/*)
    if (normalizedPath.startsWith('/events/')) {
      highValueUrls.add(url);
      continue;
    }

    // Venue pages (/venues/* or /en/venues/*)
    if (normalizedPath.startsWith('/venues/')) {
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

  await submitUrls(urlList, config, dryRun);
}

async function submitUrls(
  urlList: string[],
  config: { indexnow_key: string; indexnow_endpoint: string; host: string },
  dryRun: boolean,
): Promise<void> {
  // API limit: 10,000 URLs per request. Use 9,500 to leave safety margin.
  const BATCH_SIZE = 9500;
  const batches: string[][] = [];
  for (let i = 0; i < urlList.length; i += BATCH_SIZE) {
    batches.push(urlList.slice(i, i + BATCH_SIZE));
  }

  if (dryRun) {
    console.log('\n--- DRY RUN: Would submit the following ---');
    console.log(`Endpoint: ${config.indexnow_endpoint}`);
    console.log(`Host: ${config.host}`);
    console.log(`Key: ${config.indexnow_key}`);
    console.log(`URL count: ${urlList.length} (in ${batches.length} batch${batches.length === 1 ? '' : 'es'} of ≤${BATCH_SIZE})`);
    console.log('\nSample URLs (first 20):');
    urlList.slice(0, 20).forEach(u => console.log(`  ${u}`));
    if (urlList.length > 20) {
      console.log(`  ... and ${urlList.length - 20} more`);
    }
    process.exit(0);
  }

  console.log(`\n📦 Submitting in ${batches.length} batch${batches.length === 1 ? '' : 'es'} of ≤${BATCH_SIZE}...`);

  let batchFailures = 0;
  let successCount = 0;
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const payload = {
      host: config.host,
      key: config.indexnow_key,
      keyLocation: `https://${config.host}/${config.indexnow_key}.txt`,
      urlList: batch,
    };

    try {
      const response = await fetch(config.indexnow_endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify(payload),
      });

      if (response.status === 200 || response.status === 202) {
        successCount += batch.length;
        console.log(`  ✅ Batch ${i + 1}/${batches.length}: ${response.status} ${response.statusText} (${batch.length} URLs)`);
      } else {
        batchFailures++;
        const body = await response.text();
        console.log(`  ⚠️  Batch ${i + 1}/${batches.length}: ${response.status} ${response.statusText} — ${body}`);
      }
    } catch (err) {
      batchFailures++;
      // stdout, not stderr: the single Rule 5 line emitted below is the only
      // thing this script may write to stderr.
      console.log(`  ❌ Batch ${i + 1}/${batches.length} failed:`, err);
    }

    if (i < batches.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  try {
    const summary = {
      timestamp: new Date().toISOString(),
      submitted: urlList.length,
      success: successCount,
      batches: batches.length,
      failures: batchFailures,
    };
    writeFileSync(join(PROJECT_DIR, 'logs/indexnow-latest.json'), JSON.stringify(summary, null, 2));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`⚠️  Monitoring summary write failed: ${msg}`);
  }

  if (batchFailures === 0) {
    console.log(`\n✅ All ${batches.length} batch${batches.length === 1 ? '' : 'es'} submitted successfully (${urlList.length} URLs total)`);
    process.exit(0);
  } else {
    // The one live non-zero path in this script (daily-automated.sh runs it
    // without --dry-run), so it owes the retrier a Rule 5 line, not stdout.
    fail(
      `${batchFailures}/${batches.length} IndexNow batch${batches.length === 1 ? '' : 'es'} failed`,
      'check logs/indexnow-latest.json and rerun with --dry-run',
    );
  }
}

main().catch((err: unknown) => {
  fail(err instanceof Error ? err.message : String(err), 'rerun with --dry-run to see the URL set without pinging');
});
