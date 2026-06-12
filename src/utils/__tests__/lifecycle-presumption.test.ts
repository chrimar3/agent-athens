/**
 * F2b semantics core: end_date-aware lifecycle + eventStatus for all types,
 * G1/G1-b presumption windows for run-implying types with NULL end_date.
 *
 * Binding constraints under test (GEO G1/G1-b):
 * - never EventCompleted from presumption
 * - past presumption window → eventStatus OMITTED (null), cooling/noindex, never 410
 * - point-in-time types with NULL end_date: behavior byte-identical to pre-F2b
 * - windows: exhibition 90 / theater 45 / festival 30 / _default 90 (config-driven)
 */

import { describe, test, expect } from 'bun:test';
import {
  classifyEventLifecycle,
  getLifecyclePhase,
  shouldNoindexEvent,
  resolveEffectiveEnd,
  isRunImplyingType,
  presumptionWindowDays,
  getAthensTodayStr,
} from '../event-lifecycle';
import { resolveEventStatus } from '../schema-geo';

const SCHEDULED = 'https://schema.org/EventScheduled';
const COMPLETED = 'https://schema.org/EventCompleted';

/**
 * Date string N days from ATHENS-today — anchored to the classifier's own
 * "today" so exact window boundaries (-45, -90) hold at any wall-clock hour.
 * A UTC anchor is one day behind in the 00:00–03:00 Athens window.
 */
