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

// 2026-09-23: 106 of 118 downloads went to quarantined clubber.gr, whose
// image URLs answer an HTML wall. The registry keys scraper ids ("clubber"),
// rows store "clubber.gr"; and a SQL LIMIT taken before filtering would let
// quarantined rows fill the batch.
describe('selectImageRows — quarantined sources', () => {
  const registry = { sources: { clubber: { since: '2026-09-01', reason: 'captcha wall' } } };
  const db = () => {
    const d = fixtureDb();
    d.run(`INSERT INTO events VALUES ('q', 'https://www.clubber.gr/img/1.jpg', NULL, 'clubber.gr', '2026-09-30', NULL)`);
    return d;
  };

  test('quarantined rows are not queued', () => {
    expect(selectImageRows(db(), {}, { sources: {} }).map(r => r.id).sort()).toEqual(['good', 'q']); // precondition: selectable without quarantine
    expect(selectImageRows(db(), {}, registry).map(r => r.id)).toEqual(['good']);
  });

  test('the limit counts downloadable rows only', () => {
    expect(selectImageRows(db(), { limit: 1 }, registry).map(r => r.id)).toEqual(['good']);
  });
});
