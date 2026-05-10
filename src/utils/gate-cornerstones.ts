import type { Event } from '../types';
import { hashEventSet } from './event-set-hash';
import { resolveLastModified, type ContentHashManifest } from '../sitemap/content-hasher';

export interface CornerstoneInput {
  slug: string;
  events: Event[];
}

export interface CornerstoneOverrides {
  el: Record<string, string>;
  en: Record<string, string>;
}

export function gateCornerstoneHashes(
  inputs: ReadonlyArray<CornerstoneInput>,
  manifest: ContentHashManifest,
): CornerstoneOverrides {
  const el: Record<string, string> = {};
  const en: Record<string, string> = {};

  for (const { slug, events } of inputs) {
    const hash = hashEventSet(events);

    const elDate = resolveLastModified(slug, hash, manifest);
    manifest.entries[slug] = { hash, lastModified: elDate };
    el[slug] = elDate;

    const enKey = `en/${slug}`;
    const enDate = resolveLastModified(enKey, hash, manifest);
    manifest.entries[enKey] = { hash, lastModified: enDate };
    en[slug] = enDate;
  }

  return { el, en };
}
