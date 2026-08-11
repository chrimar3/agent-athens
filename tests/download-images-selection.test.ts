import { describe, test, expect } from 'bun:test';
import { Database } from 'bun:sqlite';
import { selectImageRows } from '../scripts/download-images';

// The 2026-08-10 pipeline attempted 481 downloads, ALL failed: rows with
// permanently-dead /lmnts/events/ URLs (documented broken:
// fix-athinorama-images.ts:5) stay image_local NULL and are retried every
// day forever. Merged phantom rows must not be downloaded either.
function fixtureDb(): Database {
  const db = new Database(':memory:');
  db.run(`CREATE TABLE events (id TEXT PRIMARY KEY, image_url TEXT, image_local TEXT,
          source TEXT, start_date TEXT, merged_into TEXT)`);
  const ins = db.prepare(`INSERT INTO events VALUES (?,?,?,?,?,?)`);
  ins.run('good', 'https://www.athinorama.gr/Content/ImagesDatabase/p/250x300/crop/both/ab/cd.jpg', null, 'athinorama.gr', '2026-09-01', null);
  ins.run('dead-lmnts', 'https://www.athinorama.gr/lmnts/events/theatre/10089345/list.jpg', null, 'athinorama.gr', '2026-09-02', null);
  ins.run('merged', 'https://www.athinorama.gr/Content/ImagesDatabase/p/250x300/crop/both/ef/gh.jpg', null, 'athinorama.gr', '2026-09-03', 'good');
  ins.run('done', 'https://example.com/x.jpg', 'data/images/done.webp', 'more.com', '2026-09-04', null);
  return db;
}

describe('selectImageRows', () => {
  test('fixture precondition: all four exclusion cases present', () => {
    const db = fixtureDb();
    expect((db.query(`SELECT COUNT(*) c FROM events`).get() as { c: number }).c).toBe(4);
  });

  test('selects only live rows with live URL schemes and no local image', () => {
    const rows = selectImageRows(fixtureDb(), {});
    expect(rows.map((r) => r.id)).toEqual(['good']);
  });

  test('force re-includes already-downloaded rows but never dead URLs or merged rows', () => {
    const rows = selectImageRows(fixtureDb(), { force: true });
    expect(rows.map((r) => r.id).sort()).toEqual(['done', 'good']);
  });

  test('source filter applies', () => {
    const rows = selectImageRows(fixtureDb(), { force: true, sourceFilter: 'more.com' });
    expect(rows.map((r) => r.id)).toEqual(['done']);
  });
});
