/**
 * URL Validation Utilities
 *
 * Validates event URLs and provides fallback search URLs when original URLs
 * are broken or redirect to homepage.
 */

/**
 * Check if a URL is likely valid (basic validation without network request)
 * This avoids making HTTP requests during site generation
 */
export function isValidURLFormat(url: string | undefined): boolean {
  if (!url) return false;

  try {
    const parsed = new URL(url);
    // Must be http or https
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    // Must have a path beyond just "/"
    // URLs that are just the homepage are likely broken
    if (parsed.pathname === '/' && !parsed.search) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if URL appears to be a homepage redirect (common pattern for broken links)
 */
export function looksLikeHomepageRedirect(url: string): boolean {
  if (!url) return false;

  try {
    const parsed = new URL(url);
    // Common patterns for homepage URLs
    const homepagePatterns = [
      /^\/$/,                    // Just "/"
      /^\/index\.html?$/i,      // /index.html or /index.htm
      /^\/home\/?$/i,           // /home or /home/
      /^\/el\/?$/i,             // /el or /el/ (Greek homepage)
      /^\/en\/?$/i,             // /en or /en/ (English homepage)
    ];

    return homepagePatterns.some(pattern => pattern.test(parsed.pathname));
  } catch {
    return true; // If we can't parse it, treat as potentially broken
  }
}

/**
 * Generate a ticket search URL as fallback
 * Uses Google search targeting Greek ticketing sites
 */
export function generateSearchFallback(title: string, venueName: string): string {
  // Clean up title for search (remove special chars, keep Greek/Latin)
  const cleanTitle = title
    .replace(/[+&]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Use Google search - most reliable option
  // Include "εισιτήρια" (tickets in Greek) and "Athens" to improve results
  const query = `${cleanTitle} ${venueName} εισιτήρια`;
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

/**
 * Generate a Google search URL for tickets
 */
export function generateGoogleTicketSearch(title: string, venueName: string): string {
  const query = `${title} ${venueName} Athens tickets`;
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

/**
 * Check if URL is from an event listing site (not a ticket seller)
 * These sites list events but don't sell tickets directly
 */
export function isEventListingSite(url: string): boolean {
  if (!url) return false;

  const listingSites = [
    'clubber.gr',
    'athinorama.gr',
    'lifo.gr',
  ];

  try {
    const parsed = new URL(url);
    return listingSites.some(site => parsed.hostname.includes(site));
  } catch {
    return false;
  }
}

/**
 * Get the best URL for an event
 *
 * Priority:
 * 1. If original URL exists and is valid - use it directly (no Google fallback)
 * 2. If URL is invalid/missing - return empty (no ticket link shown)
 *
 * Note: We no longer use Google search fallbacks. Events without direct URLs
 * simply won't show a ticket purchase link - this is more honest to users.
 */
export function getEventURL(
  originalUrl: string | undefined,
  title: string,
  venueName: string
): { url: string; isFallback: boolean; ticketSearchUrl?: string } {
  // Check if we have a valid URL
  const hasValidUrl = originalUrl && isValidURLFormat(originalUrl) && !looksLikeHomepageRedirect(originalUrl);

  if (hasValidUrl) {
    // Use the URL directly - whether it's a ticketing site or listing site
    // Listing sites (clubber.gr, athinorama.gr) often have ticket links embedded
    return { url: originalUrl!, isFallback: false };
  }

  // No valid URL - return empty URL so no ticket link is shown
  // This is more honest than sending users to a Google search
  return {
    url: '',
    isFallback: true
  };
}

/**
 * Add UTM parameters to external URLs for tracking
 * This allows ticketing sites to see traffic comes from agentathens
 */
export function addUTMParameters(url: string, campaign?: string): string {
  if (!url) return url;

  try {
    const parsed = new URL(url);

    // Don't add UTM to Google search URLs or internal links
    if (parsed.hostname.includes('google.com') ||
        parsed.hostname.includes('agentathens')) {
      return url;
    }

    // Add UTM parameters
    parsed.searchParams.set('utm_source', 'agentathens');
    parsed.searchParams.set('utm_medium', 'referral');
    if (campaign) {
      parsed.searchParams.set('utm_campaign', campaign);
    }

    return parsed.toString();
  } catch {
    return url; // Return original if parsing fails
  }
}

/**
 * Validate event URL asynchronously (for use in scripts, not site generation)
 * Makes an actual HTTP request to check if URL is reachable
 */
export async function validateEventURLAsync(url: string): Promise<{
  valid: boolean;
  status?: number;
  redirectsToHomepage: boolean;
}> {
  if (!url || !isValidURLFormat(url)) {
    return { valid: false, redirectsToHomepage: false };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(url, {
      method: 'HEAD',
      redirect: 'manual',
      signal: controller.signal
    });

    clearTimeout(timeout);

    // Check for redirect to homepage
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (location && looksLikeHomepageRedirect(location)) {
        return { valid: false, status: response.status, redirectsToHomepage: true };
      }
    }

    return {
      valid: response.ok || response.status === 304,
      status: response.status,
      redirectsToHomepage: false
    };
  } catch (error) {
    return { valid: false, redirectsToHomepage: false };
  }
}
