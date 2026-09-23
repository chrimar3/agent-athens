// Homepage-specific render functions
// Answer capsule, hub navigation grid, and time shortcuts

import { STRINGS } from '../i18n/strings';

export interface CapsuleStats {
  total: number;
  today: number;
  weekend: number;
  concerts: number;
  theater: number;
  open: number;
  typeCount: number;
}

export interface HubNavItem {
  slug: string;
  titleEl: string;
  titleEn: string;
  path: string;
  eventCount: number;
  type: string;
}

// Map hub slugs to CSS color variables for the dot indicator
const HUB_DOT_COLORS: Record<string, string> = {
  today: 'var(--accent-primary)',
  'this-weekend': 'var(--accent-primary)',
  'this-month': 'var(--accent-primary)',
  concerts: 'var(--color-concert)',
  theater: 'var(--color-theater)',
  theatre: 'var(--color-theater)',
  nightlife: 'var(--color-dj-set)',
  exhibitions: 'var(--color-exhibition)',
  open: 'var(--color-workshop)',
  cinema: 'var(--color-cinema)',
  'classical-music': 'var(--color-concert)',
  comedy: 'var(--color-show)',
  festivals: 'var(--color-festival)',
  kids: 'var(--accent-primary)',
  'with-ticket': 'var(--text-secondary)',
  dance: 'var(--color-dance)',
  concert: 'var(--color-concert)',
  dj_set: 'var(--color-dj-set)',
  exhibition: 'var(--color-exhibition)',
  performance: 'var(--color-performance)',
  workshop: 'var(--color-workshop)',
  show: 'var(--color-show)',
  festival: 'var(--color-festival)',
  tech: 'var(--color-other)',
};

function getDotColor(hub: HubNavItem): string {
  return HUB_DOT_COLORS[hub.slug] || HUB_DOT_COLORS[hub.type] || 'var(--accent-primary)';
}

export function renderHomepageCapsule(stats: CapsuleStats): string {
  return `<section class="hub-answer-capsule">
  <p class="answer-capsule-text">
    Η Αθήνα έχει ${stats.total} επερχόμενες πολιτιστικές εκδηλώσεις
    σε ${stats.typeCount} κατηγορίες. Ενημερώνεται καθημερινά.
  </p>
  <p class="hub-stats">
    <a href="/today/">Σήμερα (${stats.today})</a> ·
    <a href="/this-weekend/">Σαββατοκύριακο (${stats.weekend})</a> ·
    <a href="/concerts/">Συναυλίες (${stats.concerts})</a> ·
    <a href="/theatre/">Θέατρο (${stats.theater})</a> ·
    <a href="/open/">${STRINGS.el.openEntry} (${stats.open})</a>
  </p>
</section>`;
}

export function renderHubNavGrid(hubs: HubNavItem[]): string {
  if (hubs.length === 0) return '';

  const cards = hubs.map(hub => `
      <a href="${hub.path}" class="hub-card">
        <span class="hub-dot" style="background:${getDotColor(hub)}"></span>
        <span class="hub-card-body">
          <span class="hub-card-title">${hub.titleEl}</span>
          <span class="hub-card-count">${hub.eventCount} ${hub.eventCount === 1 ? STRINGS.el.eventWordOne : STRINGS.el.hubEventCount} →</span>
        </span>
      </a>`).join('');

  return `<section class="hub-nav-section">
  <h2 class="hub-nav-heading">Ανακαλύψτε ανά Κατηγορία</h2>
  <div class="hub-nav-grid">${cards}
  </div>
</section>`;
}

// Short labels — the hub titles are long SEO strings ("Εκδηλώσεις Αύριο στην Αθήνα").
const TIME_CHIPS: Array<{ slug: string; label: string }> = [
  { slug: 'today', label: 'Σήμερα' },
  { slug: 'tomorrow', label: 'Αύριο' },
  { slug: 'this-weekend', label: 'Σαββατοκύριακο' },
  { slug: 'this-week', label: 'Αυτή την εβδομάδα' },
];

/** First thing on the homepage: jump straight to a time window. Counts come from the hubs. */
export function renderTimeChips(hubs: HubNavItem[]): string {
  const chips = TIME_CHIPS
    .map(c => ({ ...c, hub: hubs.find(h => h.slug === c.slug) }))
    .filter(c => c.hub && c.hub.eventCount > 0)
    .map(c => `<a href="${c.hub!.path}" class="time-chip">${c.label} <span class="time-chip__count">${c.hub!.eventCount}</span></a>`);
  if (chips.length === 0) return '';
  return `<nav class="time-chips" aria-label="Πότε θέλετε να βγείτε;">${chips.join('')}</nav>`;
}
