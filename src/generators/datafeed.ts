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

import type { Event } from '../types';
import type { Locale } from '../i18n/strings';
import { buildEventSchemaObject } from './event-page';
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
    dataFeedElement: events.map(event => buildEventSchemaObject(event, locale)),
    meta: { lastUpdate: now },
  };
}

export function writeDataFeed(feed: DataFeedDocument, outputPath: string): boolean {
  return writeJsonApiIfChangedSync(outputPath, feed);
}
