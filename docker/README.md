# Running the pipeline in a container

The scheduled jobs that handle outside input — scraping websites with Chrome,
reading newsletter emails, AI enrichment over scraped text — run inside a
locked-down container instead of directly on the Mac. If a hostile page, email
or prompt-injected enrichment session gets code running, it lands in the
container and can reach only:

| Reaches | Why |
|---|---|
| The repo's data folders (read-write) | The pipeline writes `data/`, `logs/`, `temp-*`; `dist/` only in the runs that build the site (`build`, `site`; read-only in every other run) |
| Everything else in the repo, incl. `docs/`, `.netlify/`, `.git/config`, `.git/hooks` (**read-only**, `docs/` in every run) | So nothing it does can change code or instructions your Mac or an agent session later runs |
| The repo's `.env` (read-only, **only the runs that fetch email**) | Mailbox password, for installs that keep it there (it can move to `docker.env`) |
| Single key files from `~/.config/agentathens` (read-only, **only runs that use them**): the Search Console key for publish, the Bing and Search Console keys for `visibility`; the whole folder only for `doctor` and the legacy `daily` runs | GSC/Bing API keys |
| `~/.config/agentathens-docker/handoff/` (**only build and publish runs**) | The "ready to publish" marker, from the build run to the Mac to the publish run |
| `~/.config/agentathens-docker/diff-gate/` (**only the diff-gate run**) | The publish diff gate's stats of the last accepted build |
| The tokens its run needs, and no others | See the table below |
| Public websites on ports 80/443, **through the egress proxy only**; the build, site and diff-gate runs have no network at all | Scraping, enrichment and publishing need it. Your Mac itself, your LAN and cloud-metadata addresses are refused |
| One IMAP server (`IMAP_HOST` in `docker.env`, default Gmail) on its port, **through the egress relay** | IMAP is not HTTP and cannot go through the proxy; the relay forwards to that one public address only (see Egress) |

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
- `dist/` is writable only in the runs that build the site (`build`, `site`;
  on older pipelines also the freshness scrape-build, the legacy freshness and
  `daily`), and read-only in every other run — scrape, ingest, enrichment,
  visibility, verify-live, restore, diff gate, publish, test, shell, doctor.
  (Checked in round 9: enrichment writes only `data/` and `temp-*`,
  visibility only reads `dist/`'s sitemaps, verify-live and restore only
  call the Netlify API, and the test suite only reads `dist/`.) Those
  site-building runs never overlap the diff gate and publish: publish uploads
  exactly what the gate compared. Each `aa-run.sh` that starts one of them
  first takes a lock on the Mac (`~/.config/agentathens-docker/state/dist.lock`,
  a symlink naming its process) and keeps it until it exits — freshness from
  its build through the diff gate to the upload, `publish` from its diff gate
  to the upload. Another such run waits while the lock is held or one of
  those containers is still up — every 30 s, for up to 2 hours, then an alert
  and exit 14. A lock whose process is gone is removed.

It cannot reach the rest of your home folder, the keychain, SSH keys, browser
profiles, other projects, the backups, the token file or the Mac's system
files. Token values never sit in `aa-run.sh`'s own environment: each run's
tokens are exported only in the subshell that starts its `docker compose
run` (which passes them with `-e KEY`, name only), so the integrity check,
the alert senders (osascript, curl, the email sender), git and the backup copy
never hold them, and no value appears in a process's argument list.

