/**
 * Build-time invariant: no pipeline artefact reaches a published page, and no
 * page carries unsafe output (non-http(s) link schemes, inline event handlers,
 * scripts from unlisted hosts, javascript: URLs inside scripts).
 *
 * Output-keyed (reads emitted HTML), so it holds whichever generator leaks.
 * Round-0 judges (2026-09-22) found all four classes live while the test
 * suite was green: an escaped enrichment marker on 343–686 event pages and
 * inside JSON-LD, "[PLACEHOLDER]" copy on 6 hubs, raw markdown tables on 44
 * pages, and entity-encoded JSON-LD names quoted verbatim by AI answers.
 */

import { readdirSync, readFileSync } from 'fs';
import { join, relative } from 'path';
import he from 'he';
import { IMG_FALLBACK_ONERROR } from '../templates/image-fallback';

const LD_BLOCK = /<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g;
const SCRIPT_BLOCK = /<script\b[\s\S]*?<\/script>/g;
const HTML_COMMENT = /<!--[\s\S]*?-->/g;
const ESCAPED_COMMENT = /&lt;!--/;
const PLACEHOLDER = /\[PLACEHOLDER/;
// A header row line directly followed by a separator row — a pipe-dash run
// alone (a title like "Rock | --- | Night") is not a table.
const MD_TABLE = /\|[^|\n<]+\|[^\n<]*(?:\n|<br\s*\/?>)\s*\|?\s*:?-{3,}:?\s*\|/;
// The JSON-LD serialiser writes "&" as \u0026, so the leak reads \u0026amp;.
const TEXT_ENTITY = /"(?:name|description)"\s*:\s*"[^"]*(?:&|\\u0026)(?:[a-z]+|#\d+|#x[0-9a-f]+);[^"]*"/i;

export function scanHtmlForArtifacts(html: string): string[] {
  const issues: string[] = [];
  const ldBlocks = [...html.matchAll(LD_BLOCK)].map(m => m[1]);
  // Page text: drop scripts (incl. JSON-LD) and genuine template comments.
  const text = html.replace(SCRIPT_BLOCK, '').replace(HTML_COMMENT, '');

  if (ESCAPED_COMMENT.test(text)) issues.push('escaped HTML comment rendered as text');
  if (ldBlocks.some(b => b.includes('<!--'))) issues.push('HTML comment inside JSON-LD');
  if (PLACEHOLDER.test(text) || ldBlocks.some(b => PLACEHOLDER.test(b))) issues.push('[PLACEHOLDER] copy published');
  if (MD_TABLE.test(text)) issues.push('raw markdown table in page text');
  if (ldBlocks.some(b => TEXT_ENTITY.test(b))) issues.push('HTML entity inside a JSON-LD name or description');
  issues.push(...scanHtmlForUnsafeOutput(html));
  return issues;
}

// ---------------------------------------------------------------------------
// Output safety: URL schemes, inline handlers, script sources.
// Scraped and AI-written values reach href/src attributes and JSON-LD, so the
// emitted pages themselves are checked before deploy.
// ---------------------------------------------------------------------------

/** External script hosts the templates emit (src/config/analytics.ts). */
export const ALLOWED_SCRIPT_HOSTS: ReadonlySet<string> = new Set(['www.googletagmanager.com']);
const SAFE_SCHEMES = new Set(['http', 'https', 'mailto', 'tel']);
const URL_ATTRS = new Set(['href', 'src', 'action', 'formaction', 'poster', 'data', 'xlink:href', 'background', 'srcset']);
const JSON_SCRIPT_TYPE = /^application\/(?:ld\+)?json$/i;
const SCRIPT_ELEMENT = /<script\b((?:[^>"']|"[^"]*"|'[^']*')*)>([\s\S]*?)<\/script\s*>/gi;
const STYLE_ELEMENT = /(<style\b(?:[^>"']|"[^"]*"|'[^']*')*>)[\s\S]*?<\/style\s*>/gi;
const START_TAG = /<([a-zA-Z][^\s\/>]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
const ATTRIBUTE = /([^\s"'>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
const DANGEROUS_SCHEME_IN_SCRIPT = /\b(?:javascript|vbscript)\s*:/i;
const URL_ISH_KEY = /url|sameas|@id|image|logo|href|^item$|mainentityofpage|isbasedon|contenturl|embedurl/i;

const FIX_URL = 'fix: build data-driven URLs with safeHttpUrl/firstSafeImageSrc (src/utils/safe-url.ts) and escapeAttr';
const FIX_HANDLER = 'fix: move behaviour into a script; the only allowed handler is IMG_FALLBACK_ATTR (src/templates/image-fallback.ts)';
const FIX_SCRIPT_HOST = 'fix: remove the tag, or add the host to ALLOWED_SCRIPT_HOSTS (src/validators/published-artifacts.ts) after review';
const FIX_SCRIPT_URL = 'fix: validate the value with safeHttpUrl (src/utils/safe-url.ts) before it is serialised';

function parseAttributes(raw: string): [string, string | undefined][] {
  return [...raw.matchAll(ATTRIBUTE)].map(m => [m[1].toLowerCase(), m[2] ?? m[3] ?? m[4]]);
}

/** Scheme a browser would act on, after entity decoding and tab/newline stripping; null when relative. */
function urlScheme(value: string): string | null {
  const decoded = he.decode(value, { isAttributeValue: true }).replace(/[\t\n\r]/g, '').replace(/^[\x00-\x20]+/, '');
  const m = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(decoded);
  return m ? m[1].toLowerCase() : null;
}

function scriptHostIssue(src: string): string | null {
  const value = he.decode(src, { isAttributeValue: true }).trim();
  if (value.startsWith('/') && !value.startsWith('//')) return null; // same origin
  let url: URL;
  try {
    url = new URL(value, 'https://agentathens.com/');
  } catch {
    return `unparseable <script src> "${value.slice(0, 80)}" (${FIX_SCRIPT_HOST})`;
  }
  if (url.origin === 'https://agentathens.com' && !value.startsWith('//')) return null; // relative path
  if (url.protocol !== 'https:' || !ALLOWED_SCRIPT_HOSTS.has(url.hostname)) {
    return `script from unlisted source ${url.protocol}//${url.hostname} (${FIX_SCRIPT_HOST})`;
  }
  return null;
}

function jsonHasDangerousUrl(value: unknown, key = ''): boolean {
  if (typeof value === 'string') {
    const v = value.replace(/[\t\n\r]/g, '').trim();
    // Only URL-valued keys: prose such as a streetAddress is not followed as a link.
    return URL_ISH_KEY.test(key) && /^(?:javascript|vbscript):/i.test(v);
  }
  if (Array.isArray(value)) return value.some(v => jsonHasDangerousUrl(v, key));
  if (value && typeof value === 'object') {
    return Object.entries(value).some(([k, v]) => jsonHasDangerousUrl(v, k));
  }
  return false;
}

function scriptContentIssue(type: string | undefined, content: string): string | null {
  if (type && JSON_SCRIPT_TYPE.test(type.trim())) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      return DANGEROUS_SCHEME_IN_SCRIPT.test(content) ? `javascript: URL inside a ${type} block (${FIX_SCRIPT_URL})` : null;
    }
    return jsonHasDangerousUrl(parsed) ? `javascript: URL inside a ${type} block (${FIX_SCRIPT_URL})` : null;
  }
  return DANGEROUS_SCHEME_IN_SCRIPT.test(content) ? `javascript: URL inside an inline <script> (${FIX_SCRIPT_URL})` : null;
}

/** Output-safety issues in one page; each names what was found and where to fix it. */
export function scanHtmlForUnsafeOutput(html: string): string[] {
  const issues = new Set<string>();

  for (const m of html.matchAll(SCRIPT_ELEMENT)) {
    const attrs = new Map(parseAttributes(m[1]));
    const src = attrs.get('src');
    if (src !== undefined) {
      const issue = scriptHostIssue(src);
      if (issue) issues.add(issue);
    }
    const issue = scriptContentIssue(attrs.get('type'), m[2]);
    if (issue) issues.add(issue);
  }

  // Markup outside script/style bodies and comments is what the browser parses as tags.
  const markup = html
    .replace(SCRIPT_ELEMENT, (_all, attrs: string) => `<script${attrs}></script>`)
    .replace(STYLE_ELEMENT, '$1</style>')
    .replace(HTML_COMMENT, '');

  for (const tag of markup.matchAll(START_TAG)) {
    const tagName = tag[1].toLowerCase();
    for (const [name, value = ''] of parseAttributes(tag[2])) {
      if (/^on[a-z]+$/.test(name)) {
        const allowed = tagName === 'img' && name === 'onerror' && he.decode(value, { isAttributeValue: true }) === IMG_FALLBACK_ONERROR;
        if (!allowed) issues.add(`inline event handler ${name}= on <${tagName}> (${FIX_HANDLER})`);
      } else if (name === 'srcdoc') {
        issues.add(`srcdoc markup on <${tagName}> (${FIX_URL})`);
      } else if (URL_ATTRS.has(name)) {
        const candidates = name === 'srcset' ? value.split(',').map(c => c.trim().split(/\s+/)[0]) : [value];
        for (const candidate of candidates) {
          const scheme = urlScheme(candidate);
          if (scheme && !SAFE_SCHEMES.has(scheme)) issues.add(`unsafe URL scheme "${scheme}:" in <${tagName} ${name}> (${FIX_URL})`);
        }
      }
    }
  }
  return [...issues];
}

export interface ArtifactReport {
  scanned: number;
  failures: { file: string; issues: string[] }[];
}

export function validatePublishedArtifacts(distDir: string): ArtifactReport {
  const report: ArtifactReport = { scanned: 0, failures: [] };
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.html')) {
        report.scanned++;
        const issues = scanHtmlForArtifacts(readFileSync(full, 'utf-8'));
        if (issues.length > 0) report.failures.push({ file: relative(distDir, full), issues });
      }
    }
  };
  walk(distDir);
  return report;
}
