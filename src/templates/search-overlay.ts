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
export function renderSearchOverlay(): string {
  return `<div class="search-overlay" role="dialog" aria-modal="true" aria-label="Αναζήτηση" aria-hidden="true">
  <div class="search-overlay-backdrop"></div>
  <div class="search-overlay-panel">
    <button class="search-close-btn" aria-label="Κλείσιμο" type="button">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
    </button>
    <div class="search-input-wrapper">
      <svg class="search-input-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
      </svg>
      <input class="search-input" type="search" placeholder="Αναζήτηση εκδηλώσεων…" aria-label="Αναζήτηση εκδηλώσεων" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" role="combobox" aria-expanded="false" aria-controls="search-results-list" aria-activedescendant="" aria-haspopup="listbox">
      <button class="search-clear-btn" aria-label="Καθαρισμός" type="button" style="display:none">&times;</button>
    </div>
    <div class="search-skeleton" style="display:none">
      <div class="skeleton-row"><div class="skeleton-thumb"></div><div class="skeleton-lines"><div class="skeleton-line"></div><div class="skeleton-line short"></div></div></div>
      <div class="skeleton-row"><div class="skeleton-thumb"></div><div class="skeleton-lines"><div class="skeleton-line"></div><div class="skeleton-line short"></div></div></div>
      <div class="skeleton-row"><div class="skeleton-thumb"></div><div class="skeleton-lines"><div class="skeleton-line"></div><div class="skeleton-line short"></div></div></div>
    </div>
    <div class="search-popular" style="display:none">
      <h3 class="search-group-title">Δημοφιλή</h3>
      <div class="search-popular-items"></div>
    </div>
    <div class="search-recent" style="display:none">
      <h3 class="search-group-title">Πρόσφατες αναζητήσεις</h3>
      <div class="search-recent-items"></div>
    </div>
    <div class="search-results" id="search-results-list" role="listbox" aria-label="Αποτελέσματα αναζήτησης">
      <div class="search-group" data-group="events" role="group" aria-label="Εκδηλώσεις">
        <h3 class="search-group-title">Εκδηλώσεις</h3>
        <div class="search-group-items"></div>
      </div>
      <div class="search-group" data-group="venues" role="group" aria-label="Χώροι">
        <h3 class="search-group-title">Χώροι</h3>
        <div class="search-group-items"></div>
      </div>
      <div class="search-group" data-group="categories" role="group" aria-label="Κατηγορίες">
        <h3 class="search-group-title">Κατηγορίες</h3>
        <div class="search-group-items"></div>
      </div>
    </div>
    <div class="search-empty" style="display:none">Δεν βρέθηκαν αποτελέσματα</div>
    <div class="sr-only" role="status" aria-live="polite" aria-atomic="true"></div>
  </div>
</div>`;
}

/**
 * Render the client-side search script (IIFE, no external deps at parse time).
 * Uses safe DOM methods (createElement/textContent) instead of innerHTML
 * since index data passes through JSON — defense in depth.
 */
