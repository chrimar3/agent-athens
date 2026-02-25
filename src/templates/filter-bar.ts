/**
 * Filter Bar — Pill row with dropdown panels for Date, Type, Price, Sort
 *
 * Architecture: Navigation-based filtering. Each option is an <a> tag
 * pointing to a pre-generated static page. JS is minimal — only
 * panel open/close, click-outside dismiss, escape key, scroll lock,
 * and sort-by-price. On mobile (≤767px), panels become bottom sheets.
 */

import type { Event, EventType, TimeRange, Filters, FilterCounts, FilterCountOption, PriceFilter } from '../types';
import { filterEvents } from '../utils/filters';
import { buildURL } from '../utils/urls';
import { BADGE_LABELS } from './page';

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
  { type: 'screening', label: 'Προβολές' },
  { type: 'dance', label: 'Χορός' },
  { type: 'performance', label: 'Performance' },
  { type: 'show', label: 'Show' },
  { type: 'comedy', label: 'Κωμωδία' },
  { type: 'festival', label: 'Φεστιβάλ' },
  { type: 'workshop', label: 'Εργαστήρια' },
  { type: 'conference', label: 'Συνέδρια' },
  { type: 'meetup', label: 'Meetups' },
];

const PRICE_OPTIONS: Array<{ price: PriceFilter; label: string }> = [
  { price: 'open', label: 'Δωρεάν' },
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
  totalCount: number
): string {
  const hasActiveFilters = !!(currentFilters.type || currentFilters.price || (currentFilters.time && currentFilters.time !== 'all-events'));

  // ── Date pill ──
  const timeActive = currentFilters.time && currentFilters.time !== 'all-events'
    ? currentFilters.time
    : null;
  const timeLabel = timeActive
    ? TIME_OPTIONS.find(o => o.time === timeActive)?.label || timeActive
    : 'Ημερομηνία';
  const timeDismissUrl = timeActive ? buildDismissUrl(currentFilters, 'time') : '';
  const datePill = timeActive
    ? `<div class="filter-panel-anchor" data-filter="date">
        <span class="filter-pill is-active">${timeLabel}<a href="${timeDismissUrl}" class="filter-pill-dismiss" aria-label="Remove date filter">&times;</a></span>
      </div>`
    : `<div class="filter-panel-anchor" data-filter="date">
        <button class="filter-pill" data-panel="date">${timeLabel} ${CHEVRON_SVG}</button>
        ${renderDatePanel(counts.timeRanges, currentFilters)}
      </div>`;

  // ── Type pill ──
  const typeActive = currentFilters.type;
  const typeLabel = typeActive
    ? TYPE_OPTIONS.find(o => o.type === typeActive)?.label || typeActive
    : 'Τύπος';
  const typeDismissUrl = typeActive ? buildDismissUrl(currentFilters, 'type') : '';
  const typePill = typeActive
    ? `<div class="filter-panel-anchor" data-filter="type">
        <span class="filter-pill is-active">${typeLabel}<a href="${typeDismissUrl}" class="filter-pill-dismiss" aria-label="Remove type filter">&times;</a></span>
      </div>`
    : `<div class="filter-panel-anchor" data-filter="type">
        <button class="filter-pill" data-panel="type">${typeLabel} ${CHEVRON_SVG}</button>
        ${renderTypePanel(counts.types, currentFilters)}
      </div>`;

  // ── Area pill (disabled — insufficient neighborhood data) ──
  const areaPill = `<button class="filter-pill is-disabled" disabled>Περιοχή ${CHEVRON_SVG}</button>`;

  // ── Price pill ──
  const priceActive = currentFilters.price && currentFilters.price !== 'all'
    ? currentFilters.price
    : null;
  const priceLabel = priceActive
    ? PRICE_OPTIONS.find(o => o.price === priceActive)?.label || priceActive
    : 'Τιμή';
  const priceDismissUrl = priceActive ? buildDismissUrl(currentFilters, 'price') : '';
  const pricePill = priceActive
    ? `<div class="filter-panel-anchor" data-filter="price">
        <span class="filter-pill is-active">${priceLabel}<a href="${priceDismissUrl}" class="filter-pill-dismiss" aria-label="Remove price filter">&times;</a></span>
      </div>`
    : `<div class="filter-panel-anchor" data-filter="price">
        <button class="filter-pill" data-panel="price">${priceLabel} ${CHEVRON_SVG}</button>
        ${renderPricePanel(counts.prices, currentFilters)}
      </div>`;

  // ── Sort pill ──
  const sortPill = `<div class="filter-panel-anchor" data-filter="sort">
    <button class="filter-pill" data-panel="sort">Ταξινόμηση ${CHEVRON_SVG}</button>
    ${renderSortPanel()}
  </div>`;

  // ── Meta (result count + clear all) ──
  const meta = `<div class="filter-bar-meta">
    <span class="filter-result-count">${totalCount} εκδηλώσεις</span>
    ${hasActiveFilters ? `<a href="/" class="filter-clear-all">Καθαρισμός</a>` : ''}
  </div>`;

  return `<div class="filter-bar">
    ${datePill}
    ${typePill}
    ${areaPill}
    ${pricePill}
    ${sortPill}
    ${meta}
  </div>
  <div class="filter-panel-backdrop"></div>`;
}

