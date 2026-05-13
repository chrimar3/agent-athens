# s-tba-bypass — bypass writer diagnostic (2026-05-13)

**Trigger:** Audit 2026-05-13 §3 P0 finding: 42 `price_type='tba'` rows regenerated 24h after S136's "0 remaining" migration.
**Mode:** Read-only diagnostic. No code changes in this document.
**Companion:** `specs/s-tba-resolution-2026-05-13.md` (forthcoming, post-fix).

---

## 1. Baseline (Step 0 reconfirmation)

```
SELECT COUNT(*), MIN(updated_at), MAX(updated_at), DISTINCT source
FROM events WHERE price_type='tba';
→ 42 | 2026-05-13 05:09:11 | 2026-05-13 05:22:17 | residentadvisor (only)
```

All 42 rows were written in a 13-minute window matching the daily-automated pipeline run. All carry a populated `ticket_url` (`https://ra.co/events/...`) — they are merchant-classified events that *should* be `price_type='with-ticket'`, not `'tba'`.

## 2. Writer enumeration (Step 1)

Greps run:
- `grep -rn "UPDATE events" src/ scripts/ --include='*.ts'`
- `grep -rn "INSERT INTO events" src/ scripts/ --include='*.ts'`
- `grep -rn "price_type" src/ scripts/ --include='*.ts'` (filtered to assignments)
- `grep -rn "normalizePriceType" src/ scripts/ --include='*.ts'`

### Classification

| writer site | goes through `normalizePriceType`? | currently produces `'tba'`? | classification |
|---|---|---|---|
| `src/db/database.ts:92` (canonical `upsertEvent`) | **yes** | n/a (normalizes input) | OK — reference path |
| `scripts/scrape-all.ts:1407` (residentadvisor + others) | **no** | **yes** — see §3 | **BYPASS, ACTIVE PRODUCER** |
| `scripts/scrape-ai-tech.ts:1048-ish` (`$price_type: e.price_type`) | **no** | no (adapter never emits 'tba') | bypass, dormant |
| `scripts/scrape-snfcc.ts:~590` (`$price_type: e.price_type`) | **no** | no (adapter never emits 'tba') | bypass, dormant |
| `scripts/scrape-megaron.ts:178` | **yes** (calls canonical `upsertEvent`) | no | OK |
| `scripts/scrape-benaki.ts:273` | **yes** | no | OK |
| `scripts/scrape-onassis.ts:243` | **yes** | no | OK |
| `scripts/import-all-events.ts:49+` | **yes** (calls canonical `upsertEvent`) | no | OK |
| `scripts/price-acquisition-chain.ts` (multiple UPDATEs) | n/a | n/a (writes `price_amount`/`price_source`/`price_range` only, not `price_type`) | not a `price_type` writer |
| `scripts/save-batch.ts:307,330` | n/a | n/a (writes description/tags/ticket_url, not `price_type`) | not a `price_type` writer |
| `scripts/run-enrichment-pipeline.ts:271` | n/a | n/a (writes enrichment fields, not `price_type`) | not a `price_type` writer |
| `scripts/validate-ticket-urls.ts` (UPDATEs) | n/a | n/a (writes `ticket_url_status`; `price_type` only used in WHERE) | not a `price_type` writer |
| `src/ingest/email-ingestion.ts:331` | n/a | n/a (writes a `price` column, not `price_type`; commented as **DEAD CODE**) | not a `price_type` writer |
| `src/images/image-pipeline.ts:34` | n/a | n/a (writes `image_local` only) | not a `price_type` writer |
| `scripts/_archive/*` | n/a | n/a (archived, not in daily pipeline) | out of scope |

**Audit hypothesis correction:** the 2026-05-13 audit named `src/ingest/email-ingestion.ts:322` and `src/images/image-pipeline.ts:34` as candidate bypass paths. Both turn out to be red herrings — neither writes the `price_type` column. The bypass is at the scraper-side raw-SQL writers (`scripts/scrape-all.ts`, `scripts/scrape-ai-tech.ts`, `scripts/scrape-snfcc.ts`), which the audit flagged only as "possibly a residentadvisor scraper-side raw write."

## 3. Upstream trace: where `'tba'` enters the pipeline

`scripts/scrape-all.ts` contains five `'tba'` literals. The active producer for the 42-row regression is the **residentadvisor adapter** at lines 1080-1135:

