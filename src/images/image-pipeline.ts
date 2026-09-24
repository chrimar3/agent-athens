/**
 * Image pipeline: orchestrates download → optimize → DB update.
 */

import { Database } from 'bun:sqlite';
import { downloadImage } from './download-image';
import { optimizeImage } from './optimize-image';
import { isQuarantinedRowSource, QUARANTINE_PATH } from './quarantine-filter';
import { loadQuarantine, type QuarantineRegistry } from '../utils/quarantine';

/**
 * Process a single event image: download, optimize, and update DB.
 * Returns the local path on success, null on failure.
 */
export async function processEventImage(
  eventId: string,
  imageUrl: string,
  source: string,
  db: Database,
  opts: { quarantine?: QuarantineRegistry } = {},
): Promise<string | null> {
  const quarantine = opts.quarantine ?? loadQuarantine(QUARANTINE_PATH);
  if (isQuarantinedRowSource(source, quarantine)) {
    console.log(`  ⏭ Skipped ${eventId}: source ${source} is quarantined`);
    return null;
  }

  // Download
  const buffer = await downloadImage(imageUrl, source);
  if (!buffer) return null;

  // Optimize
  let localPath: string;
  try {
    localPath = await optimizeImage(buffer, eventId);
  } catch (error: any) {
    console.log(`  ⚠ Sharp error for ${eventId}: ${error.message}`);
    return null;
  }

  // Update DB
  db.prepare(`
    UPDATE events
    SET image_local = ?,
        updated_at = datetime('now')
    WHERE id = ?
  `).run(localPath, eventId);

  return localPath;
}
