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

import { closeSync, existsSync, openSync, readdirSync, readFileSync, readSync } from 'fs';
import { extname, join, relative } from 'path';
import { createHash } from 'crypto';
import he from 'he';
import { load } from 'cheerio';
import { INLINE_SCRIPT_HASHES, COPIED_SCRIPT_ALLOWLIST } from './inline-script-allowlist';
import { BASE_URL } from '../config/site-url';
import { renderHeadersFile } from '../generators/security-headers';
import { VERIFICATION_FILE_ALLOWLIST, VERIFICATION_FILE_PATTERNS, VERIFICATION_META_ALLOWLIST } from './verification-allowlist';
import { externalScriptSrcIssue } from './external-script-allowlist';

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
//   - no on* handler at all (the enforced CSP blocks them); no srcdoc
//   - <script src> (and SVG <script href>) only same-origin or
//     ALLOWED_SCRIPT_HOSTS over https; "//host" is resolved like the browser
//     does (https: on the live site) and allowlisted as that host
//   - <link> that loads a resource (stylesheet, preload, ...) only same-origin
//     or ALLOWED_LINK_HOSTS over https
//   - an inline executable <script> body must be on INLINE_SCRIPT_ALLOWLIST
//     (sha256 of the templates' own scripts, inline-script-allowlist.ts)
//   - JSON data blocks must parse, hold no "<script", "</script" or "<!--",
//     and no URL-valued key (url, sameAs, image, @id, ...) with a
//     javascript:/vbscript: value
//   - <iframe> only to the OpenStreetMap embed the venue pages use
//   - no <meta http-equiv="refresh">, <object>, <embed>, <base>, <frame>, <frameset>
//   - no SVG <animate>/<set>/<animateTransform>/<animateMotion> of href or
//     xlink:href, or with a javascript:/vbscript:/data: to/from/by/values;
//     no <use> of data: or another origin
//   - no search-engine ownership-verification <meta> except the allowlisted
//     one (verification-allowlist.ts)
// Pages are parsed with an HTML5 parser, so the rules apply to the elements a
// browser builds, including from unclosed or malformed markup.
// ---------------------------------------------------------------------------

