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
import { formatDateOnly, formatPrice } from '../utils/i18n-date';
import { STRINGS, type Locale } from '../i18n/strings';

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
  labelEn: string;  // Stable key into STRINGS[locale].practicalLabels
  value: string;
  isHtml?: boolean;  // If true, value contains HTML
}

/**
 * Generate a practical information block for an event
 * Returns empty string if minimum fields threshold not met
 *
 * @param event - The event data
 * @param venueInfo - Optional venue-specific information
 * @param locale - Display locale (defaults to 'el')
 * @returns Semantic HTML section or empty string
 */
export function generatePracticalBlock(
  event: Event,
  venueInfo?: VenueInfo | null,
  locale: Locale = 'el'
): string {
  const t = STRINGS[locale];
  const fields: PracticalField[] = [];
  const isExhibition = event.type === 'exhibition';

  // Date - always present (required by Constitution)
  if (isExhibition) {
    const exhibitionLocale = locale === 'en' ? 'en-US' : 'el-GR';
    const dateRange = formatExhibitionDateRange(event, exhibitionLocale);
    const openNow = isCurrentlyOpen(event);
    fields.push({
      label: 'Διάρκεια',
      labelEn: 'Duration',
      value: openNow ? `${dateRange} <span class="open-now-badge">${t.currentlyOpen}</span>` : dateRange,
      isHtml: true
    });
  } else {
    fields.push({
      label: 'Ημερομηνία',
      labelEn: 'Date',
      value: formatDateOnly(event.startDate, locale)
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
  const priceText = formatPrice(event, locale);
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
          value: `<a href="${bestUrl}" rel="noopener" target="_blank">${t.buyTickets}</a>`,
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
      value: t.doorPolicies[venueInfo.doorPolicy] || venueInfo.doorPolicy
    });
  }

  // Minimum 3 fields required to render a block (date + price + at least one more)
  if (fields.length < 3) {
    return '';  // Don't render sparse blocks
  }

  return renderTable(fields, locale);
}

/**
 * Render a table from fields, using locale-aware labels
 */
function renderTable(fields: PracticalField[], locale: Locale): string {
  const t = STRINGS[locale];

  const rows = fields.map(field => {
    const displayLabel = t.practicalLabels[field.labelEn] || field.labelEn;
    const valueContent = field.isHtml ? field.value : escapeHtml(field.value);
    return `
        <tr>
          <th scope="row">${escapeHtml(displayLabel)}</th>
          <td>${valueContent}</td>
        </tr>`;
  }).join('');

  const ariaLabel = locale === 'en' ? 'Practical information' : 'Πρακτικές πληροφορίες';

  return `
  <section class="event-practical" aria-label="${ariaLabel}">
    <h3>${t.practicalInfo}</h3>
    <table class="practical-table">
      <tbody>
        ${rows}
      </tbody>
    </table>
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
