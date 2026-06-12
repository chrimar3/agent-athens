/**
 * F2b: config-load validation (shift-left per G1-b) + eventToRow G5 fix.
 *
 * A presumed_run_days entry for a type NOT in runImplyingTypes must be rejected
 * at load time — a window value for a point-in-time type is a config error that
 * would otherwise silently change semantics if the type is later added.
 */

import { describe, test, expect } from 'bun:test';
import { validatePresumptionConfig } from '../event-lifecycle';
import { eventToRow } from '../../db/database';
import { sampleConcert } from '../../../tests/fixtures/events';

describe('validatePresumptionConfig', () => {
  const good = {
    runImplyingTypes: ['exhibition', 'theater', 'festival'],
    presumed_run_days: { exhibition: 90, theater: 45, festival: 30, _default: 90 },
  };

  test('accepts the shipped shape', () => {
    expect(() => validatePresumptionConfig(good)).not.toThrow();
  });

  test('rejects a window for a type not in runImplyingTypes', () => {
    const bad = { ...good, presumed_run_days: { ...good.presumed_run_days, concert: 7 } };
    expect(() => validatePresumptionConfig(bad)).toThrow(/concert/);
  });

  test('rejects non-positive or non-integer windows', () => {
    expect(() => validatePresumptionConfig({ ...good, presumed_run_days: { ...good.presumed_run_days, theater: 0 } })).toThrow();
    expect(() => validatePresumptionConfig({ ...good, presumed_run_days: { ...good.presumed_run_days, theater: 4.5 } })).toThrow();
  });

  test('rejects a run-implying type with neither own window nor _default', () => {
    const noDefault = {
      runImplyingTypes: ['exhibition', 'theater'],
      presumed_run_days: { exhibition: 90 },
    };
    expect(() => validatePresumptionConfig(noDefault)).toThrow(/theater/);
  });
});

describe('eventToRow — G5 on the enrichment write path', () => {
  test("empty description binds NULL, never ''", () => {
    const row = eventToRow({ ...sampleConcert, description: '' });
    expect(row.$description).toBeNull();
  });

  test('non-empty description passes through', () => {
    const row = eventToRow({ ...sampleConcert, description: 'Μια περιγραφή' });
    expect(row.$description).toBe('Μια περιγραφή');
  });
});
