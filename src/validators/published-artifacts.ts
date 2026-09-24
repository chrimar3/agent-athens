/**
 * Build-time invariant: no pipeline artefact reaches a published page.
 *
 * Output-keyed (reads emitted HTML), so it holds whichever generator leaks.
 * Round-0 judges (2026-09-22) found all four classes live while the test
 * suite was green: an escaped enrichment marker on 343–686 event pages and
 * inside JSON-LD, "[PLACEHOLDER]" copy on 6 hubs, raw markdown tables on 44
 * pages, and entity-encoded JSON-LD names quoted verbatim by AI answers.
 */

import { readdirSync, readFileSync } from 'fs';
import { join, relative } from 'path';
import { load } from 'cheerio';
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
  issues.push(...scanScriptSources(html));
  return issues;
}

/**
 * Security loop round 6: every <script src> (and SVG <script href>) must be
 * same-origin or EXACTLY an allowlisted external URL
 * (src/validators/external-script-allowlist.ts) — a host-wide allowance would
 * let a page load any container from that host. Pages are parsed with an
 * HTML5 parser (cheerio/parse5), so attribute values are entity-decoded and
 * malformed markup yields the elements a browser would build.
 */
function scanScriptSources(html: string): string[] {
  if (!/<script/i.test(html)) return [];
  const issues: string[] = [];
  const $ = load(html);
  $('script').each((_, el) => {
    const attrs = (el as { attribs?: Record<string, string> }).attribs ?? {};
    for (const name of ['src', 'href', 'xlink:href']) {
      if (attrs[name] === undefined) continue;
      const issue = externalScriptSrcIssue(attrs[name]);
      if (issue) issues.push(issue);
    }
  });
  return issues;
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
