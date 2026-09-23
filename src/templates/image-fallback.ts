/**
 * Broken card images: hide the <img> and reveal its placeholder sibling.
 *
 * Templates mark card images with IMG_FALLBACK_ATTR (a plain data attribute)
 * and every page that renders cards includes renderImageFallbackScript() in
 * <head>. The script listens for 'error' in the capture phase ('error' does not
 * bubble), so no inline on* handler is needed: the enforced CSP script-src
 * (dist/_headers) blocks inline handlers, and the published-output gate
 * (src/validators/published-artifacts.ts) fails the build on any on*= attribute.
 */

/** The attribute as emitted, ready to drop into an <img> tag. */
export const IMG_FALLBACK_ATTR = 'data-img-fallback';

/**
 * Inline <script> for <head>. Its sha256 is on the inline-script allowlist
 * (src/validators/inline-script-allowlist.ts); a change here changes the hash.
 * The sweep covers images that failed before the listener existed.
 */
export function renderImageFallbackScript(): string {
  return `  <script>
    (function () {
      function fallback(img) {
        img.style.display = 'none';
        var next = img.nextElementSibling;
        if (next) next.style.display = '';
      }
      document.addEventListener('error', function (e) {
        var t = e.target;
        if (t && t.tagName === 'IMG' && t.hasAttribute('data-img-fallback')) fallback(t);
      }, true);
      function sweep() {
        var imgs = document.querySelectorAll('img[data-img-fallback]');
        for (var i = 0; i < imgs.length; i++) {
          if (imgs[i].complete && imgs[i].naturalWidth === 0 && imgs[i].getAttribute('src')) fallback(imgs[i]);
        }
      }
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', sweep);
      else sweep();
    })();
  </script>`;
}
