/**
 * Proof page body — Phase 2 (D1–D4 GEO rulings applied).
 *
 * Four grounded sections wired to live artifacts via proofMetrics:
 *   1. Events & pages  (eventCount)
 *   2. Tests           (testsPassing)
 *   3. Schema.org      (schemaPassClean)
 *   4. Indexing        (bingImpressions7d, bingAvgPosition7d, bingTop10_7d) — Bing only per D2
 *
 * Each rendered metric carries `data-metric="<key>"` matching METRIC_KEYS. The
 * same constant feeds buildProofSchema.variableMeasured. Bidirectional sync —
 * adding a metric requires touching both emitters (and METRIC_KEYS); removing
 * one without the other fails the invariant tests.
 *
 * D1 (AI-citation) intentionally has no rendered section — no artifact yet.
 * D4 makes this page EN-only; locale 'el' was removed in Phase 2. Reactivate
 * EL strings + bilingual generation when Greek launches as a
 * published+indexable+quality-gated product (paired with S144's hreflang
 * reactivation).
 */

import type { ProofMetrics } from '../utils/proof-metrics';
import { METRIC_KEYS } from './proof-metric-keys';

interface RenderProofBodyOptions {
  metrics: ProofMetrics;
  locale: 'en';
}

// REACTIVATE: Bing AI Perf ≥1 grounding query (Sprint 5). No rendered section.
// When the data/ai-citations.csv artifact lands, add a section here pulling
// from metrics.aiCitations (extend the reader at the same time).

const STRINGS = {
  en: {
    h1: 'Proof',
    intro: 'How agent athens works, in numbers pulled from the current build\'s live artifacts.',

    eventH2: 'Events & pages',
    eventBody: (nHtml: string) =>
      `${nHtml} event pages are live today (verified Attica venues within a 45-day window).`,

    testH2: 'Tests',
    testAbsent: 'Test snapshot not available.',
    testBody: (passHtml: string, files: number, ranAt: string) =>
      `${passHtml} tests passing across ${files} files (snapshot: ${ranAt}).`,

    schemaH2: 'Schema.org validity',
    schemaClean: (stateHtml: string, at: string) =>
      `${stateHtml} — 0 structural errors, last validated ${at}.`,
    schemaDirty: (stateHtml: string, at: string) =>
      `${stateHtml} — open issues, see build report. Last validated ${at}.`,
    schemaAbsent: 'Validation report not available.',

    indexingH2: 'Indexing',
    indexingAbsent: 'Indexing snapshot not available.',
    indexingBody: (impHtml: string, posHtml: string, top10Html: string) =>
      `${impHtml} Bing impressions over the last 7 days, average position ${posHtml}, ${top10Html} queries in the top 10. Indexing underway; live coverage tracked via Bing.`,
  },
} as const;

function strong(metric: typeof METRIC_KEYS[number], value: string): string {
  return `<strong data-metric="${metric}">${value}</strong>`;
}

export function renderProofBody({ metrics }: RenderProofBodyOptions): string {
  const t = STRINGS.en;

  // Each section emits a <strong data-metric="<key>"> per rendered value.
  // Honest-absence: when a metric is '—', the <strong> contains '—' (still
  // tagged, so the bidirectional renderer↔schema invariant holds).

  const eventHtml = `<p>${t.eventBody(strong('eventCount', metrics.eventCount.toLocaleString('en-US')))}</p>`;

  const testsHtml = (() => {
    if (metrics.tests === '—') {
      return `<p>${strong('testsPassing', '—')} — ${t.testAbsent}</p>`;
    }
    return `<p>${t.testBody(
      strong('testsPassing', metrics.tests.pass.toLocaleString('en-US')),
      metrics.tests.files,
      metrics.tests.ranAt,
    )}</p>`;
  })();

  const schemaHtml = (() => {
    if (metrics.schema.passClean === null) {
      return `<p>${strong('schemaPassClean', '—')} — ${t.schemaAbsent}</p>`;
    }
    const stateHtml = strong('schemaPassClean', metrics.schema.passClean ? '100% pass' : 'open issues');
    return metrics.schema.passClean
      ? `<p>${t.schemaClean(stateHtml, metrics.schema.validatedAt)}</p>`
      : `<p>${t.schemaDirty(stateHtml, metrics.schema.validatedAt)}</p>`;
  })();

  const indexingHtml = (() => {
    if (metrics.indexing === '—') {
      return `<p>${strong('bingImpressions7d', '—')} ${strong('bingAvgPosition7d', '—')} ${strong('bingTop10_7d', '—')} — ${t.indexingAbsent}</p>`;
    }
    const b = metrics.indexing.bing;
    return `<p>${t.indexingBody(
      strong('bingImpressions7d', b.impressions7d.toLocaleString('en-US')),
      strong('bingAvgPosition7d', b.avgPosition7d.toFixed(2)),
      strong('bingTop10_7d', String(b.top10_7d)),
    )}</p>`;
  })();

  return `
        <h1>${t.h1}</h1>
        <p>${t.intro}</p>

        <h2>${t.eventH2}</h2>
        ${eventHtml}

        <h2>${t.testH2}</h2>
        ${testsHtml}

        <h2>${t.schemaH2}</h2>
        ${schemaHtml}

        <h2>${t.indexingH2}</h2>
        ${indexingHtml}
      `;
}
