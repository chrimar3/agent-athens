#!/usr/bin/env bun
/**
 * Backfill Ticket URLs — runs the tiered resolver cascade over the
 * 885 + 10,648 + 947 candidate events and persists results to DB.
 *
 * Usage:
 *   bun run scripts/backfill-ticket-urls.ts --dry-run --limit=10 --verbose
 *   bun run scripts/backfill-ticket-urls.ts --event-id=c3c95858f608dc92 --verbose
 *   bun run scripts/backfill-ticket-urls.ts --only-status=generated,null
 *   bun run scripts/backfill-ticket-urls.ts --limit=50 --concurrency=3
 *   bun run scripts/backfill-ticket-urls.ts                  # full run
 *
 * Idempotent: events with ticket_url_status IN ('direct','venue_registry','ai_discovered')
 * and ticket_url_resolved_at within 30 days are skipped unless --force is set.
 *
 * Logs one JSONL line per event to data/backfill-ticket-urls.log.jsonl.
 */
import { Database } from 'bun:sqlite';
import { appendFileSync } from 'fs';
import { join } from 'path';
import {
  resolveTicketUrl,
  type ResolverEvent,
  type ResolvedTicket,
} from '../src/ticketing/resolver';

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

interface Cli {
  dryRun: boolean;
  limit: number | null;
  eventId: string | null;
  onlyStatus: Set<string> | null;
  skipTier: Set<number>;
  concurrency: number;
  force: boolean;
  verbose: boolean;
}

function parseCli(): Cli {
  const args = process.argv.slice(2);
  const get = (name: string): string | null => {
    const m = args.find((a) => a.startsWith(`--${name}=`));
    return m ? m.slice(name.length + 3) : null;
  };
  const has = (name: string) => args.includes(`--${name}`);
  return {
    dryRun: has('dry-run'),
    limit: get('limit') ? parseInt(get('limit')!, 10) : null,
    eventId: get('event-id'),
    onlyStatus: get('only-status')
      ? new Set(get('only-status')!.split(',').map((s) => s.trim()))
      : null,
    skipTier: new Set(
      (get('skip-tier') ?? '')
        .split(',')
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => !isNaN(n))
    ),
    concurrency: parseInt(get('concurrency') ?? '3', 10),
    force: has('force'),
    verbose: has('verbose'),
  };
}

// ---------------------------------------------------------------------------
// Query planning
// ---------------------------------------------------------------------------

const FRESH_DAYS = 30;
const LOG_PATH = join(import.meta.dir, '..', 'data', 'backfill-ticket-urls.log.jsonl');

function buildQuery(cli: Cli): { sql: string; params: unknown[] } {
  if (cli.eventId) {
    return {
      sql: `SELECT id, title, venue_name, start_date, end_date, type, source, url,
                   ticket_url, ticket_url_status, price_type
            FROM events
            WHERE id = ?`,
      params: [cli.eventId],
    };
  }

  const conditions: string[] = [
    `price_type IN ('with-ticket','tba')`,
    `location_status IN ('verified_athens','pass_through')`,
    // Exhibition-aware future filter (CLAUDE.md Tier 1 rule). Mirrors
    // resolver's isPastEvent helper: exhibitions use end_date, others use start_date.
    `COALESCE(CASE WHEN type='exhibition' THEN end_date ELSE NULL END, start_date) >= date('now')`,
  ];

  if (cli.onlyStatus) {
    const placeholders = [...cli.onlyStatus].map(() => '?').join(',');
    conditions.push(`(ticket_url_status IN (${placeholders}) OR ticket_url IS NULL)`);
  } else if (!cli.force) {
    conditions.push(`(
      ticket_url IS NULL
      OR ticket_url_status IS NULL
      OR ticket_url_status IN ('generated','unverified','expired','')
      OR ticket_url_resolved_at IS NULL
      OR julianday('now') - julianday(ticket_url_resolved_at) > ${FRESH_DAYS}
    )`);
  }

  const sql = `
    SELECT id, title, venue_name, start_date, end_date, type, source, url,
           ticket_url, ticket_url_status, price_type
    FROM events
    WHERE ${conditions.join(' AND ')}
    ORDER BY start_date ASC
    ${cli.limit ? `LIMIT ${cli.limit}` : ''}
  `;

  const params: unknown[] = cli.onlyStatus ? [...cli.onlyStatus] : [];
  return { sql, params };
}

// ---------------------------------------------------------------------------
// Per-event work
// ---------------------------------------------------------------------------

type Outcome = {
  eventId: string;
  title: string;
  venue: string | null;
  before: { url: string | null; status: string | null };
  after: ResolvedTicket;
  error?: string;
};

