import type { HubFilter } from '../types';

export type ExcludedDimension = 'type' | 'time' | 'price' | null;

export interface HubIdentity {
  canonicalUrl: string;
  excludeDimension: ExcludedDimension;
}

export function hubFilterToExcludedDimension(filter: HubFilter): ExcludedDimension {
  switch (filter.type) {
    case 'date':         return 'time';
    case 'event_type':   return 'type';
    case 'event_types':  return 'type';
    case 'price_type':   return 'price';
    case 'tag':          return null;
  }
}
