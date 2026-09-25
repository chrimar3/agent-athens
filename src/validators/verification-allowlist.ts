/**
 * Search-engine ownership proofs the site is allowed to publish.
 *
 * A verification file (google<token>.html, BingSiteAuth.xml, yandex_<token>.html,
 * anything under /.well-known/, an IndexNow key file ...) or a verification
 * <meta> tag hands control of the site's search-console property, or of URL
 * submission, to whoever owns the token. The published-output gate
 * (published-artifacts.ts) refuses every such file or tag that is not listed
 * here, so a planted proof cannot ship. Adding an entry is an owner decision.
 */

export interface VerificationFileEntry {
  /** Path inside dist/. */
  path: string;
  /** Exact published content; the gate compares byte for byte. */
  content: string;
  provenance: string;
}

export const VERIFICATION_FILE_ALLOWLIST: readonly VerificationFileEntry[] = [
  {
    path: 'googled03df0efd969df1f.html',
    content: 'google-site-verification: googled03df0efd969df1f.html',
    provenance: 'Google Search Console, copied from static/root-files/',
  },
  {
    path: 'a2f6526d99faa4a216d36574c34694a0.txt',
    content: 'a2f6526d99faa4a216d36574c34694a0',
    provenance: 'IndexNow key file, config/indexnow.json indexnow_key (written by src/generate-site.ts)',
  },
];

export interface VerificationMetaEntry {
  name: string;
  content: string;
  provenance: string;
}

export const VERIFICATION_META_ALLOWLIST: readonly VerificationMetaEntry[] = [
  {
    name: 'msvalidate.01',
    content: '49E03895EB7D7EC691A4DF6F58C7CC74',
    provenance: 'Bing Webmaster Tools, config/indexnow.json bing_wmt_verification (event and venue pages)',
  },
];

/**
 * File names that are ownership proofs. Anything under .well-known/ is
 * matched separately (every file there is refused unless allowlisted).
 */
export const VERIFICATION_FILE_PATTERNS: readonly RegExp[] = [
  /^google[0-9a-z]+\.html?$/i,
  /^bingsiteauth\.xml$/i,
  /^yandex_[0-9a-z]+\.(?:html?|txt)$/i,
  /^baidu_verify_[\w-]+\.html?$/i,
  /^pinterest-[0-9a-z]+\.html?$/i,
  /^naver[0-9a-z]+\.html?$/i,
  /^[0-9a-f]{8,128}\.txt$/i, // IndexNow key files
];
