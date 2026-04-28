# S100 KPI Prerequisites — Step 0 Findings

**Captured:** 2026-04-28 (S100 Step 0)
**Purpose:** Record the auth/infra state before any KPI implementation lands. Subsequent steps (3 GSC, 4 GA4, 5 server-log, 6 BWT) all depend on these findings.

## 0.1 — BWT (Bing Webmaster Tools) state

Operator action; not auto-verifiable. Apr 28 screenshot showed 0 Total Citations / 0 Avg. Cited Pages on the 3M view. **Re-verify before Step 6 BWT CSV import.** First non-zero citation event must be timestamped (it's the watchdog-floor analog for the citation arc).

## 0.2 — GSC/GA4 auth state: **State C (nothing exists)**

| Probe | Result |
|---|---|
| `package.json` deps mentioning google | none |
| `googleapis`/`google-auth`/`@google-cloud` in `src/`/`scripts/` | 0 imports |
| `~/.config/gcloud/` | not checked (gcloud not available in shell) |
| `gcloud auth list` | command not available / non-interactive |

**Implication for Step 3 (GSC) and Step 4 (GA4):** The original plan said "reuse existing GSC auth client." There is no such client. Per the plan's own fallback ("If Step 0.2 found State C") — the importers ship as scaffold + operator-action documentation in `docs/kpi-setup.md`.

**No new paid keys are needed (per Constitutional reminder).** The auth setup itself is operator action: Google Cloud project + service account + GSC/GA4 property linkage. Free tier covers expected query volume.

## 0.3 — S91 search-visibility writer

| Item | Value |
|---|---|
| Script | `scripts/monitor-search-visibility.ts` |
| Output | `data/search-visibility-log.csv` (append-only) |
| Header | `date,sitemap_events,sitemap_venues,sitemap_editorial,sitemap_total,indexnow_submitted,indexnow_success,indexnow_batches,indexnow_last_run,robots_http,sitemap_http,llms_http,sample_accessible,sample_size,gsc_indexed,bing_indexed,ai_citations_count,enriched_last_24h,wrapper_discrepancy_last_24h,notes` (20 columns) |
| Mode | Mixed: automated metrics (sitemap, indexnow, http, sample) + manual fields via CLI flags (`--gsc-indexed=`, `--bing-indexed=`, `--ai-citations=`) |
| Stack | Bun + bun:sqlite (imports from `data/events.db` for the `enriched_last_24h` and `wrapper_discrepancy_last_24h` automated cuts) |

**No SQLite write conflict** — S91 writes only to a CSV. New `kpi.db` is a separate write surface. **No STOP condition triggered.**

**Conceptual overlap:** S91 has aggregate `gsc_indexed` / `bing_indexed` / `ai_citations_count` columns (single-number daily counters). New `kpi.db` decomposes those aggregates into per-row tables (per-query GSC, per-page BWT, per-bot server-log, per-prompt-per-engine manual log). They serve different needs — keep both. S91 is the dashboard-row source; kpi.db is the analytical-detail source.

**Recommended treatment in S100:** parallel infrastructure. Do NOT redirect S91 writer to populate kpi.db. Future session can add a one-liner that dual-writes a daily summary row into `kpi.db` aggregating from kpi.db detail tables.

## 0.4 — Netlify access logs

| Probe | Result |
|---|---|
| `logs/` dir | Only auto-enrich + freshness + monitor-visibility pipeline logs. No Netlify access logs. |
| `daily-automated.sh` | Calls `netlify deploy --prod` but does NOT download access logs. |
| Bot-detection code in scripts | None. AI-bot UA strings appear only in `src/generate-site.ts:1184-1212` (robots.txt generation). |

**Implication for Step 5 (server-log importer):** Netlify access logs are dashboard-only on the current Netlify plan. Importer must ship in manual-CSV-download mode (operator downloads from Site → Logs in Netlify dashboard, runs `bun run scripts/kpi-import-logs.ts --file=<path>`). This matches the BWT importer pattern.

## P4 target_page sanity check

P4 (`exhibitions in Athens this month`) targets `/exhibitions`. Verified:
- `dist/exhibitions.html` exists locally
- `https://agentathens.com/sitemap-editorial.xml` includes `/exhibition` (singular, no trailing s) and likely `/exhibitions` (plural)

⚠️ Aside: `dist/en/exhibitions.html` does NOT exist. P4 is English-language but targets the EL-route `/exhibitions` per GEO's intent (English query → cornerstone served at `/exhibitions` which is bilingual in content). Seed P4 as-spec'd.

### Cross-reference: EN-mirror absence is a recurring pattern

This is the **fourth EN-route absence** observed in the last day. Pattern visible across:
- `/en/tomorrow` → 404 (S100a finding, in `docs/known-issues.md`)
- `/en/this-week` → 404 (S100a finding)
- `/en/next-month` → 404 (S100a finding)
- `/en/exhibitions.html` → missing locally (this finding)

Three+ such gaps suggest a **build-config or template-generation issue at the EN-mirror layer**, not per-page failures. The EN cornerstones for `/en/today`, `/en/this-weekend`, `/en/this-month` DO exist; the missing routes appear to be a subset.

**Routing this to S101b Step 0** (not S100). When `/today` is touched in S101b, Step 0 of that session should audit EN-mirror generation logic across the board — `find dist/en -type f -name "*.html" -or -type d` cross-checked against the EL-route inventory + the editorial sitemap. Don't pivot S100 to investigate; it's a discrete generator concern with its own session affinity.

S100 seeds P4 as-spec'd against `/exhibitions` (EL route). If the S101b audit later determines P4 should target `/en/exhibitions`, update via `config/tracked-prompts.json` + re-seed — 2-line config edit.

## Summary of impact on S100 Steps 1-9

| Step | Plan assumed | Actual state | Adjusted approach |
|---|---|---|---|
| 1 (schema) | Build kpi.db with 7 tables | No conflict | Proceed as-spec'd |
| 2 (seed prompts) | Seed 5 prompts | No conflict | Proceed as-spec'd |
| 3 (GSC importer) | Reuse existing auth | **State C — no auth** | Ship scaffold + `docs/kpi-setup.md` operator action |
| 4 (GA4 importer) | Reuse existing auth | **State C — no auth** | Ship scaffold + `docs/kpi-setup.md` operator action |
| 5 (server-log) | Local Netlify logs | **Logs are dashboard-only** | Ship manual-CSV mode (matches BWT pattern) |
| 6 (BWT CSV) | Manual CSV per plan | Matches plan | Proceed as-spec'd; verify CSV headers in 6.1 |
| 7 (report) | Aggregates from all tables | No conflict | Proceed; some sections will report "no data — auth-pending" |
| 8 (baseline) | Captures pre-amplification state | Auth-pending sources will show "n/a (auth pending)" rows | Capture honest state |
| 9 (handoff doc) | Manual logging template | No conflict | Proceed |

## Recommended decision before continuing

Three paths:

**Path A — full session as planned, with scaffolds.** Proceed Steps 1-9. GSC + GA4 + server-log importers ship as scaffolds with `docs/kpi-setup.md` documenting operator setup. ~5-7 files written, ~400 LOC. The kpi.db is functional; only its data sources are auth-pending.

**Path B — minimum viable checkpoint (recommended).** Proceed Steps 1-2 + Step 6.1 (BWT CSV header probe) + Step 8 (baseline) + Step 9 (handoff doc). Defer Steps 3, 4, 5, 7 to a follow-up session that includes Google Cloud auth setup. Faster to ship; honest baseline; Sprint 5 KPI framework is "skeleton + 5 prompts seeded + baseline captured" by end of session.

**Path C — full implementation including auth.** Same as Path A but I run through Google Cloud Console operator steps to create service-account credentials. **Out of scope per Constitutional reminder** ("Zero external API cost. No paid LLM calls. GA4/GSC use existing Google Cloud auth") — there's no existing auth, and creating new GCP credentials is operator action with security implications (service-account JSON keys), not autonomous code work.

**My recommendation: Path B.** Reasoning:
1. The Constitutional reminder anticipates "existing Google Cloud auth" — its absence means S100 explicitly doesn't include creating it autonomously.
2. The plan's own STOP condition for Step 3 says "GSC API client setup is its own session." Same logic applies to GA4.
3. Steps 1-2 + 6.1 + 8 + 9 are independently valuable: kpi.db schema + 5 prompts + honest baseline + handoff doc. GEO Strategist starts manual logging this week against the seeded prompts.
4. The deferred Steps (3, 4, 5, 7) become an own-session "S100b: KPI auth + automated importers" with the user setting up Google Cloud credentials beforehand.

Path B keeps the I/O comparison anchor (May 19) intact — manual logging captures the citation arc; the auth-pending automated cuts are nice-to-have augmentation.
