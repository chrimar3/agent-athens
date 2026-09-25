/** Host reads of a container-written SQLite file (security loop round 8).
 *
 *  Host launchd jobs (the deadman, the weekly digest, the enrichment check,
 *  the search-visibility monitor) read data/events.db, which pipeline
 *  containers write. A compromised run can plant anything there: a symlink
 *  into $HOME, a FIFO that blocks the reader forever, or a database whose
 *  schema makes an innocent query never finish (a judge hung the deadman
 *  with a recursive VIEW named `events`). So a host job never opens that file
 *  itself. queryUntrustedDb():
 *
 *   1. copies the database (and its -wal / -shm, when present) into a private
 *      temp dir (mode 700): each source must be a regular file — lstat, then
 *      open with O_NOFOLLOW | O_NONBLOCK and fstat the SAME inode — so a
 *      symlink, FIFO, device or directory is refused and nothing blocks; the
 *      copy stops at maxBytes;
 *   2. runs a child process (untrusted-db-runner.ts) that opens the COPY
 *      read-only with PRAGMA trusted_schema=OFF and query_only=ON, refuses the
 *      database when its schema has any VIEW, any TRIGGER that is not one of
 *      the project's own (exact SQL hash, below), or when a table the caller
 *      needs is missing, virtual or not a table, and only then runs the
 *      caller's queries;
 *   3. kills that child (SIGKILL) at a wall-clock timeout (default 30 s), so a
 *      pathological database can never hang the host job.
 *
 *  The result is data, never trusted: callers still validate each value.
 *  Every refusal detail has control characters removed. */
