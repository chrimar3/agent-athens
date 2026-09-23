/**
 * Same-slot layer: one venue cannot start two different shows at the same
 * minute, so an identical explicit start time licenses a looser title test —
 * word-boundary prefix, or equal words once a Greek final -σ is ignored.
 *
 * Positives are REAL unmerged pairs live on 2026-09-22 (the sequel guard,
 * short-title floor and 5-char typo floor each blocked one). Guards cover the
 * risks this looser test introduces.
 */

import { describe, test, expect } from 'bun:test';
import { findDuplicateGroups } from '../duplicate-detector';
import type { VenueEntry } from '../../utils/text-normalize';

const venues: VenueEntry[] = [];

let seq = 0;
function row(title: string, overrides: Record<string, any> = {}): Record<string, any> {
  return {
    id: `r${++seq}`,
    title,
    venue_name: 'Θέατρο Test',
    start_date: '2026-10-12T21:00:00',
    end_date: null,
    type: 'theater',
    source: 'more.com',
    dedup_protected: 0,
    ...overrides,
  };
}

const grouped = (rows: Record<string, any>[]) => findDuplicateGroups(rows, venues).length === 1;

describe('same-slot layer — real unmerged pairs', () => {
  test('season marker + credits suffix: "1984" ↔ "1984 - George Orwell - ΑΘΗΝΑ - 2ος χρόνος"', () => {
    expect(grouped([row('1984', { source: 'athinorama.gr' }), row('1984 - George Orwell - ΑΘΗΝΑ -  2ος χρόνος')])).toBe(true);
  });

  test('director credit: "Η κουζίνα" ↔ "Η ΚΟΥΖΙΝΑ σε σκηνοθεσία Γ.Κουτλή 2ος χρόνος"', () => {
    expect(grouped([row('Η κουζίνα', { source: 'athinorama.gr' }), row('Η ΚΟΥΖΙΝΑ σε σκηνοθεσία Γ.Κουτλή 2ος χρόνος')])).toBe(true);
  });

  test('same-source dual listing: "El Che" ↔ "El Che-Teatro"', () => {
    expect(grouped([row('El Che', { source: 'athinorama.gr' }), row('El Che-Teatro', { source: 'athinorama.gr' })])).toBe(true);
  });

  test('Greek case ending: "Η Μοναξιά της Δύσης" ↔ "Μοναξιά στη Δύση"', () => {
    expect(grouped([row('Η Μοναξιά της Δύσης'), row('Μοναξιά στη Δύση', { source: 'athinorama.gr' })])).toBe(true);
  });
});

describe('same-slot layer — guards', () => {
  test('different start minute does not license the looser test', () => {
    expect(grouped([row('1984', { source: 'athinorama.gr' }), row('1984 - George Orwell - 2ος χρόνος', { start_date: '2026-10-12T19:00:00' })])).toBe(false);
  });

  test('date-only rows (no stated time) never use it', () => {
    expect(grouped([row('1984', { source: 'athinorama.gr', start_date: '2026-10-12' }), row('1984 - George Orwell - 2ος χρόνος', { start_date: '2026-10-12' })])).toBe(false);
  });

  test('the 00:00 date-only sentinel never uses it', () => {
    expect(grouped([row('1984', { source: 'athinorama.gr', start_date: '2026-10-12T00:00:00' }), row('1984 - George Orwell - 2ος χρόνος', { start_date: '2026-10-12T00:00:00' })])).toBe(false);
  });

  test('a season placeholder is not a prefix of the show it contains', () => {
    expect(grouped([row('Θέατρο του Νέου Κόσμου 26-27'), row('Κοινός λόγος', { source: 'athinorama.gr' })])).toBe(false);
  });

  // 4 chars sits below every other layer's floor, so only same-slot could match.
  test('prefix must end on a word boundary', () => {
    expect(grouped([row('Jazz', { source: 'athinorama.gr' }), row('Jazzmin Live')])).toBe(false);
  });
});
