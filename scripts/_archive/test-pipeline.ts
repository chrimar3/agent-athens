#!/usr/bin/env bun
/**
 * End-to-End Integration Test for Agent Athens Pipeline
 *
 * Tests the complete workflow:
 * 1A. Email Ingestion
 * 1B. Web Scraping & Parsing
 * 1C. Database Import
 * 2. Deduplication
 * 3. AI Enrichment (optional)
 * 4. Site Generation
 *
 * Usage:
 *   bun run scripts/test-pipeline.ts              # Standard test (skip AI)
 *   bun run scripts/test-pipeline.ts --full       # Include AI enrichment
 *   bun run scripts/test-pipeline.ts --no-scrape  # Use existing HTML
 */

import { spawn } from 'child_process';
import { existsSync, readdirSync, statSync, readFileSync } from 'fs';
import { join } from 'path';
import { getDatabase } from '../src/db/database';

const TIMEZONE = 'Europe/Athens';
const START_TIME = Date.now();

interface TestResult {
  phase: string;
  passed: boolean;
  duration: number;
  details: string;
  stats?: Record<string, any>;
}

const results: TestResult[] = [];
let currentPhaseStart = Date.now();

// Parse CLI args
const args = process.argv.slice(2);
const INCLUDE_AI = args.includes('--full');
const SKIP_SCRAPE = args.includes('--no-scrape');

/**
 * Print section header
 */
function printHeader(title: string) {
  console.log('\n' + '='.repeat(60));
  console.log(`🧪 ${title}`);
  console.log('='.repeat(60) + '\n');
  currentPhaseStart = Date.now();
}

/**
 * Record test result
 */
function recordResult(phase: string, passed: boolean, details: string, stats?: Record<string, any>) {
  const duration = Date.now() - currentPhaseStart;
  results.push({ phase, passed, duration, details, stats });

  const icon = passed ? '✅' : '❌';
  const time = (duration / 1000).toFixed(1);
  console.log(`\n${icon} ${phase} (${time}s) - ${details}`);

  if (stats) {
    console.log('   Stats:', JSON.stringify(stats, null, 2).split('\n').join('\n   '));
  }
}

/**
 * Run shell command and return exit code
 */
async function runCommand(command: string, args: string[] = []): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: join(import.meta.dir, '..'),
      shell: false,  // Don't use shell to avoid word splitting on spaces
      env: process.env
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data) => {
      const text = data.toString();
      stdout += text;
      process.stdout.write(text);
    });

    child.stderr?.on('data', (data) => {
      const text = data.toString();
      stderr += text;
      process.stderr.write(text);
    });

    child.on('close', (code) => {
      resolve({ exitCode: code || 0, stdout, stderr });
    });
  });
}

/**
 * Count files in directory
 */
function countFiles(dir: string, extension?: string): number {
  if (!existsSync(dir)) return 0;

  const files = readdirSync(dir);
  if (extension) {
    return files.filter(f => f.endsWith(extension)).length;
  }
  return files.length;
}

/**
 * Get database statistics
 */
function getDatabaseStats() {
  const db = getDatabase();

  const totalEvents = db.prepare('SELECT COUNT(*) as count FROM events').get() as { count: number };
  const byType = db.prepare('SELECT type, COUNT(*) as count FROM events GROUP BY type').all() as { type: string; count: number }[];
  const bySource = db.prepare('SELECT source, COUNT(*) as count FROM events GROUP BY source').all() as { source: string; count: number }[];

  return {
    total: totalEvents.count,
    byType: Object.fromEntries(byType.map(r => [r.type, r.count])),
    bySource: Object.fromEntries(bySource.map(r => [r.source, r.count]))
  };
}

/**
 * PHASE 1A: Email Ingestion
 */
