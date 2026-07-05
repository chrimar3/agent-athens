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
 *   bun run scripts/merge-duplicates.ts --min-confidence 0.75   # override ALL layers' floor
 *   bun run scripts/merge-duplicates.ts --exclude-layers artist_extraction
 *     # detect + report pairs from these layers but never execute them (shadow/burn-in mode)
 *
 * @see src/quality/duplicate-detector.ts
 * @see src/quality/field-merger.ts
 * @see src/quality/richness-scorer.ts
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { Database } from 'bun:sqlite';
import { findDuplicates, type DuplicatePair, type MatchLayer } from '../src/quality/duplicate-detector';
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

// Per-layer confidence floor. Layer 4 (artist_extraction) sits below the
// others deliberately — it's a substring match on an already-short string,
// inherently less certain than Layers 1-3. --min-confidence overrides ALL
// layers uniformly (manual/testing use); day-to-day tuning should adjust
// this map instead so loosening one layer never silently loosens another.
const DEFAULT_LAYER_THRESHOLDS: Record<MatchLayer, number> = {
  exact_canonical: 0.75,
  containment: 0.75,
  token_overlap: 0.75,
  artist_extraction: 0.6,
};

const confIdx = cliArgs.indexOf('--min-confidence');
const minConfidenceOverride = confIdx >= 0 ? parseFloat(cliArgs[confIdx + 1]) : null;

function layerThreshold(layer: MatchLayer): number {
  return minConfidenceOverride ?? DEFAULT_LAYER_THRESHOLDS[layer] ?? 0.75;
}

// Layers listed here are still detected and reported every run, but never
// included in the executable set — even with --execute. Used to burn in a
// new layer against real production data before trusting it to delete rows.
const excludeIdx = cliArgs.indexOf('--exclude-layers');
const excludedLayers = new Set<string>(
  excludeIdx >= 0 ? cliArgs[excludeIdx + 1].split(',').map((s) => s.trim()) : []
);

// Per-layer cap on merges executed in a single run, independent of the
// overall SAFETY_THRESHOLD blast-radius check below. Bounds worst-case
// damage from a new/less-trusted layer (e.g. a delimiter-regex edge case
// suddenly matching widely) without waiting on the 20% circuit breaker.
const LAYER_MERGE_CAPS: Partial<Record<MatchLayer, number>> = {
  artist_extraction: 5,
};

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
  console.log(
    `Layer thresholds: ${(Object.keys(DEFAULT_LAYER_THRESHOLDS) as MatchLayer[])
      .map((l) => `${l}=${layerThreshold(l)}`)
      .join(', ')}${minConfidenceOverride !== null ? ' (overridden by --min-confidence)' : ''}`
  );
  if (excludedLayers.size > 0) {
    console.log(`Shadow layers (detected, never executed): ${[...excludedLayers].join(', ')}`);
  }
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
         AND merged_into IS NULL
         AND COALESCE(CASE WHEN type='exhibition' THEN end_date ELSE NULL END, start_date) >= date('now', '-7 days')`
    )
    .all() as Record<string, any>[];

  console.log(`Found ${events.length} eligible events`);

  const eventMap = new Map<string, Record<string, any>>();
  for (const e of events) {
    eventMap.set(e.id as string, e);
  }

  // 3. Detect duplicates, then split into executable vs shadow (never-executed) pairs
  const allPairs = findDuplicates(events, venueConfig);
  const aboveThreshold = allPairs
    .filter((p) => p.confidence >= layerThreshold(p.layer))
    .slice(0, limit);
  const shadowPairs = aboveThreshold.filter((p) => excludedLayers.has(p.layer));
  const filteredPairs = aboveThreshold.filter((p) => !excludedLayers.has(p.layer));

  console.log(
    `Detected ${allPairs.length} duplicate pairs (${aboveThreshold.length} above threshold` +
      (shadowPairs.length > 0 ? `, ${shadowPairs.length} shadow-only` : '') +
      ')'
  );
  console.log('');

  if (shadowPairs.length > 0) {
    console.log('Shadow pairs (detected, NOT executed — burn-in mode):');
    console.log('─'.repeat(80));
    for (const pair of shadowPairs) {
      const a = eventMap.get(pair.eventA);
      const b = eventMap.get(pair.eventB);
      console.log(`  [${pair.layer}] conf=${pair.confidence.toFixed(2)}`);
      console.log(`  "${a?.title}" (${a?.source}) <-> "${b?.title}" (${b?.source})`);
      console.log(`  Reason: ${pair.reason}`);
      console.log('');
    }
  }

  if (filteredPairs.length === 0) {
    console.log('No executable duplicates to merge. Done.');
    db.close();
    return;
  }

  // 4. Per-layer merge cap — bounds worst-case damage from a single layer
  // independent of the overall blast-radius check below.
  const layerCounts: Partial<Record<MatchLayer, number>> = {};
  for (const pair of filteredPairs) {
    layerCounts[pair.layer] = (layerCounts[pair.layer] || 0) + 1;
  }
  for (const [layer, cap] of Object.entries(LAYER_MERGE_CAPS)) {
    const count = layerCounts[layer as MatchLayer] || 0;
    if (count > cap) {
      console.error(
        `SAFETY ABORT: ${count} "${layer}" pairs exceed the per-layer cap of ${cap}. ` +
          `Review manually before re-running (possible false-positive spike).`
      );
      db.close();
      process.exit(1);
    }
  }

  // 5. Overall blast-radius safety check
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

  // 6. Process pairs: score → determine winner → compute merge plan
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

  // 7. Print report
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

  // 8. Summary
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

  // 9. Execute if requested
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
