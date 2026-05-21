/**
 * Proof page body — Phase 1 spine.
 *
 * Three grounded sections (event count, tests, schema validity) wired to live
 * artifacts via proofMetrics. Four GEO-PENDING stubs that ship in Phase 2:
 *   D1 — citation evidence framing
 *   D2 — GSC stale-data handling
 *   D3 — Schema.org type (WebPage vs TechArticle vs Report)
 *   D4 — locale strategy (EL+EN vs EN-only)
 *
 * Numbers flow ONLY from proofMetrics(). No literals here, no defaults — missing
 * artifact → field renders as '—'. The drift-guard test in proof-metrics.test.ts
 * enforces that the reader itself never carries a hardcoded credibility number;
 * the same discipline applies to this template by convention.
 */

import type { ProofMetrics } from '../utils/proof-metrics';

interface RenderProofBodyOptions {
  metrics: ProofMetrics;
  locale: 'el' | 'en';
}

const STRINGS = {
  el: {
    h1: 'Αποδείξεις',
    intro: 'Πώς δουλεύει το agent athens, με νούμερα από τα ζωντανά artifacts της τρέχουσας έκδοσης.',
    eventH2: 'Εκδηλώσεις & σελίδες',
    eventBody: (n: number) =>
      `Σήμερα δημοσιεύονται <strong>${n.toLocaleString('el-GR')}</strong> σελίδες εκδηλώσεων (επαληθευμένες τοποθεσίες Αττικής, εντός παραθύρου 45 ημερών).`,
    testH2: 'Έλεγχοι',
    testAbsent: 'Στιγμιότυπο ελέγχων μη διαθέσιμο.',
    testBody: (pass: number, files: number, ranAt: string) =>
      `<strong>${pass.toLocaleString('el-GR')}</strong> έλεγχοι περνούν σε ${files} αρχεία (στιγμιότυπο: ${ranAt}).`,
    schemaH2: 'Εγκυρότητα Schema.org',
    schemaClean: (at: string) =>
      `100% επιτυχία (0 δομικά λάθη), τελευταία επικύρωση ${at}.`,
    schemaDirty: (at: string) =>
      `Υπάρχουν ανοιχτά ζητήματα — δείτε την αναφορά κατασκευής. Τελευταία επικύρωση ${at}.`,
    schemaAbsent: 'Αναφορά επικύρωσης μη διαθέσιμη.',
  },
  en: {
    h1: 'Proof',
    intro: 'How agent athens works, in numbers pulled from the current build\'s live artifacts.',
    eventH2: 'Events & pages',
    eventBody: (n: number) =>
      `<strong>${n.toLocaleString('en-US')}</strong> event pages are live today (verified Attica venues within a 45-day window).`,
    testH2: 'Tests',
    testAbsent: 'Test snapshot not available.',
    testBody: (pass: number, files: number, ranAt: string) =>
      `<strong>${pass.toLocaleString('en-US')}</strong> tests passing across ${files} files (snapshot: ${ranAt}).`,
    schemaH2: 'Schema.org validity',
    schemaClean: (at: string) =>
      `100% pass (0 structural errors), last validated ${at}.`,
    schemaDirty: (at: string) =>
      `Open issues — see build report. Last validated ${at}.`,
    schemaAbsent: 'Validation report not available.',
  },
} as const;

export function renderProofBody({ metrics, locale }: RenderProofBodyOptions): string {
  const t = STRINGS[locale];

  const testsHtml =
    metrics.tests === '—'
      ? `<p>${t.testAbsent}</p>`
      : `<p>${t.testBody(metrics.tests.pass, metrics.tests.files, metrics.tests.ranAt)}</p>`;

  const schemaHtml =
    metrics.schema.passClean === null
      ? `<p>${t.schemaAbsent}</p>`
      : metrics.schema.passClean
        ? `<p>${t.schemaClean(metrics.schema.validatedAt)}</p>`
        : `<p>${t.schemaDirty(metrics.schema.validatedAt)}</p>`;

  return `
        <h1>${t.h1}</h1>
        <p>${t.intro}</p>

        <h2>${t.eventH2}</h2>
        <p>${t.eventBody(metrics.eventCount)}</p>

        <h2>${t.testH2}</h2>
        ${testsHtml}

        <h2>${t.schemaH2}</h2>
        ${schemaHtml}

        <!-- GEO-PENDING: D1 — citation evidence framing (Bing 7d row + AI-citation log when artifact lands) -->
        <!-- GEO-PENDING: D2 — GSC stale-data handling (currently STALE since 2026-05-17; decide message) -->
        <!-- GEO-PENDING: D3 — Schema.org type (WebPage vs TechArticle vs Report; mainEntity shape) -->
        <!-- GEO-PENDING: D4 — locale strategy (EL+EN vs EN-only vs EN-primary) -->
      `;
}
