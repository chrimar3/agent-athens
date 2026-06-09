/**
 * Build-time invariant: dormant-locale bare-root pages must be noindex AND
 * absent from every sitemap; any page advertised in a sitemap must stay
 * indexable. Closes the sitemap↔robots-meta drift Bing flagged on
 * agentathens.com/today (S144 dropped bilingual bare-roots from the sitemap
 * but never noindexed them, leaving indexable orphans absent from sitemaps).
 *
 * Output-keyed (NOT class-list-keyed): the domain is derived from emitted
 * artifacts — the dist/en/ twin set + the parsed sitemap <loc> set — so it is
 * immune to the hardcoded-HUB_SLUGS rot that left tomorrow/this-week/next-month
 * unvalidated in validateAllPages, and it auto-handles the runtime flip (a hub
 * below the ≥3-event threshold emits no /en/ twin that build → it must stay
 * indexable + in-sitemap, and this invariant enforces exactly that).
 *
 * The two rules together are stronger than the bare biconditional and catch
 * BOTH drift directions:
 *   Rule 1 — present in any sitemap  ⟹  NOT noindex
 *   Rule 2 — has an emitted /en/ twin ⟹  noindex AND absent from all sitemaps
 *
 * 404 (noindex, no twin, not in sitemap) and enOnly pages (no bare-root file)
 * fall outside the candidate domain and are never flagged.
 *
 * Standalone cross-artifact pass — mirrors validateDistCanonicalParity rather
 * than the per-page validateAllPages loop, because the biconditional needs the
 * sitemaps + the en-twin listing in scope together, which per-page HTML-string
 * validators don't get.
 *
 * @see specs/dormant-locale-robots-meta-checkpoint.md (design + ruling)
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { BASE_URL } from '../config/site-url';

export interface DormantNoindexFacts {
  /** Bare-root page identifier for messages, e.g. 'today' or 'about/'. */
  page: string;
  /** An /en/<slug>/ twin was emitted this build. */
  hasEnTwin: boolean;
  /** Page HTML emits <meta name="robots" content="...noindex..."> . */
  isNoindex: boolean;
  /** Page's <loc> appears in at least one of the 3 sitemaps. */
  inSitemap: boolean;
}

export interface DormantNoindexFailure {
  page: string;
  rule: 'NOINDEX_IN_SITEMAP' | 'DORMANT_NOINDEX_DRIFT';
  reason: string;
}

export interface DormantNoindexReport {
  passed: number;
  failures: DormantNoindexFailure[];
}

/**
 * Pure core — apply the two-rule invariant to one page's assembled facts.
 * Returns a failure or null. This is the single source of truth for the
 * policy; the IO wrapper only assembles facts and calls this.
 */
export function checkDormantNoindexInvariant(
  f: DormantNoindexFacts,
): DormantNoindexFailure | null {
  // Rule 1 — a URL advertised in any sitemap must be indexable. Catches the
  // inverse drift (noindex page still listed for crawling, e.g. /saved/).
  if (f.inSitemap && f.isNoindex) {
    return {
      page: f.page,
      rule: 'NOINDEX_IN_SITEMAP',
      reason:
        `${f.page} emits noindex but is present in a sitemap — a sitemap URL must be ` +
        `indexable (drop it from the sitemap, or remove the noindex)`,
    };
  }
  // Rule 2 — a dormant bare-root (an /en/ twin exists this build) must be both
  // noindex AND absent from every sitemap. Catches the /today drift.
  if (f.hasEnTwin && !(f.isNoindex && !f.inSitemap)) {
    return {
      page: f.page,
      rule: 'DORMANT_NOINDEX_DRIFT',
      reason:
        `${f.page} has an emitted /en/ twin but is not (noindex AND sitemap-absent): ` +
        `noindex=${f.isNoindex}, inSitemap=${f.inSitemap} — dormant bare-root must emit ` +
        `<meta name="robots" content="noindex, follow"> and stay out of all 3 sitemaps`,
    };
  }
  return null;
}

/** Strip host + leading/trailing slashes → comparable path token. */
function locToPath(loc: string): string {
  return loc
    .replace(BASE_URL, '')
    .replace(/^https?:\/\/[^/]+/, '')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');
}

/**
 * IO wrapper — assemble facts from dist artifacts and run the invariant over
 * the candidate domain (en-twin slugs ∪ bare-root sitemap locs).
 */
export function validateDormantLocaleNoindex(distDir: string): DormantNoindexReport {
  // 1. Parse all 3 sitemaps → set of <loc> path tokens. Sitemaps are regenerated
  //    fresh from the live URL set every build, so membership here means "emitted
  //    THIS build" — which is how we tell a LIVE /en/ twin from a stale leftover
  //    dist/en/<slug>/ artifact (a hub that dropped below the ≥3-event threshold
  //    stops emitting its twin, but the old file lingers; the orphan-sweep, not
  //    this invariant, owns that cleanup).
  const sitemapPaths = new Set<string>();
  for (const name of ['sitemap-events.xml', 'sitemap-venues.xml', 'sitemap-editorial.xml']) {
    const p = join(distDir, name);
    if (!existsSync(p)) continue;
    const xml = readFileSync(p, 'utf-8');
    for (const m of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
      sitemapPaths.add(locToPath(m[1]));
    }
  }

  // 2. Live /en/ twin slugs = single-segment en/<slug> locs in a sitemap
  //    (en/events/<x> and en/venues/<x> are multi-segment → excluded).
  const liveTwinSlugs = new Set<string>();
  for (const tok of sitemapPaths) {
    const m = tok.match(/^en\/([^/]+)$/);
    if (m) liveTwinSlugs.add(m[1]);
  }

  // 3. Resolve a slug's bare-root file: flat dist/<slug>.html (Pretty-URL no-slash)
  //    or content dir dist/<slug>/index.html. Returns label + html, or null.
  const resolveBareRoot = (slug: string): { label: string; html: string } | null => {
    const flat = join(distDir, `${slug}.html`);
    if (existsSync(flat)) return { label: slug, html: readFileSync(flat, 'utf-8') };
    const dir = join(distDir, slug, 'index.html');
    if (existsSync(dir)) return { label: `${slug}/`, html: readFileSync(dir, 'utf-8') };
    return null;
  };

  // 4. Candidate domain = live-twin slugs ∪ single-segment bare-root sitemap
  //    tokens. Dedup by slug so a page that is both a twin and sitemap-present
  //    is checked once. 404 / enOnly / stale orphans fall outside this set.
  const candidateSlugs = new Set<string>(liveTwinSlugs);
  for (const tok of sitemapPaths) {
    if (tok && !tok.includes('/')) candidateSlugs.add(tok);
  }

  const failures: DormantNoindexFailure[] = [];
  let passed = 0;
  for (const slug of candidateSlugs) {
    const bare = resolveBareRoot(slug);
    if (!bare) continue; // enOnly (no bare-root file) — nothing to govern
    const failure = checkDormantNoindexInvariant({
      page: bare.label,
      hasEnTwin: liveTwinSlugs.has(slug),
      isNoindex: readRobotsIsNoindex(bare.html),
      inSitemap: sitemapPaths.has(slug),
    });
    if (failure) failures.push(failure);
    else passed++;
  }

  return { passed, failures };
}

/** Exposed for fact-assembly reuse + targeted testing. */
export function readRobotsIsNoindex(html: string): boolean {
  const m = html.match(/<meta name="robots" content="([^"]*)"/);
  return !!m && m[1].includes('noindex');
}

