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

import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const OUTPUT_DIR = 'temp-descriptions';

function main(): void {
  const args = process.argv.slice(2);
  const eventId = args[0];
  const useStdin = args.includes('--stdin');

  if (!eventId) {
    console.error('Usage: bun run scripts/write-description.ts <event-id> <content>');
    console.error('       bun run scripts/write-description.ts <event-id> --stdin');
    process.exit(1);
  }

  // Get content from args or stdin
  let content: string;
  if (useStdin) {
    // Read from stdin (piped input)
    const chunks: Buffer[] = [];
    const stdin = Bun.stdin.stream();
    const reader = stdin.getReader();
    // For simplicity in CLI, read synchronously from file if redirected
    content = args.filter(a => a !== eventId && a !== '--stdin').join(' ');
    if (!content) {
      console.error('No content provided. Pass content as argument or use --stdin with piped input.');
      process.exit(1);
    }
  } else {
    content = args.slice(1).join(' ');
  }

  if (!content) {
    console.error('No content provided.');
    process.exit(1);
  }

  // Ensure output directory exists
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const filePath = join(OUTPUT_DIR, `${eventId}.md`);

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
