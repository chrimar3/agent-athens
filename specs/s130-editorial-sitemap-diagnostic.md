# S130 — Editorial Sitemap GSC Fetch Diagnostic

**Session date:** 2026-05-11
**Stream:** Major — GEO/SEO infrastructure
**Scope:** Diagnostic only, no code changes
**Status:** Diagnostic complete; no defect found on our side

---

## GSC error message (user-provided)

**NOT CAPTURED at session start.** User was instructed in Step 0b to record the exact GSC error string before the session (variants matter: "Couldn't fetch" vs "HTTP error: 404" vs "Parsing error" vs "Sitemap appears to be an HTML page" each branch differently). Session proceeded with all three reachability checks as fallback.

> **Action item for user:** before next session, capture the verbatim GSC error string from Search Console → Sitemaps → sitemap-editorial.xml entry. This will tighten any re-investigation.

---

## Reachability matrix

| Sitemap                 | HTTP | Content-Type      | xmllint  | `<url>` count | `</url>` count | hreflang count | BOM | Notes |
|-------------------------|------|-------------------|----------|---------------|----------------|----------------|-----|-------|
| sitemap-events.xml      | 200  | application/xml   | OK       | 6263          | (matches)      | 3006           | no  | 1.5 MB; not flagged by GSC |
| **sitemap-editorial.xml** | **200**  | **application/xml** | **OK** | **1226**      | **1226**       | **87**         | **no** | **234 KB; flagged by GSC** |
| sitemap-venues.xml      | 200  | application/xml   | OK       | 43            | (matches)      | 0              | no  | 7.5 KB; not flagged by GSC |
| sitemap-index.xml       | 200  | (xml)             | implicit | n/a           | n/a            | n/a            | no  | Lists all three children at the correct URLs |

**Header observations (all three):**
- No `X-Robots-Tag: noindex`
- `cache-control: public, max-age=0, must-revalidate`
- ETag present (e.g. `e41856d131dbc1bd9a4c0261a73c0abf-ssl`)
- No `Last-Modified` header (Netlify default — does not break sitemaps; Google falls back to ETag/full re-fetch)
- `cache-status: "Netlify Edge"; fwd=miss` (edge cache cold; origin served fresh)

**sitemap-index.xml body** lists the three child sitemaps at the exact URLs Google would fetch:
```
https://agentathens.com/sitemap-events.xml
https://agentathens.com/sitemap-venues.xml
https://agentathens.com/sitemap-editorial.xml
```

---

## Step branch pursued: 2D (XML well-formedness)

Steps 2A (404), 2B (systemic Netlify block), 2C (HTML/SPA fallback) were all ruled out by Step 1 — editorial returns 200 with `application/xml`, matching the working siblings.

### 2D check results — editorial sitemap

| Check                                         | Result |
|-----------------------------------------------|--------|
| `xmllint --noout` parse                       | passes |
| File size                                     | 234,403 bytes (well under 50 MB protocol limit) |
| URL count                                     | 1226 (well under 50,000 protocol limit) |
| `<url>` / `</url>` balance                    | 1226 / 1226 (perfectly balanced) |
| BOM bytes                                     | none (starts `3c3f 786d` = `<?xml`) |
| xmlns declarations                            | sitemap + xhtml both declared on `<urlset>` |
| Spot-check first 3 `<loc>` URLs (HTTP HEAD)   | 200, 200, 200 (today / tomorrow / this-week) |
| Sample hreflang block well-formedness         | clean — `rel="alternate"`, `hreflang="el\|en\|x-default"`, valid `href` |
| Unescaped ampersands in `<loc>`               | none |
| Non-ASCII bytes in `<loc>`                    | none (URL-encoded throughout) |
| Trailing bytes after `</urlset>`              | clean newline-only (no garbage) |

---

## Root cause hypothesis

**Transient GSC fetcher issue, not a sitemap defect.** Every server-side and content-side signal is clean. The structurally more complex sibling — `sitemap-events.xml`, which is 6.5× larger (1.5 MB) and 35× more hreflang-heavy (3006 vs 87 `xhtml:link` entries) — passes GSC, which strongly undercuts any "complexity / hreflang bug" hypothesis specific to editorial. The "Couldn't fetch" UI state is a known GSC behavior that persists in the dashboard even after the underlying transient issue resolves, until the entry is manually toggled.

---

## Recommended next action (NOT a code fix)

**Primary recommendation:** No code changes. In Search Console:

1. Delete the `sitemap-editorial.xml` entry from the Sitemaps list.
2. Wait ~60 seconds.
3. Re-submit `https://agentathens.com/sitemap-editorial.xml`.
4. Wait 24–48 hours.

The remove + re-add cycle forces GSC to clear cached failure state and dispatch a fresh fetch.

**If error persists after re-add + 48h wait:**

- Use GSC's **URL Inspection** tool on `https://agentathens.com/sitemap-editorial.xml` directly. This bypasses the Sitemaps subsystem and uses the standard crawler — its error message is often more specific than the Sitemaps UI's generic "Couldn't fetch".
- Check `https://search.google.com/search-console/settings/crawl-stats` for any Googlebot-side fetch errors around the time of the failed fetch (could reveal a geo/IP block, rate-limit, or temporary DNS hiccup on Google's edge).
- Cross-reference against Netlify's deploy log for the deploy that contained the editorial sitemap — confirm the file shipped (already confirmed via curl above, but worth a paper-trail check).

**Next-session shape (only if needed):**
- 0–1 code changes (likely 0)
- 2–3 reads (Netlify logs, GSC crawl-stats screenshot from user, possibly `dist/sitemap-editorial.xml` diff vs live)
- If a real code fix surfaces, it would most likely touch `scripts/generate-sitemaps.*` (or wherever editorial-sitemap emission lives) and be ≤10 lines

---

## Why "do not invent a code fix" applies here

The diagnostic prompt explicitly handles this branch: *"All three sitemaps return 200 and XML is valid → the bug is on Google's side, not ours. Close as 'transient GSC fetch failure, resubmit in 24h after first verifying with curl'; do not invent a code fix."*

We are in that exact branch.

---

## Artifacts

- `/tmp/sm-ed.xml` — live editorial sitemap snapshot (234 KB, fetched 2026-05-11 ~10:46 UTC)
- `/tmp/sm-events.xml`, `/tmp/sm-venues.xml` — comparison snapshots
- Local `dist/sitemap-editorial.xml` — 7445 lines (multi-line per URL) generating the same 1226 URLs

## Open questions for next session

1. What is the verbatim GSC error string? (capture before any further work)
2. Did the remove + re-add cycle clear the error? (24–48h after user performs it)
3. If error persists, what does URL Inspection on the sitemap URL itself report?