async function testEmailIngestion(): Promise<void> {
  printHeader('PHASE 1A: Email Ingestion');

  const emailDir = join(import.meta.dir, '../data/emails-to-parse');
  const beforeCount = countFiles(emailDir, '.json');

  console.log('📧 Fetching emails from Gmail...');
  const result = await runCommand('bun', ['run', 'src/ingest/email-ingestion.ts']);

  const afterCount = countFiles(emailDir, '.json');
  const newEmails = afterCount - beforeCount;

  const passed = result.exitCode === 0;
  const details = newEmails > 0
    ? `${newEmails} new emails fetched`
    : 'No new emails (inbox empty or all processed)';

  recordResult('Email Ingestion', passed, details, {
    totalEmailFiles: afterCount,
    newEmails,
    exitCode: result.exitCode
  });
}

/**
 * PHASE 1B: Web Scraping & Parsing
 */
async function testWebScrapingAndParsing(): Promise<void> {
  printHeader('PHASE 1B: Web Scraping & Parsing');

  const htmlDir = join(import.meta.dir, '../data/html-to-parse');
  const parsedDir = join(import.meta.dir, '../data/parsed');

  let totalEventsParsed = 0;
  const sources = ['viva', 'more'];
  const categories = ['music', 'theater', 'sports'];

  // Scrape HTML
  if (!SKIP_SCRAPE) {
    for (const source of sources) {
      console.log(`\n🌐 Scraping ${source}...`);
      const result = await runCommand('python3', ['scripts/scrape-all-sites.py', '--site', source]);

      if (result.exitCode !== 0) {
        recordResult(`Scraping ${source}`, false, 'Scrape failed', { exitCode: result.exitCode });
        continue;
      }
    }
  } else {
    console.log('⏭️  Skipping scrape (using existing HTML files)');
  }

  const htmlFiles = countFiles(htmlDir, '.html');
  console.log(`\n📂 Found ${htmlFiles} HTML files`);

  // Parse all HTML files
  console.log('\n📝 Parsing HTML files...');
  const files = readdirSync(htmlDir).filter(f => f.endsWith('.html') && (f.includes('viva') || f.includes('more')));

  console.log(`   Found ${files.length} viva/more HTML files to parse`);

  for (const file of files) {
    const filepath = join(htmlDir, file);
    console.log(`   Processing: ${file}`);

    const result = await runCommand('python3', ['parse_viva_events.py', filepath]);

    if (result.exitCode === 0) {
      // Extract event count from output (check both stdout and combined output)
      const combinedOutput = result.stdout + result.stderr;
      const match = combinedOutput.match(/Found (\d+) events/);
      if (match) {
        const count = parseInt(match[1]);
        console.log(`      ✅ Parsed ${count} events`);
        totalEventsParsed += count;
      } else {
        console.log(`      ⚠️  No event count found in output`);
      }
    } else {
      console.log(`      ❌ Parser failed (exit code ${result.exitCode})`);
    }
  }

  const parsedFiles = countFiles(parsedDir, '.json');
  const passed = parsedFiles > 0 && totalEventsParsed > 0;

  recordResult('Web Scraping & Parsing', passed,
    `${totalEventsParsed} events parsed from ${files.length} viva/more HTML files`,
    { totalHtmlFiles: htmlFiles, vivaMoreFiles: files.length, parsedFiles, totalEventsParsed }
  );
}

/**
 * PHASE 1C: Database Import
 */
