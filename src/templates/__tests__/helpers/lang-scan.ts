/**
 * Language-of-parts scanner for rendered HTML (test helper).
 *
 * Walks the markup with a small tokenizer and reports every user-facing text
 * node and label attribute together with the language it is DECLARED in —
 * the nearest `lang` attribute up the tree (WCAG 3.1.2). A string is only in
 * the wrong language relative to its own declaration: English inside a
 * `lang="en"` block on a Greek page is correct.
 *
 * Content that is data rather than UI (event titles, venue names) is marked
 * `data: true` so callers can exclude it — titles and venues may legitimately
 * be Greek on English pages.
 */

import he from 'he';

export interface LangNode {
  kind: 'text' | 'attr';
  attr?: string;
  value: string;
  lang: string;
  data: boolean;
}

export const GREEK_CHARS = /[Ͱ-Ͽἀ-῿]/;

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const SKIP_CONTENT = new Set(['script', 'style', 'svg', 'template']);
const LABEL_ATTRS = ['aria-label', 'placeholder', 'title'];
// Card fields that carry scraped data, not interface copy.
const DATA_CLASSES = /\b(card-title|card-venue|hero-card-title|hero-pick-title|featured-editorial-title|hero-card-desc|feature-description|featured-editorial-vignette)\b/;

interface Frame { tag: string; lang: string; data: boolean; skip: boolean }

function parseAttrs(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of raw.matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)) out[m[1].toLowerCase()] = m[2];
  return out;
}

export function collectLangNodes(html: string, rootLang = ''): LangNode[] {
  const src = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<!DOCTYPE[^>]*>/i, '');
  const nodes: LangNode[] = [];
  const stack: Frame[] = [{ tag: '#root', lang: rootLang, data: false, skip: false }];
  const top = () => stack[stack.length - 1];

  for (const m of src.matchAll(/<(\/?)([a-zA-Z][\w-]*)((?:[^>"]|"[^"]*")*)>|([^<]+)/g)) {
    const [, closing, rawTag, rawAttrs, text] = m;
    if (text !== undefined) {
      const f = top();
      const value = he.decode(text).replace(/\s+/g, ' ').trim();
      if (value && !f.skip) nodes.push({ kind: 'text', value, lang: f.lang, data: f.data });
      continue;
    }
    const tag = rawTag.toLowerCase();
    if (closing) {
      const idx = stack.map(s => s.tag).lastIndexOf(tag);
      if (idx > 0) stack.length = idx;
      continue;
    }
    const parent = top();
    const attrs = parseAttrs(rawAttrs || '');
    const lang = attrs.lang ?? parent.lang;
    const data = parent.data || DATA_CLASSES.test(attrs.class || '');
    const skip = parent.skip || SKIP_CONTENT.has(tag);
    if (!skip) {
      for (const a of LABEL_ATTRS) {
        if (attrs[a]) nodes.push({ kind: 'attr', attr: a, value: he.decode(attrs[a]), lang, data });
      }
    }
    const selfClosing = /\/\s*$/.test(rawAttrs || '');
    if (!VOID.has(tag) && !selfClosing) stack.push({ tag, lang, data, skip });
  }
  return nodes;
}

/** The <body> of a full page, or the input unchanged for a fragment. */
export function bodyOf(html: string): string {
  const i = html.indexOf('<body');
  return i === -1 ? html : html.slice(i);
}

export function htmlLang(html: string): string {
  return /<html lang="([^"]+)"/.exec(html)?.[1] ?? '';
}