/** External script hosts the templates emit (src/config/analytics.ts). */
export const ALLOWED_SCRIPT_HOSTS: ReadonlySet<string> = new Set(['www.googletagmanager.com']);
/** External hosts a <link> may load a resource from (the webfont stylesheet in src/templates/page.ts). */
export const ALLOWED_LINK_HOSTS: ReadonlySet<string> = new Set(['fonts.googleapis.com']);
/** <link rel> values that make the browser fetch and use (or pre-render) the target. */
const RESOURCE_LINK_RELS = new Set(['stylesheet', 'preload', 'modulepreload', 'prefetch', 'prerender', 'import', 'manifest', 'serviceworker']);
const SITE_ORIGIN = new URL(BASE_URL).origin;
const SAFE_SCHEMES = new Set(['http', 'https', 'mailto', 'tel']);
const URL_ATTRS = new Set(['href', 'src', 'action', 'formaction', 'poster', 'data', 'xlink:href', 'background', 'srcset']);
const JSON_SCRIPT_TYPE = /^application\/(?:ld\+)?json$/i;
const START_TAG = /<([a-zA-Z][^\s\/>]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
const ATTRIBUTE = /([^\s"'>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
const DANGEROUS_SCHEME_IN_SCRIPT = /\b(?:javascript|vbscript)\s*:/i;
const URL_ISH_KEY = /url|sameas|@id|image|logo|href|^item$|mainentityofpage|isbasedon|contenturl|embedurl/i;

const FIX_URL = 'fix: build data-driven URLs with safeHttpUrl/firstSafeImageSrc (src/utils/safe-url.ts) and escapeAttr';
const FIX_HANDLER = 'fix: move behaviour into an allowlisted script with addEventListener (image fallbacks: IMG_FALLBACK_ATTR + renderImageFallbackScript in src/templates/image-fallback.ts); the enforced CSP blocks inline handlers';
const FIX_SCRIPT_HOST = 'fix: remove the tag, or add the host to ALLOWED_SCRIPT_HOSTS (src/validators/published-artifacts.ts) after review';
const FIX_SCRIPT_URL = 'fix: validate the value with safeHttpUrl (src/utils/safe-url.ts) before it is serialised';
const FIX_INLINE_SCRIPT = 'fix: if a template script changed, update its hash in src/validators/inline-script-allowlist.ts (run bun test tests/security/inline-script-allowlist.test.ts for the new value); otherwise event data is reaching HTML unescaped — escape it with escapeHtml/escapeAttr at emission';
const FIX_JSON_BLOCK = 'fix: serialise JSON-LD with JSON.stringify + escapeJsonForHtml (src/utils/html-json.ts)';
const FIX_ACTIVE_ELEMENT = 'fix: templates emit no frames, meta refresh, plugins or <base>; data reaching HTML unescaped produced it — escape it with escapeHtml/escapeAttr at emission';
/** The one frame the templates emit: the venue-page map (src/generators/venue-page.ts). */
const ALLOWED_IFRAME = /^https:\/\/www\.openstreetmap\.org\/export\/embed\.html\?/;
const FORBIDDEN_ELEMENTS = new Set(['object', 'embed', 'base', 'frame', 'frameset', 'applet']);
const SCRIPT_TAG_IN_JSON = /<\/?script/i;
const FIX_SVG_ACTIVE = 'fix: templates emit no SVG animation of links and no <use> outside the page; data reaching HTML/SVG unescaped produced it — escape it with escapeHtml/escapeAttr at emission';
/** SVG elements that change another attribute's value at run time. */
const SVG_ANIMATION_ELEMENTS = new Set(['animate', 'set', 'animatetransform', 'animatemotion']);
/** Animation attributes that hold the value(s) written into attributeName. */
const SVG_ANIMATION_VALUE_ATTRS = new Set(['to', 'from', 'by', 'values']);
const SVG_ANIMATION_BAD_SCHEMES = new Set(['javascript', 'vbscript', 'data']);

/**
 * SVG animation that rewrites a link (attributeName href/xlink:href, or a
 * javascript:/vbscript:/data: value) and <use> that pulls content from data:
 * or another origin. `decoded` says whether attribute values are already
 * entity-decoded (HTML5 parser) or raw text (standalone .svg scan).
 */
function svgActiveContentIssues(tagName: string, attrs: [string, string][], decoded: boolean): string[] {
  const tag = tagName.toLowerCase();
  const issues: string[] = [];
  const value = (v: string) => (decoded ? v : he.decode(v, { isAttributeValue: true }));
  if (SVG_ANIMATION_ELEMENTS.has(tag)) {
    for (const [rawName, raw] of attrs) {
      const name = rawName.toLowerCase();
      if (name === 'attributename') {
        const target = value(raw).replace(/[\t\n\r]/g, '').trim().toLowerCase();
        if (target === 'href' || target === 'xlink:href') issues.push(`<${tagName}> animates ${target} (${FIX_SVG_ACTIVE})`);
      } else if (SVG_ANIMATION_VALUE_ATTRS.has(name)) {
        for (const part of value(raw).split(';')) {
          const scheme = urlScheme(part, true);
          if (scheme && SVG_ANIMATION_BAD_SCHEMES.has(scheme)) issues.push(`"${scheme}:" value in <${tagName} ${name}> (${FIX_SVG_ACTIVE})`);
        }
      }
    }
  }
  if (tag === 'use') {
    for (const [rawName, raw] of attrs) {
      const name = rawName.toLowerCase();
      if (name !== 'href' && name !== 'xlink:href') continue;
      const url = resolveOnSite(value(raw).replace(/[\t\n\r]/g, '').trim());
      if (!url || url.origin !== SITE_ORIGIN) {
        const where = url ? (url.protocol === 'data:' ? 'data:' : `${url.protocol}//${url.hostname}`) : `"${raw.trim().slice(0, 80)}"`;
        issues.push(`<use ${name}> loads from ${where}, outside this site (${FIX_SVG_ACTIVE})`);
      }
    }
  }
  return issues;
}
const FIX_VERIFICATION = 'fix: search-engine ownership proofs publish only from VERIFICATION_FILE_ALLOWLIST / VERIFICATION_META_ALLOWLIST (src/validators/verification-allowlist.ts); a new one is an owner decision — delete it from dist/ and rebuild';

function parseAttributes(raw: string): [string, string | undefined][] {
  return [...raw.matchAll(ATTRIBUTE)].map(m => [m[1].toLowerCase(), m[2] ?? m[3] ?? m[4]]);
}

/**
 * Scheme a browser would act on, after entity decoding (skipped for values an
 * HTML parser already decoded) and tab/newline stripping; null when relative.
 */
function urlScheme(value: string, alreadyDecoded = false): string | null {
  const text = alreadyDecoded ? value : he.decode(value, { isAttributeValue: true });
  const decoded = text.replace(/[\t\n\r]/g, '').replace(/^[\x00-\x20]+/, '');
  const m = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(decoded);
  return m ? m[1].toLowerCase() : null;
}

/**
 * A parser-decoded attribute URL resolved the way the browser resolves it on
 * the live site: relative paths against the site, "//host/x" (and "/\\host")
 * to https://host/x. Null when it does not parse.
 */
function resolveOnSite(value: string): URL | null {
  try {
    return new URL(value, `${SITE_ORIGIN}/`);
  } catch {
    return null;
  }
}

/** Null when the (parser-decoded) URL is same-origin or https on an allowlisted host. */
function externalHostIssue(value: string, allowed: ReadonlySet<string>): { url: URL | null; ok: boolean } {
  const url = resolveOnSite(value);
  if (!url) return { url, ok: false };
  if (url.origin === SITE_ORIGIN) return { url, ok: true };
  return { url, ok: url.protocol === 'https:' && allowed.has(url.hostname) };
}

function scriptHostIssue(src: string): string | null {
  const { url } = externalHostIssue(src, ALLOWED_SCRIPT_HOSTS);
  if (!url) return `unparseable <script src> "${src.trim().slice(0, 80)}" (${FIX_SCRIPT_HOST})`;
  // Security loop round 6: an allowed host is not enough — any container on
  // www.googletagmanager.com would run as the site. An external script must be
  // exactly an entry of ALLOWED_EXTERNAL_SCRIPT_URLS (the GA4 loader).
  return externalScriptSrcIssue(src);
}

function linkResourceIssue(rel: string, href: string | undefined): string | null {
  const rels = rel.toLowerCase().split(/\s+/).filter(Boolean);
  if (href === undefined || !rels.some(r => RESOURCE_LINK_RELS.has(r))) return null;
  const { url, ok } = externalHostIssue(href, ALLOWED_LINK_HOSTS);
  if (ok) return null;
  const where = url ? `${url.protocol}//${url.hostname}` : `"${href.trim().slice(0, 80)}"`;
  return `<link rel="${rels.join(' ')}"> loads from unlisted source ${where} (fix: remove the tag, or add the host to ALLOWED_LINK_HOSTS in src/validators/published-artifacts.ts after review)`;
}

/** <meta name> values search engines accept as proof of site ownership. */
const VERIFICATION_META = /^(?:google-site-verification|msvalidate\.01|yandex-verification|baidu-site-verification|facebook-domain-verification|p:domain_verify|naver-site-verification|norton-safeweb-site-verification|ahrefs-site-verification|seznam-wmt)$/i;

function verificationMetaIssue(name: string, content: string): string | null {
  if (!VERIFICATION_META.test(name)) return null;
  const allowed = VERIFICATION_META_ALLOWLIST.some(e => e.name.toLowerCase() === name.toLowerCase() && e.content === content);
  return allowed ? null : `ownership-verification <meta name="${name}"> with an unlisted token (${FIX_VERIFICATION})`;
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

/** Element-like DOM node from the HTML5 parser (domhandler shape, parse5 tree). */
interface DomNode {
  type: string;
  name?: string;
  namespace?: string;
  attribs?: Record<string, string>;
  data?: string;
  children?: DomNode[];
}

const textOf = (node: DomNode): string => (node.children ?? []).map(c => (c.type === 'text' ? c.data ?? '' : '')).join('');

/**
 * Output-safety issues in one page; each names what was found and where to fix it.
 *
 * The page is parsed with a spec-compliant HTML5 parser (parse5 via cheerio,
 * scripting enabled like a browser), so malformed markup — an unclosed
 * <script src>, a tag inside an attribute that a <noscript> end tag breaks
 * out of, SVG <script href> — is judged as the browser will build it, not as
 * a regex reads the text. Attribute values come from the parser already
 * entity-decoded.
 */
export function scanHtmlForUnsafeOutput(html: string): string[] {
  const issues = new Set<string>();
  scanDom(load(html).root()[0] as unknown as DomNode, issues);
  return [...issues];
}

function scanDom(root: DomNode, issues: Set<string>): void {
  const visit = (node: DomNode): void => {
    if (node.attribs) scanElement(node, issues);
    for (const child of node.children ?? []) visit(child);
  };
  visit(root);
}

function scanElement(node: DomNode, issues: Set<string>): void {
  const tagName = (node.name ?? '').toLowerCase();
  const attrs = node.attribs ?? {};
  const attr = (n: string) => (attrs[n] ?? '').trim();

  if (tagName === 'script') {
    // HTML <script src>; SVG <script href>/<script xlink:href> (the parser
    // stores the adjusted xlink:href under "href").
    const srcs = ['src', 'href', 'xlink:href'].filter(n => attrs[n] !== undefined);
    for (const n of srcs) {
      const issue = scriptHostIssue(attrs[n]);
      if (issue) issues.add(issue);
    }
    for (const issue of scriptContentIssues(attrs.type, textOf(node), srcs.length > 0)) issues.add(issue);
  }
  if (tagName === 'noscript') {
    // With scripting enabled the body is text; a visitor without JavaScript
    // gets it parsed as markup, so check it that way too.
    const inner = load(textOf(node), { scriptingEnabled: false } as Parameters<typeof load>[1], false).root()[0] as unknown as DomNode;
    scanDom(inner, issues);
  }
  if (FORBIDDEN_ELEMENTS.has(tagName)) issues.add(`<${tagName}> element (${FIX_ACTIVE_ELEMENT})`);
  if (tagName === 'iframe') {
    const src = resolveOnSite(attr('src'));
    if (!src || !ALLOWED_IFRAME.test(src.href)) {
      issues.add(`<iframe> to "${attr('src').slice(0, 80)}" — only the OpenStreetMap embed is allowed (${FIX_ACTIVE_ELEMENT})`);
    }
  }
  if (tagName === 'link') {
    const issue = linkResourceIssue(attr('rel'), attrs.href);
    if (issue) issues.add(issue);
  }
  if (tagName === 'meta' && /refresh/i.test(attr('http-equiv'))) issues.add(`<meta http-equiv="refresh"> (${FIX_ACTIVE_ELEMENT})`);
  if (tagName === 'meta') {
    const issue = verificationMetaIssue(attr('name'), attr('content'));
    if (issue) issues.add(issue);
  }
  for (const issue of svgActiveContentIssues(node.name ?? '', Object.entries(attrs), true)) issues.add(issue);
  for (const [rawName, value] of Object.entries(attrs)) {
    const name = rawName.toLowerCase();
    if (/^on[a-z]+$/.test(name)) {
      issues.add(`inline event handler ${name}= on <${tagName}> (${FIX_HANDLER})`);
    } else if (name === 'srcdoc') {
      issues.add(`srcdoc markup on <${tagName}> (${FIX_URL})`);
    } else if (URL_ATTRS.has(name)) {
      const candidates = name === 'srcset' ? value.split(',').map(c => c.trim().split(/\s+/)[0]) : [value];
      for (const candidate of candidates) {
        const scheme = urlScheme(candidate, true);
        if (scheme && !SAFE_SCHEMES.has(scheme)) issues.add(`unsafe URL scheme "${scheme}:" in <${tagName} ${name}> (${FIX_URL})`);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Every other deployed file. Netlify publishes all of dist/ except dot-files,
// so each file type the build emits has a rule and anything else fails.
//   _redirects   only the rule families the generator emits (below)
//   _headers     required, and byte-identical to renderHeadersFile() (the
//                enforced script CSP lives only there)
//   ownership    google*.html, BingSiteAuth.xml, yandex_*, IndexNow keys,
//   proofs       anything under .well-known/ ...: only the exact path+content
//                on VERIFICATION_FILE_ALLOWLIST (verification-allowlist.ts)
//   .js/.mjs     path + sha256 on COPIED_SCRIPT_ALLOWLIST
//   .svg         no script, foreignObject, on* handler or non-http(s) link;
//                no animation of href or to javascript:/data:, no external <use>
//   .json        parses; URL-valued keys hold http(s) or site-relative URLs;
//                no "<script" or "<!--" in the file text
//   .xml         URLs http(s); no script, stylesheet PI or XHTML beyond <xhtml:link>
//   .css         no script URLs, expression(), behaviors or bindings
//   .ics         URL: properties http(s)
//   images       content starts with the format's magic bytes
//   .pdf         byte-identical to its static/root-files source
//   .txt         plain text, served as text/plain
// ---------------------------------------------------------------------------

const REPO_ROOT = join(import.meta.dir, '..', '..');
const FIX_REDIRECTS = 'fix: _redirects is written only by src/generate-site.ts (canonical-host, sitemap and /en rules) and src/generators/event-page.ts (slug 301s, archive 410s); a rule outside those families means dist/ was modified or persisted state (dist/.slug-history.json) was not validated — rebuild from a clean dist/';
const FIX_HEADERS = 'fix: _headers is written only by src/generators/security-headers.ts; rebuild, and never edit dist/_headers by hand';
const FIX_COPIED_SCRIPT = 'fix: .js/.mjs files reach dist/ only as copies listed in COPIED_SCRIPT_ALLOWLIST (src/validators/inline-script-allowlist.ts); if a dependency changed, run bun test tests/security/copied-scripts.test.ts for the new hash; otherwise delete the file';
const FIX_UNKNOWN = 'fix: the build emits no such file; delete it from dist/, or add a rule for its type in src/validators/published-artifacts.ts after review';
const FIX_JSON = 'fix: JSON URL fields go through sanitizeEventUrlFields/safeHttpUrl (src/utils/safe-url.ts) and files are written with toPublishedJson (src/utils/write-if-changed.ts)';

/** Hidden files the build keeps in dist/ as state. Netlify CLI does not deploy dot-files. */
const KNOWN_HIDDEN = new Set(['.slug-history.json', '.og-cache.json', '.build-provenance', '.DS_Store']);

const PATH_TOKEN = /^\/[A-Za-z0-9._~\/-]*$/;
const SLUG = '[a-z0-9-]{1,160}';
const REDIRECT_FAMILIES: { name: string; from: RegExp; to: RegExp; status: RegExp }[] = [
  { name: 'canonical host', from: /^https:\/\/agentathens\.netlify\.app\/\*$/, to: new RegExp(`^${BASE_URL.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}\\/:splat$`), status: /^301!$/ },
  { name: 'sitemap alias', from: /^\/sitemap\.xml$/, to: /^\/sitemap-index\.xml$/, status: /^301$/ },
  { name: '/en landing', from: /^\/en\/?$/, to: /^\/en\/today$/, status: /^302$/ },
  { name: 'slug change', from: new RegExp(`^/events/${SLUG}/\\*$`), to: new RegExp(`^/events/${SLUG}/:splat$`), status: /^301!$/ },
  { name: 'archive 410', from: new RegExp(`^/events/${SLUG}/$`), to: /^\/410\.html$/, status: /^410!$/ },
];

/** Problems in a _redirects file; each names the line. */
export function scanRedirects(text: string): string[] {
  const issues: string[] = [];
  const seenCanonical = { count: 0 };
  text.split('\n').forEach((raw, i) => {
    const line = raw.replace(/\r$/, '');
    const where = `_redirects line ${i + 1}`;
    if (line.trim() === '' || /^\s*#/.test(line)) return;
    const tokens = line.trim().split(/\s+/);
    if (tokens.length !== 3) {
      issues.push(`${where}: expected "from to status", got ${tokens.length} fields: "${line.slice(0, 100)}" (${FIX_REDIRECTS})`);
      return;
    }
    const [from, to, status] = tokens;
    const family = REDIRECT_FAMILIES.find(f => f.from.test(from) && f.to.test(to) && f.status.test(status));
    if (!family) {
      const shape = !from.startsWith('/') && !from.startsWith('https://agentathens.netlify.app/') ? 'source is not a site path'
        : !(PATH_TOKEN.test(to.replace(/:splat$/, '')) || to === `${BASE_URL}/:splat`) ? 'target is not a same-origin path'
        : 'rule is not one the generator emits';
      issues.push(`${where}: ${shape}: "${line.slice(0, 120)}" (${FIX_REDIRECTS})`);
      return;
    }
    if (family.name === 'canonical host' && ++seenCanonical.count > 1) issues.push(`${where}: duplicate canonical-host rule (${FIX_REDIRECTS})`);
  });
  return issues;
}

/** Problems in an SVG file served from dist/. */
export function scanSvg(text: string): string[] {
  const issues: string[] = [];
  if (/<(?:[\w.-]+:)?script\b/i.test(text)) issues.push('<script> in SVG');
  if (/<(?:[\w.-]+:)?foreignObject\b/i.test(text)) issues.push('<foreignObject> in SVG');
  if (/<!ENTITY/i.test(text)) issues.push('entity declaration in SVG');
  for (const tag of text.matchAll(START_TAG)) {
    const localName = tag[1].replace(/^[\w.-]+:/, '');
    const attrs = parseAttributes(tag[2]).map(([n, v]) => [n, v ?? ''] as [string, string]);
    issues.push(...svgActiveContentIssues(localName, attrs, false));
    for (const [name, value = ''] of parseAttributes(tag[2])) {
      if (/^on[a-z]+$/.test(name)) issues.push(`inline event handler ${name}= in SVG`);
      if (/(?:^|:)href$/.test(name) || name === 'src') {
        const scheme = urlScheme(value);
        if (scheme && scheme !== 'http' && scheme !== 'https') issues.push(`${scheme}: link in SVG ${name}`);
      }
    }
  }
  return [...new Set(issues)];
}

/** Keys whose string values are followed as links or loaded as resources (ticketUrlStatus and imageSource are labels, not URLs). */
const JSON_URL_KEY = /^(?:href|src|thumb|thumbnail|logo|image|images|imagelocal|venueimage|website|sameas|@id|item|mainentityofpage|isbasedon|hasmap)$|ur[li]$|urlresolved$|urltemplate$/i;

/** A value a browser may follow: http(s) with a host, a site-relative path, a relative path or fragment. */
function isPublishableUrl(value: string): boolean {
  const v = value.replace(/[\t\n\r]/g, '').replace(/^[\x00-\x20]+|[\x00-\x20]+$/g, '');
  if (v === '') return true;
  if (/[\x00-\x20"'<>`\\]/.test(v)) return false;
  const scheme = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(v)?.[1].toLowerCase();
  if (scheme) return (scheme === 'http' || scheme === 'https') && /^https?:\/\/[^\/?#]/i.test(v);
  return !v.startsWith('//');
}

function jsonUrlIssues(value: unknown, key: string, path: string, out: string[]): void {
  if (out.length >= 5) return;
  if (typeof value === 'string') {
    if (JSON_URL_KEY.test(key) && !isPublishableUrl(value)) out.push(`${path}: "${value.slice(0, 60)}" is not an http(s) or site-relative URL`);
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => jsonUrlIssues(v, key, `${path}[${i}]`, out));
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) jsonUrlIssues(v, k, path ? `${path}.${k}` : k, out);
  }
}

/** Problems in a published .json file. */
export function scanJson(text: string): string[] {
  const issues: string[] = [];
  if (/<\/?script/i.test(text)) issues.push(`"<script" in JSON text (${FIX_JSON})`);
  if (text.includes('<!--')) issues.push(`"<!--" in JSON text (${FIX_JSON})`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [...issues, `does not parse as JSON (${FIX_JSON})`];
  }
  const urls: string[] = [];
  jsonUrlIssues(parsed, '', '', urls);
  for (const u of urls) issues.push(`${u} (${FIX_JSON})`);
  return issues;
}

const XML_NAMESPACES = new Set([
  'http://www.sitemaps.org/schemas/sitemap/0.9',
  'http://www.w3.org/1999/xhtml',
  'http://www.w3.org/2005/Atom',
  'http://purl.org/rss/1.0/modules/content/',
  'http://www.google.com/schemas/sitemap-image/1.1',
]);

/** Problems in a published .xml file (sitemaps, feeds). */
export function scanXml(text: string): string[] {
  const issues: string[] = [];
  if (/<\?xml-stylesheet/i.test(text)) issues.push('xml-stylesheet processing instruction');
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) issues.push('DOCTYPE or entity declaration');
  if (/<(?:[\w.-]+:)?script\b/i.test(text)) issues.push('<script> element');
  const prefixes = new Map<string, string>();
  for (const m of text.matchAll(/\sxmlns(?::([\w.-]+))?\s*=\s*"([^"]*)"/g)) {
    if (!XML_NAMESPACES.has(m[2])) issues.push(`unexpected XML namespace "${m[2].slice(0, 80)}"`);
    if (m[1]) prefixes.set(m[1], m[2]);
  }
  for (const [prefix, ns] of prefixes) {
    if (ns !== 'http://www.w3.org/1999/xhtml') continue;
    for (const m of text.matchAll(new RegExp(`<${prefix}:([\\w.-]+)`, 'g'))) {
      if (m[1] !== 'link') issues.push(`XHTML element <${prefix}:${m[1]}> (only <${prefix}:link> is emitted)`);
    }
  }
  for (const tag of text.matchAll(START_TAG)) {
    for (const [name, value = ''] of parseAttributes(tag[2])) {
      if (/^on[a-z]+$/.test(name)) issues.push(`event handler attribute ${name}=`);
      if (name === 'href' && !/^https?:\/\/[^\/]/i.test(he.decode(value, { isAttributeValue: true }).trim())) issues.push(`href="${value.slice(0, 60)}" is not http(s)`);
    }
  }
  for (const m of text.matchAll(/<(loc|link|url|guid|image:loc)>\s*([^<]*?)\s*<\/\1>/g)) {
    const v = he.decode(m[2]);
    if (m[1] === 'guid' && !/^[a-z][a-z0-9+.-]*:/i.test(v)) continue; // non-URL guid
    if (!/^https?:\/\/[^\/\s]/i.test(v)) issues.push(`<${m[1]}> "${v.slice(0, 60)}" is not an http(s) URL`);
  }
  return [...new Set(issues)];
}

/** Problems in a published stylesheet. */
export function scanCss(text: string): string[] {
  const issues: string[] = [];
  if (/expression\s*\(|-moz-binding|(?<![\w-])behavior\s*:/i.test(text)) issues.push('script-capable CSS (expression, binding or behavior)');
  for (const m of text.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi)) {
    const scheme = urlScheme(m[2]);
    if (scheme && !['http', 'https', 'data'].includes(scheme)) issues.push(`url(${m[2].slice(0, 40)}) with ${scheme}:`);
    if (scheme === 'data' && !/^data:(?:image\/(?:png|gif|jpeg|webp)|font\/)/i.test(m[2].trim())) issues.push(`url(${m[2].slice(0, 40)}) data: URL that is not an image or font`);
  }
  if (/@import\s+(?:url\()?\s*['"]?(?:https?:)?\/\//i.test(text)) issues.push('@import from another origin');
  return [...new Set(issues)];
}

/** Problems in an iCalendar file: every URL property is http(s). */
export function scanIcs(text: string): string[] {
  const issues: string[] = [];
  // Unfold continuation lines (RFC 5545 §3.1) before reading properties.
  const unfolded = text.replace(/\r?\n[ \t]/g, '');
  for (const line of unfolded.split(/\r?\n/)) {
    const m = /^URL(?:;[^:]*)?:(.*)$/i.exec(line);
    if (m && !/^https?:\/\/[^\/\s]/i.test(m[1].trim())) issues.push(`URL property "${m[1].slice(0, 60)}" is not http(s)`);
  }
  if (!/^BEGIN:VCALENDAR/.test(unfolded.trimStart())) issues.push('not an iCalendar file');
  return issues;
}

const MAGIC: Record<string, (b: Buffer) => boolean> = {
  '.png': b => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  '.webp': b => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP',
  '.jpg': b => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  '.jpeg': b => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  '.gif': b => b.subarray(0, 4).toString('latin1') === 'GIF8',
  '.ico': b => b[0] === 0 && b[1] === 0 && b[2] === 1 && b[3] === 0,
  '.avif': b => b.subarray(4, 12).toString('latin1') === 'ftypavif',
  '.pdf': b => b.subarray(0, 5).toString('latin1') === '%PDF-',
};

function headBytes(file: string, n = 16): Buffer {
  const fd = openSync(file, 'r');
  try {
    const buf = Buffer.alloc(n);
    const read = readSync(fd, buf, 0, n, 0);
    return buf.subarray(0, read);
  } finally {
    closeSync(fd);
  }
}

const sha256 = (data: Buffer | string) => createHash('sha256').update(data).digest('hex');

/** Issues for one deployed file, by type; null when the type has no rule. */
function scanFile(distDir: string, full: string, rel: string): string[] | null {
  const name = rel.split('/').pop()!;
  const ext = extname(name).toLowerCase();
  if (rel === '_redirects') return scanRedirects(readFileSync(full, 'utf-8'));
  if (rel === '_headers') return readFileSync(full, 'utf-8') === renderHeadersFile() ? [] : [`_headers differs from the generated CSP header file (${FIX_HEADERS})`];
  switch (ext) {
    case '.html': return scanHtmlForArtifacts(readFileSync(full, 'utf-8'));
    case '.json': return scanJson(readFileSync(full, 'utf-8'));
    case '.xml': return scanXml(readFileSync(full, 'utf-8'));
    case '.svg': return scanSvg(readFileSync(full, 'utf-8'));
    case '.css': return scanCss(readFileSync(full, 'utf-8'));
    case '.ics': return scanIcs(readFileSync(full, 'utf-8'));
    case '.txt': return [];
    case '.js': case '.mjs': case '.cjs': {
      const entry = COPIED_SCRIPT_ALLOWLIST.find(e => e.path === rel);
      const digest = sha256(readFileSync(full));
      if (!entry) return [`script file not on the copied-script allowlist (sha256 ${digest}) (${FIX_COPIED_SCRIPT})`];
      return entry.sha256 === digest ? [] : [`script file content changed (sha256 ${digest}, allowlisted ${entry.sha256}) (${FIX_COPIED_SCRIPT})`];
    }
    case '.pdf': {
      const source = join(REPO_ROOT, 'static', 'root-files', rel);
      if (rel.includes('/') || !existsSync(source)) return [`PDF that is not a static/root-files copy (${FIX_UNKNOWN})`];
      return sha256(readFileSync(full)) === sha256(readFileSync(source)) ? [] : [`PDF differs from static/root-files/${rel} (${FIX_UNKNOWN})`];
    }
    default:
      if (MAGIC[ext]) return MAGIC[ext](headBytes(full)) ? [] : [`content is not ${ext.slice(1).toUpperCase()} data (${FIX_UNKNOWN})`];
      return null;
  }
}

export interface ArtifactReport {
  /** HTML pages scanned (kept for the build log line). */
  scanned: number;
  /** Every deployed file checked, by extension (or file name for _redirects/_headers). */
  byType: Record<string, number>;
  failures: { file: string; issues: string[] }[];
}

export function validatePublishedArtifacts(distDir: string): ArtifactReport {
  const report: ArtifactReport = { scanned: 0, byType: {}, failures: [] };
  const fail = (rel: string, issues: string[]) => { if (issues.length > 0) report.failures.push({ file: rel, issues }); };
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      const rel = relative(distDir, full).split('\\').join('/');
      // Netlify CLI skips dot-files and dot-directories (except .well-known);
      // only the build's own state files may sit there.
      if (entry.name.startsWith('.') && entry.name !== '.well-known') {
        if (!(entry.isFile() && dir === distDir && KNOWN_HIDDEN.has(entry.name)) && entry.name !== '.DS_Store') {
          fail(rel, [`unexpected hidden ${entry.isDirectory() ? 'directory' : 'file'} (${FIX_UNKNOWN})`]);
        }
        continue;
      }
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.isFile()) {
        fail(rel, [`not a regular file (symlink or special file) (${FIX_UNKNOWN})`]);
        continue;
      }
      const verification = verificationFileIssue(full, rel);
      if (verification) {
        fail(rel, [verification]);
        continue;
      }
      const issues = scanFile(distDir, full, rel);
      const type = rel === '_redirects' || rel === '_headers' ? rel : extname(entry.name).toLowerCase() || entry.name;
      if (issues === null) {
        fail(rel, [`file type "${type}" is not on the published-file allowlist (${FIX_UNKNOWN})`]);
        continue;
      }
      report.byType[type] = (report.byType[type] ?? 0) + 1;
      if (type === '.html') report.scanned++;
      fail(rel, issues);
    }
  };
  walk(distDir);
  // The enforced script CSP is delivered only by _headers: a dist/ without it
  // would deploy with no script-src enforcement at all.
  if (!existsSync(join(distDir, '_headers'))) {
    report.failures.push({ file: '_headers', issues: [`missing: the enforced Content-Security-Policy lives in _headers (${FIX_HEADERS})`] });
  }
  return report;
}

/**
 * A search-engine ownership proof (verification-allowlist.ts): refused unless
 * the exact path and content are allowlisted. Null for every other file.
 */
function verificationFileIssue(full: string, rel: string): string | null {
  const name = rel.split('/').pop()!;
  const isProof = rel.startsWith('.well-known/') || VERIFICATION_FILE_PATTERNS.some(re => re.test(name));
  if (!isProof) return null;
  const entry = VERIFICATION_FILE_ALLOWLIST.find(e => e.path === rel);
  if (!entry) return `ownership-verification file not on the allowlist (${FIX_VERIFICATION})`;
  return readFileSync(full, 'utf-8') === entry.content ? null : `ownership-verification file content differs from the allowlisted token (${FIX_VERIFICATION})`;
}