async function testDatabaseImport(): Promise<void> {
  printHeader('PHASE 1C: Database Import');

  const beforeStats = getDatabaseStats();
  console.log('📊 Before import:', beforeStats);

  let totalNew = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;

  // Import viva.gr
  console.log('\n📥 Importing viva.gr events...');
  let result = await runCommand('bun', ['run', 'scripts/import-viva-events.ts']);
  if (result.exitCode === 0) {
    const newMatch = result.stdout.match(/(\d+) new events inserted/);
    const updatedMatch = result.stdout.match(/(\d+) events updated/);
    const skippedMatch = result.stdout.match(/(\d+) events skipped/);

    if (newMatch) totalNew += parseInt(newMatch[1]);
    if (updatedMatch) totalUpdated += parseInt(updatedMatch[1]);
    if (skippedMatch) totalSkipped += parseInt(skippedMatch[1]);
  }

  // Import more.com
  console.log('\n📥 Importing more.com events...');
  result = await runCommand('bun', ['run', 'scripts/import-more-events.ts']);
  if (result.exitCode === 0) {
    const newMatch = result.stdout.match(/(\d+) new events inserted/);
    const updatedMatch = result.stdout.match(/(\d+) events updated/);
    const skippedMatch = result.stdout.match(/(\d+) events skipped/);

    if (newMatch) totalNew += parseInt(newMatch[1]);
    if (updatedMatch) totalUpdated += parseInt(updatedMatch[1]);
    if (skippedMatch) totalSkipped += parseInt(skippedMatch[1]);
  }

  // Import newsletters (if any exist)
  const newsletterFile = join(import.meta.dir, '../data/parsed/newsletter-events.json');
  if (existsSync(newsletterFile)) {
    console.log('\n📥 Importing newsletter events...');
    result = await runCommand('bun', ['run', 'scripts/import-newsletter-events.ts']);
    if (result.exitCode === 0) {
      const newMatch = result.stdout.match(/(\d+) new events inserted/);
      const updatedMatch = result.stdout.match(/(\d+) events updated/);
      const skippedMatch = result.stdout.match(/(\d+) events skipped/);

      if (newMatch) totalNew += parseInt(newMatch[1]);
      if (updatedMatch) totalUpdated += parseInt(updatedMatch[1]);
      if (skippedMatch) totalSkipped += parseInt(skippedMatch[1]);
    }
  }

  const afterStats = getDatabaseStats();
  console.log('\n📊 After import:', afterStats);

  const totalProcessed = totalNew + totalUpdated;
  const passed = totalProcessed > 0;

  recordResult('Database Import', passed,
    `${totalNew} new, ${totalUpdated} updated, ${totalSkipped} skipped`,
    {
      new: totalNew,
      updated: totalUpdated,
      skipped: totalSkipped,
      databaseBefore: beforeStats.total,
      databaseAfter: afterStats.total,
      increase: afterStats.total - beforeStats.total
    }
  );
}

/**
 * PHASE 2: Deduplication
 */
async function testDeduplication(): Promise<void> {
  printHeader('PHASE 2: Deduplication');

  const beforeStats = getDatabaseStats();

  // Dry run first
  console.log('🔍 Previewing deduplication...');
  let result = await runCommand('bun', ['run', 'scripts/remove-duplicates.ts', '--dry-run']);

  const removalMatch = result.stdout.match(/(\d+) duplicates? would be removed/);
  const estimatedRemovals = removalMatch ? parseInt(removalMatch[1]) : 0;
  const removalRate = beforeStats.total > 0 ? (estimatedRemovals / beforeStats.total * 100).toFixed(1) : '0';

  console.log(`\n   Would remove: ${estimatedRemovals} events (${removalRate}%)`);

  // Apply deduplication
  console.log('\n♻️  Applying deduplication...');
  result = await runCommand('bun', ['run', 'scripts/remove-duplicates.ts']);

  const afterStats = getDatabaseStats();
  const actualRemoved = beforeStats.total - afterStats.total;
  const actualRate = beforeStats.total > 0 ? (actualRemoved / beforeStats.total * 100).toFixed(1) : '0';

  const passed = result.exitCode === 0 && parseFloat(actualRate) < 30; // < 30% removal is acceptable

  recordResult('Deduplication', passed,
    `${actualRemoved} events removed (${actualRate}% rate)`,
    {
      before: beforeStats.total,
      after: afterStats.total,
      removed: actualRemoved,
      removalRate: `${actualRate}%`
    }
  );
}

/**
 * PHASE 3: AI Enrichment (Optional)
 */
