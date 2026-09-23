/**
 * Search Overlay — HTML template + client-side JS
 *
 * Pattern follows renderHamburgerMenu() + renderHamburgerScript() in site-chrome.ts.
 * Lazy-loads Fuse.js + search index on first overlay open.
 * Accent-insensitive Greek search via pre-normalized index fields.
 */

/**
 * Render the search overlay HTML (hidden by default, shown via .is-open)
 */
import type { Locale } from '../i18n/strings';

const SEARCH_LABELS = {
  el: { search: 'Αναζήτηση', close: 'Κλείσιμο', placeholder: 'Αναζήτηση εκδηλώσεων…', input: 'Αναζήτηση εκδηλώσεων', clear: 'Καθαρισμός', popular: 'Δημοφιλή', recent: 'Πρόσφατες αναζητήσεις', results: 'Αποτελέσματα αναζήτησης', events: 'Εκδηλώσεις', venues: 'Χώροι', categories: 'Κατηγορίες', empty: 'Δεν βρέθηκαν αποτελέσματα', error: 'Η αναζήτηση δεν είναι διαθέσιμη. Δοκιμάστε ξανά.', retry: 'Δοκιμάστε ξανά', seeAll: 'Δείτε όλα', count: 'αποτελέσματα', eventCount: 'εκδηλώσεις' },
  en: { search: 'Search', close: 'Close', placeholder: 'Search events…', input: 'Search events', clear: 'Clear', popular: 'Popular', recent: 'Recent searches', results: 'Search results', events: 'Events', venues: 'Venues', categories: 'Categories', empty: 'No results found', error: 'Search is unavailable. Please try again.', retry: 'Try again', seeAll: 'See all', count: 'results', eventCount: 'events' },
};

export function renderSearchOverlay(locale: Locale = 'el'): string {
  const t = SEARCH_LABELS[locale];
  return `<div class="search-overlay" role="dialog" aria-modal="true" aria-label="${t.search}" aria-hidden="true">
  <div class="search-overlay-backdrop"></div>
  <div class="search-overlay-panel">
    <button class="search-close-btn" aria-label="${t.close}" type="button">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
    </button>
    <div class="search-input-wrapper">
      <svg class="search-input-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
      </svg>
      <input class="search-input" type="search" placeholder="${t.placeholder}" aria-label="${t.input}" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" role="combobox" aria-expanded="false" aria-controls="search-results-list" aria-activedescendant="" aria-haspopup="listbox">
      <button class="search-clear-btn" aria-label="${t.clear}" type="button" style="display:none">&times;</button>
    </div>
    <div class="search-skeleton" style="display:none">
      <div class="skeleton-row"><div class="skeleton-thumb"></div><div class="skeleton-lines"><div class="skeleton-line"></div><div class="skeleton-line short"></div></div></div>
      <div class="skeleton-row"><div class="skeleton-thumb"></div><div class="skeleton-lines"><div class="skeleton-line"></div><div class="skeleton-line short"></div></div></div>
      <div class="skeleton-row"><div class="skeleton-thumb"></div><div class="skeleton-lines"><div class="skeleton-line"></div><div class="skeleton-line short"></div></div></div>
    </div>
    <div class="search-popular" style="display:none">
      <h3 class="search-group-title">${t.popular}</h3>
      <div class="search-popular-items"></div>
    </div>
    <div class="search-recent" style="display:none">
      <h3 class="search-group-title">${t.recent}</h3>
      <div class="search-recent-items"></div>
    </div>
    <div class="search-results" id="search-results-list" role="listbox" aria-label="${t.results}">
      <div class="search-group" data-group="events" role="group" aria-label="${t.events}">
        <h3 class="search-group-title">${t.events}</h3>
        <div class="search-group-items"></div>
      </div>
      <div class="search-group" data-group="venues" role="group" aria-label="${t.venues}">
        <h3 class="search-group-title">${t.venues}</h3>
        <div class="search-group-items"></div>
      </div>
      <div class="search-group" data-group="categories" role="group" aria-label="${t.categories}">
        <h3 class="search-group-title">${t.categories}</h3>
        <div class="search-group-items"></div>
      </div>
    </div>
    <div class="search-empty" style="display:none">${t.empty}</div>
    <div class="search-error" hidden><p>${t.error}</p><button class="search-retry-btn" type="button">${t.retry}</button></div>
    <div class="sr-only" role="status" aria-live="polite" aria-atomic="true"></div>
  </div>
</div>`;
}

