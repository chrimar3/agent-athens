# Running the pipeline in a container

The scheduled jobs that handle outside input — scraping websites with Chrome,
reading newsletter emails, AI enrichment over scraped text — run inside a
locked-down container instead of directly on the Mac. If a hostile page, email
or prompt-injected enrichment session gets code running, it lands in the
container and can reach only:

| Reaches | Why |
|---|---|
| The repo's data folders (read-write) | The pipeline writes `data/`, `dist/`, `logs/`, `temp-*` |
| Everything else in the repo, incl. `docs/`, `.netlify/`, `.git/config`, `.git/hooks` (**read-only**) | So nothing it does can change code or instructions your Mac or an agent session later runs |
| `~/.config/agentathens` (read-only, **only runs that need it**) | GSC/Bing API keys |
| The tokens its run needs, and no others | See the table below |

It cannot reach the rest of your home folder, the keychain, SSH keys, browser
profiles, other projects, the backups, the token file or the Mac's system
files. The container runs as a non-root user with every Linux capability
dropped, a read-only system filesystem, a fresh empty home folder on every run
and no open ports. After every run, `docker/integrity-check.sh` checks on the
Mac that nothing in `.git` that steers git changed (config, hooks,
`commondir`, `info/`, alternates …), that new commits touch only data, and
that no file was planted at the repo root; if not, it quarantines the change,
pauses every job and alerts you.
`tests/docker-hardening.test.ts` and `tests/docker-integrity-check.test.ts`
fail if any of that is weakened.

| Run | Schedule | Tokens it receives |
|---|---|---|
| `visibility` | 07:30 | none (reads the API-key folder) |
| `freshness`, scrape and build | 08:00 | git identity only: no GitHub/Netlify token; loads web pages |
| `freshness`, publish | right after, only if the integrity check passes | GitHub, Netlify: never loads a web page |
| `enrichment` | 10:00, 13:00, 16:30, 19:00 | Claude only: no API-key folder, `.env*` hidden, `.git` read-only |
| `verify-live` | 12:15, 20:15 | Netlify token + site id only: reads the live deploy id; the Mac alerts if it is not one the pipeline recorded |
| `image-refresh` | Sundays 05:30 | none: rebuilds the image from scratch so system packages get their fixes |

(The two-step freshness needs the pipeline's deferred-publish mode from the
protected-paths PR; until that is merged, freshness runs as one step holding
both tokens.)

Backups are taken **on the Mac** before each freshness/enrichment run: a plain
copy of `data/events.db` into `~/agent-athens-backups`, which no container can
see or change. The copy waits for other runs to finish, is recorded in
`SHA256SUMS`, and generations are kept in tiers (newest 20, one per day for
14 days, one per week for 8 weeks, one per month for 6 months). Set
`AA_OFFSITE_CMD` (for example a small script calling `rclone copy` or `rsync`
to storage the Mac can write but not delete) to also copy each backup off the
machine. Restore with `docker/restore-backup.sh`, which checks the checksum,
the database's integrity and that it isn't far smaller than the live one.

Every verified deploy is recorded on the Mac in
`~/.config/agentathens-docker/deploys.log`. `verify-live` compares the live
site with that record twice a day, and the watchdog can only restore a deploy
from it, never push whatever is in `dist/`.

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
3. **Env file**, in a folder no container mounts:
   ```bash
   mkdir -p ~/.config/agentathens-docker && chmod 700 ~/.config/agentathens-docker
   cp docker/docker.env.example ~/.config/agentathens-docker/docker.env
   chmod 600 ~/.config/agentathens-docker/docker.env
   open -e ~/.config/agentathens-docker/docker.env   # fill in the tokens
   ```
   If you created `~/.config/agentathens/docker.env` earlier, move it: that
   folder is mounted into some runs. Fill in `NETLIFY_SITE_ID` too; the
   live-site check needs it.
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

- Logs: `~/.config/agentathens-docker/logs/docker-<job>.log` (wrapper; host
  only, so a run can't rewrite the record of what it did) plus the pipeline's
  usual logs in `logs/`.
- **Quarantine:** if a run trips the integrity check, every job stops and you
  get a notification. The evidence is in `~/.config/agentathens-docker/quarantine/`;
  follow `docs/security/incident-response.md`, then remove
  `~/.config/agentathens-docker/QUARANTINE` to resume. Creating a new file at
  the top of the repo while a job runs also trips it (it can't tell you apart
  from a planted file); move yours back from the evidence folder.
- Restore the database: `docker/restore-backup.sh` (newest) or pass a file.
- Update the image after dependency or Dockerfile changes: `docker/aa-run.sh image`.
- Poke around inside: `docker/aa-run.sh shell` (no tokens).
- Rotate a token: edit the env file; the next run picks it up.

## Known limits

- The container can still reach the internet and your local network (it has
  to fetch websites). Treat anything else on your LAN as reachable from it.
- The publish run holds the GitHub and Netlify tokens. It runs no browser and
  reads no outside input; the deploy and push gates decide *what* it may
  publish.
- Runs that load outside content refuse an image older than 30 days (the
  weekly `image-refresh` job keeps it fresh). Chromium itself comes from the
  pinned base image, which Dependabot proposes updating; merge those PRs and
  run `docker/aa-run.sh image`.
- Chrome's own sandbox is off inside the container (Docker's default security
  profile blocks it); the container is the boundary. On the Mac, outside the
  container, the sandbox is now on.