function daysFromNow(n: number): string {
  const d = new Date(getAthensTodayStr() + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

describe('config: run-implying types + windows (G1-b values)', () => {
  test('run-implying enumeration', () => {
    expect(isRunImplyingType('exhibition')).toBe(true);
    expect(isRunImplyingType('theater')).toBe(true);
    expect(isRunImplyingType('festival')).toBe(true);
    expect(isRunImplyingType('concert')).toBe(false);
    expect(isRunImplyingType('performance')).toBe(false);
    expect(isRunImplyingType(undefined)).toBe(false);
  });

  test('window values per G1-b', () => {
    expect(presumptionWindowDays('exhibition')).toBe(90);
    expect(presumptionWindowDays('theater')).toBe(45);
    expect(presumptionWindowDays('festival')).toBe(30);
  });
});

describe('resolveEffectiveEnd', () => {
  test('end_date present (any type) wins, not presumed', () => {
    expect(resolveEffectiveEnd({ startDate: '2026-06-10', endDate: '2026-06-30', type: 'theater' }))
      .toEqual({ date: '2026-06-30', presumed: false });
    expect(resolveEffectiveEnd({ startDate: '2026-06-10', endDate: '2026-06-30', type: 'concert' }))
      .toEqual({ date: '2026-06-30', presumed: false });
  });

  test('NULL end + run-implying → start + window, presumed', () => {
    expect(resolveEffectiveEnd({ startDate: '2026-06-04', endDate: null, type: 'exhibition' }))
      .toEqual({ date: '2026-09-02', presumed: true });
    expect(resolveEffectiveEnd({ startDate: '2026-06-10', endDate: null, type: 'theater' }))
      .toEqual({ date: '2026-07-25', presumed: true });
    expect(resolveEffectiveEnd({ startDate: '2026-06-10', endDate: null, type: 'festival' }))
      .toEqual({ date: '2026-07-10', presumed: true });
  });

  test('NULL end + point type → start date, not presumed', () => {
    expect(resolveEffectiveEnd({ startDate: '2026-06-10T21:00:00', endDate: null, type: 'concert' }))
      .toEqual({ date: '2026-06-10', presumed: false });
  });
});

describe('resolveEventStatus — real dates, real status (any type)', () => {
  test('end_date in future → Scheduled, even when start is past (the 336eb7eb shape)', () => {
    expect(resolveEventStatus(daysFromNow(-2), daysFromNow(18), 'theater')).toBe(SCHEDULED);
    expect(resolveEventStatus(daysFromNow(-2), daysFromNow(18), 'concert')).toBe(SCHEDULED);
  });

  test('end_date in past → Completed (real date, real completion)', () => {
    expect(resolveEventStatus(daysFromNow(-30), daysFromNow(-5), 'theater')).toBe(COMPLETED);
    expect(resolveEventStatus(daysFromNow(-30), daysFromNow(-5), 'exhibition')).toBe(COMPLETED);
  });
});

describe('resolveEventStatus — presumption (NULL end_date, run-implying)', () => {
  test('within window → Scheduled (Barbara Kruger shape, start 8 days ago)', () => {
    expect(resolveEventStatus(daysFromNow(-8), null, 'exhibition')).toBe(SCHEDULED);
  });

  test('past window → OMITTED (null), never EventCompleted', () => {
    expect(resolveEventStatus(daysFromNow(-100), null, 'exhibition')).toBeNull();
    expect(resolveEventStatus(daysFromNow(-50), null, 'theater')).toBeNull();
    expect(resolveEventStatus(daysFromNow(-35), null, 'festival')).toBeNull();
  });

  test('window boundary: last day of window still Scheduled', () => {
    expect(resolveEventStatus(daysFromNow(-90), null, 'exhibition')).toBe(SCHEDULED);
    expect(resolveEventStatus(daysFromNow(-45), null, 'theater')).toBe(SCHEDULED);
  });
});

describe('resolveEventStatus — point types with NULL end (regression, byte-identical)', () => {
  test('future start → Scheduled; past start → Completed', () => {
    expect(resolveEventStatus(daysFromNow(3), null, 'concert')).toBe(SCHEDULED);
    expect(resolveEventStatus(daysFromNow(-3), null, 'concert')).toBe(COMPLETED);
    expect(resolveEventStatus(daysFromNow(-3), undefined, 'dj_set')).toBe(COMPLETED);
    expect(resolveEventStatus(daysFromNow(-3))).toBe(COMPLETED);
  });
});

describe('lifecycle — end_date-aware for all types', () => {
  test('running theater (real end in future) is upcoming/active, indexed', () => {
    const e = { startDate: daysFromNow(-2), endDate: daysFromNow(18), type: 'theater' };
    expect(classifyEventLifecycle(e)).toBe('upcoming');
    expect(getLifecyclePhase(e)).toBe('active');
    expect(shouldNoindexEvent(e)).toBe(false);
  });

  test('theater ended 10 days ago (real end) → just-passed, indexed', () => {
    const e = { startDate: daysFromNow(-40), endDate: daysFromNow(-10), type: 'theater' };
    expect(getLifecyclePhase(e)).toBe('just-passed');
    expect(shouldNoindexEvent(e)).toBe(false);
  });

  test('presumed-running exhibition (NULL end, within window) → active, indexed', () => {
    const e = { startDate: daysFromNow(-8), endDate: null, type: 'exhibition' };
    expect(classifyEventLifecycle(e)).toBe('upcoming');
    expect(getLifecyclePhase(e)).toBe('active');
    expect(shouldNoindexEvent(e)).toBe(false);
  });

  test('presumption expired → cooling/noindex immediately (no just-passed; err short)', () => {
    const e = { startDate: daysFromNow(-95), endDate: null, type: 'exhibition' };
    expect(getLifecyclePhase(e)).toBe('cooling');
    expect(shouldNoindexEvent(e)).toBe(true);
  });

  test('presumption long-expired → archive (page not generated; still never 410)', () => {
    const e = { startDate: daysFromNow(-140), endDate: null, type: 'exhibition' };
    expect(classifyEventLifecycle(e)).toBe('past-expired');
    expect(getLifecyclePhase(e)).toBe('archive');
  });

  test('point type NULL-end regression: classification unchanged', () => {
    expect(classifyEventLifecycle({ startDate: daysFromNow(2), endDate: null, type: 'concert' })).toBe('upcoming');
    expect(getLifecyclePhase({ startDate: daysFromNow(-10), endDate: null, type: 'concert' })).toBe('just-passed');
    expect(getLifecyclePhase({ startDate: daysFromNow(-20), endDate: null, type: 'concert' })).toBe('cooling');
    expect(classifyEventLifecycle({ startDate: daysFromNow(-50), endDate: null, type: 'concert' })).toBe('past-expired');
  });
});
