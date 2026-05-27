/**
 * Filter Bar — Pill row with dropdown panels for Date, Type, Price, Sort
 *
 * Architecture: Navigation-based filtering. Each option is an <a> tag
 * pointing to a pre-generated static page. JS is minimal — only
 * panel open/close, click-outside dismiss, escape key, scroll lock,
 * and sort-by-price. On mobile (≤767px), panels become bottom sheets.
 */

import type { Event, EventType, TimeRange, Filters, FilterCounts, FilterCountOption, PriceFilter } from '../types';
import type { HubIdentity } from '../utils/hub-identity';
import { filterEvents } from '../utils/filters';
import { buildURL } from '../utils/urls';
import { BADGE_LABELS } from './page';
import { STRINGS, type Locale, type UIStrings } from '../i18n/strings';

// ── Time range labels ────────────────────────────────

const TIME_OPTIONS: Array<{ time: TimeRange; label: string }> = [
  { time: 'today', label: 'Σήμερα' },
  { time: 'tomorrow', label: 'Αύριο' },
  { time: 'this-week', label: 'Αυτή την εβδομάδα' },
  { time: 'this-weekend', label: 'Σαββατοκύριακο' },
  { time: 'this-month', label: 'Αυτόν τον μήνα' },
  { time: 'next-month', label: 'Επόμενο μήνα' },
];

// ── Type labels and colors ───────────────────────────

const TYPE_OPTIONS: Array<{ type: EventType; label: string }> = [
  { type: 'concert', label: 'Συναυλίες' },
  { type: 'dj_set', label: 'DJ Sets' },
  { type: 'exhibition', label: 'Εκθέσεις' },
  { type: 'theater', label: 'Θέατρο' },
  { type: 'cinema', label: 'Σινεμά' },
  { type: 'performance', label: 'Performance' },
  { type: 'show', label: 'Show' },
  { type: 'festival', label: 'Φεστιβάλ' },
  { type: 'workshop', label: 'Εργαστήρια' },
  { type: 'tech', label: 'Tech' },
];

const PRICE_OPTIONS: Array<{ price: PriceFilter; label: string }> = [
  { price: 'open', label: 'Ελεύθερη είσοδος' },
  { price: 'with-ticket', label: 'Με εισιτήριο' },
];

const SORT_OPTIONS = [
  { value: 'date', label: 'Ημερομηνία' },
  { value: 'price', label: 'Τιμή' },
];

// CSS variable name for each event type color
function typeColorVar(type: EventType): string {
  return `var(--color-${type.replace('_', '-')})`;
}

// Price option display label — reuses the site-wide locked Tier-1 strings
// (openEntry / ticketed). Never invents free/paid. The filter VALUE stays
// open / with-ticket (unchanged); this is display text only.
function priceOptionLabel(price: PriceFilter, s: UIStrings): string {
  if (price === 'open') return s.openEntry;
  if (price === 'with-ticket') return s.ticketed;
  return price;
}

// ── Count Computation ────────────────────────────────

/**
 * For each filter dimension, count how many events match
 * when that dimension is set to each option (with other current
 * filters still applied).
 */
export function computeFilterCounts(
  currentFilters: Filters,
  allEvents: Event[]
): FilterCounts {
  // Type counts: for each type, count events matching {type, ...currentFilters minus type}
  const types: FilterCountOption[] = TYPE_OPTIONS.map(({ type, label }) => {
    const filtersWithType: Filters = { ...currentFilters, type };
    const count = filterEvents(allEvents, filtersWithType).length;
    const url = '/' + buildURL(filtersWithType);
    return { value: type, label, count, url };
  }).filter(opt => opt.count > 0);

  // Price counts: for each price, count events matching {price, ...currentFilters minus price}
  const prices: FilterCountOption[] = PRICE_OPTIONS.map(({ price, label }) => {
    const filtersWithPrice: Filters = { ...currentFilters, price };
    const count = filterEvents(allEvents, filtersWithPrice).length;
    const url = '/' + buildURL(filtersWithPrice);
    return { value: price, label, count, url };
  }).filter(opt => opt.count > 0);

  // Time range counts: for each time range, count events matching {time, ...currentFilters minus time}
  const baseFiltersNoTime: Filters = { ...currentFilters };
  delete baseFiltersNoTime.time;
  const timeRanges: FilterCountOption[] = TIME_OPTIONS.map(({ time, label }) => {
    const filtersWithTime: Filters = { ...baseFiltersNoTime, time };
    const count = filterEvents(allEvents, filtersWithTime).length;
    const builtUrl = buildURL(filtersWithTime);
    const url = builtUrl === 'index' ? '/' : '/' + builtUrl;
    return { value: time, label, count, url };
  });

  return { types, prices, timeRanges };
}

