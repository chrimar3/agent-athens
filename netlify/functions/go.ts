import type { Context } from "@netlify/functions";

/**
 * Redirect Endpoint for Click Tracking
 *
 * URL: /go/[event-id]?url=...
 *
 * Logs the click to Netlify Blobs and redirects to the destination URL.
 * Destinations are limited to https ticketing/venue hosts that do not run
 * their own arbitrary-target redirectors, and stored records are size-bounded.
 */

interface ClickData {
  eventId: string;
  timestamp: string;
  destinationUrl: string;
  referrer: string | null;
  userAgent: string | null;
}

/** Event ids are lowercase hex hashes or slugs. */
const EVENT_ID = /^[a-z0-9-]{1,120}$/;
const MAX_DESTINATION_LENGTH = 2048;
const MAX_STORED_URL = 512;
const MAX_STORED_HEADER = 256;

/**
 * Hosts a click may be sent to (exact or subdomain match). Search engines and
 * social networks are deliberately absent: they host redirectors that forward
 * to any URL, which would turn this endpoint into an open redirect.
 */
export const ALLOWED_DESTINATION_DOMAINS: readonly string[] = [
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
  'eventbrite.com',
  'dice.fm',
];

function clip(value: string | null, max: number): string | null {
  return value === null ? null : value.slice(0, max);
}

/** The record written per click; every field is bounded. */
export function buildClickRecord(eventId: string, destination: URL, headers: Headers): ClickData {
  return {
    eventId: eventId.slice(0, 120),
    timestamp: new Date().toISOString(),
    destinationUrl: clip(destination.origin + destination.pathname, MAX_STORED_URL)!,
    referrer: clip(headers.get('referer'), MAX_STORED_HEADER),
    userAgent: clip(headers.get('user-agent'), MAX_STORED_HEADER),
  };
}

export default async function handler(request: Request, _context: Context) {
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/').filter(Boolean);

  // Path format: /go/[event-id]
  if (pathParts.length !== 2 || pathParts[0] !== 'go' || !EVENT_ID.test(pathParts[1])) {
    return new Response('Invalid path. Use /go/[event-id]?url=... (event id: lowercase letters, digits, hyphens)', { status: 400 });
  }

  const eventId = pathParts[1];
  const destinationUrl = url.searchParams.get('url'); // already decoded

  if (!destinationUrl || destinationUrl.length > MAX_DESTINATION_LENGTH) {
    return new Response('Missing or overlong destination URL. Use /go/[event-id]?url=...', { status: 400 });
  }

  let parsedDest: URL;
  try {
    parsedDest = new URL(destinationUrl);
  } catch {
    return new Response('Invalid destination URL', { status: 400 });
  }

  const isAllowedDomain = ALLOWED_DESTINATION_DOMAINS.some(domain =>
    parsedDest.hostname === domain || parsedDest.hostname.endsWith('.' + domain)
  );

  if (!isAllowedDomain || parsedDest.protocol !== 'https:' || parsedDest.username || parsedDest.password) {
    console.log(`[go] Blocked redirect to: ${parsedDest.protocol}//${parsedDest.hostname}`);
    return new Response('Redirect not allowed to this destination', { status: 403 });
  }

  // Log to Netlify Blobs (if available). Failure never blocks the redirect.
  try {
    const { getStore } = await import("@netlify/blobs");
    const clicks = getStore("clicks");
    const clickId = `${eventId}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    await clicks.setJSON(clickId, buildClickRecord(eventId, parsedDest, request.headers));
    console.log(`[go] Click logged: ${eventId} -> ${parsedDest.hostname}`);
  } catch (error) {
    console.error('[go] Failed to log click:', error);
  }

  return new Response(null, { status: 302, headers: { Location: parsedDest.href, 'Cache-Control': 'no-store' } });
}

// Configure function
export const config = {
  path: "/go/*"
};
