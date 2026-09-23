import he from 'he';
import type { Locale } from '../i18n/strings';
import { STRINGS } from '../i18n/strings';
import type { Event } from '../types';
import { displayTitle } from '../utils/display-title';

export function escapeAttr(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const ACTIONBAR_BOOKMARK_ICON = '<svg class="edp-save-btn__icon" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>';
const CARD_BOOKMARK_ICON = '<svg class="card-save-btn__icon" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>';
const SHARE_ICON = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>';
const CALENDAR_ICON = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>';

export { CALENDAR_ICON };

export function renderActionBarHtml(
  eventId: string,
  slug: string,
  title: string,
  canonicalUrl: string,
  locale: Locale = 'el',
  meta: SaveMeta = {}
): string {
  const t = STRINGS[locale];
  // decode-then-escape: pre-S154 DB rows carry HTML entities; bare escapeAttr
  // would double-escape (&amp; → &amp;amp;). he.decode is idempotent on already-
  // decoded text. Same pattern as the meta-attr seam in event-page.ts.
  const safeTitle = escapeAttr(displayTitle(title, meta.venue));
  return `<div class="edp-action-bar">
          <button class="edp-save-btn" data-save-event data-event-english="${locale === 'en'}" data-event-id="${eventId}" data-event-slug="${slug}" data-event-title="${safeTitle}"${saveMetaAttrs(meta)} data-save-label="${t.saveEvent}" data-unsave-label="${t.unsaveEvent}" type="button" aria-pressed="false" aria-label="${t.saveEvent}">
            ${ACTIONBAR_BOOKMARK_ICON}
            <span class="edp-save-label">${t.saveEvent}</span>
          </button>
          <button class="edp-share-btn" data-share-url="${canonicalUrl}" data-toast-text="${escapeAttr(t.linkCopied)}" type="button" aria-label="${t.shareEvent}">
            ${SHARE_ICON}
            <span class="edp-share-label">${t.shareEvent}</span>
          </button>
        </div>`;
}

export interface SaveMeta {
  start?: string;
  end?: string;
  venue?: string;
  priceType?: string;
  priceAmount?: number;
}

/** What /saved/ needs to show a row without refetching: date, venue, price. */
export function saveMetaFor(event: Event): SaveMeta {
  const price = event.price as Event['price'] | string | undefined;
  const priceType = typeof price === 'string' ? price : price?.type;
  const priceAmount = typeof price === 'object' && typeof price?.amount === 'number' ? price.amount : undefined;
  return {
    start: event.startDate || undefined,
    end: event.endDate || undefined,
    venue: event.venue?.name ? he.decode(event.venue.name) : undefined,
    priceType,
    priceAmount,
  };
}

function saveMetaAttrs(meta: SaveMeta): string {
  const attrs: string[] = [];
  if (meta.start) attrs.push(`data-event-start="${escapeAttr(meta.start)}"`);
  if (meta.end) attrs.push(`data-event-end="${escapeAttr(meta.end)}"`);
  if (meta.venue) attrs.push(`data-event-venue="${escapeAttr(meta.venue)}"`);
  if (meta.priceType) attrs.push(`data-event-price-type="${escapeAttr(meta.priceType)}"`);
  if (meta.priceAmount !== undefined) attrs.push(`data-event-price-amount="${meta.priceAmount}"`);
  return attrs.length ? ' ' + attrs.join(' ') : '';
}

export function renderSavedPageBody(locale: Locale): string {
  const st = STRINGS[locale];
  return `
    <h1>${st.savedEvents}</h1>
    <noscript><p>${st.savedRequiresJs}</p></noscript>
    <div id="saved-events-list" class="saved-events-container">
      <section id="saved-upcoming" class="saved-section" hidden><h2 class="saved-section__title">${st.savedUpcoming}</h2><div class="saved-section__list"></div></section>
      <section id="saved-past" class="saved-section saved-section--past" hidden><h2 class="saved-section__title">${st.savedPast}</h2><div class="saved-section__list"></div></section>
    </div>
    <div class="saved-empty-state" id="saved-empty" style="display:none">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
      <p>${st.savedEventsEmpty}</p>
      <p><a class="saved-empty-state__cta" href="${locale === 'en' ? '/en/this-weekend/' : '/this-weekend/'}">${st.savedBrowseWeekend}</a></p>
    </div>`;
}

export function renderCardSaveButton(eventId: string, slug: string, title: string, hasEnglish = false, meta: SaveMeta = {}, locale: Locale = 'el'): string {
  return `<button class="card-save-btn" data-event-english="${hasEnglish}" data-event-id="${eventId}" data-event-slug="${slug}" data-event-title="${escapeAttr(displayTitle(title, meta.venue))}"${saveMetaAttrs(meta)} type="button" aria-pressed="false" aria-label="${escapeAttr(STRINGS[locale].saveEventAria)}">${CARD_BOOKMARK_ICON}</button>`;
}

export function renderSavedEventsScript(): string {
  return `<script>
(function() {
  var KEY = 'agent-athens-saved';
  var MAX = 200;
  var memory = [];
  var storageUnavailable = false;
  var META = ['start', 'end', 'venue', 'priceType'];
  function withMeta(entry, obj) {
    META.forEach(function(k) { if (obj[k]) entry[k] = obj[k]; });
    if (typeof obj.priceAmount === 'number') entry.priceAmount = obj.priceAmount;
    return entry;
  }
  function normalize(value) {
    if (!Array.isArray(value)) return [];
    var seen = new Set();
    return value.filter(function(e) {
      if (!e || typeof e.eventId !== 'string' || !e.eventId || typeof e.title !== 'string' || typeof e.slug !== 'string' || !e.slug) return false;
      if (seen.has(e.eventId)) return false;
      seen.add(e.eventId);
      return true;
    }).map(function(e) {
      var out = { eventId: e.eventId, title: e.title, savedAt: e.savedAt, hasEnglish: e.hasEnglish === true, slug: e.slug.replace(/^\\/(en\\/)?events\\//, '').replace(/\\/$/, '') };
      META.forEach(function(k) { if (typeof e[k] === 'string' && e[k]) out[k] = e[k]; });
      if (typeof e.priceAmount === 'number' && isFinite(e.priceAmount)) out.priceAmount = e.priceAmount;
      return out;
    }).filter(function(e) { return e.slug && e.slug !== '.' && e.slug !== '..' && !/[\\/\\\\]/.test(e.slug); }).slice(0, MAX);
  }
  function read() {
    if (storageUnavailable) return memory.slice();
    try { memory = normalize(JSON.parse(localStorage.getItem(KEY) || '[]')); }
    catch(e) { /* Keep the current session usable when storage is blocked. */ }
    return memory.slice();
  }
  function write(arr) {
    memory = normalize(arr);
    try { localStorage.setItem(KEY, JSON.stringify(memory)); storageUnavailable = false; } catch(e) { storageUnavailable = true; }
    document.dispatchEvent(new CustomEvent('aa:saved-change'));
  }
  window.__aaSaved = {
    get: read,
    isSaved: function(id) { return read().some(function(e) { return e.eventId === id; }); },
    save: function(obj) {
      var arr = read().filter(function(e) { return e.eventId !== obj.eventId; });
      arr.unshift(withMeta({ eventId: obj.eventId, savedAt: new Date().toISOString(), slug: obj.slug, title: obj.title, hasEnglish: obj.hasEnglish === true }, obj));
      if (arr.length > MAX) arr = arr.slice(0, MAX);
      write(arr);
    },
    unsave: function(id) {
      write(read().filter(function(e) { return e.eventId !== id; }));
    },
    count: function() { return read().length; },
    fromButton: function(btn) {
      var d = btn.dataset;
      var amount = d.eventPriceAmount === undefined ? undefined : Number(d.eventPriceAmount);
      return {
        eventId: d.eventId, slug: d.eventSlug, title: d.eventTitle, hasEnglish: d.eventEnglish === 'true',
        start: d.eventStart, end: d.eventEnd, venue: d.eventVenue, priceType: d.eventPriceType,
        priceAmount: typeof amount === 'number' && isFinite(amount) ? amount : undefined
      };
    },
    // Pages that render a save button know the event's current date/venue/price;
    // folding them into an existing save repairs pre-meta saves and date moves.
    refresh: function(obj) {
      var arr = read();
      var changed = false;
      arr.forEach(function(e) {
        if (e.eventId !== obj.eventId) return;
        var before = JSON.stringify(e);
        withMeta(e, obj);
        if (JSON.stringify(e) !== before) changed = true;
      });
      if (changed) write(arr);
    },
    toggle: function(obj) {
      if (window.__aaSaved.isSaved(obj.eventId)) { window.__aaSaved.unsave(obj.eventId); return false; }
      window.__aaSaved.save(obj); return true;
    }
  };
  window.addEventListener('storage', function(e) {
    if (e.key === KEY || e.key === null) { storageUnavailable = false; document.dispatchEvent(new CustomEvent('aa:saved-change')); }
  });
  function syncCount() {
    var n = read().length;
    document.querySelectorAll('[data-saved-count]').forEach(function(el) {
      el.textContent = n > 0 ? String(n) : '';
      if (n > 0) { el.removeAttribute('hidden'); } else { el.setAttribute('hidden', ''); }
    });
  }
  document.addEventListener('aa:saved-change', syncCount);
  syncCount();
})();
</script>`;
}

export function renderSaveButtonScript(): string {
  return `<script>
(function() {
  if (!window.__aaSaved) return;
  var btns = document.querySelectorAll('[data-save-event]');
  function sync() {
    btns.forEach(function(btn) {
      var id = btn.dataset.eventId;
      var saved = window.__aaSaved.isSaved(id);
      btn.classList.toggle('is-saved', saved);
      btn.setAttribute('aria-pressed', saved ? 'true' : 'false');
      btn.setAttribute('aria-label', saved ? btn.dataset.unsaveLabel : btn.dataset.saveLabel);
      var label = btn.querySelector('.edp-save-label');
      if (label) label.textContent = saved ? btn.dataset.unsaveLabel : btn.dataset.saveLabel;
    });
  }
  btns.forEach(function(btn) {
    btn.addEventListener('click', function() {
      window.__aaSaved.toggle(window.__aaSaved.fromButton(btn));
    });
    if (window.__aaSaved.isSaved(btn.dataset.eventId)) window.__aaSaved.refresh(window.__aaSaved.fromButton(btn));
  });
  document.addEventListener('aa:saved-change', sync);
  sync();
})();
</script>`;
}

export function renderCardSaveScript(): string {
  return `<script>
(function() {
  if (!window.__aaSaved) return;
  function syncAll() {
    document.querySelectorAll('.card-save-btn').forEach(function(btn) {
      var saved = window.__aaSaved.isSaved(btn.dataset.eventId);
      btn.classList.toggle('is-saved', saved);
      btn.setAttribute('aria-pressed', saved ? 'true' : 'false');
      var L = document.documentElement.lang === 'en' ? ${JSON.stringify({ save: STRINGS.en.saveEventAria, unsave: STRINGS.en.unsaveEventAria })} : ${JSON.stringify({ save: STRINGS.el.saveEventAria, unsave: STRINGS.el.unsaveEventAria })};
      btn.setAttribute('aria-label', saved ? L.unsave : L.save);
    });
  }
  document.addEventListener('click', function(e) {
    var btn = e.target.closest('.card-save-btn');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    window.__aaSaved.toggle(window.__aaSaved.fromButton(btn));
  });
  // Card-body click delegation: the stretched-link ::before overlay wins
  // touch/pointer hit-testing but Chrome's SYNTHESIZED mouse click re-hit-
  // tests and lands on the card media/wrapper (not an ancestor of the
  // anchor), silently killing taps on most of the card's surface. Route any
  // non-interactive click inside a card to its link.
  document.addEventListener('click', function(e) {
    if (e.defaultPrevented) return;
    if (e.target.closest('a, button, summary, input, [role="button"]')) return;
    var card = e.target.closest('.event-card, .event-card-list, .event-card-feature, .event-card-featured-editorial');
    if (!card) return;
    var link = card.querySelector('.card-link');
    if (link) link.click();
  });
  document.querySelectorAll('.card-save-btn').forEach(function(btn) {
    if (window.__aaSaved.isSaved(btn.dataset.eventId)) window.__aaSaved.refresh(window.__aaSaved.fromButton(btn));
  });
  document.addEventListener('aa:saved-change', syncAll);
  syncAll();
})();
</script>`;
}

export function renderShareButtonScript(): string {
  return `<script>
(function() {
  var btn = document.querySelector('.edp-share-btn');
  if (!btn) return;
  var url = btn.dataset.shareUrl;
  var toastText = btn.dataset.toastText;
  var titleEl = document.querySelector('.edp-title');

  function showToast(msg) {
    var existing = document.querySelector('.aa-toast');
    if (existing) existing.remove();
    var el = document.createElement('div');
    el.className = 'aa-toast';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(function() {
      el.classList.add('is-leaving');
      el.addEventListener('animationend', function() { el.remove(); });
    }, 2000);
  }

  btn.addEventListener('click', function() {
    if (navigator.share) {
      navigator.share({ title: titleEl ? titleEl.textContent : '', url: url }).catch(function() {});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(function() { showToast(toastText); });
    } else {
      var ta = document.createElement('textarea');
      ta.value = url;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      showToast(toastText);
    }
  });
})();
</script>`;
}

export function renderSavedPageScript(locale: Locale): string {
  const t = STRINGS[locale];
  const removeLabel = locale === 'en' ? 'Remove' : 'Αφαίρεση';
  const labels = JSON.stringify({
    remove: removeLabel,
    open: t.freeEntry,
    donation: t.freeDonation,
    ticketed: t.ticketed,
    until: locale === 'en' ? 'until' : 'έως',
    intl: locale === 'en' ? 'en-GB' : 'el-GR',
  });
  return `<script>
(function() {
  if (!window.__aaSaved) return;

  var L = ${labels};
  var EN = ${locale === 'en'};
  var up = document.getElementById('saved-upcoming');
  var past = document.getElementById('saved-past');
  var empty = document.getElementById('saved-empty');
  var list = document.getElementById('saved-events-list');
  if (!up || !past || !empty || !list) return;

  // Stored dates are Athens wall-clock strings ("YYYY-MM-DD" or "…THH:MM:SS");
  // format their parts directly so the viewer's own timezone never shifts them.
  var athensToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Athens', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  var dayFmt = new Intl.DateTimeFormat(L.intl, { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' });
  var endFmt = new Intl.DateTimeFormat(L.intl, { timeZone: 'UTC', day: 'numeric', month: 'short' });
  var DAY = /^(\\d{4})-(\\d{2})-(\\d{2})(?:T(\\d{2}):(\\d{2}))?/;
  function utcNoon(m) { return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12)); }
  function isRunning(item) {
    return !!item.start && item.start.slice(0, 10) < athensToday && !!item.end && item.end.slice(0, 10) >= athensToday;
  }
  function formatWhen(item) {
    if (isRunning(item)) {
      var e = DAY.exec(item.end);
      return e ? L.until + ' ' + endFmt.format(utcNoon(e)) : '';
    }
    var m = DAY.exec(item.start || '');
    if (!m) return '';
    var day = dayFmt.format(utcNoon(m));
    return m[4] && !(m[4] === '00' && m[5] === '00') ? day + ' · ' + m[4] + ':' + m[5] : day;
  }

  function formatPrice(item) {
    if (typeof item.priceAmount === 'number' && item.priceAmount > 0) return '€' + item.priceAmount;
    if (item.priceType === 'open') return L.open;
    if (item.priceType === 'donation') return L.donation;
    if (item.priceType === 'with-ticket') return L.ticketed;
    return '';
  }
  function isPast(item) {
    var last = (item.end || item.start || '').slice(0, 10);
    return !!last && last < athensToday;
  }

  function row(item) {
    var el = document.createElement('div');
    el.className = 'saved-event-item';
    var body = document.createElement('div');
    body.className = 'saved-event-body';
    var a = document.createElement('a');
    a.href = (EN && item.hasEnglish ? '/en/events/' : '/events/') + encodeURIComponent(item.slug) + '/';
    a.textContent = item.title;
    body.appendChild(a);
    var meta = [formatWhen(item), item.venue || '', formatPrice(item)].filter(Boolean).join(' · ');
    if (meta) {
      var p = document.createElement('p');
      p.className = 'saved-event-meta';
      p.textContent = meta;
      body.appendChild(p);
    }
    var btn = document.createElement('button');
    btn.className = 'saved-event-remove';
    btn.setAttribute('data-remove-id', item.eventId);
    btn.type = 'button';
    btn.setAttribute('aria-label', L.remove + ': ' + item.title);
    btn.textContent = L.remove;
    el.appendChild(body);
    el.appendChild(btn);
    return el;
  }

  function fill(section, items) {
    var box = section.querySelector('.saved-section__list');
    while (box.firstChild) box.removeChild(box.firstChild);
    items.forEach(function(item) { box.appendChild(row(item)); });
    section.hidden = items.length === 0;
  }

  function render() {
    var saved = window.__aaSaved.get();
    empty.style.display = saved.length === 0 ? '' : 'none';
    // Undated (pre-meta) saves sort after dated ones until a page repairs them.
    var byStart = function(a, b) { return (a.start || '9999').localeCompare(b.start || '9999'); };
    fill(up, saved.filter(function(i) { return !isPast(i); }).sort(byStart));
    fill(past, saved.filter(isPast).sort(function(a, b) { return byStart(b, a); }));
  }

  list.addEventListener('click', function(e) {
    var btn = e.target.closest('[data-remove-id]');
    if (!btn) return;
    window.__aaSaved.unsave(btn.dataset.removeId);
  });

  document.addEventListener('aa:saved-change', render);
  render();
})();
</script>`;
}