import { closeSync, constants, fstatSync, lstatSync, mkdtempSync, openSync, readSync, rmSync, writeFileSync, writeSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { stripControl } from './signal-sources';

export type SqlValue = string | number | null;
export type UntrustedRows = Array<Record<string, SqlValue>>;

export interface UntrustedQuery {
  sql: string;
  params?: SqlValue[];
  /** Every table the query reads. Each one present must be an ordinary table
   *  (not a view, not virtual); when one is absent the query is skipped and
   *  its result is null. */
  tables: string[];
}

export interface UntrustedDbRequest {
  /** The container-writable database file, e.g. <repo>/data/events.db. */
  dbPath: string;
  /** Tables that must exist as ordinary tables; otherwise the DB is refused. */
  requireTables: string[];
  /** Named queries; the result carries the rows under the same names. */
  queries: Record<string, UntrustedQuery>;
  /** Wall-clock limit for the child (schema check + all queries). Default 30 s. */
  timeoutMs?: number;
  /** Largest file copied (each of db, -wal, -shm). Default 2 GiB. */
  maxBytes?: number;
  /** Rows kept per query (the rest are dropped and the name is listed in `truncated`). Default 10 000. */
  maxRows?: number;
}

export type UntrustedDbResult =
  | {
      ok: true;
      /** null = skipped (a table it reads is absent) or failed (see errors). */
      rows: Record<string, UntrustedRows | null>;
      /** Per-query SQLite errors, by query name. */
      errors: Record<string, string>;
      truncated: string[];
    }
  | {
      ok: false;
      /** missing: no database file. refused: not a regular file, too big, or
       *  a schema it will not query. timeout: the child hit the wall clock.
       *  error: the copy or SQLite failed (a copy torn by a concurrent writer
       *  looks like this too; callers may retry). */
      kind: 'missing' | 'refused' | 'timeout' | 'error';
      detail: string;
    };

export const UNTRUSTED_DB_DEFAULT_TIMEOUT_MS = 30_000;
export const UNTRUSTED_DB_DEFAULT_MAX_BYTES = 2 * 1024 * 1024 * 1024;
export const UNTRUSTED_DB_DEFAULT_MAX_ROWS = 10_000;
/** Cap on what the child may print (its JSON answer). */
const MAX_OUTPUT_BYTES = 64 * 1024 * 1024;
const TABLE_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;

/** The only triggers a real events.db has: sha256 of each trigger's SQL as
 *  sqlite_master stores it, with whitespace runs collapsed to one space. They
 *  come from src/db/schema.sql (the FTS sync triggers) and migration 002
 *  (enrichment_queue.updated_at); tests/security/untrusted-db.test.ts rebuilds
 *  them from those files and fails when this list drifts. A trigger never
 *  fires on a query_only connection; the list keeps the schema check exact. */
export const ALLOWED_TRIGGER_SQL_SHA256: Readonly<Record<string, string>> = {
  events_ai: 'b52304f360ff09832850f992dda56fba3d76c03403618d4d07a5fb5da85f6a74',
  events_au: '2a4d1f284abd89d78e1782b3fecb11807c51b61b5c261c976225b4fb7fe0a57b',
  events_ad: '0eb05e4e6e47fb10e81838dfb24941de5113e9c40315f6fae0fa32b1abab093c',
  trg_enrichment_queue_updated: 'a8b466a6ec687df4cf552dac5a56317af8c5283ab7947a303fa3ed3931ea5a20',
};

/** Reader processes still running. A host job that exits early (the
 *  deadman's wall clock) must not leave one burning CPU: they are killed on
 *  exit, or by killUntrustedDbReaders(). */
const activeReaders = new Set<{ kill: (signal?: number | NodeJS.Signals) => void }>();
export function killUntrustedDbReaders(): void {
  for (const p of activeReaders) {
    try { p.kill('SIGKILL'); } catch { /* already gone */ }
  }
  activeReaders.clear();
}
process.on('exit', killUntrustedDbReaders);

class CopyRefused extends Error {
  constructor(readonly kind: 'missing' | 'refused' | 'error', message: string) {
    super(message);
  }
}

/** Copy `src` to `dest` (created 600, never through a symlink). `optional`:
 *  a missing source is not an error. Returns whether a file was copied. */
function copyRegularFile(src: string, dest: string, maxBytes: number, optional: boolean): boolean {
  let st;
  try {
    st = lstatSync(src);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
      if (optional) return false;
      throw new CopyRefused('missing', `${src} does not exist`);
    }
    throw new CopyRefused('error', `${src} could not be inspected: ${(e as Error).message}`);
  }
  if (st.isSymbolicLink()) throw new CopyRefused('refused', `${src} is a symlink (something planted it: inspect it and delete it)`);
  if (!st.isFile()) throw new CopyRefused('refused', `${src} is not a regular file (a FIFO, device or directory)`);
  if (st.size > maxBytes) throw new CopyRefused('refused', `${src} is ${st.size} bytes, over the ${maxBytes}-byte limit`);

  let fd: number;
  try {
    fd = openSync(src, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === 'ELOOP') throw new CopyRefused('refused', `${src} became a symlink while it was opened`);
    if (code === 'ENOENT' && optional) return false;
    throw new CopyRefused(code === 'ENOENT' ? 'missing' : 'error', `${src} could not be opened: ${(e as Error).message}`);
  }
  let out: number | null = null;
  try {
    const fst = fstatSync(fd);
    if (!fst.isFile() || fst.ino !== st.ino || fst.dev !== st.dev) {
      throw new CopyRefused('refused', `${src} was replaced between the check and the open`);
    }
    out = openSync(dest, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    const buf = Buffer.alloc(1024 * 1024);
    let total = 0;
    for (;;) {
      const n = readSync(fd, buf, 0, buf.length, null);
      if (n <= 0) break;
      total += n;
      if (total > maxBytes) throw new CopyRefused('refused', `${src} grew past the ${maxBytes}-byte limit while it was copied`);
      let written = 0;
      while (written < n) written += writeSync(out, buf, written, n - written);
    }
    return true;
  } catch (e) {
    if (e instanceof CopyRefused) throw e;
    throw new CopyRefused('error', `${src} could not be copied: ${(e as Error).message}`);
  } finally {
    closeSync(fd);
    if (out !== null) closeSync(out);
  }
}

/** Read a stream to a string, killing `onOverflow` past `cap` bytes. */
async function readCapped(stream: ReadableStream<Uint8Array>, cap: number, onOverflow: () => void): Promise<{ text: string; overflow: boolean }> {
  const chunks: Uint8Array[] = [];
  let size = 0;
  let overflow = false;
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (overflow) continue;
    size += value.byteLength;
    if (size > cap) {
      overflow = true;
      onOverflow();
      continue;
    }
    chunks.push(value);
  }
  return { text: Buffer.concat(chunks).toString('utf8'), overflow };
}

function fail(kind: 'missing' | 'refused' | 'timeout' | 'error', detail: string): UntrustedDbResult {
  return { ok: false, kind, detail: stripControl(detail, 600) };
}

