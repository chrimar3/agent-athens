#!/usr/bin/env bun
/**
 * Group-Based Duplicate Marker — reversible cross-source merge (dedup arc)
 *
 * Successor to scripts/merge-duplicates.ts for the retroactive dedup pass:
 * - Uses findDuplicateGroups (transitive union-find), not first-match pairs,
 *   so N listings of one event collapse in a single run (4-listing Monolink
 *   fixture → 1 survivor + 3 marked losers).
 * - NEVER deletes. Losers get merged_into = survivor id + merged_at
 *   (migration 013) — fully reversible with one UPDATE. Loser pages keep
 *   building until the GEO Strategist rules on URL disposition
 *   (specs/dedup-url-disposition-proposal.md).
 *
 * Survivor policy (dedup-arc brief):
 *   1. Higher enrichment tier wins (full > premium > standard > stub)
 *   2. Tie → higher richness score (scoreRichness: descriptions, ticket
 *      URL, image, prices, source quality)
 *   3. Still tied → group goes to specs/dedup-hold.md, NO merge
 *
 * Usage:
 *   bun run scripts/mark-duplicates.ts             # dry-run (default)
 *   bun run scripts/mark-duplicates.ts --execute   # apply markings
 *   bun run scripts/mark-duplicates.ts --verbose   # field-level details
 *
 * @see src/quality/duplicate-detector.ts (findDuplicateGroups)
 * @see src/quality/field-merger.ts / richness-scorer.ts
 * @see specs/dedup-diagnostic.md (population analysis)
 */

import { readFileSync, appendFileSync } from 'fs';
import { join } from 'path';
import { Database } from 'bun:sqlite';
import {
  findDuplicateGroups,
  type DuplicateGroup,
  type DuplicatePair,
} from '../src/quality/duplicate-detector';
import { mergeEvents } from '../src/quality/field-merger';
import { scoreRichness } from '../src/quality/richness-scorer';
import type { VenueEntry } from '../src/utils/text-normalize';

// ============================================================================
// CLI + Config
// ============================================================================

const cliArgs = process.argv.slice(2);
const executeMode = cliArgs.includes('--execute');
const verbose = cliArgs.includes('--verbose');

const SAFETY_THRESHOLD = 0.2; // Abort if > 20% of eligible events land in groups

const TIER_RANK: Record<string, number> = {
  full: 4,
  premium: 3,
  standard: 2,
  stub: 1,
};

const PROJECT_DIR = join(import.meta.dir, '..');
const DB_PATH = join(PROJECT_DIR, 'data', 'events.db');
const VENUES_PATH = join(PROJECT_DIR, 'config', 'athens-venues.json');
const HOLD_PATH = join(PROJECT_DIR, 'specs', 'dedup-hold.md');

// ============================================================================
// Survivor Selection
// ============================================================================

interface SurvivorDecision {
  survivor: Record<string, any>;
  losers: Record<string, any>[];
  hold: boolean;
  holdReason?: string;
}

function pickSurvivor(members: Record<string, any>[]): SurvivorDecision {
  // 1. Enrichment tier
  const maxTier = Math.max(...members.map((m) => TIER_RANK[m.enrichment_tier] ?? 1));
  const tierWinners = members.filter((m) => (TIER_RANK[m.enrichment_tier] ?? 1) === maxTier);
  if (tierWinners.length === 1) {
    return {
      survivor: tierWinners[0],
      losers: members.filter((m) => m.id !== tierWinners[0].id),
      hold: false,
    };
  }

  // 2. Richness score among tier winners
  const scored = tierWinners
    .map((m) => ({ m, score: scoreRichness(m).total }))
    .sort((a, b) => b.score - a.score);
  if (scored[0].score > scored[1].score) {
    return {
      survivor: scored[0].m,
      losers: members.filter((m) => m.id !== scored[0].m.id),
      hold: false,
    };
  }

  // 3. Ambiguous → HOLD (no updated_at tie-break; the brief routes ties to
  // human review instead)
  return {
    survivor: scored[0].m,
    losers: [],
    hold: true,
    holdReason: `survivor tie: tier=${scored[0].m.enrichment_tier}, richness ${scored[0].score} = ${scored[1].score}`,
  };
}

