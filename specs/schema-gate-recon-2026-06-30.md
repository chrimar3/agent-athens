# Schema-Gate Reclassification — Premise Recon (2026-06-30)

**Session type:** Read-only prerequisite discovery for GEO's gate-reclassification sprint.
**Scope:** Ground the four premises (source-class field · front-stop state · addressDisclosure state · 06-28 failing-set split). 0 source/config/data files mutated; this spec is the only output.
**Status:** ALL 4 premises GROUNDED. #3b was briefly BLOCKED by a data-loss incident discovered mid-recon; the DB was restored from backup (operator-directed, see §INCIDENT → RESOLVED) and 3b is now answered against the restored snapshot.

---

## 🟢 INCIDENT — RESOLVED (DB restored 2026-06-30 10:23)

**Restore confirmed:** operator-directed sequence — stopped `com.agentathens.daily`, decompressed `events-2026-06-29.db.gz`, verified (15,506 rows, `integrity_check=ok`) BEFORE touching the live slot, preserved the 4 KB dud as `data/events.db.empty-2026-06-30` (forensics), then restored. Live `data/events.db` = **15,506 rows, `enriched_at 2026-06-29 10:06:26`, integrity ok, all 20 tables present** (incl. `processed_emails`). Content lost = **none** (last import was 06-28; today had no new scrape). `com.agentathens.daily` left **UNLOADED** pending root-cause; enrichment slots still loaded.

---

## 🔴 INCIDENT (as discovered — kept for the record)

**`data/events.db` was lost overnight and was empty when recon started.**

| Fact | Evidence |
|---|---|
| DB is empty (no tables) | `sqlite3 data/events.db ".tables"` → blank; `.schema` → blank; file = **4096 bytes**, mtime **2026-06-30 08:06** (was **69 MB / 15,506 rows** at 2026-06-29 17:15) |
| Loss happened overnight | `logs/pipeline-2026-06-30.log:9` — `01:03:29 ERROR: Database not found at .../data/events.db` (already gone by first run today) |
| Backup phase overwrote the slot with an empty backup | `pipeline-2026-06-30.log:24` — `Created /Users/chrism/agent-athens-backups/events-2026-06-30.db.gz (114B)` (114 B = gzip of empty DB) and `Pruned 1 backup(s) older than 7 days` |
| Today's full build failed on empty DB → **did NOT deploy** | `pipeline-2026-06-30.log:1192-1194` — `build exited code 1` → `Site generation failed — skipping deploy` |
| **Production is SAFE (frozen, not broken)** | `curl agentathens.com/sitemap-events.xml` → **684 `<url>`**, `<lastmod>2026-06-29` (= the 2026-06-29 manual deploy; empty site never shipped) |

**Recovery is guaranteed — a good pre-loss backup exists:**
`/Users/chrism/agent-athens-backups/events-2026-06-29.db.gz` — **11,312,791 B, mtime 2026-06-29 16:30** (before the loss). Backups present 06-22 → 06-29 (all ~10–11 MB / real) plus the 114 B 06-30 dud.

