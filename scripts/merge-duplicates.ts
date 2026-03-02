#!/usr/bin/env bun
/**
 * Cross-Source Duplicate Merger
 *
 * Detects duplicate events from different sources via 4-layer matching,
 * scores richness to determine the winner, and merges the best fields
 * from both records into the winner before deleting the loser.
 *
 * Runs AFTER remove-duplicates.ts (which handles same-source duplicates).
 * Logs every merge to dedup_merges audit table for undo capability.
 *
 * Usage:
 *   bun run scripts/merge-duplicates.ts              # dry-run (default)
 *   bun run scripts/merge-duplicates.ts --execute     # apply merges
 *   bun run scripts/merge-duplicates.ts --verbose     # field-level details
 *   bun run scripts/merge-duplicates.ts --limit 10    # process max N pairs
 *   bun run scripts/merge-duplicates.ts --min-confidence 0.75
 *
 * @see src/quality/duplicate-detector.ts
 * @see src/quality/field-merger.ts
 * @see src/quality/richness-scorer.ts
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { Database } from 'bun:sqlite';
import { findDuplicates, type DuplicatePair } from '../src/quality/duplicate-detector';
import { mergeEvents, type MergeResult } from '../src/quality/field-merger';
import { scoreRichness } from '../src/quality/richness-scorer';
import type { VenueEntry } from '../src/utils/text-normalize';

// ============================================================================
// CLI Arguments
// ============================================================================

const cliArgs = process.argv.slice(2);
const executeMode = cliArgs.includes('--execute');
const verbose = cliArgs.includes('--verbose');

const limitIdx = cliArgs.indexOf('--limit');
const limit = limitIdx >= 0 ? parseInt(cliArgs[limitIdx + 1]) : Infinity;

const confIdx = cliArgs.indexOf('--min-confidence');
const minConfidence = confIdx >= 0 ? parseFloat(cliArgs[confIdx + 1]) : 0.75;

const SAFETY_THRESHOLD = 0.20; // Abort if > 20% of events would be merged

// ============================================================================
// Database
// ============================================================================

const PROJECT_DIR = join(import.meta.dir, '..');
const DB_PATH = join(PROJECT_DIR, 'data', 'events.db');
const VENUES_PATH = join(PROJECT_DIR, 'config', 'athens-venues.json');

function getDb(): Database {
  const db = new Database(DB_PATH);
  db.run('PRAGMA journal_mode = WAL');
  db.run('PRAGMA foreign_keys = ON');
  return db;
}

// ============================================================================
// Main
// ============================================================================

function main() {
  console.log('==============================================');
  console.log('  Cross-Source Duplicate Merger');
  console.log('==============================================');
  console.log(`Mode: ${executeMode ? 'EXECUTE' : 'DRY RUN'}`);
  console.log(`Min confidence: ${minConfidence}`);
  if (limit < Infinity) console.log(`Limit: ${limit} pairs`);
  console.log('');

  // 1. Load venue config
  const venueData = JSON.parse(readFileSync(VENUES_PATH, 'utf-8'));
  const venueConfig: VenueEntry[] = venueData.venues;
  console.log(`Loaded ${venueConfig.length} venues from config`);

  // 2. Query eligible events
  const db = getDb();
  const events = db
    .prepare(
      `SELECT * FROM events
       WHERE (location_status IN ('verified_athens', 'pass_through') OR location_status IS NULL)
         AND (dedup_protected = 0 OR dedup_protected IS NULL)
         AND COALESCE(CASE WHEN type='exhibition' THEN end_date ELSE NULL END, start_date) >= date('now', '-7 days')`
    )
    .all() as Record<string, any>[];

  console.log(`Found ${events.length} eligible events`);

  // 3. Detect duplicates
  const allPairs = findDuplicates(events, venueConfig);
  const filteredPairs = allPairs
    .filter((p) => p.confidence >= minConfidence)
    .slice(0, limit);

  console.log(`Detected ${allPairs.length} duplicate pairs (${filteredPairs.length} above threshold)`);
  console.log('');

  if (filteredPairs.length === 0) {
    console.log('No duplicates to merge. Done.');
    db.close();
    return;
  }

  // 4. Safety check
  const affectedIds = new Set<string>();
  for (const pair of filteredPairs) {
    affectedIds.add(pair.eventA);
    affectedIds.add(pair.eventB);
  }
  const affectedRatio = affectedIds.size / events.length;
  if (affectedRatio > SAFETY_THRESHOLD) {
    console.error(
      `SAFETY ABORT: ${affectedIds.size}/${events.length} events affected ` +
        `(${(affectedRatio * 100).toFixed(1)}% > ${SAFETY_THRESHOLD * 100}% threshold)`
    );
    db.close();
    process.exit(1);
  }

  // 5. Process pairs: score → determine winner → compute merge plan
  const eventMap = new Map<string, Record<string, any>>();
  for (const e of events) {
    eventMap.set(e.id as string, e);
  }

  const mergeResults: Array<{
    pair: DuplicatePair;
    merge: MergeResult;
    winnerScore: number;
    loserScore: number;
  }> = [];

  for (const pair of filteredPairs) {
    const eventA = eventMap.get(pair.eventA);
    const eventB = eventMap.get(pair.eventB);
    if (!eventA || !eventB) continue;

    const scoreA = scoreRichness(eventA);
    const scoreB = scoreRichness(eventB);

    // Winner = higher score; tie-break by newer updated_at
    let winner: Record<string, any>;
    let loser: Record<string, any>;
    let winnerScore: number;
    let loserScore: number;

    if (scoreA.total > scoreB.total) {
      winner = eventA;
      loser = eventB;
      winnerScore = scoreA.total;
      loserScore = scoreB.total;
    } else if (scoreB.total > scoreA.total) {
      winner = eventB;
      loser = eventA;
      winnerScore = scoreB.total;
      loserScore = scoreA.total;
    } else {
      // Tie: prefer newer updated_at
      if ((eventA.updated_at || '') >= (eventB.updated_at || '')) {
        winner = eventA;
        loser = eventB;
      } else {
        winner = eventB;
        loser = eventA;
      }
      winnerScore = scoreA.total;
      loserScore = scoreB.total;
    }

    const merge = mergeEvents(winner, loser);
    mergeResults.push({ pair, merge, winnerScore, loserScore });
  }

  // 6. Print report
  console.log('Merge Plan:');
  console.log('─'.repeat(80));
  for (const { pair, merge, winnerScore, loserScore } of mergeResults) {
    const winner = eventMap.get(merge.winnerId)!;
    const loser = eventMap.get(merge.loserId)!;

    console.log(
      `  [${pair.layer}] conf=${pair.confidence.toFixed(2)}`
    );
    console.log(
      `  Winner: "${winner.title}" (${winner.source}, score=${winnerScore})`
    );
    console.log(
      `  Loser:  "${loser.title}" (${loser.source}, score=${loserScore})`
    );
    console.log(`  Reason: ${pair.reason}`);

    const fieldNames = Object.keys(merge.updates);
    if (fieldNames.length > 0) {
      console.log(`  Fields to merge: ${fieldNames.join(', ')}`);
    } else {
      console.log('  Fields to merge: (none — winner already has all data)');
    }

    if (verbose && merge.changelog.length > 0) {
      for (const change of merge.changelog) {
        const oldVal =
          typeof change.oldValue === 'string' && change.oldValue.length > 50
            ? change.oldValue.slice(0, 50) + '...'
            : change.oldValue;
        const newVal =
          typeof change.newValue === 'string' && change.newValue.length > 50
            ? change.newValue.slice(0, 50) + '...'
            : change.newValue;
        console.log(
          `    ${change.field}: ${oldVal ?? 'null'} → ${newVal}`
        );
      }
    }
    console.log('');
  }

  // 7. Summary
  console.log('─'.repeat(80));
  console.log(`Total pairs: ${mergeResults.length}`);
  console.log(
    `By layer: ${summarizeLayers(mergeResults.map((r) => r.pair))}`
  );
  const totalFields = mergeResults.reduce(
    (sum, r) => sum + Object.keys(r.merge.updates).length,
    0
  );
  console.log(`Total fields to merge: ${totalFields}`);
  console.log('');

  // 8. Execute if requested
  if (!executeMode) {
    console.log('DRY RUN — no changes made. Pass --execute to apply.');
    db.close();
    return;
  }

  console.log('Executing merges...');

  const insertAudit = db.prepare(`
    INSERT INTO dedup_merges (winner_id, loser_id, confidence, match_layer, match_reason, fields_merged, loser_snapshot)
    VALUES ($winnerId, $loserId, $confidence, $layer, $reason, $fields, $snapshot)
  `);
  const deleteStmt = db.prepare('DELETE FROM events WHERE id = $id');

  let merged = 0;
  let errors = 0;

  for (const { pair, merge } of mergeResults) {
    try {
      db.run('BEGIN TRANSACTION');

      // Update winner with merged fields
      if (Object.keys(merge.updates).length > 0) {
        const setClauses: string[] = [];
        const params: Record<string, any> = { $id: merge.winnerId };

        for (const [field, value] of Object.entries(merge.updates)) {
          setClauses.push(`${field} = $${field}`);
          params[`$${field}`] = value;
        }
        setClauses.push("updated_at = datetime('now')");

        const sql = `UPDATE events SET ${setClauses.join(', ')} WHERE id = $id`;
        db.prepare(sql).run(params);
      }

      // Insert audit log
      insertAudit.run({
        $winnerId: merge.winnerId,
        $loserId: merge.loserId,
        $confidence: pair.confidence,
        $layer: pair.layer,
        $reason: pair.reason,
        $fields: JSON.stringify(Object.keys(merge.updates)),
        $snapshot: JSON.stringify(merge.loserSnapshot),
      });

      // Delete loser
      deleteStmt.run({ $id: merge.loserId });

      db.run('COMMIT');
      merged++;
    } catch (error) {
      db.run('ROLLBACK');
      console.error(`Error merging ${merge.winnerId} + ${merge.loserId}:`, error);
      errors++;
    }
  }

  console.log('');
  console.log(`Done: ${merged} merged, ${errors} errors`);
  db.close();
}

// ============================================================================
// Helpers
// ============================================================================

function summarizeLayers(
  pairs: DuplicatePair[]
): string {
  const counts: Record<string, number> = {};
  for (const p of pairs) {
    counts[p.layer] = (counts[p.layer] || 0) + 1;
  }
  return Object.entries(counts)
    .map(([layer, count]) => `${layer}=${count}`)
    .join(', ');
}

// ============================================================================
// Run
// ============================================================================

main();
