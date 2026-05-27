/**
 * Upgrade an athinorama image-server thumbnail to a floor-passing 1200x1440.
 *
 * Athinorama serves images at /Content/ImagesDatabase/p/{W}x{H}/crop/both/...,
 * resizing on demand by the size segment in the URL path. Scrapers capture the
 * 250x300 (and occasionally 300x380) listing thumbnail, whose 250px short side
 * fails the >=300px quality floor. Rewriting the size segment to 1200x1440
 * (same 0.833 ratio as 250x300; crop/both ⇒ the server crops to the request)
 * yields a real high-res poster — verified reachable from a crawler with no
 * Referer (S165 spike: 5/5 HTTP 200, image/webp, 64-163 KB).
 *
 * Mirrors upgradeWordPressThumbnail (image-extractor.ts): a pure, idempotent
 * string transform. Non-athinorama URLs and URLs without an ImagesDatabase size
 * segment pass through unchanged.
 */
export function upgradeAthinoramaImage(url: string): string {
  if (!url) return url;
  return url.replace(
    /(\/Content\/ImagesDatabase\/p\/)\d+x\d+(\/)/i,
    '$11200x1440$2'
  );
}
