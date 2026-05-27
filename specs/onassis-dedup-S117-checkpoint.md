# Onassis Dedup (Defect 3) + Scraper-Quality — S117 Checkpoint

**Filed:** 2026-05-27 (Session 162)
**Status:** CHECKPOINT — NOT fixed this session. High blast radius (Guard 6). Its own session.
**Sibling:** `specs/onassis-ingestion-defects-S117.md` (Defect 1 shipped this session).

---

## Defect 3 — daily-rescrape duplication

### Current identity key
Event `id = md5(normalized).substring(0,16)` where `normalized` is title+date(+venue). The dedup contract is `INSERT ... ON CONFLICT(id) DO UPDATE` (`scrape-all.ts:1340`). **`id` includes `start_date`** (`scrape-all.ts:83-85` `generateEventId(title, date, venue)`).

### Why daily rescrape duplicates
Because `start_date` is baked into the identity, any run where the same exhibition gets a **different `start_date`** produces a **different `id`** → a NEW row instead of an upsert. For the fragile Onassis/SNFCC exhibition scrapes the date is unstable: a single displayed date parsed into `start_date` (Defect 2), el-vs-en pages yielding different dates, or scrape-influenced dates. Observed in S116: same exhibition across multiple `start_date`s (e.g. ONX Showcase el+en; SNFCC Barbara Kruger across 3 dates). The fix is a **stable identity** (e.g. `source` + canonical URL slug) that survives date drift — but that is a change to the shared write path.

### Enumerated call sites a key change would touch (Guard 6 — ALL sources, not just Onassis)
`generateEventId` is **copy-pasted per scraper** with two inconsistent signatures (note this — a key change must unify them):
- `scripts/scrape-all.ts:83` (3-arg title+date+venue) — used at `:322, :590, :753, :824, :1011, :1117, :1467 (Onassis adapter), :1489, :1513`; conflict clause `:1340`.
- `scripts/scrape-onassis.ts:41` (**2-arg**, no venue) — `:218`.
- `scripts/scrape-megaron.ts:28` (2-arg) — `:180`.
- `scripts/scrape-benaki.ts:51` (2-arg) — `:248`.
- `scripts/scrape-snfcc.ts:114` (3-arg) — `:347, :427, :517`; conflict `:579`.
- `scripts/scrape-ai-tech.ts:81` (3-arg) — `:1049`; conflict `:1037`.
- `scripts/fix-malformed-data.ts:22` (3-arg) — `:68, :106` (id-rewrite path — must stay in sync or it orphans rows).
- Archived (do not touch): `scripts/_archive/import-events-from-parsed.ts:31`, `scripts/_archive/scrape-residentadvisor.ts:62`.

**Risk:** changing the identity key changes which rows collide on re-scrape across every source; mis-done, it either mass-duplicates (existing rows no longer match new ids) or mass-collides (distinct events sharing a key). Needs its own session with a migration plan for existing ids and a parity test. Do NOT fold into a one-source fix.

---

## Defect 2 (folded here) — single/wrong date → start_date, end_date empty
- Bounded to `scripts/scrape-onassis.ts` date parsing (`parseGreekDate` + range regex `:154-160`).
- **Not fixed this session** (reasoned): every observable instance is a Defect-1-rejected garbage row; a correct fix needs a live `dateText` sample and touches Tier-1 `COALESCE(end_date,start_date)` pageability — risk > reward blind. Belongs with the scraper rewrite below.
- ⚠️ When fixed: re-run the S116 per-type pageability check; confirm no exhibition flips in/out of the pageable set.

## Incidental findings (scraper-quality, same session as the rewrite)
- **Over-broad selectors** (`scrape-onassis.ts:115-118`: `.card`, `article`, `h2,h3,.title`) capture site chrome as events — the true upstream cause of Defect 1. Defect 1's save-seam reject is the safety net; precise selectors are the real fix.
- **Type mis-assignment**: `scrape-onassis.ts:223` hardcodes `type:'exhibition'` for everything (e.g. "By Heart | Tiago Rodrigues" is theater). Re-categorize from content.
- **Single hardcoded fallback** (`:187-195` Yorgos Lanthimos) ships one stale event when scraping yields nothing — goes stale silently.

## Recommended next session
"Onassis (and exhibition-scraper) quality rewrite": precise selectors + content-typed events + Defect 2 date fix + the stable-identity dedup key (with id-migration plan covering all sources above). The save-seam reject shipped in S117 protects the corpus in the meantime.
