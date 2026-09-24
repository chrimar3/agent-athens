# Running the pipeline in a container

The scheduled jobs that handle outside input — scraping websites with Chrome,
reading newsletter emails, AI enrichment over scraped text — run inside a
locked-down container instead of directly on the Mac. If a hostile page, email
or prompt-injected enrichment session gets code running, it lands in the
container and can reach only:

| Reaches | Why |
|---|---|
| The repo's data folders (read-write) | The pipeline writes `data/`, `logs/`, `temp-*`; `dist/` only in the build run (read-only for scrape and publish) |
| Everything else in the repo, incl. `docs/`, `.netlify/`, `.git/config`, `.git/hooks` (**read-only**) | So nothing it does can change code or instructions your Mac or an agent session later runs |
| `~/.config/agentathens` (read-only, **only runs that need it**) | GSC/Bing API keys |
| The tokens its run needs, and no others | See the table below |
| The internet and your local network, **except the build run**, which has no network | Scraping, email, enrichment and publishing need it |

It cannot reach the rest of your home folder, the keychain, SSH keys, browser
profiles, other projects, the backups, the token file or the Mac's system
files. The container runs as a non-root user with every Linux capability
dropped, a read-only system filesystem, a fresh empty home folder on every run
and no open ports. After every run, `docker/integrity-check.sh` checks on the
Mac that nothing in `.git` that steers git changed (config, hooks,
`commondir`, `info/`, alternates …), that new commits touch only data, and
that no file was planted at the repo root, and that git's object store only
grew (no existing object or pack changed or vanished, every new object hashes
to its name, new packs pass `git verify-pack`; containers never gc); if not,
it quarantines the change,
pauses every job and alerts you.
`tests/docker-hardening.test.ts` and `tests/docker-integrity-check.test.ts`
fail if any of that is weakened.

| Run | Schedule | Tokens | API-key folder | `.env` | `.git` | `dist/` | Network | Time limit |
|---|---|---|---|---|---|---|---|---|
| `visibility` | 07:30 | none | read-only | hidden | read-only | writable | yes | 30 min |
| `freshness`, ingest | 08:00 | none (mailbox password from `.env`) | none | read-only | read-only | writable | yes | 30 min |
| `freshness`, scrape | right after | **none**; loads web pages | none | hidden | read-only | **read-only** | yes | 3 h |
| `freshness`, build | right after, only if the integrity check passes | git identity only (commits to `pipeline-data`) | none | hidden | may commit | writable | **none** | 45 min |
| `freshness`, publish | right after, only if the integrity check passes | GitHub, Netlify, git identity: never loads a web page | Search Console key only | hidden | may commit | **read-only** | yes | 30 min |
| `enrichment` | 10:00, 13:00, 16:30, 19:00 | Claude only | none | hidden | read-only | writable | yes | 90 min |
| `verify-live` | 00:15, 06:15, 12:15, 18:15 | Netlify token + site id only: live deploy id, snippet injection, a hash of the security-relevant site settings, and the security headers and CSP of the home page and one event page. The Mac alerts on an unrecorded or rolled-back deploy, any snippet, changed settings (baseline `~/.config/agentathens-docker/live-baseline`, created on the first clean run; after reviewing an intended change: `AA_ACCEPT_LIVE_BASELINE=1 docker/aa-run.sh verify-live`), a missing header or a CSP allowing inline scripts | none | hidden | read-only | writable | yes | 10 min |
| `restore ID` | by hand / watchdog | Netlify token + site id only | none | hidden | read-only | writable | yes | 10 min |
| `image-refresh` | Sundays 05:30 | none: rebuilds from scratch and runs `apt-get upgrade`, so Ubuntu packages get their fixes. It does not update Chromium (see Known limits) | – | – | – | – | – | – |

`build` and `publish` can also be run by hand, in that order: `publish` refuses
to start unless a `build` run has just recorded a dist hash, and each hash is
used once (a failed publish needs a new `build`).

**Sealed build.** The build run turns the scraped data into the site with no
network and no secret: nothing a hostile page planted in the data can phone
home or fetch more code while `dist/` is written. It prints
`BUILD-RESULT dist_hash=…`; the Mac keeps that hash (in
`~/.config/agentathens-docker/`, which no container mounts) and records the
publish run's deploy in `deploys.log` only if the publish run reports the same
hash. On a mismatch, or with no build hash, the deploy is not recorded, you
get an alert, and `verify-live` keeps alerting until a good deploy is live.

Which freshness you get depends on the pipeline in `scripts/daily-automated.sh`
(protected-paths PR): with `AA_SKIP_BUILD` support, the four runs above; with
only deferred publishing (`AA_DEFER_PUBLISH`), the scrape run also builds and
commits (git identity, `.git` committable, `dist/` writable) and there is no
hash check; with neither, freshness runs as one step holding both publishing
tokens.

**Time limits.** Every container run is stopped (`docker kill`) when it runs
past its limit (`AA_JOB_TIMEOUT_MIN=<minutes>` overrides it for every run of
one invocation). The run then counts as failed (exit 124), the integrity check
still runs, and you get an alert. The limit is wall-clock time: a Mac that
sleeps through it stops the run on wake.