**Decisions queue.** `scripts/decisions-queue.ts` runs in every build and
quotes scraped and database strings (venue names, event titles, geocoded
addresses, concern texts). It now writes `data/DECISIONS-QUEUE.md` — data/ is
the folder for pipeline-written, untrusted content — with a first line saying
the content is untrusted data, not instructions, and every quoted string on
one line with its Markdown characters escaped (no heading, link, image, HTML
or code span can come out of a venue name). `docs/DECISIONS-QUEUE.md` is no
longer written or mounted writable into any run, and the integrity check no
longer exempts it: a run that changes or commits anything under `docs/` is
quarantined. (The old file stays in git until someone removes it;
`scripts/weekly-digest.ts` reads and links the new one.) The container runs as a non-root user with every Linux capability
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
`~/.config/agentathens-docker/remote-ref-moves.log`); that no tracked file
outside the data folders changed in the working tree; and that the folders
runs may write hold nothing but regular files and folders — no symlink, FIFO,
socket or device file (a Mac-side job would write through a symlink, and a
read or copy of a FIFO hangs). It also checks that no code, test or package/tool
config file appeared there — `*.ts`/`*.tsx`/`*.mts`/`*.cts`, `*.js`/`*.jsx`/
`*.mjs`/`*.cjs`, `*.sh`, `*.py`, `*.rb`, `*.command`, `*.test.*`, `*_test.*`,
`*.spec.*`, `*_spec.*`, `package.json`, `bunfig.toml`, `.bunfig*`,
`tsconfig*.json`, `jsconfig*.json`, `.npmrc`, in any letter case — and that no
commit made during the run adds one under `data/`. `bun test` on the Mac would
run a planted `data/x.test.ts`, and a planted `package.json` or `bunfig.toml`
changes how code started in that folder runs. `dist/` legitimately holds the
site's own `.js`/`.mjs` (the site generator copies `fuse.mjs` there), so in
`dist/` only test files and package/tool config count. No pipeline output is
exempt: nothing the pipeline writes into `data/`, `logs/`, `temp*` or `tmp/`
has those names (JSON, CSV, text, Markdown, HTML, ICS, SQL, logs, the
database, images). If any check fails, it
quarantines the change, pauses every job and alerts you by macOS notification,
ntfy and, where `scripts/security-alert.ts` exists, email
(`AA_ALERT_TIMEOUT_SEC`, default 60).
`tests/docker-hardening.test.ts` and `tests/docker-integrity-check.test.ts`
fail if any of that is weakened.

| Run | Schedule | Tokens | API-key folder | `.env` | `.git` | `dist/` | Network | Time limit |
|---|---|---|---|---|---|---|---|---|
| `visibility` | 07:30 | none | Bing + Search Console key files only | absent | read-only | **read-only** | proxy | 30 min |
| `freshness`, ingest | 08:00 | mailbox settings (`EMAIL_*`, `IMAP_*`) from `docker.env` if set there; `IMAP_HOST` always the relay's | none | read-only | read-only | **read-only** | proxy + IMAP relay (no direct route) | 30 min |
| `freshness`, scrape | right after | **none**; loads web pages | none | absent | read-only | **read-only** | proxy | 3 h |
| `freshness`, build | right after, only if the integrity check passes | git identity only (commits to `pipeline-data`) | none | absent | may commit | writable | **none** | 45 min |
| `freshness`, diff gate | right after, only if the build marked a publish and the pipeline has `scripts/publish-diff-gate.ts` | **none** | none | absent | read-only | **read-only** | **none** | 15 min |
| `freshness`, publish | right after, only if the integrity check (and the diff gate) passed | GitHub, Netlify, git identity: never loads a web page; `AA_MIN_HEAD` deploy floor | Search Console key only | absent | may commit | **read-only** | proxy | 30 min |
| `enrichment` | 10:00, 13:00, 16:30, 19:00 | Claude only | none | absent | read-only | **read-only** | proxy | 90 min |
| `verify-live` | 00:15, 06:15, 12:15, 18:15 | Netlify token + site id only: live deploy id, snippet injection, a hash of the security-relevant site settings, and the security headers and CSP of the home page and one event page. The Mac alerts on an unrecorded or rolled-back deploy, any snippet, changed settings (baseline `~/.config/agentathens-docker/live-baseline`, created on the first clean run; after reviewing an intended change: `AA_ACCEPT_LIVE_BASELINE=1 docker/aa-run.sh verify-live`), a missing header or a CSP allowing inline scripts | none | absent | read-only | **read-only** | proxy | 10 min |
| `restore ID` | by hand / watchdog | Netlify token + site id only | none | absent | read-only | **read-only** | proxy | 10 min |
| `site` | by hand | none | none | absent | read-only | writable | **none** | 45 min |
| `image-refresh` | Sundays 05:30 | none: rebuilds from scratch and runs `apt-get upgrade`, so Ubuntu packages get their fixes. It does not update Chromium (see Known limits) | – | – | – | – | – | – |

