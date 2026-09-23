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
import { createHash } from 'crypto';
import he from 'he';
import { IMG_FALLBACK_ONERROR } from '../templates/image-fallback';
import { INLINE_SCRIPT_HASHES } from './inline-script-allowlist';

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
// Output safety: URL schemes, inline handlers, script sources, inline script
// bodies, frames and active elements.
// Scraped and AI-written values reach href/src attributes and JSON-LD, so the
// emitted pages themselves are checked before deploy. Rules:
//   - href/src/action/... use http(s), mailto, tel or a relative URL
//   - no on* handler except IMG_FALLBACK_ONERROR on <img>; no srcdoc
//   - <script src> only same-origin or ALLOWED_SCRIPT_HOSTS over https
//   - an inline executable <script> body must be on INLINE_SCRIPT_ALLOWLIST
//     (sha256 of the templates' own scripts, inline-script-allowlist.ts)
//   - JSON data blocks must parse, hold no "<script", "</script" or "<!--",
//     and no URL-valued key (url, sameAs, image, @id, ...) with a
//     javascript:/vbscript: value
//   - <iframe> only to the OpenStreetMap embed the venue pages use
//   - no <meta http-equiv="refresh">, <object>, <embed>, <base>, <frame>, <frameset>
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
const FIX_INLINE_SCRIPT = 'fix: if a template script changed, update its hash in src/validators/inline-script-allowlist.ts (run bun test tests/security/inline-script-allowlist.test.ts for the new value); otherwise event data is reaching HTML unescaped — escape it with escapeHtml/escapeAttr at emission';
const FIX_JSON_BLOCK = 'fix: serialise JSON-LD with JSON.stringify + escapeJsonForHtml (src/utils/html-json.ts)';
const FIX_ACTIVE_ELEMENT = 'fix: templates emit no frames, meta refresh, plugins or <base>; data reaching HTML unescaped produced it — escape it with escapeHtml/escapeAttr at emission';
/** The one frame the templates emit: the venue-page map (src/generators/venue-page.ts). */
const ALLOWED_IFRAME = /^https:\/\/www\.openstreetmap\.org\/export\/embed\.html\?/;
const FORBIDDEN_ELEMENTS = new Set(['object', 'embed', 'base', 'frame', 'frameset', 'applet']);
const SCRIPT_TAG_IN_JSON = /<\/?script/i;

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
    // Only URL-valued keys: prose such as a streetAddress is not followed as a
    // link, and refusing it would let one scraped address block every deploy.
    return URL_ISH_KEY.test(key) && /^(?:javascript|vbscript):/i.test(v);
  }
  if (Array.isArray(value)) return value.some(v => jsonHasDangerousUrl(v, key));
  if (value && typeof value === 'object') {
    return Object.entries(value).some(([k, v]) => jsonHasDangerousUrl(v, k));
  }
  return false;
}

function scriptContentIssues(type: string | undefined, content: string, hasSrc: boolean): string[] {
  if (type && JSON_SCRIPT_TYPE.test(type.trim())) {
    const issues: string[] = [];
    if (SCRIPT_TAG_IN_JSON.test(content)) issues.push(`"<script" inside a ${type} block (${FIX_JSON_BLOCK})`);
    // "<!--" in JSON-LD is reported by scanHtmlForArtifacts; other JSON blocks are checked here.
    if (!/ld\+json/i.test(type) && content.includes('<!--')) issues.push(`"<!--" inside a ${type} block (${FIX_JSON_BLOCK})`);
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      issues.push(`${type} block does not parse as JSON (${FIX_JSON_BLOCK})`);
      if (DANGEROUS_SCHEME_IN_SCRIPT.test(content)) issues.push(`javascript: URL inside a ${type} block (${FIX_SCRIPT_URL})`);
      return issues;
    }
    if (jsonHasDangerousUrl(parsed)) issues.push(`javascript: URL inside a ${type} block (${FIX_SCRIPT_URL})`);
    return issues;
  }
  // A browser ignores the body of a <script src>; the src itself is checked by scriptHostIssue.
  if (hasSrc) return [];
  const issues: string[] = [];
  if (DANGEROUS_SCHEME_IN_SCRIPT.test(content)) issues.push(`javascript: URL inside an inline <script> (${FIX_SCRIPT_URL})`);
  const sha256 = createHash('sha256').update(content).digest('hex');
  if (!INLINE_SCRIPT_HASHES.has(sha256)) {
    issues.push(`inline <script> not on the template allowlist (sha256 ${sha256}, starts "${content.trim().slice(0, 60).replace(/\s+/g, ' ')}") (${FIX_INLINE_SCRIPT})`);
  }
  return issues;
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
    for (const issue of scriptContentIssues(attrs.get('type'), m[2], src !== undefined)) issues.add(issue);
  }

  // Markup outside script/style bodies and comments is what the browser parses as tags.
  const markup = html
    .replace(SCRIPT_ELEMENT, (_all, attrs: string) => `<script${attrs}></script>`)
    .replace(STYLE_ELEMENT, '$1</style>')
    .replace(HTML_COMMENT, '');

  for (const tag of markup.matchAll(START_TAG)) {
    const tagName = tag[1].toLowerCase();
    const attrs = parseAttributes(tag[2]);
    const attr = (n: string) => he.decode(attrs.find(([k]) => k === n)?.[1] ?? '', { isAttributeValue: true }).trim();
    if (FORBIDDEN_ELEMENTS.has(tagName)) issues.add(`<${tagName}> element (${FIX_ACTIVE_ELEMENT})`);
    if (tagName === 'iframe' && !ALLOWED_IFRAME.test(attr('src'))) {
      issues.add(`<iframe> to "${attr('src').slice(0, 80)}" — only the OpenStreetMap embed is allowed (${FIX_ACTIVE_ELEMENT})`);
    }
    if (tagName === 'meta' && /refresh/i.test(attr('http-equiv'))) issues.add(`<meta http-equiv="refresh"> (${FIX_ACTIVE_ELEMENT})`);
    for (const [name, value = ''] of attrs) {
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