async function testAIEnrichment(): Promise<void> {
  printHeader('PHASE 3: AI Enrichment');

  if (!INCLUDE_AI) {
    console.log('⏭️  Skipping AI enrichment (use --full to include)');
    recordResult('AI Enrichment', true, 'SKIPPED (manual testing only)');
    return;
  }

  console.log('🤖 Enriching 5 events for testing...');
  const result = await runCommand('bun', ['run', 'scripts/enrich-5-events.ts']);

  const passed = result.exitCode === 0;
  const enrichedMatch = result.stdout.match(/(\d+) events enriched/);
  const enrichedCount = enrichedMatch ? parseInt(enrichedMatch[1]) : 0;

  recordResult('AI Enrichment', passed,
    `${enrichedCount} events enriched with AI descriptions`,
    { enriched: enrichedCount, exitCode: result.exitCode }
  );
}

/**
 * PHASE 4: Site Generation
 */
async function testSiteGeneration(): Promise<void> {
  printHeader('PHASE 4: Site Generation');

  console.log('🏗️  Building static site...');
  const result = await runCommand('bun', ['run', 'build']);

  const distDir = join(import.meta.dir, '../dist');
  const htmlCount = countFiles(distDir, '.html');
  const jsonCount = countFiles(distDir, '.json');

  const llmsTxtExists = existsSync(join(distDir, 'llms.txt'));
  const robotsTxtExists = existsSync(join(distDir, 'robots.txt'));
  const sitemapExists = existsSync(join(distDir, 'sitemap.xml'));

  const passed = result.exitCode === 0 && htmlCount > 100;

  recordResult('Site Generation', passed,
    `${htmlCount} HTML pages + ${jsonCount} JSON APIs built`,
    {
      htmlPages: htmlCount,
      jsonApis: jsonCount,
      llmsTxt: llmsTxtExists,
      robotsTxt: robotsTxtExists,
      sitemap: sitemapExists,
      exitCode: result.exitCode
    }
  );
}

/**
 * Print final summary
 */
function printSummary(): void {
  console.log('\n' + '='.repeat(60));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(60));

  const totalDuration = (Date.now() - START_TIME) / 1000;
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  console.log('\nResults by Phase:');
  results.forEach((r, i) => {
    const icon = r.passed ? '✅' : '❌';
    const time = (r.duration / 1000).toFixed(1);
    console.log(`  ${i + 1}. ${icon} ${r.phase} (${time}s)`);
    console.log(`     ${r.details}`);
  });

  console.log('\n' + '-'.repeat(60));
  console.log(`Total: ${passed} passed, ${failed} failed`);
  console.log(`Duration: ${totalDuration.toFixed(1)}s`);

  const finalStats = getDatabaseStats();
  console.log('\nFinal Database State:');
  console.log(`  Total events: ${finalStats.total}`);
  console.log('  By type:', JSON.stringify(finalStats.byType, null, 2).split('\n').join('\n  '));
  console.log('  By source:', JSON.stringify(finalStats.bySource, null, 2).split('\n').join('\n  '));

  console.log('\n' + '='.repeat(60));

  if (failed === 0) {
    console.log('🎉 ALL TESTS PASSED!');
    console.log('='.repeat(60) + '\n');
    process.exit(0);
  } else {
    console.log('❌ SOME TESTS FAILED!');
    console.log('='.repeat(60) + '\n');
    process.exit(1);
  }
}

/**
 * Main test execution
 */
async function main() {
  console.log('🧪 Agent Athens - End-to-End Integration Test');
  console.log('━'.repeat(60));
  console.log(`Started: ${new Date().toLocaleString('en-US', { timeZone: TIMEZONE })}`);
  console.log(`Options: AI=${INCLUDE_AI}, Scrape=${!SKIP_SCRAPE}`);

  try {
    await testEmailIngestion();
    await testWebScrapingAndParsing();
    await testDatabaseImport();
    await testDeduplication();
    await testAIEnrichment();
    await testSiteGeneration();

    printSummary();
  } catch (error) {
    console.error('\n❌ Fatal error during testing:', error);
    process.exit(1);
  }
}

main().catch(console.error);
