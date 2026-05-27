import { describe, test, expect } from 'bun:test';
import {
  parseOnassisEvents,
  parseOnassisDateRange,
  onassisCategoryToType,
} from '../scrape-onassis';

// Real rendered HTML captured from https://www.onassis.org/el/whats-on (2026-05-27).
const fixtureHtml = await Bun.file(
  `${import.meta.dir}/../../tests/fixtures/onassis-whats-on.html`,
).text();

describe('onassisCategoryToType — Greek category label → EventType', () => {
  test('Έκθεση → exhibition', () => expect(onassisCategoryToType('Έκθεση')).toBe('exhibition'));
  test('Κινηματογράφος → cinema', () => expect(onassisCategoryToType('Κινηματογράφος')).toBe('cinema'));
  test('Προβολές ταινιών → cinema', () => expect(onassisCategoryToType('Προβολές ταινιών')).toBe('cinema'));
  test('Μουσική → concert', () => expect(onassisCategoryToType('Μουσική')).toBe('concert'));
  test('Θέατρο → theater (the :223 hardcode bug class)', () => expect(onassisCategoryToType('Θέατρο')).toBe('theater'));
  test('Εκπαιδευτικό πρόγραμμα → workshop', () => expect(onassisCategoryToType('Εκπαιδευτικό πρόγραμμα')).toBe('workshop'));
  test('unknown label → other', () => expect(onassisCategoryToType('Κάτι Άγνωστο')).toBe('other'));
  test('empty → other', () => expect(onassisCategoryToType('')).toBe('other'));
});

describe('parseOnassisDateRange — date classification (em-dash numeric, real formats)', () => {
  test('shared-year range: start inherits the end year', () => {
    expect(parseOnassisDateRange('17.05 — 28.06.2026')).toEqual({
      start_date: '2026-05-17',
      end_date: '2026-06-28',
    });
  });

  test('cross-year range: both years explicit', () => {
    expect(parseOnassisDateRange('14.10.2025 — 28.05.2026')).toEqual({
      start_date: '2025-10-14',
      end_date: '2026-05-28',
    });
  });

  test('shared-year range #2', () => {
    expect(parseOnassisDateRange('05.06 — 07.06.2026')).toEqual({
      start_date: '2026-06-05',
      end_date: '2026-06-07',
    });
  });

  test('single date → end_date null (never fabricated)', () => {
    const r = parseOnassisDateRange('07.03.2026');
    expect(r.start_date).toBe('2026-03-07');
    expect(r.end_date).toBeNull();
  });

  test('open-ended / unparseable → null start (caller skips)', () => {
    expect(parseOnassisDateRange('Ongoing')).toEqual({ start_date: null, end_date: null });
  });

  test('REGRESSION (S117): end date is NOT written into start_date', () => {
    // The old fallback grabbed the LAST date in the string. Guard against it.
    const r = parseOnassisDateRange('17.05 — 28.06.2026');
    expect(r.start_date).not.toBe('2026-06-28'); // must NOT be the end date
    expect(r.start_date! < r.end_date!).toBe(true);
  });
});

describe('parseOnassisEvents — precise selectors against real fixture', () => {
  const events = parseOnassisEvents(fixtureHtml);

  test('captures the real event cards (>0)', () => {
    expect(events.length).toBeGreaterThan(0);
  });

  test('every event has a real title (>3 chars), no empty rows', () => {
    for (const e of events) {
      expect(e.title.length).toBeGreaterThan(3);
    }
  });

  test('ZERO chrome: no filter-string / bare-venue titles leak through', () => {
    for (const e of events) {
      expect(e.title).not.toMatch(/εμφανίζονται|όλες οι εκδηλώσεις|What.?s On/i);
      expect(e.title.trim()).not.toBe('Onassis Stegi');
      expect(e.title.trim()).not.toBe('Στέγη Ιδρύματος Ωνάση');
    }
  });

  test('content-typing: an exhibition card is exhibition', () => {
    const tilda = events.find(e => e.title.includes('Tilda Swinton'));
    expect(tilda).toBeDefined();
    expect(tilda!.type).toBe('exhibition');
  });

  test('content-typing: a film-screening card is cinema, NOT exhibition (the hardcode bug)', () => {
    const cinema = events.find(e => e.title.includes('Κινηματογραφικές προβολές'));
    expect(cinema).toBeDefined();
    expect(cinema!.type).toBe('cinema');
    expect(cinema!.type).not.toBe('exhibition');
  });

  test('date range assigned to correct ends (Tilda 17.05 — 28.06.2026)', () => {
    const tilda = events.find(e => e.title.includes('Tilda Swinton'));
    expect(tilda!.start_date).toBe('2026-05-17');
    expect(tilda!.end_date).toBe('2026-06-28');
  });

  test('exhibition genres = visual-arts; non-exhibition does not carry visual-arts', () => {
    const tilda = events.find(e => e.title.includes('Tilda Swinton'));
    const cinema = events.find(e => e.title.includes('Κινηματογραφικές προβολές'));
    expect(tilda!.genres).toEqual(['visual-arts']);
    expect(cinema!.genres).not.toContain('visual-arts');
  });

  test('no fabrication: parsing empty/no-match HTML returns [] (no Lanthimos filler)', () => {
    expect(parseOnassisEvents('<html><body><p>nothing</p></body></html>')).toEqual([]);
    const all = parseOnassisEvents(fixtureHtml);
    expect(all.some(e => e.title.includes('Yorgos Lanthimos'))).toBe(false);
  });
});