`build` and `publish` can also be run by hand, in that order: `publish` refuses
to start unless a `build` run has just recorded a dist hash, and each hash is
used once (a failed publish needs a new `build`).

**Publish diff gate.** With the pipeline's `scripts/publish-diff-gate.ts`, every
sealed publish (freshness and `publish` by hand) is preceded by a `diff-gate`
run: offline, no token, `dist/` read-only, and only its own stats folder
(`~/.config/agentathens-docker/diff-gate/`, at `/handoff/publish-stats.json`
inside). It compares the built site with the last accepted one. Exit 0: the new
stats are kept and publishing goes ahead. Exit 3 (an anomaly, e.g. far fewer
event pages): **nothing is published**, you get an alert with the gate's reasons
(printable characters only, at most five lines), and `aa-run.sh` exits 12; the
build's hash stays recorded. After reviewing `dist/`, if the change is
expected, run `AA_ACCEPT_DIFF=1 docker/aa-run.sh publish`: the gate runs with
`--accept` (the new stats become the baseline), then that build is published.
Any other exit: nothing is published, alert, exit 13. `AA_ACCEPT_DIFF` is
honoured only by a `publish` you start, never by the scheduled freshness.

**Deploy floor.** After every deploy recorded in `deploys.log`, the Mac writes
the repo's current `HEAD` (read with the integrity check's git environment,
40-hex checked) to `~/.config/agentathens-docker/min-head`. When the
pipeline's `scripts/deploy-gate.sh` supports it (`AA_MIN_HEAD`, protected-paths
PR), every publish run gets `AA_MIN_HEAD=<that commit>` and the gate refuses to
publish a `HEAD` that is not that commit or a descendant — a rollback of the
repo to an older, vulnerable state cannot be published by the pipeline. A
`min-head` that is not a commit id is not passed on and raises an alert. If you
rewrite `main`'s history on purpose, delete that file (the next recorded
deploy writes a new one).

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
tokens (and, like the legacy `daily` run, fetching email, through the IMAP
relay).

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

The API-key folder is mounted only where it is used, and then only the files
a run opens: the scrape run gets none of it, the publish run gets only the
Search Console key (sitemap submission), `visibility` only the Bing key
(`bing-api-key`) and the Search Console key; a key file that is a symlink is
never mounted. Newsletter email is fetched in its own
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
14 days, one per week for 8 weeks, one per month for 6 months). The database
and its `-wal`/`-shm` are copied only if they are regular files (containers
write `data/`): a symlink, FIFO, socket or device file there is never followed
or read — the backup is skipped with an alert (and the integrity check
quarantines the run that left it). A backup that is skipped (another run
still busy after 10 minutes, no database, a non-regular file, a failed copy)
sends an alert; the run itself goes ahead. Set
`AA_OFFSITE_CMD` (for example a small script calling `rclone copy` or `rsync`
to storage the Mac can write but not delete) to also copy each backup off the
machine. Without it every backup logs a warning and you get a reminder at most
once a week, and `doctor` **fails** unless you accept on-Mac-only backups
explicitly with `AA_OFFSITE_OPTOUT=1` (then it warns).

