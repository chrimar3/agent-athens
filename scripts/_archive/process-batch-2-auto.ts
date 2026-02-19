/**
 * BATCH 2 AUTOMATION SCRIPT
 * Processes events 22-40 using Claude Code Task tool
 *
 * This script reads prompts and calls the seo-content-writer agent
 * for each remaining event in Batch 2
 */

import { mkdir } from 'fs/promises';

console.log('🤖 Batch 2 Auto-Processing Script');
console.log('⚠️  This script requires manual Task tool execution');
console.log('📝 Processing Events 22-40 (18 events × 2 languages = 36 Task calls)\n');

// Create results directory
await mkdir('data/batch-2-results', { recursive: true });

// Events 22-40 that need processing
const events = [
  { id: 'yoga-2025-11-05', prefix: '22' },
  { id: 'eat-drink-draw-2025-11-05', prefix: '23' },
  { id: 'messy-play-with-hehe-1-5-5-2025-11-05', prefix: '24' },
  { id: 'andreas-ragnar-kassapis-shame-is-an-object-in-space-2025-11-05', prefix: '25' },
  { id: 'f3d0ba39bc98b2d5', prefix: '26' },
  { id: '0c47c72c04904378', prefix: '27' },
  { id: '7d3143dcee37d636', prefix: '28' },
  { id: '5722a4cf34753b93', prefix: '29' },
  { id: '75b30e22514c29d0', prefix: '30' },
  { id: '852c2d5d67b8656b', prefix: '31' },
  { id: 'e289234b9858a350', prefix: '32' },
  { id: '75c42b186691ca18', prefix: '33' },
  { id: '4c128491f13603b9', prefix: '34' },
  { id: 'william-shakespeare-2025-11-05', prefix: '35' },
  { id: '-2025-11-05', prefix: '36' },
  { id: 'dimos-dimitriadis-songs-in-revolution-2025-11-05', prefix: '37' },
  { id: '8ba859d61dac8ddf', prefix: '38' },
  { id: 'comedy-2025-11-05', prefix: '39' },
  { id: '2-2025-11-05', prefix: '40' },
];

console.log(`📋 Instructions:`);
console.log(`1. For each event below, you need to:`);
console.log(`   - Read the EN prompt file`);
console.log(`   - Call Task tool with seo-content-writer agent`);
console.log(`   - Save result to data/batch-2-results/[prefix]-[id]-en-result.txt`);
console.log(`   - Repeat for GR prompt\n`);

console.log(`📁 Prompt files are in: data/batch-2-prompts/`);
console.log(`💾 Save results to: data/batch-2-results/\n`);

console.log(`🔢 Events to process:\n`);

for (const event of events) {
  console.log(`${event.prefix}. ${event.id}`);
  console.log(`   EN: data/batch-2-prompts/${event.prefix}-${event.id}-en.txt`);
  console.log(`   GR: data/batch-2-prompts/${event.prefix}-${event.id}-gr.txt`);
  console.log(`   → Save EN to: data/batch-2-results/${event.prefix}-${event.id}-en-result.txt`);
  console.log(`   → Save GR to: data/batch-2-results/${event.prefix}-${event.id}-gr-result.txt\n`);
}

console.log(`\n✅ After processing, run: bun run scripts/save-batch-2-complete.ts`);
