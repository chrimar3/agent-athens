/**
 * Round-1 move 6 (chrome half) — localised chrome.
 *
 * Scans rendered Greek and English pages for interface strings in the wrong
 * language, relative to the language each node is DECLARED in (nearest lang
 * attribute — WCAG 3.1.2). English inside a lang="en" island on a Greek page
 * is correct; English in a Greek-declared label is not.
 */
import { describe, expect, test } from 'bun:test';
import type { Event, PageMetadata } from '../../types';
import { STRINGS, type Locale } from '../../i18n/strings';
import { renderPage } from '../page';
import { renderSiteNav, renderHamburgerMenu, renderSiteFooter } from '../site-chrome';
import { collectLangNodes, bodyOf, htmlLang, GREEK_CHARS, type LangNode } from './helpers/lang-scan';
import { localeFixtures } from './helpers/locale-fixtures';

const events: Event[] = localeFixtures();

function page(locale: Locale, filters: PageMetadata['filters'] = { type: 'concert' }): string {
  const md: PageMetadata = {
    // The page title is the caller's copy, not chrome; give it the page language.
    title: locale === 'el' ? 'Συναυλίες' : 'Concerts', description: 'd', keywords: 'k', url: locale === 'en' ? 'en/concerts' : 'concerts',
    eventCount: events.length, lastUpdate: '2026-09-22T08:00:00Z', filters,
  };
  // allEvents set → filter bar renders too
  return renderPage(md, events, events, undefined, locale);
}

// Latin tokens that are brand names or loanwords the Greek UI uses on purpose
// (STRINGS.el carries "DJ Sets", "Tech", "Για AI Agents"...).
const GREEK_UI_LATIN_ALLOWED = new Set([
  'agent', 'athens', 'agentathens', 'com', 'github', 'llms', 'txt', 'agents',
  'dj', 'set', 'sets', 'tech', 'show', 'shows', 'performance',
  // Colophon button label "About" is a recorded S159 decision; a round-0 judge
  // flagged it as English-on-Greek and a duplicate of the nav About link.
  // Renaming is pending the user's decision (docs/quality-loop/round-1/PLAN.md).
  'about',
]);

// Deliberately Greek on English pages until Editorial approves copy —
// specs/en-nav-copy-checkpoint.md. Taken from STRINGS so it cannot drift.
// They must carry lang="el" so screen readers switch voice (WCAG 3.1.2);
// the scanner then accepts them like any correctly tagged Greek text.
const EN_PENDING_EDITORIAL = new Set<string>();

function describeNode(n: LangNode): string {
  return `${n.kind}${n.attr ? `[${n.attr}]` : ''} lang=${n.lang} "${n.value}"`;
}

function wrongLanguage(html: string): string[] {
  const nodes = collectLangNodes(bodyOf(html), htmlLang(html));
  return nodes.filter(n => !n.data).filter(n => {
    if (n.lang.startsWith('en')) return GREEK_CHARS.test(n.value) && !EN_PENDING_EDITORIAL.has(n.value);
    if (n.lang.startsWith('el')) {
      const words = n.value.match(/[A-Za-z]{3,}/g) ?? [];
      return words.some(w => !GREEK_UI_LATIN_ALLOWED.has(w.toLowerCase()));
    }
    return true; // undeclared language is itself a defect
  }).map(describeNode);
}

describe('scanner precondition: it catches both directions', () => {
  test('flags English in a Greek-declared label and Greek in an English one', () => {
    expect(wrongLanguage('<html lang="el"><body><button aria-label="Save">x</button></body></html>')).toHaveLength(1);
    expect(wrongLanguage('<html lang="en"><body><span>Με εισιτήριο</span></body></html>')).toHaveLength(1);
    expect(wrongLanguage('<html lang="el"><body><div lang="en"><button aria-label="Close">x</button></div></body></html>')).toHaveLength(0);
  });
});

describe('no interface string in the wrong language', () => {
  for (const locale of ['el', 'en'] as const) {
    test(`${locale} hub page (header, menu, filter bar, cards, related links, footer)`, () => {
      expect(wrongLanguage(page(locale))).toEqual([]);
    });
    test(`${locale} page with no type filter`, () => {
      expect(wrongLanguage(page(locale, {}))).toEqual([]);
    });
    test(`${locale} empty listing`, () => {
      const md: PageMetadata = { title: 'T', description: 'd', keywords: 'k', url: 'x', eventCount: 0, lastUpdate: '2026-09-22T08:00:00Z', filters: {} };
      expect(wrongLanguage(renderPage(md, [], undefined, undefined, locale))).toEqual([]);
    });
  }
});

describe('About entries', () => {
  // The colophon button keeps its S159 label "About" (pending user decision);
  // these tests pin the nav About link and the button's accessible name.
  const aboutWords = new Set([STRINGS.el.navAbout, STRINGS.en.navAbout]);
  function visibleTexts(html: string): string[] {
    return collectLangNodes(html).filter(n => n.kind === 'text').map(n => n.value);
  }
  for (const locale of ['el', 'en'] as const) {
    test(`${locale}: header has exactly one nav About link, in the page language`, () => {
      const links = [...renderSiteNav(locale).matchAll(/<a href="[^"]*\/about\/"[^>]*>([^<]*)<\/a>/g)].map(m => m[1].trim());
      expect(links).toEqual([STRINGS[locale].navAbout]);
    });
    test(`${locale}: mobile menu has exactly one About entry`, () => {
      const abouts = visibleTexts(renderHamburgerMenu(locale)).filter(t => aboutWords.has(t));
      expect(abouts).toEqual([STRINGS[locale].navAbout]);
    });
  }

  test('the colophon button\'s accessible name contains its visible label (WCAG 2.5.3)', () => {
    for (const locale of ['el', 'en'] as const) {
      const btn = renderSiteNav(locale).match(/<button class="colophon-trigger[^>]*>([^<]*)<\/button>/)!;
      const aria = btn[0].match(/aria-label="([^"]*)"/)![1];
      expect(aria.toLowerCase()).toContain(btn[1].trim().toLowerCase());
    }
  });

  test('the colophon trigger keeps the contract the colophon script needs', () => {
    for (const locale of ['el', 'en'] as const) {
      const nav = renderSiteNav(locale);
      expect(nav).toMatch(/<button class="colophon-trigger[^"]*"[^>]*data-colophon-open/);
      expect(nav).toContain('aria-controls="colophon-dialog"');
      expect(nav).toContain('aria-haspopup="dialog"');
    }
  });

  test('the English-only colophon dialog is declared English on Greek pages', () => {
    expect(renderSiteFooter('el')).toMatch(/<div lang="en">\s*<div id="colophon-dialog"/);
  });
});
