/**
 * OG Image & Favicon Generator
 *
 * Generates OG images in three tiers:
 * 1. Site default (1 image)
 * 2. Type defaults (15 images, one per event type)
 * 3. Per-event images (for events without photos — title/venue/date branded cards)
 * 4. Per-hub images (hub title + event count)
 *
 * All output goes to dist/images/og/ and subdirectories.
 * Uses satori for flexbox-to-SVG rendering, then resvg for PNG output.
 */

import { readFileSync, mkdirSync, existsSync } from 'fs';
import { writeFileIfChangedSync } from '../utils/write-if-changed';
import { join } from 'path';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import type { Event, HubConfig } from '../types';
import { generateEventSlug } from './event-page';
import { formatGreekDateOnly } from '../utils/i18n';

const DIST_DIR = join(import.meta.dir, '../../dist');
const FONTS_DIR = join(import.meta.dir, '../assets/fonts');

// Load font files as ArrayBuffer (required by satori)
const manropeRegular = readFileSync(join(FONTS_DIR, 'Manrope-Regular.ttf'));
const manropeBold = readFileSync(join(FONTS_DIR, 'Manrope-Bold.ttf'));

const SATORI_FONTS = [
  { name: 'Manrope', data: manropeRegular.buffer, weight: 400 as const, style: 'normal' as const },
  { name: 'Manrope', data: manropeBold.buffer, weight: 700 as const, style: 'normal' as const },
];

// Design tokens (matching design-system.css)
const COLORS = {
  bg: '#111114',
  text: '#f0f0f0',
  textSecondary: '#a0a0a0',
  textTertiary: '#707070',
  accent: '#5ba4e6',
};

// Type colors from CSS custom properties
export const TYPE_COLORS: Record<string, string> = {
  concert: '#f5e642',
  dj_set: '#e040fb',
  exhibition: '#10b981',
  cinema: '#ef5350',
  theater: '#ff7043',
  dance: '#ec407a',
  performance: '#ab47bc',
  workshop: '#29b6f6',
  conference: '#66bb6a',
  show: '#ffa726',
  screening: '#ef5350',
  opera: '#ff7043',
  classical: '#ffa726',
  comedy: '#ffca28',
  festival: '#f5e642',
};

// Greek type names for OG images
const TYPE_NAMES_GREEK: Record<string, string> = {
  concert: 'Συναυλίες',
  dj_set: 'DJ Sets',
  exhibition: 'Εκθέσεις',
  cinema: 'Σινεμά',
  theater: 'Θέατρο',
  dance: 'Χορός',
  performance: 'Παραστάσεις',
  workshop: 'Εργαστήρια',
  conference: 'Συνέδρια',
  show: 'Shows',
  screening: 'Προβολές',
  opera: 'Όπερα',
  classical: 'Κλασική Μουσική',
  comedy: 'Κωμωδία',
  festival: 'Φεστιβάλ',
};

// Emoji per type (used as watermark)
const TYPE_EMOJIS: Record<string, string> = {
  concert: '🎵',
  dj_set: '🎧',
  exhibition: '🎨',
  cinema: '🎬',
  theater: '🎭',
  dance: '💃',
  performance: '🎤',
  workshop: '🛠',
  conference: '🎙',
  show: '✨',
  screening: '🎬',
  opera: '🎼',
  classical: '🎻',
  comedy: '😂',
  festival: '🎪',
};

/**
 * Convert SVG string to PNG buffer via resvg
 */
function svgToPng(svg: string, width: number): Buffer {
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: width },
  });
  return Buffer.from(resvg.render().asPng());
}

/**
 * Generate site default OG image (1200×630)
 * Simple branded card: wordmark + tagline + accent bar
 */
async function generateSiteDefault(): Promise<Buffer> {
  const svg = await satori(
    {
      type: 'div',
      props: {
        style: {
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: COLORS.bg,
          fontFamily: 'Manrope',
        },
        children: [
          {
            type: 'div',
            props: {
              style: {
                width: 120,
                height: 4,
                backgroundColor: COLORS.accent,
                marginBottom: 40,
                borderRadius: 2,
              },
            },
          },
          {
            type: 'div',
            props: {
              style: {
                fontSize: 48,
                fontWeight: 700,
                color: COLORS.text,
                letterSpacing: '-0.5px',
              },
              children: 'agent athens',
            },
          },
          {
            type: 'div',
            props: {
              style: {
                fontSize: 24,
                fontWeight: 400,
                color: COLORS.textSecondary,
                marginTop: 16,
              },
              children: 'Πολιτιστικές εκδηλώσεις στην Αθήνα',
            },
          },
        ],
      },
    },
    {
      width: 1200,
      height: 630,
      fonts: SATORI_FONTS,
    }
  );

  return svgToPng(svg, 1200);
}

