/**
 * live-page-content.ts — the content canary of the off-machine live-site check
 * (security loop round 9). Run by .github/scripts/live-site-check.sh with the
 * pages it fetched:
 *
 *   bun .github/scripts/live-page-content.ts --site https://agentathens.com \
 *     --page home <home.html> --page event <event.html>
 *
 * The HTML is parsed with Bun's HTMLRewriter (a streaming HTML parser; nothing
 * is executed). A page fails when
 *   - any <script> carries a src / href / xlink:href that is not same-origin or
 *     exactly an allowed external script (the GA4 loader), judged by
 *     src/validators/external-script-allowlist.ts — the same allowlist the
 *     publish gate enforces, read from the default branch the workflow checks out;
 *   - a <base href> points anywhere but the site (it would re-point every
 *     relative script);
 *   - the invariants the templates always emit are missing: a <title> that
 *     names the site ("agent-athens", src/templates/page.ts,
 *     src/generators/event-page.ts) and a canonical link on the site origin —
 *     exactly `${site}/` on the homepage (pageUrl('index')), under
 *     `${site}/events/` or `${site}/en/events/` on an event page (the event
 *     template's locale-aware self canonical). A page served by someone else,
 *     or a stripped error page, lacks them.
 *
 * Output: one problem per line on stdout (printable ASCII, capped); exit 0 =
 * clean, 1 = problems, 2 = usage / unreadable page (the caller fails on any
 * non-zero exit).
 */
import { readFileSync, statSync } from 'fs';
import { externalScriptSrcIssue } from '../../src/validators/external-script-allowlist';

const MAX_PAGE_BYTES = 20_000_000;
const SITE_NAME = 'agent-athens';

const inert = (s: string, max = 160) => s.replace(/[^\x20-\x7e]/g, '?').slice(0, max);

export async function checkPage(site: string, kind: 'home' | 'event', html: string): Promise<string[]> {
  const origin = new URL(site).origin;
  const problems: string[] = [];
  const canonicals: string[] = [];
  let title = '';
  let titles = 0;
  const judgeScript = (attr: string, value: string | null) => {
    if (value === null) return;
    const issue = externalScriptSrcIssue(value, false);
    if (issue) problems.push(`<script ${attr}>: ${issue}`);
  };
  await new HTMLRewriter()
    .on('script', {
      element(e) {
        judgeScript('src', e.getAttribute('src'));
        judgeScript('href', e.getAttribute('href'));
        judgeScript('xlink:href', e.getAttribute('xlink:href'));
      },
    })
    .on('base', {
      element(e) {
        const href = e.getAttribute('href');
        if (href === null) return;
        let ok = false;
        try { ok = new URL(href, `${origin}/`).origin === origin; } catch { /* unparseable: not ok */ }
        if (!ok) problems.push(`<base href="${inert(href, 80)}"> points off the site (it re-points every relative script)`);
      },
    })
    .on('title', {
      element() { titles++; },
      text(t) { if (titles === 1) title += t.text; },
    })
    .on('link[rel="canonical" i]', {
      element(e) { canonicals.push(e.getAttribute('href') ?? ''); },
    })
    .transform(new Response(html))
    .text();

  if (!title.includes(SITE_NAME)) problems.push(`no <title> naming the site ("${SITE_NAME}"); got "${inert(title.trim(), 80)}"`);
  if (canonicals.length === 0) problems.push('no <link rel="canonical">');
  for (const c of canonicals) {
    const ok = kind === 'home' ? c === `${origin}/` : c.startsWith(`${origin}/events/`) || c.startsWith(`${origin}/en/events/`);
    if (!ok) problems.push(`canonical link "${inert(c, 120)}" is not ${kind === 'home' ? `${origin}/` : `an event page under ${origin}/events/ or ${origin}/en/events/`}`);
  }
  return problems;
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const usage = (why: string): never => {
    console.log(`live-page-content: usage error — ${why}`);
    process.exit(2);
  };
  let site = '';
  const pages: Array<{ kind: 'home' | 'event'; file: string }> = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--site') site = args[++i] ?? '';
    else if (args[i] === '--page') {
      const kind = args[++i];
      const file = args[++i];
      if ((kind !== 'home' && kind !== 'event') || !file) usage('--page needs home|event and a file');
      pages.push({ kind: kind as 'home' | 'event', file });
    } else usage(`unknown argument ${inert(args[i], 40)}`);
  }
  if (!/^https:\/\/[a-z0-9.-]+$/.test(site)) usage('--site must be https://<host>');
  if (pages.length === 0) usage('no --page given');
  let failed = false;
  for (const p of pages) {
    let html: string;
    try {
      if (statSync(p.file).size > MAX_PAGE_BYTES) usage(`${p.kind} page is larger than ${MAX_PAGE_BYTES} bytes`);
      html = readFileSync(p.file, 'utf8');
    } catch {
      usage(`${p.kind} page could not be read`);
      continue;
    }
    for (const problem of await checkPage(site, p.kind, html)) {
      console.log(`${p.kind} page: ${inert(problem, 400)}`);
      failed = true;
    }
  }
  process.exit(failed ? 1 : 0);
}
