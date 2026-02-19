import type { Context } from "@netlify/functions";

/**
 * Redirect Endpoint for Click Tracking
 *
 * URL: /go/[event-id]?url=...
 *
 * Logs the click to Netlify Blobs and redirects to the destination URL.
 * This allows us to track which events users are clicking on.
 */

interface ClickData {
  eventId: string;
  timestamp: string;
  destinationUrl: string;
  referrer: string | null;
  userAgent: string | null;
}

export default async function handler(request: Request, context: Context) {
  // Parse the URL to get event ID and destination
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/').filter(Boolean);

  // Path format: /go/[event-id]
  if (pathParts.length < 2 || pathParts[0] !== 'go') {
    return new Response('Invalid path. Use /go/[event-id]?url=...', { status: 400 });
  }

  const eventId = pathParts[1];
  const destinationUrl = url.searchParams.get('url');

  if (!destinationUrl) {
    return new Response('Missing destination URL. Use /go/[event-id]?url=...', { status: 400 });
  }

  // Validate destination URL
  let validatedUrl: string;
  try {
    // URL should be properly encoded
    validatedUrl = decodeURIComponent(destinationUrl);
    new URL(validatedUrl); // Throws if invalid
  } catch {
    return new Response('Invalid destination URL', { status: 400 });
  }

  // Security: Only allow redirects to known domains
  const allowedDomains = [
    'viva.gr',
    'more.com',
    'tickets.in.gr',
    'ticketmaster.gr',
    'ticketservices.gr',
    'clubber.gr',
    'athinorama.gr',
    'lifo.gr',
    'snfcc.org',
    'onassis.org',
    'benaki.org',
    'google.com', // For search fallbacks
    'facebook.com',
    'eventbrite.com',
    'dice.fm',
  ];

  const parsedDest = new URL(validatedUrl);
  const isAllowedDomain = allowedDomains.some(domain =>
    parsedDest.hostname.includes(domain)
  );

  if (!isAllowedDomain) {
    console.log(`[go] Blocked redirect to: ${parsedDest.hostname}`);
    return new Response('Redirect not allowed to this domain', { status: 403 });
  }

  // Prepare click data
  const clickData: ClickData = {
    eventId,
    timestamp: new Date().toISOString(),
    destinationUrl: validatedUrl,
    referrer: request.headers.get('referer') || null,
    userAgent: request.headers.get('user-agent') || null,
  };

  // Log to Netlify Blobs (if available)
  try {
    // Get the blob store for clicks
    const { getStore } = await import("@netlify/blobs");
    const clicks = getStore("clicks");

    // Store click with unique key
    const clickId = `${eventId}-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    await clicks.setJSON(clickId, clickData);

    console.log(`[go] Click logged: ${eventId} -> ${parsedDest.hostname}`);
  } catch (error) {
    // Log error but don't block the redirect
    console.error('[go] Failed to log click:', error);
  }

  // Redirect to destination
  return Response.redirect(validatedUrl, 302);
}

// Configure function
export const config = {
  path: "/go/*"
};
