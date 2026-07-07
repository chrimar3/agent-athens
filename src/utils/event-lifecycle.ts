/**
 * Event Lifecycle Classifier
 *
 * Classifies events into lifecycle stages for the 45-day retention window:
 * - upcoming: event hasn't happened yet (generate page, show in listings)
 * - past-active: event ended ≤45 days ago (generate page with banner, exclude from listings)
 * - past-expired: event ended >45 days ago (no page, no listing)
 *
 * F2b (GEO rulings G1/G1-b, 2026-06): all classification keys on the EFFECTIVE
 * end — end_date when present (ANY type, real dates → real semantics), the
 * presumption window for run-implying types with NULL end_date, start_date
 * otherwise. The old Tier-1 "exhibitions use endDate" rule is the special case
 * this generalizes. Presumption binding constraints: never EventCompleted from
 * presumption (schema-geo.ts owns status); presumption expiry cools to noindex
 * immediately (no just-passed grace — we don't KNOW it just passed; err short).
 *
 * 410 policy (GEO Ruling 2, 2026-07-04): this classifier emits NO status code —
 * it is classification only. The ARCHIVE phase now drives an explicit 410 at the
 * redirects EMISSION layer (generateArchiveGoneRules in event-page.ts), bounded
 * to the trailing 45–90d band. The just-passed and cooling phases never 410
 * (they serve 200; cooling is noindex). The classifier is unchanged by this —
 * archive still classifies past-expired; only emission gained a 410.
 *
 * Timezone: Europe/Athens (manual offset, matching resolveEventStatus in schema-geo.ts).
 */

import { readFileSync } from 'fs';
import { join } from 'path';

export type LifecycleStatus = 'upcoming' | 'past-active' | 'past-expired';

const RETENTION_DAYS = 45;

// ── G1-b presumption config (per-city DATA, same posture as parsing-tokens) ──

interface PresumptionConfig {
  runImplyingTypes: string[];
  presumed_run_days: Record<string, number>;
}

/**
 * Shift-left validation (G1-b): a presumed_run_days entry for a type not in
 * runImplyingTypes is rejected at load — it would otherwise silently change
 * semantics the day someone adds the type to the list. Exported for tests.
 */
export function validatePresumptionConfig(raw: PresumptionConfig): void {
  const runSet = new Set(raw.runImplyingTypes);
  for (const [type, days] of Object.entries(raw.presumed_run_days)) {
    if (type !== '_default' && !runSet.has(type)) {
      throw new Error(
        `lifecycle-presumption.json: presumed_run_days entry '${type}' is not in runImplyingTypes — remove it or add the type deliberately`
      );
    }
    if (!Number.isInteger(days) || days <= 0) {
      throw new Error(`lifecycle-presumption.json: presumed_run_days.${type} must be a positive integer (got ${days})`);
    }
  }
  for (const type of raw.runImplyingTypes) {
    if (raw.presumed_run_days[type] === undefined && raw.presumed_run_days._default === undefined) {
      throw new Error(`lifecycle-presumption.json: run-implying type '${type}' has no window and no _default`);
    }
  }
}

const presumptionConfig: PresumptionConfig = JSON.parse(
  readFileSync(join(import.meta.dir, '../../config/lifecycle-presumption.json'), 'utf-8')
);
validatePresumptionConfig(presumptionConfig);

const RUN_IMPLYING_TYPES = new Set(presumptionConfig.runImplyingTypes);

export function isRunImplyingType(type: string | undefined): boolean {
  return type !== undefined && RUN_IMPLYING_TYPES.has(type);
}

/** Ordered list of run-implying types — consumed by effectiveEndSql() so the
 *  SQL mirror of resolveEffectiveEnd is generated from the SAME config. */
export function getRunImplyingTypes(): string[] {
  return [...presumptionConfig.runImplyingTypes];
}

export function presumptionWindowDays(type: string): number {
  return presumptionConfig.presumed_run_days[type] ?? presumptionConfig.presumed_run_days._default;
}

export interface EffectiveEnd {
  /** Date-only YYYY-MM-DD the lifecycle/status comparison keys on. */
  date: string;
  /** True when the date is a presumption (NULL end_date, run-implying type). */
  presumed: boolean;
}

/**
 * Single source of truth for "when does this event effectively end".
 * Consumers: lifecycle classifier (here), resolveEventStatus (schema-geo.ts).
 * Do not re-derive this rule locally — that is how the exhibition-only special
 * case metastasized into 20+ hardcoded sites (audit A2 F2/F3).
 */
export function resolveEffectiveEnd(event: {
  startDate: string;
  endDate?: string | null;
  type?: string;
}): EffectiveEnd {
  if (event.endDate) {
    return { date: event.endDate.substring(0, 10), presumed: false };
  }
  const startOnly = event.startDate.substring(0, 10);
  if (isRunImplyingType(event.type)) {
    const d = new Date(startOnly + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + presumptionWindowDays(event.type!));
    return { date: d.toISOString().substring(0, 10), presumed: true };
  }
  return { date: startOnly, presumed: false };
}

