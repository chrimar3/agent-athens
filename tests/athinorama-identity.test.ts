import { describe, test, expect } from 'bun:test';
import { generateAthinoramaId, generateEventId } from '../scripts/scrape-all';

// WHY this exists (precondition pin): the legacy id hashes (title, date,
// venue) — and ongoing athinorama runs stamp startDate = "today", so the SAME
// production minted a NEW id every scrape-day (Βάκχες 18 rows, Υπηρέτης 50;
// 8+ sessions flagged it). If the legacy id ever becomes date-independent,
// revisit whether this dedicated id is still needed.
describe('legacy id is date-dependent (the defect this fix exists for)', () => {
  test('same production, different scrape-days → DIFFERENT legacy ids', () => {
    const a = generateEventId('Βάκχες', '2026-08-10', 'Λυκαβηττός');
    const b = generateEventId('Βάκχες', '2026-08-11', 'Λυκαβηττός');
    expect(a).not.toBe(b);
  });
});

describe('generateAthinoramaId — production identity from the URL slug', () => {
  test('same URL on different days → SAME id', () => {
    const url = '/theatre/performance/bakxes-10091044/';
    expect(generateAthinoramaId(url)).toBe(generateAthinoramaId(url));
    expect(generateAthinoramaId(url)).toMatch(/^[a-f0-9]{16}$/);
  });

  test('different productions → different ids', () => {
    expect(generateAthinoramaId('/theatre/performance/bakxes-10091044/')).not.toBe(
      generateAthinoramaId('/theatre/performance/persai-10089345/'),
    );
  });

  test('trailing-slash and absolute-URL variants normalize to the same id', () => {
    expect(generateAthinoramaId('/theatre/performance/bakxes-10091044')).toBe(
      generateAthinoramaId('https://www.athinorama.gr/theatre/performance/bakxes-10091044/'),
    );
  });

  test('URL without a numeric slug → null (caller falls back to legacy id)', () => {
    expect(generateAthinoramaId('/theatre/guide')).toBeNull();
  });
});
