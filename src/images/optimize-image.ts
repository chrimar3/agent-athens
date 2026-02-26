/**
 * Optimize images: resize to max 800px wide, convert to WebP.
 * Uses Sharp for image processing.
 */

import sharp from 'sharp';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';

const IMAGES_DIR = join(import.meta.dir, '../../data/images');
const MAX_WIDTH = 800;
const WEBP_QUALITY = 80;

/**
 * Optimize an image buffer and save as WebP.
 * Returns the public-facing path for the image.
 */
export async function optimizeImage(buffer: Buffer, eventId: string): Promise<string> {
  // Ensure output directory exists
  if (!existsSync(IMAGES_DIR)) {
    mkdirSync(IMAGES_DIR, { recursive: true });
  }

  const outputPath = join(IMAGES_DIR, `${eventId}.webp`);

  await sharp(buffer)
    .resize(MAX_WIDTH, undefined, { withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY })
    .toFile(outputPath);

  return `/images/events/${eventId}.webp`;
}
