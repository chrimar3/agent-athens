import { existsSync, statSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

interface WriteStats {
  written: number;
  skipped: number;
  copiedWritten: number;
  copiedSkipped: number;
}

let stats: WriteStats = { written: 0, skipped: 0, copiedWritten: 0, copiedSkipped: 0 };

function ensureDir(filePath: string): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

/**
 * Write file only if contents differ from what's on disk.
 * Size-first compare, then byte/string compare.
 * Returns true if written, false if skipped.
 */
export function writeFileIfChangedSync(filePath: string, data: string | Buffer | Uint8Array): boolean {
  const isString = typeof data === 'string';
  const binBuf = !isString ? (Buffer.isBuffer(data) ? (data as Buffer) : Buffer.from(data as Uint8Array)) : null;
  const newSize = isString ? Buffer.byteLength(data, 'utf-8') : binBuf!.length;

  if (existsSync(filePath)) {
    const existingSize = statSync(filePath).size;
    if (existingSize === newSize) {
      if (isString) {
        const existing = readFileSync(filePath, 'utf-8');
        if (existing === data) {
          stats.skipped++;
          return false;
        }
      } else {
        const existing = readFileSync(filePath);
        if (existing.equals(binBuf!)) {
          stats.skipped++;
          return false;
        }
      }
    }
  } else {
    ensureDir(filePath);
  }

  if (isString) {
    writeFileSync(filePath, data, 'utf-8');
  } else {
    writeFileSync(filePath, binBuf!);
  }
  stats.written++;
  return true;
}

/**
 * Copy file only if destination differs from source.
 * Reads both and compares bytes (size-first fast reject).
 * Returns true if copied, false if skipped.
 */
export function copyFileIfChangedSync(srcPath: string, destPath: string): boolean {
  const srcData = readFileSync(srcPath);
  const srcSize = srcData.length;

  if (existsSync(destPath)) {
    const destSize = statSync(destPath).size;
    if (destSize === srcSize) {
      const destData = readFileSync(destPath);
      if (destData.equals(srcData)) {
        stats.copiedSkipped++;
        return false;
      }
    }
  } else {
    ensureDir(destPath);
  }

  writeFileSync(destPath, srcData);
  stats.copiedWritten++;
  return true;
}

/**
 * Write HTML only if non-volatile content differs.
 * Compares `stripVolatileContent(html)` — if stripped forms match, the
 * existing file (with its stale but truthful timestamps) is preserved.
 * This is the correct semantics: dateModified should reflect actual
 * content change, not build time.
 */
export function writeHtmlIfChangedSync(filePath: string, html: string): boolean {
  if (existsSync(filePath)) {
    const { stripVolatileContent } = require('../sitemap/content-hasher') as typeof import('../sitemap/content-hasher');
    const existing = readFileSync(filePath, 'utf-8');
    if (stripVolatileContent(existing) === stripVolatileContent(html)) {
      stats.skipped++;
      return false;
    }
  }
  return writeFileIfChangedSync(filePath, html);
}

/**
 * Write a JSON API payload, reusing the prior meta.lastUpdate timestamp if
 * all other content is unchanged. Prevents daily clock drift from forcing
 * rewrites of otherwise-identical API JSON files.
 */
export function writeJsonApiIfChangedSync(
  filePath: string,
  payload: Record<string, any>
): boolean {
  if (!payload.meta || typeof payload.meta.lastUpdate !== 'string') {
    return writeFileIfChangedSync(filePath, JSON.stringify(payload, null, 2));
  }

  if (existsSync(filePath)) {
    try {
      const prev = JSON.parse(readFileSync(filePath, 'utf-8'));
      if (prev.meta && typeof prev.meta.lastUpdate === 'string') {
        const prevStripped = { ...prev, meta: { ...prev.meta, lastUpdate: '__X__' } };
        const nextStripped = { ...payload, meta: { ...payload.meta, lastUpdate: '__X__' } };
        if (JSON.stringify(prevStripped) === JSON.stringify(nextStripped)) {
          payload.meta.lastUpdate = prev.meta.lastUpdate;
        }
      }
    } catch {}
  }

  return writeFileIfChangedSync(filePath, JSON.stringify(payload, null, 2));
}

export function getWriteStats(): WriteStats {
  return { ...stats };
}

export function resetWriteStats(): void {
  stats = { written: 0, skipped: 0, copiedWritten: 0, copiedSkipped: 0 };
}

export function formatWriteStats(): string {
  const totalWritten = stats.written + stats.copiedWritten;
  const totalSkipped = stats.skipped + stats.copiedSkipped;
  const total = totalWritten + totalSkipped;
  const pct = total > 0 ? Math.round((totalSkipped / total) * 100) : 0;
  return `Build cache: ${totalWritten} written, ${totalSkipped} unchanged (${pct}% skipped) [writes: ${stats.written}w/${stats.skipped}s, copies: ${stats.copiedWritten}w/${stats.copiedSkipped}s]`;
}
