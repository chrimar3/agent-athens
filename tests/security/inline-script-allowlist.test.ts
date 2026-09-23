/**
 * The inline-script allowlist next to the output gate
 * (src/validators/inline-script-allowlist.ts) must equal exactly the set of
 * inline scripts the templates emit. Recomputed here from the template
 * functions themselves, so a changed template fails with its new hash, and a
 * stale entry (a script no template emits any more) fails too.
 */
import { describe, expect, test } from 'bun:test';
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { INLINE_SCRIPT_ALLOWLIST } from '../../src/validators/inline-script-allowlist';
import { renderAnalytics } from '../../src/config/analytics';
import { renderEventDetailScript } from '../../src/generators/event-page';
import { renderColophonScript } from '../../src/templates/colophon';
import { renderSearchScript } from '../../src/templates/search-overlay';
import { renderCardSaveScript, renderSaveButtonScript, renderSavedEventsScript, renderSavedPageScript, renderShareButtonScript } from '../../src/templates/action-bar';
import { renderFilterBarScript } from '../../src/templates/filter-bar';
import { renderHamburgerScript } from '../../src/templates/site-chrome';
import { renderDayLabelScript } from '../../src/templates/page';

const SCRIPT = /<script\b((?:[^>"']|"[^"]*"|'[^']*')*)>([\s\S]*?)<\/script\s*>/gi;

const EMITTERS: Record<string, string> = {
  'renderAnalytics': renderAnalytics(),
  'renderHamburgerScript': renderHamburgerScript(),
  'renderColophonScript': renderColophonScript(),
  "renderSearchScript('el')": renderSearchScript('el'),
  "renderSearchScript('en')": renderSearchScript('en'),
  "renderDayLabelScript('el')": renderDayLabelScript('el'),
  "renderDayLabelScript('en')": renderDayLabelScript('en'),
  'renderFilterBarScript': renderFilterBarScript(),
  'renderSavedEventsScript': renderSavedEventsScript(),
  'renderSaveButtonScript': renderSaveButtonScript(),
  'renderCardSaveScript': renderCardSaveScript(),
  'renderShareButtonScript': renderShareButtonScript(),
  "renderSavedPageScript('el')": renderSavedPageScript('el'),
  "renderSavedPageScript('en')": renderSavedPageScript('en'),
  'renderEventDetailScript': renderEventDetailScript(),
  'static/root-files/tonight.html': readFileSync(join(import.meta.dir, '../../static/root-files/tonight.html'), 'utf-8'),
};

function inlineScriptHashes(html: string): string[] {
  return [...html.matchAll(SCRIPT)]
    .filter(m => !/\bsrc\s*=/i.test(m[1]) && !/application\/(?:ld\+)?json/i.test(m[1]))
    .map(m => createHash('sha256').update(m[2]).digest('hex'));
}

describe('inline-script allowlist', () => {
  const emitted = new Map<string, string>();
  for (const [name, html] of Object.entries(EMITTERS)) for (const h of inlineScriptHashes(html)) emitted.set(h, name);
  const listed = new Set(INLINE_SCRIPT_ALLOWLIST.map(e => e.sha256));

  test('every template script is listed (a changed template prints its new hash here)', () => {
    const missing = [...emitted].filter(([h]) => !listed.has(h)).map(([h, name]) => `${name}: ${h}`);
    expect(missing).toEqual([]);
  });

  test('every listed hash is still emitted by a template', () => {
    const stale = INLINE_SCRIPT_ALLOWLIST.filter(e => !emitted.has(e.sha256)).map(e => `${e.source}: ${e.sha256}`);
    expect(stale).toEqual([]);
  });

  test('every entry names its source', () => {
    for (const e of INLINE_SCRIPT_ALLOWLIST) {
      expect(e.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(e.source.length).toBeGreaterThan(10);
    }
  });
});
