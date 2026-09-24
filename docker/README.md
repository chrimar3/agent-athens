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
| The repo's `.env` (read-only, **only the runs that fetch email**) | Mailbox password, for installs that keep it there (it can move to `docker.env`) |
| `~/.config/agentathens` (read-only, **only runs that need it**) | GSC/Bing API keys |
| `~/.config/agentathens-docker/handoff/` (**only build and publish runs**) | The "ready to publish" marker, from the build run to the Mac to the publish run |
| The tokens its run needs, and no others | See the table below |
| Public websites on ports 80/443, **through the egress proxy only**; the build run has no network at all | Scraping, enrichment and publishing need it. Your Mac itself, your LAN and cloud-metadata addresses are refused |
| Your mail server directly, **email ingest only** | IMAP is not HTTP and cannot go through the proxy (see Known limits) |

**The repo folder is never mounted as a whole.** Inside the container
`/workspace` is an empty, private tmpfs, and `aa-run.sh` mounts each
top-level entry of the repo onto it by its exact name, read-only or
read-write. That matters on a Mac: its disk ignores upper/lower case, so with
the whole folder mounted, `/workspace/.ENV` or `/workspace/BUNFIG.TOML` would
have reached the real `.env` or `bunfig.toml` around the per-name read-only
overlays. Now any other spelling of a name simply does not exist. Also:
- `.env` files are **not mounted at all** for runs that don't need them (not
  even as an empty file), and read-only for the runs that fetch email;
- a top-level entry that is a symlink is never mounted (logged and skipped),
  so it cannot pull a folder from elsewhere on the Mac into a run;
- the data folders (`data/`, `dist/`, `logs/`, `temp/`, `tmp/`, `temp-*`) are
  created on the Mac before the run if missing; the Mac's `node_modules` is
  never mounted (every run gets the image's Linux modules);
- lock files the pipeline writes at the repo root stay on the run's own tmpfs.
  So that runs in different containers still don't write the database at the
  same time, `aa-run.sh` makes every run that writes `data/events.db`
  (ingest, scrape, build, enrichment, daily, site) wait while another such run
  is going — checked every 30 s, for up to 2 hours, then it gives up with an
  alert (exit 11). A freshness run and an enrichment run therefore no longer
  overlap. The same job already running is still simply skipped.

It cannot reach the rest of your home folder, the keychain, SSH keys, browser
profiles, other projects, the backups, the token file or the Mac's system
files. The container runs as a non-root user with every Linux capability
dropped, a read-only system filesystem, a fresh empty home folder on every run
and no open ports. After every run, `docker/integrity-check.sh` checks on the Mac that nothing
in `.git` that steers git changed (config, hooks, `commondir`, `info/`,
alternates …); that new commits touch only data and add no AI-agent
instruction files; that no file was planted at the repo root; and that no
instruction file for AI agents (`CLAUDE.md`, `AGENTS.md`, `GEMINI.md`,
`.cursorrules`, `.windsurfrules`, `copilot-instructions.md`, `*.mdc`, or a
`.claude`/`.cursor`/`.github`/`.vscode` folder, in any letter case) appeared
anywhere in the folders runs may write. It checks that git's object store only
grew (no existing object or pack changed or vanished, every new object hashes
to its name, new packs pass `git verify-pack`; containers never gc); that no
stash reflog entry, `ORIG_HEAD`, `FETCH_HEAD`, `MERGE_HEAD`, rebase or
cherry-pick state was planted; that the other reflogs only grew by entries for
the run's own commits; that remote-tracking refs moved only where the publish
run's push moves them (recorded in
`~/.config/agentathens-docker/remote-ref-moves.log`); and that no tracked file
outside the data folders changed in the working tree. If any check fails, it
quarantines the change, pauses every job and alerts you by macOS notification,
ntfy and, where `scripts/security-alert.ts` exists, email
(`AA_ALERT_TIMEOUT_SEC`, default 60).
`tests/docker-hardening.test.ts` and `tests/docker-integrity-check.test.ts`
fail if any of that is weakened.

| Run | Schedule | Tokens | API-key folder | `.env` | `.git` | `dist/` | Network | Time limit |
|---|---|---|---|---|---|---|---|---|
| `visibility` | 07:30 | none | read-only | absent | read-only | writable | proxy | 30 min |
| `freshness`, ingest | 08:00 | mailbox settings (`EMAIL_*`, `IMAP_*`) from `docker.env` if set there | none | read-only | read-only | writable | proxy + **direct** (IMAP) | 30 min |
| `freshness`, scrape | right after | **none**; loads web pages | none | absent | read-only | **read-only** | proxy | 3 h |
| `freshness`, build | right after, only if the integrity check passes | git identity only (commits to `pipeline-data`) | none | absent | may commit | writable | **none** | 45 min |
| `freshness`, publish | right after, only if the integrity check passes | GitHub, Netlify, git identity: never loads a web page | Search Console key only | absent | may commit | **read-only** | proxy | 30 min |
| `enrichment` | 10:00, 13:00, 16:30, 19:00 | Claude only | none | absent | read-only | writable | proxy | 90 min |
| `verify-live` | 00:15, 06:15, 12:15, 18:15 | Netlify token + site id only: live deploy id, snippet injection, a hash of the security-relevant site settings, and the security headers and CSP of the home page and one event page. The Mac alerts on an unrecorded or rolled-back deploy, any snippet, changed settings (baseline `~/.config/agentathens-docker/live-baseline`, created on the first clean run; after reviewing an intended change: `AA_ACCEPT_LIVE_BASELINE=1 docker/aa-run.sh verify-live`), a missing header or a CSP allowing inline scripts | none | absent | read-only | writable | proxy | 10 min |
| `restore ID` | by hand / watchdog | Netlify token + site id only | none | absent | read-only | writable | proxy | 10 min |
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
tokens (and, like the legacy `daily` run, fetching email, so with a direct
route out).

