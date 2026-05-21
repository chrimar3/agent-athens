/**
 * Shared single source of truth for /proof's variableMeasured ↔ rendered
 * bidirectional sync.
 *
 * Both `buildProofSchema()` (schema emitter) and `renderProofBody()` (HTML
 * emitter) import this constant. The schema emits one PropertyValue per key;
 * the renderer tags each rendered metric with `data-metric="<key>"`. The
 * bidirectional invariant test asserts the two sets match exactly — no
 * orphans either direction.
 *
 * Adding a new metric: add its key here, then add the corresponding emitter
 * code in both proof-schema.ts and proof-body.ts. Removing a metric: same in
 * reverse. Editing one without the other will fail the invariant test.
 */

export const METRIC_KEYS = [
  'eventCount',
  'testsPassing',
  'schemaPassClean',
  'bingImpressions7d',
  'bingAvgPosition7d',
  'bingTop10_7d',
] as const;

export type MetricKey = (typeof METRIC_KEYS)[number];
