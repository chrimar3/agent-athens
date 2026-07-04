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

/** Color tokens per DN ruling 2026-06-03 (--bg-elevated, --text-primary, --text-tertiary). */
const COLORS = {
  bg: '#1a1a1a',
  textPrimary: '#f0f0f0',
  textTertiary: '#888888',
} as const;

const PADDING = 16;

/**
 * Escape XML-special characters for safe rendering in Satori. Mirrors the
 * `escapeForSatori` helper at src/generators/og-image.ts:298 — duplicated
 * (5 lines) rather than imported, to honor the S161 boundary that og-image.ts
 * stays untouched.
 */
function escapeForSatori(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

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

  // F4: decode HTML entities BEFORE autofit + escape. DB titles can carry raw
  // entities (e.g. "C&#39;mon"); escapeForSatori would re-escape the `&` into
  // `&amp;#39;` and render it literally on the tile (the HTML card path decodes
  // natively, so only the SVG tile showed the double-escape). Decode-then-escape
  // matches the S154 meta/action-bar pattern.
  const fit = await computeTileFit(decodeHtmlEntities(event.title), { maxWidth: innerWidth });

  const title = escapeForSatori(fit.displayTitle);
  const venue = escapeForSatori(decodeHtmlEntities(event.venue.name));
  const dateStr = escapeForSatori(formatGreekDateOnly(event.startDate));

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
                { type: 'div', props: { children: dateStr, style: {} } },
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
