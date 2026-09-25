#!/usr/bin/env bun
/**
 * untrusted-db-query.ts — the shell's way to read a container-written SQLite
 * file (security loop round 8). Host shell jobs (scripts/daily-enrichment-check.sh)
 * must not run `sqlite3` on data/events.db: a planted FIFO blocks it and a
 * planted VIEW can make a plain SELECT never finish. This CLI goes through
 * src/watchdog/untrusted-db.ts instead: private copy, schema check, queries in
 * a child killed at the wall clock.
 *
 * Usage:
 *   bun scripts/untrusted-db-query.ts --db <path> [--require-table <t>]...
 *       [--count <NAME> <tables> <sql>]... [--rows <tables> <sql>] [--timeout-ms <n>]
 *
 *   <tables>  comma-separated tables the query reads; if one is absent the
 *             query is skipped. Present ones must be ordinary tables.
 *   --count   prints NAME=<n>: the first column of the first row, which must
 *             be a non-negative integer (NAME= when the query was skipped).
 *   --rows    after the counts prints a line `--- rows` and then the rows as
 *             an aligned table with a header. Cells have control characters
 *             removed and are cut at 60 characters.
 *
 * Exit: 0 = answered; 1 = refused, timed out, missing or failed (stderr says
 * which and what to do); 2 = bad arguments.
 */
import { stripControl } from '../src/watchdog/signal-sources';
import { queryUntrustedDb, type UntrustedQuery } from '../src/watchdog/untrusted-db';

const NAME_RE = /^[A-Z][A-Z0-9_]{0,63}$/;

function usage(why: string): never {
  console.error(`untrusted-db-query: ${why}\nusage: bun scripts/untrusted-db-query.ts --db <path> [--require-table <t>]... [--count <NAME> <tables> <sql>]... [--rows <tables> <sql>] [--timeout-ms <n>]`);
  process.exit(2);
}

export function parseArgs(argv: string[]) {
  let db = '';
  let timeoutMs: number | undefined;
  const requireTables: string[] = [];
  const counts: Array<{ name: string; q: UntrustedQuery }> = [];
  let rows: UntrustedQuery | null = null;
  const tables = (s: string) => s.split(',').map((t) => t.trim()).filter(Boolean);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const need = (n: number) => {
      if (i + n >= argv.length) usage(`${a} needs ${n} value(s)`);
      const v = argv.slice(i + 1, i + 1 + n);
      i += n;
      return v;
    };
    if (a === '--db') [db] = need(1);
    else if (a === '--require-table') requireTables.push(need(1)[0]);
    else if (a === '--timeout-ms') {
      const [v] = need(1);
      if (!/^[1-9][0-9]{0,6}$/.test(v)) usage('--timeout-ms must be a positive integer (milliseconds)');
      timeoutMs = Number(v);
    } else if (a === '--count') {
      const [name, t, sql] = need(3);
      if (!NAME_RE.test(name)) usage(`--count name ${JSON.stringify(name)} must be UPPER_SNAKE_CASE`);
      counts.push({ name, q: { sql, tables: tables(t) } });
    } else if (a === '--rows') {
      if (rows) usage('--rows may be given once');
      const [t, sql] = need(2);
      rows = { sql, tables: tables(t) };
    } else usage(`unknown argument ${JSON.stringify(a)}`);
  }
  if (!db) usage('--db is required');
  if (counts.length === 0 && !rows) usage('nothing to query (give --count or --rows)');
  return { db, timeoutMs, requireTables, counts, rows };
}

function table(rs: Array<Record<string, unknown>>): string {
  if (rs.length === 0) return '';
  const cols = Object.keys(rs[0]);
  const cell = (v: unknown) => stripControl(v === null || v === undefined ? '' : String(v), 60);
  const cells = rs.map((r) => cols.map((c) => cell(r[c])));
  const width = cols.map((c, i) => Math.max(cell(c).length, ...cells.map((r) => r[i].length)));
  const line = (vals: string[]) => vals.map((v, i) => v.padEnd(width[i])).join('  ').trimEnd();
  return [line(cols.map(cell)), line(width.map((w) => '-'.repeat(w))), ...cells.map(line)].join('\n');
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const queries: Record<string, UntrustedQuery> = {};
  for (const c of args.counts) queries[`count:${c.name}`] = c.q;
  if (args.rows) queries.rows = args.rows;
  const r = await queryUntrustedDb({ dbPath: args.db, requireTables: args.requireTables, queries, timeoutMs: args.timeoutMs });
  if (!r.ok) {
    const next = r.kind === 'missing'
      ? 'check that the pipeline has produced data/events.db'
      : 'inspect the database by hand (sqlite3 -readonly) before trusting it; a container run may have planted it';
    console.error(`untrusted-db-query: ${r.kind === 'timeout' ? 'TIMED OUT' : 'REFUSED'} (${r.kind}) — ${r.detail}. Next: ${next}`);
    process.exit(1);
  }
  const lines: string[] = [];
  for (const c of args.counts) {
    const key = `count:${c.name}`;
    if (r.errors[key]) {
      console.error(`untrusted-db-query: REFUSED — query ${c.name} failed: ${stripControl(r.errors[key], 300)}`);
      process.exit(1);
    }
    const rs = r.rows[key];
    if (rs === null) {
      lines.push(`${c.name}=`);
      continue;
    }
    const v = rs.length ? Object.values(rs[0])[0] : null;
    if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0) {
      console.error(`untrusted-db-query: REFUSED — ${c.name} is not a non-negative integer`);
      process.exit(1);
    }
    lines.push(`${c.name}=${v}`);
  }
  if (args.rows) {
    if (r.errors.rows) {
      console.error(`untrusted-db-query: REFUSED — the --rows query failed: ${stripControl(r.errors.rows, 300)}`);
      process.exit(1);
    }
    lines.push('--- rows');
    const t = table(r.rows.rows ?? []);
    if (t) lines.push(t);
  }
  console.log(lines.join('\n'));
}

if (import.meta.main) {
  await main();
}