**Publish marker.** The build run says "ready to publish" by writing a marker
file. It used to land at the repo root, which is now each run's private tmpfs,
so with `AA_PUBLISH_MARKER` support in the pipeline the wrapper mounts
`~/.config/agentathens-docker/handoff/` (mode 700) at `/handoff` into the
build and publish runs only and points the pipeline there
(`AA_PUBLISH_MARKER=/handoff/publish-ready`); a stale marker is removed
before every build. Without that support the marker cannot reach the Mac:
freshness then publishes nothing and alerts you to merge the pipeline change.

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
     `~/agent-athens-backups`, `~/.config/agentathens` and
     `~/.config/agentathens-docker/handoff`. This is what stops a
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
   (`github_pat_…`), checks the egress proxy, and warns while `AA_OFFSITE_CMD`
   is unset or the repo's `.env` still holds secret-looking keys.
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
  So does running `git fetch`, `git pull`, `git stash`, a merge, rebase or
  cherry-pick, or editing a tracked file outside `data/`, while a job runs.
  Instruction files that already sit in `data/`, `dist/`, `logs/` or `temp*`
  when a job starts are only warned about in the wrapper log; review them.
- Restore the database: `docker/restore-backup.sh` (newest) or pass a file.
- Update the image after dependency or Dockerfile changes: `docker/aa-run.sh image`.
- Poke around inside: `docker/aa-run.sh shell` (no tokens).
- Rotate a token: edit the env file; the next run picks it up.
- Proxy log (what the runs fetched, and what was refused): `docker logs aa-egress`
  while a job runs (the proxy is stopped after each job).
- **Email credentials out of the repo:** put `EMAIL_USER`, `EMAIL_PASSWORD`
  (and `IMAP_HOST`/`IMAP_PORT` if not Gmail) in `docker.env`, run
  `docker/aa-run.sh freshness` once to see email still arrives, then delete
  them from the repo's `.env`. The ingest run gets them from `docker.env`
  (values there win); `doctor` warns while the repo `.env` still holds keys
  that look like secrets (it names the keys, never the values).

## Egress proxy

Every run except the build run sits on an internal Docker network with no
route out. Its only way out is the `egress` service: Squid, built from the
same pinned base image as the pipeline (`docker/aa-run.sh image` builds both),
configured by `docker/egress/squid.conf`. It allows HTTP and HTTPS to public
addresses on ports 80 and 443, and refuses:
- the Mac itself (`host.docker.internal`, `gateway.docker.internal`) and other
  local names (`*.internal`, `*.local`, `*.localhost`, `*.lan`);
- private, loopback, link-local (incl. the `169.254.169.254` metadata address),
  CGNAT (`100.64/10`), `0/8`, multicast and reserved IPv4 ranges, and IPv6
  loopback, unique-local and link-local ranges;
- any other port, and CONNECT to anything but 443.

Addresses are checked **after DNS resolution**: a public name that resolves
to a private address is refused. Every HTTP client the pipeline uses reads the
`HTTP(S)_PROXY` variables compose sets; Chromium gets `--proxy-server` plus
`--proxy-bypass-list=<-loopback>`, so even a page's requests to `localhost` go
to the proxy and are refused. A tool that ignores the proxy settings simply has
no network. The proxy runs as an unprivileged user with every capability
dropped, a read-only filesystem and no published port, is started by
`docker compose run` before the job, and stopped by `aa-run.sh` after it
(unless another job still uses it). `doctor` checks that it refuses the Mac,
the gateway, the metadata address, a LAN address and a non-web port, that a
public HTTPS site works through it and that nothing gets out around it.

## Known limits

- The scrapers' Chrome can still reach any public host. Every request is
  checked against private addresses by a DNS lookup of its own, but Chrome
  resolves the name again itself, so a DNS answer that changes between the two
  lookups is not caught (the egress proxy still refuses private addresses).
  WebSockets, WebTransport, WebRTC, shared/service workers and `window.open`
  are switched off in scraped pages, and Chromium's popup blocker stays on.
- The proxy stops runs reaching your Mac, your LAN and cloud metadata. It does
  **not** stop a compromised run from sending what it can read to a public
  host of the attacker's choosing, or tunnelling anything inside HTTPS: the
  pipeline needs arbitrary public sites. Least privilege per run (what it can
  read, which tokens it holds) is what limits that.
- Email ingest (and the legacy `daily`/one-step freshness runs, which fetch
  email too) runs on an ordinary network with a direct route out, because IMAP
  cannot go through an HTTP proxy: those runs can still reach your LAN and the
  Mac. Ingest runs no browser and holds only the mailbox settings.
- DNS lookups from the internal network go to Docker's resolver; depending on
  the Docker version it may forward them, so data could leak out encoded in
  DNS names.
- Between jobs the wrapper stops the proxy only when no other pipeline
  container is running; a job starting in the same second can lose its proxy
  and fail (the next scheduled run works).
- Runs that commit get `.git` writable, with `.git/config` and `.git/hooks`
  read-only on top by exact name. On the Mac's case-insensitive disk,
  `.git/CONFIG` inside such a run still reaches the real `.git/config`; the
  integrity check after the run catches any change there and quarantines.
- A tracked top-level symlink is not mounted, so inside a run git sees it as
  deleted; the integrity check refuses a commit that records that.
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
