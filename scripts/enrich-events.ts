#!/usr/bin/env bun
// Event Enrichment Status Reporter
// Generates a report of events needing AI enrichment

import { getAllEvents } from '../src/db/database';
import { writeFileSync } from 'fs';
import { join } from 'path';

/**
 * ENRICHMENT WORKFLOW (via Agent Tool):
 *
 * This script doesn't do the enrichment directly.
 * Instead, ask Claude Code to use the Agent tool:
 *
 * Example: "Use the Agent tool to enrich the first 3 events with 400-word descriptions"
 *
 * The agent will handle the Claude API calls and database updates.
 */

async function main() {
  console.log('📋 Event Enrichment Status Report\n');

  // Load all events
  const events = getAllEvents();
  const unenriched = events.filter(e => !e.fullDescription || e.fullDescription.length < 100);

  console.log(`📊 Statistics:`);
  console.log(`   Total events: ${events.length}`);
  console.log(`   Enriched: ${events.length - unenriched.length}`);
  console.log(`   Need enrichment: ${unenriched.length}\n`);

  if (unenriched.length === 0) {
    console.log('✅ All events are already enriched!');
    return;
  }

  console.log('📝 Events needing enrichment:');
  unenriched.slice(0, 10).forEach((event, i) => {
    console.log(`   ${i + 1}. ${event.title}`);
    console.log(`      Type: ${event.type} | Venue: ${event.venue.name}`);
    console.log(`      Date: ${new Date(event.startDate).toLocaleDateString()}`);
  });

  if (unenriched.length > 10) {
    console.log(`   ... and ${unenriched.length - 10} more`);
  }

  console.log('\n💡 To enrich these events:');
  console.log('   Ask Claude Code: "Use the Agent tool to enrich the first 3 events with 400-word descriptions"');
  console.log('   The agent will handle API calls and database updates.\n');

  // Export event data for agent to use
  const exportPath = join(import.meta.dir, '../data/unenriched-events.json');
  writeFileSync(exportPath, JSON.stringify(unenriched, null, 2));
  console.log(`📁 Exported ${unenriched.length} unenriched events to: data/unenriched-events.json`);
}

main().catch(console.error);
