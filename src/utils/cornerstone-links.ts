/**
 * Cornerstone Hub Links
 *
 * Reads hub-pages.json, filters cornerstone: true hubs,
 * and returns link data for injection into event pages
 * and non-cornerstone hub pages.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import type { HubConfig } from '../types';
import type { Locale } from '../i18n/strings';

const CONFIG_PATH = join(import.meta.dir, '../../config/hub-pages.json');

/** Short nav-friendly labels for cornerstone hubs */
const CORNERSTONE_LABELS: Record<string, { el: string; en: string }> = {
  'today': { el: 'Εκδηλώσεις Σήμερα', en: 'Events Today' },
  'this-weekend': { el: 'Σαββατοκύριακο', en: 'This Weekend' },
  'open': { el: 'Ελεύθερη Είσοδο', en: 'Open Entry Events' },
  'this-month': { el: 'Αυτόν τον Μήνα', en: 'This Month' },
};

export interface CornerstoneLink {
  href: string;
  labelEl: string;
  labelEn: string;
  slug: string;
}

let _cached: CornerstoneLink[] | null = null;

/**
 * Returns cornerstone hub links (all 4).
 * Results are cached after first call since hub-pages.json doesn't change mid-build.
 */
export function getCornerstoneLinks(): CornerstoneLink[] {
  if (_cached) return _cached;

  const hubConfigs: { hubs: HubConfig[] } = JSON.parse(
    readFileSync(CONFIG_PATH, 'utf-8')
  );

  _cached = hubConfigs.hubs
    .filter(h => h.cornerstone === true)
    .map(h => ({
      href: `/${h.slug}/`,
      labelEl: CORNERSTONE_LABELS[h.slug]?.el || h.titleEl,
      labelEn: CORNERSTONE_LABELS[h.slug]?.en || h.titleEn,
      slug: h.slug,
    }));

  return _cached;
}

/**
 * Render cornerstone links HTML for a given locale.
 * Used in event pages inside edp-connections nav.
 */
export function renderCornerstoneLinksHtml(locale: Locale): string {
  const links = getCornerstoneLinks();
  const prefix = locale === 'en' ? '/en' : '';
  const heading = locale === 'en' ? 'Popular collections' : 'Δημοφιλείς συλλογές';

  const anchors = links.map(l => {
    const label = locale === 'en' ? l.labelEn : l.labelEl;
    return `<a href="${prefix}${l.href}">${label}</a>`;
  }).join('\n        ');

  return `<div class="edp-cornerstone-links">
        <span class="edp-cornerstone-heading">${heading}</span>
        ${anchors}
      </div>`;
}

/**
 * Render cross-link section for non-cornerstone hub pages.
 * Links to all 4 cornerstone hubs.
 */
export function renderHubCrossLinks(locale: Locale): string {
  const links = getCornerstoneLinks();
  const prefix = locale === 'en' ? '/en' : '';
  const heading = locale === 'en'
    ? 'More ways to explore Athens'
    : 'Περισσότεροι τρόποι εξερεύνησης';

  const anchors = links.map(l => {
    const label = locale === 'en' ? l.labelEn : l.labelEl;
    return `<a href="${prefix}${l.href}">${label}</a>`;
  }).join('\n  ');

  return `<section class="hub-cross-links">
  <h2>${heading}</h2>
  ${anchors}
</section>`;
}
