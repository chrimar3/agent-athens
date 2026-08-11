/**
 * Event-count floor gate — the anti-vacuity guard for the build.
 *
 * Failure class this closes: every other hard-stop gate in generate-site.ts
 * fires on the PRESENCE of bad pages. A build that emits zero (or
 * catastrophically few) events satisfies all of them vacuously, stamps
 * provenance, passes the deploy gate, and publishes an empty calendar with
 * every alarm green. This gate fails the build (non-zero exit at the call
 * site) when publishable event counts collapse below absolute floors.
 *
 * Thresholds are ABSOLUTE, not relative. Relative-drop checks were rejected
 * because pageableEvents swings 35% between consecutive HEALTHY runs
 * (1,531 → 2,356 observed). Do not add a baseline/relative check, and do not
 * threshold on pageableEvents.
 *
 * Floors vs observed healthy values:
 * - locationFiltered (2026-07 baseline): healthy 12,879–13,725 → floor 5000.
 *   2026-08-11 NOTE: the counted population INCLUDES merged_into rows (getAllEvents
 *   feeds them to the dedup-301 redirect layer), so the 2026-08-11 phantom
 *   collapse did NOT shrink this count (13,185 observed post-collapse).
 *   A briefly-committed 2000 recalibration was based on the wrong population
 *   model and is reverted — 5000 remains correct for including-merged counts.
 * - upcomingEvents: healthy 224–267, seasonal → floor deliberately low at 50.
 */

/** Collapse detector — healthy is ~13k incl. merged rows; below this the pipeline lost its data. */
export const LOCATION_FILTERED_FLOOR = 5000;

/** Deliberately low (seasonal count); healthy is ~224–267. */
export const UPCOMING_EVENTS_FLOOR = 50;

export interface EventCounts {
  locationFiltered: number;
  upcomingEvents: number;
}

export interface EventCountFloorReport {
  failures: string[];
  /** The counts that were checked — echoed for the build-log PASS line. */
  counts: EventCounts;
}

/** Pure check — a count passes only if it is a finite number at or above its floor. */
export function validateEventCountFloor(counts: EventCounts): EventCountFloorReport {
  const failures: string[] = [];

  const check = (name: string, value: number, floor: number) => {
    if (!Number.isFinite(value) || value < floor) {
      failures.push(
        `${name} = ${value}, below floor ${floor} — publishable events collapsed; ` +
          `refusing to build a (near-)empty site`,
      );
    }
  };

  check('locationFiltered', counts.locationFiltered, LOCATION_FILTERED_FLOOR);
  check('upcomingEvents', counts.upcomingEvents, UPCOMING_EVENTS_FLOOR);

  return { failures, counts };
}
