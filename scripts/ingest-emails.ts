#!/usr/bin/env bun
/**
 * Email Ingestion Workflow Script
 *
 * Fetches newsletter emails from Gmail and saves them for parsing.
 * Part of the automated daily data collection workflow.
 *
 * Usage:
 *   bun run scripts/ingest-emails.ts              # Fetch all new emails
 *   bun run scripts/ingest-emails.ts --dry-run    # Preview without fetching
 */

import { fetchEmails } from '../src/ingest/email-ingestion';

// Parse CLI arguments
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

console.log('📧 Agent Athens - Email Ingestion\n');

if (dryRun) {
  console.log('🔍 DRY RUN MODE - No emails will be fetched\n');
  console.log('This would:');
  console.log('1. Connect to Gmail (agentathens.events@gmail.com)');
  console.log('2. Fetch unread emails from INBOX');
  console.log('3. Save to data/emails-to-parse/');
  console.log('4. Mark emails as processed');
  console.log('5. Archive emails (move to All Mail)\n');
  process.exit(0);
}

// Run email ingestion
fetchEmails()
  .then(() => {
    console.log('\n✅ Email ingestion completed successfully');
    console.log('\n💡 Next steps:');
    console.log('   1. Emails saved to: data/emails-to-parse/');
    console.log('   2. Run: bun run scripts/parse-emails.ts');
    console.log('   3. Or ask Claude Code to parse the emails\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Email ingestion failed:', error.message);
    process.exit(1);
  });
