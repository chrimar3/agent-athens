import { describe, test, expect } from 'bun:test';
import { renderDigest, type DigestInputs } from '../scripts/weekly-digest';

// Mixed-week fixture: 5/7 deploy days, 2 zero-save days, one quarantined
// source, gate FAIL. Precondition assertions keep the fixture honest — a
// digest tested only on perfect weeks would go vacuous on the weeks that
// matter (the whole point is honest bad-week rendering).
const inputs: DigestInputs = {
  weekLabel: '2026-W33',
  deployDays: ['2026-08-10', '2026-08-11', '2026-08-12', '2026-08-14', '2026-08-15'],
  windowDates: ['2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13', '2026-08-14', '2026-08-15', '2026-08-16'],
  enrichPerDay: { '2026-08-10': 9, '2026-08-11': 6, '2026-08-12': 12, '2026-08-14': 8, '2026-08-15': 10 },
  sourceTotals: [
    { source: 'athinorama', events: 147 },
    { source: 'ticketservices', events: 136 },
  ],
  quarantined: { clubber: { since: '2026-08-11', reason: 'captcha wall' } },
  bing: { avgPosition: 4.49, impressions7d: 262 },
  decisionsPending: 7,
  exitGate: 'FAIL',
};

describe('renderDigest', () => {
  test('fixture precondition: the week is genuinely mixed', () => {
    expect(inputs.deployDays.length).toBeLessThan(inputs.windowDates.length);
    expect(Object.keys(inputs.enrichPerDay).length).toBeLessThan(7);
  });

  test('deploy line renders n/7 honestly', () => {
    const md = renderDigest(inputs);
    expect(md).toContain('5/7');
  });

  test('zero-save days are called out, not hidden', () => {
    const md = renderDigest(inputs);
    expect(md).toContain('2 zero-save day');
  });

  test('quarantined source is listed', () => {
    expect(renderDigest(inputs)).toContain('clubber');
  });

  test('FAIL exit gate is the headline', () => {
    const md = renderDigest(inputs);
    const firstSection = md.slice(0, 400);
    expect(firstSection).toContain('FAIL');
  });

  test('pending decisions count surfaces with a pointer to the queue', () => {
    const md = renderDigest(inputs);
    expect(md).toContain('7');
    expect(md).toContain('DECISIONS-QUEUE.md');
  });

  test('a clean 7/7 week renders PASS without zero-save language', () => {
    const clean: DigestInputs = {
      ...inputs,
      deployDays: inputs.windowDates,
      enrichPerDay: Object.fromEntries(inputs.windowDates.map((d) => [d, 8])),
      exitGate: 'PASS',
      quarantined: {},
      decisionsPending: 0,
    };
    const md = renderDigest(clean);
    expect(md).toContain('7/7');
    expect(md).not.toContain('zero-save day');
  });
});