export function renderSearchScript(): string {
  return `<script>
(function() {
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
  var debounceTimer;
  var returnFocus = null;
  var activeIndex = -1;
  var allItems = [];
  var resultIdCounter = 0;

  // Recent searches (sessionStorage)
  var RECENT_KEY = 'aa_recent_searches';
  var recentSearches = [];
  try { recentSearches = JSON.parse(sessionStorage.getItem(RECENT_KEY) || '[]'); } catch(e) {}

  function norm(s) {
    return s.toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '');
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
    allItems = Array.from(overlay.querySelectorAll('.search-result-item:not([style*="display: none"])'));
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
      el.href = '/events/' + e.slug + '/';
      var text = makeEl('div', 'search-result-text');
      var title = makeEl('div', 'search-result-title');
      title.textContent = e.title;
      var meta = makeEl('div', 'search-result-meta');
      meta.textContent = e.date + ' \\u00B7 ' + e.venue;
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

  function open() {
    returnFocus = document.activeElement;
    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('scroll-locked');
    input.value = '';
    if (clearBtn) clearBtn.style.display = 'none';
    clearResults();
    showEmptyState();
    setTimeout(function() { input.focus(); }, 50);
    if (!loaded) loadIndex();
  }

  function close() {
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
    showSkeleton();
    Promise.all([
      fetch('/search-index.json').then(function(r) { return r.json(); }),
      import('/scripts/fuse.mjs')
    ]).then(function(results) {
      indexData = results[0];
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
      if (!input.value) showEmptyState();
    }).catch(function(err) {
      console.error('Search index load failed:', err);
      hideSkeleton();
    });
  }

  function renderEventResult(e) {
    var el = makeEl('a', 'search-result-item');
    el.href = '/events/' + e.slug + '/';
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
    meta.textContent = e.date + ' \\u00B7 ' + e.venue;
    text.appendChild(title);
    text.appendChild(meta);
    el.appendChild(text);
    el.addEventListener('click', function() { saveRecent(input.value); });
    return el;
  }

  function renderVenueResult(v) {
    var el = makeEl('a', 'search-result-item');
    el.href = '/venues/' + v.slug + '/';
    el.id = 'sr-' + (++resultIdCounter);
    el.setAttribute('role', 'option');
    el.setAttribute('aria-selected', 'false');
    var text = makeEl('div', 'search-result-text');
    var title = makeEl('div', 'search-result-title');
    title.textContent = v.name;
    var meta = makeEl('div', 'search-result-meta');
    meta.textContent = (v.neighborhood ? v.neighborhood + ' \\u00B7 ' : '') + v.eventCount + ' \\u03B5\\u03BA\\u03B4\\u03B7\\u03BB\\u03CE\\u03C3\\u03B5\\u03B9\\u03C2';
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
    meta.textContent = c.count + ' \\u03B5\\u03BA\\u03B4\\u03B7\\u03BB\\u03CE\\u03C3\\u03B5\\u03B9\\u03C2';
    text.appendChild(title);
    text.appendChild(meta);
    el.appendChild(text);
    el.addEventListener('click', function() { saveRecent(input.value); });
    return el;
  }

  function addSeeAllLink(group, totalCount, query) {
    if (totalCount <= 5) return;
    var link = makeEl('a', 'search-see-all');
    link.href = '/?q=' + encodeURIComponent(query);
    link.textContent = '\\u0394\\u03B5\\u03AF\\u03C4\\u03B5 \\u03CC\\u03BB\\u03B1 (' + totalCount + ')';
    group.appendChild(link);
  }

  function search(query) {
    if (!loaded || !indexData) return;
    var q = norm(query);
    if (q.length < 2) {
      clearResults();
      showEmptyState();
      return;
    }

    hideEmptyState();

    var eventResults = fuseEvents.search(q, { limit: 20 });
    var venueResults = fuseVenues.search(q, { limit: 20 });
    var catResults = fuseCategories.search(q, { limit: 20 });

    clearResults();

    var totalCount = eventResults.length + venueResults.length + catResults.length;
    var hasResults = totalCount > 0;
    emptyEl.style.display = hasResults ? 'none' : 'block';

    if (eventResults.length > 0) {
      var group = resultsEl.querySelector('[data-group="events"]');
      group.style.display = 'block';
      var items = group.querySelector('.search-group-items');
      eventResults.slice(0, 5).forEach(function(r) { items.appendChild(renderEventResult(r.item)); });
      addSeeAllLink(group, eventResults.length, query);
    }

    if (venueResults.length > 0) {
      var group = resultsEl.querySelector('[data-group="venues"]');
      group.style.display = 'block';
      var items = group.querySelector('.search-group-items');
      venueResults.slice(0, 5).forEach(function(r) { items.appendChild(renderVenueResult(r.item)); });
      addSeeAllLink(group, venueResults.length, query);
    }

    if (catResults.length > 0) {
      var group = resultsEl.querySelector('[data-group="categories"]');
      group.style.display = 'block';
      var items = group.querySelector('.search-group-items');
      catResults.slice(0, 5).forEach(function(r) { items.appendChild(renderCategoryResult(r.item)); });
      addSeeAllLink(group, catResults.length, query);
    }

    collectItems();
    announce(totalCount + ' \\u03B1\\u03C0\\u03BF\\u03C4\\u03B5\\u03BB\\u03AD\\u03C3\\u03BC\\u03B1\\u03C4\\u03B1');
  }

  // Close button
  if (closeBtn) closeBtn.addEventListener('click', close);

  // Clear button
  if (clearBtn) {
    clearBtn.addEventListener('click', function() {
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
})();
</script>`;
}