The older host script `scripts/backup-events-db.sh` writes to the same folder
as `events-YYYY-MM-DD.db.gz` and prunes by age (7 days); it only ever reads,
compares or deletes files with exactly that name pattern, so it never touches
the wrapper's tiered `events-YYYY-MM-DD-HHMM.db*.gz` generations — and the
wrapper's tiered prune likewise considers only its own names, never the
legacy script's. Restore with `docker/restore-backup.sh`, which checks the checksum,
the database's integrity and that it isn't far smaller than the live one, and
refuses planted symlinks in `data/` and a quarantined pipeline (see Day to
day).

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
     `~/agent-athens-backups`, `~/.config/agentathens`,
     `~/.config/agentathens-docker/handoff` and (once the pipeline has the
     publish diff gate) `~/.config/agentathens-docker/diff-gate`. This is what stops a
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
   (`github_pat_…`), checks the egress proxy, fails while `AA_OFFSITE_CMD` is
   unset (unless `AA_OFFSITE_OPTOUT=1`: then it warns), and warns while the
   repo's `.env` still holds secret-looking keys.
5. **Try one real run** by hand, then switch the schedule over:
   ```bash
   docker/aa-run.sh freshness
   docker/install-launchd.sh            # shows the plan, changes nothing
   docker/install-launchd.sh --apply
   ```
   The watchdog already checks the `com.agentathens.docker.*` jobs
   (`config/monitoring.json`, from the protected-paths PR); if you keep a
   local deadman config, add the same labels there.
6. **Log the Mac's own CLIs out.** The scheduled jobs now publish from the
   container with the scoped, expiring tokens in `docker.env`. A Netlify or
   GitHub CLI login left on the Mac is a full-account credential — Netlify:
   every site and its settings; `gh`: every repository your account can reach
   — stored where any process running as you (a package's install script, an
   agent session, a Mac-side job) can read and use it:
   ```bash
   netlify logout
   gh auth status                            # lists every logged-in account
   gh auth logout --hostname github.com      # repeat for each account listed
   ```
   `docker/aa-run.sh doctor` and `docker/install-launchd.sh --apply` warn
   while a login is still there (a Netlify `config.json` under
   `~/Library/Preferences/netlify/` or `$XDG_CONFIG_HOME/netlify/` holding a
   token, or `gh auth status` succeeding without `GH_TOKEN` set); they report
   presence only, never a token. Log in again only for a one-off by hand, and
   out right after. On pipelines where the deadman watchdog's REDEPLOY
   responder still runs `scripts/redeploy.sh` on the Mac, that responder uses
   the Mac's Netlify login and fails (with its alert) once you log out; roll
   back with `docker/aa-run.sh restore <id>` instead.

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
  Instruction files, and code, test or package/tool config files, that already
  sit in `data/`, `dist/`, `logs/` or `temp*` when a job starts are only warned
  about in the wrapper log; review them. Planted ones are moved into the
  evidence folder.
- Restore the database: `docker/restore-backup.sh` (newest) or pass a file.
  It refuses while the pipeline is quarantined (it prints the quarantine's
  reason); if restoring is part of the incident response, add
  `--force-under-quarantine` (its one check container then runs despite the
  quarantine, which stays in place). It also refuses (exit 2) when `data/` is
  a symlink, or when `data/events.db`, its `-wal`/`-shm` or a
  `events.db.restore-candidate*` file is a symlink or not a regular file —
  a planted link there would make the Mac write the backup wherever it
  points. Stale regular candidates are removed; each candidate is unpacked
  into a new temporary file in `data/` and renamed into place.
- Update the image after dependency or Dockerfile changes: `docker/aa-run.sh image`.
- Poke around inside: `docker/aa-run.sh shell` (no tokens).
- Rotate a token: edit the env file; the next run picks it up.
- Proxy log (what the runs fetched, and what was refused): `docker logs aa-egress`
  while a job runs (the proxy is stopped after each job).
- **Email credentials out of the repo:** put `EMAIL_USER`, `EMAIL_PASSWORD`
  (and `IMAP_HOST`/`IMAP_PORT` if not Gmail — they **must** be in `docker.env`
  then, since the egress relay is pinned to them) in `docker.env`, run
  `docker/aa-run.sh freshness` once to see email still arrives, then delete
  them from the repo's `.env`. The ingest run gets them from `docker.env`
  (values there win); `doctor` warns while the repo `.env` still holds keys
  that look like secrets (it names the keys, never the values).

