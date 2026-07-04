/**
 * GEO Ruling 2 §3 — cooling-phase Event JSON-LD suppression.
 *
 * Contract: a cooling (15–44d, noindexed) event page must NOT carry an Event
 * JSON-LD node (an ended event must not present as a rankable live Event while
 * suppressed) — but must PRESERVE its non-Event nodes (venue Place, publisher
 * Organization). Active / just-passed pages keep their Event node.
 */

import { describe, test, expect } from 'bun:test';
import { renderEventDetailPage, generateEventSchema } from '../event-page';
import { getLifecyclePhase, getAthensTodayStr } from '../../utils/event-lifecycle';
import { sampleConcert } from '../../../tests/fixtures/events';
import type { Event } from '../../types';

function daysFromNow(n: number): string {
  const d = new Date(getAthensTodayStr() + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10) + 'T21:00:00+03:00';
}

/** Concert fixture at a chosen age; endDate nulled so effective-end = start. */
function concertAt(startOffsetDays: number): Event {
  return { ...sampleConcert, startDate: daysFromNow(startOffsetDays), endDate: undefined };
}

function graphOf(schemaJson: string): any[] {
  return JSON.parse(schemaJson)['@graph'] ?? [];
}
const isEventNode = (n: any) =>
  typeof n?.['@id'] === 'string' && n['@id'].endsWith('#event');
const isOrgNode = (n: any) =>
  typeof n?.['@id'] === 'string' && n['@id'].endsWith('#organization');

function extractJsonLd(html: string): string {
  const m = html.match(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/);
  return m ? m[1] : '';
}

describe('generateEventSchema — omitEventNode', () => {
  const cooling = concertAt(-20); // 20d past → cooling phase

  test('phase sanity: -20d concert is cooling', () => {
    expect(getLifecyclePhase(cooling)).toBe('cooling');
  });

  test('omitEventNode:true → no Event node, but non-Event nodes preserved', () => {
    const graph = graphOf(generateEventSchema(cooling, 'el', undefined, { omitEventNode: true }));
    expect(graph.some(isEventNode)).toBe(false);
    // publisher Organization is always emitted → page never schema-silent
    expect(graph.some(isOrgNode)).toBe(true);
    expect(graph.length).toBeGreaterThan(0);
  });

  test('omitEventNode:false (default) → Event node present', () => {
    const graph = graphOf(generateEventSchema(cooling, 'el', undefined, { omitEventNode: false }));
    expect(graph.some(isEventNode)).toBe(true);
  });
});

describe('renderEventDetailPage — cooling contract (integration)', () => {
  test('cooling page: noindex present AND no Event JSON-LD node; non-Event node retained', () => {
    const html = renderEventDetailPage(concertAt(-20), [], 'el');
    expect(html).toContain('<meta name="robots" content="noindex">');
    const graph = graphOf(extractJsonLd(html));
    expect(graph.some(isEventNode)).toBe(false);
    expect(graph.some(isOrgNode)).toBe(true);
  });

  test('active (upcoming) page: NO noindex AND Event JSON-LD node present', () => {
    const html = renderEventDetailPage(concertAt(14), [], 'el');
    expect(html).not.toContain('content="noindex"');
    const graph = graphOf(extractJsonLd(html));
    expect(graph.some(isEventNode)).toBe(true);
  });

  test('just-passed (Day 1–14) page: NO noindex AND Event JSON-LD node present', () => {
    const jp = concertAt(-10);
    expect(getLifecyclePhase(jp)).toBe('just-passed');
    const html = renderEventDetailPage(jp, [], 'el');
    expect(html).not.toContain('content="noindex"');
    const graph = graphOf(extractJsonLd(html));
    expect(graph.some(isEventNode)).toBe(true);
  });
});