/** Read a container-written SQLite file without letting it reach the host
 *  process: copy, check the schema in a child, run the queries there, kill
 *  the child at the timeout. Never throws. */
export async function queryUntrustedDb(req: UntrustedDbRequest): Promise<UntrustedDbResult> {
  const timeoutMs = req.timeoutMs ?? UNTRUSTED_DB_DEFAULT_TIMEOUT_MS;
  const maxBytes = req.maxBytes ?? UNTRUSTED_DB_DEFAULT_MAX_BYTES;
  const maxRows = req.maxRows ?? UNTRUSTED_DB_DEFAULT_MAX_ROWS;
  for (const t of [...req.requireTables, ...Object.values(req.queries).flatMap((q) => q.tables)]) {
    if (!TABLE_NAME_RE.test(t)) return fail('error', `table name ${JSON.stringify(t)} is not a plain identifier`);
  }

  let dir: string;
  try {
    dir = mkdtempSync(join(tmpdir(), 'aa-untrusted-db-'));
  } catch (e) {
    return fail('error', `could not create a private temp dir: ${(e as Error).message}`);
  }
  try {
    const copy = join(dir, 'db.sqlite');
    try {
      copyRegularFile(req.dbPath, copy, maxBytes, false);
      for (const suffix of ['-wal', '-shm']) copyRegularFile(req.dbPath + suffix, copy + suffix, maxBytes, true);
    } catch (e) {
      if (e instanceof CopyRefused) return fail(e.kind, e.message);
      return fail('error', String(e));
    }

    const requestPath = join(dir, 'request.json');
    writeFileSync(requestPath, JSON.stringify({
      dbPath: copy,
      requireTables: req.requireTables,
      queries: req.queries,
      maxRows,
      allowedTriggers: ALLOWED_TRIGGER_SQL_SHA256,
    }), { mode: 0o600 });

    let proc;
    try {
      proc = Bun.spawn([process.execPath, join(import.meta.dir, 'untrusted-db-runner.ts'), requestPath], {
        cwd: dir,
        stdin: 'ignore',
        stdout: 'pipe',
        stderr: 'pipe',
        env: { PATH: process.env.PATH ?? '/usr/bin:/bin', TMPDIR: dir },
      });
    } catch (e) {
      return fail('error', `could not start the reader process: ${(e as Error).message}`);
    }
    activeReaders.add(proc);
    let timedOut = false;
    const kill = () => { try { proc.kill('SIGKILL'); } catch { /* already gone */ } };
    const timer = setTimeout(() => { timedOut = true; kill(); }, timeoutMs);
    const [out, err] = await Promise.all([
      readCapped(proc.stdout as ReadableStream<Uint8Array>, MAX_OUTPUT_BYTES, kill),
      readCapped(proc.stderr as ReadableStream<Uint8Array>, 64 * 1024, () => {}),
      proc.exited,
    ]).finally(() => {
      clearTimeout(timer);
      activeReaders.delete(proc);
    });

    if (timedOut) {
      return fail('timeout', `reading ${req.dbPath} did not finish within ${timeoutMs / 1000}s and was stopped — its schema or data make queries run away (a container run may have planted it)`);
    }
    if (out.overflow) return fail('refused', `the reader's answer for ${req.dbPath} exceeded ${MAX_OUTPUT_BYTES} bytes`);
    let parsed: unknown;
    try {
      parsed = JSON.parse(out.text);
    } catch {
      const first = err.text.split('\n').find((l) => l.trim()) ?? `exit ${proc.exitCode}`;
      return fail('error', `the reader process for ${req.dbPath} failed: ${first}`);
    }
    const p = parsed as { ok?: unknown; kind?: unknown; detail?: unknown; rows?: unknown; errors?: unknown; truncated?: unknown };
    if (p.ok === true && p.rows && typeof p.rows === 'object' && p.errors && typeof p.errors === 'object' && Array.isArray(p.truncated)) {
      return { ok: true, rows: p.rows as Record<string, UntrustedRows | null>, errors: p.errors as Record<string, string>, truncated: p.truncated as string[] };
    }
    if (p.ok === false && (p.kind === 'refused' || p.kind === 'error') && typeof p.detail === 'string') {
      return fail(p.kind, p.detail);
    }
    return fail('error', `the reader process for ${req.dbPath} returned an unexpected answer`);
  } finally {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* temp dir cleanup is best effort */ }
  }
}