/**
 * Event result order: Fuse relevance first, in bands of 0.05 (scores inside a
 * band are the same match with different field lengths); within a band the
 * sooner start wins (the index lists only current events, so a past start is
 * a running one). Shipped verbatim in the page script and unit-tested from
 * this string.
 */
export const RANK_EVENTS_JS = `function rankEvents(results) {
    function band(r) { return Math.floor((r.score || 0) / 0.05); }
    function when(r) { return String(r.item.startDate || '').slice(0, 10); }
    return results.map(function(r, i) { return { r: r, i: i }; }).sort(function(a, b) {
      var ba = band(a.r), bb = band(b.r);
      if (ba !== bb) return ba - bb;
      var wa = when(a.r), wb = when(b.r);
      if (wa !== wb) return wa < wb ? -1 : 1;
      return a.i - b.i;
    }).map(function(x) { return x.r; });
  }`;

/**
 * Render the client-side search script (IIFE, no external deps at parse time).
 * Uses safe DOM methods (createElement/textContent) instead of innerHTML
 * since index data passes through JSON — defense in depth.
 */
export function renderSearchScript(locale: Locale = 'el'): string {
  return `<script>
(function() {
  var labels = ${JSON.stringify(SEARCH_LABELS[locale])};
  var eventPrefix = '${locale === 'en' ? '/en' : ''}/events/';
  var overlay = document.querySelector('.search-overlay');
  var backdrop = document.querySelector('.search-overlay-backdrop');
  var input = document.querySelector('.search-input');
  var resultsEl = document.querySelector('.search-results');
  var emptyEl = document.querySelector('.search-empty');
  var searchBtn = document.querySelector('.nav-search-btn');
  var closeBtn = document.querySelector('.search-close-btn');
  var clearBtn = document.querySelector('.search-clear-btn');
  var skeletonEl = document.querySelector('.search-skeleton');
  var popularEl = document.querySelector('.search-popular');
  var popularItems = document.querySelector('.search-popular-items');
  var recentEl = document.querySelector('.search-recent');
  var recentItems = document.querySelector('.search-recent-items');
  var liveRegion = overlay ? overlay.querySelector('[role="status"]') : null;
  if (!overlay || !input) return;

  var fuseEvents, fuseVenues, fuseCategories;
  var indexData = null;
  var loaded = false;
  var loading = null;
  var errorEl = overlay.querySelector('.search-error');
  var retryBtn = overlay.querySelector('.search-retry-btn');
  var debounceTimer;
  var returnFocus = null;
  var activeIndex = -1;
  var allItems = [];
  var resultIdCounter = 0;

  // Recent searches (sessionStorage)
  var RECENT_KEY = 'aa_recent_searches';
  var recentSearches = [];
  try {
    var stored = JSON.parse(sessionStorage.getItem(RECENT_KEY) || '[]');
    if (Array.isArray(stored)) recentSearches = stored.filter(function(q) { return typeof q === 'string' && q.trim(); }).slice(0, 5);
  } catch(e) {}

  ${RANK_EVENTS_JS}

  function norm(s) {
    return s.trim().toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '');
  }

  function makeEl(tag, cls) {
    var el = document.createElement(tag);
    if (cls) el.className = cls;
    return el;
  }

  function announce(text) {
    if (liveRegion) liveRegion.textContent = text;
  }

  function collectItems() {
    allItems = Array.from(resultsEl.querySelectorAll('.search-result-item')).filter(function(el) { return el.getClientRects().length > 0; });
  }

  function setActive(idx) {
    if (allItems[activeIndex]) {
      allItems[activeIndex].classList.remove('is-active');
      allItems[activeIndex].setAttribute('aria-selected', 'false');
    }
    activeIndex = idx;
    if (allItems[activeIndex]) {
      allItems[activeIndex].classList.add('is-active');
      allItems[activeIndex].setAttribute('aria-selected', 'true');
      allItems[activeIndex].scrollIntoView({ block: 'nearest' });
      input.setAttribute('aria-activedescendant', allItems[activeIndex].id || '');
    }
  }

  function clearActive() {
    if (allItems[activeIndex]) {
      allItems[activeIndex].classList.remove('is-active');
      allItems[activeIndex].setAttribute('aria-selected', 'false');
    }
    activeIndex = -1;
    allItems = [];
    input.setAttribute('aria-activedescendant', '');
  }

  function showSkeleton() { if (skeletonEl) skeletonEl.style.display = ''; }
  function hideSkeleton() { if (skeletonEl) skeletonEl.style.display = 'none'; }

  function saveRecent(query) {
    var q = query.trim();
    if (!q) return;
    recentSearches = [q].concat(recentSearches.filter(function(s) { return s !== q; })).slice(0, 5);
    try { sessionStorage.setItem(RECENT_KEY, JSON.stringify(recentSearches)); } catch(e) {}
  }

  function renderRecentItems() {
    if (!recentItems) return;
    while (recentItems.firstChild) recentItems.removeChild(recentItems.firstChild);
    recentSearches.forEach(function(q) {
      var btn = makeEl('button', 'search-result-item');
      btn.type = 'button';
      var text = makeEl('div', 'search-result-text');
      var title = makeEl('div', 'search-result-title');
      title.textContent = q;
      text.appendChild(title);
      btn.appendChild(text);
      btn.addEventListener('click', function() {
        input.value = q;
        if (clearBtn) clearBtn.style.display = '';
        search(q);
      });
      recentItems.appendChild(btn);
    });
  }

  function renderPopularItems() {
    if (!popularItems || !indexData || !indexData.popular) return;
    while (popularItems.firstChild) popularItems.removeChild(popularItems.firstChild);
    indexData.popular.forEach(function(e) {
      var el = makeEl('a', 'search-result-item');
      el.href = (e.hasEnglish ? eventPrefix : '/events/') + encodeURIComponent(e.slug) + '/';
      var text = makeEl('div', 'search-result-text');
      var title = makeEl('div', 'search-result-title');
      title.textContent = e.title;
      var meta = makeEl('div', 'search-result-meta');
      meta.textContent = displayDate(e) + ' \\u00B7 ' + e.venue;
      text.appendChild(title);
      text.appendChild(meta);
      el.appendChild(text);
      popularItems.appendChild(el);
    });
  }

  function showEmptyState() {
    resultsEl.style.display = 'none';
    emptyEl.style.display = 'none';
    input.setAttribute('aria-expanded', 'false');
    if (popularEl) popularEl.style.display = (indexData && indexData.popular && indexData.popular.length > 0) ? '' : 'none';
    if (recentEl) {
      renderRecentItems();
      recentEl.style.display = recentSearches.length > 0 ? '' : 'none';
    }
  }

  function hideEmptyState() {
    resultsEl.style.display = '';
    input.setAttribute('aria-expanded', 'true');
    if (popularEl) popularEl.style.display = 'none';
    if (recentEl) recentEl.style.display = 'none';
  }

  function open(query) {
    clearTimeout(debounceTimer);
    returnFocus = document.activeElement;
    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('scroll-locked');
    input.value = typeof query === 'string' ? query : '';
    if (clearBtn) clearBtn.style.display = input.value ? '' : 'none';
    clearResults();
    showEmptyState();
    setTimeout(function() { if (overlay.classList.contains('is-open')) input.focus(); }, 50);
    if (!loaded) loadIndex(); else search(input.value);
  }

  function close() {
    clearTimeout(debounceTimer);
    overlay.classList.remove('is-open');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('scroll-locked');
    input.value = '';
    if (clearBtn) clearBtn.style.display = 'none';
    clearResults();
    clearActive();
    if (returnFocus) { try { returnFocus.focus(); } catch(e) {} }
    returnFocus = null;
  }

  function clearResults() {
    var groups = resultsEl.querySelectorAll('.search-group-items');
    for (var i = 0; i < groups.length; i++) {
      while (groups[i].firstChild) groups[i].removeChild(groups[i].firstChild);
    }
    var seeAll = resultsEl.querySelectorAll('.search-see-all');
    for (var i = 0; i < seeAll.length; i++) seeAll[i].parentNode.removeChild(seeAll[i]);
    var sections = resultsEl.querySelectorAll('.search-group');
    for (var i = 0; i < sections.length; i++) sections[i].style.display = 'none';
    emptyEl.style.display = 'none';
    resultIdCounter = 0;
    clearActive();
  }

  function loadIndex() {
    if (loading) return loading;
    showSkeleton();
    if (errorEl) errorEl.hidden = true;
    input.setAttribute('aria-busy', 'true');
    var controller = new AbortController();
    var timeout;
    var deadline = new Promise(function(_, reject) {
      timeout = setTimeout(function() { controller.abort(); reject(new Error('Search timed out')); }, 15000);
    });
    loading = Promise.race([Promise.all([
      fetch('/search-index.json', { signal: controller.signal }).then(function(r) {
        if (!r.ok) throw new Error('Search HTTP ' + r.status);
        return r.json();
      }),
      import('/scripts/fuse.mjs')
    ]), deadline]).then(function(results) {
      indexData = results[0];
      if (!indexData || !Array.isArray(indexData.events) || !Array.isArray(indexData.venues) || !Array.isArray(indexData.categories)) throw new Error('Invalid search index');
      var Fuse = results[1].default;

      fuseEvents = new Fuse(indexData.events, {
        keys: [
          { name: 'titleN', weight: 2 },
          { name: 'venueN', weight: 1 },
          { name: 'neighborhoodN', weight: 0.5 }
        ],
        threshold: 0.3,
        includeScore: true
      });

      fuseVenues = new Fuse(indexData.venues, {
        keys: [
          { name: 'nameN', weight: 2 },
          { name: 'neighborhoodN', weight: 0.5 }
        ],
        threshold: 0.3,
        includeScore: true
      });

      fuseCategories = new Fuse(indexData.categories, {
        keys: [
          { name: 'titleN', weight: 1.5 }
        ],
        threshold: 0.3,
        includeScore: true
      });

      loaded = true;
      hideSkeleton();
      renderPopularItems();
      if (overlay.classList.contains('is-open')) search(input.value);
    }).catch(function(err) {
      console.error('Search index load failed:', err);
      if (errorEl) errorEl.hidden = false;
      announce(labels.error);
    }).finally(function() {
      clearTimeout(timeout);
      loading = null;
      hideSkeleton();
      input.setAttribute('aria-busy', 'false');
    });
    return loading;
  }
  if (retryBtn) retryBtn.addEventListener('click', function() { loadIndex(); input.focus(); });

  function displayDate(e) {
    if ('${locale}' !== 'en' || !e.startDate) return e.date;
    var date = new Date(e.startDate.slice(0, 10) + 'T12:00:00Z');
    return isNaN(date.getTime()) ? e.date : date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/Athens' });
  }

  function renderEventResult(e) {
    var el = makeEl('a', 'search-result-item');
    el.href = (e.hasEnglish ? eventPrefix : '/events/') + encodeURIComponent(e.slug) + '/';
    el.id = 'sr-' + (++resultIdCounter);
    el.setAttribute('role', 'option');
    el.setAttribute('aria-selected', 'false');
    if (e.thumb) {
      var img = makeEl('img', 'search-result-thumb');
      img.src = e.thumb;
      img.alt = '';
      img.loading = 'lazy';
      img.referrerPolicy = 'no-referrer';
      el.appendChild(img);
    } else {
      el.appendChild(makeEl('span', 'search-result-thumb-placeholder'));
    }
    var text = makeEl('div', 'search-result-text');
    var title = makeEl('div', 'search-result-title');
    title.textContent = e.title;
    var meta = makeEl('div', 'search-result-meta');
    meta.textContent = displayDate(e) + ' \\u00B7 ' + e.venue;
    text.appendChild(title);
    text.appendChild(meta);
    el.appendChild(text);
    el.addEventListener('click', function() { saveRecent(input.value); });
    return el;
  }

  function renderVenueResult(v) {
    var el = makeEl('a', 'search-result-item');
    el.href = '/venues/' + encodeURIComponent(v.slug) + '/';
    el.id = 'sr-' + (++resultIdCounter);
    el.setAttribute('role', 'option');
    el.setAttribute('aria-selected', 'false');
    var text = makeEl('div', 'search-result-text');
    var title = makeEl('div', 'search-result-title');
    title.textContent = v.name;
    var meta = makeEl('div', 'search-result-meta');
    meta.textContent = (v.neighborhood ? v.neighborhood + ' \\u00B7 ' : '') + v.eventCount + ' ' + labels.eventCount;
    text.appendChild(title);
    text.appendChild(meta);
    el.appendChild(text);
    el.addEventListener('click', function() { saveRecent(input.value); });
    return el;
  }

  function renderCategoryResult(c) {
    var el = makeEl('a', 'search-result-item');
    el.href = '/' + c.slug + '/';
    el.id = 'sr-' + (++resultIdCounter);
    el.setAttribute('role', 'option');
    el.setAttribute('aria-selected', 'false');
    var text = makeEl('div', 'search-result-text');
    var title = makeEl('div', 'search-result-title');
    title.textContent = c.title;
    var meta = makeEl('div', 'search-result-meta');
    meta.textContent = c.count + ' ' + labels.eventCount;
    text.appendChild(title);
    text.appendChild(meta);
    el.appendChild(text);
    el.addEventListener('click', function() { saveRecent(input.value); });
    return el;
  }

  function addSeeAllLink(group, matches, renderer) {
    if (matches.length <= 5) return;
    var button = makeEl('button', 'search-see-all');
    button.type = 'button';
    button.textContent = labels.seeAll + ' (' + matches.length + ')';
    button.addEventListener('click', function() {
      var items = group.querySelector('.search-group-items');
      matches.slice(5).forEach(function(r) { items.appendChild(renderer(r.item)); });
      button.remove();
      collectItems();
      input.focus();
      announce(matches.length + ' ' + labels.count);
    });
    group.appendChild(button);
  }

  function search(query) {
    if (!loaded || !indexData || !overlay.classList.contains('is-open')) return;
    var q = norm(query);
    if (q.length < 2) {
      clearResults();
      showEmptyState();
      return;
    }

    hideEmptyState();

    var eventResults = rankEvents(fuseEvents.search(q));
    var venueResults = fuseVenues.search(q);
    var catResults = fuseCategories.search(q);

    clearResults();

    var totalCount = eventResults.length + venueResults.length + catResults.length;
    var hasResults = totalCount > 0;
    emptyEl.style.display = hasResults ? 'none' : 'block';

    if (eventResults.length > 0) {
      var group = resultsEl.querySelector('[data-group="events"]');
      group.style.display = 'block';
      var items = group.querySelector('.search-group-items');
      eventResults.slice(0, 5).forEach(function(r) { items.appendChild(renderEventResult(r.item)); });
      addSeeAllLink(group, eventResults, renderEventResult);
    }

    if (venueResults.length > 0) {
      var group = resultsEl.querySelector('[data-group="venues"]');
      group.style.display = 'block';
      var items = group.querySelector('.search-group-items');
      venueResults.slice(0, 5).forEach(function(r) { items.appendChild(renderVenueResult(r.item)); });
      addSeeAllLink(group, venueResults, renderVenueResult);
    }

    if (catResults.length > 0) {
      var group = resultsEl.querySelector('[data-group="categories"]');
      group.style.display = 'block';
      var items = group.querySelector('.search-group-items');
      catResults.slice(0, 5).forEach(function(r) { items.appendChild(renderCategoryResult(r.item)); });
      addSeeAllLink(group, catResults, renderCategoryResult);
    }

    collectItems();
    announce(totalCount + ' ' + labels.count);
  }

  // Close button
  if (closeBtn) closeBtn.addEventListener('click', close);

  // Clear button
  if (clearBtn) {
    clearBtn.addEventListener('click', function() {
      clearTimeout(debounceTimer);
      input.value = '';
      clearBtn.style.display = 'none';
      clearResults();
      showEmptyState();
      input.focus();
    });
  }

  // Event listeners
  if (searchBtn) searchBtn.addEventListener('click', open);
  if (backdrop) backdrop.addEventListener('click', close);

  // Mobile menu search button
  var mobileSearchBtn = document.querySelector('.mobile-menu-search');
  if (mobileSearchBtn) mobileSearchBtn.addEventListener('click', function() {
    var mobileMenu = document.querySelector('.mobile-menu');
    if (mobileMenu && mobileMenu.classList.contains('open')) {
      mobileMenu.classList.remove('open');
      mobileMenu.setAttribute('aria-hidden', 'true');
      var mobileOverlay = document.querySelector('.mobile-overlay');
      if (mobileOverlay) {
        mobileOverlay.classList.remove('open');
        mobileOverlay.setAttribute('aria-hidden', 'true');
      }
      document.body.classList.remove('scroll-locked-menu');
      var hamburgerBtn = document.querySelector('.hamburger-btn');
      if (hamburgerBtn) hamburgerBtn.setAttribute('aria-expanded', 'false');
    }
    open();
  });

  // Cmd+K / Ctrl+K shortcut
  document.addEventListener('keydown', function(e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      overlay.classList.contains('is-open') ? close() : open();
    }
  });

  // Keyboard navigation
  overlay.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      clearTimeout(debounceTimer);
      e.preventDefault();
      if (input.value) {
        input.value = '';
        if (clearBtn) clearBtn.style.display = 'none';
        clearResults();
        showEmptyState();
        input.focus();
      } else {
        close();
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      collectItems();
      if (allItems.length === 0) return;
      var next = activeIndex < allItems.length - 1 ? activeIndex + 1 : 0;
      setActive(next);
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      collectItems();
      if (allItems.length === 0) return;
      var prev = activeIndex > 0 ? activeIndex - 1 : allItems.length - 1;
      setActive(prev);
      return;
    }

    if (e.key === 'Enter' && activeIndex >= 0 && allItems[activeIndex]) {
      e.preventDefault();
      saveRecent(input.value);
      var href = allItems[activeIndex].href;
      if (href) window.location.href = href;
      else allItems[activeIndex].click();
      return;
    }

    // Focus trap
    if (e.key === 'Tab') {
      var focusable = overlay.querySelectorAll('input, button:not([style*="display:none"]):not([style*="display: none"]), a[href], [tabindex]:not([tabindex="-1"])');
      var focusArr = Array.from(focusable).filter(function(el) { return el.offsetParent !== null; });
      if (focusArr.length === 0) return;
      var first = focusArr[0];
      var last = focusArr[focusArr.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
  });

  // Input handler with clear button toggle
  input.addEventListener('input', function() {
    if (clearBtn) clearBtn.style.display = input.value ? '' : 'none';
    clearTimeout(debounceTimer);
    var val = input.value;
    if (!val || norm(val).length < 2) {
      clearResults();
      showEmptyState();
      return;
    }
    debounceTimer = setTimeout(function() { search(val); }, 150);
  });
  var initialQuery = new URLSearchParams(window.location.search).get('q');
  if (initialQuery) open(initialQuery);
})();
</script>`;
}
