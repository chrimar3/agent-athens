import { createHash } from 'crypto';
import type { Event } from '../types';

export function hashEventSet(events: Event[]): string {
  const stable = events
    .map(e => `${e.id}|${e.title}|${e.startDate}|${e.endDate ?? ''}|${e.venue.name}`)
    .sort()
    .join('\n');
  return createHash('sha256').update(stable).digest('hex').slice(0, 16);
}
