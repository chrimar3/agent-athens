/**
 * The inline <script> bodies the site's own templates emit, by sha256 of the
 * exact text between <script> and </script> as it appears in dist/.
 *
 * The published-output gate (published-artifacts.ts) fails the build on any
 * other executable inline script, so an escaping bug that lets data form a
 * <script> element cannot publish. JSON data blocks (application/ld+json,
 * application/json) are not listed; the gate checks them separately.
 *
 * When a template script changes, its hash changes and the build fails.
 * tests/security/inline-script-allowlist.test.ts recomputes every entry from
 * the template functions and prints the new hash: review the script diff,
 * then replace the hash here. Never add a hash taken from a built page
 * without finding the template that emits it.
 */
export const INLINE_SCRIPT_ALLOWLIST: ReadonlyArray<{ sha256: string; source: string }> = [
  { sha256: '9b1a9f07cbc7531795f5855ab5d89b568e4e5e0d8cbf4de1b21ce2b99111579c', source: 'src/config/analytics.ts renderAnalytics (GA4 bootstrap)' },
  { sha256: '8cf7e1ca14355a50f95f1fe8a1cf1eb40ccd06712aba31f6ae487285982cdd6e', source: 'src/templates/site-chrome.ts renderHamburgerScript' },
  { sha256: '6ecbbba99532f25b468153592d037852b3f53e2d107663ab9e04864e297f6f78', source: 'src/templates/colophon.ts renderColophonScript' },
  { sha256: 'e982379d1055404a8334b3169b16b6536d245e86bf275105edf2f2080fa9c05b', source: "src/templates/search-overlay.ts renderSearchScript('el')" },
  { sha256: 'dd6f7e2e00c42736f5cb28d26baf7e71cc8933bd8140b2eea16dc6e7d226c296', source: "src/templates/search-overlay.ts renderSearchScript('en')" },
  { sha256: '61abf60212eab2d3c3da52811179d2c54f25f3044603eea8038426174e9d0320', source: "src/templates/page.ts renderDayLabelScript('el')" },
  { sha256: 'd9b999254047eeb9b25e7c4e74698cd8ba6663a928da6b0cbd3d244f8df5fd88', source: "src/templates/page.ts renderDayLabelScript('en')" },
  { sha256: '3d061fba1f27e21993f251d03b87de7f640ef8cff73cd935c0690b48facd9271', source: 'src/templates/filter-bar.ts renderFilterBarScript' },
  { sha256: 'a39a06ddc416d73def923ef19ac781b481455cc09d02805907ab5c091f7eb49a', source: 'src/templates/action-bar.ts renderSavedEventsScript' },
  { sha256: 'a2820d3b359be000152766d458379a5427ca6a00cc5016762cbb8a9879c92164', source: 'src/templates/action-bar.ts renderSaveButtonScript' },
  { sha256: '035dd16eb23c91acc889eb3db3c133e2b27dd17ccc7cf946bc2546b2185be8c7', source: 'src/templates/action-bar.ts renderCardSaveScript' },
  { sha256: 'c2385c2361ff2d972b71fb8c948946b59f249ae7b499cc1a832343cdefdbbc44', source: 'src/templates/action-bar.ts renderShareButtonScript' },
  { sha256: '0858f787cd971351ca30a54d213ffc77eb93ce8b5843f7e81de87ac7b85b0078', source: "src/templates/action-bar.ts renderSavedPageScript('el')" },
  { sha256: 'fa138bd1f59d42b530fa3b539ec62f52b4333819e706353a63ce931e68704002', source: "src/templates/action-bar.ts renderSavedPageScript('en')" },
  { sha256: 'c81af3188a1c2351c892e2e43fbcf3d195ea23c35410212d3de2dc0a622eb2fa', source: 'src/generators/event-page.ts renderEventDetailScript' },
  { sha256: 'b628fef7b18cbef655eda4063f7aab43e0251f353c4facaa667b037bcfa0b066', source: 'static/root-files/tonight.html (copied to dist/ as-is)' },
];

export const INLINE_SCRIPT_HASHES: ReadonlySet<string> = new Set(INLINE_SCRIPT_ALLOWLIST.map(e => e.sha256));