// ── Chevron SVG ──────────────────────────────────────

const CHEVRON_SVG = `<svg class="filter-pill-chevron" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 3.5L5 6.5L8 3.5"/></svg>`;

// ── HTML Rendering ───────────────────────────────────

/**
 * Build the URL that removes a specific filter dimension.
 * Used for the dismiss (x) button on active pills.
 */
function buildDismissUrl(filters: Filters, dimension: keyof Filters): string {
  const without = { ...filters };
  delete without[dimension];
  const url = buildURL(without);
  return url === 'index' ? '/' : '/' + url;
}

/**
 * Render the complete filter bar HTML.
 */
export function renderFilterBar(
  currentFilters: Filters,
  counts: FilterCounts,
  totalCount: number,
  hubIdentity?: HubIdentity,
  locale: Locale = 'el'
): string {
  const s = STRINGS[locale];
  const excluded = hubIdentity?.excludeDimension;
  const typeActiveForGate  = excluded !== 'type'  && !!currentFilters.type;
  const priceActiveForGate = excluded !== 'price' && !!currentFilters.price;
  const timeActiveForGate  = excluded !== 'time'  && !!(currentFilters.time && currentFilters.time !== 'all-events');
  const hasActiveFilters = typeActiveForGate || priceActiveForGate || timeActiveForGate;

  // ── Date pill ──
  const timeActive = currentFilters.time && currentFilters.time !== 'all-events'
    ? currentFilters.time
    : null;
  const timeLabel = timeActive
    ? (s.filterTimeLabels[timeActive] || timeActive)
    : s.filterDate;
  const timeDismissUrl = timeActive ? buildDismissUrl(currentFilters, 'time') : '';
  const datePill = excluded === 'time'
    ? ''
    : timeActive
      ? `<div class="filter-panel-anchor" data-filter="date">
          <span class="filter-pill is-active">${timeLabel}<a href="${timeDismissUrl}" class="filter-pill-dismiss" aria-label="${s.filterRemoveDate}">&times;</a></span>
        </div>`
      : `<div class="filter-panel-anchor" data-filter="date">
          <button class="filter-pill" data-panel="date">${timeLabel} ${CHEVRON_SVG}</button>
          ${renderDatePanel(counts.timeRanges, currentFilters, s, locale)}
        </div>`;

  // ── Type pill ──
  const typeActive = currentFilters.type;
  const typeLabel = typeActive
    ? (s.filterTypeLabels[typeActive] || typeActive)
    : s.filterType;
  const typeDismissUrl = typeActive ? buildDismissUrl(currentFilters, 'type') : '';
  const typePill = excluded === 'type'
    ? ''
    : typeActive
      ? `<div class="filter-panel-anchor" data-filter="type">
          <span class="filter-pill is-active">${typeLabel}<a href="${typeDismissUrl}" class="filter-pill-dismiss" aria-label="${s.filterRemoveType}">&times;</a></span>
        </div>`
      : `<div class="filter-panel-anchor" data-filter="type">
          <button class="filter-pill" data-panel="type">${typeLabel} ${CHEVRON_SVG}</button>
          ${renderTypePanel(counts.types, currentFilters, totalCount, s, locale)}
        </div>`;

  // ── Price pill ──
  const priceActive = currentFilters.price && currentFilters.price !== 'all'
    ? currentFilters.price
    : null;
  const priceLabel = priceActive
    ? priceOptionLabel(priceActive, s)
    : s.filterPrice;
  const priceDismissUrl = priceActive ? buildDismissUrl(currentFilters, 'price') : '';
  const pricePill = excluded === 'price'
    ? ''
    : priceActive
      ? `<div class="filter-panel-anchor" data-filter="price">
          <span class="filter-pill is-active">${priceLabel}<a href="${priceDismissUrl}" class="filter-pill-dismiss" aria-label="${s.filterRemovePrice}">&times;</a></span>
        </div>`
      : `<div class="filter-panel-anchor" data-filter="price">
          <button class="filter-pill" data-panel="price">${priceLabel} ${CHEVRON_SVG}</button>
          ${renderPricePanel(counts.prices, currentFilters, s, locale)}
        </div>`;

  // ── Sort pill ──
  const sortPill = `<div class="filter-panel-anchor" data-filter="sort">
    <button class="filter-pill" data-panel="sort">${s.filterSort} ${CHEVRON_SVG}</button>
    ${renderSortPanel(s)}
  </div>`;

  // ── Meta (result count + clear all) ──
  const clearHref = hubIdentity ? '/' + hubIdentity.canonicalUrl : '/';
  const meta = `<div class="filter-bar-meta">
    <span class="filter-result-count" data-events-word="${s.filterEventsWord}">${totalCount} ${s.filterEventsWord}</span>
    ${hasActiveFilters ? `<a href="${clearHref}" class="filter-clear-all">${s.filterClear}</a>` : ''}
  </div>`;

  return `<div class="filter-bar" data-locale="${locale}">
    <div class="filter-bar-scroll">
      ${datePill}
      ${typePill}
      ${pricePill}
      ${sortPill}
      ${meta}
    </div>
  </div>
  <div class="filter-panel-backdrop"></div>`;
}

