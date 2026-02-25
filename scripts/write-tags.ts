#!/usr/bin/env bun
/**
 * Write Tags File
 *
 * Writes tags as a JSON array to temp-descriptions/<event-id>.tags.json.
 * Validates tags against TAG_TAXONOMY (warns on non-standard tags).
 *
 * Usage:
 *   bun run scripts/write-tags.ts <event-id> <tag1> <tag2> ...
 *   bun run scripts/write-tags.ts abc123 Jazz Intimate Local-favorite Metro-accessible
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { TAG_TAXONOMY } from '../src/enrichment/description-generator';

const OUTPUT_DIR = 'temp-descriptions';

function main(): void {
  const args = process.argv.slice(2);
  const eventId = args[0];
  const tags = args.slice(1);

  if (!eventId || tags.length === 0) {
    console.error('Usage: bun run scripts/write-tags.ts <event-id> <tag1> <tag2> ...');
    console.error('');
    console.error('Valid tag categories:');
    for (const [category, values] of Object.entries(TAG_TAXONOMY)) {
      console.error(`  ${category}: ${(values as readonly string[]).join(', ')}`);
    }
    process.exit(1);
  }

  // Validate tags against taxonomy
  const allValidTags = Object.values(TAG_TAXONOMY).flat() as string[];
  const invalid = tags.filter(t => !allValidTags.includes(t));

  if (invalid.length > 0) {
    console.log(`WARNING: Non-standard tags: ${invalid.join(', ')}`);
    console.log('  These tags are not in TAG_TAXONOMY. They will be saved but may not render.');
  }

  // Ensure output directory exists
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const filePath = join(OUTPUT_DIR, `${eventId}.tags.json`);
  writeFileSync(filePath, JSON.stringify(tags, null, 2), 'utf-8');

  console.log(`Written: ${filePath} (${tags.length} tags)`);
  console.log(`  Tags: ${tags.join(', ')}`);
}

main();
