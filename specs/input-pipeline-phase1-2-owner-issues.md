# Input pipeline — Phase 1 + 2 work split and owner issue drafts

**Date:** 2026-10-26 (session S235). Follows `specs/input-pipeline-audit-2026-10.md`.
**Owner decisions taken this session:** (1) A1 → **proxy-mode guard** (squid becomes the sole post-DNS private-range enforcer; no DNS forwarder); (2) start **Phase 1 and Phase 2 together**; (3) install the container schedule **after A3** is fixed.

**State re-checked 2026-10-26 (read-only):** no commits since 2026-10-14; legacy `com.agentathens.daily` still exit 9, no `com.agentathens.docker.*` jobs; a container ingest/freshness run at 2026-10-26 01:15 Athens (`logs/pipeline-2026-10-26.log`, `AA_SKIP_BUILD=1`, nothing built or deployed) shows the same failure — athinorama/ticketservices/halfnote `ESERVFAIL`, snfcc/onassis/benaki browser requests blocked on `ESERVFAIL`, more.com 0, all `success=1`; benaki "Adding known exhibitions from research" → 4; yield canary died on `gh auth login`. `scrape_stats` 2026-10-25T23:16Z: ra 89, megaron 75, cometogether 191, benaki 4, the other six 0. Live homepage build stamp still 6 Oct 2026 09:02; newest `<time datetime>` on it is 2026-10-10.

---

## Split

