/**
 * The one way code writes events URL columns (url, ticket_url,
 * ticket_url_resolved, image_url, image_local).
 *
 * prepareUrlWrite(db, sql) prepares an INSERT or UPDATE and returns a
 * statement whose run() passes every value bound to a URL column through
 * safeHttpUrl (image_local: safeImageSrc) from src/utils/safe-url.ts. A value
 * that is not a safe URL is written as NULL. Values bound in a WHERE clause
 * are left as given, so lookups still match the stored text.
 *
 * prepareEventsWrite(db, sql) is for statements whose column list is built at
 * run time: it uses prepareUrlWrite when the built SQL binds a URL column and
 * db.prepare otherwise.
 *
 * Scripts import this from scripts/lib/url-columns.ts (a re-export).
 * tests/security/url-column-writes.test.ts fails on any SQL in scripts/ or
 * src/ that assigns a URL column from a bound value without going through
 * this helper, and on a run-time-built column list not passed to
 * prepareEventsWrite. Assigning NULL, or a column to itself, needs no helper.
 */
import type { Database, Statement } from 'bun:sqlite';
import { safeHttpUrl, safeImageSrc } from '../utils/safe-url';

export const URL_COLUMNS = ['url', 'ticket_url', 'ticket_url_resolved', 'image_url', 'image_local'] as const;
export type UrlColumn = (typeof URL_COLUMNS)[number];

const COLUMN_RE = URL_COLUMNS.join('|');

/** Canonical value for a URL column, or null. */
export function safeUrlColumnValue(column: UrlColumn, value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  return column === 'image_local' ? safeImageSrc(value) : safeHttpUrl(value);
}

type ParamRef = { kind: 'named'; name: string; column: UrlColumn } | { kind: 'positional'; index: number; column: UrlColumn };

/** The bound parameters that feed a URL column in an INSERT column list or a SET clause. */
export function urlColumnParams(sql: string): ParamRef[] {
  const refs: ParamRef[] = [];
  const text = sql.replace(/--[^\n]*/g, '');
  // Position of every parameter placeholder, for '?' numbering.
  const placeholders = [...text.matchAll(/\?|[$:@][A-Za-z_]\w*/g)].map(m => ({ at: m.index!, token: m[0] }));
  const positionalIndex = (at: number) => placeholders.filter(p => p.token === '?' && p.at < at).length;
  const refAt = (token: string, at: number, column: UrlColumn): ParamRef =>
    token === '?' ? { kind: 'positional', index: positionalIndex(at), column } : { kind: 'named', name: token, column };

  // An insert column list, e.g. (a, b, url, ...) VALUES (x, y, $url, ...)
  const insert = /INSERT\s+(?:OR\s+\w+\s+)?INTO\s+\w+\s*\(([^)]*)\)\s*VALUES\s*\(/i.exec(text);
  if (insert) {
    const columns = insert[1].split(',').map(c => c.trim().toLowerCase());
    let i = insert.index + insert[0].length;
    const values: { token: string; at: number }[] = [];
    let depth = 0;
    let start = i;
    for (; i < text.length; i++) {
      const ch = text[i];
      if (ch === '(') depth++;
      else if (ch === ')' && depth > 0) depth--;
      else if ((ch === ',' || ch === ')') && depth === 0) {
        const raw = text.slice(start, i);
        values.push({ token: raw.trim(), at: start + raw.indexOf(raw.trim()) });
        start = i + 1;
        if (ch === ')') break;
      }
    }
    columns.forEach((c, n) => {
      const v = values[n];
      if (!v || !(URL_COLUMNS as readonly string[]).includes(c)) return;
      if (/^(?:\?|[$:@][A-Za-z_]\w*)$/.test(v.token)) refs.push(refAt(v.token, v.at, c as UrlColumn));
    });
  }

  // ... SET col = ?, col = COALESCE($p, col) ... up to WHERE / RETURNING / end.
  for (const set of text.matchAll(/\bSET\b([\s\S]*?)(?=\bWHERE\b|\bRETURNING\b|$)/gi)) {
    const base = set.index! + set[0].indexOf(set[1]);
    const assign = new RegExp(`\\b(${COLUMN_RE})\\s*=\\s*(?:COALESCE\\s*\\(\\s*|NULLIF\\s*\\(\\s*)?(\\?|[$:@][A-Za-z_]\\w*)`, 'gi');
    for (const a of set[1].matchAll(assign)) {
      const at = base + a.index! + a[0].length - a[2].length;
      refs.push(refAt(a[2], at, a[1].toLowerCase() as UrlColumn));
    }
  }
  return refs;
}

export interface UrlWriteStatement {
  run(...args: unknown[]): ReturnType<Statement['run']>;
}

/** db.prepare(sql) whose run() sanitises every value bound to a URL column. */
export function prepareUrlWrite(db: Database, sql: string): UrlWriteStatement {
  const stmt = db.prepare(sql);
  const refs = urlColumnParams(sql);
  if (refs.length === 0) throw new Error(`prepareUrlWrite: no URL column is bound in this statement; use db.prepare directly:\n${sql.trim().slice(0, 200)}`);
  return {
    run(...args: unknown[]) {
      if (args.length === 1 && args[0] && typeof args[0] === 'object' && !Array.isArray(args[0])) {
        const params = { ...(args[0] as Record<string, unknown>) };
        for (const ref of refs) {
          if (ref.kind !== 'named') continue;
          // Bun binds "$url" from either the "$url" or (strict mode) the "url" key.
          for (const key of [ref.name, ref.name.slice(1)]) {
            if (key in params) params[key] = safeUrlColumnValue(ref.column, params[key]);
          }
        }
        return (stmt.run as (...a: unknown[]) => ReturnType<Statement['run']>)(params);
      }
      const values = args.length === 1 && Array.isArray(args[0]) ? [...args[0]] : [...args];
      for (const ref of refs) {
        if (ref.kind === 'positional' && ref.index < values.length) values[ref.index] = safeUrlColumnValue(ref.column, values[ref.index]);
      }
      return (stmt.run as (...a: unknown[]) => ReturnType<Statement['run']>)(...values);
    },
  };
}

/** For SQL whose SET/column list is built at run time: prepareUrlWrite when it binds a URL column, else db.prepare. */
export function prepareEventsWrite(db: Database, sql: string): UrlWriteStatement {
  if (urlColumnParams(sql).length > 0) return prepareUrlWrite(db, sql);
  const stmt = db.prepare(sql);
  return { run: (...args: unknown[]) => (stmt.run as (...a: unknown[]) => ReturnType<Statement['run']>)(...args) };
}
