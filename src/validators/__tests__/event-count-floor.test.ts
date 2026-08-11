/**
 * Event-count floor gate — the anti-vacuity guard for the build.
 *
 * Every other hard-stop gate fires on the PRESENCE of bad pages, so a build
 * that emits nothing satisfies all of them vacuously and would publish an
 * empty calendar with every alarm green. This gate fails the build when
 * publishable event counts collapse below absolute floors.
 *
 * Thresholds are ABSOLUTE, not relative: pageableEvents swings 35% between
 * consecutive healthy runs (1,531 → 2,356 observed), so a relative tripwire
 * would fail good builds. Do not add a baseline/relative check here.
 */

import { describe, expect, test } from 'bun:test';
import {
  validateEventCountFloor,
  LOCATION_FILTERED_FLOOR,
  UPCOMING_EVENTS_FLOOR,
} from '../event-count-floor';

describe('floor constants are pinned', () => {
  // Observed healthy range 12,879–13,725; no seasonality. A mutant that
  // weakens this floor must die here.
  test('locationFiltered floor is exactly 5000 (population includes merged rows — see event-count-floor.ts note)', () => {
    expect(LOCATION_FILTERED_FLOOR).toBe(5000);
  });

  // Observed healthy range 224–267; seasonal, so deliberately low.
  test('upcomingEvents floor is exactly 50', () => {
    expect(UPCOMING_EVENTS_FLOOR).toBe(50);
  });
});

describe('validateEventCountFloor', () => {
  test('healthy counts pass with zero failures', () => {
    const report = validateEventCountFloor({
      locationFiltered: 13000,
      upcomingEvents: 240,
    });
    expect(report.failures).toEqual([]);
  });

  test('counts exactly at the floors pass (floor is inclusive)', () => {
    const report = validateEventCountFloor({
      locationFiltered: 5000,
      upcomingEvents: 50,
    });
    expect(report.failures).toEqual([]);
  });

  test('counts one below a floor FAIL', () => {
    const locReport = validateEventCountFloor({
      locationFiltered: 4999,
      upcomingEvents: 240,
    });
    expect(locReport.failures).toHaveLength(1);
    expect(locReport.failures[0]).toContain('locationFiltered');
    expect(locReport.failures[0]).toContain('4999');
    expect(locReport.failures[0]).toContain('5000');

    const upReport = validateEventCountFloor({
      locationFiltered: 13000,
      upcomingEvents: 49,
    });
    expect(upReport.failures).toHaveLength(1);
    expect(upReport.failures[0]).toContain('upcomingEvents');
    expect(upReport.failures[0]).toContain('49');
    expect(upReport.failures[0]).toContain('50');
  });

  test('the vacuous-build case — zero everywhere — FAILS both floors', () => {
    const report = validateEventCountFloor({
      locationFiltered: 0,
      upcomingEvents: 0,
    });
    expect(report.failures).toHaveLength(2);
  });

  test('non-finite or negative counts FAIL (a broken counter must not pass)', () => {
    expect(
      validateEventCountFloor({ locationFiltered: NaN, upcomingEvents: 240 }).failures.length,
    ).toBeGreaterThan(0);
    expect(
      validateEventCountFloor({ locationFiltered: 13000, upcomingEvents: -1 }).failures.length,
    ).toBeGreaterThan(0);
  });

  test('report echoes the counts it checked (for the build-log PASS line)', () => {
    const report = validateEventCountFloor({
      locationFiltered: 13000,
      upcomingEvents: 240,
    });
    expect(report.counts).toEqual({ locationFiltered: 13000, upcomingEvents: 240 });
  });
});
