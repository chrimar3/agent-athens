/**
 * Weekend Capsule (EN-only) — slug-scoped answer-capsule override for /en/this-weekend.
 *
 * Wired from src/generators/hub-page.ts when config.slug==='this-weekend' && locale==='en'.
 * Greek path is a separate workstream; this helper is EN-only by design (hardcoded " and "
 * join, EN-only S1/S2 literal strings).
 *
 * Returns null when there are zero events — caller falls through to the existing
 * empty-page handling (renderHubPage's MIN_EVENTS_THRESHOLD branch).
 */

import type { Event, EventType } from '../types';
import type { Locale, UIStrings } from '../i18n/strings';
import type { EditorPick } from './editor-picks';

const DATE_RANGE_EN = 'Friday to Sunday';
const TOP_CATEGORIES = 3;

function joinWithAnd(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  return items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1];
}

function topCategoryLabels(events: Event[], t: UIStrings): string[] {
  const counts = new Map<EventType, number>();
  for (const e of events) counts.set(e.type, (counts.get(e.type) ?? 0) + 1);

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_CATEGORIES)
    .map(([type]) => t.typeLabels[type] ?? type);
}

function buildS1(events: Event[], t: UIStrings): string {
  const count = events.length;
  const categorySummary = joinWithAnd(topCategoryLabels(events, t));

  const base = `Athens events this weekend span ${count} cultural events across ${categorySummary}, ${DATE_RANGE_EN}`;

  if (count < 2) return `${base}.`;

  const sorted = [...events].sort((a, b) =>
    a.startDate.localeCompare(b.startDate)
    || a.title.localeCompare(b.title)
    || a.id.localeCompare(b.id),
  );

  return `${base} — from ${sorted[0].title} to ${sorted[1].title}.`;
}

function buildS2Empty(events: Event[], cityDescriptor: string): string {
  const openCount = events.filter(e => e.price.type === 'open').length;
  const withTicketCount = events.length - openCount;
  const venueCount = new Set(events.map(e => e.venue.name)).size;

  const clauses: string[] = [];
  if (openCount > 0) clauses.push(`${openCount} open events`);
  if (withTicketCount > 0) clauses.push(`${withTicketCount} with-ticket events`);

  const coverage = clauses.length === 0
    ? 'events'  // unreachable when count > 0, but defensive
    : clauses.join(' and ');

  return `This weekend guide covers ${coverage} across ${venueCount} venues in ${cityDescriptor}, refreshed daily with dates, prices, and editorial context for every listing.`;
}

export function buildWeekendCapsule(
  events: Event[],
  _locale: Locale,
  editorPicks: EditorPick[],
  cityDescriptor: string,
  t: UIStrings,
): string | null {
  if (events.length === 0) return null;

  const s1 = buildS1(events, t);

  // S2 populated branch (editorPicks.length > 0) deferred to S101b — not implemented.
  // Demo default is empty picks, so we always render the empty branch here.
  void editorPicks;
  const s2 = buildS2Empty(events, cityDescriptor);

  return `${s1} ${s2}`;
}
