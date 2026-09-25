/** Child process of queryUntrustedDb() (src/watchdog/untrusted-db.ts; security
 *  loop round 8). Never run by hand.
 *
 *  argv[2] is a request file in the parent's private temp dir. Opens the COPY
 *  of the database it names read-only, with trusted_schema=OFF (schema-defined
 *  code may call only innocuous functions) and query_only=ON, and refuses it
 *  unless:
 *    - it has no VIEW at all (a view named like a table turns a plain SELECT
 *      into arbitrary, possibly endless SQL);
 *    - every TRIGGER is one of the project's own, by name and SQL hash;
 *    - every required table, and every table a query reads that is present,
 *      is an ordinary table (not virtual).
 *  Then runs each query, keeps at most maxRows rows, and prints one JSON
 *  answer on stdout. The parent enforces the wall clock (it kills this
 *  process); nothing here needs to. */
import { Database } from 'bun:sqlite';
import { createHash } from 'crypto';
import { readFileSync } from 'fs';

type SqlValue = string | number | null;
interface Request {
  dbPath: string;
  requireTables: string[];
  queries: Record<string, { sql: string; params?: SqlValue[]; tables: string[] }>;
  maxRows: number;
  allowedTriggers: Record<string, string>;
}

function answer(obj: unknown): never {
  process.stdout.write(JSON.stringify(obj));
  process.exit(0);
}
const refuse = (detail: string): never => answer({ ok: false, kind: 'refused', detail });
const error = (detail: string): never => answer({ ok: false, kind: 'error', detail });
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 300);
/** Names from the untrusted schema, quoted and bounded for messages. */
const name = (s: unknown) => JSON.stringify(String(s).slice(0, 80));

let req: Request;
try {
  req = JSON.parse(readFileSync(process.argv[2] ?? '', 'utf8')) as Request;
} catch (e) {
  error(`unreadable request: ${msg(e)}`);
}

let db: Database;
try {
  db = new Database(req!.dbPath, { readonly: true, create: false });
} catch (e) {
  error(`could not open the database copy: ${msg(e)}`);
}

try {
  db!.exec('PRAGMA trusted_schema=OFF');
  db!.exec('PRAGMA query_only=ON');
  const ts = db!.query('PRAGMA trusted_schema').get() as { trusted_schema?: number } | null;
  const qo = db!.query('PRAGMA query_only').get() as { query_only?: number } | null;
  if (ts?.trusted_schema !== 0 || qo?.query_only !== 1) {
    refuse('this SQLite build did not accept trusted_schema=OFF and query_only=ON');
  }
} catch (e) {
  error(`could not set the read-only pragmas: ${msg(e)}`);
}

type MasterRow = { type: string; name: string; tbl_name: string; sql: string | null };
let master: MasterRow[];
try {
  master = db!.query('SELECT type, name, tbl_name, sql FROM sqlite_master').all() as MasterRow[];
} catch (e) {
  error(`could not read the schema: ${msg(e)}`);
}

for (const row of master!) {
  if (row.type === 'view') refuse(`the database has a view (${name(row.name)}); the project's schema has none`);
  if (row.type === 'trigger') {
    const norm = String(row.sql ?? '').replace(/\s+/g, ' ').trim();
    const hash = createHash('sha256').update(norm).digest('hex');
    if (req!.allowedTriggers[row.name] !== hash) {
      refuse(`the database has a trigger that is not one of the project's own (${name(row.name)} on ${name(row.tbl_name)})`);
    }
  }
}

const tables = new Map<string, MasterRow>();
for (const row of master!) if (row.type === 'table') tables.set(row.name, row);
/** 'ok' | 'absent'; refuses anything present that is not an ordinary table. */
function tableState(t: string): 'ok' | 'absent' {
  const other = master!.find((r) => r.name === t && r.type !== 'table');
  if (other) refuse(`${name(t)} is a ${other.type}, not a table`);
  const row = tables.get(t);
  if (!row) return 'absent';
  if (/^\s*CREATE\s+VIRTUAL\s+TABLE/i.test(String(row.sql ?? ''))) refuse(`${name(t)} is a virtual table, not an ordinary table`);
  return 'ok';
}
for (const t of req!.requireTables) {
  if (tableState(t) === 'absent') refuse(`the database has no table ${name(t)}`);
}

const rows: Record<string, unknown[] | null> = {};
const errors: Record<string, string> = {};
const truncated: string[] = [];
for (const [key, q] of Object.entries(req!.queries)) {
  if (q.tables.some((t) => tableState(t) === 'absent')) {
    rows[key] = null;
    continue;
  }
  try {
    const out: unknown[] = [];
    for (const r of db!.query(q.sql).iterate(...((q.params ?? []) as SqlValue[]))) {
      if (out.length >= req!.maxRows) {
        truncated.push(key);
        break;
      }
      const clean: Record<string, SqlValue> = {};
      for (const [k, v] of Object.entries(r as Record<string, unknown>)) {
        clean[k] = typeof v === 'string' || typeof v === 'number' || v === null ? v : typeof v === 'bigint' ? Number(v) : null;
      }
      out.push(clean);
    }
    rows[key] = out;
  } catch (e) {
    rows[key] = null;
    errors[key] = msg(e);
  }
}
answer({ ok: true, rows, errors, truncated });