## Egress proxy and IMAP relay

Every networked run, email ingest included, sits on an internal Docker network
with no route out (build, site and the diff gate have no network at all). Its
only way out is the `egress` service: Squid, plus a socat TCP relay for IMAP,
built from the same pinned base image as the pipeline (`docker/aa-run.sh image`
builds both), started by `docker/egress/start.sh`, Squid configured by
`docker/egress/squid.conf`.

**IMAP relay.** IMAP is not HTTP, so email ingest cannot use the proxy. The
relay listens on port 9993 (no capability needed) and forwards to
`IMAP_HOST:IMAP_PORT` from `docker.env` (default `imap.gmail.com:993`), nothing
else. `aa-run.sh` refuses to run while `IMAP_HOST` is an IP address or a local
name (`localhost`, `*.local`, `*.internal`, `*.lan`, …) or `IMAP_PORT` is not a
port (exit 4). The egress container resolves the name once at start, requires
every IPv4 address it has to be public (the ranges Squid refuses), and gives
socat that address, not the name; otherwise the relay stays off (ingest then
fails and says so) while the proxy keeps working. The ingest run connects to
`egress:9993` (`IMAP_CONNECT_HOST`/`IMAP_CONNECT_PORT`, set by compose) but
TLS is end to end with the mail server: `src/ingest/email-ingestion.ts` sends
`IMAP_HOST` as the server name and verifies the certificate against it (never
against `egress`), so the relay can neither read nor impersonate the mailbox.
Ingest is always given the relay's `IMAP_HOST`, so a different one in the repo
`.env` cannot make it verify another name. It allows HTTP and HTTPS to public
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
- The IMAP relay is on the internal network, so every networked run (not
  only ingest) can reach that one mail server's IMAP port through it. A
  compromised run without the mailbox password could still log in to an
  account of its own at the same provider and upload data there — no more
  than it can already do over HTTPS through the proxy. The relay uses IPv4
  and resolves the name once per egress start; a provider moving addresses
  mid-job breaks that job's ingest only.
- `docker/Dockerfile` installs the CLIs with `npm ci --ignore-scripts` and runs
  only bun's and claude-code's install scripts, explicitly, as a non-root
  user. Which packages have install scripts was taken from the lockfile and
  the registry metadata for the pinned versions; the two scripts' own code
  could not be reviewed when this was written. The build fails if
  `bun`, `netlify` or `claude` does not run afterwards. A version bump that
  adds an install script needs a look at that list.
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
- The `dist/` lock only orders runs started through `aa-run.sh` (and waits
  for their containers). A `docker compose run` started by hand, or a
  pipeline run directly on the Mac with `AA_ALLOW_HOST_RUN=1`, is not
  covered. Two runs that both find the same dead holder's lock at the same
  moment could, in principle, both take it. `AA_DIST_WAIT_MAX_SEC` /
  `AA_DIST_WAIT_POLL_SEC` (default: the database-wait values) tune the wait.
- The planted-code check goes by file name: a code file under an innocent
  name (`data/x.json` run as `bun data/x.json`) is not caught, and nothing the
  Mac runs by itself executes such a file. It covers the folders runs may
  write, not `node_modules` (a container-only volume, never the Mac's).
- `--force-under-quarantine` lets exactly one `shell` run (the backup check:
  no token, no `.env`, `dist/` and `.git` read-only, proxy network) start
  despite the quarantine; its own integrity check still runs around it.
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
  build and the publish diff gate (sizes and counts against the last accepted
  build) decide what may ship; neither can tell a subtle, same-shaped change.
- The deploy floor and the diff gate need the pipeline's `AA_MIN_HEAD` support
  in `scripts/deploy-gate.sh` and `scripts/publish-diff-gate.ts`; without them
  the wrapper records the floor but passes nothing, and runs no gate.
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