/**
 * Generate type-specific default OG image (1200×630)
 * Branded card with type name, accent in type color, watermark emoji
 */
async function generateTypeDefault(type: string): Promise<Buffer> {
  const typeName = TYPE_NAMES_GREEK[type] || type;
  const typeColor = TYPE_COLORS[type] || COLORS.accent;

  const svg = await satori(
    {
      type: 'div',
      props: {
        style: {
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: COLORS.bg,
          fontFamily: 'Manrope',
          position: 'relative',
        },
        children: [
          // Accent bar
          {
            type: 'div',
            props: {
              style: {
                width: 120,
                height: 4,
                backgroundColor: typeColor,
                marginBottom: 40,
                borderRadius: 2,
              },
            },
          },
          // Greek type name
          {
            type: 'div',
            props: {
              style: {
                fontSize: 36,
                fontWeight: 700,
                color: COLORS.text,
              },
              children: typeName,
            },
          },
          // Subtitle
          {
            type: 'div',
            props: {
              style: {
                fontSize: 24,
                fontWeight: 400,
                color: COLORS.textSecondary,
                marginTop: 12,
              },
              children: 'στην Αθήνα',
            },
          },
          // Wordmark bottom-right
          {
            type: 'div',
            props: {
              style: {
                position: 'absolute',
                bottom: 24,
                right: 32,
                fontSize: 14,
                fontWeight: 400,
                color: COLORS.textTertiary,
              },
              children: 'agent athens',
            },
          },
        ],
      },
    },
    {
      width: 1200,
      height: 630,
      fonts: SATORI_FONTS,
    }
  );

  return svgToPng(svg, 1200);
}

/**
 * Generate all OG images (site default + type defaults)
 */
export async function generateOgImages(): Promise<void> {
  const ogDir = join(DIST_DIR, 'images', 'og');
  if (!existsSync(ogDir)) {
    mkdirSync(ogDir, { recursive: true });
  }

  // Site default
  const siteDefault = await generateSiteDefault();
  writeFileIfChangedSync(join(ogDir, 'agentathens-default.png'), siteDefault);

  // Type defaults
  const types = Object.keys(TYPE_COLORS);
  for (const type of types) {
    const png = await generateTypeDefault(type);
    const filename = `${type.replace('_', '-')}-default.png`;
    writeFileIfChangedSync(join(ogDir, filename), png);
  }

  console.log(`  ✓ Generated ${types.length + 1} OG images`);
}

/**
 * Escape XML-special characters for safe rendering in satori.
 * Satori renders text as SVG, so &, <, ", ' can break the output.
 */
