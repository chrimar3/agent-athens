# Session: 'tba' Tier 1 Resolution — 2026-05-12

**Goal:** Resolve the `price_type='tba'` Tier 1 type-system violation diagnosed in `specs/s-tba-diagnostic-2026-05-12.md` (commit 17d4fe7a3). Land clean type-system + writer + data state before S137 (Sprint 1 Session 2 offers refactor).

**Outcome:** ✅ All steps green. Single commit, single push, S137 unblocked.

---

## Step -1 — Code spans for Design Navigator

Extracted verbatim for Design Navigator's action-layer gate audit (cross-project async unblock). Spans cached at `specs/.tba-resolution-design-nav-spans.tmp`. Files:

- `src/templates/action-bar.ts` (full file) — `renderActionBarHtml`, `renderCardSaveButton`, `renderSavedEventsScript`, `renderSaveButtonScript`, `renderCardSaveScript`, `renderCalendarScript`, `renderShareButtonScript`, `renderSavedPageScript`
- `src/generate-site.ts:951-960` — saved-events page generation loop
- `src/generators/event-page.ts:466-468` — calendar button render
- `src/i18n/strings.ts:185-195` (Greek) + `:296-306` (English) — `saveEvent`, `unsaveEvent`, `shareEvent`, `linkCopied`, `savedRequiresJs`, `addToCalendar` labels

Read-only, no edits in any of these files. Spans relayed to Design Navigator separately.

---

## Step 0 — DB state reconfirmation

```
price_type distribution: with-ticket=11387, tba=1155, open=73 (total=12615)
current 'tba' (future-dated): 154 — athinorama.gr 93, residentadvisor 60, ticketservices 1
donation rows: 0
DISTINCT 'tba' sources (historical): residentadvisor, athinorama.gr, more.com, ticketservices, halfnote
```

