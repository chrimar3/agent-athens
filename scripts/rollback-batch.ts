#!/usr/bin/env bun
/**
 * Rollback Batch — Enrichment v4
 *
 * Restores events to their previous descriptions using enrichment_log records.
 * Can rollback a single event or an entire batch.
 *
 * Usage:
 *   bun run scripts/rollback-batch.ts --event-id=<id>
 *   bun run scripts/rollback-batch.ts --batch=<number> --session=<name>
 *   bun run scripts/rollback-batch.ts --batch=3 --session=feb-2026 [--dry-run]
 */

import Database from 'bun:sqlite';

const DB_PATH = 'data/events.db';

interface RollbackTarget {
  eventId: string;
  descriptionBefore: string | null;
  descriptionAfter: string;
  batchNumber: number | null;
  sessionId: string | null;
  logId: number;
}

function parseArgs(): { eventId: string | null; batch: number | null; session: string | null; dryRun: boolean } {
  const args = process.argv.slice(2);
  const get = (key: string): string | undefined => {
    const arg = args.find(a => a.startsWith(`--${key}=`));
    return arg?.split('=')[1];
  };

  return {
    eventId: get('event-id') || null,
    batch: get('batch') ? parseInt(get('batch')!, 10) : null,
    session: get('session') || null,
    dryRun: args.includes('--dry-run'),
  };
}

function main(): void {
  const { eventId, batch, session, dryRun } = parseArgs();

  if (!eventId && batch === null) {
    console.error('Usage:');
    console.error('  bun run scripts/rollback-batch.ts --event-id=<id>');
    console.error('  bun run scripts/rollback-batch.ts --batch=<number> --session=<name>');
    console.error('');
    console.error('Options:');
    console.error('  --dry-run    Show what would be rolled back without making changes');
    process.exit(1);
  }

  console.log(`\n=== Rollback ${dryRun ? '(DRY RUN)' : ''} ===\n`);

  const db = new Database(DB_PATH);
  db.run('PRAGMA journal_mode = WAL;');
  db.run('PRAGMA foreign_keys = ON;');

  try {
    let targets: RollbackTarget[];

    if (eventId) {
      // Single event rollback — find most recent enrichment_log entry
      targets = findTargetsByEventId(db, eventId);
    } else {
      // Batch rollback
      targets = findTargetsByBatch(db, batch!, session);
    }

    if (targets.length === 0) {
      console.log('No rollback targets found.');
      if (eventId) {
        console.log(`  No enrichment_log entry for event ${eventId}`);
      } else {
        console.log(`  No entries for batch=${batch}${session ? ` session=${session}` : ''}`);
      }
      db.close();
      process.exit(0);
    }

    console.log(`Found ${targets.length} event(s) to rollback:\n`);

    let rolled = 0;
    for (const target of targets) {
      const shortId = target.eventId.substring(0, 12);
      const beforePreview = target.descriptionBefore
        ? target.descriptionBefore.substring(0, 60) + '...'
        : '(NULL — first enrichment)';

      console.log(`  ${shortId}...`);
      console.log(`    Before: ${beforePreview}`);
      console.log(`    After:  ${target.descriptionAfter.substring(0, 60)}...`);

      if (!dryRun) {
        // Restore description_before to events.full_description
        const result = db.prepare(`
          UPDATE events SET
            full_description = ?,
            needs_enrichment = CASE WHEN ? IS NULL THEN 1 ELSE 0 END,
            updated_at = datetime('now')
          WHERE id = ?
        `).run(target.descriptionBefore, target.descriptionBefore, target.eventId);

        if (result.changes > 0) {
          rolled++;
          console.log(`    -> Rolled back`);
        } else {
          console.log(`    -> Event not found in DB`);
        }
      } else {
        rolled++;
        console.log(`    -> Would rollback`);
      }
    }

    console.log(`\n=== ${rolled}/${targets.length} event(s) ${dryRun ? 'would be' : ''} rolled back ===\n`);
  } finally {
    db.close();
  }
}

function findTargetsByEventId(db: Database, eventId: string): RollbackTarget[] {
  // Get most recent enrichment_log entry for this event
  const row = db.prepare(`
    SELECT id, event_id, description_before, description_after, batch_number, session_id
    FROM enrichment_log
    WHERE event_id = ? AND description_after IS NOT NULL
    ORDER BY id DESC
    LIMIT 1
  `).get(eventId) as any;

  if (!row) return [];

  return [{
    eventId: row.event_id,
    descriptionBefore: row.description_before,
    descriptionAfter: row.description_after,
    batchNumber: row.batch_number,
    sessionId: row.session_id,
    logId: row.id,
  }];
}

function findTargetsByBatch(db: Database, batch: number, session: string | null): RollbackTarget[] {
  let query = `
    SELECT id, event_id, description_before, description_after, batch_number, session_id
    FROM enrichment_log
    WHERE batch_number = ? AND description_after IS NOT NULL
  `;
  const params: any[] = [batch];

  if (session) {
    query += ' AND session_id = ?';
    params.push(session);
  }

  query += ' ORDER BY id ASC';

  const rows = db.prepare(query).all(...params) as any[];

  return rows.map(row => ({
    eventId: row.event_id,
    descriptionBefore: row.description_before,
    descriptionAfter: row.description_after,
    batchNumber: row.batch_number,
    sessionId: row.session_id,
    logId: row.id,
  }));
}

main();
