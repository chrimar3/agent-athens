# /en/ Deployment State — Verification Findings (2026-05-13)

**Stream:** Read-only verification batch resolving GEO Strategist's paused Q4 routing and the May 8 bilingual subset decision's content-language assumption.
**Scope:** 4 probes, dist/-based, no code changes.
**Source commit:** `d1cee688a` (S138) — built on top of `7966e4455` (SEO fix at template level).
**Determination preview:** **Case B (partial coverage)** — /en/ rendering is partial: 18 top-level families exist, but only 11% of events have /en/ counterparts, and the parity verifier covers only 4 of 13 content hubs.

---

## 1. /en/ Page-Family Enumeration (Probe 1)

### 1.1 Top-level families in `dist/en/` (18 total)

| Family | Type | Notes |
|---|---|---|
| `about` | Content page | Static |
| `editorial` | Content page | Static |
| `corrections` | Content page | Static |
| `events` | Event collection | 551 event subdirs |
| `saved` | App page | Client-side state |
| `classical-music` | Content hub | Category |
| `comedy` | Content hub | Category |
| `concerts` | Content hub | Category |
| `festivals` | Content hub | Category |
| `greek-music` | Content hub | Category |
| `kids` | Content hub | Category |
| `nightlife` | Content hub | Category |
| `theatre` | Content hub | Category |
| `with-ticket` | Content hub | Access modifier |
| `open` | Cornerstone hub | Access modifier |
| `this-weekend` | Cornerstone hub | Time modifier |
| `today` | Cornerstone hub | Time modifier |
| `this-month` | Cornerstone hub | Time modifier |

### 1.2 Quantitative summary

| Metric | Count | Note |
|---|---|---|
| `dist/en/*/index.html` (all) | **573** | All /en/ pages with index.html |
| `dist/en/events/*/index.html` | **551** | Event detail pages with /en/ counterpart |
| `dist/events/*` (root) | **5028** | Total event detail pages |
| **/en/ event coverage** | **~11%** | 551 of 5028 events have a /en/ version |
| `dist/en/<hub>/all/` directories | **4 found** | `with-ticket/all`, `this-weekend/all`, `concerts/all`, `nightlife/all` — pagination shape; partial coverage across hubs |
| Tree depths under `dist/en/` | 2, 3, 4 | Mix of hub indexes, event detail dirs, and `*/all/` pagination |
| Flat html files at `dist/en/*.html` | **0** | All /en/ content uses subdirectory + index.html shape (unlike Greek hubs at `dist/<hub>.html`) |

### 1.3 Structural shape comparison (Greek vs English)

| Family | Greek path | English path |
|---|---|---|
| Cornerstone hub | `dist/<hub>.html` (flat) | `dist/en/<hub>/index.html` (subdir) |
| Content hub | `dist/<hub>.html` (flat) | `dist/en/<hub>/index.html` (subdir) |
| Event detail | `dist/events/<slug>/index.html` (subdir) | `dist/en/events/<slug>/index.html` (subdir) |
| Content page | `dist/<page>/index.html` (subdir) | `dist/en/<page>/index.html` (subdir) |

**Observation:** Greek hubs are flat-file (`dist/<hub>.html`); English hubs are always subdirectory (`dist/en/<hub>/index.html`). This is explicit in the parity verifier at lines 58–59 ("Greek cornerstones are emitted as flat `dist/<hub>.html` files; the English subdirectory shape is en-only"). Asymmetric file layouts but URL-equivalent.

---

## 2. Parity Verifier Coverage Itemization (Probe 2)

**File:** `tests/build/og-url-canonical-parity.test.ts`
**Check count:** 8 total. **All cornerstone hubs only.** No event-detail, content-hub, content-page, JSON, or sitemap coverage.

### 2.1 Itemized table

