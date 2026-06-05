/**
 * Tests for the colophon engine-stats emitter (S103 / Session 171).
 *
 * Five build-time stats fold into the colophon on BOTH surfaces (per-page dialog
 * + /en/colophon/ mirror) from ONE shared emitter. This session ships FOUR
 * (events, venues, sources, last-rebuilt); the schema-validity slot is HELD
 * pending an Editorial+GEO reconciliation with /proof (which publishes
 * "100% pass — 0 structural errors"; the strict pass figure is 87%, so the two
 * surfaces would contradict). The emitter is N-agnostic so the 5th lands later
 * without layout churn.
 *
 * Covers: semantic <dl> markup, SSR (figures in the HTML string, not a JS hook),
 * the Guard-6 parity lock (both surfaces emit byte-identical stat markup via the
 * shared singleton), N-agnostic layout, and zero accent colour in the output.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import {
  renderColophonStats,
  setColophonStats,
  getColophonStats,
  type ColophonStats,
} from '../colophon-stats';
import { renderColophonContent } from '../colophon';
import { renderSiteNav } from '../site-chrome';

const STATS: ColophonStats = {
  events: 3079,
  venues: 57,
  sources: 10,
  lastBuildDate: '5 June 2026',
};

afterEach(() => setColophonStats(null)); // never leak singleton state across tests

describe('renderColophonStats — markup + SSR', () => {
  test('null stats → empty string (pages built before stats are set degrade cleanly)', () => {
    expect(renderColophonStats(null)).toBe('');
  });

  test('emits a semantic <dl class="colophon-stats"> with dt=label, dd=figure', () => {
    const html = renderColophonStats(STATS);
    expect(html).toContain('<dl class="colophon-stats">');
    expect(html).toContain('</dl>');
    expect(html).toMatch(/<dt[^>]*>Events live<\/dt>/);
    expect(html).toMatch(/<dt[^>]*>Venues<\/dt>/);
    expect(html).toMatch(/<dt[^>]*>Sources<\/dt>/);
    expect(html).toMatch(/<dt[^>]*>Last rebuilt<\/dt>/);
  });

  test('figures are SSR\'d into the HTML string (not a JS hook), thousands-formatted', () => {
    const html = renderColophonStats({ ...STATS, events: 3079 });
    expect(html).toMatch(/<dd[^>]*>3,079<\/dd>/); // toLocaleString
    expect(html).toMatch(/<dd[^>]*>57<\/dd>/);
    expect(html).toMatch(/<dd[^>]*>10<\/dd>/);
    expect(html).toMatch(/<dd[^>]*>5 June 2026<\/dd>/);
    expect(html).not.toContain('fetch('); // no client-side inject
    expect(html).not.toContain('data-stat-src');
  });

  test('labels render in source order: events → venues → sources → last rebuilt', () => {
    const html = renderColophonStats(STATS);
    const order = ['Events live', 'Venues', 'Sources', 'Last rebuilt'].map((l) => html.indexOf(l));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(order.every((i) => i >= 0)).toBe(true);
  });

  test('N-agnostic: renders exactly the 4 stats given (validity slot absent, no gap/placeholder)', () => {
    const html = renderColophonStats(STATS);
    expect((html.match(/<dt/g) ?? []).length).toBe(4);
    expect((html.match(/<dd/g) ?? []).length).toBe(4);
    expect(html.toLowerCase()).not.toContain('validation');
    expect(html).not.toContain('—'); // no honest-absence placeholder for a slot we simply omit
  });

  test('zero accent colour in the emitted markup (Design lock)', () => {
    const html = renderColophonStats(STATS);
    expect(html).not.toContain('accent');
  });
});

describe('renderColophonStats — Guard-6 parity across both surfaces', () => {
  beforeEach(() => setColophonStats(STATS));

  test('singleton set/get round-trips', () => {
    expect(getColophonStats()).toEqual(STATS);
  });

  test('dialog (via renderSiteNav) and mirror (renderColophonContent) emit identical stat <dl>', () => {
    const dialogHtml = renderSiteNav('en');         // embeds renderColophonDialog → renderColophonContent
    const mirrorHtml = renderColophonContent();      // the /en/colophon/ page body

    const extract = (s: string) => {
      const m = s.match(/<dl class="colophon-stats">[\s\S]*?<\/dl>/);
      return m ? m[0] : null;
    };
    const dialogDl = extract(dialogHtml);
    const mirrorDl = extract(mirrorHtml);

    expect(dialogDl).not.toBeNull();
    expect(mirrorDl).not.toBeNull();
    expect(dialogDl).toBe(mirrorDl); // byte-identical — the consolidation lock
    expect(dialogDl).toContain('3,079');
  });

  test('with no stats set, content still renders (stats block simply absent)', () => {
    setColophonStats(null);
    const mirror = renderColophonContent();
    expect(mirror).toContain('colophon-name');        // body intact
    expect(mirror).not.toContain('colophon-stats');   // no empty <dl>
  });
});
