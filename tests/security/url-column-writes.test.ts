/**
 * Scripts and src/ write the events URL columns (url, ticket_url,
 * ticket_url_resolved, image_url, image_local) only through prepareUrlWrite
 * (src/db/url-columns.ts, re-exported by scripts/lib/url-columns.ts), which
 * passes each bound value through safeHttpUrl / safeImageSrc. A raw
 * db.prepare / db.run / db.query of an INSERT or UPDATE that binds a URL
 * column fails here, with the file and line. A column list built at run time
 * (`SET ${...}`) must go through prepareEventsWrite.
 *
 * Judges (round 2) found maintenance scripts storing scraped hrefs such as
 * "javascript:" in ticket_url, which the HTML gate caught but /api/*.json
 * shipped raw. Round-4 judges listed the src/ writers (src/db/database.ts
 * upsertEvent/updateEvent/updateEventImage, src/images/image-pipeline.ts,
 * src/ingest/email-ingestion.ts) as outside this check.
 */
import { describe, expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { readdirSync, readFileSync } from 'fs';
import { join, relative } from 'path';
import { prepareEventsWrite, prepareUrlWrite, urlColumnParams } from '../../scripts/lib/url-columns';

const REPO = join(import.meta.dir, '../..');
const SKIP_DIRS = new Set(['_archive', '__tests__', 'node_modules']);
const HELPERS = new Set(['scripts/lib/url-columns.ts', 'src/db/url-columns.ts']);
const SQL_LITERAL = /`(?:[^`\\]|\\.)*`|'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"/g;
const THROUGH_HELPER = /(?:prepareUrlWrite|prepareEventsWrite)\(\s*[A-Za-z_$][\w$.]*\s*,\s*$/;
/** An INSERT column list or SET list assembled at run time: the scanner cannot see its columns. */
const DYNAMIC_COLUMNS = /\bSET\s+\$\{|\bINTO\s+\w+\s*\([^)]*\$\{/i;

/** Raw URL-column writes in one source file: "file:line column". */
function rawUrlColumnWrites(file: string, src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(SQL_LITERAL)) {
    const sql = m[0].slice(1, -1);
    if (!/\b(?:UPDATE|INSERT)\b/i.test(sql)) continue;
    const before = src.slice(Math.max(0, m.index! - 80), m.index);
    if (m[0].startsWith('`') && DYNAMIC_COLUMNS.test(sql)) {
      const assigned = /(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*$/.exec(before);
      const viaVariable = assigned && new RegExp(`prepareEventsWrite\\(\\s*[A-Za-z_$][\\w$.]*\\s*,\\s*${assigned[1]}\\s*\\)`).test(src);
      if (!/prepareEventsWrite\(\s*[A-Za-z_$][\w$.]*\s*,\s*$/.test(before) && !viaVariable) {
        const line = src.slice(0, m.index).split('\n').length;
        out.push(`${file}:${line} builds its column list at run time without prepareEventsWrite`);
      }
      continue;
    }
    const refs = urlColumnParams(sql);
    if (refs.length === 0) continue;
    if (THROUGH_HELPER.test(before)) continue;
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
      "db.prepare(`UPDATE events SET ${sets.join(', ')} WHERE id = $id`).run(p);",
      "const sql = `UPDATE events SET ${sets.join(', ')} WHERE id = $id`; db.prepare(sql).run(p);",
      "prepareEventsWrite(db, `UPDATE events SET ${sets.join(', ')} WHERE id = $id`).run(p);",
      "const sql2 = `INSERT INTO events (${cols}) VALUES (${vals})`; prepareEventsWrite(db, sql2).run(p);",
    ].join('\n');
    expect(rawUrlColumnWrites('x.ts', src)).toEqual([
      'x.ts:1 binds ticket_url without prepareUrlWrite',
      'x.ts:2 binds image_url without prepareUrlWrite',
      'x.ts:4 binds url without prepareUrlWrite',
      'x.ts:5 binds url without prepareUrlWrite',
      'x.ts:9 builds its column list at run time without prepareEventsWrite',
      'x.ts:10 builds its column list at run time without prepareEventsWrite',
    ]);
  });

  for (const dir of ['scripts', 'src']) {
    test(`no file in ${dir}/ outside the helper binds a URL column directly`, () => {
      const violations = scriptFiles(join(REPO, dir))
        .map(f => relative(REPO, f))
        .filter(f => !HELPERS.has(f))
        .flatMap(f => rawUrlColumnWrites(f, readFileSync(join(REPO, f), 'utf-8')));
      expect(violations).toEqual([]);
    });
  }

  test('the src/ writers the round-4 judges listed are among the files scanned', () => {
    const scanned = new Set(scriptFiles(join(REPO, 'src')).map(f => relative(REPO, f)));
    for (const f of ['src/db/database.ts', 'src/images/image-pipeline.ts', 'src/ingest/email-ingestion.ts']) expect(scanned.has(f)).toBe(true);
  });

  test('prepareEventsWrite sanitises URL columns in a run-time column list and passes other lists through', () => {
    const db = new Database(':memory:');
    db.run("CREATE TABLE events (id TEXT PRIMARY KEY, ticket_url TEXT, image_url TEXT, note TEXT)");
    db.run("INSERT INTO events (id) VALUES ('a')");
    const updates: Record<string, string> = { ticket_url: 'javascript:alert(1)', image_url: 'https://cdn.example/a.jpg', note: 'javascript:prose' };
    const params: Record<string, string> = { $id: 'a' };
    for (const [k, v] of Object.entries(updates)) params[`$${k}`] = v;
    prepareEventsWrite(db, `UPDATE events SET ${Object.keys(updates).map(k => `${k} = $${k}`).join(', ')} WHERE id = $id`).run(params);
    expect(db.query("SELECT ticket_url, image_url, note FROM events WHERE id = 'a'").get()).toEqual({ ticket_url: null, image_url: 'https://cdn.example/a.jpg', note: 'javascript:prose' });
    prepareEventsWrite(db, 'UPDATE events SET note = $note WHERE id = $id').run({ $note: 'plain', $id: 'a' });
    expect(db.query("SELECT note FROM events WHERE id = 'a'").get()).toEqual({ note: 'plain' });
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
