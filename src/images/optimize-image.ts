/**
 * Optimize images: resize to max 1200px wide, convert to WebP.
 * Uses Sharp for image processing.
 *
 * NOTE: withoutEnlargement means self-hosted copies inherit the source's
 * ceiling — a 250px source stays 250px regardless of MAX_WIDTH. Raised
 * 800→1200 in S165 so upgraded athinorama posters (1200x1440 source) clear
 * the >=1200 target width on the GEO surfaces (og:image / JSON-LD).
 */

import sharp from 'sharp';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';

const IMAGES_DIR = join(import.meta.dir, '../../data/images');
const MAX_WIDTH = 1200;
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
