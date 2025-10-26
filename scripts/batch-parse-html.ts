#!/usr/bin/env bun
/**
 * Batch HTML Parser - Creates parsing batches for manual review
 *
 * Since AI parsing requires interactive tool_agent (Claude Code),
 * this script prepares batches of HTML files for systematic processing.
 *
 * Workflow:
 * 1. Group HTML files by source site
 * 2. Create JSON files with parsing instructions
 * 3. Process each batch manually with Claude Code
 * 4. Import results to database
 */

import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const HTML_DIR = join(import.meta.dir, '../data/html-to-parse');
const OUTPUT_DIR = join(import.meta.dir, '../data/parsed');

interface FileBatch {
  site: string;
  files: string[];
  totalSize: number;
}

/**
 * Group HTML files by source site
 */
function groupFilesBySite(): Map<string, FileBatch> {
  const files = readdirSync(HTML_DIR).filter(f => f.endsWith('.html'));
  const batches = new Map<string, FileBatch>();

  for (const file of files) {
    // Extract site name from filename
    // Format: 2025-10-22-sitename-www-domain-gr-path.html
    const parts = file.split('-');
    const siteStart = 3; // Skip date parts (2025-10-22)
    let siteName = parts[siteStart] || 'unknown';

    // Get file size
    const filePath = join(HTML_DIR, file);
    const stats = Bun.file(filePath);

    if (!batches.has(siteName)) {
      batches.set(siteName, {
        site: siteName,
        files: [],
        totalSize: 0
      });
    }

    const batch = batches.get(siteName)!;
    batch.files.push(file);
    batch.totalSize += stats.size;
  }

  return batches;
}

/**
 * Create parsing instruction file for a batch
 */
function createBatchInstructions(batch: FileBatch): string {
  const instructions = `# Parsing Batch: ${batch.site.toUpperCase()}

## Files to Process (${batch.files.length})
${batch.files.map((f, i) => `${i + 1}. ${f}`).join('\n')}

## Total Size: ${(batch.totalSize / 1024 / 1024).toFixed(2)} MB

## Instructions for Claude Code

For each HTML file above, extract ALL cultural events using this format:

\`\`\`json
[
  {
    "title": "Event name",
    "date": "2025-10-28",
    "time": "21:00",
    "venue": "Venue name",
    "type": "concert|exhibition|cinema|theater|performance|workshop",
    "genre": "jazz|rock|theater|etc",
    "price_type": "free|paid",
    "url": "https://full-url-to-event",
    "description": "Brief description"
  }
]
\`\`\`

### Rules:
- Only Athens events
- Date in YYYY-MM-DD format
- Time in HH:MM 24-hour format (or null)
- Skip events with missing critical fields (title, date, venue)
- Do NOT fabricate information

### Save Results:
Save extracted events to: data/parsed/${batch.site}-events.json
`;

  return instructions;
}

/**
 * Main execution
 */
function main() {
  console.log('🚀 Batch HTML Parser\n');

  // Ensure output directory exists
  try {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  } catch (e) {
    // Directory already exists
  }

  // Group files by site
  const batches = groupFilesBySite();

  console.log(`📊 Found ${batches.size} unique sites:\n`);

  // Create instructions for each batch
  const summary: Array<{ site: string; files: number; sizeMB: number }> = [];

  for (const [siteName, batch] of batches.entries()) {
    const sizeMB = batch.totalSize / 1024 / 1024;
    summary.push({
      site: siteName,
      files: batch.files.length,
      sizeMB: parseFloat(sizeMB.toFixed(2))
    });

    // Write instructions file
    const instructionsPath = join(OUTPUT_DIR, `${siteName}-PARSE-ME.md`);
    const instructions = createBatchInstructions(batch);
    writeFileSync(instructionsPath, instructions);

    console.log(`✅ ${siteName.padEnd(20)} ${batch.files.length.toString().padStart(3)} files  ${sizeMB.toFixed(2).padStart(8)} MB`);
  }

  // Write summary JSON
  const summaryPath = join(OUTPUT_DIR, 'parsing-summary.json');
  writeFileSync(summaryPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    totalSites: batches.size,
    totalFiles: Array.from(batches.values()).reduce((sum, b) => sum + b.files.length, 0),
    batches: summary
  }, null, 2));

  console.log(`\n📁 Instructions saved to: ${OUTPUT_DIR}`);
  console.log(`📊 Summary: ${summaryPath}\n`);

  console.log('✨ Next Steps:');
  console.log('1. Review instruction files in data/parsed/');
  console.log('2. Process each batch with Claude Code');
  console.log('3. Save extracted events to data/parsed/{site}-events.json');
  console.log('4. Run: bun run scripts/import-parsed-events.ts\n');
}

main();
