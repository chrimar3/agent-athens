/**
 * S161 — Imageless event-card typographic tile (Satori → SVG file under dist/tiles/).
 *
 * Replaces the .card-image--fallback gradient (S124) per Design Navigator ruling
 * 2026-06-03. Renders one Satori SVG per imageless event for the on-page card
 * image slot. The OG fallback PNG path (src/generators/og-image.ts) is
 * unchanged — this generator is on-page only.
 *
 * Two render targets share the same generator: 200×267 card slot (default) and
 * a wider canvas for the detail-hero. The 168px text-fit basis (the brief's
 * fit width = card width − 2×padding) only binds the 200-wide card; wider
 * canvases pass through `maxWidth` to the autofit and naturally get more
 * room.
 */
import satori from 'satori';
import { createHash } from 'crypto';
import { join } from 'path';
import type { Event } from '../types';
import { writeFileIfChangedSync } from '../utils/write-if-changed';
import { SATORI_FONTS } from '../utils/satori-fonts';
import { computeTileFit } from '../utils/tile-autofit';
import { formatGreekDateOnly } from '../utils/i18n';
import { decodeHtmlEntities } from '../utils/text-normalize';

/** Color tokens per DN ruling 2026-06-03 (--bg-elevated, --text-primary, --text-tertiary).
 *  Redesign loop 20260707: bg aligned to the media-slot background (--bg-elevated
 *  #151515) so letterboxed placements read seamless, and the brand accent
 *  (--accent-primary) added — the tile is the branded typographic fallback, and
 *  a fallback without the yellow reads as an empty template slot. */
const COLORS = {
  bg: '#151515',
  accent: '#f5e642',
  textPrimary: '#f0f0f0',
  textTertiary: '#888888',
} as const;

const PADDING = 16;

/**
 * Narrow input shape — structurally satisfied by Event (src/types.ts). Defined
 * locally so the tile is testable without the full Event surface area.
 */
export interface TileInput {
  title: string;
  venue: { name: string };
  startDate: string;
}

export interface TileOpts {
  width: number;
  height: number;
}

export const DEFAULT_TILE_OPTS: TileOpts = { width: 200, height: 267 };

/**
 * Generate an inline SVG tile for an imageless event card slot.
 */
export async function generateEventTile(
  event: TileInput,
  opts: Partial<TileOpts> = {},
): Promise<string> {
  const o = { ...DEFAULT_TILE_OPTS, ...opts };
  // Inner width accounts for the 4px yellow spine (borderLeft) — fitting the
  // title to the full padded width made long titles clip at the tile edge.
  const SPINE_WIDTH = 4;
  const innerWidth = o.width - PADDING * 2 - SPINE_WIDTH;

  // F4: Satori renders `children` as a PLAIN STRING — it vectorizes glyphs and
  // does NOT XML-decode. So the text must already be the final human-readable
  // string: decode DB entities ("&amp;" → "&", "&#171;" → "«", "&#39;" → "'"),
  // and do NOT XML-escape. Escaping "&" → "&amp;" made Satori draw the literal
  // "&amp;" — the residual F4 bug the Brief-1 decode-then-ESCAPE missed for
  // &/</>/" (guillemets/apostrophes worked only because escape left them alone).
  // Caught by visual tile verification, not code review.
  const fit = await computeTileFit(decodeHtmlEntities(event.title), { maxWidth: innerWidth });

  const title = fit.displayTitle;
  const venue = decodeHtmlEntities(event.venue.name);
  const dateStr = formatGreekDateOnly(event.startDate);

  return satori(
    {
      type: 'div',
      props: {
        style: {
          width: o.width,
          height: o.height,
          backgroundColor: COLORS.bg,
          padding: PADDING,
          // Reserve the bottom-left corner: the HTML .card-badge overlays the
          // wrapper there (absolute bottom/left) and was covering the tile's
          // venue/date footer.
          paddingBottom: PADDING + 30,
          display: 'flex',
          flexDirection: 'column',
          fontFamily: 'Manrope',
          // Yellow spine — the identity device the intro card established,
          // carried onto every imageless media slot.
          borderLeftWidth: 4,
          borderLeftStyle: 'solid',
          borderLeftColor: COLORS.accent,
        },
        children: [
          // Title block: flex-grows to fill the area above the footer; the
          // title sits centered in that area (DN: "vertically centered upper").
          {
            type: 'div',
            props: {
              style: {
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                color: COLORS.textPrimary,
                fontSize: fit.fontSize,
                fontWeight: 700,
                lineHeight: 1.2,
                // Long unbreakable words (Greek surnames) must wrap, not clip
                // at the tile edge. Mirrored in tile-autofit's measuring probe.
                wordBreak: 'break-word',
              },
              children: title,
            },
          },
          // Footer: date over venue, 12px / 400, tertiary text, bottom-anchored.
          {
            type: 'div',
            props: {
              style: {
                display: 'flex',
                flexDirection: 'column',
                color: COLORS.textTertiary,
                fontSize: 12,
                fontWeight: 400,
                lineHeight: 1.3,
              },
              children: [
                // Date in the accent — mirrors the event-hero's yellow date line.
                { type: 'div', props: { children: dateStr, style: { color: COLORS.accent, fontWeight: 700 } } },
                { type: 'div', props: { children: venue, style: {} } },
              ],
            },
          },
        ],
      },
    },
    { width: o.width, height: o.height, fonts: SATORI_FONTS },
  );
}