function escapeForSatori(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Generate a branded OG image for a single event (1200×630)
 *
 * Layout: dark background, left-edge type color stripe, event title (2 lines max),
 * venue name, formatted date in accent yellow, and wordmark.
 */
export async function generateEventOgImage(event: Event): Promise<Buffer> {
  const typeColor = TYPE_COLORS[event.type] || COLORS.accent;
  const title = escapeForSatori(event.title);
  const venue = escapeForSatori(event.venue.name);
  const dateStr = formatGreekDateOnly(event.startDate);

  const svg = await satori(
    {
      type: 'div',
      props: {
        style: {
          width: '100%',
          height: '100%',
          display: 'flex',
          backgroundColor: COLORS.bg,
          fontFamily: 'Manrope',
          position: 'relative',
        },
        children: [
          // Left color stripe
          {
            type: 'div',
            props: {
              style: {
                width: 6,
                height: '100%',
                backgroundColor: typeColor,
                flexShrink: 0,
              },
            },
          },
          // Content area
          {
            type: 'div',
            props: {
              style: {
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                padding: '60px 60px 60px 54px',
                flex: 1,
                overflow: 'hidden',
              },
              children: [
                // Title — max 2 lines via height limit
                {
                  type: 'div',
                  props: {
                    style: {
                      fontSize: 42,
                      fontWeight: 700,
                      color: COLORS.text,
                      lineHeight: 1.2,
                      maxHeight: 101, // ~2 lines: 2 × (42 × 1.2) ≈ 100.8
                      overflow: 'hidden',
                    },
                    children: title,
                  },
                },
                // Venue
                {
                  type: 'div',
                  props: {
                    style: {
                      fontSize: 24,
                      fontWeight: 400,
                      color: COLORS.textSecondary,
                      marginTop: 20,
                      overflow: 'hidden',
                      maxHeight: 32,
                    },
                    children: venue,
                  },
                },
                // Date
                {
                  type: 'div',
                  props: {
                    style: {
                      fontSize: 22,
                      fontWeight: 700,
                      color: '#f5e642',
                      marginTop: 12,
                    },
                    children: dateStr,
                  },
                },
              ],
            },
          },
          // Wordmark bottom-right
          {
            type: 'div',
            props: {
              style: {
                position: 'absolute',
                bottom: 24,
                right: 32,
                fontSize: 14,
                fontWeight: 400,
                color: COLORS.textTertiary,
              },
              children: 'agent athens',
            },
          },
        ],
      },
    },
    {
      width: 1200,
      height: 630,
      fonts: SATORI_FONTS,
    }
  );

  return svgToPng(svg, 1200);
}

/**
 * Build a content hash for an event's OG-relevant fields.
 * If the hash matches the cached version, the image doesn't need regeneration.
 */
function eventOgHash(event: Event): string {
  const key = `${event.title}|${event.venue.name}|${event.startDate}|${event.type}`;
  return Bun.hash(key).toString(36);
}

/**
 * Load the OG image content-hash cache.
 * Maps slug → hash of the fields used to render the OG image.
 */
function loadOgCache(): Record<string, string> {
  const cachePath = join(DIST_DIR, '.og-cache.json');
  if (!existsSync(cachePath)) return {};
  try {
    return JSON.parse(readFileSync(cachePath, 'utf-8'));
  } catch {
    return {};
  }
}

function saveOgCache(cache: Record<string, string>): void {
  writeFileIfChangedSync(join(DIST_DIR, '.og-cache.json'), JSON.stringify(cache));
}

/**
 * Generate per-event OG images for all events that lack photos.
 * Only targets events where imageLocal, imageUrl, and venueImage are all missing.
 * Uses content-hash caching: skips events whose title/venue/date/type haven't changed.
 */
export async function generateEventOgImages(events: Event[]): Promise<number> {
  const eventsDir = join(DIST_DIR, 'images', 'og', 'events');
  if (!existsSync(eventsDir)) {
    mkdirSync(eventsDir, { recursive: true });
  }

  const imagelessEvents = events.filter(
    e => !e.imageLocal && !e.imageUrl && !e.venueImage
  );

  const previousCache = loadOgCache();
  const newCache: Record<string, string> = {};
  let skipped = 0;

  for (const event of imagelessEvents) {
    const slug = generateEventSlug(event);
    const hash = eventOgHash(event);
    newCache[slug] = hash;

    // Skip if the image already exists and content hasn't changed
    const imagePath = join(eventsDir, `${slug}.png`);
    if (previousCache[slug] === hash && existsSync(imagePath)) {
      skipped++;
      continue;
    }

    const png = await generateEventOgImage(event);
    writeFileIfChangedSync(imagePath, png);
  }

  saveOgCache(newCache);
  const rendered = imagelessEvents.length - skipped;
  console.log(`  ✓ Generated ${rendered} per-event OG images (${skipped} cached, ${imagelessEvents.length} total)`);
  return imagelessEvents.length;
}

/**
 * Generate a branded OG image for a hub page (1200×630)
 *
 * Layout: dark background, left-edge color stripe, hub title,
 * event count subtitle, and wordmark.
 */
export async function generateHubOgImage(
  title: string,
  eventCount: number,
  accentColor: string
): Promise<Buffer> {
  const safeTitle = escapeForSatori(title);

  const svg = await satori(
    {
      type: 'div',
      props: {
        style: {
          width: '100%',
          height: '100%',
          display: 'flex',
          backgroundColor: COLORS.bg,
          fontFamily: 'Manrope',
          position: 'relative',
        },
        children: [
          // Left color stripe
          {
            type: 'div',
            props: {
              style: {
                width: 6,
                height: '100%',
                backgroundColor: accentColor,
                flexShrink: 0,
              },
            },
          },
          // Content area
          {
            type: 'div',
            props: {
              style: {
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                padding: '60px 60px 60px 54px',
                flex: 1,
              },
              children: [
                // Hub title
                {
                  type: 'div',
                  props: {
                    style: {
                      fontSize: 44,
                      fontWeight: 700,
                      color: COLORS.text,
                      lineHeight: 1.2,
                    },
                    children: safeTitle,
                  },
                },
                // Event count subtitle
                {
                  type: 'div',
                  props: {
                    style: {
                      fontSize: 24,
                      fontWeight: 400,
                      color: COLORS.textSecondary,
                      marginTop: 20,
                    },
                    children: `${eventCount} εκδηλώσεις`,
                  },
                },
              ],
            },
          },
          // Wordmark bottom-right
          {
            type: 'div',
            props: {
              style: {
                position: 'absolute',
                bottom: 24,
                right: 32,
                fontSize: 14,
                fontWeight: 400,
                color: COLORS.textTertiary,
              },
              children: 'agent athens',
            },
          },
        ],
      },
    },
    {
      width: 1200,
      height: 630,
      fonts: SATORI_FONTS,
    }
  );

  return svgToPng(svg, 1200);
}

/**
 * Resolve accent color for a hub based on its filter type.
 * Event-type hubs use that type's color; others get the default accent blue.
 */
function getHubAccentColor(config: HubConfig): string {
  if (config.filter.type === 'event_type') {
    return TYPE_COLORS[config.filter.value] || COLORS.accent;
  }
  if (config.filter.type === 'event_types') {
    return TYPE_COLORS[config.filter.values[0]] || COLORS.accent;
  }
  return COLORS.accent;
}

/**
 * Generate per-hub OG images for all hub configs.
 * Takes hub configs and a map of slug → event count (computed by the caller).
 */
export async function generateHubOgImages(
  hubConfigs: HubConfig[],
  hubEventCounts: Map<string, number>
): Promise<number> {
  const hubsDir = join(DIST_DIR, 'images', 'og', 'hubs');
  if (!existsSync(hubsDir)) {
    mkdirSync(hubsDir, { recursive: true });
  }

  let count = 0;
  for (const config of hubConfigs) {
    const eventCount = hubEventCounts.get(config.slug) || 0;
    if (eventCount < 3) continue; // Skip hubs that won't be generated

    const accentColor = getHubAccentColor(config);
    const png = await generateHubOgImage(config.titleEl, eventCount, accentColor);
    writeFileIfChangedSync(join(hubsDir, `${config.slug}.png`), png);
    count++;
  }

  console.log(`  ✓ Generated ${count} per-hub OG images`);
  return count;
}

/**
 * Generate favicon set:
 * - favicon.svg (SVG with Manrope "a")
 * - favicon-32x32.png
 * - apple-touch-icon.png (180×180)
 */
export async function generateFavicons(): Promise<void> {
  // SVG favicon — "a" letterform on rounded rect
  const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="6" fill="#111114"/>
  <text x="16" y="24" font-family="system-ui, -apple-system, sans-serif" font-size="22" font-weight="700" fill="#5ba4e6" text-anchor="middle">a</text>
</svg>`;
  writeFileIfChangedSync(join(DIST_DIR, 'favicon.svg'), faviconSvg);

  // 32×32 PNG favicon via satori
  const favicon32Svg = await satori(
    {
      type: 'div',
      props: {
        style: {
          width: '100%',
          height: '100%',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: COLORS.bg,
          borderRadius: 6,
          fontFamily: 'Manrope',
        },
        children: {
          type: 'div',
          props: {
            style: {
              fontSize: 22,
              fontWeight: 700,
              color: COLORS.accent,
            },
            children: 'a',
          },
        },
      },
    },
    { width: 32, height: 32, fonts: SATORI_FONTS }
  );
  writeFileIfChangedSync(join(DIST_DIR, 'favicon-32x32.png'), svgToPng(favicon32Svg, 32));

  // 180×180 Apple Touch Icon
  const appleSvg = await satori(
    {
      type: 'div',
      props: {
        style: {
          width: '100%',
          height: '100%',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: COLORS.bg,
          borderRadius: 36,
          fontFamily: 'Manrope',
        },
        children: {
          type: 'div',
          props: {
            style: {
              fontSize: 120,
              fontWeight: 700,
              color: COLORS.accent,
            },
            children: 'a',
          },
        },
      },
    },
    { width: 180, height: 180, fonts: SATORI_FONTS }
  );
  writeFileIfChangedSync(join(DIST_DIR, 'apple-touch-icon.png'), svgToPng(appleSvg, 180));

  console.log('  ✓ Generated favicon set (SVG + 32px PNG + Apple Touch Icon)');
}
