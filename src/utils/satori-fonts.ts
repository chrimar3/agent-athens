/**
 * Shared Satori font set (Manrope Regular 400 + Bold 700).
 *
 * Loaded once at module init; the same ArrayBuffers are reused across renders.
 * Mirrors the loading pattern in src/generators/og-image.ts (which keeps its own
 * copy to satisfy the S161 boundary — do not modify og-image.ts).
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const FONTS_DIR = join(import.meta.dir, '../assets/fonts');

const manropeRegular = readFileSync(join(FONTS_DIR, 'Manrope-Regular.ttf'));
const manropeBold = readFileSync(join(FONTS_DIR, 'Manrope-Bold.ttf'));

export const SATORI_FONTS = [
  { name: 'Manrope', data: manropeRegular.buffer, weight: 400 as const, style: 'normal' as const },
  { name: 'Manrope', data: manropeBold.buffer, weight: 700 as const, style: 'normal' as const },
];
