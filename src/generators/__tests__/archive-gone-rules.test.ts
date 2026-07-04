/**
 * GEO Ruling 2 §2 — Archive 410 emission.
 *
 * Past-expired (>45d) event URLs must emit an explicit 410 (not 404-by-omission),
 * BOUNDED to the trailing 45–90d band so `_redirects` stays under Netlify's ~10k
 * ceiling (aging past 90d IS the prune → natural 404). The band is keyed on the
 * classifier's own `resolveEffectiveEnd` (endDate for any type; presumption
 * windows for run-implying types) — never raw start_date COALESCE.
 *
 * Emission is force-410 (`410!`) so a lingering (un-swept) dist directory can't
 * shadow the rule — the shadowing-by-stale-file trap the sweep note flagged.
 */

import { describe, test, expect } from 'bun:test';
import { generateArchiveGoneRules, generateRedirects } from '../event-page';
import { generateEventSlug } from '../event-page';
import { getAthensTodayStr } from '../../utils/event-lifecycle';
import type { Event } from '../../types';

function daysFromNow(n: number): string {
  const d = new Date(getAthensTodayStr() + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

let _seq = 0;
function mkEvent(over: {
  id?: string;
  title?: string;
  venue?: { name: string };
  startDate: string;
  endDate?: string | null;
  type?: string;
}): Event {
  _seq += 1;
  const id = (over.id ?? `deadbeef${_seq.toString(16).padStart(8, '0')}`).slice(0, 16);
  return {
    id,
    title: over.title ?? 'Some Event',
    venue: { name: over.venue?.name ?? 'Some Venue' },
    startDate: over.startDate,
    endDate: over.endDate ?? null,
    type: over.type ?? 'concert',
  } as unknown as Event;
}

describe('generateArchiveGoneRules — bounded 45–90d band', () => {
  test('event in the 45–90d band → a force-410 rule to /410.html for its /events/ URL', () => {
    const e = mkEvent({ startDate: daysFromNow(-60), type: 'concert' });
    const rules = generateArchiveGoneRules([e]);
    const slug = generateEventSlug(e);
    expect(rules).toContain(`/events/${slug}/ /410.html 410!`);
  });

  test('event >90d past → NO rule (fell out of band; natural 404)', () => {
    const e = mkEvent({ startDate: daysFromNow(-120), type: 'concert' });
    expect(generateArchiveGoneRules([e])).toHaveLength(0);
  });

  test('past-active event (≤45d) → NO rule (still has a live page)', () => {
    const e = mkEvent({ startDate: daysFromNow(-20), type: 'concert' });
    expect(generateArchiveGoneRules([e])).toHaveLength(0);
  });

  test('upcoming event → NO rule', () => {
    const e = mkEvent({ startDate: daysFromNow(10), type: 'concert' });
    expect(generateArchiveGoneRules([e])).toHaveLength(0);
  });

  test('band boundaries: -46d in-band, -45d out, -90d in-band, -91d out', () => {
    const inLow = mkEvent({ startDate: daysFromNow(-46), type: 'concert' });   // just past 45d
    const outHigh = mkEvent({ startDate: daysFromNow(-45), type: 'concert' });  // exactly 45d → past-active, no rule
    const inHigh = mkEvent({ startDate: daysFromNow(-90), type: 'concert' });   // exactly 90d → in band
    const outFar = mkEvent({ startDate: daysFromNow(-91), type: 'concert' });   // 91d → out
    expect(generateArchiveGoneRules([inLow])).toHaveLength(1);
    expect(generateArchiveGoneRules([outHigh])).toHaveLength(0);
    expect(generateArchiveGoneRules([inHigh])).toHaveLength(1);
    expect(generateArchiveGoneRules([outFar])).toHaveLength(0);
  });

  test('exhibition with FUTURE endDate + aged startDate → NO rule (endDate-wins; the lock’s emission counterpart)', () => {
    const e = mkEvent({ startDate: daysFromNow(-140), endDate: daysFromNow(30), type: 'exhibition' });
    expect(generateArchiveGoneRules([e])).toHaveLength(0);
  });

  test('run-implying presumption is honoured: exhibition NULL-end, start -80d → still within 90d window → NOT archived, no rule', () => {
    // start -80d + 90d presumption = +10d effective end → upcoming, not past-expired.
    const e = mkEvent({ startDate: daysFromNow(-80), endDate: null, type: 'exhibition' });
    expect(generateArchiveGoneRules([e])).toHaveLength(0);
  });

  test('every emitted rule targets an /events/ path — never a hub/combinatorial path', () => {
    const band = [
      mkEvent({ startDate: daysFromNow(-50), type: 'concert' }),
      mkEvent({ startDate: daysFromNow(-70), type: 'theater', endDate: daysFromNow(-60) }),
      mkEvent({ startDate: daysFromNow(-85), type: 'dj_set' }),
    ];
    const rules = generateArchiveGoneRules(band);
    expect(rules.length).toBe(3);
    for (const r of rules) {
      expect(r.startsWith('/events/')).toBe(true);
      expect(r).toContain(' 410!');
      expect(r).not.toContain('/hub');
    }
  });

  test('dormant backlink allowlist: band event whose URL is preserved → skipped (no 410)', () => {
    const e = mkEvent({ startDate: daysFromNow(-60), type: 'concert' });
    const url = `/events/${generateEventSlug(e)}/`;
    const rules = generateArchiveGoneRules([e], { preservedUrls: new Set([url]) });
    expect(rules).toHaveLength(0);
  });
});

describe('GEO Ruling 2 §2d — redirects partition invariants (all three siblings)', () => {
  // The archive-410 rules coexist in _redirects with slug-change 301s. Assert
  // the three partition invariants together — not just the 410 count.
  const bandEvents = [
    mkEvent({ id: 'aaaa1111bbbb2222', startDate: daysFromNow(-50), type: 'concert' }),
    mkEvent({ id: 'cccc3333dddd4444', startDate: daysFromNow(-80), type: 'dj_set' }),
  ];
  const gone = generateArchiveGoneRules(bandEvents);

  // A slug-change 301 set (pageable events that got renamed).
  const currentSlugs = new Map<string, string>([['eeee5555ffff6666', 'eeee5555-venue-new-title']]);
  const history = new Map<string, string[]>([['eeee5555ffff6666', ['eeee5555-venue-old-title']]]);
  const three01 = generateRedirects(currentSlugs, history);

  const all = [...three01, ...gone];
  const parse = (line: string) => {
    const [from, to, code] = line.trim().split(/\s+/);
    return { from, to, code };
  };

  test('sibling 1 — zero 410s target a non-/events/ path (event pages only)', () => {
    for (const line of all) {
      const { from, code } = parse(line);
      if (code === '410!' || code === '410') {
        expect(from.startsWith('/events/')).toBe(true);
      }
    }
    // and every 410 rule is one of ours
    expect(gone.every(r => r.endsWith(' /410.html 410!'))).toBe(true);
  });

  test('sibling 2 — single-hop: no rule’s target is another rule’s source (no chains)', () => {
    const sources = new Set(all.map(l => parse(l).from.replace(/\/\*$/, '/')));
    for (const line of all) {
      const { to } = parse(line);
      const normalizedTo = to.replace(/\/:splat$/, '/');
      expect(sources.has(normalizedTo)).toBe(false);
    }
  });

  test('sibling 3 — no loops: no rule redirects a path to itself', () => {
    for (const line of all) {
      const { from, to } = parse(line);
      const f = from.replace(/\/\*$/, '/');
      const t = to.replace(/\/:splat$/, '/');
      expect(f).not.toBe(t);
    }
  });

  test('301s and 410s never collide on the same source path', () => {
    const s301 = new Set(three01.map(l => parse(l).from.replace(/\/\*$/, '/')));
    const s410 = new Set(gone.map(l => parse(l).from));
    for (const src of s410) expect(s301.has(src)).toBe(false);
  });
});
