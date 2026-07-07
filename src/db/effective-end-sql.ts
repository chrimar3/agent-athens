/**
 * SQL mirror of resolveEffectiveEnd() — the single "is this event current"
 * predicate for raw SQL queries (campaign Phase 6, 2026-07-07).
 *
 * The Tier-1 exhibition/end_date rule was hand-copied as a COALESCE fragment
 * at ~10 sites and skipped entirely (raw `start_date >= date('now')`) at ~20
 * more; the copies then drifted from the canonical classifier when S189 made
 * end_date govern ALL types and G1 added presumption windows. Do not re-derive
 * this rule locally — consume this fragment (tests/effective-end-guard.test.ts
 * fails the build on new raw date-predicate sites).
 *
 * Generated from the SAME sources as the TS resolver:
 *   - end_date governs every type (S189)
 *   - NULL end_date + run-implying type → presumed end = start + window
 *     (config/lifecycle-presumption.json, via getRunImplyingTypes /
 *     presumptionWindowDays)
 *   - otherwise → start_date (date-only)
 *
 * Timezone: SQLite's date('now') is UTC — between 00:00 and 02/03:00 Athens
 * wall-time it is YESTERDAY, so `>= date('now')` sites silently include
 * expired events overnight (or exclude fresh ones, direction depending on the
 * comparison). Bind `$today` from athensTodaySql() = getAthensTodayStr()
 * instead of comparing against date('now').
 */
import { getRunImplyingTypes, presumptionWindowDays, getAthensTodayStr } from '../utils/event-lifecycle';

/**
 * Returns a SQL expression evaluating to the event's effective end date
 * (YYYY-MM-DD). `prefix` qualifies column names for aliased queries ('e.').
 */
export function effectiveEndSql(prefix = ''): string {
  const presumed = getRunImplyingTypes()
    .map(
      (t) =>
        `WHEN ${prefix}end_date IS NULL AND ${prefix}type = '${t}' ` +
        `THEN date(substr(${prefix}start_date, 1, 10), '+${presumptionWindowDays(t)} days')`,
    )
    .join('\n    ');
  return `CASE
    WHEN ${prefix}end_date IS NOT NULL THEN substr(${prefix}end_date, 1, 10)
    ${presumed}
    ELSE substr(${prefix}start_date, 1, 10)
  END`;
}

/** Athens-local today (YYYY-MM-DD) for binding as $today next to effectiveEndSql(). */
export function athensTodaySql(): string {
  return getAthensTodayStr();
}

/**
 * Convenience: full "event is still current" predicate.
 * Usage: db.prepare(`SELECT … WHERE ${isCurrentSql()}`).all({ $today: athensTodaySql() })
 */
export function isCurrentSql(prefix = ''): string {
  return `${effectiveEndSql(prefix)} >= $today`;
}