```ts
for (const e of raEvents) {
  // ...
  let priceType = 'tba';     // ← line 1091: sentinel default

  if (e.cost && e.cost !== 'TBA') {
    if (e.cost === '0' || e.cost.toLowerCase() === 'free') {
      priceType = 'open';
    } else {
      // regex match on cost string → priceType = 'with-ticket'
    }
  }

  events.push({
    // ...
    price_type: priceType,     // ← line 1125: stays 'tba' if cost was missing/TBA
    // ...
  });
}

// Fetch prices from event pages for TBA events (up to 20)
const tbaEvents = events.filter(e => e.price_type === 'tba');   // ← line 1134
```

After the per-event-page fetch loop (line 1134+), some events get bumped to `'with-ticket'` (line 1167: `event.price_type = 'with-ticket';`); the rest stay `'tba'`.

Then at line 1407, the INSERT binds raw:
```ts
$price_type: e.price_type,   // ← line 1407: bypass, no normalizer
```

**Design intent (inferred):** `'tba'` is an **internal sentinel** meaning "needs price discovery." It survives to the INSERT only when the per-event-page fetch fails to resolve a price. That's exactly the 42-row case — events that came through the GraphQL API with `cost: 'TBA'` and whose detail-page fetch didn't yield a numeric price.

**S136's intent:** the belt-and-suspenders `normalizePriceType()` at the write boundary was supposed to catch precisely this — map sentinel `'tba'` to canonical `'with-ticket'` at INSERT time. The defect is that `scripts/scrape-all.ts` is a parallel writer that never adopted the normalizer.

## 4. Other `'tba'` producers in `scripts/scrape-all.ts` (defense-in-depth scope)

The four other `'tba'` literals are in adapters not involved in the current regression but on the same vulnerable write path:

| line | adapter (inferred from context) | shape |
|---|---|---|
| 330 | unknown adapter | `price_type: price ? 'with-ticket' : 'tba'` |
| 598 | unknown adapter | `price_type: 'tba'` |
| 832 | unknown adapter | `price_type: 'tba'` |
| 1019 | unknown adapter | `price_type: price ? 'with-ticket' : 'tba'` |

These do not currently appear in the 42-row regression (the residentadvisor source filter is exclusive), but they share the same writer at line 1407. Fixing the writer covers all five producer sites at once.

## 5. Fix surface (informational — not executed in this doc)

Per Guard 6 (shotgun-surgery — every writer touched in this session) and the brief's "single function call addition" constraint:

1. `scripts/scrape-all.ts:1407` — change `$price_type: e.price_type` to `$price_type: normalizePriceType(e.price_type)`. Import the normalizer (currently un-exported from `src/db/database.ts`; needs export decision — see §6).
2. `scripts/scrape-ai-tech.ts` — same pattern.
3. `scripts/scrape-snfcc.ts` — same pattern.

**Validator extension** (separate file, separate concern):
- `src/validators/schema-completeness.ts` — new rule asserting `event.price_type ∈ {'open', 'with-ticket', 'donation'}` at FAIL severity. Independent of `PLACEHOLDER_VALUES` semantics (which is for text-equality checks like venue-name placeholders, not vocabulary).

**Re-migration:**
- Single transactional UPDATE: `price_type='tba'` → `'with-ticket'` for all 42 in-scope rows. Matches S136's mapping (its commit message: "Migrate 1,155 existing 'tba' rows to 'with-ticket' in a single transaction").

## 6. Open decision before fix

**Normalizer is currently `function normalizePriceType()` (not exported).** It lives at `src/db/database.ts:64`. To call it from `scripts/scrape-all.ts` etc., one of:

- **(a)** Export it from `src/db/database.ts`, import into the three scraper scripts.
- **(b)** Hoist it to `src/db/normalize.ts` (or similar shared module), re-import in `database.ts` and scrapers.

(a) is the minimal-touch change. (b) is cleaner long-term but introduces a new module. Default to (a) unless the file is already too large or there's an architectural reason to split.

**Decision:** (a). Single-line export keyword addition. The function is small (~10 lines), no need to extract.

## 7. Scope of the resolution session

In scope:
- Writer normalizer routing at 3 sites (scrape-all, scrape-ai-tech, scrape-snfcc).
- Validator rule for `price_type` vocabulary at FAIL severity.
- Tests for both (writer normalization unit tests + validator rule test).
- 42-row re-migration in a transaction.
- Full test + typecheck + build green.
- Deploy.

Out of scope (do not expand into this session):
- Refactoring `scrape-all.ts`'s sentinel-`'tba'` design (it works fine post-normalizer).
- Orphan-seller / Offer-shape validation (Sprint 3 work, B-05).
- `isPlaceholder()` extension semantics (separate concern; placeholder-text vs vocabulary are different checks).
- Reconciling the 4 dormant `'tba'` producers in scrape-all.ts to canonical values upstream (writer fix is sufficient).