// ─── Precompute cache for sync card-render lookup ────────────────────────────
//
// Card renderers (page.ts:renderEventCard, card-variants.ts, event-page.ts) are
// synchronous. Satori is async. We bridge by precomputing tiles for every
// imageless event once per build and exposing a sync getter the renderers
// call. Mirrors generateEventOgImages() in src/generators/og-image.ts.
//
// Each tile is written once to <outDir>/tiles/<content-hash>.svg and cards
// carry a small reference instead of the ~28 KB glyph-path SVG. Constraints:
// - The reference keeps an <svg> root with the tile's viewBox: every
//   `.…-image-wrapper > svg` rule in design-system.css (absolute fill, the
//   96×128 mobile thumb, pointer-events:none) targets it.
// - The tile is loaded as an image, i.e. its own document, so Satori's fixed
//   internal ids cannot collide across cards; that is what allows identical
//   tiles to share one file. Never inline the file content back into a page.

/** Where generate-site's dist/ is; tests pass their own outDir. */
export const DEFAULT_TILE_OUT_DIR = join(import.meta.dir, '../../dist');

const tileCache = new Map<string, string>();

function tileReference(fileName: string, o: TileOpts): string {
  return `<svg width="${o.width}" height="${o.height}" viewBox="0 0 ${o.width} ${o.height}" aria-hidden="true" focusable="false">`
    + `<image href="/tiles/${fileName}" width="${o.width}" height="${o.height}"/></svg>`;
}

/**
 * Generate tiles for every imageless event in `events`, write each distinct
 * tile once to `<outDir>/tiles/`, and cache the card reference by event id.
 * An event is "imageless" when none of imageLocal/imageUrl/venueImage are
 * set — the same predicate the card renderers use to pick the fallback branch.
 *
 * File names are the content hash, so an unchanged tile keeps its URL (and
 * its browser cache entry) across builds, and an unchanged file is not
 * rewritten. Returns the number of events that got a tile.
 */
export async function precomputeEventTiles(
  events: Event[],
  opts: { outDir?: string } = {},
): Promise<number> {
  const tilesDir = join(opts.outDir ?? DEFAULT_TILE_OUT_DIR, 'tiles');
  const imageless = events.filter(
    e => !e.imageLocal && !e.imageUrl && !e.venueImage,
  );
  const written = new Set<string>();
  for (const event of imageless) {
    const svg = await generateEventTile(event);
    const fileName = `${createHash('sha256').update(svg).digest('hex').slice(0, 16)}.svg`;
    if (!written.has(fileName)) {
      writeFileIfChangedSync(join(tilesDir, fileName), svg);
      written.add(fileName);
    }
    tileCache.set(event.id, tileReference(fileName, DEFAULT_TILE_OPTS));
  }
  return imageless.length;
}

/**
 * Sync lookup for the precomputed tile of `eventId`. Returns undefined if the
 * event is imaged (no tile precomputed) OR if precompute was not run for this
 * event. Card renderers should treat undefined as "render an empty card-image
 * div"; a missing tile for an imageless visible event is a build bug surfaced
 * by the Guard-6 verify.
 */
export function getEventTile(eventId: string): string | undefined {
  return tileCache.get(eventId);
}

/** Test/build cleanup hook — clears the precompute cache. */
export function clearEventTileCache(): void {
  tileCache.clear();
}