| # | Path | Family | Locale | Path scope | Format scope | Assertions |
|---|---|---|---|---|---|---|
| 1 | `dist/en/this-weekend/index.html` | Cornerstone hub | en | /en/ | HTML | canonical contains `/en/`, og:url = canonical, JSON-LD url = canonical, og:locale = `en_US` |
| 2 | `dist/en/today/index.html` | Cornerstone hub | en | /en/ | HTML | (same as #1) |
| 3 | `dist/en/this-month/index.html` | Cornerstone hub | en | /en/ | HTML | (same as #1) |
| 4 | `dist/en/open/index.html` | Cornerstone hub | en | /en/ | HTML | (same as #1) |
| 5 | `dist/this-weekend.html` | Cornerstone hub | el | root | HTML | canonical does NOT contain `/en/`, og:url = canonical, JSON-LD url = canonical, og:locale = `el_GR` |
| 6 | `dist/today.html` | Cornerstone hub | el | root | HTML | (same as #5) |
| 7 | `dist/this-month.html` | Cornerstone hub | el | root | HTML | (same as #5) |
| 8 | `dist/open.html` | Cornerstone hub | el | root | HTML | (same as #5) |

### 2.2 Coverage gaps

| Gap | Count | Risk |
|---|---|---|
| Event-detail pages, en | **551** | Untested for og:url/canonical/JSON-LD parity |
| Event-detail pages, el | **5028** | Untested |
| Content hubs, en (concerts/theatre/comedy/festivals/classical-music/greek-music/kids/nightlife/with-ticket) | **9 hubs** | Untested |
| Content hubs, el (same families) | **9 hubs** | Untested |
| Content pages, en (about/editorial/corrections) | **3 pages** | Untested |
| Content pages, el (same families) | **3 pages** | Untested |
| `/<hub>/all/` pagination, both locales | **~8 pages** | Untested |
| JSON endpoints (`/api/*.json`) | **all** | Untested (verifier is HTML-only) |
| Sitemap parity (`/sitemap*.xml`) | **all** | Untested |

**Net coverage:** 8 build outputs verified out of ~11,200+ rendered HTML files (events + hubs + content pages in both locales). **<0.1% by file count; ~31% of cornerstone time/access hubs; 0% of content categories.**

---

## 3. page.ts Emission Audit (Probe 3)

### 3.1 Locale-aware emission at template level

| Line | Field | Locale-aware? | Mechanism |
|---|---|---|---|
| 62 | `renderPage(locale: Locale = 'el')` signature | Yes | locale param |
| 64 | `const urlPrefix = locale === 'en' ? 'en/' : ''` | Yes | Derived prefix |
| 79 | `<html lang="${locale}">` | **Yes** | Direct interpolation |
| 94 | `<link rel="canonical" href="${BASE_URL}/${urlPrefix}${url}">` | **Yes** | urlPrefix applied |
| 97 | `<link rel="alternate" hreflang="el" href="${BASE_URL}/${url}">` | No (Greek-only emission) | Only hreflang="el" is emitted from page.ts |
| 110 | `<meta property="og:url" content="${BASE_URL}/${urlPrefix}${url}">` | **Yes** | urlPrefix applied (S138 fix from `7966e4455`) |
| 112 | `<meta property="og:locale" content="el_GR">` | **NO — hardcoded** | Greek-only emission; patched downstream by `hub-page.ts:314-317` regex-replace for English hubs |
| 113 | `<meta property="og:locale:alternate" content="en_US">` | **NO — hardcoded** | Always `en_US`; not swapped for /en/ pages → **bug** (see 3.3) |
| 462 | JSON-LD ItemList item `@id`: `${BASE_URL}${locale === 'en' ? '/en' : ''}/events/${slug}/` | **Yes** | Inline ternary |
| 507 | `const urlPrefix = locale === 'en' ? 'en/' : ''` (in `generateSchemaMarkup`) | Yes | Derived per function |
| 513 | JSON-LD CollectionPage `"url"` | **Yes** | urlPrefix applied (S138 fix) |
| 514 | JSON-LD `"inLanguage": locale === 'en' ? 'en' : 'el'` | **Yes** | Inline ternary |

### 3.2 Cross-template emission sites for og:locale

| File | Line | Mechanism |
|---|---|---|
| `src/templates/page.ts:112` | Hardcoded `el_GR` | Template default |
| `src/templates/content-page.ts:66` | `${ogLocale}` interpolation | **Locale-aware** |
| `src/generators/event-page.ts:416` | `${t.ogLocale}` interpolation | **Locale-aware** (uses i18n strings) |
| `src/generators/hub-page.ts:314-317` | Post-render regex-replace | **Locale-aware via post-processing** |
| `src/generators/venue-page.ts:159, 354` | Hardcoded `el_GR` | **Greek-only — no /en/ venue pages emit en_US** |

### 3.3 Bug surfaced (not blocking; flag for follow-up)

**`og:locale:alternate` on /en/ hubs is wrong.**

```
English hub /en/this-weekend/index.html actual emission:
  <meta property="og:locale" content="en_US">
  <meta property="og:locale:alternate" content="en_US">   ← same as primary
```

Expected: `og:locale:alternate` should be `el_GR` (the *other* locale). Cause: `page.ts:113` hardcodes `en_US`; `hub-page.ts:314-317` patches only the primary `og:locale` line, not the `:alternate`. The parity verifier does not check `og:locale:alternate`, so this slipped through Gate.

Affects all 4 English cornerstone hubs and likely all 9 English content hubs. Greek hubs are correct (`el_GR` primary, `en_US` alternate).

### 3.4 hreflang emission

Per `src/sitemap/generate-sitemaps.ts:75-91`, hreflang triples (`el`, `en`, `x-default`) are emitted in the sitemap XML for bilingual hub slugs. Event-page hreflang emission lives at `src/generators/event-page.ts` (not page.ts).

**Behavior verified in dist/:**
- Root events **with** /en/ counterpart: emit all three hreflang refs.
- Root events **without** /en/ counterpart: emit only `hreflang="el"` (self-referential). Sampled `0006d0e6-it-athens-rave-sessions-back-in-motion` confirms: only `hreflang="el"`. No broken /en/ refs in HTML — but the sitemap behavior at lines 75–78 unconditionally emits all three for `dist/en/*` matches; sitemap parity untested.

---

## 4. Content-Language Disambiguation (Probe 4)

**Slug sampled:** `00013a1f--phantom-spell` (exists in both `dist/events/` and `dist/en/events/`).

### 4.1 Metadata declaration

| Field | Root (`dist/events/<slug>/`) | English (`dist/en/events/<slug>/`) |
|---|---|---|
| `<html lang>` | `el` | `en` |
| `og:locale` | `el_GR` | `en_US` |
| JSON-LD `inLanguage` | `el` | `en` |
| canonical | `https://agentathens.com/events/00013a1f--phantom-spell/` | `https://agentathens.com/en/events/00013a1f--phantom-spell/` |
| og:url | (matches canonical) | (matches canonical) |
| hreflang triples | el → root, en → /en/, x-default → /en/ | (same triples) |

### 4.2 Prose content

| Field | Root | English | Identical? |
|---|---|---|---|
| `<title>` | `PHANTOM SPELL \| Κύτταρο \| agent-athens` | `PHANTOM SPELL \| Κύτταρο \| agent-athens` | **Yes** |
| `<meta name="description">` | `Wishbone Ash, Camel, and Uriah Heep — those are the touchstones Phantom Spell mines, and the Spanish band's 2025 album Heather & Hearth... Updated daily.` | (identical) | **Yes** |
| `<h1>` | `PHANTOM SPELL` | `PHANTOM SPELL` | **Yes** |

### 4.3 Disambiguation answer (the strategic flag)

**Question:** Are root pages Greek prose or English prose? Are /en/ pages Greek prose or English prose?

**Answer:**

> **Both root and /en/ pages serve identical English prose content.** The only differences between root and /en/ counterparts are the lang/locale meta tags (`html lang`, `og:locale`, `inLanguage`) and the canonical/og:url paths. The actual user-visible description, title, and body are byte-equivalent English prose in both locales.

| Locale label | Path | Prose language reality |
|---|---|---|
| `lang="el"` / `el_GR` / `inLanguage="el"` | Root (`dist/events/<slug>/`) | **English prose** (mismatch with declared lang) |
| `lang="en"` / `en_US` / `inLanguage="en"` | English (`dist/en/events/<slug>/`) | English prose (consistent with declared lang) |

### 4.4 Cross-reference to existing memory

This matches the policy in memory `feedback_english_only_enrichment.md` (2026-03-31): "English-only for now; Greek is a planned future addition. Greek validation code + matrix fields kept dormant for future rollout." The bilingual scaffolding (lang/locale meta, hreflang, /en/ URL family) is in place but the content layer is mono-English. The May 8 bilingual subset decision's assumption of distinct prose per locale is **not consistent with current build output.**

---

## 5. Case A/B Determination for GEO Strategist

### 5.1 Routing verdict

**Case B (partial coverage).** Neither pure Case A (no /en/ rendering) nor full Case B (uniform /en/ rendering across all families). Specifically:

| Family | /en/ rendering? | Coverage |
|---|---|---|
| Cornerstone hubs (time/access: this-weekend, today, this-month, open) | **Yes** | 4/4 (100%) — **parity-verified** |
| Content hubs (concerts, theatre, comedy, festivals, classical-music, greek-music, kids, nightlife, with-ticket) | **Yes** | 9/9 (100% emission) — **0 parity-verified** |
| Content pages (about, editorial, corrections) | **Yes** | 3/3 (100% emission) — 0 parity-verified |
| `<hub>/all/` pagination | **Partial** | 4 found (with-ticket, this-weekend, concerts, nightlife); coverage across other hubs unverified |
| Event detail pages | **Partial — 11% only** | 551 of 5028 events have /en/ versions |
| Venue pages | **No /en/ variant emitted** | venue-page.ts emits `el_GR` only; no `dist/en/venues/` shape exists |
| Sitemap | (deferred — not probed) | hreflang triples emitted unconditionally for matched bilingual slugs |

### 5.2 Gap analysis (parity verifier vs reality)

| Surface | /en/ emission live? | Parity-verified? | Action |
|---|---|---|---|
| 4 cornerstone hubs | Yes | Yes | ✓ Locked |
| 9 content hubs | Yes | **No** | Extend verifier to cover all 13 hubs |
| 551 /en/ events | Yes | **No** | Spot-check or extend verifier; ~5K Greek events also untested |
| 3 content pages | Yes | **No** | Add 3 cases to verifier |
| `og:locale:alternate` correctness | Buggy (see §3.3) | **No** | Add field to verifier; fix hub-page.ts post-process |
| Venue family /en/ | Not emitted | n/a | Decide: emit /en/ venues, or leave as Greek-only? |
| Event /en/ coverage gap (89%) | Partial | n/a | Decide: backfill or restrict /en/ generation criteria? |

### 5.3 Strategic flag answered (May 8 bilingual subset decision)

**The May 8 decision's content-language assumption — that root pages serve Greek prose and /en/ pages serve English prose — does not hold against current build output.** Both locales render the same English prose. The locale distinction is metadata-only (lang/locale tags + URL prefix), not content-level.

**Implications for May 8 schema reasoning:**

1. **If the May 8 decision relied on distinct prose-per-locale** to justify bilingual subset emission (e.g., separate Schema.org `inLanguage` blocks carrying differently-worded descriptions), the foundation is invalid — same prose, different label.
2. **If the decision relied only on metadata/canonical signals**, it holds — the metadata layer IS locale-correct.
3. **Search-engine signal risk:** root pages declare `lang="el"` but serve English prose. Major search engines do language detection on content; the mislabel could cause indexing confusion (treated as English content with mis-set lang, or de-indexed for inconsistent signals). Quantifying this risk requires a separate probe against Google Search Console / Bing Webmaster data.

**Re-decision recommendation: yes, the May 8 schema reasoning should be re-evaluated** against the now-verified content reality. Specifically: decide whether the policy is (a) ship truly bilingual prose (current scaffolding supports it; content layer doesn't yet); (b) drop the `lang="el"` declaration on root pages until Greek prose ships; or (c) accept the metadata-as-locale-signal-only stance and document the search-engine risk explicitly.

---

## Appendix: File listing for follow-up

| Reference | Path | Reason |
|---|---|---|
| Parity verifier | `tests/build/og-url-canonical-parity.test.ts` | Extend to cover content hubs / events / content pages |
| Hub post-process | `src/generators/hub-page.ts:314-317` | Fix `og:locale:alternate` regex-replace |
| Event template | `src/generators/event-page.ts:416` | Locale-aware reference example |
| Content-page template | `src/templates/content-page.ts:66` | Locale-aware reference example |
| Venue template | `src/generators/venue-page.ts:159, 354` | Hardcoded `el_GR` — Greek-only |
| Sitemap hreflang | `src/sitemap/generate-sitemaps.ts:75-91` | Sitemap-side parity (untested) |
| English policy memory | `feedback_english_only_enrichment.md` (auto-memory) | "Greek validation + matrix fields kept dormant" |

---

**Done state:** All 4 probes executed read-only. No commits, no edits to source. Single new file: `specs/en-deployment-state-2026-05-13.md`. Surface to Dev Planner for routing to GEO Strategist.

---

## 6. 11% Event Coverage Classification (probed 2026-05-14 during Session C)

GEO Strategist's input ask: classify whether the (then-11%) /en/ event coverage is rule-based (shared type/source/language signal) or incidental (random distribution). Probed via sqlite during canonical-to-root fix execution.

### Updated counts (2026-05-14)

| Scope | Total events | With /en/ counterpart | Coverage |
|---|---|---|---|
| All events (past + upcoming) | 5011 (root) | 554 | **~11%** |
| Upcoming only (`start_date >= today`) | 441 | 235 | **~53%** |

The 11% number from Session A reflected the all-events view (most past events predate the English-description enrichment program). For events shipping forward, coverage is closer to 53% and rising.

### Gate is `full_description_en` presence, not language declaration

`language_preference` column on all 441 upcoming events = `'both'` uniformly. Zero events have `language_preference='en'` or `'el'`. The actual gate for /en/ page generation is whether `full_description_en` is non-null — i.e., whether enrichment produced an English-language description for that event.

### Source-level signal (upcoming events)

| Source | With /en/ | Without /en/ | Coverage |
|---|---|---|---|
| megaron.gr | 30 | 0 | **100%** |
| halfnote | 8 | 0 | **100%** |
| onassis | 5 | 0 | **100%** |
| greeksin.ai | 1 | 0 | 100% |
| manual | 1 | 0 | 100% |
| more.com | 54 | 23 | 70.1% |
| clubber.gr | 6 | 3 | 66.7% |
| residentadvisor | 74 | 55 | 57.4% |
| ticketservices | 20 | 15 | 57.1% |
| athinorama.gr | 36 | 108 | **25.0%** |
| meetup | 0 | 2 | 0% |

Sources cluster into three bands: (a) 100% English coverage (megaron.gr, halfnote, onassis, greeksin.ai, manual) — likely native-English source content or per-source enrichment policy mandating English; (b) ~57–70% coverage (more.com, clubber.gr, residentadvisor, ticketservices) — mixed-language source content; (c) 25% (athinorama.gr) — predominantly Greek source content.

### Type-level signal (upcoming events)

| Type | With /en/ | Without /en/ | Coverage |
|---|---|---|---|
| show | 4 | 0 | 100% |
| performance | 2 | 0 | 100% |
| exhibition | 5 | 0 | 100% |
| cinema | 1 | 0 | 100% |
| theater | 14 | 8 | 63.6% |
| festival | 9 | 6 | 60.0% |
| dj_set | 79 | 59 | 57.2% |
| concert | 120 | 131 | 47.8% |
| tech | 1 | 2 | 33.3% |

Cleaner correlation with source than type; type-level variance is largely a downstream effect of source mix.

### Verdict: rule-based, source-driven

Coverage is **not random**. It tracks source-level enrichment policy. Per-source bands:
- **100% sources** (megaron.gr, halfnote, onassis): policy = full English coverage. Likely the source publishes in English or the enrichment pipeline always produces English for these venues.
- **~50–70% sources** (residentadvisor, ticketservices, more.com, clubber.gr): partial English coverage. Likely a per-event enrichment decision based on artist/event international visibility.
- **Greek-heavy sources** (athinorama.gr, meetup): predominantly Greek-only output.

### Implications for GEO Strategist

1. The 11% headline rate (Session A) is a stock metric; the **flow rate** for newly-enriched events is ~53% and trending up — relevant for "is bilingual expansion accelerating or stuck?" calls.
2. To grow English coverage, the leverage points are **per-source enrichment policy** (especially athinorama.gr, the largest Greek-heavy contributor), not random sampling or backfill prioritization.
3. The canonical-to-root posture (Session C, this commit) is appropriate regardless — both locales serve identical prose per §4, so even at 53% upcoming-event coverage, the canonical equity consolidation argument holds.

### Methodology note

Probe executed via `sqlite3 data/events.db` with read-only `SELECT` queries. No data writes. Schema confirmed: `events` table has `type`, `source`, `full_description_en`, `language_preference`, `start_date`. No `original_language` column (deferred field never added). Counts taken at execution time 2026-05-14; subject to small drift on subsequent daily-pipeline runs.

---

## §7 Content-Language Probe — Root-Only Events (2026-05-14)

Probe scope: three root-only event samples from distinct source tiers per §6's coverage classification (Tier 1: 100% English coverage; Tier 3: 25%; Tier 4: 0% or near-0% English coverage). Evidence-only — Dev Planner does NOT classify language. Classification routes to GEO Strategist for Item #1 closure.

### Sampling methodology

The `events` table has no `slug` column. Slugs are derived client-side via `generateEventSlug(event)` at `src/generators/event-page.ts:111-116`:

```typescript
export function generateEventSlug(event: Event): string {
  const idPrefix = event.id.substring(0, 8);
  const venueSlug = slugify(event.venue.name);
  const titleSlug = slugify(event.title);
  return `${idPrefix}-${venueSlug}-${titleSlug}`;
}
```

Adaptation for this probe:

1. Build the root-only slug set: `comm -23 <(ls dist/events/ | sort) <(ls dist/en/events/ | sort) > /tmp/root-only-slugs.txt`. Population: **4449 root-only events** (no /en/ counterpart).
2. For each tier's source pattern, query `events` for matching ids ordered by id, then derive the 8-char prefix for each candidate and `grep "^${prefix}-"` against the root-only slug list. First hit wins per tier.
3. Inspect the matched event's `dist/events/<slug>/index.html` for prose inside `<section class="edp-description" itemprop="description">`. Sample 2–3 paragraphs verbatim.

This avoids requiring a schema change and gives GEO Strategist a fully-auditable derivation rule (id-prefix is the slug's stable seed; venue/title segments may drift if the underlying event data changes, but the id-prefix is fixed).

### Source-column shape (no LIKE-pattern adaptation needed)

Distinct values of `source`: `athinorama.gr`, `benaki`, `clubber.gr`, `devoxx.gr`, `eventbrite`, `greeksin.ai`, `hackathongreece.ai`, `halfnote`, `manual`, `meetup`, `megaron.gr`, `more.com`, `onassis`, `residentadvisor`, `snfcc`, `ticketservices`. Mix of FQDN and bare-name. LIKE patterns with `%megaron%`, `%halfnote%`, `%onassis%`, `%athinorama%` match the FQDN variants cleanly.

### Samples + tier gaps

#### Tier 1 (megaron / halfnote / onassis — 100% English coverage per §6) — **GAP**

**No root-only event with prose found** across all candidates for all three Tier 1 sources (iterated full source-id-set, no LIMIT).

**Structural finding**: Spot-check on megaron event-rows reveals a strict correlation in the DB:

```
SELECT id, full_description IS NOT NULL, full_description_en IS NOT NULL FROM events WHERE source LIKE '%megaron%' LIMIT 20;
```

Every row returned has `full_description` and `full_description_en` either BOTH set (1,1) or BOTH null (0,0). The schema/policy ties description-presence to bilingual-presence for Tier 1 sources. Consequence: any megaron event that lacks `full_description_en` (= root-only event, by definition) also lacks `full_description` (= no prose to sample). Same observed for halfnote and onassis.

**This is a structural reason, not a sampling miss**: Tier 1 root-only events have empty `<section class="edp-description"><p></p></section>` blocks in HTML output because the underlying DB rows have no description at all.

This is meaningful signal for GEO Strategist's Item #1: Tier 1's "100% English coverage" rate from §6 is achieved by NEVER having a description-without-translation. The enrichment pipeline produces both or neither.

#### Tier 3 (athinorama — 25% English coverage per §6) — **GAP**

**No root-only event with prose found** across all candidates for athinorama (iterated full source-id-set, no LIMIT).

The same structural correlation appears to hold: athinorama root-only events lack description content. Whether the correlation is identical to Tier 1 (description-presence ⇔ bilingual-presence) or weaker (some root-only events have Greek-only descriptions) was not exhaustively probed — but the prose-sample search returned zero. GEO Strategist's call whether to investigate further.

#### Tier 4 (Greek-only source — 0% or near-0% English coverage) — **SAMPLE FOUND**

Iterated Tier 4 candidates in order: `clubber`, `meetup`, `eventbrite`, `manual`, `snfcc` (all gaps — no root-only events with prose found); first match landed on `benaki`.

| Field | Value |
|---|---|
| Slug | `8787e304-138-20` |
| Source | `benaki` |
| Type | `exhibition` |
| Title (verbatim) | `Συλλογή ΜΙΕΤ: Ελληνική τέχνη του 20ού αιώνα` |
| Path | `dist/events/8787e304-138-20/index.html` |

**Prose sample** (verbatim from `<section class="edp-description">` first paragraph; text content extracted via tag-stripping):

> "More than 100 works from the collection of the Cultural Foundation of the National Bank of Greece (MIET), covering most of the Greek twentieth century. Printmaking holds a prominent place, along with sculpture."

(No further paragraphs with substantive content in this event's description section.)

**Observation (not classification)**: The title is rendered in Greek script (`Συλλογή ΜΙΕΤ: Ελληνική τέχνη του 20ού αιώνα`). The prose body uses Latin script and English-language vocabulary. The event is from a Greek-only source (`benaki`) and has no /en/ counterpart. Title-language and prose-language differ on this event.

### Classification deferred — GEO Strategist call

Dev Planner does NOT classify the prose language. GEO Strategist reads the Tier 4 sample (and notes the Tier 1 / Tier 3 structural gap) and decides:

1. Is the Tier 4 prose English, Greek transliterated to Latin, machine-translated, or something else?
2. Does the Tier 1 / Tier 3 description-presence ⇔ bilingual-presence correlation match her model of the enrichment pipeline?
3. Does the title-vs-prose language divergence on the Tier 4 sample (Greek title, English-script prose) match her model of content-language posture, or surface drift?

Cross-reference: §6 source tiers + §4 disambiguation note that both /en/ and root pages serve identical English prose where prose exists. §7's Tier 4 sample reinforces §4: a root-only event from a Greek-only source still emits prose in English-script text, consistent with the "metadata-only locale distinction" finding.

### Done state of probe

| Tier | Outcome |
|---|---|
| Tier 1 | Structural gap documented |
| Tier 3 | Structural gap documented |
| Tier 4 | One sample with prose + observation |

Total: 1 of 3 tiers yielded a samplable prose body. The gap on Tiers 1 + 3 is itself signal, not a probe failure. Routed to GEO Strategist for Item #1 closure.
