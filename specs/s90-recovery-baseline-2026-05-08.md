# S90 Recovery Baseline — 2026-05-08

**Captured:** 2026-05-08, ~12:00 Athens
**Days since S90 fix:** 17 (S90 = 2026-04-21)
**Deadline anchor:** Pre-I/O baseline for 2026-05-19 Google I/O comparison

## Snapshot

| Metric | S90 baseline (2026-04-21) | S90+17d (2026-05-08) | Delta |
|--------|---------------------------|----------------------|-------|
| GSC indexed pages | 0 | 7 | +7 |
| GSC not-indexed pages | n/a | 3 | — |
| Bing WMT indexed pages | 0 (3 sitemap URLs) | 390 | +390 |
| Bing WMT total URLs (folder) | n/a | 806 | — |
| Bing WMT excluded | n/a | 416 | — |
| Bing WMT errors | n/a | 0 | — |
| Bing WMT warnings | n/a | 0 | — |
| Bing impressions (last 6 months) | 0 | 1 | +1 |
| `site:agentathens.com` Google | 1 result (GoDaddy parking) | Multiple Greek hubs + events visible | Ontological change |
| `site:agentathens.com` Bing | not measured | 31 results | — |

## GSC not-indexed breakdown

- Alternative page with proper canonical tag: 2 pages, validation Not Started
- Page with redirect: 1 page, validation Not Started

Likely cause hypothesis (pending GEO Strategist diagnostic): trailing-slash redirect pattern. Canonical URLs in this codebase are no-trailing-slash; `/X/` 301s to `/X`. Affects only 3 of 8,475 sitemap URLs — does not explain Google low-coverage at large.

## AI citations

Not measured at capture time. Quick check (Option A) and Friday GEO Strategist routine (Option B, structured kpi.db logging) are separately tracked. Aggregate count for daily CSV trend signal pending --update mode (next session).

## Interpretation

- **S90 fix worked.** Cascade failure (Netlify deploy → IndexNow → search engines) was real; pipeline decoupling restored signal flow.
- **Bing-vs-Google asymmetry is mechanical.** IndexNow is a Microsoft protocol; Bing accepts direct notifications, Google ignores IndexNow and relies on crawl scheduling + sitemap discovery. The 56× gap (390 vs 7) reflects this, not a quality difference.
- **BWT AI Performance is the channel with signal today.** Sprint 5 KPI framework's BWT-heavy weighting is correctly calibrated.
- **Google indexing coverage at 0.08% (7/8,475 sitemap URLs) is the next blocker.** 17 days is slow even for new-domain Google crawl. Diagnostic vs patience decision belongs to GEO Strategist.

## Sources

- Google Search Console → Indexing → Pages → All known pages (last update 2026-05-04)
- Bing Webmaster Tools → Site Explorer → Indexed URLs (last 6 months)
- Google search: `site:agentathens.com` (manual, 2026-05-08)
- Bing search: `site:agentathens.com` (manual, 2026-05-08, 11-20 of 31)

## Open items routed elsewhere

- Google low-coverage diagnostic: queued for GEO Strategist
- Daily CSV update of today's row with manual numbers: blocked on --update mode (next session)
- Structured P1-P5 × 4 engines logging to kpi.db: scheduled for Friday GEO Strategist routine
- Post-I/O retro comparison anchor: this file (~2026-05-26 trigger)