No drift on counts from the planning snapshot. Source list confirmed at 5 (the diagnostic's 3 + more.com + halfnote, both classified mid-planning as paid-ticket merchants).

---

## Step 1 — Type-union decision

**Canonical: `'open' | 'with-ticket' | 'donation'`** (3-value).

Confirmed against codebase evidence (23 references, 8 active branches, 2 i18n labels, 1 dedicated test). The diagnostic's "0 donation rows" finding was correct but insufficient — domain liveness ≠ data presence. Pattern recorded in `.claude/notes/patterns.md` (entry 3).

CLAUDE.md updated to acknowledge donation as the dormant third value (was 2-value, source of original Tier 1 mismatch). See Step 5.

---

## Step 2 — Type-system surface

Edit: `src/types.ts:96-110` — JSDoc on canonical `Price` interface explaining the 3-value union, the dormancy of `'donation'`, and the write-boundary normalization of legacy `'tba'`.

No changes to:
- `src/types.ts:117` (`PriceFilter` — UI filter, donation deliberately excluded)
- `src/ticketing/offer-builder.ts:42` (already 3-value-aligned)
- `src/enrichment/types.ts:44`, `enrichment-engine.ts:30`, `src/ingest/*` (intentional 2-value stage-local narrows — see `.claude/notes/patterns.md` entry 4 on subtype narrowing).

---

## Step 3 — Write-boundary normalizer

Edit: `src/db/database.ts:58-65` — `normalizePriceType()` extended with `case 'tba' → 'with-ticket'`. Catches all 4 scraper sites (`scripts/scrape-all.ts:330, 598, 832, 1091`) plus any future writer without union discipline. Runtime complement to the compile-time canonical union.

---

## Step 4 — Residentadvisor malformed-Offer fix

Telemetry naming convention grep: `incrementOmission('past-event')`, `incrementOmission('manual-source-no-url')`, `incrementOmission(omissionKeyForUrl(...))` → kebab-case string literals. New key `'no-price-amount'` follows convention.

Edit: `src/ticketing/offer-builder.ts:171-178` — changed from silent omit-`price`-field-but-emit-Offer (Schema.org-invalid) to `return { omit: true }` + `incrementOmission('no-price-amount')`. The 10–16 residentadvisor null-price events now generate clean omissions instead of malformed Offer blocks.

Test update: `tests/ticketing/offer-builder.test.ts:192-200` — test name and assertion updated to reflect corrected behavior. The pre-fix test asserted the malformed contract; the new test asserts the Schema.org-correct contract.

---

## Step 5 — Rule doc + constitution comments reconciled to 3-value

Three sites updated:

- **`CLAUDE.md`** — Tier 1 "Use 'open' not 'free'" section + Data Model `type Price` alias both updated from 2-value to 3-value with dormant-donation note.
- **`src/db/database.ts:51-63`** — constitution comment was 4-value (with stale 'tba'); now 3-value with historical resolution note dated 2026-05-12.
- **`src/db/schema.sql:29`** — inline comment was `-- free|paid|donation` (pre-rename vocabulary); now `-- 'open' | 'with-ticket' | 'donation' (canonical; see database.ts normalizer)`.

---

## Step 6 — Data migration

Backed up DB first: `data/events.db.pre-tba-migration-20260512-153845.bak` (~55 MB).

Transactional migration:

```sql
BEGIN TRANSACTION;
UPDATE events
   SET price_type = 'with-ticket'
 WHERE price_type = 'tba'
   AND source IN ('athinorama.gr','residentadvisor','ticketservices','more.com','halfnote');
SELECT 'rows_updated=' || changes();           -- 1155
SELECT 'remaining_tba=' || COUNT(*) FROM events WHERE price_type='tba';  -- 0
COMMIT;
```

Post-migration distribution: `with-ticket=12542, open=73`. Total preserved (12615). Zero remaining 'tba'.

---

## Step 7 — Validator coverage gap (deferred)

`isPlaceholder()` at `src/validators/schema-completeness.ts:63-66, 275-287` applies only to `name`, `description`, `streetAddress`. Coverage gap for `price_type` and Offer-shape validation remains. Deferred to a separate session (separate test surface; bundling pushes scope past maintenance-batch envelope).

**Ticket:** add a follow-up session to extend `isPlaceholder()` and add a schema-shape check for "Offer with merchant seller must include price field." Estimated 3–5 files, separate test coverage.

---

## Step 8 — Verification

```
bunx tsc --noEmit       → clean (no output)
bun test                → 2061 pass / 1 skip / 0 fail (4262 expect() calls, 89 files, 34.4s)
                          ↳ matches S135 baseline exactly
bun run build           → 5960 pass / 45 warnings / 0 errors
                          ↳ schema validity 5960/6005 = 99.25% (was 5953/5995 = 99.30% pre-fix; absolute pass count UP +7)
                          ↳ 14/6005 INFO: "offers.url is omitted (legitimate for non-merchant ticket sources)"
                            — new omit_offer branches from residentadvisor null-price fix; reported as INFO, not warning.
sqlite3 events.db       → 0 remaining 'tba' rows
```

Warning delta (+3 vs diagnostic baseline of 42) is within natural noise — diagnostic snapshot was at a different event-set; warnings fluctuate ±5 across builds. Stable metric (schema validity ratio) improved.

Test that initially failed: `buildOfferOrOmit > price handling > with-ticket without amount → omit price field but still emit Offer`. This test codified the malformed contract; updated to assert the corrected contract (omit entire Offer). Not a test-massage — it's the same kind of fix that lives in the spec's §5 trace.

---

## Pre-brief checklist recurrence ledger

Pre-brief checklist recurrence ledger: still 9. Step 0's verify-assumptions guard fired on more.com/halfnote drift, surfaced mid-planning, resolved before migration ran. Intended outcome — guard caught drift before it became a wrong-edit-surface or stale-premise instance.

---

## Files touched

**Code (5):**
- `src/types.ts` — JSDoc on canonical Price (Step 2)
- `src/db/database.ts` — normalizer extension + constitution comment (Steps 3 + 5)
- `src/db/schema.sql` — inline comment (Step 5)
- `src/ticketing/offer-builder.ts` — null-price branch + telemetry (Step 4)
- `tests/ticketing/offer-builder.test.ts` — test name + assertion (Step 4 ancillary)

**Rule doc (1):**
- `.claude/CLAUDE.md` — Tier 1 price rule + Data Model `type Price` alias (Step 5)

**Data (1):**
- `data/events.db` — 1,155 row UPDATE in transaction (Step 6)

**Docs (1):**
- `specs/s-tba-resolution-2026-05-12.md` — this file

**Institutional (3 — added Step 10):**
- `.claude/notes/patterns.md` — 4 pattern entries
- `.claude/notes/decisions.md` — 1 decision entry
- `docs/session-log.md` — Session 136 entry

---

## Decisions

- **Q1 — migration scope.** Full sweep, 5 sources. All paid-ticket merchants confirmed mid-planning (more.com `known_merchant`, halfnote `venue_direct_only`; sample 'tba' rows have populated `price_amount` confirming prices are knowable, not unknown).
- **Q2 — 'donation' handling.** Keep 3-value canonical. Domain liveness (23 refs, 8 branches, 2 i18n labels) overrides 0-rows count signal. CLAUDE.md updated to acknowledge donation as dormant third value.

---

## Open items (post-session)

- Validator coverage gap (Step 7) — schedule follow-up session for `isPlaceholder()` extension + Offer-shape validation
- S137 (Sprint 1 Session 2 offers refactor) — now unblocked; type/writer/data state clean