/** Highest-confidence pair edge that involves the given loser id. */
function bestEdgeFor(group: DuplicateGroup, loserId: string): DuplicatePair {
  const edges = group.pairs.filter((p) => p.eventA === loserId || p.eventB === loserId);
  edges.sort((a, b) => b.confidence - a.confidence);
  return edges[0];
}

// ============================================================================
// Main
// ============================================================================

function main() {
  console.log('==============================================');
  console.log('  Group-Based Duplicate Marker (reversible)');
  console.log('==============================================');
  console.log(`Mode: ${executeMode ? 'EXECUTE' : 'DRY RUN'}`);
  console.log('');

  const venueConfig: VenueEntry[] = JSON.parse(readFileSync(VENUES_PATH, 'utf-8')).venues;

  const db = new Database(DB_PATH);
  db.run('PRAGMA journal_mode = WAL');

  // Guard: refuse to run against an un-migrated DB
  const cols = db.prepare("SELECT name FROM pragma_table_info('events')").all() as { name: string }[];
  if (!cols.some((c) => c.name === 'merged_into')) {
    console.error('ABORT: events.merged_into missing — run scripts/run-migrations.ts first.');
    process.exit(1);
  }

  // Eligibility: same window as merge-duplicates.ts, minus already-merged rows
  const events = db
    .prepare(
      `SELECT * FROM events
       WHERE (location_status IN ('verified_athens', 'pass_through') OR location_status IS NULL)
         AND (dedup_protected = 0 OR dedup_protected IS NULL)
         AND merged_into IS NULL
         AND COALESCE(CASE WHEN type='exhibition' THEN end_date ELSE NULL END, start_date) >= date('now', '-7 days')`
    )
    .all() as Record<string, any>[];
  console.log(`Eligible events: ${events.length}`);

  const groups = findDuplicateGroups(events, venueConfig);
  const grouped = groups.reduce((s, g) => s + g.ids.length, 0);
  console.log(`Duplicate groups: ${groups.length} (${grouped} events)`);
  console.log('');

  // Blast-radius safety check
  if (events.length > 0 && grouped / events.length > SAFETY_THRESHOLD) {
    console.error(
      `SAFETY ABORT: ${grouped}/${events.length} events in groups ` +
        `(${((grouped / events.length) * 100).toFixed(1)}% > ${SAFETY_THRESHOLD * 100}%)`
    );
    db.close();
    process.exit(1);
  }

  const byId = new Map(events.map((e) => [e.id as string, e]));
  const holdEntries: string[] = [];
  let planned = 0;

  interface MarkPlan {
    group: DuplicateGroup;
    survivor: Record<string, any>;
    loserPlans: Array<{
      loser: Record<string, any>;
      edge: DuplicatePair;
      updates: Record<string, any>;
      loserSnapshot: Record<string, any>;
    }>;
  }
  const plans: MarkPlan[] = [];

  for (const group of groups) {
    const members = group.ids.map((id) => byId.get(id)!).filter(Boolean);
    const decision = pickSurvivor(members);

    if (decision.hold) {
      holdEntries.push(
        `- **HOLD (survivor tie)** — ${decision.holdReason}\n` +
          members
            .map((m) => `  - \`${m.id}\` "${m.title}" (${m.source}, ${m.start_date?.slice(0, 10)}, ${m.venue_name})`)
            .join('\n')
      );
      continue;
    }

    // Sequential field merge: earlier losers' contributions become part of
    // the working winner row so later losers only fill still-empty fields.
    const workingWinner = { ...decision.survivor };
    const loserPlans: MarkPlan['loserPlans'] = [];
    for (const loser of decision.losers) {
      const merge = mergeEvents(workingWinner, loser);
      Object.assign(workingWinner, merge.updates);
      loserPlans.push({
        loser,
        edge: bestEdgeFor(group, loser.id),
        updates: merge.updates,
        loserSnapshot: merge.loserSnapshot,
      });
    }
    plans.push({ group, survivor: decision.survivor, loserPlans });
    planned += loserPlans.length;
  }

  // Report
  for (const plan of plans) {
    const s = plan.survivor;
    console.log(`SURVIVOR ${s.id} "${s.title}" (${s.source}, tier=${s.enrichment_tier}, score=${scoreRichness(s).total})`);
    for (const lp of plan.loserPlans) {
      console.log(
        `  ← loser ${lp.loser.id} "${lp.loser.title}" (${lp.loser.source}) ` +
          `[${lp.edge.layer} ${lp.edge.confidence.toFixed(2)}]`
      );
      const fields = Object.keys(lp.updates);
      if (fields.length > 0) console.log(`    fields merged into survivor: ${fields.join(', ')}`);
      if (verbose) console.log(`    reason: ${lp.edge.reason}`);
    }
    console.log('');
  }

  console.log('─'.repeat(60));
  console.log(`Groups to merge: ${plans.length}; losers to mark: ${planned}; HOLD: ${holdEntries.length}`);

  if (holdEntries.length > 0) {
    console.log('');
    console.log('HOLD groups (written to specs/dedup-hold.md on --execute):');
    for (const h of holdEntries) console.log(h);
  }

  if (!executeMode) {
    console.log('');
    console.log('DRY RUN — no changes made. Pass --execute to apply.');
    db.close();
    return;
  }

  // Execute — one transaction per group so a mid-run failure never leaves a
  // group half-marked.
  const insertAudit = db.prepare(`
    INSERT INTO dedup_merges (winner_id, loser_id, confidence, match_layer, match_reason, fields_merged, loser_snapshot)
    VALUES ($winnerId, $loserId, $confidence, $layer, $reason, $fields, $snapshot)
  `);
  const markLoser = db.prepare(
    `UPDATE events SET merged_into = $survivorId, merged_at = datetime('now'), updated_at = datetime('now') WHERE id = $id`
  );

  let marked = 0;
  let errors = 0;

  for (const plan of plans) {
    try {
      db.run('BEGIN TRANSACTION');

      // Apply accumulated survivor field updates
      const allUpdates: Record<string, any> = {};
      for (const lp of plan.loserPlans) Object.assign(allUpdates, lp.updates);
      if (Object.keys(allUpdates).length > 0) {
        const setClauses = Object.keys(allUpdates).map((f) => `${f} = $${f}`);
        setClauses.push("updated_at = datetime('now')");
        const params: Record<string, any> = { $id: plan.survivor.id };
        for (const [f, v] of Object.entries(allUpdates)) params[`$${f}`] = v;
        db.prepare(`UPDATE events SET ${setClauses.join(', ')} WHERE id = $id`).run(params);
      }

      for (const lp of plan.loserPlans) {
        insertAudit.run({
          $winnerId: plan.survivor.id,
          $loserId: lp.loser.id,
          $confidence: lp.edge.confidence,
          $layer: lp.edge.layer,
          $reason: lp.edge.reason,
          $fields: JSON.stringify(Object.keys(lp.updates)),
          $snapshot: JSON.stringify(lp.loserSnapshot),
        });
        markLoser.run({ $survivorId: plan.survivor.id, $id: lp.loser.id });
        marked++;
      }

      db.run('COMMIT');
    } catch (error) {
      db.run('ROLLBACK');
      console.error(`Error marking group (survivor ${plan.survivor.id}):`, error);
      errors++;
    }
  }

  if (holdEntries.length > 0) {
    appendFileSync(
      HOLD_PATH,
      `\n## Survivor-tie HOLDs — ${new Date().toISOString().slice(0, 10)}\n\n` +
        holdEntries.join('\n\n') +
        '\n'
    );
  }

  console.log('');
  console.log(`Done: ${marked} losers marked (0 deleted), ${errors} errors`);

  // Post-condition: row count must be unchanged (marking never deletes)
  const total = (db.prepare('SELECT COUNT(*) AS n FROM events').get() as { n: number }).n;
  console.log(`Row count after run: ${total}`);
  db.close();
}

main();