// ── Panel Renderers ──────────────────────────────────

function renderDatePanel(timeRanges: FilterCountOption[], currentFilters: Filters, s: UIStrings, locale: Locale): string {
  // On /en/, date stays NAVIGATION (in-page date filtering can't broaden a hub's
  // window) → re-point to the surviving /en/{time}/ hub. today/tomorrow are
  // inventory-gated (≥3 events) — omit on /en/ when count<3 to avoid a 404.
  const rows = timeRanges
    .filter(opt => !(locale === 'en' && (opt.value === 'today' || opt.value === 'tomorrow') && opt.count < 3))
    .map(opt => {
      const isSelected = currentFilters.time === opt.value;
      const href = locale === 'en' ? `/en/${opt.value}/` : opt.url;
      return `<a href="${href}" class="filter-radio-row${isSelected ? ' is-selected' : ''}">
      <span class="filter-radio-circle"></span>
      <span class="filter-radio-label">${s.filterTimeLabels[opt.value] || opt.value}</span>
      <span class="filter-radio-count">${opt.count}</span>
    </a>`;
    });

  return `<div class="filter-panel" data-panel-for="date">
    <button class="filter-panel-close" aria-label="${s.filterClose}">&times;</button>
    <div class="filter-sheet-handle"></div>
    <div class="filter-sheet-title">${s.filterDate}</div>
    <div class="filter-radio-list">
      ${rows.join('\n      ')}
    </div>
  </div>`;
}

function renderTypePanel(types: FilterCountOption[], currentFilters: Filters, totalCount: number, s: UIStrings, locale: Locale): string {
  const tiles = types.map(opt => {
    const isSelected = currentFilters.type === opt.value;
    const colorVar = typeColorVar(opt.value as EventType);
    // On /en/, options carry data-filter-* so the script filters in-page (preventDefault).
    const enFilterAttrs = locale === 'en' ? ` data-filter-dim="type" data-filter-value="${opt.value}"` : '';
    return `<a href="${opt.url}" class="filter-type-tile${isSelected ? ' is-selected' : ''}" style="--tile-color: ${colorVar}"${enFilterAttrs}>
      <span class="filter-type-dot" style="background: ${colorVar}"></span>
      <span class="filter-type-label">${s.filterTypeLabels[opt.value] || opt.value}</span>
      <span class="filter-type-count">${opt.count}</span>
    </a>`;
  });

  const resetUrl = buildDismissUrl(currentFilters, 'type');

  return `<div class="filter-panel" data-panel-for="type">
    <button class="filter-panel-close" aria-label="${s.filterClose}">&times;</button>
    <div class="filter-sheet-handle"></div>
    <div class="filter-sheet-title">${s.filterType}</div>
    <div class="filter-type-grid">
      ${tiles.join('\n      ')}
    </div>
    <div class="filter-panel-footer">
      <a href="${resetUrl}" class="filter-reset">${s.filterReset}</a>
      <span class="filter-panel-footer-count">${totalCount} ${s.filterEventsWord}</span>
    </div>
  </div>`;
}