/**
 * Get today's date string (YYYY-MM-DD) in Europe/Athens timezone.
 * Reuses the same DST calculation as resolveEventStatus() in schema-geo.ts.
 * Exported (F2b) so date-sensitive tests can anchor fixtures to the SAME
 * "today" the classifier uses — UTC-anchored fixtures flake in the 00:00–03:00
 * Athens window when the UTC date is still yesterday.
 */
export function getAthensTodayStr(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const marchLast = new Date(Date.UTC(year, 2, 31));
  const marchSunday = 31 - marchLast.getUTCDay();
  const octLast = new Date(Date.UTC(year, 9, 31));
  const octSunday = 31 - octLast.getUTCDay();

  const dstStart = Date.UTC(year, 2, marchSunday, 1); // March last Sunday 01:00 UTC
  const dstEnd = Date.UTC(year, 9, octSunday, 1);     // October last Sunday 01:00 UTC
  const nowMs = now.getTime();

  const offsetHours = (nowMs >= dstStart && nowMs < dstEnd) ? 3 : 2;
  const athensNow = new Date(nowMs + offsetHours * 3600 * 1000);
  return athensNow.toISOString().substring(0, 10);
}

/**
 * Classify an event's lifecycle status.
 *
 * @param event - Must have startDate; endDate and type are optional.
 * @returns 'upcoming' | 'past-active' | 'past-expired'
 */
export function classifyEventLifecycle(event: {
  startDate: string;
  endDate?: string | null;
  type?: string;
}): LifecycleStatus {
  const dateOnly = resolveEffectiveEnd(event).date;
  const todayStr = getAthensTodayStr();

  if (dateOnly >= todayStr) {
    return 'upcoming';
  }

  // Event is in the past — check retention window
  const eventDate = new Date(dateOnly + 'T00:00:00Z');
  const todayDate = new Date(todayStr + 'T00:00:00Z');
  const daysDiff = Math.floor((todayDate.getTime() - eventDate.getTime()) / (86400 * 1000));

  if (daysDiff <= RETENTION_DAYS) {
    return 'past-active';
  }

  return 'past-expired';
}

/**
 * Should this event get a generated page?
 * True for upcoming and past-active events.
 */
export function shouldGeneratePage(event: {
  startDate: string;
  endDate?: string | null;
  type?: string;
}): boolean {
  return classifyEventLifecycle(event) !== 'past-expired';
}

/**
 * Is this event in the past (either active or expired)?
 */
export function isPastEvent(event: {
  startDate: string;
  endDate?: string | null;
  type?: string;
}): boolean {
  return classifyEventLifecycle(event) !== 'upcoming';
}

/**
 * 4-way lifecycle phase used by S144 indexability + canonical decisions
 * (GEO Strategist 2026-05-21, 45-Day Lifecycle ruling).
 *
 * - active:      event hasn't happened yet → index + self-canonical
 * - just-passed: ended within last 14 days → index + self-canonical
 *                (recently-passed content still discoverable; eligibility-window)
 * - cooling:     ended 15-44 days ago      → noindex (suppress stale content)
 * - archive:     ended 45+ days ago        → page not generated (out of retention)
 *
 * Single source of truth for the noindex predicate at event-page.ts:511
 * AND the NOINDEX_ON_INDEXABLE_PHASE build-guard in schema-completeness.ts.
 * Do not introduce parallel phase classifiers.
 */
export type LifecyclePhase = 'active' | 'just-passed' | 'cooling' | 'archive';

const JUST_PASSED_DAYS = 14;

export function getLifecyclePhase(event: {
  startDate: string;
  endDate?: string | null;
  type?: string;
}): LifecyclePhase {
  const status = classifyEventLifecycle(event);
  if (status === 'upcoming') return 'active';
  if (status === 'past-expired') return 'archive';

  // past-active: split into just-passed (≤14 days) vs cooling (15-44 days).
  // Presumed ends skip just-passed entirely (G1: we don't KNOW it just passed —
  // the window merely expired; err short → straight to cooling/noindex).
  const effective = resolveEffectiveEnd(event);
  if (effective.presumed) return 'cooling';

  const todayStr = getAthensTodayStr();
  const eventDate = new Date(effective.date + 'T00:00:00Z');
  const todayDate = new Date(todayStr + 'T00:00:00Z');
  const daysPast = Math.floor((todayDate.getTime() - eventDate.getTime()) / (86400 * 1000));

  return daysPast <= JUST_PASSED_DAYS ? 'just-passed' : 'cooling';
}

/**
 * S144 noindex predicate: true when the event's lifecycle phase is cooling or
 * archive (page suppressed from index). Locale-agnostic — same predicate for
 * bare-root and /en/. Per GEO ruling, the dormant-Greek noindex policy is a
 * SEPARATE layer (Sprint 3/4); this function is the lifecycle-only signal.
 */
export function shouldNoindexEvent(event: {
  startDate: string;
  endDate?: string | null;
  type?: string;
}): boolean {
  const phase = getLifecyclePhase(event);
  return phase === 'cooling' || phase === 'archive';
}
