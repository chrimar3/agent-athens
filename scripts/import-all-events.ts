#!/usr/bin/env bun
/**
 * Unified Event Importer for Agent Athens
 * ========================================
 *
 * Imports events from ALL sources:
 * - Tier 1 HTML sites (Viva, More) via tier1-sites.json
 * - Athinorama.gr via athinorama-events.json
 * - Clubber.gr via iCal feed (direct fetch)
 * - Newsletter emails via newsletter-events.json
 *
 * Usage:
 *   bun run scripts/import-all-events.ts              # Import all sources
 *   bun run scripts/import-all-events.ts --source=viva  # Import specific source
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { upsertEvent, getEventStats } from '../src/db/database';
import { normalizeEvents } from '../src/utils/normalize';
import { fetchAndParseICalFeed } from './parsers/ical-parser';

const DATA_DIR = join(import.meta.dir, '../data/parsed');

interface ImportResult {
  source: string;
  total: number;
  newCount: number;
  updatedCount: number;
  skippedCount: number;
  error?: string;
}

async function importTier1Events(): Promise<ImportResult> {
  const source = 'tier1-sites';
  const filePath = join(DATA_DIR, 'tier1-sites.json');

  if (!existsSync(filePath)) {
    return { source, total: 0, newCount: 0, updatedCount: 0, skippedCount: 0, error: 'File not found' };
  }

  try {
    const events = JSON.parse(readFileSync(filePath, 'utf-8'));
    const normalized = normalizeEvents({ events });

    let newCount = 0, updatedCount = 0, skippedCount = 0;

    for (const event of normalized) {
      const result = upsertEvent(event);
      if (result.success) {
        if (result.isNew) newCount++;
        else updatedCount++;
      } else {
        skippedCount++;
      }
    }

    return { source, total: events.length, newCount, updatedCount, skippedCount };
  } catch (e: any) {
    return { source, total: 0, newCount: 0, updatedCount: 0, skippedCount: 0, error: e.message };
  }
}

async function importAthinoramaEvents(): Promise<ImportResult> {
  const source = 'athinorama';
  const filePath = join(DATA_DIR, 'athinorama-events.json');

  if (!existsSync(filePath)) {
    return { source, total: 0, newCount: 0, updatedCount: 0, skippedCount: 0, error: 'File not found' };
  }

  try {
    const events = JSON.parse(readFileSync(filePath, 'utf-8'));
    const normalized = normalizeEvents({ events });

    let newCount = 0, updatedCount = 0, skippedCount = 0;

    for (const event of normalized) {
      const result = upsertEvent(event);
      if (result.success) {
        if (result.isNew) newCount++;
        else updatedCount++;
      } else {
        skippedCount++;
      }
    }

    return { source, total: events.length, newCount, updatedCount, skippedCount };
  } catch (e: any) {
    return { source, total: 0, newCount: 0, updatedCount: 0, skippedCount: 0, error: e.message };
  }
}

async function importClubberEvents(): Promise<ImportResult> {
  const source = 'clubber';
  const ICAL_URL = 'https://www.clubber.gr/events/?ical=1';

  try {
    const events = await fetchAndParseICalFeed(ICAL_URL, { source: 'clubber.gr' });

    // Add location field
    const eventsWithLocation = events.map(e => ({
      ...e,
      location: e.location || 'Athens, Greece'
    }));

    const normalized = normalizeEvents({ events: eventsWithLocation });

    let newCount = 0, updatedCount = 0, skippedCount = 0;

    for (const event of normalized) {
      const result = upsertEvent(event);
      if (result.success) {
        if (result.isNew) newCount++;
        else updatedCount++;
      } else {
        skippedCount++;
      }
    }

    return { source, total: events.length, newCount, updatedCount, skippedCount };
  } catch (e: any) {
    return { source, total: 0, newCount: 0, updatedCount: 0, skippedCount: 0, error: e.message };
  }
}

async function importNewsletterEvents(): Promise<ImportResult> {
  const source = 'newsletter';
  const filePath = join(DATA_DIR, 'newsletter-events.json');

  if (!existsSync(filePath)) {
    return { source, total: 0, newCount: 0, updatedCount: 0, skippedCount: 0, error: 'File not found' };
  }

  try {
    const events = JSON.parse(readFileSync(filePath, 'utf-8'));
    const normalized = normalizeEvents({ events });

    let newCount = 0, updatedCount = 0, skippedCount = 0;

    for (const event of normalized) {
      const result = upsertEvent(event);
      if (result.success) {
        if (result.isNew) newCount++;
        else updatedCount++;
      } else {
        skippedCount++;
      }
    }

    return { source, total: events.length, newCount, updatedCount, skippedCount };
  } catch (e: any) {
    return { source, total: 0, newCount: 0, updatedCount: 0, skippedCount: 0, error: e.message };
  }
}

async function main() {
  console.log('📥 Agent Athens - Unified Event Importer');
  console.log('=' .repeat(60) + '\n');

  // Check for source filter
  const sourceFilter = process.argv.find(arg => arg.startsWith('--source='))?.split('=')[1];

  const results: ImportResult[] = [];

  // Import each source
  const sources = [
    { name: 'tier1', fn: importTier1Events, label: '🎫 Tier-1 Sites (Viva, More)' },
    { name: 'athinorama', fn: importAthinoramaEvents, label: '📰 Athinorama.gr' },
    { name: 'clubber', fn: importClubberEvents, label: '🎵 Clubber.gr (iCal)' },
    { name: 'newsletter', fn: importNewsletterEvents, label: '📧 Newsletter emails' },
  ];

  for (const { name, fn, label } of sources) {
    if (sourceFilter && name !== sourceFilter) continue;

    console.log(`${label}...`);
    const result = await fn();
    results.push(result);

    if (result.error) {
      console.log(`   ⚠️  ${result.error}\n`);
    } else {
      console.log(`   ✅ ${result.newCount} new, ${result.updatedCount} updated, ${result.skippedCount} skipped\n`);
    }
  }

  // Summary
  console.log('=' .repeat(60));
  console.log('📊 IMPORT SUMMARY:\n');

  let totalNew = 0, totalUpdated = 0, totalSkipped = 0;

  for (const r of results) {
    if (!r.error) {
      console.log(`   ${r.source}: +${r.newCount} new, ~${r.updatedCount} updated`);
      totalNew += r.newCount;
      totalUpdated += r.updatedCount;
      totalSkipped += r.skippedCount;
    }
  }

  console.log(`\n   TOTAL: ${totalNew} new, ${totalUpdated} updated, ${totalSkipped} skipped`);

  // Database stats
  console.log('\n📊 Database Statistics:');
  const stats = getEventStats();
  console.log(`   Total events: ${stats.total}`);
  console.log(`   Upcoming events: ${stats.upcomingCount}`);

  console.log('\n   By source:');
  for (const [source, count] of Object.entries(stats.bySource || {})) {
    console.log(`     ${source}: ${count}`);
  }

  // Next steps
  console.log('\n🔄 NEXT STEPS:');
  console.log('   1. bun run scripts/remove-duplicates.ts --dry-run');
  console.log('   2. bun run scripts/remove-duplicates.ts');
  console.log('   3. bun run build\n');
}

main().catch(console.error);
