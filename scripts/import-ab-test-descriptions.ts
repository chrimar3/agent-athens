#!/usr/bin/env bun
/**
 * Import A/B test Greek descriptions to database
 * Reads from data/ab-test-prompts/results/*.txt and updates full_description_gr
 */

import Database from 'bun:sqlite';
import { readdir, readFile } from 'fs/promises';
import { join } from 'path';

const db = new Database('data/events.db');
const resultsDir = 'data/ab-test-prompts/results';

// Mapping from filename pattern to event ID
const fileToEventId: Record<string, string> = {
  'A1-morrissey-live-in-athens-2025-12-12': 'morrissey-live-in-athens-2025-12-12',
  'A2-stelios-chatzikaleas-quartet-2025-12-11': 'stelios-chatzikaleas-quartet-2025-12-11',
  'A3-3-x-o-2025-12-09': '3-x-o-2025-12-09',
  'A4--2025-12-10': '-2025-12-10',
  'A5-bridal-expo-bridal-fashion-week-2025-2025-12-12': 'bridal-expo-bridal-fashion-week-2025-2025-12-12',
  'B1-a-jazzy-christmas-2025-12-10': 'a-jazzy-christmas-2025-12-10',
  'B2-raised-in-captivity-nicky-silver-2025-12-09': 'raised-in-captivity-nicky-silver-2025-12-09',
  'B3-tilemachos-moussas-farm-2025-12-11': 'tilemachos-moussas-farm-2025-12-11',
  'B4-200-4-1821-2025-2025-12-10': '200-4-1821-2025-2025-12-10',
  'B5-stathis-anninos-raphael-meleteas-for-armando-with-love-2025-12-11': 'stathis-anninos-raphael-meleteas-for-armando-with-love-2025-12-11',
  'C1--2025-12-09': '-2025-12-09',
  'C2-surriento-2025-12-09': 'surriento-2025-12-09',
  'C3-2-2025-12-10': '2-2025-12-10',
  'C4-65-2025-12-10': '65-2025-12-10',
  'C5-aek-bc-patrioti-levice-2025-12-10': 'aek-bc-patrioti-levice-2025-12-10',
};

// A/B test group mapping
const fileToGroup: Record<string, string> = {
  'A1': '250', 'A2': '250', 'A3': '250', 'A4': '250', 'A5': '250',
  'B1': '350', 'B2': '350', 'B3': '350', 'B4': '350', 'B5': '350',
  'C1': '450', 'C2': '450', 'C3': '450', 'C4': '450', 'C5': '450',
};

async function importDescriptions() {
  console.log('📥 Importing A/B test Greek descriptions...\n');

  const files = await readdir(resultsDir);
  const txtFiles = files.filter(f => f.endsWith('-gr.txt'));

  console.log(`Found ${txtFiles.length} description files\n`);

  const updateStmt = db.prepare(`
    UPDATE events
    SET full_description_gr = ?,
        updated_at = datetime('now')
    WHERE id = ?
  `);

  let imported = 0;
  let notFound = 0;
  const stats: Record<string, number> = { '250': 0, '350': 0, '450': 0 };

  for (const file of txtFiles) {
    const baseName = file.replace('-gr.txt', '');
    const eventId = fileToEventId[baseName];
    const group = fileToGroup[baseName.substring(0, 2)];

    if (!eventId) {
      console.log(`⚠️  Unknown file pattern: ${file}`);
      continue;
    }

    // Check if event exists
    const event = db.prepare('SELECT id, title FROM events WHERE id = ?').get(eventId) as { id: string; title: string } | undefined;

    if (!event) {
      console.log(`❌ Event not found: ${eventId}`);
      notFound++;
      continue;
    }

    // Read description
    const filePath = join(resultsDir, file);
    const content = await readFile(filePath, 'utf-8');
    const wordCount = content.trim().split(/\s+/).length;

    // Update database
    updateStmt.run(content.trim(), eventId);

    console.log(`✅ [${group}w] ${event.title.substring(0, 40)}... (${wordCount} words)`);
    imported++;
    stats[group]++;
  }

  console.log('\n' + '='.repeat(60));
  console.log('📊 Import Summary');
  console.log('='.repeat(60));
  console.log(`Total imported: ${imported}`);
  console.log(`Not found: ${notFound}`);
  console.log('');
  console.log('By word count group:');
  console.log(`  250 words (Group A): ${stats['250']}`);
  console.log(`  350 words (Group B): ${stats['350']}`);
  console.log(`  450 words (Group C): ${stats['450']}`);

  // Show current enrichment stats
  const enriched = db.prepare(`
    SELECT COUNT(*) as count FROM events
    WHERE start_date >= date('now')
    AND full_description_gr IS NOT NULL
    AND full_description_gr != ''
  `).get() as { count: number };

  const total = db.prepare(`
    SELECT COUNT(*) as count FROM events WHERE start_date >= date('now')
  `).get() as { count: number };

  console.log('');
  console.log(`Total enriched (Greek): ${enriched.count}/${total.count} (${((enriched.count/total.count)*100).toFixed(1)}%)`);
}

importDescriptions().catch(console.error);
