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
  return `<div class="search-overlay" aria-hidden="true">
  <div class="search-overlay-backdrop"></div>
  <div class="search-overlay-panel" role="dialog" aria-label="Αναζήτηση">
    <div class="search-input-wrapper">
      <svg class="search-input-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
      </svg>
      <input class="search-input" type="text" placeholder="Αναζήτηση εκδηλώσεων…" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">
    </div>
    <div class="search-results">
      <div class="search-group" data-group="events">
        <h3 class="search-group-title">Εκδηλώσεις</h3>
        <div class="search-group-items"></div>
      </div>
      <div class="search-group" data-group="venues">
        <h3 class="search-group-title">Χώροι</h3>
        <div class="search-group-items"></div>
      </div>
      <div class="search-group" data-group="categories">
        <h3 class="search-group-title">Κατηγορίες</h3>
        <div class="search-group-items"></div>
      </div>
    </div>
    <div class="search-empty" style="display:none">Δεν βρέθηκαν αποτελέσματα</div>
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
  if (!overlay || !input) return;

  var fuseEvents, fuseVenues, fuseCategories;
  var indexData = null;
  var loaded = false;
  var debounceTimer;

  function norm(s) {
    return s.toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '');
  }

  function makeEl(tag, cls) {
    var el = document.createElement(tag);
    if (cls) el.className = cls;
    return el;
  }

  function open() {
    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('scroll-locked');
    input.value = '';
    clearResults();
    setTimeout(function() { input.focus(); }, 50);
    if (!loaded) loadIndex();
  }

  function close() {
    overlay.classList.remove('is-open');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('scroll-locked');
    input.value = '';
    clearResults();
  }

  function clearResults() {
    var groups = resultsEl.querySelectorAll('.search-group-items');
    for (var i = 0; i < groups.length; i++) {
      while (groups[i].firstChild) groups[i].removeChild(groups[i].firstChild);
    }
    var sections = resultsEl.querySelectorAll('.search-group');
    for (var i = 0; i < sections.length; i++) sections[i].style.display = 'none';
    emptyEl.style.display = 'none';
  }

  function loadIndex() {
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
    }).catch(function(err) {
      console.error('Search index load failed:', err);
    });
  }

  function renderEventResult(e) {
    var el = makeEl('a', 'search-result-item');
    el.href = '/events/' + e.slug + '/';
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
    return el;
  }

  function renderVenueResult(v) {
    var el = makeEl('a', 'search-result-item');
    el.href = '/venues/' + v.slug + '/';
    var text = makeEl('div', 'search-result-text');
    var title = makeEl('div', 'search-result-title');
    title.textContent = v.name;
    var meta = makeEl('div', 'search-result-meta');
    meta.textContent = (v.neighborhood ? v.neighborhood + ' \\u00B7 ' : '') + v.eventCount + ' \\u03B5\\u03BA\\u03B4\\u03B7\\u03BB\\u03CE\\u03C3\\u03B5\\u03B9\\u03C2';
    text.appendChild(title);
    text.appendChild(meta);
    el.appendChild(text);
    return el;
  }

  function renderCategoryResult(c) {
    var el = makeEl('a', 'search-result-item');
    el.href = '/' + c.slug + '/';
    var text = makeEl('div', 'search-result-text');
    var title = makeEl('div', 'search-result-title');
    title.textContent = c.title;
    var meta = makeEl('div', 'search-result-meta');
    meta.textContent = c.count + ' \\u03B5\\u03BA\\u03B4\\u03B7\\u03BB\\u03CE\\u03C3\\u03B5\\u03B9\\u03C2';
    text.appendChild(title);
    text.appendChild(meta);
    el.appendChild(text);
    return el;
  }

  function search(query) {
    if (!loaded || !indexData) return;
    var q = norm(query);
    if (q.length < 2) { clearResults(); return; }

    var eventResults = fuseEvents.search(q, { limit: 5 });
    var venueResults = fuseVenues.search(q, { limit: 5 });
    var catResults = fuseCategories.search(q, { limit: 5 });

    clearResults();

    var hasResults = eventResults.length > 0 || venueResults.length > 0 || catResults.length > 0;
    emptyEl.style.display = hasResults ? 'none' : 'block';

    if (eventResults.length > 0) {
      var group = resultsEl.querySelector('[data-group="events"]');
      group.style.display = '';
      var items = group.querySelector('.search-group-items');
      eventResults.forEach(function(r) { items.appendChild(renderEventResult(r.item)); });
    }

    if (venueResults.length > 0) {
      var group = resultsEl.querySelector('[data-group="venues"]');
      group.style.display = '';
      var items = group.querySelector('.search-group-items');
      venueResults.forEach(function(r) { items.appendChild(renderVenueResult(r.item)); });
    }

    if (catResults.length > 0) {
      var group = resultsEl.querySelector('[data-group="categories"]');
      group.style.display = '';
      var items = group.querySelector('.search-group-items');
      catResults.forEach(function(r) { items.appendChild(renderCategoryResult(r.item)); });
    }
  }

  // Event listeners
  if (searchBtn) searchBtn.addEventListener('click', open);
  backdrop.addEventListener('click', close);
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && overlay.classList.contains('is-open')) close();
  });

  input.addEventListener('input', function() {
    clearTimeout(debounceTimer);
    var val = input.value;
    debounceTimer = setTimeout(function() { search(val); }, 150);
  });
})();
</script>`;
}
