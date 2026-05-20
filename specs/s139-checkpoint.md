# S139 Checkpoint — 2026-05-20

**Status:** Stage 1 + Stage 5 (absorbed) + Stage 2 committed on `main`. **Stages 1+2+5 DEPLOYED to production (Netlify deploy `6a0d64ceaf7de0392246f4ad`, published 2026-05-20 10:38 Athens, `commit_ref: null` — manual `--no-build --dir=dist` fallback) — verified live @graph envelope on EDP + venue pages (probes 2026-05-20).** Stages 3-4 remain (NOT STARTED).

**Deploy reconciliation (2026-05-20 post-checkpoint):** Deploy of stages 1+2+5 already occurred; stage 3+4 resumption does NOT re-deploy 1+2+5. Step 7 (push + deploy) below applies only to stage 3+4 work; Option B has effectively occurred.

**Deploy attribution correction (2026-05-20 follow-on):** Prior checkpoint correction (`8ed86aad3`) cited git commit `bead0b152` as the deploy mechanism — conflating a git commit hash with a Netlify deploy ID (Pattern C, commit-message-as-state-proxy). Deploy log (`netlify api listSiteDeploys`) refutes the linkage: deploy `6a0d6385` titled "Daily deploy 2026-05-20" at 10:32 Athens ERRORED; the successful ship was `6a0d64ce` at 10:37 with `commit_ref: null` — a manual fallback 5 minutes later. `bead0b152` (git commit) and `6a0d64ce` (Netlify deploy) are not linked. Stages 1+2+5 verified live via HTML probe — the load-bearing fact regardless of which artifact triggered the ship.

**Reason for checkpoint:** Plan's overflow protocol — past Stage 2 commit, context budget at risk. Per plan: "Completed stages are independently deployable. Partial-deploy of completed stages is preferable to context-saturated full pass."

---

## Commits landed this session

1. `41b913182` — `refactor(layout): compose hub capsule + category-nav via preFilterBarHtml (Path D)` — **Step 0c WIP commit, not part of S139 envelope migration.** Closed wrong-anchor regex defect at three sites per `specs/capsule-drift-audit-2026-05-18.md`. 9 regression tests added.

2. `32bac9a0c` — `refactor(emit): event-page emits @graph envelope (S139 stages 1+5)` — Stage 1 event-page emitter + absorbed Stage 5 validator helpers. See commit message for full detail.

3. `6ea0b264d` — `refactor(emit): venue-page emits @graph envelope (S139 stage 2)` — Stage 2 venue-page emitter. LocalBusiness FIRST → site-publisher Organization LAST; upcoming-events nested under LocalBusiness.event (user-confirmed minimal-diff path).

## Plan-vs-reality discoveries (for institutional memory)

1. **Brief-vs-reality drift** (re-confirmed; not blocking, surfaced via Explore agent):
   - `src/generators/event-page.ts` — `buildEventSchemaObject` at **:144** (brief said :154)
   - `src/generators/venue-page.ts` — schema fn at **:60** (brief said :64)
   - `src/templates/page.ts` — hub `ListItem.item.@id` at **:469** (brief said :467)
   - `src/templates/editor-picks.ts` — `@id` only on lines **55, 61** (brief said 55, 61, 82; 82 is a closing tag)
   - `data/build-completeness.json` — totals live at `.events.totals` / `.hubs` / `.venues` (per-layer roots), NOT `.totals`. Adjust Step 0a jq accordingly.

2. **Stage 5 had to be absorbed into Stage 1.** Plan claimed "Stages 1-4 work without Stage 5 because extractAllJsonLd already iterates all blocks." In reality: extractAllJsonLd iterates all script blocks but does NOT unwrap `@graph` members. When the only HTML block is an envelope, the validator falls back to validating the envelope itself as the Event entity → cascade of "missing field" errors (4153 failures observed pre-fix). Minimal fix: `flattenGraph()` + `resolveSamePageReferences()` at validator extraction boundary in `src/validators/schema-completeness.ts`. Both helpers + 9 unit tests added in stage 1's commit.

3. **Test-update surface broader than estimated.** Plan said "~30-50 test updates." Actual touch:
   - `src/generators/__tests__/event-page.test.ts` — new `parseEventFromEnvelope` + `findEntity` helpers; equivalence-tests block replaced with envelope-contract tests
   - `src/validators/__tests__/schema-completeness.test.ts` — 9 new tests for `flattenGraph` + `resolveSamePageReferences`
   - `tests/build/og-url-canonical-parity.test.ts` — `extractJsonLdUrl` made @graph-aware
   - `tests/build/single-event-schema.test.ts` — `countEventBlocks` made @graph-aware
   - `tests/schema-enhancements.test.ts` — `offers.validFrom` tests updated to extract Event from envelope
   - Total: ~5 test files, ~30 assertion sites updated. Within original estimate.

4. **DataFeed contract preserved.** `buildEventSchemaObject` left untouched (returns flat Event entity); DataFeed (`src/generators/datafeed.ts:41`) and the in-build flat validator (`src/utils/schema-validator.ts`) continue to consume the flat shape. The @graph envelope is added at the HTML-emission boundary only via `buildEventGraphEnvelope`.

## Current state per layer

