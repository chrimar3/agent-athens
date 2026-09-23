# Credential inventory

Every secret the project uses, where it lives, what it can do, and how to
replace it. Values never go in this repo (it is public). Keep this table
current when a credential is added or moved.

| Credential | Lives in | Used by | Blast radius if stolen | Least-privilege setup |
|---|---|---|---|---|
| GitHub token (`GH_TOKEN`) | `~/.config/agentathens-docker/docker.env` | freshness: `git push`, yield canary issues | Push to this repo; open/close issues | Fine-grained PAT, only `chrimar3/agent-athens`; Contents RW, Issues RW, Metadata R; 90-day expiry |
| GitHub CLI login (`gh auth login`, macOS keychain) | Mac, host mode only | legacy host pipeline: `git push` credential helper | Whatever scopes you granted gh, often all your repos | Remove once the container runs the pipeline: `gh auth logout` |
| Netlify CLI login (`netlify login`) | `~/Library/Preferences/netlify/config.json` | legacy host pipeline, `bun run deploy` / `scripts/redeploy.sh` | **Account-wide** | The watchdog's rollback now runs through `docker/aa-run.sh restore`, so after the container switch you can `netlify logout`; log back in only for a manual `bun run deploy` |
| Netlify site id (`NETLIFY_SITE_ID`) | `~/.config/agentathens-docker/docker.env` | publish, verify-live | Not a secret; pinned so no container-writable file picks the target site | — |
| Netlify token (`NETLIFY_AUTH_TOKEN`) | `~/.config/agentathens-docker/docker.env` | freshness: `netlify deploy` | **Account-wide**: deploy or delete any site on the account | Dedicated token with expiry; keep only this site on the account, or a separate Netlify account for it |
| Claude token (`CLAUDE_CODE_OAUTH_TOKEN`) | `~/.config/agentathens-docker/docker.env` | enrichment: `claude -p` | Uses your Claude subscription quota | `claude setup-token`; revoke from claude.ai settings |
| Gmail app password (`EMAIL_USER`/`EMAIL_PASSWORD`) | repo `.env` (gitignored) | freshness: IMAP newsletter ingestion | Read (and delete) the mailbox | A dedicated Gmail account that only receives the newsletters — never your personal mailbox |
| Google Geocoding key (`GOOGLE_GEOCODING_API_KEY`) | repo `.env` | freshness: geocoding fallback | Billing on the Google Cloud project | Restrict the key to the Geocoding API; set a daily quota cap |
| GCP service account (`gcp-kpi-reader.json`) | `~/.config/agentathens/` | visibility, freshness: Search Console read + sitemap submit | Search Console for agentathens.com | Only the Search Console property; no other GCP roles |
| Bing API key | `~/.config/agentathens/bing-api-key` | visibility | Bing Webmaster data for the site | Site-scoped key |
| Perplexity key | `~/.config/agentathens/perplexity-api-key` | phase3-weekly (host) | API spend | Spending cap on the provider |
| msmtp app password | `~/.msmtprc` | deadman watchdog email (host) | Send mail as that account | Dedicated alerts mailbox |
| ntfy topic | `~/.config/agentathens/ntfy-topic` or `AGENTATHENS_NTFY_TOPIC` | deadman and integrity-check alerts | Read or spoof alerts | Long random topic, or ntfy access tokens. **The topic that used to be in `config/monitoring.json` is public in git history: treat it as burned, create a new one and resubscribe your phone** |
| Google Maps browser keys | saved third-party pages under `data/event-pages/`, `data/html-to-parse/` | nothing: they belong to the scraped sites | none for this project (they are the other sites' public browser keys) | the project has no Maps key of its own; the folders are allowlisted in `.github/gitleaks.toml` |
| IndexNow key | `config/indexnow.json` | freshness: IndexNow ping | None — public by design (the key file is served) | — |

## File permissions on the Mac

```bash
chmod 700 ~/.config/agentathens ~/.config/agentathens-docker
chmod 600 ~/.config/agentathens/* ~/.config/agentathens-docker/docker.env ~/.msmtprc
chmod 600 "<repo>/.env"
```
`docker/aa-run.sh` refuses to run if `docker.env` is readable by anyone but
you, or if it sits in a folder a container mounts (the repo,
`~/.config/agentathens`, the backups).

## Rotation schedule

- GitHub and Netlify tokens: every 90 days (set the expiry when creating them
  and a calendar reminder a week before).
- Everything else: on any suspicion (see `incident-response.md`) and at least
  yearly.

After rotating, run `docker/aa-run.sh doctor` — it checks that each token is
set and that GitHub accepts the new one.
