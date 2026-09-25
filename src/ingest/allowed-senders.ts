/**
 * Newsletter sender allowlist and DKIM authentication check.
 *
 * Email bodies become event data and later reach the enrichment step, so the
 * ingest path only accepts mail that (a) comes from a newsletter the mailbox
 * subscribes to and (b) was authenticated by the receiving mail server.
 *
 * The allowlist lives in code (not config/) on purpose: it is a trust
 * boundary, and changing it should go through code review.
 *
 * ALLOWED_SENDER_DOMAINS is every sender domain of the enabled formats in
 * config/newsletter-formats.json (the newsletters the mailbox subscribes to),
 * whether or not a dedicated parser exists yet — authenticity, not parser
 * coverage, is the gate. tests pin the list against that config.
 */

export const ALLOWED_SENDER_DOMAINS: readonly string[] = Object.freeze([
  'aaathens.art',
  'athinorama.gr',
  'gazarte.gr',
  'lifo.gr',
  'megaron.gr',
  'more.com',
  'sixdogs.gr',
  'snfcc.org',
  'thisisathens.org',
  'viva.gr',
]);

/**
 * authserv-id values whose Authentication-Results header we trust. The ingest
 * mailbox is Gmail (imap.gmail.com), whose MX stamps "mx.google.com". Only the
 * topmost Authentication-Results header is read: the receiving server adds its
 * own header above any that arrived with the message.
 */
export const TRUSTED_AUTHSERV_IDS: readonly string[] = Object.freeze(['mx.google.com']);

export type SenderRejectReason =
  | 'no-from'
  | 'ambiguous-from'
  | 'domain-not-allowlisted'
  | 'no-authentication-results'
  | 'untrusted-authserv-id'
  | 'dkim-not-pass'
  | 'dkim-not-aligned';

export type SenderVerdict =
  | { ok: true; domain: string; senderDomain: string }
  | { ok: false; reason: SenderRejectReason; senderDomain: string | null };

export interface AuthResult {
  method: string;
  result: string;
  props: Record<string, string>;
}

export interface VerifyOptions {
  allowedDomains?: readonly string[];
  trustedAuthservIds?: readonly string[];
}

const DOMAIN_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/;

/**
 * Return the lowercased domain of a From header value that holds exactly one
 * address, or null. A header with more than one "@" (several addresses, or an
 * address-like display name) is treated as ambiguous and yields null.
 */
export function fromHeaderDomain(value: string): string | null {
  if (typeof value !== 'string') return null;
  const at = value.split('@').length - 1;
  if (at !== 1) return null;
  const m = /@([A-Za-z0-9.-]+)\s*>?\s*$/.exec(value.trim());
  if (!m) return null;
  const domain = m[1].toLowerCase().replace(/\.$/, '');
  return DOMAIN_RE.test(domain) ? domain : null;
}

/** The allowlisted domain that `domain` equals or is a subdomain of, else null. */
export function allowlistedDomainFor(
  domain: string,
  allowed: readonly string[] = ALLOWED_SENDER_DOMAINS,
): string | null {
  const d = domain.toLowerCase().replace(/\.$/, '');
  for (const a of allowed) {
    if (d === a || d.endsWith('.' + a)) return a;
  }
  return null;
}

/** Remove RFC 5322 comments "( ... )" (nesting-aware), leaving quoted strings intact. */
function stripComments(s: string): string {
  let out = '';
  let depth = 0;
  let inQuote = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '\\' && i + 1 < s.length) {
      if (depth === 0) out += c + s[i + 1];
      i++;
      continue;
    }
    if (depth === 0 && c === '"') {
      inQuote = !inQuote;
      out += c;
      continue;
    }
    if (!inQuote && c === '(') { depth++; continue; }
    if (!inQuote && c === ')' && depth > 0) { depth--; continue; }
    if (depth === 0) out += c;
  }
  return out;
}

/**
 * Parse one Authentication-Results header value (RFC 8601):
 *   authserv-id [version]; method=result prop=value ...; method=result ...
 */
