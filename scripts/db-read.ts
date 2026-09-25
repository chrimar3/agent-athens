#!/usr/bin/env bun
/**
 * db-read — the enrichment session's only way to query the database.
 *
 * Usage:  bun run scripts/db-read.ts "SELECT id, title FROM events WHERE … LIMIT 20"
 * Output: one JSON object on stdout: { columns, rows, row_count, truncated }.
 * Exit:   0 ok · 1 query failed (bad SQL, database missing) · 2 refused / usage.
 *
 * Why it exists (security loop round 1): the headless enrichment session used
 * to hold Bash(sqlite3 -readonly *). The sqlite3 shell's built-in file
 * functions (writefile, readfile, edit) and its abbreviated dot-commands are
 * not restrained by -readonly, so that grant was an arbitrary file write and
 * command execution for any prompt injection in scraped text. This script
 * exposes exactly one read-only statement, nothing else:
 *   - the database path is fixed (data/events.db); there is no flag to change it
 *   - one statement, starting with SELECT or WITH; write/DDL/PRAGMA/ATTACH/
 *     VACUUM keywords and file/extension functions are refused before the
 *     database is opened (checked on the SQL with literals and comments removed)
 *   - the connection is opened read-only with query_only on, as a second layer
 *     (bun:sqlite will run VACUUM INTO from a read-only handle, so the lexical
 *     check is the one that stops file writes)
 *   - rows, cell sizes and total output are capped
 */
import { Database } from 'bun:sqlite';
import { resolve } from 'path';

const DB_PATH = resolve(import.meta.dir, '..', 'data', 'events.db');
export const DEFAULT_MAX_ROWS = 100;
export const MAX_ROWS_CEILING = 200;
export const MAX_OUTPUT_BYTES = 64 * 1024;
const MAX_CELL_CHARS = 8000;

const FORBIDDEN_KEYWORDS = [
  'insert', 'update', 'delete', 'upsert', 'drop', 'create', 'alter', 'attach', 'detach',
  'pragma', 'vacuum', 'reindex', 'analyze', 'begin', 'commit', 'rollback', 'savepoint', 'release',
];
const FORBIDDEN_FUNCTIONS = ['load_extension', 'writefile', 'readfile', 'edit', 'fts3_tokenizer', 'fsdir', 'zipfile'];

/**
 * The SQL with string literals, quoted identifiers and comments replaced, so
 * keyword checks cannot be fooled by (or trip over) text inside quotes.
 * Returns null when a literal or comment is unterminated.
 */
function skeleton(sql: string): string | null {
  let out = '';
  let i = 0;
  while (i < sql.length) {
    const c = sql[i];
    const next = sql[i + 1];
    if (c === '-' && next === '-') {
      const nl = sql.indexOf('\n', i);
      i = nl === -1 ? sql.length : nl;
      out += ' ';
      continue;
    }
    if (c === '/' && next === '*') {
      const end = sql.indexOf('*/', i + 2);
      if (end === -1) return null;
      i = end + 2;
      out += ' ';
      continue;
    }
    if (c === "'" || c === '"' || c === '`' || c === '[') {
      const close = c === '[' ? ']' : c;
      let j = i + 1;
      for (;;) {
        if (j >= sql.length) return null;
        if (sql[j] === close) {
          if (close !== ']' && sql[j + 1] === close) { j += 2; continue; } // doubled quote escape
          break;
        }
        j++;
      }
      out += c === "'" ? " 'lit' " : ' ident ';
      i = j + 1;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/** Null when `sql` is a single read-only statement; otherwise the reason it is refused. */
export function validateReadOnlySql(sql: string): string | null {
  const sk = skeleton(sql);
  if (sk === null) return 'unterminated string, identifier or comment';
  const body = sk.trim().replace(/;\s*$/, '').trim();
  if (body === '') return 'empty statement';
  if (body.includes(';')) return 'only one statement is allowed';
  const first = /^[A-Za-z]+/.exec(body)?.[0]?.toLowerCase();
  if (first !== 'select' && first !== 'with') return 'only SELECT or WITH … SELECT statements are allowed';
  for (const kw of FORBIDDEN_KEYWORDS) {
    if (new RegExp(`\\b${kw}\\b`, 'i').test(body)) return `the keyword ${kw.toUpperCase()} is not allowed in a read`;
  }
  for (const fn of FORBIDDEN_FUNCTIONS) {
    if (new RegExp(`\\b${fn}\\s*\\(`, 'i').test(body)) return `the function ${fn}() is not allowed`;
  }
  return null;
}

export interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  row_count: number;
  truncated: boolean;
}

function jsonCell(v: unknown): unknown {
  if (typeof v === 'bigint') return v.toString();
  if (v instanceof Uint8Array) return `<blob ${v.byteLength} bytes>`;
  if (typeof v === 'string' && v.length > MAX_CELL_CHARS) return `${v.slice(0, MAX_CELL_CHARS)}…[truncated ${v.length - MAX_CELL_CHARS} chars]`;
  return v;
}

/** Validate, then run one read-only statement against `dbPath`. Throws on refusal or SQL error. */
export function runReadOnlyQuery(dbPath: string, sql: string, opts: { maxRows?: number } = {}): QueryResult {
  const why = validateReadOnlySql(sql);
  if (why) throw new Error(`refused: ${why}`);
  const maxRows = Math.max(1, Math.min(opts.maxRows ?? DEFAULT_MAX_ROWS, MAX_ROWS_CEILING));

  const db = new Database(dbPath, { readonly: true });
  try {
    db.run('PRAGMA busy_timeout = 5000');
    db.run('PRAGMA query_only = ON');
    const stmt = db.prepare(sql);
    const columns = stmt.columnNames;
    const rows: Record<string, unknown>[] = [];
    let bytes = 2;
    let truncated = false;
    for (const raw of stmt.iterate() as IterableIterator<Record<string, unknown>>) {
      if (rows.length >= maxRows) { truncated = true; break; }
      const row: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(raw)) row[k] = jsonCell(v);
      const size = JSON.stringify(row).length + 1;
      if (bytes + size > MAX_OUTPUT_BYTES) { truncated = true; break; }
      bytes += size;
      rows.push(row);
    }
    stmt.finalize();
    return { columns, rows, row_count: rows.length, truncated };
  } finally {
    db.close();
  }
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  if (args.length !== 1 || args[0].startsWith('--')) {
    console.error('db-read: usage: bun run scripts/db-read.ts "SELECT … FROM events WHERE … LIMIT 20" (exactly one quoted SQL statement, no flags)');
    process.exit(2);
  }
  const sql = args[0];
  const why = validateReadOnlySql(sql);
  if (why) {
    console.error(`db-read: refused — ${why}. This command runs a single read-only SELECT (or WITH … SELECT) against data/events.db; rewrite the query as one SELECT.`);
    process.exit(2);
  }
  try {
    console.log(JSON.stringify(runReadOnlyQuery(DB_PATH, sql)));
  } catch (e) {
    console.error(`db-read: query failed — ${(e as Error).message}. Check table/column names (SELECT name, sql FROM sqlite_master) and that data/events.db exists.`);
    process.exit(1);
  }
}
