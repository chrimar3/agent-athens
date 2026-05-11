# S131 — GSC URL Inspection Checklist

**Purpose:** 11 representative production URLs for manual GSC URL-Inspection pass. Sampled 2026-05-11.
**Owner of Step 5 (manual GSC pass):** Christos (~10 min, separate from this Claude Code session).
**Append findings to:** `specs/s131-google-discoverability-diagnostic.md` under `## Manual GSC findings`.

**How to use:** For each row, paste the URL into the GSC URL Inspection bar and fill in the columns. Flag any row where Google-selected canonical ≠ user-declared canonical.

---

## Sampling notes

- Events sampled from `events` table where `location_status IN ('verified_athens','pass_through')` AND `is_cancelled=0`, intersected with `dist/events/` filesystem (avoids the 29-event DB-vs-build gap — see diagnostic doc).
- Two slots originally planned for "neighborhood URL" and "cornerstone URL (`/guide/*`)" were re-purposed: **no `/neighborhoods/*` or `/guide/*` URLs exist in the editorial sitemap or `dist/`**. Substituted with `/editorial` (curated index) and `/this-week` (additional time-hub).

---

## Checklist (paste each into GSC URL Inspection)

| # | URL | Category | Indexed? | Last crawl | User-declared canonical | Google-selected canonical | Notes |
|---|-----|----------|----------|------------|--------------------------|----------------------------|-------|
| 1 | https://agentathens.com/events/9454cac8-christmas-theater-this-is-michael-tribute-show-michael-jackson-15-christmas-th | Event · near (0–7d) · theater | | | | | |
| 2 | https://agentathens.com/events/a47a1c7c-floyd-tinariwen | Event · near (0–7d) · concert | | | | | |
| 3 | https://agentathens.com/events/c3fe4ec6-gazarte-telenova-live-in-athens | Event · mid (8–30d) · concert | | | | | |
| 4 | https://agentathens.com/events/86438986-bolivar-royksopp-dj-set-i-fri-june-5 | Event · mid (8–30d) · dj_set | | | | | |
| 5 | https://agentathens.com/venues/onassis-stegi | Venue | | | | | |
| 6 | https://agentathens.com/venues/half-note-jazz-club | Venue | | | | | |
| 7 | https://agentathens.com/today | Time-hub | | | | | |
| 8 | https://agentathens.com/this-weekend | Time-hub | | | | | |
| 9 | https://agentathens.com/concert | Type-hub | | | | | |
| 10 | https://agentathens.com/exhibition | Type-hub | | | | | |
| 11 | https://agentathens.com/editorial | Editorial index (cornerstone substitute — no `/guide/*` exists) | | | | | |

---

## After completing the inspection

In GSC → **Pages** report → "Why pages aren't indexed":

For each reason category listed (alternate page with canonical / noindex / redirect / crawled-not-indexed), click in and capture **actual URLs** behind each reason. Especially load-bearing:
- The **1 noindex** entry — what page?
- The **1 crawled-currently-not-indexed** entry — what page?

Append everything to `specs/s131-google-discoverability-diagnostic.md` under `## Manual GSC findings`.