| Layer | Pre-S139 baseline | Post-S139 (stages 1+2) |
|---|---|---|
| events | 4151/4169 pass, 0 fail | 4151/4169 pass, 0 fail (restored after validator fix) |
| venues | 47/47 pass, 0 fail | 47/47 pass, 0 fail |
| hubs | 26/28 pass, 0 fail | 26/28 pass, 0 fail (hubs still flat — stage 3 pending) |
| datafeed | 1/1 pass, 0 fail | 1/1 pass, 0 fail |
| tests | 2245 pass, 0 fail | 2245 pass, 0 fail |
| tsc | clean | clean |

## Stages remaining

### Stage 3 — Hub page envelope (NEXT)

**Files to modify:**
- `src/generators/hub-page.ts` — FAQ schema (`renderFaqSchema`)
- `src/templates/page.ts` — `generateSchemaMarkup` (CollectionPage emitter) + hub ListItem (line :469)
- `src/templates/editor-picks.ts` — existing `@id` on lines 55, 61 already match envelope scheme; ensure consistency
- Tests: `src/generators/__tests__/hub-page.test.ts` + `src/templates/__tests__/*.test.ts`

**Target structure:**
1. CollectionPage (FIRST) — `@id: {hubCanonicalUrl}#collectionpage`
2. FAQPage (cornerstone-only) — `@id: {hubCanonicalUrl}#faqpage`
3. editor-picks ItemList (cornerstone-only) — `@id: {hubCanonicalUrl}#editor-picks` (already emitted with this @id; moves into the graph)
4. site-publisher Organization (LAST)

**`ListItem.item.@id`** values inside `CollectionPage.mainEntity.ItemList` stay as-is (cross-page references to canonical event pages, not same-page graph members).

**Care:** Hub page generation currently emits TWO separate JSON-LD blocks on cornerstone hubs (CollectionPage in page.ts:138-143, FAQPage in hub-page.ts:251). Stage 3 collapses them into one envelope. Need to confirm both emission paths converge into a single `@graph` block — likely requires hub-page.ts to thread FAQPage through to page.ts as a pre-computed graph member, or pass a `schemaMarkup` graph from hub-page.ts that page.ts uses directly.

### Stage 4 — Homepage envelope

**Files to modify:**
- `src/templates/page.ts` — homepage branch (`url === 'index'` at :138-143)
- `src/utils/schema-geo.ts:186` — `ORGANIZATION_SCHEMA` is already paralleled by `buildSiteOrganizationGraphMember()` added in stage 1. Stage 4 can replace the homepage's flat Organization block with the new helper.

**Target structure:**
1. WebSite (NEW, not currently emitted) — `@id: ${BASE_URL}/#website`
2. CollectionPage — `@id: ${BASE_URL}/#collectionpage`
3. Organization (LAST as singleton publisher) — `@id: ${BASE_URL}/#organization` (use `buildSiteOrganizationGraphMember()`)

### Step 6 — Full test + tsc

```bash
bun test
bunx tsc --noEmit
```

### Step 7 — Push + deploy

```bash
git push origin main
netlify deploy --prod --no-build --dir=dist
```

⚠️ `--no-build` mandatory.

### Step 8 — Post-deploy sample verification

Sample one URL per page class:
- `https://agentathens.com/`
- `https://agentathens.com/events/{slug}/`
- `https://agentathens.com/venues/{slug}/`
- `https://agentathens.com/ai-tech/`

Each should emit one `@graph` block, members in correct order.

### Step 9 — Google Rich Results Test on 4 samples

Paste each URL into https://search.google.com/test/rich-results. Verify:
- 0 errors (was 0 pre-S139; must remain 0)
- Detected entity types include all `@graph` top-level members
- No new warning class from the migration

---

## Decision required at session resume

**Option A: Continue full S139 in next session (recommended).**
Pick up at Stage 3. After all stages land, do a single push + deploy + 4-sample RRT sanity. Cleanest demo signal.

**Option B: Deploy stages 1+2 now (this session), do stages 3-4 later.**
Push the 3 current commits, deploy via netlify CLI, run RRT on event + venue samples only. Hubs + homepage continue emitting flat (no regression — same as pre-S139). Stage 3-4 land in a follow-up session and re-deploy.

Option B is what the plan's overflow protocol authorizes (`Stages 1-N already committed are deployed (or deploy now)`). Option A is more aesthetic.

## Reusable artifacts for next session

- `buildSiteOrganizationGraphMember()` at `src/utils/schema-geo.ts:200` — emit site-publisher Organization graph member with `@id`. Use as LAST member in stage 3 hub envelope + stage 4 homepage envelope.
- `flattenGraph()` + `resolveSamePageReferences()` at `src/validators/schema-completeness.ts` — already applied to validateHubSchema + validateVenueSchema, so stage 3 + stage 4 don't need additional validator work.
- `extractHost()` from `src/utils/ticket-source-classifier.ts` — derive host for `@id` construction.
- Test pattern: `parseEventFromEnvelope` / `findEntity` helpers in `src/generators/__tests__/event-page.test.ts` are the canonical denormalizing-parse pattern for envelope-shaped JSON-LD test fixtures.

## Plan file location
`/Users/chrism/.claude/plans/session-goal-implement-squishy-whistle.md`
