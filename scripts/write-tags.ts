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

import { writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { TAG_TAXONOMY } from '../src/enrichment/description-generator';

const DEFAULT_OUTPUT_DIR = 'temp-descriptions';

function main(): void {
  const args = process.argv.slice(2);
  const batchDirArg = args.find(a => a.startsWith('--batch-dir='));

  // Warn if --batch-dir omitted but active batch manifests exist
  if (!batchDirArg) {
    const manifests = existsSync('temp-briefs')
      ? readdirSync('temp-briefs').filter(f => f.endsWith('.manifest.json'))
      : [];
    if (manifests.length > 0) {
      console.error('⚠️  WARNING: --batch-dir= not specified but active batches exist.');
      console.error('   Writing to flat temp-descriptions/ risks cross-batch contamination.');
      console.error('   Specify: --batch-dir=temp-descriptions/batch-NNN');
    }
  }

  const outputDir = batchDirArg?.split('=')[1] || DEFAULT_OUTPUT_DIR;
  const positionalArgs = args.filter(a => !a.startsWith('--'));
  const eventId = positionalArgs[0];
  const tags = positionalArgs.slice(1);

  if (!eventId || tags.length === 0) {
    console.error('Usage: bun run scripts/write-tags.ts <event-id> <tag1> <tag2> ...');
    console.error('       bun run scripts/write-tags.ts <event-id> --batch-dir=temp-descriptions/batch-121 <tag1> <tag2> ...');
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
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  const filePath = join(outputDir, `${eventId}.tags.json`);
  writeFileSync(filePath, JSON.stringify(tags, null, 2), 'utf-8');

  console.log(`Written: ${filePath} (${tags.length} tags)`);
  console.log(`  Tags: ${tags.join(', ')}`);
}

main();