function renderPricePanel(prices: FilterCountOption[], currentFilters: Filters, s: UIStrings, locale: Locale): string {
  const rows = prices.map(opt => {
    const isSelected = currentFilters.price === opt.value;
    const enFilterAttrs = locale === 'en' ? ` data-filter-dim="price" data-filter-value="${opt.value}"` : '';
    return `<a href="${opt.url}" class="filter-radio-row${isSelected ? ' is-selected' : ''}"${enFilterAttrs}>
      <span class="filter-radio-circle"></span>
      <span class="filter-radio-label">${priceOptionLabel(opt.value as PriceFilter, s)}</span>
      <span class="filter-radio-count">${opt.count}</span>
    </a>`;
  });

  return `<div class="filter-panel" data-panel-for="price">
    <button class="filter-panel-close" aria-label="${s.filterClose}">&times;</button>
    <div class="filter-sheet-handle"></div>
    <div class="filter-sheet-title">${s.filterPrice}</div>
    <div class="filter-radio-list">
      ${rows.join('\n      ')}
    </div>
  </div>`;
}

function renderSortPanel(s: UIStrings): string {
  return `<div class="filter-panel" data-panel-for="sort">
    <button class="filter-panel-close" aria-label="${s.filterClose}">&times;</button>
    <div class="filter-sheet-handle"></div>
    <div class="filter-sheet-title">${s.filterSort}</div>
    <div class="filter-radio-list">
      <a href="#" class="filter-radio-row is-selected" data-sort="date">
        <span class="filter-radio-circle"></span>
        <span class="filter-radio-label">${s.filterDate}</span>
      </a>
      <a href="#" class="filter-radio-row" data-sort="price">
        <span class="filter-radio-circle"></span>
        <span class="filter-radio-label">${s.filterPrice}</span>
      </a>
    </div>
  </div>`;
}

// ── Inline Script ────────────────────────────────────

/**
 * IIFE script for filter bar interactivity.
 * Handles: pill toggle, click-outside, escape key, sort-by-price.
 */
