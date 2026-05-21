/**
 * buildProofSchema — JSON-LD @graph envelope for /proof.
 *
 * Three graph members:
 *   [0] WebPage — the /proof page itself; publisher + mainEntity reference by @id
 *   [1] Dataset — the build-artifacts dataset; creator references the canonical Org
 *   [2] Organization — the full canonical Org node so every @id resolves locally
 *
 * variableMeasured on the Dataset is the bidirectional-sync surface. It mirrors
 * METRIC_KEYS exactly; every key gets a PropertyValue. Absent metrics emit
 * value: '—' rather than being dropped — dropping would break the invariant
 * that the rendered page and the schema describe the same set of metrics.
 *
 * dateModified is parameter-passed, never hardcoded (drift-guard test enforced).
 *
 * Per D2: no GSC keys, names, or values anywhere in the emitted object.
 */

import { BASE_URL } from '../config/site-url';
import { buildSiteOrganizationGraphMember } from '../utils/schema-geo';
import type { ProofMetrics } from '../utils/proof-metrics';
import { METRIC_KEYS, type MetricKey } from './proof-metric-keys';

interface BuildProofSchemaInput {
  metrics: ProofMetrics;
  dateModified: string;
}

interface PropertyValue {
  '@type': 'PropertyValue';
  name: MetricKey;
  value: string;
}

const PAGE_PATH = '/en/proof/';
const DATASET_FRAGMENT = '#proof-data';

export function buildProofSchema({ metrics, dateModified }: BuildProofSchemaInput): Record<string, unknown> {
  const orgId = `${BASE_URL}/#organization`;
  const pageId = `${BASE_URL}${PAGE_PATH}`;
  const datasetId = `${pageId}${DATASET_FRAGMENT}`;

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        '@id': pageId,
        url: pageId,
        name: 'Proof — agent athens',
        description: 'How agent athens works, in numbers pulled from the current build\'s live artifacts: event coverage, test suite, Schema.org validity, search indexing.',
        inLanguage: 'en',
        availableLanguage: ['en', 'el'],
        publisher: { '@id': orgId },
        mainEntity: { '@id': datasetId },
        dateModified,
      },
      {
        '@type': 'Dataset',
        '@id': datasetId,
        url: pageId,
        name: 'agent athens build artifacts',
        description: 'Live build metrics for agentathens.com — event coverage, test suite, Schema.org validity, search indexing.',
        inLanguage: 'en',
        availableLanguage: ['en', 'el'],
        creator: { '@id': orgId },
        dateModified,
        variableMeasured: buildVariableMeasured(metrics),
      },
      buildSiteOrganizationGraphMember(),
    ],
  };
}

function buildVariableMeasured(metrics: ProofMetrics): PropertyValue[] {
  return METRIC_KEYS.map((key) => ({
    '@type': 'PropertyValue' as const,
    name: key,
    value: metricValue(key, metrics),
  }));
}

function metricValue(key: MetricKey, m: ProofMetrics): string {
  switch (key) {
    case 'eventCount':
      return String(m.eventCount);
    case 'testsPassing':
      return m.tests === '—' ? '—' : String(m.tests.pass);
    case 'schemaPassClean':
      return m.schema.passClean === null ? '—' : (m.schema.passClean ? 'true' : 'false');
    case 'bingImpressions7d':
      return m.indexing === '—' ? '—' : String(m.indexing.bing.impressions7d);
    case 'bingAvgPosition7d':
      return m.indexing === '—' ? '—' : m.indexing.bing.avgPosition7d.toFixed(2);
    case 'bingTop10_7d':
      return m.indexing === '—' ? '—' : String(m.indexing.bing.top10_7d);
  }
}
