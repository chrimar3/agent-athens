#!/usr/bin/env bun
/**
 * Venue Address Backfill (S138)
 *
 * Patches venue_address for events whose canonical venue record carries an
 * address in config/athens-venues.json but whose DB row currently has the
 * field empty/NULL. Drives the streetAddress warn count toward zero on the
 * place layer of build-completeness.json.
 *
 * Why a script (not raw SQL):
 *   S137 lesson — raw UPDATE bypasses upsertEvent() normalizers and the
 *   isAthensEvent() filter, which is the same defect class that produced the
 *   original price_type='tba' regression. Routing through upsertEvent keeps
 *   the canonical write path single-belt.
 *
 * Idempotent. Default dry-run; pass --apply to write.
 *
 * Usage:
 *   bun run scripts/migrate-venue-address-backfill.ts            # dry-run
 *   bun run scripts/migrate-venue-address-backfill.ts --apply    # execute
 */

import Database from 'bun:sqlite';
import { rowToEvent, upsertEvent } from '../src/db/database';
import { getVenueByName } from '../src/ticketing/venue-registry';

const APPLY = process.argv.includes('--apply');
const DB_PATH = 'data/events.db';

interface CandidateRow {
  id: string;
  title: string;
  venue_name: string;
  venue_address: string | null;
}

interface OutcomeCounters {
  scanned: number;
  patched: number;
  skipped_no_registry_match: number;
  skipped_no_address_in_config: number;
  skipped_upsert_rejected: number;
}

function main(): void {
  console.log(`\n=== Venue Address Backfill ${APPLY ? '(APPLY)' : '(DRY RUN)'} ===\n`);

  const db = new Database(DB_PATH);
  db.run('PRAGMA journal_mode = WAL;');

  try {
    const candidates = db.prepare(`
      SELECT *
      FROM events
      WHERE location_status IN ('verified_athens', 'pass_through')
        AND (venue_address IS NULL OR venue_address = '')
    `).all() as Array<Record<string, unknown>>;

    console.log(`Candidates with empty venue_address: ${candidates.length}\n`);

    const counters: OutcomeCounters = {
      scanned: 0,
      patched: 0,
      skipped_no_registry_match: 0,
      skipped_no_address_in_config: 0,
      skipped_upsert_rejected: 0,
    };

    const perVenue = new Map<string, { matched: number; missing_addr: number; no_record: number }>();
    const patchedSamples: Array<{ id: string; venue: string; address: string }> = [];

    for (const row of candidates) {
      counters.scanned++;
      const venueName = (row.venue_name as string) ?? '';
      const venueRecord = getVenueByName(venueName);

      const bucket = perVenue.get(venueName) ?? { matched: 0, missing_addr: 0, no_record: 0 };

      if (!venueRecord) {
        counters.skipped_no_registry_match++;
        bucket.no_record++;
        perVenue.set(venueName, bucket);
        continue;
      }

      if (!venueRecord.address || venueRecord.address.trim() === '') {
        counters.skipped_no_address_in_config++;
        bucket.missing_addr++;
        perVenue.set(venueName, bucket);
        continue;
      }

      bucket.matched++;
      perVenue.set(venueName, bucket);

      const event = rowToEvent(row);
      event.venue.address = venueRecord.address;

      if (APPLY) {
        const result = upsertEvent(event, db);
        if (!result.success) {
          counters.skipped_upsert_rejected++;
          console.log(`   [reject] ${event.id} ${event.title} — upsertEvent returned success=false`);
          continue;
        }
      }

      counters.patched++;
      if (patchedSamples.length < 5) {
        patchedSamples.push({ id: event.id, venue: venueName, address: venueRecord.address });
      }
    }

    console.log('Per-venue outcome:');
    const sortedVenues = [...perVenue.entries()].sort((a, b) =>
      (b[1].matched + b[1].missing_addr + b[1].no_record) - (a[1].matched + a[1].missing_addr + a[1].no_record)
    );
    for (const [venue, b] of sortedVenues) {
      const total = b.matched + b.missing_addr + b.no_record;
      const tag = b.matched > 0 && b.missing_addr === 0 && b.no_record === 0
        ? '✓ all patchable'
        : b.matched === 0 && b.no_record > 0
          ? '✗ venue not in registry'
          : b.matched === 0 && b.missing_addr > 0
            ? '⏸ in registry, no address'
            : '~ partial';
      console.log(`   ${venue.padEnd(40)} total=${String(total).padStart(3)}  patchable=${b.matched}  no_addr=${b.missing_addr}  no_record=${b.no_record}  ${tag}`);
    }

    console.log('\nSummary:');
    console.log(`   Scanned:                       ${counters.scanned}`);
    console.log(`   ${APPLY ? 'Patched' : 'Would patch'}:                   ${counters.patched}`);
    console.log(`   Skipped (no registry match):   ${counters.skipped_no_registry_match}`);
    console.log(`   Skipped (no address in config):${counters.skipped_no_address_in_config}`);
    if (APPLY) {
      console.log(`   Skipped (upsert rejected):     ${counters.skipped_upsert_rejected}`);
    }

    if (patchedSamples.length > 0) {
      console.log('\nSample patches:');
      for (const s of patchedSamples) {
        console.log(`   ${s.id}  ${s.venue} → ${s.address}`);
      }
    }

    console.log(`\n=== Migration ${APPLY ? 'complete' : 'preview only — re-run with --apply to write'} ===\n`);
  } finally {
    db.close();
  }
}

main();
