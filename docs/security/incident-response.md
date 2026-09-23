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
2. Put the new value in `~/.config/agentathens/docker.env` or `.env`, then run
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
2. Copy the current file aside for evidence:
   `cp data/events.db ~/agent-athens-backups/events-suspect-$(date +%F).db`
3. Pick the newest backup from before the problem in `~/agent-athens-backups/`
   and check it: `sqlite3 -readonly <backup> 'PRAGMA integrity_check; SELECT COUNT(*) FROM events;'`
4. Restore it: `cp <backup> data/events.db`, then build and review the site
   locally (`bun run build && bun run serve`) before deploying.

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
