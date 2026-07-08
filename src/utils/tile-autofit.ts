/**
 * S161 — Auto-fit a Greek/English event title into the imageless card tile.
 *
 * Per Design Navigator ruling 2026-06-03:
 *   Manrope Bold 700, fontSize ∈ [sizeMin, sizeMax] = [18, 30]px,
 *   lineHeight 1.2, lineCap 4 with ellipsis on overflow,
 *   maxWidth 168px (200px card slot − 16px × 2 padding).
 *
 * Measurement primitive: Satori itself. Satori vectorizes text into `<path>`
 * glyphs (no `<text>` nodes), so we measure indirectly via the SVG `<mask>`
 * rectangle whose `height` attribute Satori sets to the rendered content
 * height. lineCount = round(maskHeight / (fontSize × lineHeight)).
 *
 * Algorithm: linear-scan sizeMax → sizeMin; the largest size whose layout
 * yields ≤ lineCap lines wins. If even sizeMin overflows, truncate the title
 * by trailing words until it fits, then append '…'.
 *
 * Auto-aligning with Step 2 (same Satori, same fonts, same layout) means the
 * algorithm's wrap decisions match what the tile will actually display.
 */
import satori from 'satori';
import { SATORI_FONTS } from './satori-fonts';

export interface TileFitResult {
  /** Manrope Bold pt value chosen from [sizeMin, sizeMax]. */
  fontSize: number;
  /** Title text the tile should render (truncated + ellipsis when truncated). */
  displayTitle: string;
  /** True when the original title overflowed sizeMin × lineCap and was shortened. */
  truncated: boolean;
  /** Visual line count Satori produced for displayTitle at fontSize. */
  lineCount: number;
}

export interface TileFitOpts {
  maxWidth: number;
  sizeMin: number;
  sizeMax: number;
  lineCap: number;
  lineHeight: number;
}

export const DEFAULT_TILE_FIT_OPTS: TileFitOpts = {
  maxWidth: 168,
  sizeMin: 18,
  sizeMax: 30,
  lineCap: 4,
  lineHeight: 1.2,
};

/**
 * Render the title in an isolated maxWidth-wide block at the given font size
 * and return the visual line count Satori produced.
 */
export async function measureLineCount(
  text: string,
  fontSize: number,
  opts: TileFitOpts = DEFAULT_TILE_FIT_OPTS,
): Promise<number> {
  if (!text) return 0;
  const svg = await satori(
    {
      type: 'div',
      props: {
        style: {
          width: opts.maxWidth,
          fontSize,
          fontWeight: 700,
          fontFamily: 'Manrope',
          lineHeight: opts.lineHeight,
          // Must mirror the tile's title style exactly — the measurement is
          // only valid if the probe wraps the same way the tile does.
          wordBreak: 'break-word',
        },
        children: text,
      },
    },
    { width: opts.maxWidth, height: 9999, fonts: SATORI_FONTS },
  );

  // Satori sets the mask rectangle's height to the rendered content height.
  // We divide by lineHeight-px to recover the visual line count.
  const m = svg.match(/<mask[^>]*>\s*<rect[^>]*height="(\d+(?:\.\d+)?)"/);
  if (!m) return 0;
  const contentHeight = parseFloat(m[1]);
  const lineHeightPx = fontSize * opts.lineHeight;
  return Math.max(1, Math.round(contentHeight / lineHeightPx));
}

/**
 * Compute the optimal fontSize and (possibly-truncated) display title for an
 * imageless tile.
 */
export async function computeTileFit(
  title: string,
  opts: Partial<TileFitOpts> = {},
): Promise<TileFitResult> {
  const o = { ...DEFAULT_TILE_FIT_OPTS, ...opts };
  if (!title) {
    return { fontSize: o.sizeMax, displayTitle: '', truncated: false, lineCount: 0 };
  }

  // Linear scan sizeMax → sizeMin; first size whose layout fits ≤ lineCap wins.
  for (let size = o.sizeMax; size >= o.sizeMin; size--) {
    const lc = await measureLineCount(title, size, o);
    if (lc <= o.lineCap) {
      return { fontSize: size, displayTitle: title, truncated: false, lineCount: lc };
    }
  }

  // Even sizeMin overflows the cap → truncate trailing words and append '…'.
  // Word-boundary truncation: drop the last word, retry, repeat until ≤ cap.
  const words = title.split(/\s+/);
  for (let n = words.length - 1; n > 0; n--) {
    const candidate = words.slice(0, n).join(' ') + '…';
    const lc = await measureLineCount(candidate, o.sizeMin, o);
    if (lc <= o.lineCap) {
      return { fontSize: o.sizeMin, displayTitle: candidate, truncated: true, lineCount: lc };
    }
  }

  // Single-word title that still overflows: accept the overflow at sizeMin.
  const lc = await measureLineCount(title, o.sizeMin, o);
  return { fontSize: o.sizeMin, displayTitle: title, truncated: true, lineCount: lc };
}
