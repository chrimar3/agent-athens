import he from 'he';
import type { Locale } from '../i18n/strings';
import { STRINGS } from '../i18n/strings';

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
  locale: Locale = 'el'
): string {
  const t = STRINGS[locale];
  // decode-then-escape: pre-S154 DB rows carry HTML entities; bare escapeAttr
  // would double-escape (&amp; → &amp;amp;). he.decode is idempotent on already-
  // decoded text. Same pattern as the meta-attr seam in event-page.ts.
  const safeTitle = escapeAttr(he.decode(title));
  return `<div class="edp-action-bar">
          <button class="edp-save-btn" data-save-event data-event-id="${eventId}" data-event-slug="${slug}" data-event-title="${safeTitle}" data-save-label="${t.saveEvent}" data-unsave-label="${t.unsaveEvent}" type="button" aria-pressed="false" aria-label="${t.saveEvent}">
            ${ACTIONBAR_BOOKMARK_ICON}
            <span class="edp-save-label">${t.saveEvent}</span>
          </button>
          <button class="edp-share-btn" data-share-url="${canonicalUrl}" data-toast-text="${escapeAttr(t.linkCopied)}" type="button" aria-label="${t.shareEvent}">
            ${SHARE_ICON}
            <span class="edp-share-label">${t.shareEvent}</span>
          </button>
        </div>`;
}

export function renderCardSaveButton(eventId: string, slug: string, title: string): string {
  return `<button class="card-save-btn" data-event-id="${eventId}" data-event-slug="${slug}" data-event-title="${escapeAttr(he.decode(title))}" type="button" aria-pressed="false" aria-label="Save">${CARD_BOOKMARK_ICON}</button>`;
}

export function renderSavedEventsScript(): string {
  return `<script>
(function() {
  var KEY = 'agent-athens-saved';
  var MAX = 200;
  function read() {
    try { return JSON.parse(localStorage.getItem(KEY) || '[]'); }
    catch(e) { return []; }
  }
  function write(arr) {
    try { localStorage.setItem(KEY, JSON.stringify(arr)); } catch(e) {}
    document.dispatchEvent(new CustomEvent('aa:saved-change'));
  }
  window.__aaSaved = {
    get: read,
    isSaved: function(id) { return read().some(function(e) { return e.eventId === id; }); },
    save: function(obj) {
      var arr = read().filter(function(e) { return e.eventId !== obj.eventId; });
      arr.unshift({ eventId: obj.eventId, savedAt: new Date().toISOString(), slug: obj.slug, title: obj.title });
      if (arr.length > MAX) arr = arr.slice(0, MAX);
      write(arr);
    },
    unsave: function(id) {
      write(read().filter(function(e) { return e.eventId !== id; }));
    },
    count: function() { return read().length; },
    toggle: function(obj) {
      if (window.__aaSaved.isSaved(obj.eventId)) { window.__aaSaved.unsave(obj.eventId); return false; }
      window.__aaSaved.save(obj); return true;
    }
  };
  window.addEventListener('storage', function(e) {
    if (e.key === KEY) document.dispatchEvent(new CustomEvent('aa:saved-change'));
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
      var label = btn.querySelector('.edp-save-label');
      if (label) label.textContent = saved ? btn.dataset.unsaveLabel : btn.dataset.saveLabel;
    });
  }
  btns.forEach(function(btn) {
    btn.addEventListener('click', function() {
      window.__aaSaved.toggle({
        eventId: btn.dataset.eventId,
        slug: btn.dataset.eventSlug,
        title: btn.dataset.eventTitle
      });
    });
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
    });
  }
  document.addEventListener('click', function(e) {
    var btn = e.target.closest('.card-save-btn');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    window.__aaSaved.toggle({
      eventId: btn.dataset.eventId,
      slug: btn.dataset.eventSlug,
      title: btn.dataset.eventTitle
    });
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
  const removeLabel = locale === 'en' ? 'Remove' : 'Αφαίρεση';
  return `<script>
(function() {
  if (!window.__aaSaved) return;

  // Migrate legacy entries: strip /events/ or /en/events/ prefix + trailing slash from slug
  (function migrate() {
    var saved = window.__aaSaved.get();
    var changed = false;
    saved.forEach(function(entry) {
      var s = entry.slug;
      if (s && (s.indexOf('/events/') === 0 || s.indexOf('/en/events/') === 0)) {
        entry.slug = s.replace(/^\\/(en\\/)?events\\//, '').replace(/\\/$/, '');
        changed = true;
      }
    });
    if (changed) {
      try { localStorage.setItem('agent-athens-saved', JSON.stringify(saved)); } catch(e) {}
    }
  })();

  var list = document.getElementById('saved-events-list');
  var empty = document.getElementById('saved-empty');
  if (!list || !empty) return;

  function esc(s) {
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function render() {
    var saved = window.__aaSaved.get();
    if (saved.length === 0) {
      while (list.firstChild) list.removeChild(list.firstChild);
      empty.style.display = '';
      return;
    }
    empty.style.display = 'none';
    while (list.firstChild) list.removeChild(list.firstChild);
    saved.forEach(function(item) {
      var row = document.createElement('div');
      row.className = 'saved-event-item';
      var a = document.createElement('a');
      a.href = '/events/' + esc(item.slug) + '/';
      a.textContent = item.title;
      var btn = document.createElement('button');
      btn.className = 'saved-event-remove';
      btn.setAttribute('data-remove-id', item.eventId);
      btn.type = 'button';
      btn.setAttribute('aria-label', '${removeLabel}');
      btn.textContent = '${removeLabel}';
      row.appendChild(a);
      row.appendChild(btn);
      list.appendChild(row);
    });
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
