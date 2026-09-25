/**
 * Tier-4 ticket URL discovery: the enrichment session can write a
 * `ticket_url_discovered:` line into its description file. The value is
 * untrusted: it must be a canonical http(s) URL with no quote, angle-bracket
 * or control characters before the host allowlist is even consulted.
 */
import { afterEach, describe, expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { parseTicketUrlDiscovered, saveBatch } from '../../scripts/save-batch';

describe('parseTicketUrlDiscovered', () => {
  test('a clean allowlist-style URL is returned canonically and stripped from the text', () => {
    const r = parseTicketUrlDiscovered('Body text.\n\nticket_url_discovered: https://WWW.viva.gr/tickets/x.\n');
    expect(r.candidate).toBe('https://www.viva.gr/tickets/x');
    expect(r.description).toBe('Body text.');
  });

  for (const bad of [
    'https://www.viva.gr/tickets/x"autofocus/onfocus=alert(1)//',
    "https://www.viva.gr/tickets/x'onmouseover='alert(1)",
    'https://www.viva.gr/tickets/<script>',
    'https://www.viva.gr/tickets/x`y',
    'https://user:pw@www.viva.gr/tickets/x',
  ]) {
    test(`rejects ${bad}`, () => {
      const r = parseTicketUrlDiscovered(`Body.\nticket_url_discovered: ${bad}\n`);
      expect(r.candidate).toBeNull();
      expect(r.description).toBe('Body.');
    });
  }

  test('no marker → no candidate, text unchanged', () => {
    expect(parseTicketUrlDiscovered('Just prose.')).toEqual({ candidate: null, description: 'Just prose.' });
  });
});

describe('saveBatch never persists a quote-bearing discovered ticket URL', () => {
  const dir = join('temp-descriptions', 'sec-ticket-url-test');
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  test('allowlisted host with attribute breakout is rejected; canonical URL is stored', () => {
    const db = new Database(':memory:');
    db.exec(`CREATE TABLE events (id TEXT PRIMARY KEY, title TEXT, type TEXT, venue_name TEXT, price_type TEXT,
      start_date TEXT, end_date TEXT, genres TEXT, description TEXT, full_description TEXT, full_description_gr TEXT,
      full_description_en TEXT, tags TEXT, source TEXT, needs_enrichment INTEGER DEFAULT 1, location_status TEXT,
      enriched_at TEXT, updated_at TEXT, ticket_url TEXT, ticket_url_status TEXT, ticket_url_source TEXT, ticket_url_resolved_at TEXT);
      CREATE TABLE enrichment_log (id INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT NOT NULL, enrichment_version TEXT,
      word_count_en INTEGER, created_at TEXT DEFAULT (datetime('now')));`);
    for (const id of ['sec-bad', 'sec-good']) {
      db.prepare(`INSERT INTO events (id, title, type, venue_name, price_type, start_date, source, location_status)
        VALUES (?, 'T', 'concert', 'Test Venue', 'with-ticket', '2099-06-15T21:00:00', 'test', 'verified_athens')`).run(id);
    }
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'sec-bad.md'), 'Prose.\n\nticket_url_discovered: https://www.viva.gr/tickets/x"autofocus/onfocus=alert(1)//\n');
    writeFileSync(join(dir, 'sec-good.md'), 'Prose.\n\nticket_url_discovered: https://www.viva.gr/tickets/music/y/\n');
    saveBatch(db, ['sec-bad', 'sec-good'], 'sec', 0, false, dir);
    const get = (id: string) => (db.prepare('SELECT ticket_url FROM events WHERE id = ?').get(id) as any).ticket_url;
    expect(get('sec-bad')).toBeNull();
    expect(get('sec-good')).toBe('https://www.viva.gr/tickets/music/y/');
  });
});