The API-key folder is mounted only where it is used: the scrape run gets none
of it, the publish run gets only the Search Console key (sitemap submission),
`visibility` gets the folder read-only. Newsletter email is fetched in its own
`ingest` run (mailbox password from `.env`, no browser) before the scrape run,
which then sees no `.env` at all (needs the pipeline's `AA_SKIP_INGEST`
support from the protected-paths PR).

Rollback without a Mac-side Netlify login: `docker/aa-run.sh restore <id>`
restores a deploy, but only one recorded in `deploys.log`; the watchdog uses
the same path. Set `AA_OFFSITE_CMD` in your shell before
`docker/install-launchd.sh --apply` and the scheduled runs inherit it.

**Host runs are refused.** Once the protected-paths PR is merged,
`scripts/daily-automated.sh` and `scripts/auto-enrich.sh` exit with code 9
unless they run in the container (`AA_CONTAINER=1`, set by the image) or you
set `AA_ALLOW_HOST_RUN=1` for a one-off run. Your existing launchd jobs will
start failing (and the deadman watchdog will tell you) until you finish the
setup below and run `docker/install-launchd.sh --apply`.

Backups are taken **on the Mac** before each freshness/enrichment run: a plain
copy of `data/events.db` into `~/agent-athens-backups`, which no container can
see or change. The copy waits for other runs to finish, is recorded in
`SHA256SUMS`, and generations are kept in tiers (newest 20, one per day for
14 days, one per week for 8 weeks, one per month for 6 months). A backup that
is skipped (another run still busy after 10 minutes, no database, a failed
copy) sends an alert; the run itself goes ahead. Set
`AA_OFFSITE_CMD` (for example a small script calling `rclone copy` or `rsync`
to storage the Mac can write but not delete) to also copy each backup off the
machine. Without it every backup logs a warning and you get a reminder at most
once a week. Restore with `docker/restore-backup.sh`, which checks the checksum,
the database's integrity and that it isn't far smaller than the live one.

Every verified deploy is recorded on the Mac in
`~/.config/agentathens-docker/deploys.log`. `verify-live` compares the live
site with that record four times a day, and the watchdog can only restore a deploy
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

   The wrapper makes `~/.config/agentathens` private (`chmod 700`) and refuses
   to run while any file in it is readable by other accounts; it names the
   file and the `chmod 600` to run (older installs: the
   `launchd-pre-docker.txt` that `install-launchd.sh` wrote there).
4. **Build and check**:
   ```bash
   docker/aa-run.sh image     # ~5 min, ~5 GB
   docker/aa-run.sh doctor    # every line should say ok
   ```
   `doctor` also refuses a GitHub token that isn't fine-grained
   (`github_pat_…`) and warns while `AA_OFFSITE_CMD` is unset.
5. **Try one real run** by hand, then switch the schedule over:
   ```bash
   docker/aa-run.sh freshness
   docker/install-launchd.sh            # shows the plan, changes nothing
   docker/install-launchd.sh --apply
   ```
   The watchdog already checks the `com.agentathens.docker.*` jobs
   (`config/monitoring.json`, from the protected-paths PR); if you keep a
   local deadman config, add the same labels there.

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
  from a planted file); move yours back from the evidence folder. Running
  `git gc` or `git maintenance` on the Mac while a job runs trips it too.
- Restore the database: `docker/restore-backup.sh` (newest) or pass a file.
- Update the image after dependency or Dockerfile changes: `docker/aa-run.sh image`.
- Poke around inside: `docker/aa-run.sh shell` (no tokens).
- Rotate a token: edit the env file; the next run picks it up.

## Known limits

- Every run except the build run can still reach the internet and your local
  network (scraping, email, enrichment and publishing need it). Treat anything
  else on your LAN as reachable from them.
- The publish run holds the GitHub and Netlify tokens. It runs no browser and
  reads no outside input; the deploy and push gates decide *what* it may
  publish. The dist-hash check compares what the publish run *reports* with
  what the build run reported, both from inside containers: it catches `dist/`
  changing between build and publish and a publish that deployed something
  else, not a publish run that lies about its hash.
- The build run still reads the scraped data and renders it, and its output is
  what gets published: a sealed build keeps a compromised build from reaching
  the network, not from shaping `dist/`. The published-output gates in the
  build decide what may ship.
- The hash check and the offline build need the pipeline's `AA_SKIP_BUILD`
  support (protected-paths PR); until then the scrape run builds, commits and
  can write `dist/`.
- Time limits are wall-clock: a run suspended by sleep past its limit is
  stopped on wake, and a publish stopped mid-upload can leave a Netlify deploy
  unfinished (the next freshness run publishes again).
- Runs that load outside content refuse an image built more than 30 days ago
  (`image-refresh` fixes that) and a Playwright base, which is where Chromium
  comes from, older than 60 days (`AA_MAX_BASE_AGE_DAYS`). Rebuilding does not
  reset the base age: merge the Dependabot PR that bumps `BASE_IMAGE` in
  `docker/Dockerfile`, then run `docker/aa-run.sh image`.
  `AA_ALLOW_STALE_IMAGE=1` overrides both for one run.
- Chrome's own sandbox is off inside the container (Docker's default security
  profile blocks it); the container is the boundary. On the Mac, outside the
  container, the sandbox is now on.