| Item | Who | Paths | Depends on |
|---|---|---|---|
| A1 proxy-mode guard, curl no-pin branch, real-guard doctor probe, README correction | **Owner** (O1) | `src/utils/outbound-url.ts`, `docker/doctor*.sh`, `docker/README.md` | — |
| A2 route megaron / cometogether through the guard | Agent (code) + **Owner** (pin in `tests/security/scraper-fetch-guards.test.ts`) | `scripts/scrape-megaron.ts`, `scripts/scrape-cometogether.ts` | O1 merged |
| A2 route RA GraphQL POST through the guard | **Owner** (O5: POST support in the guard + the existing pin requires the raw call) | `src/utils/outbound-url.ts`, `tests/security/scraper-fetch-guards.test.ts`, `scripts/scrape-all.ts` | O1 merged |
| A3 publish records its own deploy | **Owner** (O2) | `scripts/daily-automated.sh` | — |
| A5 deploy-truth source | **Owner** (O3) — re-check after O2 | `scripts/deadman-watchdog.ts`, `src/watchdog/**` | O2 |
| A4 install container schedule | **Owner, operator action** | `docker/install-launchd.sh --apply` | O2 verified |
| B4 yield rule on host deadman, push-unconfigured reason, digest email | **Owner** (O4) | `scripts/deadman-watchdog.ts`, `src/watchdog/**`, `scripts/weekly-digest.ts` | — |
| A6 megaron retry/backoff + zero-cards throw | Agent | `scripts/scrape-megaron.ts` | — |
| B1 errors propagate (clubber contract) | Agent | `scripts/scrape-all.ts`, `scrape-snfcc.ts`, `scrape-onassis.ts`, `scrape-benaki.ts` | — |
| B2 health glyph for 0-event success + non-zero exit on CRITICAL | Agent | `scripts/health-check.ts` | — (pipeline treats non-zero as "failed (continuing...)", `daily-automated.sh:638-648`) |
| B3 canary evaluate-then-deliver, verdict file, exit 2, skip gh without token | Agent | `scripts/yield-canary.ts` | — (pipeline already maps exit 2 → "TRIPPED", non-fatal, `daily-automated.sh:286-294`) |
| B5 delete benaki fallback + constant-yield rule | Agent (code); **owner approval** to run the 5-row purge | `scripts/scrape-benaki.ts`, a migration script | B1 (same file — one owner at a time) |
| B6 `events_new/updated` written after save | Agent | `scripts/scrape-all.ts` | B1 (same file — sequence, don't parallelise) |
| Near-term ratchet (shown rows next 7 days per source) | Agent | `src/generate-site.ts` | — |

File-ownership order for the agent work: `scrape-all.ts` is shared by B1 → B6 → A2, so those run in sequence; `scrape-megaron.ts` (A6), `health-check.ts` (B2), `yield-canary.ts` (B3) and `generate-site.ts` (ratchet) are independent.

---

## O1 — Outbound guard: proxy mode inside the container (A1)

**What.** In the container every guarded scraper fails before any request: `assertPublicUrl` (`src/utils/outbound-url.ts:185-222`) calls `systemResolver` → `node:dns lookup` (:176-179), and on the `internal: true` network (`docker/compose.yaml:172`) there is no resolver (Docker Engine ≥ 26, CVE-2024-29018). Error: `could not resolve www.halfnote.gr: getaddrinfo ESERVFAIL` (`logs/pipeline-2026-10-26.log:732`, and `:710-787` for the other sources).

**Why proxy mode is safe.** In the container every request already leaves through squid (`HTTPS_PROXY`/`https_proxy`/`NODE_USE_ENV_PROXY=1`, `docker/compose.yaml:85-93`; Chromium gets `--proxy-server`). Squid resolves the name itself and denies private, loopback, link-local, CGNAT, documentation, multicast, NAT64 and ULA destinations (`docker/egress/squid.conf:53-81`), plus Docker host names and local suffixes (:46-48, :79-80). The Node pre-check adds no guarantee there: the connection goes to squid by name whatever Node resolved.

**Proposed diff shape** (`src/utils/outbound-url.ts`):
- `export function proxyMode(env = process.env): boolean` → `env.AA_CONTAINER === '1' && !!(env.HTTPS_PROXY || env.https_proxy)`.
- In `assertPublicUrl`, keep in all modes: URL parse, http/https scheme, no credentials, IP-literal check against `isBlockedAddress`, `localhost`/`.localhost` refusal. **Add** a refusal of the squid-denied local suffixes (`.internal .local .lan .home.arpa`) so the two layers agree. When `proxyMode()` and the host is a name and no `opts.resolver` is injected, return `{ url, addresses: [] }` without resolving.
- `buildCurlArgs`: when `pinnedAddress` is empty, omit `--resolve` (curl goes through the proxy; pinning means nothing there). `safeCurlText` passes `addresses[0] ?? ''`.
- `createHostChecker` / `guardPageRequests` inherit the behaviour through `assertPublicUrl`.
- Keep size, time and redirect caps unchanged; every redirect hop still re-runs `assertPublicUrl` (scheme, credentials, IP literal still checked per hop).
- Header comment: replace the "Residual risk" paragraph with one stating that in proxy mode squid is the only post-DNS private-range check.

**Tests to add** (`src/utils/__tests__/outbound-url.test.ts`; today every test injects a resolver, so none covers this path):
1. proxy mode on + no resolver → a public name passes without a lookup (inject a `lookup` spy and assert it was not called);
2. proxy mode on → `http://127.0.0.1/`, `http://[::1]/`, `http://169.254.169.254/`, `http://user:pw@x.gr/`, `file:///etc/passwd`, `http://foo.internal/` are still refused with the same codes;
3. proxy mode off (no `AA_CONTAINER`, or no proxy env) → unchanged behaviour, including `ESERVFAIL` → `dns`;
4. `buildCurlArgs(url, '')` has no `--resolve`; `buildCurlArgs(url, '1.2.3.4')` still does.
Mutation check: remove the `proxyMode()` branch → test 1 fails; remove the IP-literal check → test 2 fails.

**Doctor probe** (`docker/doctor.sh` / `doctor-checks.sh` currently pass on raw curl): inside the scrape container run the real guard, positive and negative —
- positive: a small probe (inline `bun -e` or a `scripts/guard-probe.ts`) that calls `safeFetch('https://www.halfnote.gr/', {method:'HEAD'})` through the real guard and expects a status;
- negative: a public name that resolves to loopback (`localtest.me` is commonly used; confirm its answer before relying on it) must be refused **by squid** (403 from the proxy), proving the post-DNS enforcer is live.

**README** `docker/README.md:436-438` says DNS "may forward … data could leak out"; on this Docker it does not resolve at all. Replace with the actual behaviour and the proxy-mode trust statement.

**Gate:** `docker/aa-run.sh scrape --dry-run --source halfnote` returns > 0 events.

## O2 — Publish records its own deploy (A3)

**What.** 2026-10-06 09:03:37 publish started the CLI; `09:18:38 [deploy] watchdog killed CLI after 900s`; `09:18:41 ERROR … no server-side artifact within 10-min window` (`logs/pipeline-2026-10-06.log:6223-6232`). The site did update (live stamp 09:02).

**New finding (not in the audit):** the recovery query uses a **10-minute** cutoff (`scripts/daily-automated.sh:938-948`) but runs only after the watchdog's **15-minute** (`DEPLOY_TIMEOUT:-900`) kill (`:884`). A deploy created when the CLI started (~09:03:40) is older than the cutoff (09:08:41), so recovery can never match a deploy the CLI created and then hung on. This, not "nothing was deployed", is why the lookup returned empty.

**Two-step fix:**
1. *Immediate:* derive the cutoff from the CLI start time (capture `deploy_started=$(date -u …)` before `netlify deploy`, filter `created_at >= deploy_started`). That makes publish exit 0 and write `deploy-success` to `logs/deploy-cadence.log`. **But** recovered-by-title deploys deliberately print no `PUBLISH-RESULT` (`:987-990`), so the host `deploys.log` (`docker/aa-run.sh:846-868`) is still not written and verify-live keeps flagging it. Test: extend `tests/daily-pipeline-deferred-publish.test.ts` (protected) with a stubbed `netlify` that hangs past the watchdog and a `listSiteDeploys` stub whose deploy `created_at` is 14 minutes old → must recover.
2. *Proper:* find what the CLI waits on after upload through squid (the audit suspects a non-proxied websocket/long-poll; not verified), or get a trusted deploy id without the CLI's tail: e.g. `netlify api createSiteDeploy` + upload, or run the CLI with `--json` and a shorter post-upload wait, taking the id from its own output. A CLI-sourced id lets `print_publish_result` run and the host records the deploy.

**Gate:** a container publish exits 0, prints `PUBLISH-RESULT deploy_id=… state=ready`, and `~/.config/agentathens-docker/deploys.log` gains a line.

## O3 — Deploy truth (A5) — re-check after O2

`scripts/deadman-watchdog.ts:157-160` reads the host `deploys.log` when it exists, else `logs/deploy-cadence.log` (last line `2026-09-25T05:18:52Z deploy-success`). `deploys.log` has never existed (`ls ~/.config/agentathens-docker/` 2026-10-26). If O2 step 2 lands, the deadman's existing logic gets a true source and A5 may need no code change. Only after O2: confirm STALE_DEPLOY clears on the next verified deploy; if not, then change the source. Also: make the pipeline-failure reason name the label and exit code ("com.agentathens.daily exit 9 → run docker/install-launchd.sh --apply") instead of "a scheduled job last-exited non-zero".

## O4 — Alerting the host can deliver (B4)

- `SOURCE_DEAD_STREAK = 3` counts runs (`scripts/deadman-watchdog.ts:194`); with non-daily runs it took nine days to arm. Make it time-based (e.g. 0 events on every run in the last 48 h, minimum one run) or add the yield-canary rule here (the host deadman reads `scrape_stats` every 6 h and its email works).
- `push topic not configured` is logged every run since 2026-09-26 (`:140`) but is not an alert reason. Add a "push enabled but unconfigured" reason. **Operator action:** create `~/.config/agentathens/ntfy-topic`.
- STALE_DEPLOY outranks SOURCE_DEAD in the subject (`src/watchdog/classifier.ts:177`); give the subject both when both hold.
- Weekly digest: an email channel (`scripts/weekly-digest.ts`).

## O5 — A2 GUARDED list (after O1)

`tests/security/scraper-fetch-guards.test.ts` is protected and has no "GUARDED list" (the audit's wording); its raw-fetch pin covers `scrape-all.ts` only (`:382-387`), and it **requires** the RA call to stay a raw `fetch('https://ra.co/graphql', { method: 'POST', redirect: 'error' …`. Consequences:
- **RA is owner-only.** `safeFetch` accepts `method: 'GET' | 'HEAD'` (`OutboundOptions`), so guarding the GraphQL POST needs POST + body support in `src/utils/outbound-url.ts` and a change to the pin. Propose both in O1's round or the next.
- **megaron / cometogether** (`scrape-megaron.ts:70`, `scrape-cometogether.ts:122`, plain GET) the agent can move onto `safeFetch` after O1 lands. The owner then extends the pin so a raw `fetch(` in those two files fails CI (same shape as `:382-385`).

## Operator checklist (in order)

1. Merge O1 → run `docker/aa-run.sh doctor` → `docker/aa-run.sh scrape --dry-run --source halfnote` (> 0).
2. Merge O2 → one manual container publish → confirm `deploys.log` line.
3. `docker/install-launchd.sh --apply`.
4. Create `~/.config/agentathens/ntfy-topic`.

## O6 — Pipeline log wording for the new exit codes (added 2026-10-27/28 after adversarial review, S235)

The agent branch `claude/input-pipeline-phase1-2` changes two exit contracts that `scripts/daily-automated.sh` (protected) reads:

- `scripts/health-check.ts` now exits **3** when any alert is CRITICAL (a source failed or returned 0 events); 1 still means the script crashed. `daily-automated.sh:638-650` logs every non-zero exit as "Health check failed (continuing...)", so a CRITICAL verdict reads like a crash. Proposed: a `case` like `run_yield_canary`'s — `3) log_error "Health check: CRITICAL alerts — see data/health-reports/<date>.txt (non-fatal, continuing...)"`, `*) log_error "Health check could not run (exit $rc) …"`. Test: extend `tests/daily-pipeline-*.test.ts` with the same seam style as `tests/daily-pipeline-yield-canary.test.ts`.
- `scripts/yield-canary.ts` no longer calls `gh` inside the container (`AA_CONTAINER=1` and no `GH_TOKEN`/`GITHUB_TOKEN`); it prints one verdict line per source and writes `data/yield-canary-latest.json` (gitignored; the host sees it through the data mount). `daily-automated.sh:290` still says "see the 'Yield canary:' issue(s)", which are never filed there. Proposed wording: "Yield canary TRIPPED — see the per-source verdict lines in $LOG_FILE and data/yield-canary-latest.json". Separately decide whether the host deadman should read that file (it would make the verdict deliverable by email; `src/watchdog/**` is protected) — this overlaps O4.

## Pre-existing, found by the same review (not changed)

- `scripts/health-check.ts` `getLatestScrapeStats` selects today's rows with `date(scraped_at) = date('now')` in **UTC**. A scrape at 23:58Z checked at 00:02Z reads "No scrape data for today" (WARNING, exit 0), so the new CRITICAL path is skipped on that run. Open path; a candidate follow-up (window by the newest run per source instead of the UTC date).
