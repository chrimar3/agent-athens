/**
 * Practical Block Generator
 *
 * Generates semantic HTML practical information blocks for event pages.
 * Only renders fields that have data - no empty rows or placeholder dashes.
 *
 * @see docs/MASTER-ENRICHMENT-TEMPLATE.md for field requirements
 */

import type { Event } from '../types';
import { formatGreekDateOnly, formatGreekTime, formatPriceGreek } from '../utils/i18n';
import { formatExhibitionDateRange, isCurrentlyOpen } from '../utils/filters';

export interface VenueInfo {
  address?: string;
  neighborhood?: string;
  metroStation?: string;
  metroLine?: string;
  doorPolicy?: string;
  typicalPeak?: string;
}

interface PracticalField {
  label: string;
  labelEn: string;  // For Schema.org
  value: string;
  isHtml?: boolean;  // If true, value contains HTML
}

/**
 * Generate a practical information block for an event
 * Returns empty string if minimum fields threshold not met
 *
 * @param event - The event data
 * @param venueInfo - Optional venue-specific information
 * @returns Semantic HTML section or empty string
 */
export function generatePracticalBlock(
  event: Event,
  venueInfo?: VenueInfo | null
): string {
  const fields: PracticalField[] = [];
  const isExhibition = event.type === 'exhibition';

  // Date - always present (required by Constitution)
  if (isExhibition) {
    const dateRange = formatExhibitionDateRange(event);
    const openNow = isCurrentlyOpen(event);
    fields.push({
      label: 'Διάρκεια',
      labelEn: 'Duration',
      value: openNow ? `${dateRange} <span class="open-now-badge">Τώρα ανοιχτή</span>` : dateRange,
      isHtml: true
    });
  } else {
    fields.push({
      label: 'Ημερομηνία',
      labelEn: 'Date',
      value: formatGreekDateOnly(event.startDate)
    });

    // Time - only if available
    const time = formatGreekTime(event.startDate);
    if (time && time !== '00:00') {
      fields.push({
        label: 'Ώρα',
        labelEn: 'Time',
        value: time
      });
    }
  }

  // Exhibition opening hours
  if (isExhibition && event.openingHours) {
    const today = new Date().toLocaleDateString('en-US', { weekday: 'short' }).toLowerCase().slice(0, 3);
    const todayHours = event.openingHours[today];
    if (todayHours && todayHours !== 'closed') {
      fields.push({
        label: 'Σήμερα',
        labelEn: 'Today',
        value: todayHours
      });
    }
  }

  // Closed days for exhibitions
  if (isExhibition && event.closedDays) {
    fields.push({
      label: 'Κλειστά',
      labelEn: 'Closed',
      value: event.closedDays
    });
  }

  // Venue information
  if (venueInfo?.typicalPeak) {
    fields.push({
      label: 'Peak time',
      labelEn: 'Peak time',
      value: venueInfo.typicalPeak
    });
  }

  // Price - always present (required by Constitution)
  const priceText = formatPriceGreek(event);
  fields.push({
    label: 'Τιμή',
    labelEn: 'Price',
    value: priceText
  });

  // Tickets - prefer ticketUrl (direct purchase) over url (listing page)
  const bestUrl = (event as any).ticketUrl || event.url;
  if (bestUrl && bestUrl.length > 0) {
    // Basic validation: must have a path beyond just the homepage
    try {
      const parsedUrl = new URL(bestUrl);
      const isValidTicketUrl = parsedUrl.pathname !== '/' || parsedUrl.search.length > 0;
      if (isValidTicketUrl) {
        fields.push({
          label: 'Εισιτήρια',
          labelEn: 'Tickets',
          value: `<a href="${bestUrl}" rel="noopener" target="_blank">Αγοράστε εισιτήρια</a>`,
          isHtml: true
        });
      }
    } catch {
      // Invalid URL - skip ticket link
    }
  }

  // Venue name
  fields.push({
    label: 'Χώρος',
    labelEn: 'Venue',
    value: event.venue.name + (event.venue.neighborhood ? ` (${event.venue.neighborhood})` : '')
  });

  // Address - only if available
  const address = venueInfo?.address || event.venue.address;
  if (address) {
    fields.push({
      label: 'Διεύθυνση',
      labelEn: 'Address',
      value: address
    });
  }

  // Metro access - only if available
  if (venueInfo?.metroStation) {
    const metro = venueInfo.metroLine
      ? `${venueInfo.metroStation} (${venueInfo.metroLine})`
      : venueInfo.metroStation;
    fields.push({
      label: 'Πρόσβαση',
      labelEn: 'Getting there',
      value: metro
    });
  }

  // Door policy - only if meaningful
  if (venueInfo?.doorPolicy && venueInfo.doorPolicy !== 'none') {
    fields.push({
      label: 'Είσοδος',
      labelEn: 'Door policy',
      value: formatDoorPolicy(venueInfo.doorPolicy)
    });
  }

  // Minimum 3 fields required to render a block (date + price + at least one more)
  if (fields.length < 3) {
    return '';  // Don't render sparse blocks
  }

  return renderDL(fields);
}

/**
 * Format door policy for display
 */
function formatDoorPolicy(policy: string): string {
  const policies: Record<string, string> = {
    'strict': 'Αυστηρός έλεγχος ηλικίας',
    'moderate': 'Έλεγχος ταυτότητας',
    'relaxed': 'Χαλαρή είσοδος',
    'members': 'Μόνο μέλη',
    'guestlist': 'Guest list απαιτείται',
    'dress_code': 'Dress code'
  };
  return policies[policy] || policy;
}

/**
 * Render a definition list from fields
 */
function renderDL(fields: PracticalField[]): string {
  const items = fields.map(field => {
    const valueContent = field.isHtml ? field.value : escapeHtml(field.value);
    return `
      <div class="practical-item">
        <dt>${escapeHtml(field.label)}</dt>
        <dd>${valueContent}</dd>
      </div>`;
  }).join('');

  return `
  <section class="event-practical" aria-label="Πρακτικές πληροφορίες">
    <h3>Πρακτικές Πληροφορίες</h3>
    <dl class="practical-grid">
      ${items}
    </dl>
    <style>
      .event-practical { margin: 30px 0; padding: 20px; background: var(--bg-surface); border-radius: 8px; }
      .event-practical h3 { margin: 0 0 15px 0; font-size: 1.1rem; }
      .practical-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 15px; margin: 0; }
      .practical-item { display: flex; flex-direction: column; }
      .practical-item dt { font-weight: 600; font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 4px; }
      .practical-item dd { margin: 0; font-size: 1rem; }
      .open-now-badge { display: inline-block; background: #10b981; color: white; font-size: 0.75rem; padding: 2px 8px; border-radius: 10px; margin-left: 8px; font-weight: 500; vertical-align: middle; }
    </style>
  </section>`;
}

/**
 * Escape HTML entities
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Generate inline practical info for header (when block not rendered)
 * Used when an event has minimal data (just date + price)
 */
export function generateInlinePractical(event: Event): string {
  const date = event.type === 'exhibition'
    ? formatExhibitionDateRange(event)
    : formatGreekDateOnly(event.startDate);

  const time = formatGreekTime(event.startDate);
  const price = formatPriceGreek(event);

  let inline = date;
  if (time && time !== '00:00' && event.type !== 'exhibition') {
    inline += `, ${time}`;
  }
  inline += ` | ${price}`;

  return inline;
}
