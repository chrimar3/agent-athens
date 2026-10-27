/**
 * Shown rows that happen in the next N days, per stored `source`
 * (input-pipeline audit, Phase 2). A row counts when its run overlaps
 * [today, today + days - 1]: the start day for single events, start…endDate
 * for rows that state an end. Presumed ends are not used — a near-term count
 * must not rest on a presumption.
 */

export interface NearTermCoverage {
  windowDays: number;
  from: string;
  to: string;
  total: number;
  bySource: Record<string, number>;
}

function addDays(isoDay: string, n: number): string {
  const d = new Date(`${isoDay}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().substring(0, 10);
}

export function nearTermCoverage(
  events: ReadonlyArray<{ source: string; startDate: string; endDate?: string | null }>,
  today: string,
  days: number,
): NearTermCoverage {
  const from = today;
  const to = addDays(today, days - 1);
  const bySource: Record<string, number> = {};
  let total = 0;
  for (const e of events) {
    const start = e.startDate.substring(0, 10);
    const end = e.endDate ? e.endDate.substring(0, 10) : start;
    if (start > to || (end > start ? end : start) < from) continue;
    bySource[e.source] = (bySource[e.source] ?? 0) + 1;
    total++;
  }
  return { windowDays: days, from, to, total, bySource };
}

export const NEAR_TERM_DAYS = 7;

export interface NearTermSection extends NearTermCoverage {
  /** Sources with near-term rows in the previous build and none in this one. */
  droppedToZero: string[];
}

/** The previous report's bySource, or null when absent or not a {source: number} map. */
function previousBySource(previousReport: unknown): Record<string, number> | null {
  const bySource = (previousReport as { nearTerm?: { bySource?: unknown } } | null | undefined)?.nearTerm?.bySource;
  if (!bySource || typeof bySource !== 'object' || Array.isArray(bySource)) return null;
  const entries = Object.entries(bySource as Record<string, unknown>);
  if (!entries.every(([, n]) => typeof n === 'number' && Number.isFinite(n))) return null;
  return bySource as Record<string, number>;
}

/** The previous report's droppedToZero, or [] when absent or not a string list. */
function previousDropped(previousReport: unknown): string[] {
  const d = (previousReport as { nearTerm?: { droppedToZero?: unknown } } | null | undefined)?.nearTerm?.droppedToZero;
  return Array.isArray(d) && d.every((s) => typeof s === 'string') ? d : [];
}

/**
 * The `nearTerm` block of data/build-completeness.json, ratcheted against the
 * previous report. A source stays in droppedToZero on later builds until it has
 * near-term rows again: after one build its count is already 0, so comparing
 * counts alone would flag it once and then forget it.
 */
export function nearTermSection(
  previousReport: unknown,
  events: ReadonlyArray<{ source: string; startDate: string; endDate?: string | null }>,
  today: string,
): NearTermSection {
  const coverage = nearTermCoverage(events, today, NEAR_TERM_DAYS);
  const dropped = new Set(nearTermRegressions(previousBySource(previousReport), coverage.bySource));
  for (const s of previousDropped(previousReport)) if (!(coverage.bySource[s] > 0)) dropped.add(s);
  return { ...coverage, droppedToZero: [...dropped].sort() };
}

/** Sources that had near-term rows in the previous build and have none now. */
export function nearTermRegressions(
  previous: Record<string, number> | null,
  current: Record<string, number>,
): string[] {
  if (!previous) return [];
  return Object.keys(previous)
    .filter((s) => previous[s] > 0 && !(current[s] > 0))
    .sort();
}
