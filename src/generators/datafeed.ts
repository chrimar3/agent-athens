/**
 * Schema.org DataFeed builder + writer (Sprint 2 Component A).
 *
 * Wraps per-event JSON-LD (via `buildEventSchemaObject`) into a single
 * DataFeed document at /api/events.json — the AI-agent / structured-data
 * discovery surface, served alongside the existing internal-shape
 * /api/index.json (which serves JS clients via the page.ts:127
 * alternate-link contract).
 *
 * Sprint 1 contract preserved: per-event JSON-LD shape (including the
 * three-lane seller logic at event-page.ts:242-268) is reused directly,
 * not reshaped. DataFeed wraps; doesn't transform.
 */

import { existsSync, readFileSync } from 'fs';
import { isIsoTimestamp } from '../validators/persisted-state';
import type { Event } from '../types';
import type { Locale } from '../i18n/strings';
import { buildEventSchemaObject } from './event-page';
import { shouldNoindexEvent } from '../utils/event-lifecycle';
import { writeJsonApiIfChangedSync } from '../utils/write-if-changed';

export interface DataFeedDocument {
  '@context': 'https://schema.org';
  '@type': 'DataFeed';
  name: string;
  description: string;
  dateModified: string;
  dataFeedElement: Record<string, any>[];
  // `meta.lastUpdate` is required by writeJsonApiIfChangedSync to preserve
  // the prior timestamp on otherwise-identical builds (avoids daily git
  // churn from clock drift). Mirrors Schema.org `dateModified` at write time.
  meta: { lastUpdate: string };
}

export function buildDataFeed(events: Event[], locale: Locale = 'el'): DataFeedDocument {
  const now = new Date().toISOString();
  return {
    '@context': 'https://schema.org',
    '@type': 'DataFeed',
    name: 'Agent Athens — Cultural Events',
    description: 'Cultural events in Athens, Greece. Updated daily.',
    dateModified: now,
    // Match HTML lifecycle suppression and English-page generation eligibility.
    dataFeedElement: events
      .filter(event => !shouldNoindexEvent(event) && (locale !== 'en' || Boolean(event.fullDescriptionEn)))
      .map(event => buildEventSchemaObject(event, locale)),
    meta: { lastUpdate: now },
  };
}

export function writeDataFeed(feed: DataFeedDocument, outputPath: string): boolean {
  // Both fields describe the same content revision. Strip only these feed-level
  // timestamps; nested event timestamps remain meaningful change signals.
  const stable = (value: DataFeedDocument) => JSON.stringify({ ...value, dateModified: '', meta: { ...value.meta, lastUpdate: '' } });
  if (existsSync(outputPath)) {
    try {
      const previous = JSON.parse(readFileSync(outputPath, 'utf8')) as DataFeedDocument;
      if (isIsoTimestamp(previous.dateModified) && previous.meta?.lastUpdate === previous.dateModified && stable(previous) === stable(feed)) {
        feed = { ...feed, dateModified: previous.dateModified, meta: { ...feed.meta, lastUpdate: previous.dateModified } };
      }
    } catch { /* A corrupt prior artifact is replaced by the valid feed. */ }
  }
  return writeJsonApiIfChangedSync(outputPath, feed);
}