**Recovery path (NOT executed — needs operator OK; mutation outside this session's read-only scope):**
```bash
# from repo root, with no pipeline running:
cp data/events.db data/events.db.empty-2026-06-30   # keep the dud for forensics
gunzip -c /Users/chrism/agent-athens-backups/events-2026-06-29.db.gz > data/events.db
sqlite3 data/events.db "SELECT COUNT(*) FROM events;"  # expect ~15,506
```
**Time pressure:** LOW-MODERATE. The 7-day rolling prune removes the 06-29 good backup ~2026-07-06; each daily run also re-writes the 114 B dud and prunes one more day. No emergency before operator responds, but restore before 07-06 and ideally pause `com.agentathens.daily` until restored so it stops failing/pruning.

**Two backup-system defects to route (separate from GEO sprint):**
1. Backup phase runs unconditionally — it backed up an empty DB over the day's slot. Needs an integrity/row-count floor (`refuse to back up a DB with 0 rows / smaller than the prior backup`).
2. Prune is time-based only — an empty-DB day still consumes a slot and prunes a good one. Prune should skip dud backups.

**Root cause of the loss itself: UNKNOWN / not in scope here.** The file existed at 69 MB at 17:15 on 06-29 and was missing by 01:03 on 06-30. No `data/backups/` dir; events.db is gitignored (git can't recover it). Candidate windows: the 06-29 19:00/22:00 enrichment slots, or an external/disk/manual event. Forensic owner = Planner.

---

## Premise findings

### #0 — Source-class field (GEO's rule keys on a field that may not exist as named)

**FINDING: `verified_core` / `source_class` does NOT exist as a venue taxonomy in code, config, or data. It is NET-NEW build surface.**

- The only venue-class field is **`location_status`** — `src/types.ts:67`:
  `'verified_athens' | 'pass_through' | 'unverified' | 'rejected_non_athens' | 'problematic'` (mirrored in `.claude/CLAUDE.md` Data Model). No `verified_core`. **Live DB confirms** (post-restore `GROUP BY location_status`): `verified_athens 13,179 · unverified 2,258 · problematic 61 · pass_through 8` — only 4 of 5 enum values present, zero `verified_core`.
- `grep -rniE "verified_core|source_class|coreBoundaryRule"` across `src/ scripts/ config/` → **0 venue hits.** The only `source_class`-shaped symbol is `TicketSourceClass` (`src/utils/ticket-source-classifier.ts:19`), which classifies **ticket-purchase URLs**, unrelated to venue address obligation.
- The gate does **not** read `location_status` (or any class) to key a disclosure default — `grep location_status|source.?class|disclosure src/validators/schema-completeness.ts` → only a comment at `:363` referencing the ticket classifier. **The gate is class-blind today.**

**Implication for sprint:** the field that distinguishes "owes a street" vs "structurally doesn't" must be **built**. Cheapest grounding: `location_status === 'pass_through'` already means "not a real venue but allowed" (`src/quality/location-filter.ts:23`, e.g. Πολλαπλοί Χώροι / Multiple Venues) — that is the existing "structurally no street" signal. A `verified_core` *sub-split of `verified_athens`* does not exist and is the net-new editorial/taxonomy decision. ⚠️ DB-distinct-values confirmation pending restore, but `types.ts` enum is authoritative.

### #1 — Front-stop deploy state (GEO recon #1)

**FINDING: There is NO config-load front-stop that rejects addressless venues. The shipped guard is the S174 scrape-time guard and it is WARN-NOT-BLOCK.**

- `src/db/database.ts:263-278` (`upsertEvent`, the ingest write seam): when `event.venue.address` AND `findVenueConfig(name)?.address` both bottom out empty, it logs `[address-guard] venue="…" missing address … streetAddress will emit empty; add to config/athens-venues.json`. Comment is explicit: **"warn-not-block … The event ALWAYS persists — completeness never blocks collection."** Deduped one warning per venue per run.
- It **is** wired onto the ingest path (it's inside `upsertEvent`, the canonical write seam — `database.ts:281` `eventToRow`). So it runs, but only warns.
- No `front.?stop` / `reject.*streetAddress` symbol exists anywhere (`grep` → only this guard + comments at `generate-site.ts:1731`).

**Implication:** `pass_through` (and any addressless) venues are **not exempt and not blocked** — nothing stops them reaching the publishable window; the guard merely emits a `[address-guard]` warning. So the brief's premise of a "2026-06-09 config-load front-stop" is **not grounded** — what shipped (S174) is a warn-only scrape-time guard, not a rejecting front-stop. If GEO's plan assumes a deployed rejecting front-stop, that assumption is false.

### #2 — addressDisclosure field deploy state (GEO recon #2) — **biggest sprint-size determinant**

**FINDING: `addressDisclosure` is ABSENT entirely (option c). Not in config, not read in code.**

- `grep -c "addressDisclosure" config/athens-venues.json` → **0**.
- `grep -rn "addressDisclosure" src/ scripts/ --include='*.ts'` → **0**.

**Implication:** the disclosure mechanism is fully net-new — schema (config field) + reader (schema-gen / gate consumption) + population. This is not "routed-but-unbuilt"; it's "absent." Size the sprint for build-from-scratch, not wire-up.

### #3 — Split the 06-28 failing set + current residual (GEO recon #3)

**Part A — the 67 split (GROUNDED, from log + yesterday's brief):**
- 06-28 failing set = **67 errors, all `location.address.streetAddress missing`** (`logs/pipeline-2026-06-28.log:5972,6007`): **51× event-detail pages + 16× CollectionPage (hub) ListItems**.
- **pass_through fraction = 0.** Per `specs/p1-deploy-unblock-brief-2026-06-28.md` (Step-0, grounded while DB was live): the only page-generating bucket with empty addresses was `verified_athens` (137 ev / 48 venues); `pass_through` = 0 ev with empty address; `unverified` (203 ev/107 venues) does NOT generate pages (`generate-site.ts:169` filters to verified_athens+pass_through). 10/10 sampled failing IDs were `verified_athens` at major venues (National Opera, SNFCC, Megaron, Onassis, Gazarte…).
- **verified_core fraction = N/A** — the field doesn't exist (see #0). All 67 are `verified_athens`. How many of those a reclassification would dissolve depends entirely on the **net-new** verified_core/addressDisclosure decision — **not derivable from current data.** On today's taxonomy, the reclassification dissolves **≈0** of the historical failures; the backfill is the real path (consistent with the p1 brief's "BACKFILL-VERIFIED ONLY, no fast-exclude path" ruling).

**Part B — current residual backfill count: GROUNDED (against restored 06-29 snapshot).**
Publishable (`verified_athens`+`pass_through`) venues with empty `venue_address`:
- **All-time: 79 distinct venues.**
- **UPCOMING (gate-relevant — these generate gate-checked pages): 36 distinct venues / 105 events.** (exhibition window uses `end_date` per Tier-1.)
- This is an **upper bound** on the gate-failing backfill: the true gate-fail subset = those 36 minus any already carrying an address in `config/athens-venues.json` (the cascade `event.venue.address || findVenueConfig(name)?.address || ''` fills the latter). The authoritative gate count is whatever a fresh `bun run build` reports — and recall it's **time-variant** (Session 193: aged out to 0 once already).
- Tracks yesterday's p1-brief estimate (~34-35 venues / 97 events), set rolled forward one day.

Query used:
```bash
sqlite3 data/events.db "SELECT COUNT(DISTINCT venue_name) FROM events
  WHERE location_status IN ('verified_athens','pass_through')
    AND COALESCE(NULLIF(TRIM(venue_address),''),'')=''
    AND COALESCE(CASE WHEN type='exhibition' THEN end_date ELSE NULL END, start_date) >= date('now');"  # → 36
```

---

## Summary for Planner

| # | Premise | State | Ground |
|---|---|---|---|
| 0 | source-class / `verified_core` field | **net-new** (closest existing = `location_status`/`pass_through`) | `types.ts:67`, grep=0 |
| 1 | 2026-06-09 config-load front-stop | **premise false** — only a WARN-only scrape-guard shipped (S174) | `database.ts:263-278` |
| 2 | `addressDisclosure` field | **absent** (build-from-scratch) | config grep=0, src grep=0 |
| 3a | 06-28 pass_through vs verified_core split | pass_through=**0**; verified_core=**N/A (field absent)**; reclass dissolves ≈0 today | log:5972/6007 + p1 brief |
| 3b | current residual backfill count | **36 venues / 105 upcoming events** (≤36 gate-failing after config cascade) | restored DB query |

**Net sizing signal:** three of the four structures GEO's sprint keys on (`verified_core` class, rejecting front-stop, `addressDisclosure` field) are **net-new or false-premise**, not wire-ups. The reclassification, on today's taxonomy, dissolves ≈0 of the real failures — the verified-address backfill of **≤36 upcoming venues** into `config/athens-venues.json` (per `specs/p1-deploy-unblock-brief-2026-06-28.md`) remains the load-bearing fix and is independent of the reclassification.

**Open for Planner:** (1) the brief's post-session step says to log "GEO's 2026-06-30 ruling (the log-ready entry they supplied)" to `decisions.md` — the actual ruling text was **not included** in the brief I received; cannot add without it (would be fabrication). Supply the entry. (2) DB-loss root cause + backup-system hardening (§INCIDENT) is a separate Pipeline-Reliability item.
