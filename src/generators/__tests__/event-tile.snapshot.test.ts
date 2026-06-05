/**
 * S161 — Visual snapshot lock for the imageless event tile.
 *
 * Lock SVG output across the title-length range so future visual regressions
 * surface as snapshot diffs. Run once with `bun test --update-snapshots`,
 * eyeball each SVG (the test optionally writes them to /tmp on demand), then
 * commit the locked snap. Subsequent runs gate on diff.
 */

import { describe, test, expect } from 'bun:test';
import { generateEventTile } from '../event-tile';

const SNAPSHOT_INPUTS = [
  { name: 'short-english',          title: 'Jazz Live',                                                       venue: { name: 'Half Note' },        startDate: '2026-07-04' },
  { name: 'short-greek',            title: 'Ροκ Συναυλία',                                                    venue: { name: 'Gagarin 205' },     startDate: '2026-08-12' },
  { name: 'medium-greek',           title: 'Συναυλία Κλασικής Μουσικής στο Μέγαρο',                            venue: { name: 'Μέγαρο Μουσικής' },  startDate: '2026-06-20' },
  { name: 'long-greek',             title: 'Δημήτρης Κόψης παρουσιάζει νέα μουσική ζωντανά στο EXA',           venue: { name: 'EXA Ψυρρή' },       startDate: '2026-09-15' },
  { name: 'very-long-greek-trunc',  title: 'Χριστουγεννιάτικη Συναυλία της Κρατικής Ορχήστρας Αθηνών',         venue: { name: 'Μέγαρο Μουσικής Αθηνών' }, startDate: '2026-12-23' },
  { name: 'unbreakable-word',       title: 'Χριστουγεννιάτικη',                                               venue: { name: 'Test' },             startDate: '2026-12-23' },
] as const;

describe('event-tile snapshots', () => {
  for (const input of SNAPSHOT_INPUTS) {
    test(`tile snapshot — ${input.name}`, async () => {
      const svg = await generateEventTile(input);
      expect(svg).toMatchSnapshot();
    });
  }
});
