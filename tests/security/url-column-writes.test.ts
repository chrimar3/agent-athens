/**
 * Scripts write the events URL columns (url, ticket_url, ticket_url_resolved,
 * image_url, image_local) only through prepareUrlWrite (scripts/lib/
 * url-columns.ts), which passes each bound value through safeHttpUrl /
 * safeImageSrc. A raw db.prepare / db.run / db.query of an INSERT or UPDATE
 * that binds a URL column fails here, with the file and line.
 *
 * Judges (round 2) found maintenance scripts storing scraped hrefs such as
 * "javascript:" in ticket_url, which the HTML gate caught but /api/*.json
 * shipped raw.
 */
import { describe, expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { readdirSync, readFileSync } from 'fs';
import { join, relative } from 'path';
import { prepareUrlWrite, urlColumnParams } from '../../scripts/lib/url-columns';

const REPO = join(import.meta.dir, '../..');
const SKIP_DIRS = new Set(['_archive', '__tests__', 'node_modules']);
const HELPER = 'scripts/lib/url-columns.ts';
const SQL_LITERAL = /`(?:[^`\\]|\\.)*`|'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"/g;
const THROUGH_HELPER = /prepareUrlWrite\(\s*[A-Za-z_$][\w$.]*\s*,\s*$/;

/** Raw URL-column writes in one source file: "file:line column". */
function rawUrlColumnWrites(file: string, src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(SQL_LITERAL)) {
    const sql = m[0].slice(1, -1);
    if (!/\b(?:UPDATE|INSERT)\b/i.test(sql)) continue;
    const refs = urlColumnParams(sql);
    if (refs.length === 0) continue;
    if (THROUGH_HELPER.test(src.slice(Math.max(0, m.index! - 80), m.index))) continue;
    const line = src.slice(0, m.index).split('\n').length;
    out.push(`${file}:${line} binds ${[...new Set(refs.map(r => r.column))].join(', ')} without prepareUrlWrite`);
  }
  return out;
}

function scriptFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) scriptFiles(full, out);
    else if (entry.name.endsWith('.ts')) out.push(full);
  }
  return out;
}

describe('URL-column writes in scripts go through prepareUrlWrite', () => {
  test('the scanner flags raw writes (positional, named, upsert, db.run) and ignores WHERE lookups and NULL', () => {
    const src = [
      "db.prepare(`UPDATE events SET ticket_url = ? WHERE id = ?`).run(u, id);",
      "db.run(`UPDATE events\n  SET image_url = $img WHERE id = $id`, { $img: x });",
      "db.query('UPDATE events SET url = COALESCE($url, url) WHERE id = $id');",
      "db.prepare(`INSERT INTO events (id, url) VALUES ($id, $url)`);",
      "db.prepare(`UPDATE events SET time_doors = $t WHERE url = $url`);",
      "db.prepare(\"UPDATE events SET image_local = NULL WHERE id = ?\");",
      "prepareUrlWrite(db, `UPDATE events SET ticket_url = ? WHERE id = ?`);",
    ].join('\n');
    expect(rawUrlColumnWrites('x.ts', src)).toEqual([
      'x.ts:1 binds ticket_url without prepareUrlWrite',
      'x.ts:2 binds image_url without prepareUrlWrite',
      'x.ts:4 binds url without prepareUrlWrite',
      'x.ts:5 binds url without prepareUrlWrite',
    ]);
  });

  test('no script outside the helper binds a URL column directly', () => {
    const violations = scriptFiles(join(REPO, 'scripts'))
      .map(f => relative(REPO, f))
      .filter(f => f !== HELPER)
      .flatMap(f => rawUrlColumnWrites(f, readFileSync(join(REPO, f), 'utf-8')));
    expect(violations).toEqual([]);
  });

  test('prepareUrlWrite stores unsafe values as NULL and canonical URLs as given', () => {
    const db = new Database(':memory:');
    db.run('CREATE TABLE events (id TEXT PRIMARY KEY, url TEXT, ticket_url TEXT, image_url TEXT, image_local TEXT, note TEXT)');
    db.run("INSERT INTO events (id, url) VALUES ('a', 'https://keep.example/')");
    prepareUrlWrite(db, 'UPDATE events SET ticket_url = ?, note = ? WHERE id = ?').run('javascript:alert(1)', 'javascript:ok-in-prose', 'a');
    prepareUrlWrite(db, 'UPDATE events SET image_url = $img, image_local = $loc WHERE id = $id').run({ $img: 'https://cdn.example/a.jpg', $loc: '//evil.example/x.webp', $id: 'a' });
    prepareUrlWrite(db, 'INSERT INTO events (id, url) VALUES ($id, $url) ON CONFLICT(id) DO UPDATE SET url = COALESCE($url, url)').run({ $id: 'b', $url: 'data:text/html,<script>x</script>' });
    prepareUrlWrite(db, 'UPDATE events SET url = ? WHERE id = ?').run(['https://www.viva.gr/tickets/x/?a=1&amp;b=2', 'a']);
    expect(db.query('SELECT id, url, ticket_url, image_url, image_local, note FROM events ORDER BY id').all()).toEqual([
      { id: 'a', url: 'https://www.viva.gr/tickets/x/?a=1&b=2', ticket_url: null, image_url: 'https://cdn.example/a.jpg', image_local: null, note: 'javascript:ok-in-prose' },
      { id: 'b', url: null, ticket_url: null, image_url: null, image_local: null, note: null },
    ]);
  });

  test('prepareUrlWrite refuses a statement that binds no URL column', () => {
    const db = new Database(':memory:');
    db.run('CREATE TABLE events (id TEXT, note TEXT)');
    expect(() => prepareUrlWrite(db, 'UPDATE events SET note = ? WHERE id = ?')).toThrow(/no URL column/);
  });
});
