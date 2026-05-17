# S138 — GSC OAuth Fallback (parked)

Service-account auth path is blocked by Search Console silent-fail on Add user (see `docs/known-issues.md` "GSC Service Account Add-User Silent Fail" entry filed 2026-05-17 during S136).

This spec is a placeholder. Brief to be written when the session is scheduled. Not on critical path for Παναθήναια May 29 demo.

## Pivot direction

OAuth user credentials authenticated as `cmarag8@gmail.com` (the Domain property Owner) instead of service-account credentials. Bypasses the silent-fail entirely — the OAuth flow grants access to the same Google account that owns the property, and Google's API treats user-credentialed calls as the property owner directly.

## When this session ships

- 4 GSC columns in `data/search-visibility-log.csv` (currently `STALE` since 2026-05-17) populate with real values
- `data/top-queries.csv` ships as the long-format file specified by the GEO Strategist 2026-05-17 schema lock — appended with `engine='gsc'` rows
- Bing rows added to `top-queries.csv` in the same session if the API shape can be reconciled (Bing's `Page` field returns full URLs while GSC dimensions query+page jointly — may require schema normalization); otherwise deferred again

## Inheritance from S136 (revision 2026-05-17)

- 27-col CSV shape already in place; this session only populates columns 16-19
- `STALE` / `AUTH_FAIL` two-tier marker pattern already wired in `scripts/monitor-search-visibility.ts`
- Service-account JSON at `~/.config/agentathens/gcp-kpi-reader.json` retained from S136 — either reuse for OAuth flow setup (extracting `project_id` etc.) or rotate to a fresh OAuth client
- `googleapis` dependency NOT yet installed in `package.json` — added when this session implements

## Estimated scope

Similar to the original S136 brief (~250 LOC), but inherits the Bing-side patterns shipped in S136 revision 2026-05-17:
- Fetcher writes JSON, monitor reads JSON (S136 pattern)
- Atomic write inline (no helper extraction)
- 7-day window via `ATHENS_TZ` + Luxon
- Greek URL decode inline via `decodeURIComponent`
- STALE / AUTH_FAIL semantics

## Open questions for the brief

- OAuth client type: installed app (one-time auth, refresh token persisted to disk) vs. service account with Domain-Wide Delegation (requires Google Workspace, which is not configured here) — installed app is the likely path
- Refresh token storage: encrypted at rest? Or accept that personal-Gmail-tier projects don't warrant the complexity?
- Re-auth cadence: refresh tokens for installed apps remain valid until revoked, but Google may invalidate after long inactivity — need a re-auth runbook
- Quota: GSC Search Analytics is rate-limited (1200 queries/min per project, 25k/day) — 2 calls/day per S136 fetcher pattern is nowhere near limit
