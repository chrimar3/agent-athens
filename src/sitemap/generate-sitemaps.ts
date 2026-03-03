import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import type { ContentHashManifest } from './content-hasher';

const BASE_URL = 'https://agentathens.netlify.app';
const DIST_DIR = join(import.meta.dir, '../../dist');

type SitemapBucket = 'events' | 'venues' | 'editorial';

/**
 * Classify a URL into one of three sitemap buckets.
 * Simple prefix check — reliable because URL structure is controlled by our generator.
 */
export function classifyUrl(urlPath: string): SitemapBucket {
  if (urlPath.startsWith('events/')) return 'events';
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

function buildUrlEntry(urlPath: string, manifest: ContentHashManifest, priorityOverrides?: Map<string, string>): string {
  const fullUrl = urlPath === 'index' ? BASE_URL : `${BASE_URL}/${urlPath}`;
  const bucket = classifyUrl(urlPath);
  const entry = manifest.entries[urlPath];
  const lastmod = entry?.lastModified ?? new Date().toISOString().split('T')[0];
  const priority = priorityOverrides?.get(urlPath) ?? getPriority(urlPath);

  return `  <url>
    <loc>${fullUrl}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${getChangeFreq(urlPath, bucket)}</changefreq>
    <priority>${priority}</priority>
  </url>`;
}

function buildSitemapXml(urls: string[], manifest: ContentHashManifest, priorityOverrides?: Map<string, string>): string {
  const entries = urls.map(url => buildUrlEntry(url, manifest, priorityOverrides));
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
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
  priorityOverrides?: Map<string, string>
): number {
  const buckets: Record<SitemapBucket, string[]> = {
    events: [],
    venues: [],
    editorial: [],
  };

  for (const url of generatedUrls) {
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

  writeFileSync(join(DIST_DIR, 'sitemap-events.xml'), buildSitemapXml(buckets.events, manifest, priorityOverrides));
  writeFileSync(join(DIST_DIR, 'sitemap-venues.xml'), buildSitemapXml(buckets.venues, manifest));
  writeFileSync(join(DIST_DIR, 'sitemap-editorial.xml'), buildSitemapXml(buckets.editorial, manifest));

  // Write sitemap index
  writeFileSync(
    join(DIST_DIR, 'sitemap-index.xml'),
    buildSitemapIndex(childFiles.map(f => f.name))
  );

  console.log(`  ✓ sitemap-index.xml → ${childFiles.map(f => `${f.name} (${f.count})`).join(', ')}`);

  return generatedUrls.length;
}
