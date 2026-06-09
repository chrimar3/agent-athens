import { mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import type { ContentHashManifest } from './content-hasher';
import { writeFileIfChangedSync } from '../utils/write-if-changed';

import { BASE_URL } from '../config/site-url';
const DIST_DIR = join(import.meta.dir, '../../dist');

type SitemapBucket = 'events' | 'venues' | 'editorial';

/**
 * Bare-root content slugs (trailing-slash form) whose /en/ twin exists and which
 * are therefore DROPPED from the sitemap as dormant Greek alternates (S144 D3).
 * Exported as the single source of truth: src/generate-site.ts reads it to drive
 * the paired robots-meta noindex on the same el pages, so sitemap-absence and
 * noindex stay in lockstep (see validateDormantLocaleNoindex).
 */
export const BILINGUAL_CONTENT_SLUGS = new Set(['about/', 'editorial/', 'corrections/']);

/**
 * Classify a URL into one of three sitemap buckets.
 * Simple prefix check — reliable because URL structure is controlled by our generator.
 */
export function classifyUrl(urlPath: string): SitemapBucket {
  if (urlPath.startsWith('events/') || urlPath.startsWith('en/events/')) return 'events';
  if (urlPath.startsWith('venues/')) return 'venues';
  return 'editorial';
}

/**
 * Compute changefreq based on URL type.
 * - Filter pages (today, this-week, etc.) change daily as events rotate
 * - Events/venues change weekly (when enrichment or data updates happen)
 * - Content pages (about, editorial) change rarely
 */
function getChangeFreq(urlPath: string, bucket: SitemapBucket): string {
  if (bucket === 'events' || bucket === 'venues') return 'weekly';
  // Filter pages that show time-based content change daily
  const dailyPrefixes = ['today', 'tomorrow', 'this-week', 'this-weekend', 'this-month', 'next-month'];
  if (urlPath === 'index' || dailyPrefixes.some(p => urlPath === p || urlPath.startsWith(`${p}-`))) {
    return 'daily';
  }
  return 'monthly';
}

/**
 * Compute priority using the existing depth-based formula from the old generateSitemap.
 * Higher priority for simpler URLs (more general pages).
 */
function getPriority(urlPath: string): string {
  const depth = urlPath === 'index' ? 0 : urlPath.split('-').length;
  return Math.max(0.5, 1.0 - (depth * 0.1)).toFixed(1);
}

/**
 * Extract the slug from an event URL path.
 * "events/abc-venue-title" → "abc-venue-title"
 * "en/events/abc-venue-title" → "abc-venue-title"
 */
function extractEventSlug(urlPath: string): string | null {
  const match = urlPath.match(/^(?:en\/)?events\/(.+)$/);
  return match ? match[1] : null;
}

export function buildUrlEntry(
  urlPath: string,
  manifest: ContentHashManifest,
  priorityOverrides?: Map<string, string>,
  bilingualSlugs?: Set<string>,
  bilingualHubSlugs?: Set<string>
): string {
  const fullUrl = urlPath === 'index' ? BASE_URL : `${BASE_URL}/${urlPath}`;
  const bucket = classifyUrl(urlPath);
  const entry = manifest.entries[urlPath];
  const lastmod = entry?.lastModified ?? new Date().toISOString().split('T')[0];
  const priority = priorityOverrides?.get(urlPath) ?? getPriority(urlPath);

  // S144 (GEO 2026-05-21): hreflang DROPPED from sitemap until Greek launches
  // as a published+indexable+quality-gated product. Same rationale as the
  // template-level hreflang drop (event-page.ts, content-page.ts, page.ts).
  // Emitting hreflang to a noindex Greek alternate builds an inconsistent
  // cluster (Google may down-rank /en/ from associating with a noindex alt).
  // Re-emit per decisions.md 2026-05-21 when Greek-as-product ships.
  const hreflangXml = '';

  return `  <url>
    <loc>${fullUrl}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${getChangeFreq(urlPath, bucket)}</changefreq>
    <priority>${priority}</priority>${hreflangXml}
  </url>`;
}

function buildSitemapXml(
  urls: string[],
  manifest: ContentHashManifest,
  priorityOverrides?: Map<string, string>,
  bilingualSlugs?: Set<string>,
  bilingualHubSlugs?: Set<string>
): string {
  const entries = urls.map(url => buildUrlEntry(url, manifest, priorityOverrides, bilingualSlugs, bilingualHubSlugs));
  const hasHreflang = entries.some(e => e.includes('xhtml:link'));
  const xmlnsXhtml = hasHreflang ? ' xmlns:xhtml="http://www.w3.org/1999/xhtml"' : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"${xmlnsXhtml}>
${entries.join('\n')}
</urlset>`;
}

function buildSitemapIndex(childNames: string[]): string {
  const entries = childNames.map(name => `  <sitemap>
    <loc>${BASE_URL}/${name}</loc>
  </sitemap>`);

  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.join('\n')}
</sitemapindex>`;
}

/**
 * Generate split sitemaps: events, venues, editorial + sitemap index.
 * Returns total URL count across all sitemaps.
 */
export function generateSplitSitemaps(
  generatedUrls: string[],
  manifest: ContentHashManifest,
  priorityOverrides?: Map<string, string>,
  bilingualSlugs?: Set<string>,
  bilingualHubSlugs?: Set<string>
): number {
  // S144 (GEO 2026-05-21): drop bare-root entries when an /en/ equivalent exists.
  // Sitemap = /en/-only for bilingual content; Greek-only / inherently-single-locale
  // URLs (homepage, llms.txt-style content) stay. Per GEO ruling, hreflang trigger
  // is published+indexable+quality-gated — dormant Greek alternates pollute the
  // crawl signal. Re-add bare-root + hreflang per decisions.md when Greek launches.
  // BILINGUAL_CONTENT_SLUGS hoisted to module scope (single source of truth — the
  // paired robots-meta noindex in generate-site.ts reads the same set).
  const generatedUrlSet = new Set(generatedUrls);
  const filteredUrls = generatedUrls.filter(url => {
    // Bare-root event with /en/ equivalent → drop
    if (url.startsWith('events/') && bilingualSlugs) {
      const slug = url.replace(/^events\//, '').replace(/\/$/, '');
      if (bilingualSlugs.has(slug)) return false;
    }
    // Bare-root hub with /en/ equivalent → drop (use bilingualHubSlugs set)
    if (bilingualHubSlugs && !url.startsWith('en/') && bilingualHubSlugs.has(url)) {
      return false;
    }
    // Bare-root content page with /en/ equivalent → drop
    if (BILINGUAL_CONTENT_SLUGS.has(url) && generatedUrlSet.has('en/' + url)) {
      return false;
    }
    return true;
  });

  const buckets: Record<SitemapBucket, string[]> = {
    events: [],
    venues: [],
    editorial: [],
  };

  for (const url of filteredUrls) {
    buckets[classifyUrl(url)].push(url);
  }

  if (!existsSync(DIST_DIR)) {
    mkdirSync(DIST_DIR, { recursive: true });
  }

  // Write child sitemaps
  const childFiles: { name: string; count: number }[] = [
    { name: 'sitemap-events.xml', count: buckets.events.length },
    { name: 'sitemap-venues.xml', count: buckets.venues.length },
    { name: 'sitemap-editorial.xml', count: buckets.editorial.length },
  ];

  writeFileIfChangedSync(join(DIST_DIR, 'sitemap-events.xml'), buildSitemapXml(buckets.events, manifest, priorityOverrides, bilingualSlugs));
  writeFileIfChangedSync(join(DIST_DIR, 'sitemap-venues.xml'), buildSitemapXml(buckets.venues, manifest));
  writeFileIfChangedSync(join(DIST_DIR, 'sitemap-editorial.xml'), buildSitemapXml(buckets.editorial, manifest, undefined, undefined, bilingualHubSlugs));

  // Write sitemap index
  writeFileIfChangedSync(
    join(DIST_DIR, 'sitemap-index.xml'),
    buildSitemapIndex(childFiles.map(f => f.name))
  );

  console.log(`  ✓ sitemap-index.xml → ${childFiles.map(f => `${f.name} (${f.count})`).join(', ')}`);

  return generatedUrls.length;
}