// ── Panel Renderers ──────────────────────────────────

function renderDatePanel(timeRanges: FilterCountOption[], currentFilters: Filters): string {
  const rows = timeRanges.map(opt => {
    const isSelected = currentFilters.time === opt.value;
    return `<a href="${opt.url}" class="filter-radio-row${isSelected ? ' is-selected' : ''}">
      <span class="filter-radio-circle"></span>
      <span class="filter-radio-label">${opt.label}</span>
      <span class="filter-radio-count">${opt.count}</span>
    </a>`;
  });

  return `<div class="filter-panel" data-panel-for="date">
    <div class="filter-sheet-handle"></div>
    <div class="filter-sheet-title">Ημερομηνία</div>
    <div class="filter-radio-list">
      ${rows.join('\n      ')}
    </div>
  </div>`;
}

function renderTypePanel(types: FilterCountOption[], currentFilters: Filters): string {
  const tiles = types.map(opt => {
    const isSelected = currentFilters.type === opt.value;
    const colorVar = typeColorVar(opt.value as EventType);
    return `<a href="${opt.url}" class="filter-type-tile${isSelected ? ' is-selected' : ''}" style="--tile-color: ${colorVar}">
      <span class="filter-type-dot" style="background: ${colorVar}"></span>
      <span class="filter-type-label">${opt.label}</span>
      <span class="filter-type-count">${opt.count}</span>
    </a>`;
  });

  return `<div class="filter-panel" data-panel-for="type">
    <div class="filter-sheet-handle"></div>
    <div class="filter-sheet-title">Τύπος</div>
    <div class="filter-type-grid">
      ${tiles.join('\n      ')}
    </div>
  </div>`;
}

function renderPricePanel(prices: FilterCountOption[], currentFilters: Filters): string {
  const rows = prices.map(opt => {
    const isSelected = currentFilters.price === opt.value;
    return `<a href="${opt.url}" class="filter-radio-row${isSelected ? ' is-selected' : ''}">
      <span class="filter-radio-circle"></span>
      <span class="filter-radio-label">${opt.label}</span>
      <span class="filter-radio-count">${opt.count}</span>
    </a>`;
  });

  return `<div class="filter-panel" data-panel-for="price">
    <div class="filter-sheet-handle"></div>
    <div class="filter-sheet-title">Τιμή</div>
    <div class="filter-radio-list">
      ${rows.join('\n      ')}
    </div>
  </div>`;
}

function renderSortPanel(): string {
  return `<div class="filter-panel" data-panel-for="sort">
    <div class="filter-sheet-handle"></div>
    <div class="filter-sheet-title">Ταξινόμηση</div>
    <div class="filter-radio-list">
      <a href="#" class="filter-radio-row is-selected" data-sort="date">
        <span class="filter-radio-circle"></span>
        <span class="filter-radio-label">Ημερομηνία</span>
      </a>
      <a href="#" class="filter-radio-row" data-sort="price">
        <span class="filter-radio-circle"></span>
        <span class="filter-radio-label">Τιμή</span>
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
    panels.forEach(function(p) { p.classList.remove('is-open'); });
    if (backdrop) backdrop.classList.remove('is-open');
    unlockScroll();
  }

  function openPanel(panelName) {
    closeAll();
    var pill = document.querySelector('.filter-pill[data-panel="' + panelName + '"]');
    var panel = document.querySelector('.filter-panel[data-panel-for="' + panelName + '"]');
    if (pill && panel) {
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
})();
</script>`;
}
