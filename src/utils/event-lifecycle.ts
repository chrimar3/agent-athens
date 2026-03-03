/**
 * Event Lifecycle Classifier
 *
 * Classifies events into lifecycle stages for the 45-day retention window:
 * - upcoming: event hasn't happened yet (generate page, show in listings)
 * - past-active: event ended ≤45 days ago (generate page with banner, exclude from listings)
 * - past-expired: event ended >45 days ago (no page, no listing)
 *
 * Tier 1 rule: exhibitions use endDate, everything else uses startDate.
 * Timezone: Europe/Athens (manual offset, matching resolveEventStatus in schema-geo.ts).
 */

export type LifecycleStatus = 'upcoming' | 'past-active' | 'past-expired';

const RETENTION_DAYS = 45;

/**
 * Get today's date string (YYYY-MM-DD) in Europe/Athens timezone.
 * Reuses the same DST calculation as resolveEventStatus() in schema-geo.ts.
 */
function getAthensTodayStr(): string {
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
  const isExhibition = event.type === 'exhibition';
  const relevantDate = (isExhibition && event.endDate) ? event.endDate : event.startDate;
  const dateOnly = relevantDate.substring(0, 10);
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