export function parseAuthenticationResults(value: string): { authservId: string; results: AuthResult[] } | null {
  if (typeof value !== 'string') return null;
  const unfolded = stripComments(value.replace(/\r?\n[ \t]*/g, ' '));
  const segments = unfolded.split(';').map((s) => s.trim());
  const authservId = (segments[0] ?? '').split(/\s+/)[0]?.toLowerCase() ?? '';
  if (!authservId) return null;
  const results: AuthResult[] = [];
  for (const seg of segments.slice(1)) {
    if (!seg) continue;
    const tokens = seg.split(/\s+/);
    const head = /^([A-Za-z0-9_.-]+)(?:\/\d+)?=([A-Za-z0-9_-]+)$/.exec(tokens[0] ?? '');
    if (!head) continue;
    const props: Record<string, string> = {};
    for (const t of tokens.slice(1)) {
      const eq = t.indexOf('=');
      if (eq <= 0) continue;
      props[t.slice(0, eq).toLowerCase()] = t.slice(eq + 1).replace(/^"|"$/g, '');
    }
    results.push({ method: head[1].toLowerCase(), result: head[2].toLowerCase(), props });
  }
  return { authservId, results };
}

/** Signing domain of a DKIM result: header.d, else the domain part of header.i. */
function dkimDomain(r: AuthResult): string | null {
  const d = r.props['header.d'];
  if (d) return d.toLowerCase().replace(/\.$/, '');
  const i = r.props['header.i'];
  if (i && i.includes('@')) return i.slice(i.lastIndexOf('@') + 1).toLowerCase().replace(/\.$/, '');
  return null;
}

/**
 * Decide whether a message may be ingested.
 *
 * @param input.fromHeaders            every From header value on the message
 * @param input.authenticationResults  Authentication-Results values, topmost first
 */
export function verifySender(
  input: { fromHeaders: string[]; authenticationResults: string[] },
  opts: VerifyOptions = {},
): SenderVerdict {
  const allowed = opts.allowedDomains ?? ALLOWED_SENDER_DOMAINS;
  const trusted = opts.trustedAuthservIds ?? TRUSTED_AUTHSERV_IDS;
  const froms = input.fromHeaders ?? [];

  if (froms.length === 0) return { ok: false, reason: 'no-from', senderDomain: null };
  if (froms.length > 1) return { ok: false, reason: 'ambiguous-from', senderDomain: null };

  const senderDomain = fromHeaderDomain(froms[0]);
  if (!senderDomain) {
    return { ok: false, reason: froms[0].includes('@') ? 'ambiguous-from' : 'no-from', senderDomain: null };
  }

  const domain = allowlistedDomainFor(senderDomain, allowed);
  if (!domain) return { ok: false, reason: 'domain-not-allowlisted', senderDomain };

  const topmost = (input.authenticationResults ?? [])[0];
  if (!topmost) return { ok: false, reason: 'no-authentication-results', senderDomain };

  const parsed = parseAuthenticationResults(topmost);
  if (!parsed || !trusted.includes(parsed.authservId)) {
    return { ok: false, reason: 'untrusted-authserv-id', senderDomain };
  }

  const passes = parsed.results.filter((r) => r.method === 'dkim' && r.result === 'pass');
  if (passes.length === 0) return { ok: false, reason: 'dkim-not-pass', senderDomain };

  const aligned = passes.some((r) => {
    const d = dkimDomain(r);
    return d !== null && (d === domain || d.endsWith('.' + domain));
  });
  if (!aligned) return { ok: false, reason: 'dkim-not-aligned', senderDomain };

  return { ok: true, domain, senderDomain };
}

/**
 * Parser-side check on a saved email record: only files written by the
 * authenticated ingest path carry `authenticatedSenderDomain`.
 */
export function isAuthenticatedEmailRecord(record: unknown): boolean {
  if (!record || typeof record !== 'object') return false;
  const d = (record as { authenticatedSenderDomain?: unknown }).authenticatedSenderDomain;
  return typeof d === 'string' && ALLOWED_SENDER_DOMAINS.includes(d);
}
