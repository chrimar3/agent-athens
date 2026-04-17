# /en/events/today 404 Diagnosis

## Scope

**False alarm — not a bug.** The tested URLs used wrong paths. Hub pages do not live under `/events/`. They live at the root level.

## Actual URL structure

| Type | Path | Status |
|------|------|--------|
| Greek hub | `/{slug}/` (e.g., `/today/`, `/concerts/`) | 200 |
| English hub | `/en/{slug}/` (e.g., `/en/today/`, `/en/concerts/`) | 301 → 200 (trailing slash) |
| Individual event (Greek) | `/events/{id}-{slug}/` | 200 |
| Individual event (English) | `/en/events/{id}-{slug}/` | 200 |

The 301 on English hubs is standard Netlify directory URL behavior (adds trailing slash).

## Evidence

### Live HTTP codes — wrong paths (all 404, expected)
```
404  /en/events/today         ← does not exist
404  /en/events/this-weekend  ← does not exist
404  /events/simera           ← does not exist
404  /events/sabbatokyriako   ← does not exist
```

### Live HTTP codes — correct paths (all working)
```
200  /today
200  /this-weekend
200  /concerts
200  /theater
200  /kids
301→200  /en/today    → /en/today/
301→200  /en/this-weekend → /en/this-weekend/
301→200  /en/concerts → /en/concerts/
301→200  /en/theater  → /en/theater/
301→200  /en/kids     → /en/kids/
```

### dist/ files present
- `dist/en/today/index.html` — EXISTS
- `dist/en/` has 18 English hub directories (today, this-weekend, this-month, concerts, theater, nightlife, festivals, kids, open, classical-music, comedy, greek-music, with-ticket, about, corrections, editorial, events, saved)
- `dist/today/`, `dist/this-weekend/`, `dist/concerts/` etc. — all exist

### Generator code (src/generate-site.ts:431-432)
```typescript
mkdirSync(join(DIST_DIR, 'en', config.slug), { recursive: true });
writeFileSync(join(DIST_DIR, 'en', config.slug, 'index.html'), html);
```
Hubs are written to `dist/en/{slug}/` (not `dist/en/events/{slug}/`). This is by design.

### Sitemap inclusion
Hub pages ARE in `sitemap-editorial.xml` with proper hreflang:
```xml
<loc>https://agentathens.com/today</loc>
<xhtml:link rel="alternate" hreflang="el" href="https://agentathens.com/today"/>
<xhtml:link rel="alternate" hreflang="en" href="https://agentathens.com/en/today"/>
<xhtml:link rel="alternate" hreflang="x-default" href="https://agentathens.com/en/today"/>
```

### Config state
`config/hub-pages.json` has `answerCapsuleEn` for all 9 hubs (today, this-weekend, this-month, open, concerts, theater, nightlife, festivals, kids). All pass the S46 presence gate.

## Likely cause

No bug. The tested URLs used an incorrect path pattern (`/en/events/{slug}` and `/events/{greek-slug}`) that does not match the actual URL structure (`/en/{slug}` and `/{slug}`).

## Proposed fix scope

None needed. No code changes required.

**One action item:** Update the S86 monitoring script's mental model. The sample URLs used in `ping-indexnow.ts` (which pulls from sitemaps) are already correct — the sitemaps contain the right paths. No URLs in the IndexNow submission were 404s.
