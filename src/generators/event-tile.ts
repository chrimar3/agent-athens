/**
 * S161 — Imageless event-card typographic tile (Satori → inline SVG).
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
import type { Event } from '../types';
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
  const innerWidth = o.width - PADDING * 2;

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
// synchronous. Satori is async. We bridge by precomputing tile SVGs for every
// imageless event once per build, storing them in a module-level Map keyed by
// event.id, and exposing a sync getter the renderers call. Mirrors the
// generateEventOgImages() pattern at src/generators/og-image.ts (build-time
// batch, called from src/generate-site.ts).

const tileCache = new Map<string, string>();

/**
 * Generate inline-SVG tiles for every imageless event in `events` and cache them
 * by id. An event is "imageless" when none of imageLocal/imageUrl/venueImage are
 * set — the same predicate the card renderers use to pick the fallback branch.
 *
 * Returns the number of tiles generated. Safe to call multiple times per build
 * (later calls overwrite earlier cache entries for the same id).
 */
export async function precomputeEventTiles(events: Event[]): Promise<number> {
  const imageless = events.filter(
    e => !e.imageLocal && !e.imageUrl && !e.venueImage,
  );
  for (const event of imageless) {
    const svg = await generateEventTile(event);
    tileCache.set(event.id, svg);
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
