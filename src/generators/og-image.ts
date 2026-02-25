/**
 * OG Image & Favicon Generator
 *
 * Generates ~16 OG images (1 site default + 15 type defaults)
 * and a favicon set using satori + @resvg/resvg-js.
 *
 * All output goes to dist/images/og/ and dist/ (favicons).
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';

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
  bg: '#0d0d0d',
  text: '#f0f0f0',
  textSecondary: '#a0a0a0',
  textTertiary: '#707070',
  accent: '#5ba4e6',
};

// Type colors from CSS custom properties
const TYPE_COLORS: Record<string, string> = {
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
  writeFileSync(join(ogDir, 'agentathens-default.png'), siteDefault);

  // Type defaults
  const types = Object.keys(TYPE_COLORS);
  for (const type of types) {
    const png = await generateTypeDefault(type);
    const filename = `${type.replace('_', '-')}-default.png`;
    writeFileSync(join(ogDir, filename), png);
  }

  console.log(`  ✓ Generated ${types.length + 1} OG images`);
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
  <rect width="32" height="32" rx="6" fill="#0d0d0d"/>
  <text x="16" y="24" font-family="system-ui, -apple-system, sans-serif" font-size="22" font-weight="700" fill="#5ba4e6" text-anchor="middle">a</text>
</svg>`;
  writeFileSync(join(DIST_DIR, 'favicon.svg'), faviconSvg);

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
  writeFileSync(join(DIST_DIR, 'favicon-32x32.png'), svgToPng(favicon32Svg, 32));

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
  writeFileSync(join(DIST_DIR, 'apple-touch-icon.png'), svgToPng(appleSvg, 180));

  console.log('  ✓ Generated favicon set (SVG + 32px PNG + Apple Touch Icon)');
}
