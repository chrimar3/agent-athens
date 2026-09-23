# Running the pipeline in a container

The scheduled jobs that handle outside input — scraping websites with Chrome,
reading newsletter emails, AI enrichment over scraped text — run inside a
locked-down container instead of directly on the Mac. If a hostile page, email
or prompt-injected enrichment session gets code running, it lands in the
container and can reach only:

| Reaches | Why |
|---|---|
| The repo folder (read-write) | The pipeline writes `data/`, `dist/`, `logs/` and commits |
| `~/agent-athens-backups` (read-write) | Daily database backup |
| `~/.config/agentathens` (read-only, **freshness/visibility only**) | GSC/Bing API keys |
| The tokens its job needs, and no others | See the table below |

It cannot reach the rest of your home folder, the keychain, SSH keys, browser
profiles, other projects or the Mac's system files. The container runs as a
non-root user with every Linux capability dropped, a read-only system
filesystem, a fresh empty home folder on every run and no open ports.
`tests/docker-hardening.test.ts` fails if any of that is weakened.

| Job | Schedule | Tokens it receives |
|---|---|---|
| `visibility` | 07:30 | none (reads the API-key folder) |
| `freshness` | 08:00 | GitHub, Netlify, git identity |
| `enrichment` | 10:00, 13:00, 16:30, 19:00 | Claude only — no GitHub/Netlify token, no API-key folder, `.env` hidden |

Stays on the Mac: the deadman watchdog (it must not depend on Docker),
deploy-cadence and enrichment-check (macOS notifications, local logs only), the
weekly digest and phase3-weekly.

## One-time setup (≈20 minutes)

1. **Docker Desktop** — install it, then in Settings:
   - General → *Start Docker Desktop when you sign in*: on.
   - Resources → File sharing: remove `/Users` and share only the repo folder,
     `~/agent-athens-backups` and `~/.config/agentathens`. This is what stops a
     misconfigured mount from ever exposing the rest of your home folder.
   - Leave *Expose daemon on tcp://localhost:2375* **off**.
2. **Least-privilege tokens** — create these new, instead of reusing your own
   logins (details and rotation: `docs/security/credentials.md`):
   - GitHub fine-grained token: only `chrimar3/agent-athens`; Contents
     read/write, Issues read/write, Metadata read; 90-day expiry.
   - Netlify personal access token with an expiry.
   - Claude: run `claude setup-token` on the Mac.
3. **Env file**, kept outside the repo:
   ```bash
   cp docker/docker.env.example ~/.config/agentathens/docker.env
   chmod 600 ~/.config/agentathens/docker.env
   open -e ~/.config/agentathens/docker.env   # fill in the tokens
   ```
4. **Build and check**:
   ```bash
   docker/aa-run.sh image     # ~5 min, ~5 GB
   docker/aa-run.sh doctor    # every line should say ok
   ```
5. **Try one real run** by hand, then switch the schedule over:
   ```bash
   docker/aa-run.sh freshness
   docker/install-launchd.sh            # shows the plan, changes nothing
   docker/install-launchd.sh --apply
   ```
   Then add the `com.agentathens.docker.*` labels to `pipeline_health_labels`
   in your deadman config so the watchdog checks the new jobs.

Undo at any time: `docker/install-launchd.sh --rollback` restores the old
host jobs exactly as they were.

## Day to day

- Logs: `logs/docker-<job>.log` (wrapper) plus the pipeline's usual logs.
- Update the image after dependency or Dockerfile changes: `docker/aa-run.sh image`.
- Poke around inside: `docker/aa-run.sh shell` (no tokens).
- Rotate a token: edit the env file; the next run picks it up.

## Known limits

- The container can still reach the internet and your local network (it has
  to fetch websites). Treat anything else on your LAN as reachable from it.
- A job with the GitHub and Netlify tokens (freshness) can still publish. The
  deploy gate and the published-artifact gate decide *what* it may publish.
- Chrome's own sandbox is off inside the container (Docker's default security
  profile blocks it); the container is the boundary. On the Mac, outside the
  container, the sandbox is now on.
