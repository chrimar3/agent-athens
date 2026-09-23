# Incident response runbooks

Short, ordered steps for the incidents that matter most. Do them in order;
each step says how to confirm it worked. Credential details:
`credentials.md`.

## First five minutes (any incident)

1. **Stop the automation** so nothing publishes or pushes while you look:
   ```bash
   for l in $(launchctl list | awk '/com\.agentathens/ {print $3}'); do
     launchctl bootout "gui/$(id -u)/$l"; done
   for c in $(docker ps -q --filter name=agent-athens-); do docker stop "$c"; done
   ```
   Confirm: `launchctl list | grep agentathens` prints nothing. (This lasts
   until the next login; `launchctl disable gui/$(id -u)/<label>` makes it
   stick.)
2. **Write down the time** and what you noticed. Keep the logs (`logs/`) —
   don't delete anything yet.

## A token or password leaked

1. Revoke it at the provider first, then issue a new one (table in
   `credentials.md`): GitHub → Settings → Developer settings → Fine-grained
   tokens; Netlify → User settings → Applications; Gmail → Security → App
   passwords; Claude → claude.ai settings; Google Cloud → Credentials.
2. Put the new value in `~/.config/agentathens-docker/docker.env` or `.env`, then run
   `docker/aa-run.sh doctor`.
3. Check what the old token did:
   - GitHub: the repo's commit list and Settings → Security log for pushes you
     didn't make.
   - Netlify: Site → Deploys for deploys you didn't trigger; Team → Audit log.
   - Gmail: Security → Recent activity.
4. If it was committed to git, rotating it is the fix. Rewriting history does
   not un-leak a public secret.

## The website shows content you didn't publish

1. Netlify → Deploys → pick the last deploy you trust → *Publish deploy*.
   Confirm on https://agentathens.com in a private window.
2. Rotate the Netlify token (above), then check the deploy list and audit log
   for who deployed.
3. Find the source: compare `git log` with the Netlify deploy messages. If a
   commit on `main` carried it, revert that commit through a PR. If the
   database carried it, see "The database looks tampered with".
4. Re-enable the schedule only after the next manual `docker/aa-run.sh
   freshness` builds and passes the published-artifact gate.

## The database looks tampered with

1. Stop the automation (first five minutes).
2. Restore the newest good backup. The script checks it inside the container
   (integrity + non-empty events table) before swapping it in, and keeps the
   current file in `~/.config/agentathens-docker/replaced/` as evidence:
   ```bash
   ls -lt ~/agent-athens-backups | head          # pick one from before the problem
   docker/restore-backup.sh ~/agent-athens-backups/events-YYYY-MM-DD-HHMM.db.gz
   ```
3. Build and review the site locally (`docker/aa-run.sh site`, then
   `bun run serve`) before re-enabling publishing.

## A job was quarantined

`docker/integrity-check.sh` pauses every job and alerts you when a container
run changed git's config or hooks, committed non-data files, or planted a file
at the repo root.

1. Read `~/.config/agentathens-docker/QUARANTINE` and the evidence folder it
   names (`REASON`, `new-commits.txt`, `planted/`). Bad commits are kept on a
   `quarantine/<time>` branch; HEAD was reset to the pre-run commit.
2. If `.git/config` or `.git/hooks` changed, do **not** run git in the repo
   until you have compared them by hand with a fresh clone.
3. Treat it as a compromise of whatever that run could reach (see the token
   table in `docker/README.md`): rotate those tokens, then rebuild the image
   (`docker/aa-run.sh image --pull`).
4. When you are satisfied, remove `~/.config/agentathens-docker/QUARANTINE`.
   If it was your own new root file, move it back from `planted/`.

## You suspect the Mac itself is compromised

1. Disconnect it from the network.
2. From a different, trusted device, rotate **every** credential in
   `credentials.md`, plus your Apple ID, GitHub and Google account passwords,
   and review each account's active sessions.
3. Back up only data you can verify (the repo is on GitHub; `events.db`
   backups can be checked as above), then reinstall macOS before re-enabling
   anything.

## Report and learn

Once resolved, add a line to `.claude/notes/ledger.md` § Mistakes (what, why,
fix) and, if it was a vulnerability, credit the reporter per `SECURITY.md`.
