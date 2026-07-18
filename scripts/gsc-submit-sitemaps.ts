#!/usr/bin/env bun
/**
 * Phase-3 T1 (2026-07-19): submit all four sitemaps to Google Search Console
 * after a successful deploy — Google's discovery of new event pages stalled
 * (~Jul 1: 13/15 sampled event pages "URL unknown to Google", sitemap-events
 * pending since a manual 2026-05-11 submission). Bing needs no equivalent:
 * IndexNow already covers it (run_indexnow_ping).
 *
 * Self-contained JWT auth against the existing gcp-kpi-reader service account
 * (~/.config/agentathens/gcp-kpi-reader.json, siteFullUser on the property).
 * Scope: sitemap submission ONLY — no property settings are ever touched.
 * Non-fatal by design: exits 0 with a warning line on failure so the deploy
 * pipeline never blocks on Google's API availability.
 */
import { readFileSync } from 'fs';
import { createSign } from 'crypto';
import { join } from 'path';
import { homedir } from 'os';

const GSC_SITE = 'sc-domain:agentathens.com';
const SITEMAPS = [
  'https://agentathens.com/sitemap-index.xml',
  'https://agentathens.com/sitemap-events.xml',
  'https://agentathens.com/sitemap-venues.xml',
  'https://agentathens.com/sitemap-editorial.xml',
];

try {
  const SA = JSON.parse(readFileSync(join(homedir(), '.config/agentathens/gcp-kpi-reader.json'), 'utf8'));
  const now = Math.floor(Date.now() / 1000);
  const hdr = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const claim = Buffer.from(JSON.stringify({
    iss: SA.client_email,
    scope: 'https://www.googleapis.com/auth/webmasters',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3600,
  })).toString('base64url');
  const signer = createSign('RSA-SHA256');
  signer.update(`${hdr}.${claim}`);
  const sig = signer.sign(SA.private_key).toString('base64url');
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${hdr}.${claim}.${sig}`,
  });
  const tokenJson: any = await tokenRes.json();
  if (!tokenRes.ok) throw new Error(`token: ${JSON.stringify(tokenJson).slice(0, 200)}`);

  let ok = 0;
  for (const sm of SITEMAPS) {
    const res = await fetch(
      `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(GSC_SITE)}/sitemaps/${encodeURIComponent(sm)}`,
      { method: 'PUT', headers: { Authorization: `Bearer ${tokenJson.access_token}` } },
    );
    if (res.status === 200 || res.status === 204) {
      ok++;
      console.log(`[gsc-sitemaps] submitted ${sm}`);
    } else {
      console.log(`[gsc-sitemaps] WARN ${res.status} for ${sm}: ${(await res.text()).slice(0, 150)}`);
    }
  }
  console.log(`[gsc-sitemaps] ${ok}/${SITEMAPS.length} submitted`);
} catch (e) {
  console.log(`[gsc-sitemaps] WARN submission skipped: ${e}`);
}
process.exit(0);
