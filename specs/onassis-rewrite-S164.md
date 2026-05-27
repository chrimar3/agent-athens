# Onassis Scraper Rewrite — Step 0 Spike Findings (S164)

Captured 2026-05-27 via throwaway Puppeteer (`page.content()` after `networkidle2`, system Chrome `executablePath`).
Fixture saved to `tests/fixtures/onassis-whats-on.html` (the test ground truth).

## URL findings
| URL | status | note |
|---|---|---|
| `https://www.onassis.org/el/whats-on` | 200 | **The real listing** — mixed-type event cards. Use this. |
| `https://www.onassis.org/onassis-stegi` | 200 (313KB) | Homepage/initiative page, not a clean listing. |
| `https://www.onassis.org/el/exhibitions` | **404 (dead)** | Current scraper tries this — remove from the URL list. |

## Page structure
Utility-CSS site (Tachyons-style: `mb3`, `col-24`, `type-style-N`) — **no semantic `.event-card` class.**

There are 6 `<article>` elements:
- **`article.bg-white` (#0)** = outer page wrapper. Contains the `<h1> What's On`, section headings (`προτεινομενες εκδηλωσεις`, `ολες οι εκδηλωσεις`), and the **filter-chrome string** `"εμφανίζονται όλες οι εκδηλώσεις σε όλες τις τοποθεσίες…"` — the exact chrome the S117 scope-filter rejects. Bare `article` (old selector) matched THIS → scooped chrome.
- **`article.sm-col-28-18` (#1–#5)** = the 5 real event cards. **This is the precise container selector.**

## Selector map (precise — replaces old `:115-126`)
| Field | Selector (within each `article.sm-col-28-18`) | Notes |
|---|---|---|
| card container | `article.sm-col-28-18` | 5 cards; excludes the `.bg-white` chrome wrapper |
| type/category | `p.blue` (1+, take **first** as primary) | Greek label: `Έκθεση`, `Κινηματογράφος`, `Μουσική`, `Προβολές ταινιών`, `Εκπαιδευτικό πρόγραμμα` |
| title | `h3` | e.g. `Tilda Swinton – Ongoing` |
| sub-venue | first `span` after `h3` | `Onassis Ready` / `Στέγη Ιδρύματος Ωνάση` / `Αρχείο Καβάφη` — informational; canonical venue stays `Onassis Stegi` |
| description | `p.dark-grey` (optional) | may be absent |
| date | `time` | see date classification |
| link | `a[href]` | `/el/whats-on/<slug>` (some `/…/film-screenings` sub-events) |

## Type derivation (category → EventType, Megaron precedent)
Shared categorizer's keyword config has **zero** Greek category terms → cannot classify these labels. Use a local `onassisCategoryToType()` map (mirrors `scrape-megaron.ts:categoryToType`), with `categorizeEventSimple()` as fallback for unmapped/missing. The orchestrated path re-categorizes at `scrape-all.ts:1387` regardless (safety net).

| Greek category (primary `p.blue`) | EventType |
|---|---|
| `Έκθεση` | exhibition |
| `Κινηματογράφος`, `Προβολές ταινιών` | cinema |
| `Μουσική`, `Συναυλία`, `Όπερα` | concert |
| `Θέατρο` | theater |
| `Παράσταση`, `Χορός` | performance / dance |
| `Εκπαιδευτικό πρόγραμμα`, `Εργαστήριο` | workshop |
| `Συζήτηση`, `Διάλεξη`, `Φεστιβάλ`(→festival) | other / festival |
| (missing / unmapped) | fallback → `categorizeEventSimple(title,desc,…)` |

## Date classification (3–5 real samples — from `<time>`)
Format is **numeric with an em-dash `—` (U+2014)**, NOT the hyphen/en-dash the old regex used. This is the root of the S117 end-into-start bug.

| Real sample | Class | Expected parse |
|---|---|---|
| `17.05 — 28.06.2026` | range, **shared year** (start lacks year) | start `2026-05-17`, end `2026-06-28` (start inherits end's year) |
| `29.05 — 27.06.2026` | range, shared year | start `2026-05-29`, end `2026-06-27` |
| `14.10.2025 — 28.05.2026` | range, **both years** (cross-year) | start `2025-10-14`, end `2026-05-28` |
| `05.06 — 07.06.2026` | range, shared year | start `2026-06-05`, end `2026-06-07` |
| (defensive) single date / `Ongoing` | open-ended | start set, **end `null`** (never fabricated) |

Parser rules:
- Split on `—` / `–` / `-` / `έως` / `to`.
- If start side has no 4-digit year, inject the end side's year before parsing.
- Reuse existing `parseGreekDate` (`:46-78`) per side (numeric `DD.MM.YYYY` branch).
- No end → `end_date = null`. Strip any `μ.μ./π.μ.` time tokens (none seen in `<time>` here, but defensive).
- Tier-1: `end_date=null` stays pageable via COALESCE (`generate-site.ts:208-215`, `database.ts:472-476`).

## Bug confirmation (live data)
`17.05 — 28.06.2026`: old range regex `[-–]` does NOT match `—` (em-dash) → falls to `parseGreekDate("17.05 — 28.06.2026")` whose numeric regex matches the LAST date `28.06.2026` (the **end**) → end written into `start_date`. Root-caused from real HTML.
