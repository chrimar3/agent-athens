import { describe, test, expect } from 'bun:test';
import { classifyEventLifecycle, shouldGeneratePage, isPastEvent } from '../event-lifecycle';

/**
 * Get today's date in Athens timezone, matching the production getAthensTodayStr() logic.
 * This avoids UTC vs Athens mismatches that cause test failures near midnight.
 */
function getAthensTodayStr(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const marchLast = new Date(Date.UTC(year, 2, 31));
  const marchSunday = 31 - marchLast.getUTCDay();
  const octLast = new Date(Date.UTC(year, 9, 31));
  const octSunday = 31 - octLast.getUTCDay();
  const dstStart = Date.UTC(year, 2, marchSunday, 1);
  const dstEnd = Date.UTC(year, 9, octSunday, 1);
  const nowMs = now.getTime();
  const offsetHours = (nowMs >= dstStart && nowMs < dstEnd) ? 3 : 2;
  const athensNow = new Date(nowMs + offsetHours * 3600 * 1000);
  return athensNow.toISOString().substring(0, 10);
}

/**
 * Helper: create a date string N days from Athens-today (positive = future, negative = past).
 * Uses Athens timezone to stay consistent with classifyEventLifecycle().
 */
function daysFromNow(days: number): string {
  const todayStr = getAthensTodayStr();
  const d = new Date(todayStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().substring(0, 10) + 'T20:00:00+03:00';
}

function dateOnlyFromNow(days: number): string {
  const todayStr = getAthensTodayStr();
  const d = new Date(todayStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().substring(0, 10);
}

describe('classifyEventLifecycle', () => {
  test('future concert (startDate tomorrow) → upcoming', () => {
    expect(classifyEventLifecycle({
      startDate: daysFromNow(1),
      type: 'concert',
    })).toBe('upcoming');
  });

  test('concert today → upcoming', () => {
    expect(classifyEventLifecycle({
      startDate: daysFromNow(0),
      type: 'concert',
    })).toBe('upcoming');
  });

  test('concert yesterday → past-active', () => {
    expect(classifyEventLifecycle({
      startDate: daysFromNow(-1),
      type: 'concert',
    })).toBe('past-active');
  });

  test('concert 44 days ago → past-active', () => {
    expect(classifyEventLifecycle({
      startDate: daysFromNow(-44),
      type: 'concert',
    })).toBe('past-active');
  });

  test('concert 45 days ago → past-active (boundary inclusive)', () => {
    expect(classifyEventLifecycle({
      startDate: daysFromNow(-45),
      type: 'concert',
    })).toBe('past-active');
  });

  test('concert 46 days ago → past-expired', () => {
    expect(classifyEventLifecycle({
      startDate: daysFromNow(-46),
      type: 'concert',
    })).toBe('past-expired');
  });

  test('running exhibition (started 30d ago, ends in 30d) → upcoming', () => {
    expect(classifyEventLifecycle({
      startDate: daysFromNow(-30),
      endDate: dateOnlyFromNow(30),
      type: 'exhibition',
    })).toBe('upcoming');
  });

  test('ended exhibition (end_date yesterday) → past-active', () => {
    expect(classifyEventLifecycle({
      startDate: daysFromNow(-60),
      endDate: dateOnlyFromNow(-1),
      type: 'exhibition',
    })).toBe('past-active');
  });

  test('ended exhibition (end_date 46 days ago) → past-expired', () => {
    expect(classifyEventLifecycle({
      startDate: daysFromNow(-120),
      endDate: dateOnlyFromNow(-46),
      type: 'exhibition',
    })).toBe('past-expired');
  });

  // F2b (G1, 2026-06-12): real end_date governs for ALL types now — a running
  // multi-day event is upcoming until its end passes. The previous assertion
  // ("uses startDate" → past-active) pinned the pre-F2b exhibition-only special
  // case; it was the defect, not the contract.
  test('non-exhibition with endDate in future, startDate in past → upcoming (real end governs)', () => {
    expect(classifyEventLifecycle({
      startDate: daysFromNow(-5),
      endDate: dateOnlyFromNow(10),
      type: 'concert',
    })).toBe('upcoming');
  });
});

describe('shouldGeneratePage', () => {
  test('upcoming → true', () => {
    expect(shouldGeneratePage({
      startDate: daysFromNow(1),
      type: 'concert',
    })).toBe(true);
  });

  test('past-active → true', () => {
    expect(shouldGeneratePage({
      startDate: daysFromNow(-5),
      type: 'concert',
    })).toBe(true);
  });

  test('past-expired → false', () => {
    expect(shouldGeneratePage({
      startDate: daysFromNow(-46),
      type: 'concert',
    })).toBe(false);
  });
});

describe('isPastEvent', () => {
  test('upcoming → false', () => {
    expect(isPastEvent({
      startDate: daysFromNow(1),
      type: 'concert',
    })).toBe(false);
  });

  test('past-active → true', () => {
    expect(isPastEvent({
      startDate: daysFromNow(-5),
      type: 'concert',
    })).toBe(true);
  });

  test('past-expired → true', () => {
    expect(isPastEvent({
      startDate: daysFromNow(-46),
      type: 'concert',
    })).toBe(true);
  });
});
