/** Production base URL — no trailing slash.
 *  All canonical, hreflang, og:url, Schema.org, sitemap,
 *  llms.txt, robots.txt, and IndexNow references pull from here.
 *  Next domain change: edit this line only. */
export const BASE_URL = 'https://agentathens.com';

/** Public URL for a generated page path. The homepage lives at `index.html`
 *  on disk but its public URL is the bare root — canonical/og:url/JSON-LD
 *  must say `${BASE_URL}/`, never `${BASE_URL}/index`. */
export function pageUrl(path: string): string {
  return path === 'index' ? `${BASE_URL}/` : `${BASE_URL}/${path}`;
}
