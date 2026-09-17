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

import { fetchEmails, type IngestionResult } from '../src/ingest/email-ingestion';

// Rule 5: every failure path exits 1 with ONE stderr line the retrier can act on.
function fail(what: string, tryNext: string): never {
  console.error(`ingest-emails: FAILED — ${what} — try: ${tryNext}`);
  process.exit(1);
}

/** A non-empty errors array means the run did unsuccessful work — Rule 5. */
export function failuresFrom(result: IngestionResult): string | null {
  return result.errors.length > 0
    ? `${result.errors.length} of ${result.fetched} email(s) failed to ingest`
    : null;
}

// Guarded so importing this module for its seam (failuresFrom) has no side
// effects — arg parsing and the Gmail fetch run only on a direct invocation.
if (import.meta.main) {
// Parse CLI arguments — validated BEFORE connecting: a typo such as --dry_run
// would otherwise fetch, mark and archive real Gmail messages.
const args = process.argv.slice(2);
const unknownArgs = args.filter((a) => a !== '--dry-run');
if (unknownArgs.length > 0) {
  fail(`unknown argument(s): ${unknownArgs.join(' ')}`, '--dry-run (the only flag) or no arguments');
}
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
  .then((result) => {
    const failure = failuresFrom(result);
    if (failure) {
      fail(failure, 'the per-email errors are logged above; fix them and rerun (partial saves are kept)');
    }
    console.log('\n✅ Email ingestion completed successfully');
    console.log('\n💡 Next steps:');
    console.log('   1. Emails saved to: data/emails-to-parse/');
    console.log('   2. Run: bun run scripts/parse-emails.ts');
    console.log('   3. Or ask Claude Code to parse the emails\n');
    process.exit(0);
  })
  .catch((error: unknown) => {
    fail(`email ingestion failed: ${error instanceof Error ? error.message : String(error)}`, 'check Gmail credentials and network, then rerun; --dry-run shows the plan without connecting');
  });
}