export function renderFilterBarScript(): string {
  return `<script>
(function() {
  var pills = document.querySelectorAll('.filter-pill[data-panel]');
  var panels = document.querySelectorAll('.filter-panel');
  var backdrop = document.querySelector('.filter-panel-backdrop');
  var bar = document.querySelector('.filter-bar');
  if (!pills.length) return;

  var isMobile = window.matchMedia('(max-width: 767px)');

  function lockScroll() {
    if (isMobile.matches) document.body.classList.add('scroll-locked');
  }
  function unlockScroll() {
    document.body.classList.remove('scroll-locked');
  }

  function closeAll() {
    pills.forEach(function(p) { p.classList.remove('is-open'); });
    panels.forEach(function(p) {
      p.classList.remove('is-open');
      // S158c: restore any mobile-relocated panel to its original anchor.
      if (p._origParent && p.parentNode === document.body) {
        p._origParent.appendChild(p);
        p._origParent = null;
      }
    });
    if (backdrop) backdrop.classList.remove('is-open');
    if (bar) bar.classList.remove('has-open-panel');
    unlockScroll();
  }

  function openPanel(panelName) {
    closeAll();
    if (bar) bar.classList.add('has-open-panel');
    var pill = document.querySelector('.filter-pill[data-panel="' + panelName + '"]');
    var panel = document.querySelector('.filter-panel[data-panel-for="' + panelName + '"]');
    if (pill && panel) {
      // S158c: on mobile the panel is position:fixed (bottom sheet). Move it to
      // <body> so NO trapping ancestor (.filter-bar sticky/isolation,
      // .filter-bar-scroll mask) captures its containing block — iOS WebKit was
      // resolving "fixed" against the ancestor and dropping the panel into flow
      // below the fold. Desktop (absolute dropdown anchored to the pill) is left
      // untouched: no relocation, so positioning/behavior is unchanged.
      if (isMobile.matches && panel.parentNode !== document.body) {
        panel._origParent = panel.parentNode;
        document.body.appendChild(panel);
      }
      pill.classList.add('is-open');
      panel.classList.add('is-open');
      if (backdrop) backdrop.classList.add('is-open');
      lockScroll();
    }
  }

  pills.forEach(function(pill) {
    pill.addEventListener('click', function(e) {
      e.preventDefault();
      var name = pill.getAttribute('data-panel');
      if (pill.classList.contains('is-open')) {
        closeAll();
      } else {
        openPanel(name);
      }
    });
  });

  if (backdrop) backdrop.addEventListener('click', closeAll);

  document.querySelectorAll('.filter-panel-close').forEach(function(btn) {
    btn.addEventListener('click', function(e) { e.preventDefault(); closeAll(); });
  });

  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') closeAll();
  });

  // Sort by price: reorder .event-card elements by data-price
  var sortLinks = document.querySelectorAll('[data-sort]');
  sortLinks.forEach(function(link) {
    link.addEventListener('click', function(e) {
      e.preventDefault();
      var sortBy = link.getAttribute('data-sort');
      var panel = link.closest('.filter-panel');

      // Update selected state
      if (panel) {
        panel.querySelectorAll('.filter-radio-row').forEach(function(r) {
          r.classList.remove('is-selected');
        });
      }
      link.classList.add('is-selected');
      closeAll();

      var grid = document.querySelector('.card-grid');
      if (!grid) return;

      var cards = Array.from(grid.querySelectorAll('.event-card'));
      var headers = Array.from(grid.querySelectorAll('.date-group-header'));

      if (sortBy === 'price') {
        // Remove date headers, sort cards by price
        headers.forEach(function(h) { h.remove(); });
        cards.sort(function(a, b) {
          var pa = parseFloat(a.getAttribute('data-price') || '9999');
          var pb = parseFloat(b.getAttribute('data-price') || '9999');
          return pa - pb;
        });
        cards.forEach(function(card) { grid.appendChild(card); });
      } else {
        // Restore date sort: reload the page (simplest for static site)
        window.location.reload();
      }
    });
  });

  // ── In-page filtering on /en/ (type + price). EL keeps combo navigation. ──
  // Date dimension stays navigation (links re-pointed to /en/{time}/ server-side).
  if (document.documentElement.lang === 'en') {
    var grid = document.querySelector('.card-grid');
    var emptyState = document.querySelector('.filter-empty-state');
    var countEl = document.querySelector('.filter-result-count');
    var eventsWord = countEl ? (countEl.getAttribute('data-events-word') || '') : '';
    var active = { type: null, price: null };

    // Capture default pill labels before any selection (chevron carries no text).
    document.querySelectorAll('.filter-pill[data-panel="type"], .filter-pill[data-panel="price"]').forEach(function(p) {
      p.setAttribute('data-default-label', p.textContent.trim());
    });

    function applyFilter() {
      if (!grid) return;
      var visible = 0;
      grid.querySelectorAll('.event-card').forEach(function(card) {
        var ok = (!active.type || card.getAttribute('data-type') === active.type) &&
                 (!active.price || card.getAttribute('data-price-type') === active.price);
        card.style.display = ok ? '' : 'none';
        if (ok) visible++;
      });
      // Hide date-group headers + groups with no visible card.
      grid.querySelectorAll('.date-group').forEach(function(group) {
        var anyVisible = false;
        group.querySelectorAll('.event-card').forEach(function(c) {
          if (c.style.display !== 'none') anyVisible = true;
        });
        group.style.display = anyVisible ? '' : 'none';
        var header = group.previousElementSibling;
        if (header && header.classList.contains('date-group-header')) {
          header.style.display = anyVisible ? '' : 'none';
        }
      });
      if (countEl) countEl.textContent = visible + ' ' + eventsWord;
      if (emptyState) emptyState.style.display = visible === 0 ? '' : 'none';
    }

    function updatePill(dim) {
      var pill = document.querySelector('.filter-pill[data-panel="' + dim + '"]');
      if (!pill) return;
      var chev = pill.querySelector('.filter-pill-chevron');
      var panel = document.querySelector('.filter-panel[data-panel-for="' + dim + '"]');
      var sel = panel ? panel.querySelector('[data-filter-dim].is-selected .filter-type-label, [data-filter-dim].is-selected .filter-radio-label') : null;
      var label = (active[dim] && sel) ? sel.textContent : (pill.getAttribute('data-default-label') || '');
      pill.textContent = label + ' ';
      if (chev) pill.appendChild(chev);
      pill.classList.toggle('is-active', !!active[dim]);
    }

    document.querySelectorAll('[data-filter-dim]').forEach(function(opt) {
      opt.addEventListener('click', function(e) {
        e.preventDefault();
        var dim = opt.getAttribute('data-filter-dim');
        var val = opt.getAttribute('data-filter-value');
        var panel = opt.closest('.filter-panel');
        var wasActive = active[dim] === val;
        if (panel) panel.querySelectorAll('[data-filter-dim]').forEach(function(o) { o.classList.remove('is-selected'); });
        if (wasActive) {
          active[dim] = null;
        } else {
          active[dim] = val;
          opt.classList.add('is-selected');
        }
        updatePill(dim);
        applyFilter();
        closeAll();
      });
    });
  }
})();
</script>`;
}