async function processEvent(
  event: ResolverEvent,
  db: Database,
  cli: Cli,
  crossrefEvents: ReadonlyArray<{ title: string; venue: string; url: string }>
): Promise<Outcome> {
  const before = { url: event.ticket_url, status: event.ticket_url_status };
  try {
    const resolved = await resolveTicketUrl(event, {
      db,
      skipNetwork: cli.skipTier.has(2),
      crossrefEvents,
    });
    if (cli.skipTier.has(resolved.tier)) {
      return {
        eventId: event.id,
        title: event.title,
        venue: event.venue_name,
        before,
        after: { url: null, status: 'unresolved', confidence: 0, tier: 0, source: 'skipped' },
      };
    }
    if (!cli.dryRun && resolved.url && resolved.status !== 'unresolved') {
      db.prepare(`
        UPDATE events SET
          ticket_url = ?,
          ticket_url_status = ?,
          ticket_url_source = ?,
          ticket_url_resolved_at = datetime('now')
        WHERE id = ?
      `).run(resolved.url, resolved.status, resolved.source, event.id);
    }
    return {
      eventId: event.id,
      title: event.title,
      venue: event.venue_name,
      before,
      after: resolved,
    };
  } catch (err) {
    return {
      eventId: event.id,
      title: event.title,
      venue: event.venue_name,
      before,
      after: { url: null, status: 'unresolved', confidence: 0, tier: 0, source: 'error' },
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ---------------------------------------------------------------------------
// Concurrency helper (bounded parallel)
// ---------------------------------------------------------------------------

async function runBounded<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]);
      // 300ms stagger as specified in the plan — keeps HEAD traffic polite.
      await new Promise((r) => setTimeout(r, 300));
    }
  });
  await Promise.all(workers);
  return results;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const cli = parseCli();
  const dbPath = join(import.meta.dir, '..', 'data', 'events.db');
  const db = new Database(dbPath);

  const { sql, params } = buildQuery(cli);
  const rows = db.prepare(sql).all(...(params as any[])) as ResolverEvent[];

  // D4: pre-load Tier 3b crossref candidates once. Future events from
  // residentadvisor / more.com / ticketservices with allowlisted ticket URLs.
  // Resolver does in-memory Jaccard matching against this set per event.
  const { isTicketDomain } = await import('../src/ticketing/validator');
  const crossrefRows = db
    .prepare(
      `SELECT title, venue_name, ticket_url
       FROM events
       WHERE source IN ('residentadvisor', 'more.com', 'ticketservices')
         AND start_date >= date('now')
         AND ticket_url IS NOT NULL AND ticket_url != ''`
    )
    .all() as Array<{ title: string; venue_name: string | null; ticket_url: string }>;
  const crossrefEvents = crossrefRows
    .filter((r) => r.venue_name && isTicketDomain(r.ticket_url))
    .map((r) => ({ title: r.title, venue: r.venue_name!, url: r.ticket_url }));

  console.log(
    `Backfill: ${rows.length} event(s), concurrency=${cli.concurrency}, ` +
      `dryRun=${cli.dryRun}, crossref=${crossrefEvents.length}` +
      `${cli.eventId ? `, eventId=${cli.eventId}` : ''}`
  );

  const outcomes = await runBounded(rows, cli.concurrency, (ev) =>
    processEvent(ev, db, cli, crossrefEvents)
  );

  const byStatus = new Map<string, number>();
  for (const o of outcomes) {
    byStatus.set(o.after.status, (byStatus.get(o.after.status) ?? 0) + 1);
    if (cli.verbose || cli.eventId || outcomes.length <= 20) {
      const arrow = o.error ? `X ${o.error}` : `-> tier=${o.after.tier} conf=${o.after.confidence} ${o.after.status}`;
      console.log(`  ${o.eventId.slice(0, 8)} "${o.title.slice(0, 40)}" @ ${o.venue ?? '?'}  ${arrow}`);
      if (o.after.url) console.log(`     ${o.after.url}`);
      if (o.after.source) console.log(`     src: ${o.after.source}`);
    }
  }

  try {
    const logLines = outcomes
      .map((o) =>
        JSON.stringify({
          ts: new Date().toISOString(),
          eventId: o.eventId,
          title: o.title,
          venue: o.venue,
          before: o.before,
          after: {
            url: o.after.url,
            status: o.after.status,
            tier: o.after.tier,
            confidence: o.after.confidence,
            source: o.after.source,
          },
          error: o.error ?? null,
        })
      )
      .join('\n') + '\n';
    appendFileSync(LOG_PATH, logLines);
  } catch (err) {
    console.log(`  !  log append failed: ${err instanceof Error ? err.message : err}`);
  }

  console.log('\n--- Summary ---');
  for (const [status, n] of [...byStatus.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${status.padEnd(18)} ${n}`);
  }
  db.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
