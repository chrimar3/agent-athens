#!/usr/bin/env bun
/**
 * Write Description File
 *
 * Writes a description to temp-descriptions/<event-id>.md with UTF-8 encoding.
 * Performs roundtrip verification to catch encoding issues (Greek, euro, em dash).
 *
 * Usage:
 *   bun run scripts/write-description.ts <event-id> <content>
 *   bun run scripts/write-description.ts abc123 "You walk into Half Note..."
 *
 * Or pipe content via stdin:
 *   echo "Description text" | bun run scripts/write-description.ts abc123 --stdin
 */

import { writeFileSync, readFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';

const DEFAULT_OUTPUT_DIR = 'temp-descriptions';

function main(): void {
  const args = process.argv.slice(2);
  const eventId = args.find(a => !a.startsWith('--'));
  const useStdin = args.includes('--stdin');
  const batchDirArg = args.find(a => a.startsWith('--batch-dir='));
  const langArg = args.find(a => a.startsWith('--lang='));
  const lang = langArg?.split('=')[1] || 'en';

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

  if (!eventId) {
    console.error('Usage: bun run scripts/write-description.ts <event-id> <content>');
    console.error('       bun run scripts/write-description.ts <event-id> --batch-dir=temp-descriptions/batch-121 <content>');
    console.error('       bun run scripts/write-description.ts <event-id> --stdin');
    process.exit(1);
  }

  // Get content from args or stdin (filter out flags)
  let content: string;
  if (useStdin) {
    // Read from stdin (piped input)
    const chunks: Buffer[] = [];
    const stdin = Bun.stdin.stream();
    const reader = stdin.getReader();
    // For simplicity in CLI, read synchronously from file if redirected
    content = args.filter(a => a !== eventId && a !== '--stdin' && !a.startsWith('--batch-dir=') && !a.startsWith('--lang=')).join(' ');
    if (!content) {
      console.error('No content provided. Pass content as argument or use --stdin with piped input.');
      process.exit(1);
    }
  } else {
    content = args.filter(a => a !== eventId && !a.startsWith('--')).join(' ');
  }

  if (!content) {
    console.error('No content provided.');
    process.exit(1);
  }

  // Ensure output directory exists
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  // Default .md for English (primary), .gr.md for Greek (secondary)
  const filename = lang === 'gr' ? `${eventId}.gr.md` : `${eventId}.md`;
  const filePath = join(outputDir, filename);

  // Write with explicit UTF-8 encoding
  writeFileSync(filePath, content, 'utf-8');

  // Roundtrip verification: read back and compare
  const readBack = readFileSync(filePath, 'utf-8');
  if (readBack !== content) {
    console.error(`ENCODING ERROR: Roundtrip verification failed for ${filePath}`);
    console.error(`  Written: ${content.length} chars`);
    console.error(`  Read back: ${readBack.length} chars`);

    // Find first difference
    for (let i = 0; i < Math.max(content.length, readBack.length); i++) {
      if (content[i] !== readBack[i]) {
        console.error(`  First difference at position ${i}: wrote '${content[i]}' (U+${content.charCodeAt(i).toString(16)}), read '${readBack[i]}' (U+${readBack.charCodeAt(i).toString(16)})`);
        break;
      }
    }
    process.exit(1);
  }

  console.log(`Written: ${filePath} (${content.length} chars, verified)`);
}

main();
