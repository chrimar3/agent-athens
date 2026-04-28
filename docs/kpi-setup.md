# KPI Pipeline Setup — Operator Actions

This document covers the manual setup and operator workflows for the KPI tracking infrastructure landed in S100. The KPI database lives at `data/kpi.db` (gitignored). The schema is created by `bun run scripts/kpi-init.ts` (idempotent).

S100 ships **Path B (minimum viable checkpoint)**: schema + seeded prompts + baseline + manual logging template. Automated importers (GSC API, GA4 API, server-log parsing) are deferred to **S100b** pending Google Cloud auth setup. BWT remains manual CSV per upstream API absence.

---

## 1. Bing Webmaster Tools (BWT) — manual CSV download

BWT has no API. Download CSVs from the dashboard.

### Workflow

1. Log into [Bing Webmaster Tools](https://www.bing.com/webmasters) → select `agentathens.com`.
2. Navigate to **AI Performance** (BETA tab, left sidebar).
3. Pick the time window (default 3M; for first import, use 3M to capture full pre-amplification baseline).
4. Two tabs to export:
   - **Grounding Queries** → "Download all" → save as `~/Downloads/bwt-grounding-YYYY-MM-DD.csv`
   - **Pages** → "Download all" → save as `~/Downloads/bwt-pages-YYYY-MM-DD.csv`

### Step 6.1 — Verify CSV column headers BEFORE writing the parser

The parser implementation (Step 6.2) is **deferred until the actual CSV header schema is known**. Apr 28 BWT showed 0 citations; downloaded CSV may have empty data tab — that's fine, what matters is the column-header row.

Run from project root after download:

```bash
head -3 ~/Downloads/bwt-grounding-*.csv
head -3 ~/Downloads/bwt-pages-*.csv
```

Capture the exact header row in `specs/s100b-bwt-csv-headers.md` for the S100b parser implementation. If headers differ from the schema's expected columns (`query, citations, cited_pages, ...` for grounding; `page_url, citations, ...` for pages), update `data/kpi.db` schema in S100b before writing the parser. Cheap to change; nothing has shipped data yet.

### Re-verification cadence

- **Pre-S101 land:** verify BWT still shows 0 citations (capture screenshot to `specs/`)
- **Weekly post-S101:** download fresh CSV, run `bun run scripts/kpi-import-bwt.ts --file=...` (S100b importer)
- **First non-zero citation event:** must be timestamped immediately. It's the watchdog-floor analog for the citation arc.

---

## 2. Google Search Console (GSC) API — deferred to S100b

GSC has an API. The S100 plan assumed an existing client — none exists (Step 0 confirmed State C). S100b will build the importer; S100 ships nothing here.

### S100b prerequisite operator actions (~20 min)

When ready to run S100b:

1. **Create a Google Cloud project** (or reuse one): https://console.cloud.google.com/
2. **Enable the Search Console API:** APIs & Services → Library → "Search Console API" → Enable.
3. **Create a service account:** IAM & Admin → Service Accounts → Create. Name it e.g. `agentathens-kpi-reader`. No org-level roles needed.
4. **Generate a JSON key:** the service account → Keys tab → Add Key → Create New Key → JSON. Save to `~/.config/agentathens/gcp-kpi-reader.json` (gitignored; never commit).
5. **Grant GSC property access:** in [Google Search Console](https://search.google.com/search-console) → property `agentathens.com` → Settings → Users and permissions → Add user → enter the service account email (from step 3) → Restricted access (read-only).
6. **Set the auth env var** for the importer:
   ```bash
   export GOOGLE_APPLICATION_CREDENTIALS="$HOME/.config/agentathens/gcp-kpi-reader.json"
   ```

### S100b will deliver

`scripts/kpi-import-gsc.ts` — fetches `searchanalytics.query` data, applies the long-query regex (≥10 words OR `best|how|why|which|what is|where can|when does`), inserts into `gsc_queries_long`. Default `--since=30d` window.

---

## 3. Google Analytics 4 (GA4) API — deferred to S100b

Same auth pattern as GSC (service account + JSON key). Different API to enable.

### S100b prerequisite operator actions

1. **Enable the Google Analytics Data API** in the same Google Cloud project.
2. **Find the GA4 property ID:** GA4 Admin → Property → Property ID (10-digit number).
3. **Grant the service account access:** GA4 Admin → Property → Property Access Management → Add user → service account email → Viewer role.

### S100b will deliver

`scripts/kpi-import-ga4.ts` — fetches sessions where session source matches AI engine domains (`chatgpt.com|perplexity.ai|gemini.google.com|copilot.microsoft.com|claude.ai`), inserts into `ga4_ai_referrals`. Daily `last_24h` cadence (GA4 referrer attribution latency ~24h).

---

## 4. Netlify access logs — deferred to S100b (manual-CSV mode)

Netlify access logs are dashboard-only on the current plan (no Functions logs API export to disk via free tier). The S100b importer will accept a manual download.

### S100b prerequisite operator actions

1. Netlify Dashboard → site `agentathens` → **Logs** → Functions / Edge / Access (whichever has User-Agent visibility on this plan).
2. Filter by date range; export to CSV (or copy-paste to a file).
3. Save as `~/Downloads/netlify-access-YYYY-MM-DD.csv` (or whatever Netlify exports).

### S100b will deliver

`scripts/kpi-import-logs.ts` — parses the access log for User-Agents matching `OAI-SearchBot|GPTBot|ClaudeBot|PerplexityBot|Bingbot|Google-Extended|Applebot-Extended|CCBot`, inserts into `server_log_ai_bots`. Tracks last imported timestamp to avoid double-counting on re-run.

---

## 5. Manual citation logging — see `docs/kpi-manual-logging-template.md`

GEO Strategist owns the weekly logging. Dev provides the template; the SQL pattern is ready in `tracked_prompts` post-S100.

---

## 6. Backup cadence

`data/kpi.db` is small (KB-scale until citation data lands). Recommended:
- Weekly `cp data/kpi.db data/kpi.db.weekly-$(date +%Y%m%d)` (don't commit; gitignored)
- Pre-major-import `cp data/kpi.db data/kpi.db.pre-import-$(date +%Y%m%d)` (forensic snapshot)

The 7-day rolling backup script (`scripts/backup-events-db.sh` for events.db) does NOT cover kpi.db. Add a parallel script in S100b or include kpi.db in the existing backup script.
