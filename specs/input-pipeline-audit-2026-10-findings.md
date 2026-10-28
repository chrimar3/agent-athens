# Input Pipeline Audit — merged findings (companion to specs/input-pipeline-audit-2026-10.md)

**Status:** 76 findings merged from 13 finder agents on 2026-10-26. **Not adversarially verified** (the verification stage hit the usage limit; only A04 received a verdict: held). The orchestrator independently reproduced the findings listed in the report's appendix. Evidence pointers are file:line, log line or SQL as the finder recorded them; re-check at the cited location before building a fix on a finding. Prefixes: A infrastructure/alerting · T ticket links · S more.com/athinorama/ticketservices · R RA/clubber/halfnote/megaron/cometogether/SNFCC/Onassis/Benaki · Q save seam/newsletters/landscape.

---

### A01 [critical] Outbound guard pre-resolves DNS with node:dns, which returns ESERVFAIL on the internal-only container network

**Claim.** Every scraper routed through assertPublicUrl (safeFetch, safeFetchResponse, safeCurlText, guardPageRequests) fails in the container with OutboundUrlError 'dns' before any request, because node:dns lookup on an `internal: true` Docker network gets SERVFAIL (Engine >= 26 stopped forwarding; this Mac runs 29.8.0). The three scrapers using bare fetch() let squid resolve and succeed.

**Impact.** Deterministic, not flaky: seven of ten active sources (more, athinorama, ticketservices, halfnote, snfcc, onassis, benaki) yield 0 on all four container runs (09-27, 10-05 x2, 10-06) versus 821 events on the 2026-09-25 host run; only ra/megaron/cometogether produce. With the host pipeline refusing to run (exit 9), no new events from those sources since 2026-09-25.

**Recommendation.** Make the guard proxy-aware in src/utils/outbound-url.ts: add `proxyMode(env)` = AA_CONTAINER==='1' && (HTTPS_PROXY||HTTP_PROXY) (mirror scripts/lib/chrome-path.ts:28-30). In assertPublicUrl, when proxyMode() and host is not an IP literal, skip the resolver and return addresses: [] while keeping scheme, credentials, empty-host, localhost, IP-literal private-range and LOCAL_SUFFIXES checks. In buildCurlArgs drop --resolve when no pinned address and pass --proxy explicitly; createHostChecker returns null without lookup in proxy mode. Tests in src/utils/__tests__/outbound-url.test.ts: public name resolves without calling resolver; private IP/localhost/x.internal/file:/credentials still refused; curl argv has --proxy, no --resolve. Gate: `docker/aa-run.sh scrape --dry-run --source halfnote` shows > 0 events.

**Evidence.**
- `src/utils/outbound-url.ts:211-214` — addresses = await (opts.resolver ?? systemResolver)(host); } catch (e) { throw new OutboundUrlError('dns', could not resolve ${host}: ${(e as Error).message});
- `docker/compose.yaml:103,169-172` — networks: [sealed] ... sealed:     internal: true
- `logs/pipeline-2026-10-05.log:710,751-752` — could not resolve www.athinorama.gr: getaddrinfo ESERVFAIL ... blocked browser request to https://www.snfcc.org/... Error scraping Music: Error: net::ERR_BLOCKED_BY_CLIENT
- `Docker Engine 26.0 release notes; docker version --format '{{.Server.Version}}' = 29.8.0` — [CVE-2024-29018]: Do not forward requests to external DNS servers for a container that is only connected to an 'internal' network.

*Reported by:* container-dns, alerting-chain.

### A02 [critical] Scrapers swallow fetch/guard errors and record success=1 with 0 events, so the pipeline stays green

**Claim.** fetchWithCurl, fetchWithRetryAthinorama, scrapeTicketServices, scrapeHalfNote and the Puppeteer scrapers catch their own OutboundUrlError and return [] or null; main() then records success=1 / error_message NULL and exits 0. The project already fixed exactly this for clubber (errors propagate) but applied it to no other source, and no hard gate counts dead sources.

**Impact.** Six sources that produced 40/203/112/18/10/16 events on 2026-09-25 have produced 0 on all four container runs since, with success=1 in every row. The deadman's Rule B (all runs success=0), health-check's 'x' glyph and the pipeline exit code cannot fire; each run silently drops roughly 400 of ~800 daily scraped events while logging [OK] per source.

**Recommendation.** Apply the clubber contract to the other seven scrapers in scripts/scrape-all.ts and the Puppeteer scrapers: when the entry fetch fails with OutboundUrlError code 'dns'|'network'|'timeout' (fetchWithRetryAthinorama null after retries, safeFetchResponse/fetchWithCurl ok:false, guardPageRequests blocking every top-level navigation), throw instead of returning []; keep ok:false only for isRefusedTarget. main()'s per-source catch (scrape-all.ts:1816-1825) already records success=0 + error_message and continues. Add a hard gate: if more than N (say 3) active sources have success=0 or events_found=0, scrape-all exits non-zero so daily-automated.sh:260 skips publish. Test (tests/scrape-all-propagation.test.ts): inject a fetchFn rejecting with OutboundUrlError('dns') into scrapeAthinorama/scrapeTicketServices/scrapeHalfNote, assert rejection; mutation: restore `return []` and watch it fail.

**Evidence.**
- `scripts/scrape-all.ts:597-598` — console.warn('   ⚠️ Athinorama unreachable — skipping source');     return [];  // Exit clean, don't crash pipeline
- `scripts/scrape-all.ts:231-235 / 1803,1811` — } catch (error) { // Curl failed } return { ok: false, text: async () => '', status: 0 }; ... recordScrapeStats(sourceId, events.length, 0, 0, duration, true, null);
- `sqlite3 -readonly data/events.db scrape_stats (source|scraped_at|events_found|success)` — more|2026-10-05T20:54:02.815Z|0|1 ... athinorama|2026-10-06T06:01:15.803Z|0|1 ... halfnote|2026-10-06T06:01:15.821Z|0|1
- `scripts/scrape-all.ts:819-821 (clubber precedent)` — Errors PROPAGATE (no internal swallow): the main loop records success=0 + error_message in scrape_stats, so a broken feed can no longer masquerade as a quiet week.

*Reported by:* container-dns, alerting-chain.

### A03 [high] Daily pipeline is unscheduled: legacy launchd job refused (exit 9) every morning, container jobs never installed

**Claim.** docker/install-launchd.sh --apply was never run, so com.agentathens.daily still fires at 08:00 and is refused by the host guard (exit 9), no com.agentathens.docker.* job exists, and every container run since 2026-09-25 was manual.

**Impact.** The live site has not been rebuilt or deployed since 2026-09-25 (19 days as of 2026-10-14); enrichment has 0 saves for the week; past-dated listings age on the site. The deadman flags only 'a scheduled job last-exited non-zero', never naming com.agentathens.daily, exit 9, or the one-line fix.

**Recommendation.** Operator: `docker/aa-run.sh doctor` then `docker/install-launchd.sh --apply` (docker/README.md:288-291), which disables the seven legacy host jobs and installs com.agentathens.docker.freshness at 08:00 plus enrichment/verify-live jobs. Code: make launchdHealth.isHealthy (scripts/deadman-watchdog.ts:343-358) return the failing [{label, exitCode}] list instead of a boolean, and change the classifier reason (src/watchdog/classifier.ts:145) to 'pipeline: com.agentathens.daily last exit 9 (host run refused — run docker/install-launchd.sh --apply)' with an exit-9 hint. Test: classifyDeadman with pipelineFailures=[{label:'com.agentathens.daily', exitCode:9}] → reason contains label, code and 'install-launchd'.

**Evidence.**
- `launchctl list | grep agentathens; launchctl print gui/501/com.agentathens.daily` — -	9	com.agentathens.daily ... runs = 90 	last exit code = 9
- `logs/launchd-stderr.log (10 occurrences, 2026-09-26..2026-10-05)` — daily-automated: REFUSED — the pipeline runs inside the container, not directly on this Mac.
- `ls ~/Library/LaunchAgents | grep -c docker ; ls ~/.config/agentathens/launchd-pre-docker.txt` — 0 ls: /Users/chrism/.config/agentathens/launchd-pre-docker.txt: No such file or directory
- `logs/deploy-cadence.log (last line); docs/digest/2026-W40.md:4` — 2026-09-25T05:18:52Z deploy-success ... **Phase-1 exit gate: FAIL** · Deploys **0/7** · Enrichment **0 saves** (**7 zero-save days**)

*Reported by:* alerting-chain.

### A04 [high] ntfy push silently unconfigured since 2026-09-26; digest listing six 0-event sources had no off-machine channel

**Claim.** Security-loop round 1 moved the ntfy topic from config/monitoring.json to ~/.config/agentathens/ntfy-topic, which was never created; every deadman run since 2026-09-26 logs 'push skipped: push topic not configured', integrity-check has no push either, and no component treats 'enabled but unconfigured' as alertable. Email is the sole remaining channel.

**Impact.** Since 2026-09-26 the owner's phone receives nothing from the watchdog, the integrity checker or the Sunday digest. Email currently delivers (heartbeat email=sent) but has failed before (msmtp exit 74/68 in July), so the system is one Gmail/TLS hiccup from fully silent.

**Recommendation.** Operator: write the topic to ~/.config/agentathens/ntfy-topic (chmod 600) or set AGENTATHENS_NTFY_TOPIC in the deadman plist. Code: in scripts/deadman-watchdog.ts main(), when cfg.push.enabled and resolvePushTopic().topic === null, add reason 'push: enabled in config/monitoring.json but no topic configured' and include it in the email body (once per day via responder state). Add a 'notify' self-check to docker/doctor-checks.sh failing when push is enabled and the file is absent. Give scripts/weekly-digest.ts a second channel via sendEmail from src/watchdog/email.ts. Test: AGENTATHENS_NTFY_TOPIC_FILE pointing at an empty temp dir with push.enabled=true → classifier input pushUnconfigured=true → reason present in DEADMAN_DRY_RUN output.

**Evidence.**
- `logs/deadman-stderr.log:356-360` — [deadman] push skipped: push topic not configured — set $AGENTATHENS_NTFY_TOPIC or write it to /Users/chrism/.config/agentathens/ntfy-topic
- `ls -la ~/.config/agentathens/` — bing-api-key  gcp-kpi-reader.json  perplexity-api-key   (no ntfy-topic)
- `git show efc0b7a4f -- scripts/deadman-watchdog.ts (2026-09-23 'Security loop round 1')` — -  push?: { enabled: boolean; server?: string; topic: string }; +const ntfyTopicFile = (): string => process.env[NTFY_TOPIC_FILE_ENV] || join(homedir(), ".config", "agentathens", "ntfy-topic");
- `docs/digest/2026-W40.md:16-27; logs/deadman-stderr.log:117-120` — - ticketservices: 0 events - snfcc: 0 events - onassis: 0 events - more: 0 events - halfnote: 0 events - athinorama: 0 events ... EMAIL DELIVERY FAILED: msmtp exit 74

*Reported by:* alerting-chain.

### A05 [high] Yield canary detects the drop but exits 1 on the first gh call, names one source, and its verdict never leaves the container

**Claim.** runCanary computes every trip correctly but throws out of the per-source issue loop on the first GitHub failure; the CLI prints only that error and exits 1, so failureLine (all tripped/dark sources) is never printed, daily-automated.sh logs 'could not run (non-fatal)', and the scrape job is built without GH_TOKEN so this happens every run.

**Impact.** The only per-source yield monitor has been structurally unable to report since the move into the container: on every container run it saw six tripped sources, named one in a log line nobody reads, filed no issue, and was logged as a tooling failure rather than a data failure. The existing test pins exit 1, guarding the defect in the wrong direction.

**Recommendation.** In scripts/yield-canary.ts: (1) evaluate first, deliver second — collect sink errors per source into result.sinkErrors instead of throwing out of the loop; (2) always console.error(failureLine(r)) and exit 2 whenever any trip/dark/stale exists, appending one stderr line for the gh failure; (3) write a machine-readable verdict data/yield-canary-latest.json {comparisonDay, tripped:[{source,latest,mean}], dark, stale} for the host deadman to read with bounded parsing; (4) skip gh entirely when GH_TOKEN is unset and say so. Tests: FakeSink whose listOpenTitles throws → runCanary resolves with tripped=[alpha,beta] and sinkErrors.length=2; CLI with fake gh exiting 1 → exit 2 and stderr contains both names; update tests/yield-canary.test.ts:784-797 to expect code 2.

**Evidence.**
- `scripts/yield-canary.ts:500-510, 612-620` — throw new CanaryError(${inner} while filing "${title}" ... } catch (e) { const msg = e instanceof CanaryError ? e.message : ...; console.error(msg); process.exit(1);
- `logs/pipeline-2026-10-05.log:886-887` — yield-canary: FAILED — gh issue list failed (... gh auth login) while filing "Yield canary: more dropped to 0 (30-day mean 32.6)" ... Yield canary could not run (exit 1) ... (non-fatal
- `docker/aa-run.sh:109; scripts/daily-automated.sh:291-294` — scrape)     TOKENS=""; SECRETS=no; ... return 0  # Non-fatal
- `tests/yield-canary.test.ts:784-797` — test('a hanging gh is bounded: the call times out, exit 1, the trip is still named' ... expect(r.code).toBe(1);

*Reported by:* alerting-chain, container-dns.

### A06 [high] Deadman SOURCE_DEAD rule counts runs, not time; STALE_DEPLOY outranks it so 16 alerts never named a dead source

**Claim.** deadSourcesFromDb requires the last 3 scrape_stats rows per source to be degenerate; with the pipeline running only manually the streak became eligible only after the third run, and because STALE_DEPLOY outranks SOURCE_DEAD the email subject still would not name it. Two reruns 50 minutes apart counted as two-thirds of a streak.

**Impact.** The host watchdog, the one component with working email delivery, emailed the owner 16 times in nine days about a stale deploy and never once about six dead sources. Even now that the streak is eligible, six SOURCE_DEAD reasons would be buried under the STALE_DEPLOY subject.

**Recommendation.** Move the yield rule onto the host deadman, where delivery works and does not depend on GitHub or the pipeline running. In scripts/deadman-watchdog.ts deadmanDbQueries() add per-source `yield:<src>`: SELECT date(scraped_at) d, MAX(events_found) n, MAX(success) ok FROM scrape_stats WHERE source=? AND scraped_at >= datetime('now','-31 days') GROUP BY d. Extract computeYields' pure core from scripts/yield-canary.ts into src/watchdog/yield-rule.ts. Rule: most recent run has n=0 or ok=0 AND the prior 30 days hold >= 3 successful nonzero days. Classifier: one reason per source, new status SOURCE_DARK above SOURCE_DEAD, subject suffix '(+N sources dark)'; dedupe by (source, latestDay). Tests in tests/watchdog/deadman-yield.test.ts with synthetic scrape_stats; mutation: disable rule, confirm failure.

**Evidence.**
- `scripts/deadman-watchdog.ts:194, 282-284` — const SOURCE_DEAD_STREAK = 3; ... if (lastRuns.length < SOURCE_DEAD_STREAK) continue; const allDegenerate = lastRuns.every((row) => row.events_found === 0 || row.success === 0);
- `src/watchdog/classifier.ts:176-181` — else if (deployStale) status = "STALE_DEPLOY";  ... else if (deadSources.length > 0) status = "SOURCE_DEAD";
- `logs/deadman-stderr.log (tail, 2026-10-05T20:00:07Z); awk count of STALE_DEPLOY lines 2026-09-27..10-05` — [deadman] STALE_DEPLOY @ 2026-10-05T20:00:07Z • deploy: stale by 254.7h (threshold 36h) ... (16 occurrences)
- `sqlite3 -readonly data/events.db — last runs per source` — more|0/1@2026-10-06 , 0/1@2026-10-05 , 0/1@2026-10-05 , 0/1@2026-09-27 (same for athinorama, ticketservices, halfnote, snfcc, onassis)

*Reported by:* alerting-chain.

### A07 [high] Fix design: proxy-mode guard (recommended) vs DNS forwarder in egress; README describes DNS inverted

**Claim.** Under the HTTP proxy the guard's resolved address is never the address connected to (Bun fetch and curl send CONNECT to squid, which resolves itself), so the local pre-check adds no private-range guarantee in the container; squid's post-DNS `dst` deny is the effective control. A proxy-mode guard weakens nothing real; a DNS forwarder re-opens the exfiltration channel Docker closed.

**Impact.** Choosing the forwarder would reintroduce the DNS side-channel, add a third daemon to egress, keep a two-resolver TOCTOU, and break pinned hardening tests. A proxy-mode guard not gated on AA_CONTAINER would disable DNS checks for any Mac shell exporting HTTPS_PROXY with no squid behind it. The README misleads readers into believing a forwarder exists.

**Recommendation.** Adopt proxy mode gated on AA_CONTAINER=1 && HTTPS_PROXY (A01), keeping scheme/credential/IP-literal/local-suffix checks and squid's post-DNS private deny as the single audited enforcement point; tests/docker-hardening.test.ts stays unchanged. Make squid auditable: add a docker/doctor.sh probe running the real guard (`bun run scripts/doctor-outbound.ts`: safeFetch('https://example.com/') → 2xx; a privately-resolving name → squid ERR_ACCESS_DENIED) and optionally pin squid `dns_nameservers` to a public resolver (add to the squid.conf test). If the forwarder is chosen instead: add dnsmasq to the egress Dockerfile stage (update tests at :258,262), static ipv4_address on `sealed` (update :162), compose `dns:` on pipeline services (strip in destructuring at :106-119). Either way rewrite docker/README.md:436-438: Engine >= 26 forwards nothing.

**Evidence.**
- `docker/egress/squid.conf:7-10, 53-66, 81` — Destinations are checked by IP after DNS resolution (dst), and a name is refused if ANY address it resolves to is private ... http_access deny aa_private_dst
- `src/utils/outbound-url.ts:15-17` — Residual risk: fetch() resolves the host again after the check, so a DNS answer that changes between the two lookups is not caught on the fetch() path.
- `docker/README.md:436-438` — DNS lookups from the internal network go to Docker's resolver; depending on the Docker version it may forward them, so data could leak out encoded in DNS names.
- `tests/docker-hardening.test.ts:106-112, 162, 258, 262` — expect([...egress.networks].sort()).toEqual(['outside', 'sealed']); ... expect(egressStage).toContain('apt-get install -y --no-install-recommends squid socat');

*Reported by:* container-dns.

### A08 [medium] health-check marks a 0-event source 'ok' while raising a CRITICAL alert nobody consumes

**Claim.** generateDailyReport's glyph looks only at success and a 50%-vs-calendar-yesterday ratio, so success=1 with 0 events gets 'v' (scoreboard status 'ok'); the CRITICAL '<source> returned 0 events' alert is report text only, health-check always exits 0, and with non-daily runs 'yesterday' is empty so the ratio rule is blind too.

**Impact.** data/scoreboard.json, the sensor the Analyst reads, said per_source status 'ok' for six sources with 0 events on every container run; the report's ALERTS section listed six CRITICAL lines each time (pipeline-2026-09-27.log:3266-3271, pipeline-2026-10-05.log:3084-3089) and no script, exit code or notification acted on them.

**Recommendation.** In scripts/health-check.ts: statusIcon = !stat.success ? 'x' : stat.events_found === 0 ? '!' : (ratio rule); replace getYesterdayScrapeStats' calendar-yesterday query with 'most recent successful run strictly before today's run' (MAX(scraped_at) < date('now')) so the ratio survives non-daily cadence; exit code 3 when any CRITICAL alert exists (run_health_check stays non-fatal but log_error with the alert count). No change needed in assemble-scoreboard.ts once the glyph is right. Tests: parseHealthReport('  ! more  0 events (same)') → 'warning'; synthetic DB with one 0-event success row → glyph '!' and exit 3; mutation: revert the glyph line, confirm the first test fails.

**Evidence.**
- `scripts/health-check.ts:301, 308-309` — const statusIcon = stat.success ? (diff < 0 && Math.abs(diff) > yesterday * 0.5 ? '!' : 'v') : 'x'; ... alerts.push({ level: 'CRITICAL', message: ${stat.source} returned 0 events });
- `scripts/health-check.ts:98-104` — WHERE date(scraped_at) = date('now', '-1 day')       AND success = 1
- `data/scoreboard.json (generated 2026-10-05T20:55:14Z)` — "athinorama": {"status": "ok", "events": 0, "delta": 0} ... "alerts": [{"level": "CRITICAL", "message": "athinorama returned 0 events"}
- `scripts/assemble-scoreboard.ts:43; scripts/daily-automated.sh:638-640` — const GLYPH_STATUS = { v: 'ok', '!': 'warning', x: 'failed', '?': 'unknown' }; ... if bun run scripts/health-check.ts ...; then log "Health check completed"

*Reported by:* alerting-chain.

### A09 [medium] Three first-party scrapers bypass the outbound guard and the call-site test does not cover scraper files

**Claim.** scrapeResidentAdvisor (GraphQL POST), scrapeMegaron and scrapeCometogether call plain fetch() outside safeFetch, and none of scripts/scrape-all.ts, scrape-megaron.ts or scrape-cometogether.ts is in the call-site test's GUARDED list. Their proxy routing relies on untested Bun env-proxy behaviour, and today they are the only producing sources precisely because they skip the guard.

**Impact.** Inference: fixed first-party URLs are not SSRF holes today, but the two fetch paths behave oppositely in the container (guarded = dead, unguarded = alive), nothing pins that Bun fetch honours HTTPS_PROXY (a Bun upgrade could silently zero the last three producing sources with success=1), and these scrapers lose the guard's size/time caps.

**Recommendation.** After the proxy-mode fix lands, route the three through the guard: ra → safeFetchResponse with POST support (extend OutboundOptions.method to 'POST' plus body, keep followRedirects:false), megaron → safeFetchResponse(calendarUrl, { maxBytes: SCRAPE_MAX_BYTES }), cometogether → default fetchFn = guardedFetch (scrape-all.ts:146; scrapeClubber at :822 uses this pattern). Add scripts/scrape-all.ts, scrape-megaron.ts, scrape-cometogether.ts, scrape-snfcc.ts, scrape-onassis.ts, scrape-benaki.ts to the GUARDED list in src/utils/__tests__/outbound-url-callsites.test.ts. Add a docker-hardening or doctor check that a Bun fetch('https://example.com/') inside the pipeline service appears in `docker logs aa-egress`, pinning the env-proxy dependency.

**Evidence.**
- `scripts/scrape-all.ts:1178-1180` — const response = await fetch('https://ra.co/graphql', {       method: 'POST',       redirect: 'error', // fixed first-party API: a redirect is never followed
- `scripts/scrape-megaron.ts:70; scripts/scrape-cometogether.ts:122-123` — const response = await fetch(calendarUrl, { ... export async function scrapeCometogether(fetchFn: typeof fetch = fetch) ... await fetchFn('https://cometogether.live/el', {
- `src/utils/__tests__/outbound-url-callsites.test.ts:195-204 (GUARDED list)` — 'src/images/download-image.ts', 'src/ticketing/validator.ts', 'src/utils/url-validator.ts', 'scripts/enrich-images.ts', 'scripts/enrich-time.ts', 'scripts/validate-ticket-urls.ts', ...
- `logs/pipeline-2026-10-05.log:862-871` — [OK] more | 0 events ... [OK] ra | 81 events ... [OK] megaron | 113 events ... [OK] cometogether | 221 events

*Reported by:* container-dns.

### A10 [low] docker/doctor.sh passes on raw curl while every guarded fetch in the same container is dead

**Claim.** docker/doctor.sh verifies egress with raw curl, which reads https_proxy and lets squid resolve, so it reports healthy while the project's own outbound guard cannot resolve any name; the DNS state of the internal network is never surfaced in doctor output.

**Impact.** A green `doctor` gave false assurance that the networked pipeline was healthy before each manual run; the one preflight an operator trusts cannot distinguish 'squid reachable' from 'scrapers can fetch'.

**Recommendation.** Add a guard-level probe to docker/doctor.sh that runs the project's own module (e.g. `bun run scripts/doctor-outbound.ts`: safeFetch('https://example.com/', { method: 'HEAD' }) must return 2xx/3xx) and report `getent hosts example.com` as informational so the DNS state is visible. Print the Docker Engine version floor (>= 26 means no external DNS on internal networks) in doctor output. README correction is covered under A07.

**Evidence.**
- `docker/doctor.sh:65-67` — code="$(curl -sS -m 30 -o /dev/null -w '%{http_code}' https://example.com/ 2>/dev/null || true)" [[ "$code" =~ ^[23] ]] && ok "public HTTPS through the egress proxy
- `docker/doctor.sh:52-54` — Checked with curl through the proxy (it reads http_proxy / https_proxy): refusals must come from the proxy itself (X-Squid-Error).
- `logs/pipeline-2026-10-05.log:724` — ⚠️ Error: OutboundUrlError: could not resolve www.ticketservices.gr: getaddrinfo ESERVFAIL

*Reported by:* container-dns.

### T01 [critical] Legacy copy-url generator is the only ticket_url writer; tiered resolver is wired into no job

**Claim.** The daily pipeline's only ticket step is validate-ticket-urls.ts --generate, which copies event.url into ticket_url with status 'generated'. The tiered resolver (src/ticketing/resolver.ts via scripts/backfill-ticket-urls.ts) is wired into no scheduled job and no scraper captures a ticket URL, so 'direct' and 'valid' have never been written to any row.

**Impact.** Of 596 upcoming with-ticket shown events only 9 (1.5%, all ai_discovered) render 'Αγοράστε εισιτήρια →'; 553 render 'Βρείτε εισιτήρια →' to the scrape listing even when that page is a checkout. Each nightly run adds more 'generated' rows (29, 158, 23 in the last three); the D1-D11 resolver, its 26 tests and the ticket_url_source/ticket_url_resolved_at columns deliver nothing.

**Recommendation.** Replace run_tickets in scripts/daily-automated.sh (:406-425) with `bun run scripts/backfill-ticket-urls.ts --only-status=generated,null --skip-tier=2` (cheap tiers are in-memory, no DNS, container-safe) only AFTER fixing the host list and RA search pattern (T05). Delete the copy-url branch at validate-ticket-urls.ts:307-315; cta.ts rule 4.5 already derives the listing fallback from event.url, so ticket_url must never equal url. Add a build-time ratchet in src/generate-site.ts / data/build-completeness.json: upcoming shown rows with ticket_url_status='generated' must be 0. Pin with an event-page test (src/generators/__tests__/event-page.test.ts) that a ticketservices.gr row renders Buy and an athinorama.gr row does not.

**Evidence.**
- `scripts/daily-automated.sh:415` — if bun run scripts/validate-ticket-urls.ts --generate >> "$LOG_FILE" 2>&1; then
- `scripts/validate-ticket-urls.ts:283-286, 307-315` — UPDATE events SET ticket_url = ?, ticket_url_status = 'generated' ... // Use existing URL if available / if (event.url && event.url.includes('://')) updateStmt.run(event.url, event.id)
- `grep -rn backfill-ticket-urls scripts/*.sh docker/ package.json .github/ ~/Library/LaunchAgents/com.agentathens.*.plist` — no matches; the only ticket hits are daily-automated.sh:411 and :415 (validate-ticket-urls.ts --generate); package.json has no 'ticket' script
- `sqlite3 -readonly data/events.db: ticket_url_status, all rows / upcoming shown with-ticket` — all rows: generated|13925 NULL|5231 door_only|435 ai_discovered|135 (no 'direct' or 'valid' ever); upcoming with-ticket: generated|553 door_only|34 ai_discovered|9

*Reported by:* ticket-url-pipeline, ticket-url-live-check.

### T02 [high] 'generated' status hides 318 merchant checkout pages behind the Find label while JSON-LD emits an Offer

**Claim.** 'generated' is in neither BUY_TICKETS_STATUSES nor FIND_TICKETS_STATUSES, so resolveCtaForEvent falls through to rule 4.5 and renders 'Βρείτε εισιτήρια →' even when ticket_url is a verified-purchasable ticketservices.gr/more.com/ra.co/halfnote.gr/megaron.gr/cometogether.live event page; buildOfferOrOmit ignores status and emits an Offer with that same URL, so HTML and structured data disagree.

**Impact.** 318 upcoming with-ticket events whose ticket_url is a merchant event page (ticketservices 87, megaron 110, more.com 48, cometogether 42, ra.co 37, halfnote 21, onassis 12; 7 of 7 sampled links purchasable with matching dates) get the hedged 'Find tickets' label; the Buy tier holds 9 rows (30 of 957 built pages). JSON-LD asserts a merchant Offer the visible CTA does not.

**Recommendation.** Short term (no DB change): in src/ticketing/cta.ts add a rule between 3 and 4: if status is 'generated' and ticketTrustReason(url) / ticket-source-classification.json known_merchants classify the host as a ticket platform (and the URL is not a search URL), label buyTicketsArrow; keep 'generated' + listing_aggregator host on the rule-4.5 path. Proper fix: retire 'generated' (T01, T06) so the D11 lists are exhaustive. Add cases to tests/ticketing/cta.test.ts (currently zero 'generated' cases): ('generated', more.com URL) → buy; ('generated', athinorama URL) → find to listing; plus an offer-builder/cta consistency test asserting an emitted Offer.url always equals the CTA href.

**Evidence.**
- `src/ticketing/cta.ts:50-62` — BUY_TICKETS_STATUSES = ['direct','detail_page','venue_registry_direct','venue_registry','crossref','ai_discovered']; 'generated' absent from both lists
- `src/ticketing/cta.ts:130-132` — if (event.price?.type === 'with-ticket' && listingUrl) { return { kind: 'tickets', label: t.findTicketsArrow, href: listingUrl };
- `read-only trace of real modules on a copied ticketservices row; dist/events/0aba0a48-concert-1-baumstrasse-omma-amp/index.html vs GET ticketservices.gr/event/15203/` — status=generated → CTA "Βρείτε εισιτήρια →" ticketservices.gr/event/15203/; Offer {seller:Ticketservices.gr, price:12}; live page: Σάββατο 10 Οκτωβρίου 2026, avails free 79
- `sqlite3 -readonly: ticket_url host x status, upcoming shown with-ticket; grep -l over dist/events/*/index.html (957 pages)` — megaron.gr|generated|110 ticketservices.gr|87 more.com|48 cometogether.live|42 ra.co|37 halfnote.gr|21 onassis.org|12; dist: Find 719 / Buy 30 / Door 42

*Reported by:* ticket-url-pipeline, ticket-url-live-check.

### T03 [high] HEAD validation has never run; enabling it as written would mass-expire live links (DNS errors, Queue-it, DataDome)

**Claim.** --generate skips Step 1, so no row has ever been 'valid' or 'expired'. Both validators map every non-ok status and every non-timeout OutboundUrlError — the container's getaddrinfo ESERVFAIL, more.com's Queue-it 302 loop (exceeds maxRedirects 5), ra.co's 403 DataDome challenge — to 'expired', so switching validation on would flag ~560 live URLs dead.

**Impact.** Dead or sold-out links are never detected (Expired has been 0 on every run). The obvious remedy, removing --generate in the nightly container, would set 'expired' on all ~560 upcoming URLs because the container cannot resolve hosts; even with working DNS, 92 live more.com (55) and ra.co (37) links would flip to expired behind bot walls and lose their CTA.

**Recommendation.** Run validation weekly with src/ticketing/validator.ts (not the legacy script) over rows with status IN ('direct','venue_registry_direct','ai_discovered','crossref'). Make it host-aware: never HEAD more.com/ra.co; verify ra.co via the GraphQL API the scraper already uses (missing event = expired), more.com via tier 3b crossref or headless Chromium (scripts/lib/chrome-path.ts knows the proxy); for ticketservices.gr/megaron.gr/cometogether.live/halfnote.gr use GET with a browser UA and a per-host 'still listed' marker. Branch validator.ts:225-226 on error.code: 'dns'/network → 'unverified'; 302/403 → new 'blocked', never 'expired'; persist 'expired' only for 404/410/homepage_redirect. Write response.url to ticket_url_resolved(+_at). Schedule where DNS works (Mac launchd) or let assertPublicUrl skip local lookup when HTTPS_PROXY is set. Surface blocked counts in the build summary.

**Evidence.**
- `scripts/validate-ticket-urls.ts:96-101, 111-113, 132-136` — method: 'HEAD', UA 'Mozilla/5.0 (compatible; AgentAthens/1.0)'; if (!response.ok) → 'expired'; any non-timeout error → { status: 'expired', error: errorMessage }
- `src/ticketing/validator.ts:222-226` — if (error instanceof OutboundUrlError && error.code === 'timeout') → 'unverified'; ... return { outcome: 'expired', finalUrl: null, finalHost: null, error: msg };
- `curl -sL -A <Safari UA> https://www.more.com/gr-el/tickets/theater/theofilos-sold/ and https://ra.co/events/2529706` — more.com: 302 → ?queueittoken=e_safenetprod2025~rt_safetynet, 50 redirects, never 200; ra.co: HTTP 403 'Please enable JS', host geo.captcha-delivery.com
- `logs/pipeline-2026-10-05.log:710, 1545-1547; sqlite3 -readonly all rows` — could not resolve www.athinorama.gr: getaddrinfo ESERVFAIL ... Valid: 0 / Expired: 0 / Generated: 13887; DB: 'valid' and 'expired' count 0

*Reported by:* ticket-url-pipeline, ticket-url-live-check.

### T04 [high] athinorama 'generated' ticket links are editorial listings, never a checkout

**Claim.** For 191 of 215 upcoming shown athinorama.gr rows ticket_url is byte-identical to the event's own athinorama listing URL (copied by generateMissingUrls); none of 4 sampled pages sells the event — two have no merchant link, one only an outbound more.com link — yet the site labels them 'Βρείτε εισιτήρια →'. The resolver already treats these URLs as pollution.

**Impact.** Roughly 190 upcoming event pages (415 Find-labelled anchors to www.athinorama.gr in dist, the largest ticket-link population) send a visitor who clicks 'Βρείτε εισιτήρια' to an information page where they must hunt for the merchant; for 2 of 4 sampled pages there is nothing to find. 23 more such rows were written on 2026-10-05.

**Recommendation.** In scripts/validate-ticket-urls.ts generateMissingUrls(), stop copying event.url into ticket_url when hostOf(event.url) is in config/ticket-source-classification.json listing_aggregators (athinorama.gr, clubber.gr); leave ticket_url NULL so cta.ts rule 4.5 still emits the listing link. Add an i18n key in src/i18n/strings.ts (e.g. detailsArrow, 'Λεπτομέρειες →') for that path so the site stops promising tickets it cannot show. Add a computed count (ticket_url = url AND source IN listing_aggregators) to the build summary. Longer term, extract the outbound more.com anchor via tier 1b (T08).

**Evidence.**
- `sqlite3 -readonly data/events.db (upcoming shown, ticket_url NOT NULL, grouped by source)` — athinorama.gr|191|24|215  (same_as_url | differs | total)
- `fetch https://www.athinorama.gr/theatre/performance/theofilos_sold-10081522/ (HTTP 200)` — Αγόρασε τώρα το εισιτήριο σου από το more.com — only merchant anchor: href="https://www.more.com/theater/theofilos-sold-1"; no performance date block in static HTML
- `fetch https://www.athinorama.gr/music/gig/georgia_ntagaki__-10039491/ (HTTP 200), merchant-anchor scan` — only https://www.athinorama.gr/music/guide/propoliseis | Προπωλήσεις more.com — no event-specific merchant link, no event date text
- `src/ticketing/resolver.ts:124-127` — // Pollution guard: validate-ticket-urls.ts generateMissingUrls() copied many athinorama.gr listing URLs into ticket_url ... if (host === 'athinorama.gr') return null;

*Reported by:* ticket-url-live-check.

### T05 [high] Wiring the resolver as-is would overwrite 130 megaron/onassis event pages with search URLs and write 25 malformed ra.co URLs

**Claim.** validator.getTicketHosts() lacks megaron.gr and onassis.org (both in the classifier's known_merchants), so tier1 rejects their event-page URLs and tier2 persists venue_registry_search (0.6) over the direct page; ticketing-mapping.json's residentadvisor.net search_pattern has no query parameter, so tier3 concatenates the title onto /events/gr/athens.

**Impact.** A naive 'just run the backfill' (the fix for T01) would degrade 130 rows — Megaron, with 114 upcoming events, is the single largest venue — from a working event page to a keyword search, and publish 25 dead ra.co links for Temple/Astron/SMUT/Six D.O.G.S nights: a worse user outcome than today's Find label.

**Recommendation.** In src/ticketing/validator.ts getTicketHosts(), union KNOWN_MERCHANT_HOSTS from src/utils/ticket-source-classifier.ts (one source of truth) so megaron.gr/onassis.org become tier1 'direct'. In config/ticketing-mapping.json either remove residentadvisor.net from platform search (RA has no title-search deep link) or set a real pattern, and add a resolver test asserting every platform search URL carries the encoded title in a query string. Guard scripts/backfill-ticket-urls.ts processEvent: skip the write when isTicketDomain(before.url) && resolved.confidence < 0.95, so tier2/tier3 never persist a weaker candidate over an existing merchant-host ticket_url.

**Evidence.**
- `read-only trace (scratchpad) of getTicketHosts() and isTicketDomain()` — ticketHosts = more.com,ticketservices.gr,residentadvisor.net,ra.co,halfnote.gr,viva.gr,ticketmaster.gr; isTicketDomain megaron.gr/event/... => false, onassis.org => false
- `config/ticket-source-classification.json` — "known_merchants": ["more.com", "megaron.gr", "ticketservices.gr", "ra.co", "viva.gr", "onassis.org"]
- `read-only trace: resolveTicketUrl on copied megaron.gr and cometogether@Temple 'generated' rows` — [meg] venue_registry_search 0.6 -> megaron.gr/event-search/?keyword=Quatuor%20Modigliani; [ctg] platform_search 0.5 -> https://ra.co/events/gr/athensY
- `config/ticketing-mapping.json platforms.residentadvisor.net; src/ticketing/resolver.ts:241; sqlite3 bucketing of upcoming 'generated' rows` — search_pattern "/events/gr/athens"; url = platform.base_url + platform.search_pattern + encodeURIComponent(event.title); registry_search_overwrite|130 RA_broken|25

*Reported by:* ticket-url-pipeline.

### T06 [high] Three host lists and two status vocabularies disagree across validator, classifier, ticket-trust, CTA and the legacy script

**Claim.** The legacy script writes valid/expired/unverified/generated/door_only; resolver, CTA and types assume the D11 set (direct, detail_page, venue_registry_*, crossref, platform_search, ai_discovered, ...); the Offer builder ignores status and classifies by host from a third list. 'valid' is invisible to the CTA, 'generated' is trusted by nobody yet is 93% of rows, and halfnote.gr is a tier1 ticket host but venue_direct_only for the Offer.

**Impact.** Any single fix (e.g. enabling HEAD validation, which writes 'valid') is silently ignored by the CTA; reviewers cannot tell which vocabulary a row's status belongs to; an Offer can be emitted for a URL the CTA considers untrusted-legacy and vice versa.

**Recommendation.** Converge on the D11 status set as the only writable vocabulary: (a) delete the 'valid'/'unverified'/'generated' writers in scripts/validate-ticket-urls.ts or retire the script; (b) derive getTicketHosts() from ticket-source-classification.json known_merchants ∪ ticketing-mapping.json platforms and have src/ticketing/ticket-trust.ts and the classifier read the same set; (c) decide halfnote.gr once (its /programma/ page is a reservation page — keep venue_direct_only for the Offer, allow 'direct' for the CTA via a 'buy' vs 'reserve' label); (d) restore the D1-D11 decisions record under specs/ since four source files cite it. Add a test that every value any script writes to ticket_url_status is a member of the TicketUrlStatus union in resolver.ts.

**Evidence.**
- `scripts/validate-ticket-urls.ts:50` — type TicketUrlStatus = 'valid' | 'expired' | 'sold_out' | 'unverified' | 'generated' | 'door_only';
- `src/types.ts:24-40` — // Formalized per decisions.md D11. Resolver cascade produces these values; ... 'direct' | 'detail_page' | 'venue_registry'  // legacy (pre-D11); kept for compat
- `src/ticketing/offer-builder.ts:155-156 (no status read in file); config/ticket-source-classification.json` — const decision = classifyTicketSource(event); ... "venue_direct_only": ["halfnote.gr", "benaki.org"] — while getTicketHosts() includes halfnote.gr
- `find . -name decisions.md -not -path '*/node_modules/*'` — (no output — the decisions.md cited by resolver.ts:338, cta.ts:45, validator.ts:123 and types.ts:24 is not in the repository)

*Reported by:* ticket-url-pipeline.

### T07 [medium] Venue registry ticketing covers 4 of 356 venues; 161 upcoming 'generated' rows have no tier that can resolve them

**Claim.** Only Megaron, Half Note, Ilion Plus and Onassis carry a ticketing block (8 venues a website); after merchant-host rows are promoted, 161 upcoming rows at unregistered venues stay unresolved, while the 14 venue_to_platform url_pattern deep links in ticketing-mapping.json are read by neither tier3 (search_pattern only) nor the legacy generator.

**Impact.** Even after the pipeline fix (T01/T05), roughly 160 upcoming ticketed events (27% of with-ticket rows) keep the listing-page fallback; tier 3b crossref can help only 9 exact twins, so the remaining yield is registry work.

**Recommendation.** Add config/athens-venues.json ticketing entries in expected-yield order: (1) Temple 27, SMUT 10, IT Athens 10, Aux 9, Oddity 7, Astron 6, Six D.O.G.S → ticketing.url = the venue's ra.co club page, provider ra.co (and remove them from door_only_venues, T10); (2) Gazarte 15, Κύτταρο 14, Floyd 5, Gagarin/Fuzz → move the existing more.com url_pattern deep links into ticketing.url (venue_registry_direct 0.85) and teach tier3 in src/ticketing/resolver.ts to use venueEntry.url_pattern before search_pattern; (3) ΚΠΙΣΝ 33, Θέατρο Μετς 21, Gustav 8, Concert #1 7 → ticketservices.gr venue pages; (4) Εθνική Λυρική Σκηνή, Πειραιώς 260, Τεχνόπολη → provider pages. For Megaron (114) prefer tier1 direct on the event page over its search_pattern. Record provenance in ticket_url_source so the weekly HEAD job (T03) can audit registry links.

**Evidence.**
- `jq '.venues[] | select(.ticketing)' config/athens-venues.json` — 4 of 356: Μέγαρο Μουσικής Αθηνών (megaron.gr search_pattern), Half Note Jazz Club (halfnote.gr/programma/), Ίλιον Plus (more.com search), Onassis Stegi (onassis.org search)
- `src/ticketing/resolver.ts:238-241` — if (!platform?.base_url || !platform.search_pattern) return null; const url = platform.base_url + platform.search_pattern + encodeURIComponent(event.title); (url_pattern never read)
- `config/ticketing-mapping.json venue_to_platform.Gazarte` — "url_pattern": "https://www.more.com/gr/el/tickets/music/gazarte/"  (one of 14 per-venue deep links no code path reads)
- `sqlite3 -readonly: top venues of the 161 unresolvable upcoming rows; athinorama rows with a same-venue same-date merchant twin` — Σταυρός του Νότου|7 Ωδείο Αθηνών|6 Κέντρο Ελέγχου Τηλεοράσεων|6 ARCH Club|6 Εθνική Λυρική Σκηνή|5 Τεχνόπολη|4 Πειραιώς 260|4 ΠΛΥΦΑ|4; merchant twins: 9

*Reported by:* ticket-url-pipeline.

### T08 [medium] Tier 1b detail-page extraction is a stub with a stale athinorama exclusion; six legacy ticket scripts are dead

**Claim.** resolver.ts excludes athinorama from detail-page extraction citing a 2026-04-24 finding that its pages carry no more.com links, but the sampled Θεόφιλος page does; every sampled halfnote.gr and 2 of 3 megaron.gr pages expose the one-hop checkout URL. SOURCES_WITH_OUTBOUND_LINKS is empty so tier1b always returns null, and six legacy ticket-URL scripts are referenced by no job.

**Impact.** The cascade's only network tier is dead code, so the site can never upgrade a listing link to the merchant page it points at: 110 megaron and 21 halfnote upcoming rows land one click short of checkout (the megaron page without a ticket button, presumably not yet on sale — inference — is labelled like the others). Reviewers keep rediscovering six overlapping, unmaintained ticket-URL scripts.

**Recommendation.** Implement tier1b_detailPage in src/ticketing/resolver.ts with per-host extractors emitting status 'detail_page': megaron.gr → anchor inside div.event-tickets-link (add webtics.megaron.gr to trusted hosts in config/ticketing-mapping.json); halfnote.gr → anchor text /ΕΙΣΙΤΗΡΙ/ with host more.com; athinorama.gr → anchor host more.com ('Αγόρασε τώρα'). Correct the stale comment at resolver.ts:143-147 with the 2026-10-06 evidence. GET-only, one request per event, cached via ticket_url_resolved_at, behind the same DNS/bot-wall guard as T03; when a megaron page has no event-tickets-link, emit a 'not yet on sale' sub-label rather than Find tickets. Move the six dead scripts to scripts/_archive/ (as done for migrate-price-types.ts) with a one-line pointer to backfill-ticket-urls.ts.

**Evidence.**
- `src/ticketing/resolver.ts:143-156` — * Athinorama deliberately excluded — 2026-04-24 investigation confirmed its detail pages contain no more.com / viva / ticketservices outbound links. ... SOURCES_WITH_OUTBOUND_LINKS = new Set([])
- `src/ticketing/resolver.ts:166-170` — // TODO: port scripts/extract-ticket-urls.ts fetchPage() + extractTicketUrl() logic here once we have at least one source in SOURCES_WITH_OUTBOUND_LINKS. ... return null;
- `fetch of athinorama theofilos_sold-10081522, megaron.gr/event/quatuor-modigliani/, halfnote.gr/event/chico-pinheiro-quartet/2026-10-09/` — athinorama: more.com/theater/theofilos-sold-1 'Αγόρασε τώρα'; megaron: div.event-tickets-link → webtics.megaron.gr/el/events/?eventid=3977; halfnote: more.com ΕΙΣΙΤΗΡΙA
- `grep over scripts/*.sh docker/ package.json .github/ ~/Library/LaunchAgents/*.plist` — no reference to crossref-ticket-urls, search-ticket-urls, extract-ticket-urls, search-more-tickets, fix-urls-and-prices or venue-ticket-mapping

*Reported by:* ticket-url-pipeline, ticket-url-live-check.

### T09 [medium] athinorama year-rollover rows publish ticket links to the wrong edition of an event

**Claim.** The DB dates '25 χρόνια Athens Jazz' 2027-05-28 while its athinorama ticket page describes the festival running 25–31 May 2025; 172 upcoming shown athinorama rows carry start_date >= 2027 (including 'STEGI.RADIO TAKEOVER 2026' dated 2027-02-13) and the build's rollover guard held back only 92, so about 80 (inference) can reach the site with a Find link to a past edition.

**Impact.** A ticket link that resolves to a different edition is a wrong-event link: the visitor reads 2025 dates under a 2027 heading. The three far-future sampled rows were held back, but 172 − 92 = 80 rows dated 2027 are not covered by the 300-day rule and the DB keeps feeding them ticket URLs nightly.

**Recommendation.** Extend selectPublishedPopulation (src/utils/event-populations.ts) so an athinorama row is also held when its title contains a year earlier than start_date's year, or when start_date is more than 365 days ahead of today regardless of first-scrape age; in the athinorama scraper (scripts/scrape-all.ts) refuse the +1-year roll when the page text carries an explicit year (the page states 'Μαΐου 2025'). Add a synthetic fixture test (title '... 2026', start_date 2027-02-13) that fails if the hold-back is removed, asserting the fixture's own precondition.

**Evidence.**
- `sqlite3 -readonly data/events.db (id c5f1cd1a5f8819bc)` — c5f1cd1a5f8819bc|athinorama.gr|2027-05-28T21:00:00|generated|with-ticket|concert|25 χρόνια Athens Jazz|Τεχνόπολη ... created_at 2026-05-29 05:07:59
- `fetch https://www.athinorama.gr/music/gig/25_xronia_athens_jazz-10090301/ (HTTP 200), page text` — Το Athens Jazz της Τεχνόπολης Δήμου Αθηναίων γίνεται 25 και το γιορτάζει με 21 τζαζ σχήματα από τις 25 ως τις 31 Μαΐου 2025.
- `sqlite3 -readonly data/events.db (athinorama upcoming shown, start_date >= '2027-01-01')` — 172|2027-01-30|2027-09-21T21:00:00 ... 030d1241b2a6f0e7|2027-02-13|STEGI.RADIO TAKEOVER 2026|generated
- `src/generate-site.ts:203-204; logs/pipeline-2026-10-05.log:1681` — selectPublishedPopulation(allEvents) ... 🕰️  Held back 92 athinorama rows dated >300 days after first scrape (rollover suspects)

*Reported by:* ticket-url-live-check.

### T10 [medium] door_only_venues marks 19 upcoming RA-sourced rows 'At the door' at venues the code itself says RA sells tickets for

**Claim.** config/ticketing-mapping.json door_only_venues contains IT Athens, Oddity, AUX Club, Romantso, Death Disco; the nightly --generate marks every ticket_url-less row at those venues door_only, while validator.ts D5 declares RA the authoritative ticketing source for IT Athens/Romantso/Death Disco, and the RA GraphQL scrape never requests ticketing fields so a row cannot say otherwise.

**Impact.** 19 upcoming RA events (plus 12 athinorama/cometogether rows at the same venues) render 'Μόνο στην είσοδο' with no link although the RA event page in event.url sells or reserves tickets; the resolver's door_only guard (resolver.ts:356) then short-circuits them forever. ~300 rows get updated_at rewritten every night.

**Recommendation.** Remove IT Athens, Oddity, AUX Club, Romantso/Bios and Death Disco from door_only_venues (keep only venues with no online sales, e.g. Stoa Athanaton, Klimataria, Kavouras); add isTicketed / tickets fields to the RA GraphQL selection in scripts/scrape-all.ts and write ticket_url_status 'direct' with ticket_url = the ra.co event URL when ticketed, 'door_only' only when RA says not ticketed; give those venues registry ticketing.url entries pointing at their ra.co club pages (T07). Make the door_only write in validate-ticket-urls.ts (or its replacement) idempotent by skipping rows already door_only.

**Evidence.**
- `config/ticketing-mapping.json door_only_venues` — "Romantso", "Bios", "AUX Club", "IT Athens", "Oddity", "Death Disco",
- `src/ticketing/validator.ts:68-69` — // D5: RA is the authoritative ticketing source for underground/electronic Athens venues (IT Athens, Six D.O.G.S., Temple, Romantso, Death Disco).
- `scripts/validate-ticket-urls.ts:296-302; scripts/scrape-all.ts:1162-1170 (RA GraphQL selection)` — if (config.door_only_venues.some(v => event.venue_name.toLowerCase().includes(v.toLowerCase()))) doorOnlyStmt.run(event.id); RA query has no isTicketed/tickets field
- `sqlite3 -readonly: RA door_only upcoming rows by venue; logs/pipeline-2026-09-25/09-27/10-05.log` — IT Athens|8 Aux Club|6 Oddity|5 Bios Ρομάντσο|1 (all with ra.co event URLs); Door only: 299 / 298 / 303 — same rows re-marked nightly

*Reported by:* ticket-url-pipeline.

### T11 [medium] ticket_url_resolved column has had no writer since it was added (S103, 2026-05-02)

**Claim.** The Offer emitter and classifier prefer ticketUrlResolved over ticketUrl, but no script or module assigns the column; it is NULL on every row.

**Impact.** The redirect-resolved checkout URL the Offer builder was designed to prefer never exists; tickets.in.gr → more.com style redirectors stay unclassified and omitted (1 upcoming row today), and the column misleads future readers into assuming a nightly resolver exists.

**Recommendation.** Make the weekly validation job (T03) the writer: `UPDATE events SET ticket_url_resolved = ?, ticket_url_resolved_at = datetime('now')` with validator.ts finalUrl when the outcome is valid and finalHost differs from the original host. Otherwise drop the column in a migration and remove the ticketUrlResolved preference from src/ticketing/offer-builder.ts and src/utils/ticket-source-classifier.ts.

**Evidence.**
- `grep -rn 'ticket_url_resolved\b' scripts src --include '*.ts' (excluding resolved_at, url-columns, database.ts)` — only src/db/__tests__/migrations.test.ts and src/generators/__tests__/event-page.test.ts reference it — no writer
- `sqlite3 -readonly: upcoming shown rows` — total|eq_url|has_ticket_url|resolved_not_null|resolved_at_not_null|src_not_null → 604|534|562|0|9|9
- `src/utils/ticket-source-classifier.ts:144` — const url = event.ticketUrlResolved ?? event.ticketUrl;
- `docs/session-log.md:3487-3494` — Sprint 2.5 will populate ticket_url_resolved nightly; emitter automatically switches to it ... Sprint 2.5 (nightly resolver job) is now unblocked.

*Reported by:* ticket-url-pipeline.

### T12 [low] Venue mapping writes a dead Half Note calendar URL into ticket_url

**Claim.** Two upcoming athinorama rows at Half Note carry ticket_url https://www.halfnote.gr/en/calendar/, which returns 404 'Η σελίδα δεν βρέθηκε'; the URL originates from scripts/venue-ticket-mapping.ts, while config/ticketing-mapping.json points the same venue at https://www.halfnote.gr/events/ (not tested).

**Impact.** Site impact is nil today because status 'generated' makes cta.ts fall back to event.url (the athinorama listing), but the DB holds a 404 as a ticket URL and any promotion of 'generated' rows to Buy (T02) would publish it; the halfnote source itself supplies working per-event URLs (sampled row returned 200 with a ticket button).

**Recommendation.** Remove the 'Half Note Jazz Club' entry from scripts/venue-ticket-mapping.ts (or point it at the per-event halfnote.gr/event/<slug>/<date>/ pattern) and add a one-time check that GETs every baseUrl / url_pattern in config/ticketing-mapping.json and scripts/venue-ticket-mapping.ts — configured, not scraped, URLs, so a plain status check is appropriate — failing on any non-200. Fold into the T08 archival if venue-ticket-mapping.ts is retired.

**Evidence.**
- `curl -sL -A <Safari UA> https://www.halfnote.gr/en/calendar/` — 404|https://www.halfnote.gr/en/calendar/|111859|0  <title>Η σελίδα δεν βρέθηκε &#8211; Half Note</title> <h1>Αυτή η σελίδα δε βρέθηκε.</h1>
- `sqlite3 -readonly data/events.db (id ef0f106cacd0f5fe; upcoming shown, ticket_url LIKE '%halfnote.gr/en/calendar%')` — ef0f106cacd0f5fe|athinorama.gr|2027-01-30|generated|.../vincent_peirani-10088859/|https://www.halfnote.gr/en/calendar/ ; count 2|athinorama.gr
- `scripts/venue-ticket-mapping.ts:27-30` — 'Half Note Jazz Club': { seller: 'halfnote.gr', baseUrl: 'https://www.halfnote.gr/en/calendar/'
- `config/ticketing-mapping.json:59-62` — "Half Note Jazz Club": { "platform": "halfnote.gr", "url_pattern": "https://www.halfnote.gr/events/",

*Reported by:* ticket-url-live-check.

### Q01 [critical] Scrapers discard source venue identity; save seam stores only venue_name

**Claim.** Every active source exposes structured venue data (stable venue id, city, address or geo) that the scrapers never read; ScrapedEvent and the saveEvents INSERT have no column for it, so venue identity, city and address are reconstructed later from the free-text name alone.

**Impact.** 472 non-Athens rows entered events since July and were deleted post hoc; 16 Thessaloniki 'Soul' rows sit in the unverified queue; foreign events pass as verified_athens when the venue string carries no Greek city word (Hamburg 8406db69feb81b33, New York 6379dca39846c268). Every downstream venue decision (whitelist, dedup, address, @id) rests on a colliding name string.

**Recommendation.** Add a migration creating events.venue_raw, venue_source_id, venue_city, venue_country, venue_address_src, venue_place_id (TEXT); extend ScrapedEvent with the same optional fields; populate per source: cometogether → venueId/placeIds and venueLocation.city|municipality|formattedAddress (parse the embedded JSON instead of the span regex at scripts/scrape-cometogether.ts:93-96); RA → venue.id (request address/area in the GraphQL query after confirming the schema); ticketservices → data-venueids plus the area id aligned to each date; more.com → JSON-LD location.name/address; athinorama → the /halls/ href slug (scripts/scrape-all.ts:637-639); megaron/onassis → hall element. Write these columns in the saveEvents INSERT and ON CONFLICT, then derive venue_key (Q03) and the city gate (Q04) from them at save time.

**Evidence.**
- `scripts/scrape-all.ts:70-88 (ScrapedEvent) and :1454-1462 (saveEvents INSERT)` — venue_name: string; url: string; price_type: string; ... location_status?: string; — no address, city or venue id field; INSERT writes venue_name only
- `tests/fixtures/cometogether-listing.html (server-rendered JSON per event)` — "venueName":"Soul","venueId":"ChIJP504LgA5qBQRw-AvuZfpxTg",..."venueLocation":{..."city":"Θεσσαλονίκη","municipality":"Θεσσαλονίκη"
- `scripts/scrape-all.ts:1167 vs 1230,1237 (RA GraphQL); :905,915 vs scripts/_archive/scrape-ticketservices.ts:152-156` — venue { name id } ... venue_name: e.venue.name — e.venue.id never read; archived regex captured data-venueids='(\d+)', current one has no group
- `sqlite3 -readonly rejected_events since 2026-07-01 by source; upcoming unverified by venue` — cometogether 187 rows / 38 venues; ticketservices 145 / 23; athinorama.gr 89 / 7; more.com 41 / 18 — all saved first, then deleted; Soul @@ cometogether @@ 16

*Reported by:* save-seam-quality.

### Q02 [critical] Gated email ingest examines only one message per run (UID list truncated by node-imap)

**Claim.** imapSimpleMailbox.fetchHeaders passes the UID batch as one comma-joined string; node-imap's validateUIDList parseInt()s it down to the first UID, so the search becomes `UID SEARCH UID <lowest>` and each run examines exactly one message while logging 'examining N'. The other N-1 are neither saved, skipped, rejected nor errored. Verified by the merger against node-imap source.

**Impact.** fetched − (saved+skipped+rejected+errors) = 9, 20 and 19 on the three container runs, explainable only by headerInfos.length === 1 (inference from code structure). The channel drains at most one message per day and the lowest-UID message has been an already-processed leftover each time, so no newsletter has been saved since the gate shipped; 'examining 21' and 'completed successfully' are false records.

**Recommendation.** In imapSimpleMailbox.fetchHeaders (src/ingest/email-ingestion.ts:432) spread the UIDs as separate criterion arguments — `connection.search([['UID', ...uids.map(String)]], …)` — so node-imap emits `UID SEARCH UID 12,13,14`. After the loop, if headerInfos.length !== batch.length push an error naming the missing UIDs so scripts/ingest-emails.ts exits 1 via failuresFrom. Add an adapter test for imapSimpleMailbox with a fake imap-simple connection asserting one search criterion per UID (the current code fails it — this is the RED; the existing FakeMailbox in ingest-gate.test.ts never exercises the adapter). Print `fetched` in the fetchEmails summary (lines 619-629).

**Evidence.**
- `src/ingest/email-ingestion.ts:432` — const messages = await connection.search([['UID', uids.join(',')]], {
- `node_modules/imap/lib/Connection.js:1807-1833 (validateUIDList), :44 (RE_NUM_RANGE), :1966-1973` — RE_NUM_RANGE.test(uids[i])) continue; intval = parseInt(''+uids[i], 10); ... uids[i] = intval; — RE_NUM_RANGE requires a ':' so '12,13,14' becomes 12
- `src/ingest/email-ingestion.ts:340-346` — result.fetched = batch.length; log(📧 Found ${unseen.length} unread emails (examining ${batch.length}, ...); const headerInfos = await client.fetchHeaders(batch);
- `logs/pipeline-2026-10-05.log:20-25 (same pattern 09-27: 10→1, 10-06: 20→1)` — 📧 Found 21 unread emails (examining 21, deferring 0) ... 0 emails saved for parsing / 1 emails skipped (already processed) / 0 rejected

*Reported by:* ingest-newsletters.

### Q03 [high] Whitelist match is first-match substring and filter-athens-only overwrites venue_name in place

**Claim.** findVenueConfig returns the first registry entry matching exactly or by substring (≥5 chars, 40% rule) in file order, and filter-athens-only.ts writes that canonical over venue_name; a colliding registry entry silently relabels rows to the wrong building and the scraped string is lost. The registry has 29 normalized-key collisions and 87 cross-venue substring hazards.

**Impact.** At least 9 of 48 queued venue concerns are this class (Bios/Romantso x3, Άλσος Νέας Σμύρνης→Pedion Areos, Gustav→Gustav Athens, Ράδιο↔Radio, two Ολύμπια rows, Φιλίπ); each ships a wrong address, neighborhood, venue page and Schema.org Place. The original string cannot be recovered for forensics, and location-filter, venue-registry, athens-filter and canonicalizeVenue resolve the same collision differently.

**Recommendation.** Stop rewriting venue_name: keep the scraped string (or move it to venue_raw) and add events.venue_key TEXT + venue_match_method TEXT set at save via one shared matcher (src/ticketing/venue-registry.ts getVenueByName, exact normalized key only). Add a loader-time test that fails when two registry entries share a normalized canonical/variation key, then fix the current 29 (merge or delete Bios/Romantso/Gustav/Live Music Space/Ολύμπια duplicates; make hall entries sub-venues of a parent). Drop the substring rules from findVenueConfig or restrict them to an explicit per-entry aliases_substring list. Have location-filter, duplicate-detector and database.ts import the same matcher.

**Evidence.**
- `src/quality/location-filter.ts:177-199` — if (normalizedVenue === canonicalNorm) return venueConfig; if (canonicalNorm.length >= MIN_SUBSTRING_MATCH_LENGTH) { if (normalizedVenue.includes(canonicalNorm)) return venueConfig;
- `scripts/filter-athens-only.ts:229-233,270-272` — UPDATE events SET location_status = ?, venue_name = COALESCE(?, venue_name) WHERE id = ? ... updateWithVenueStmt.run(result.status, result.matched_venue, event.id);
- `config/athens-venues.json:298-308 (index 27) vs :2374-2384 (indices 298, 299); rows d7a85542649321b8, 1113fa7877f5243a, f8fa4bdea31b6d2f` — "canonical_name": "Bios Ρομάντσο", "variations": ["Bios","BIOS","Romantso",...] — later "Romantso" (Omonoia) and "Bios" (Gazi) entries are unreachable
- `scratchpad/registry_quality.ts and orphans.ts output over 604 upcoming shown rows` — normalized key collisions between distinct venues: 29; cross-venue substring hazards: 87; { total: 604, exactHit: 604, substrHit: 0 } — scraped string is gone

*Reported by:* save-seam-quality.

### Q04 [high] No ingest-time city gate; post-save blacklist is Greece-only, substring-based and ordered before the whitelist

**Claim.** Athens membership is decided only after the row is in events, by a substring scan of title/description/venue against Greek city names; it misses foreign cities, deletes Attica events whose title names an origin in the genitive, and the ticketservices area pre-filter is a substring test on a pipe-joined list.

**Impact.** Two foreign events are live as Athens events; ~145 ticketservices and ~187 cometogether rows per quarter are written, dedup-grouped, id-minted and then deleted; genuine Attica events (Lavrio, Ήβη) are deleted every scrape day they reappear. Because the blacklist runs before the whitelist, a whitelisted Athens venue is deleted whenever its description mentions another city.

**Recommendation.** In saveEvents, after capturing venue_city/venue_country (Q01), reject when venue_country != 'GR' or venue_city is known and outside an Attica allowlist (reuse config/athens-venues.json neighborhoods plus a municipalities list), writing to rejected_events with raw_data and never inserting. In checkLocation run the whitelist before the blacklist for venue/address fields, scan title only with titleNamesCity (word-boundary, nominative), and stop scanning description. Fix the ticketservices pre-filter to `areaIds.split('|').includes('1')` and emit one row per (date, venue) pair instead of the joined list. The substring-on-'1' leak is inferred from the archived pipe format plus the rejected rows; confirm against a live listing.

**Evidence.**
- `src/quality/location-filter.ts:207-214,257-262` — containsAny: if (normalizedText.includes(normalize(term))) return term; ... 'the genitive names an origin ("Κρατική Ορχήστρα Θεσσαλονίκης" plays Athens)'
- `sqlite3 -readonly rows 8406db69feb81b33 and 6379dca39846c268` — cometogether @@ verified_athens @@ Gustav Athens @@ 2026-11-27 @@ Musketeer - Swedish Church - HAMBURG ; onassis @@ verified_athens @@ ONX.Exhibition.NY.2026
- `scripts/scrape-all.ts:914-915 vs scripts/_archive/scrape-ticketservices.ts:47,162; rejected_events source='ticketservices' since 2026-08-01` — if (!areaIds.includes('1')) continue; — archived: areaIds.split('|')[0]; rejected: HERAKLEION|Chania|Σούδα 18 rows, ΠΑΤΡΑ|CHANIA|ΛΑΡΙΣΑ 10+8+6+3 rows
- `sqlite3 -readonly rejected_events (title LIKE '%Κρήτης%'); specs/s140-scraper-hygiene-followups.md:59,107` — athinorama.gr @@ Τεχνολογικό Πολιτιστικό Πάρκο Λαυρίου / Ήβη @@ Νίκος Ξυλούρης - Ο αρχάγγελος της Κρήτης — deleted on 10 separate days; city gate 'not implemented'

*Reported by:* save-seam-quality.

### Q05 [high] Single-venue scrapers hardcode the parent venue and verified_athens at scrape time

**Claim.** The onassis, megaron and halfnote scrapers stamp a fixed venue_name and location_status='verified_athens' on every row regardless of hall, satellite site or off-site programme, so sub-venues and non-Athens programmes are published under the parent building.

**Impact.** 13 of 48 queued venue concerns are this class (Onassis x5 including a New York exhibition still shown, Megaron x3, Gazarte stage, Κύτταρο/An Club split, Temple/Black Temple, Σταυρός του Νότου x2). Readers are sent to Syngrou 107 for events in Rentis or Plaka; Megaron off-site concerts in North Evia are verified_athens until the title happens to name the region.

**Recommendation.** Remove the hardcoded location_status from all adapters (leave 'unverified'; filter-athens-only already classifies the window daily) or set it only when the parsed location equals the parent. Parse the location/hall field on each card (inspect the onassis card markup for the venue label the detail page shows as 'Onassis Ready'/'Μάντρα'; megaron detail pages name the hall) into venue_raw/venue_key, and model halls as sub-venues (parent key + hall) rather than separate registry rows that lose to the parent's substring match.

**Evidence.**
- `scripts/scrape-onassis.ts:212 and scripts/scrape-all.ts:1627-1633` — venue_name: 'Onassis Stegi', ... venue_name: e.venue_name || 'Onassis Stegi', ... source: 'onassis', location_status: 'verified_athens'
- `scripts/scrape-megaron.ts:146, scripts/scrape-all.ts:1672-1678 and :1128-1134 (halfnote)` — venue_name: 'Μέγαρο Μουσικής Αθηνών', ... location_status: 'verified_athens' ; venue_name: 'Half Note Jazz Club', ... location_status: 'verified_athens'
- `docs/DECISIONS-QUEUE.md:30,32,39,42,44 and :26,37,38` — DB venue is 'Onassis Stegi' but ... Onassis Ready (Agios Ioannis Rentis) / Onassis Mandra, Plaka / Cavafy Archive / Onassis ONX, 390 Broadway, New York
- `sqlite3 -readonly rejected_events source='megaron.gr' since 2026-06-01; scripts/scrape-onassis.ts:172-181` — 16 rows 'Το Μέγαρο στη Βόρεια Εύβοια – Φεστιβάλ της Λίμνης …' saved as verified_athens, rejected only because title contains "Εύβοια"; no location element read

*Reported by:* save-seam-quality.

### Q06 [high] Athinorama event pages expose merchant ticket URLs in JSON-LD that the scraper never reads

**Claim.** athinorama.gr event pages carry schema.org JSON-LD whose offers.url is the real merchant checkout (more.com), but scrapeAthinorama fetches every detail page only for prices/times/images and never reads it, and src/ticketing/resolver.ts hard-excludes athinorama on a 2026-04-24 premise the probe shows is now false (n=1 page sampled, curl 2026-10-06).

**Impact.** 227 of 604 upcoming shown rows (37.6%) come from athinorama; 191 of them send users to an editorial page with no checkout instead of the merchant page athinorama itself links. Ticket CTA quality for the single largest source is structurally wrong, and the fix needs zero additional HTTP requests because the pages are already downloaded daily.

**Recommendation.** In scrapeAthinorama() detail loop (scripts/scrape-all.ts after line 703) parse the <script type="application/ld+json"> block and, when offers.url host is in config/ticket-source-classification.json known_merchants (more.com, viva.gr, ticketservices.gr, ra.co, megaron.gr, onassis.org), set event.ticket_url = offers.url and ticket_url_status = 'direct' (fall back to the first href on those hosts). Remove the athinorama exclusion in src/ticketing/resolver.ts SOURCES_WITH_OUTBOUND_LINKS and update the 2026-04-24 comment. Verify the JSON-LD shape on a sample of /music/gig/ pages first (only one /theatre/performance/ page was sampled). The validate-ticket-urls --generate copy behaviour is owned by the tickets bucket.

**Evidence.**
- `curl https://www.athinorama.gr/theatre/performance/mcneal-10091042/ (HTTP 200, 2026-10-06) — JSON-LD block` — "@type": "TheaterEvent" ... "offers": {"@type": "Offer", "url": "https://www.more.com/theater/mcneal", "availability": "http://schema.org/InStock"}
- `src/ticketing/resolver.ts:144-147` — Athinorama deliberately excluded — 2026-04-24 investigation confirmed its detail pages contain no more.com / viva / ticketservices outbound links.
- `scripts/scrape-all.ts:703` — const eventHtml = await fetchWithRetryAthinorama(event.url, 2);
- `sqlite3 -readonly upcoming shown, source='athinorama.gr' (n | with_ticket | generated | null ticket_url; ticket_url = url)` — athinorama.gr|227|227|209|12 ; rows whose ticket_url equals the editorial listing URL: 191

*Reported by:* source-landscape.

### Q07 [high] Exhibition/museum coverage is effectively empty and the Benaki scraper's hardcoded fallback masks it

**Claim.** The site has 2 upcoming exhibitions with an end date DB-wide (Onassis 1, SNFCC 1). scripts/scrape-benaki.ts returns four hardcoded 2025-26 exhibitions whenever the live fetch fails, so it has reported exactly 4 events on all 52 runs since 2026-08-01 and never surfaces as dead. EMST, Cycladic and Acropolis museums are whitelisted with websites but no source feeds them.

**Impact.** An 'AI-curated cultural events calendar' shows 4 exhibition rows out of 604 upcoming (0.7%), none from a museum. Benaki has produced zero real rows for months while counting as healthy in scrape_stats and health-check, so the outage is invisible to yield monitoring; the fabricated fallback rows carry end_dates already in the past.

**Recommendation.** (a) Delete the hardcoded fallback block in scripts/scrape-benaki.ts (lines 188-245) so a failed fetch returns [] and trips the yield canary. (b) Add a museum feed scraper: for cycladic.gr enumerate the WordPress REST API (discover the custom post types behind /en/ektheseis/ and /en/draseis/ from /wp-json/; type names unverified) and map to type='exhibition' with end_date; probe emst.gr/en and theacropolismuseum.gr for the same pattern before coding (the EMST probe returned 301 only). (c) Add a yield-canary rule flagging any source whose events_found is identical for more than N consecutive runs.

**Evidence.**
- `sqlite3 -readonly data/events.db (type='exhibition' AND end_date >= date('now') AND shown)` — onassis|Onassis Stegi|1 ; snfcc|ΚΠΙΣΝ|1
- `scripts/scrape-benaki.ts:188-190 and end_date literals at :197,:208,:219,:230` — // If no exhibitions found from scraping, add known exhibitions from research  if (exhibitions.length === 0) { ... end_date: '2026-03-29' ... '2026-05-24' ... '2026-04-26'
- `logs/pipeline-2026-10-05.log:796-801; sqlite3 scrape_stats since 2026-08-01 (source|runs|zero_runs|min|max|avg|success0)` — blocked browser request to https://www.benaki.org/... ; [benaki] Adding known exhibitions from research ... ✅ 4 events in 0.2s ; benaki|52|0|4|4|4.0|0
- `config/athens-venues.json (venues carrying website); curl https://cycladic.gr/en/ (HTTP 200, 2026-10-06)` — EMST https://www.emst.gr ; Museum of Cycladic Art https://cycladic.gr ; Acropolis Museum — cycladic.gr: generator WPML 5.1.0, wp-json/wp/v2 exposed, /en/ektheseis/ /en/draseis/

*Reported by:* source-landscape.

### Q08 [high] No import step exists: the newsletter channel has never written an event to events.db

**Claim.** The parse script's declared next step, scripts/import-newsletter-events.ts, does not exist; nothing reads data/parsed/newsletter-events.json into the DB. processed_emails rows stay at status 'processing' with event_count 0 for all 298 rows, no events.source is a newsletter id, and the parsers reuse scraper ids ('snfcc', 'megaron.gr'), so an importer would erase provenance.

**Impact.** The entire ingest→parse chain (IMAP relay, DKIM gate, 302 saved files, a parse phase in every run, a container job holding the mailbox credential) feeds a JSON file nobody consumes: 100% of the channel's output is discarded; the 09-25 host run's 153 'unique events saved' and the committed 131-event file were never imported. With current source ids an importer would mask per-source yield canaries and ticket-trust rules.

**Recommendation.** Decide explicitly in docs/DECISIONS-QUEUE.md between retire and revive. Retire (default, given Q16): remove run_ingest/run_parse from scripts/daily-automated.sh, the ingest job and IMAP relay from docker/aa-run.sh + docker/compose.yaml, scripts/ingest-emails.ts, scripts/parse-newsletter-emails.ts and the mailbox credential in docker.env; keep src/ingest/* only if a revival is scheduled. Revive: write scripts/import-newsletter-events.ts mapping RawEvent → Event through src/db/database.ts upsertEvent (per specs/session-C-email-ingestion.md), advance processed_emails via markEmailProcessed/event_count, write distinct ids ('newsletter-snfcc', 'newsletter-megaron') in the parser modules and register them in src/ticketing/ticket-trust.ts SOURCE_BASE_URLS (tests/security/ticket-trust-all-sources.test.ts will fail until then), and wire it after run_parse.

**Evidence.**
- `scripts/parse-newsletter-emails.ts:10 and :404; shell: ls scripts/import-newsletter-events.ts` — * 4. Import using: bun run scripts/import-newsletter-events.ts — ls: scripts/import-newsletter-events.ts: No such file or directory
- `sqlite3 -readonly processed_emails (status, SUM(event_count), COUNT, MAX(processed_at)); events GROUP BY source` — processing|298 ; 0|298|2026-09-25T05:00:10.687Z ; no lifo-guide, this-is-athens or sender-address source among events.source values
- `src/ingest/email-ingestion.ts:569-573; specs/session-C-email-ingestion.md:1-3` — // DEAD CODE — schema divergence ... throw new Error('email ingestion: date/time schema deprecated; pending Session C unification'); spec **Status:** Deferred.
- `src/ingest/newsletter-formats/snfcc.ts:174 vs scripts/scrape-snfcc.ts:373; scripts/parse-newsletter-emails.ts:222 vs scripts/scrape-megaron.ts:179` — source: 'snfcc' (both) ; source: 'megaron.gr' (both) — newsletter rows would be indistinguishable from scraper rows in scrape_stats, canary and ticket-trust

*Reported by:* ingest-newsletters.

### Q09 [high] 302 legacy email files are permanently unparseable and rescanned every run

**Claim.** All 302 saved email files predate the DKIM gate: none contains authenticatedSenderDomain, the only marker isAuthenticatedEmailRecord accepts, and it cannot be retrofitted because the saved JSON holds no Authentication-Results header. The parse script re-reads all 302 files (52 MB) every run and emits 302 'Skipped' lines; nothing purges, moves or marks them.

**Impact.** Each run spends its parse phase on 52 MB of files that can never pass, produces ~600 lines of log noise that bury the real email-phase counters, and 'Found 302 email files' misleads operators into believing there is a backlog to process. The pre-gate files are the only copies of ~12 months of newsletters and are useless to the gated parser by construction.

**Recommendation.** Delete data/emails-to-parse/* (already gitignored since 5521e0936; nothing reads them) or move them to data/emails-to-parse/legacy-pre-gate/ and have processEmails() read only top-level files. In scripts/parse-newsletter-emails.ts stop logging one line per skipped file (log a single count) and read only files not yet recorded as parsed (join on processed_emails.raw_path / status) so the parse phase is incremental. If the channel is retired (Q08), delete the directory outright.

**Evidence.**
- `shell: grep -l authenticatedSenderDomain data/emails-to-parse/*.json | wc -l; keys of a 2026-09-24 file` — 0 (of 302 files; directory is 52M; newest file 2026-09-24) — keys: ['messageId', 'subject', 'from', 'date', 'text', 'html']
- `src/ingest/allowed-senders.ts:200-204` — export function isAuthenticatedEmailRecord(record: unknown): boolean { ... return typeof d === 'string' && ALLOWED_SENDER_DOMAINS.includes(d); }
- `scripts/parse-newsletter-emails.ts:313-342` — if (!isAuthenticatedEmailRecord(email)) { emailsUnauthenticated++; console.log('   ⏭️  Skipped: not marked as from an authenticated allowlisted sender'); continue; }
- `logs/pipeline-2026-10-05.log:44, :653-654; grep -c 'Skipped: not marked'` — 📧 Found 302 email files ... 📧 0 emails processed / 🚫 302 email files skipped — 302 'Skipped' + 302 'Processing:' lines ≈ 19% of 3232 log lines

*Reported by:* ingest-newsletters.

### Q10 [medium] Title-keyed event ids for 8 of 10 sources; ON CONFLICT never updates venue, date or location_status

**Claim.** Only athinorama (URL slug) and cometogether (source id) mint stable ids; more, ticketservices, halfnote, RA, snfcc, onassis, benaki and megaron hash title|date|venue even where the source exposes a numeric id, and the ON CONFLICT branch omits venue_name, start_date and location_status, so a venue correction at source mints a duplicate (title-keyed) or is ignored (stable-id).

**Impact.** A venue correction or relocation at source (Κύτταρο→An Club 5aedcc8dfe1e6adf, Aux Club/Universe b8d881a716b52c6b) never reaches an athinorama or cometogether row, and for title-keyed sources produces a second row the import gate must catch by title similarity (48 '[import-gate] Skipping duplicate' lines on 2026-09-25). Series semantics differ by source (one row per production vs per date), defeating cross-source dedup by date.

**Recommendation.** Add events.source_event_id TEXT and mint id = md5(`${source}:${source_event_id}` [+ `:${date}` for per-date sources]) from RA event.id, ticketservices data-eventid, more.com event path, megaron/onassis/benaki event URL path, snfcc item id; keep the title hash only as fallback. Extend ON CONFLICT to update venue_name/venue_key/venue_raw/start_date (record venue_changed_at when venue_key differs). Collapse the four generateEventId implementations into src/utils/event-id.ts. Decide one series model (production row + occurrence dates, or one row per date) and apply it to all sources.

**Evidence.**
- `scripts/scrape-all.ts:107-110` — export function generateEventId(title: string, date: string, venue: string): string { const normalized = ${title.toLowerCase().trim()}|${date}|${venue.toLowerCase().trim()}; md5
- `scripts/scrape-all.ts:932,940 (ticketservices) and :1163,1230 (RA)` — id: generateEventId(e.title, date, e.venue) — e.id=data-eventid used only in the URL; id: generateEventId(e.title, date, e.venue.name) — e.id available, unused
- `scripts/scrape-all.ts:1464-1477 (ON CONFLICT)` — ON CONFLICT(id) DO UPDATE SET title, url, type, end_date, price_type, price_amount, price_range, time_doors, time_source, image_url, ticket_url_status, updated_at — venue_name, start_date absent
- `scripts/scrape-megaron.ts:29, scrape-onassis.ts:57, scrape-benaki.ts:59, src/ingest/email-ingestion.ts:524; specs/event-id-stability-audit-2026-05-15.md:40-106` — generateEventId(title, startDate) (2-param md5) / generateEventId(title, date, venue) (sha256) — three id contracts still live

*Reported by:* save-seam-quality.

### Q11 [medium] Addresses on shown rows come from a name-keyed post-hoc geo backfill with wrong or garbled master entries

**Claim.** No source address is captured at ingest; venue_address/lat/lng on every shown row are written daily by backfill-venue-geo.ts from data/venues-master.json via accent-stripped name matching, and that file contains wrong and truncated addresses that get stamped on every row sharing the venue_name.

**Impact.** Wrong street addresses and neighborhoods render on event pages, venue pages and Schema.org Place for every event at ARCH Club, Φιλίπ, Κύτταρο and others; the S140 clubber address-in-name bug was whitelisted verbatim (9 canonicals, 21 variations); 206/356 registry entries have no address, so the address-guard warning (database.ts:313-321) stays silent only because the backfill paints something in.

**Recommendation.** Capture the source address/city/geo at ingest (Q01) into venue_address_src and prefer it over the master backfill; add venue_address_source TEXT ('source'|'registry'|'geocode') and let scripts/backfill-venue-geo.ts write only when geocodeConfidence is high and the venue_key matches exactly (drop the accent-stripped layer). Clean config/athens-venues.json: split the 9 address-in-name canonicals and 21 variations into name + address fields, fill address for the shown venues, and reconcile the venues-master.json entries flagged in docs/DECISIONS-QUEUE.md.

**Evidence.**
- `scripts/backfill-venue-geo.ts:5-9,184-204; scripts/daily-automated.sh:569-580` — Layer 3: Accent-stripped — normalizeGreek(DB name) === normalizeGreek(master key) ... UPDATE events SET venue_lat = ?, venue_lng = ?, venue_address = CASE ... WHERE venue_name = ?
- `data/venues-master.json:1768-1774, 1643-1649, 997-1003, 2008-2015` — "ARCH Club": "Konstantinoupoleos Ave. 111" / "Φιλίπ": "Thasou 11, Athens 162 31", "Vyronas" / "Κύτταρο": "Αχαρνών, Ipeirou και" / "Circus Entertainment Hub": "Empedokleous 60-62"
- `docs/DECISIONS-QUEUE.md:24,25,48` — fabricated-looking Pangrati address (Empedokleous 60-62) / 'Konstantinoupoleos Ave. 111' but ... ARCH Club - Live Stage at Petrou Ralli 29 / Thasou 11 & Drosopoulou, Kypseli
- `scratchpad/registry_quality.ts output over config/athens-venues.json; sqlite3 address coverage` — venues 356; address 150; neighborhood=Unknown: 68; canonical_name carries a street address/postcode/'Greece': 9; address-shaped variations: 21; Temple → 'Temple, Ιάκχου'

*Reported by:* save-seam-quality.

### Q12 [medium] Two divergent Athens filters are live: upsertEvent uses a hardcoded blacklist with an assume-Athens default

**Claim.** src/db/database.ts upsertEvent gates on src/utils/athens-filter.ts, which carries its own hardcoded city list, bidirectional substring whitelist matching with no minimum length, and returns true for unknown venues, while the daily pipeline uses src/quality/location-filter.ts with config/rejected-locations.json; the two lists disagree.

**Impact.** Rows written through email ingestion or the standalone scrapers are judged by a different rule set than the daily scrape path; a venue string of one or two characters matches everything via the reverse-contains rule, and unknown venues default to Athens, so an event in Serres is accepted where the daily path would reject it.

**Recommendation.** Delete src/utils/athens-filter.ts and have src/db/database.ts import isAthensEvent/checkLocation from src/quality/location-filter.ts (already exported at :492-495), so one matcher and one config govern every write path; add a test asserting that the config city list is the only blacklist source.

**Evidence.**
- `src/db/database.ts:7,301` — import { isAthensEvent } from "../utils/athens-filter"; ... if (!isAthensEvent({ venue_name: event.venue.name, venue_address: event.venue.address, title: event.title })) {
- `src/utils/athens-filter.ts:69-145,155-168,267-269` — const NON_ATHENS_CITIES = [ 'Θεσσαλον', ... 'Λαμία', ...]; if (lowerVenue.includes(lowerWhitelisted)) return true; if (lowerWhitelisted.includes(lowerVenue)) return true; ... return true;
- `config/rejected-locations.json:5-128 vs src/utils/athens-filter.ts` — config has Σέρρες, Αλεξανδρούπολη, Τρίκαλα, Σαντορίνη, Κύπρος, Επίδαυρος, Λιβαδειά absent from athens-filter.ts; athens-filter.ts has Λαμία, Νοησις, Μονή Λαζαριστών absent from config
- `grep upsertEvent callers` — src/ingest/email-ingestion.ts, scripts/import-all-events.ts, scripts/scrape-megaron.ts, scripts/scrape-onassis.ts, scripts/scrape-benaki.ts, scripts/migrate-venue-address-backfill.ts

*Reported by:* save-seam-quality.

### Q13 [medium] more.com scraper self-caps at 40 events/run while more.com declares a sitemap and an events API namespace

**Claim.** scrapeMore() scrapes only the music and theatre listing pages and stops after 20 events per category, so the dominant Greek merchant contributes at most 40 rows per run (avg 30.2 over 52 runs), while more.com's robots.txt declares a sitemap (googlesitemap.xml) and an /_api/events/ namespace the project never uses. Sitemap content and API shape are unverified.

**Impact.** The merchant that sells most Athens tickets supplies 38 of 604 upcoming shown rows (6%). Venues such as Gazarte, Fuzz, Floyd, Technopolis and Christmas Theater are reached mainly through this capped path or through athinorama's editorial pages, so most of more.com's inventory never enters the DB.

**Recommendation.** Replace the listing-page discovery in scrapeMore() (scripts/scrape-all.ts:247-276) with sitemap-driven discovery: fetch https://www.more.com/googlesitemap.xml (verify whether it is an index or a flat urlset), filter /gr-el/tickets/(music|theatre|dance|happenings)/ URLs, and process new/changed URLs incrementally (persist seen URLs with lastmod) instead of 20 per category. Do not call /_api/events/* paths without first confirming terms; only the three disallowed sub-paths are known. The silent fetchWithCurl() failure (success=1 with 0 events) is owned by the infra-alerting bucket.

**Evidence.**
- `scripts/scrape-all.ts:247 and :276` — const categories = ['music', 'theatre']; ... if (count >= 20) break;
- `sqlite3 -readonly scrape_stats since 2026-08-01 (source|runs|zero_runs|min|max|avg|success0)` — more|52|7|0|40|30.2|0
- `curl https://www.more.com/robots.txt (HTTP 200, 2026-10-06) lines 28-32 and 298` — Disallow: /_api/events/media ... Disallow: /_api/events/eventgroups / Disallow: /_api/events/settings ... Sitemap: https://www.more.com/googlesitemap.xml

*Reported by:* source-landscape.

### Q14 [medium] Greek National Opera and other ticketservices-sold organisers reach the site only via athinorama

**Claim.** nationalopera.gr sells through ticketservices.gr (six distinct ticketservices.gr/event/gno-* links on its homepage) and more.com, but scrapeTicketServices() fetches only /en/LiveConcerts/, so GNO exists only as athinorama rows (5 upcoming, listing-page ticket_url). 59 venues / 121 upcoming shown rows (20%) have athinorama as sole source. Additional ticketservices listing paths are unverified.

**Impact.** The national opera company (season Oct 2026–Jul 2027 per nationalopera.gr news, unverified) appears as a handful of editorial rows with no checkout link, and one fifth of shown rows depend on a single regex-scraped aggregator; if athinorama changes markup, those 121 rows and the GNO vanish together.

**Recommendation.** Extend scrapeTicketServices() to iterate the other ticketservices.gr category listings (the LiveConcerts page uses stable data-eventid/data-dates/data-areaids/data-venues attributes; confirm the sibling listing URLs from the site navigation before hardcoding them) and add a GNO pass following the ticketservices.gr/event/gno-* links. Treat ticketservices.gr as the merchant mirror for GNO and SNFCC-hosted productions. Add Εθνική Λυρική Σκηνή to config/athens-venues.json with a ticketing block pointing at ticketservices.gr so resolver tier 2 can at least produce a venue_registry_search link.

**Evidence.**
- `scripts/scrape-all.ts:896` — const response = await safeFetchResponse('https://www.ticketservices.gr/en/LiveConcerts/', {
- `curl https://www.nationalopera.gr/en/ (HTTP 200, 2026-10-06)` — generator: Joomla! ... https://www.ticketservices.gr/event/gno-2627-orfeas/?lang=en, .../gno-2626-to-aidoni-tou-aftokratora/ ... distinct ticketservices.gr/event/ links: 6
- `sqlite3 -readonly upcoming shown venues served only by athinorama.gr` — Εθνική Λυρική Σκηνή|5 ... Πειραιώς 260|4 ... Δημοτικό Θέατρο Λυκαβηττού|3 ... Εθνικό Θέατρο|2 ... Θέατρο Παλλάς|2 ; total 59 venues | 121 rows
- `config/ticket-source-classification.json` — "known_merchants": ["more.com", "megaron.gr", "ticketservices.gr", "ra.co", "viva.gr", "onassis.org"]

*Reported by:* source-landscape.

### Q15 [medium] Newsletter zero yield is silent: no fetched/unaccounted line, non-fatal exit, no monitor

**Claim.** The ingest summary prints saved/skipped/rejected but never fetched or an unaccounted count; scripts/ingest-emails.ts exits 1 only on result.errors; daily-automated.sh treats ingest failure as non-fatal; and health-check.ts, yield-canary.ts and session-diagnostic.sh never look at processed_emails or newsletter output. Three runs that saved 0 of 10/21/20 messages logged 'completed successfully'.

**Impact.** The channel has been at zero yield since at least 2026-09-27 (and at zero imported yield forever) without any alert; it was noticed only by this audit. The same blind spot would hide a future DKIM-alignment rejection wave, since rejection reasons are logged only when rejected > 0, which has never happened. Stale operator text (ingest-emails.ts:49,63) names a non-existent archive step and script.

**Recommendation.** In fetchEmails (src/ingest/email-ingestion.ts) print `fetched` and `unaccounted = fetched − (saved+skipped+rejected+errors.length)` and push an error when unaccounted > 0 so failuresFrom exits 1. Write per-run counters (fetched/saved/skipped/rejected/deferred/unaccounted) to scrape_stats or a newsletter row in data/scoreboard.json so scripts/yield-canary.ts can apply its drop-to-zero rule to the channel. Fix the stale operator text at scripts/ingest-emails.ts:49 and :63. If the channel is retired (Q08), delete rather than instrument.

**Evidence.**
- `src/ingest/email-ingestion.ts:619-629` — console.log(   📧 ${result.saved} emails saved for parsing); ... ${result.skipped} emails skipped ... ${result.rejected} emails rejected — fetched never printed
- `scripts/ingest-emails.ts:22-26` — return result.errors.length > 0 ? ${result.errors.length} of ${result.fetched} email(s) failed to ingest : null;
- `scripts/daily-automated.sh:224-227` — if bun run scripts/ingest-emails.ts >> "$LOG_FILE" 2>&1; then log "Email ingestion completed" else log_error "Email ingestion failed (non-fatal, continuing...)"
- `grep -c -i 'processed_emails|emails-to-parse|newsletter' scripts/health-check.ts scripts/yield-canary.ts scripts/session-diagnostic.sh; logs/pipeline-2026-10-05.log:28` — 0 / 0 / 0 ; ✅ Email ingestion completed successfully

*Reported by:* ingest-newsletters.

### Q16 [medium] Newsletter parser coverage gap: pipeline bypasses the registry, parsers yield nothing usable, 6 of 10 formats have no module and no mail

**Claim.** scripts/parse-newsletter-emails.ts bypasses the NewsletterFormatRegistry (email-parser.ts is reached only by tests) and uses its own parseMegaronJazz/regex fallback. Run read-only over real mail, lifo-guide yields 0 from 240 LiFO mails, snfcc 14 junk-titled events from 22, megaron 130 from 30 (duplicating the scraper); six registry ids point at parser files that do not exist and senders that never mailed.

**Impact.** Even with Q02/Q08/Q09 fixed, the channel would add ~17 future-dated Megaron events (already scraped) and ~2 dubious SNFCC events per year of mail; 79% of volume (LiFO) yields nothing. Six D.O.G.S has 0 upcoming rows and Gazarte's 15 come from more.com/athinorama/RA, so the config's implied back-fill of scraper outages is false; seven allowlisted domains have never sent mail.

**Recommendation.** If retiring (recommended): remove config/newsletter-formats.json, src/ingest/newsletter-formats/*, src/ingest/email-parser.ts and their tests with the channel, and trim SOURCE_BASE_URLS in src/ticketing/ticket-trust.ts:119-136 of 'megaron', 'lifo-guide', 'this-is-athens'. If reviving: scope to megaron (fallback only when scripts/scrape-megaron.ts yields 0) and snfcc (fix its title selection first); have scripts/parse-newsletter-emails.ts call parseEmail() from src/ingest/email-parser.ts instead of its regex parser; set enabled:false on the eight formats with no module or no mail; fix parseLifoHtml against a real 'Τι να κάνεις αυτό το ΣΚ' file or drop lifo.gr from the allowlist. Prefer the structured feeds in Q17 over email for Gazarte and SNFCC.

**Evidence.**
- `scripts/parse-newsletter-emails.ts:286-298; grep -rn 'email-parser' src scripts (excluding __tests__)` — if (email.from.includes('megaron.gr') || ...) return parseMegaronJazz(email); ... return parseGenericNewsletter(email); — email-parser: no matches outside tests
- `config/newsletter-formats.json:52,67,82,97,128,164 vs ls src/ingest/newsletter-formats/` — "parserModule": "./athinorama" / "./viva-gr" / "./more-com" / "./gazarte" / "./six-dogs" / "./aaathens-art" — only lifo-guide, megaron, snfcc, this-is-athens exist
- `sender domains across 302 saved files; scratchpad read-only parser probe over data/emails-to-parse` — 240 lifo.gr / 30 megaron.gr / 22 snfcc.org / 1 clubber.gr; lifo-guide events=0; snfcc events=14 ('Χορηγός: METAXA | 2025-01-07'); megaron events=130
- `src/ingest/newsletter-formats/lifo-guide.ts:84-90; 2026-09 LiFO subjects; logs/pipeline-2026-10-05.log:366-612` — /<div class="section"[^>]*data-category="([^"]+)"/ — real subjects: 'ΠΑΣΟΚ: Φτάνει πια…', 'Τι να κάνεις αυτό το ΣΚ!'; only LifO 'Portraits' files processed

*Reported by:* ingest-newsletters, source-landscape.

### Q17 [low] Verified feed inventory for current and candidate sources

**Claim.** Probed sources expose machine-readable surfaces the project does not use: athinorama.gr JSON-LD per event page, more.com sitemap, aefestival.gr WordPress RSS/REST, cycladic.gr WordPress REST, culturenow.gr and elculture.gr RSS. Verified blocked or feed-less: snfcc.org (Akamai 403), onassis.org (API-backed 404), nationalopera.gr (Joomla, no feed). Redirect-only, unverified: athens-technopolis.gr, gazarte.gr, emst.gr.

**Impact.** Gives the orchestrator a verified map of which surfaces can replace regex HTML scraping (JSON-LD, sitemap, WordPress REST/RSS) and which sources must keep a headless browser (SNFCC) or an undocumented API (RA). culturenow/elculture items are editorial articles, so they serve discovery and cross-reference rather than primary ingestion; aefestival.gr is seasonal and currently empty.

**Recommendation.** Add a small generic feed layer under src/ingest/ (RSS via a tolerant XML parser; WordPress REST pagination; a JSON-LD extraction helper) and register sources through it instead of one bespoke scraper per site. Use culturenow.gr and elculture.gr RSS as a nightly cross-reference signal for athinorama-only venues (title+venue Jaccard, as resolver tier 3b already does for more.com). Schedule aefestival.gr feed ingestion for spring 2027 when the programme is published. Keep SNFCC on Puppeteer or the r.jina.ai reader noted in memory; do not attempt onassis.org API endpoints without discovering them in-browser first.

**Evidence.**
- `curl https://aefestival.gr/?lang=en (HTTP 200, 2026-10-06)` — generator: WordPress 5.6.5 ... rss+xml href="https://aefestival.gr/feed/?lang=en" ... wp-json/wp/v2/pages/1207 ... ticket href: more.com/gr-en/tickets/happenings/festibal-athinon-epidaurou-2/
- `curl https://www.culturenow.gr/feed/ and https://www.elculture.gr/feed/ (HTTP 200, application/rss+xml)` — CultureNow.gr lastBuildDate Mon, 05 Oct 2026, sy:updatePeriod hourly, items: 10 ; ελculture – Θέατρο, Μουσική, Τέχνη & Πολιτισμός, items: 10, size 168853
- `curl https://www.snfcc.org/robots.txt ; https://www.onassis.org/robots.txt` — HTTP 403 <TITLE>Access Denied</TITLE> errors.edgesuite.net ; HTTP 404 application/json {"statusCode":404,"error":"Not Found"}
- `scripts/scrape-all.ts:1076, :1178, 1150-1160; config/quarantined-sources.json` — halfnote.gr/events/?ical=1 ; ra.co/graphql filters areas eq 549, pageSize 100 ; clubber: sgcaptcha wall since 2026-07-29, quarantined 2026-08-11

*Reported by:* source-landscape.

### Q18 [low] Odeon of Herodes Atticus (Ηρώδειο) is absent from the venue whitelist, so all its rows are hidden

**Claim.** The DB holds 17 athinorama rows at venue 'Ηρώδειο' (2 upcoming, latest 2027-06-22), all location_status 'unverified' and never shown; the name appears in neither config/athens-venues.json (the file location-filter.ts loads), data/venues-master.json nor config/rejected-locations.json.

**Impact.** The most recognisable Athens venue is invisible on the site whenever athinorama lists it; during the June–September festival season this hides dozens of Herodion concerts and AEF productions (17 rows in the past year). Off-season impact today is 2 rows.

**Recommendation.** Add 'Ηρώδειο' with variations ('Ωδείο Ηρώδου Αττικού', 'Herodion', 'Odeon of Herodes Atticus', 'Herod Atticus') to config/athens-venues.json via the pre-venue-check workflow, with a ticketing block pointing at ticketservices.gr (already mapped in config/ticketing-mapping.json). Re-run scripts/filter-athens-only.ts so the 17 rows flip to verified_athens.

**Evidence.**
- `sqlite3 -readonly data/events.db (venue_name LIKE '%Ηρώδ%' OR '%Herod%': source|status|count|upcoming|min|max)` — athinorama.gr|unverified|17|2|2026-06-03T21:00:00|2027-06-22
- `grep -c -i -E 'Ηρώδ|Herod|Ηρωδ' config/athens-venues.json data/venues-master.json config/rejected-locations.json` — config/athens-venues.json: 0 ; data/venues-master.json: 0 ; config/rejected-locations.json: 0
- `src/quality/location-filter.ts:124` — const athensPath = join(import.meta.dir, '../../config/athens-venues.json');
- `config/ticketing-mapping.json venue_to_platform` — "Ηρώδειο": {"platform": "ticketservices.gr", "url_pattern": "https://www.ticketservices.gr/en/LiveConcerts/", "notes": "Herod Atticus, Athens Epidaurus Festival"}

*Reported by:* source-landscape.

### S01 [critical] athinorama scraper discards available more.com ticket links; resolver excludes athinorama on a stale premise

**Claim.** The live music guide carries outbound more.com anchors on 40 of 106 cards and theatre detail pages carry more.com in JSON-LD offers.url, yet scrapeAthinorama extracts only title/venue/date, ScrapedEvent and the raw INSERT have no ticket_url field, and src/ticketing/resolver.ts hard-excludes athinorama on a 2026-04-24 premise the live HTML now contradicts.

**Impact.** For the largest source, ~179 of 215 shown upcoming rows have no merchant checkout URL (ticket_url equals the editorial listing) although a direct more.com link sat in the scraped HTML for 40 of 106 current gigs and for theatre runs; merchant rows that lose the import-gate duplicate contest to an athinorama row have their checkout URL discarded; athinorama events emit no offers.url.

**Recommendation.** (1) In scrapeAthinorama's card loop (scripts/scrape-all.ts ~629-686) capture the first merchant anchor matching /https?:\/\/(?:www\.)?(more\.com|viva\.gr|ticketservices\.gr)\/[^"'\s<>]+/i; add ticket_url?: string to ScrapedEvent; push ticket_url with ticket_url_status 'direct'. (2) In the detail-page pass (:703) parse JSON-LD offers.url and a.review-link[href*=more.com] for theatre rows. (3) Add ticket_url to the INSERT (:1456-1463) and ON CONFLICT (:1465-1478) as CASE WHEN $ticket_url IS NOT NULL THEN $ticket_url ELSE ticket_url END; keep tier1_fromScraper's athinorama-host rejection (resolver.ts:127). (4) Delete the stale exclusion comment (resolver.ts:146-148), add 'athinorama.gr' to SOURCES_WITH_OUTBOUND_LINKS, implement tier1b with the same regex. (5) In the import-gate skip branches (scrape-all.ts:1532-1551, src/db/database.ts:336-345) copy a skipped merchant row's url into the survivor as ticket_url status 'crossref'. (6) Pin with live-guide fixtures; mutation-run by removing the extraction.

**Evidence.**
- `live https://www.athinorama.gr/music/guide fetched 2026-10-06, parsed with the scraper's own card regex` — cards: 106, cardsWithMerchantLink: 40, merchantHosts: {www.more.com: 40}; <a href="https://www.more.com/music/the-charlatans2026" rel="nofollow">
- `live https://www.athinorama.gr/theatre/performance/theofilos_sold-10081522/ fetched 2026-10-06` — "offers":{"@type":"Offer","url":"https://www.more.com/theater/theofilos-sold-1"} and <a class="review-link" href="https://www.more.com/theater/theofilos-sold-1">
- `scripts/scrape-all.ts:70-87 (ScrapedEvent) and :1456-1463 (INSERT column list)` — interface ScrapedEvent { ... ticket_url_status?: string; } — no ticket_url; INSERT INTO events (id, title, ..., ticket_url_status, ...) — no ticket_url column
- `src/ticketing/resolver.ts:146-148, 152-155` — Athinorama deliberately excluded — 2026-04-24 investigation confirmed its detail pages contain no more.com ... links. SOURCES_WITH_OUTBOUND_LINKS = new Set([ ])

*Reported by:* source-athinorama.

### S02 [high] athinorama URL-slug identity never migrated: import gate freezes 196 legacy-id rows and ON CONFLICT never refreshes start_date/venue_name

**Claim.** Rows minted before 2026-08-11 keep legacy title|date|venue ids (196 of 215 shown upcoming athinorama rows). A re-scrape mints the slug id, which is new to the gate, matches the legacy row on same-day exact canonical title and is skipped, so the legacy row is never updated; even slug rows never get start_date or venue_name refreshed because ON CONFLICT omits them.

**Impact.** The shown athinorama population is frozen at or before 2026-08-11: 127 rows show no start time although the scraper finds times for ~95% of pages, venue transfers display the old venue (Θεόφιλος Sold), postponed dates cannot propagate, and ~30 fresh athinorama rows per run are discarded as duplicates of their own stale copy.

**Recommendation.** (1) One-time rekey script (scripts/rekey-athinorama-ids.ts, snapshot first): for every athinorama.gr row with a numeric url slug compute generateAthinoramaId(url); if no row has that id, UPDATE id (cascading event_concerns/dedup tables); otherwise merge the legacy row into it via merged_into, keeping enrichment fields. (2) At the save seam (scripts/scrape-all.ts:1532) resolve identity before gating: SELECT id FROM events WHERE source=$source AND url=$url AND merged_into IS NULL, and upsert under that id so same-source same-url rows take the UPDATE path. (3) Extend ON CONFLICT (:1465-1478) with venue_name = $venue_name and start_date guarded by the range-artifact flag (S11) so printed dates propagate while synthesized range starts do not churn. (4) Pin: insert a legacy-id row, save the same URL under its slug id, assert one row with refreshed time/venue; mutation-run by removing the url lookup.

**Evidence.**
- `scratchpad analysis over sqlite3 -readonly dump of unmerged shown upcoming athinorama rows` — total 215, legacyIdRows 196, slugIdRows 19, noTime 127, noTimeLegacy 126
- `logs/pipeline-2026-09-25.log:1194-1217 and sqlite3 lookup of the cited ids` — Skipping duplicate: "Swallow the Sun" (athinorama.gr) duplicates 929541b33ddecf68 [exact_canonical 1.00] — survivor is same URL, legacy id, created 2026-07-02; 34 such skips
- `scripts/scrape-all.ts:1465-1478 (ON CONFLICT clause)` — ON CONFLICT(id) DO UPDATE SET title = $title, url = $url, type = $type, end_date = COALESCE($end_date, end_date), ... — no start_date, no venue_name
- `sqlite3 -readonly data/events.db rows for url theofilos_sold-10081522; md5('athinorama:10081522')[0:16]` — 331eb3e85f441e38|Θέατρο Ψυρρή|updated 2026-08-11|verified_athens and b562136671812294|Μίνι Πειραιώς 131|created 2026-09-13|unverified (= slug id)

*Reported by:* source-athinorama.

### S03 [high] 185 of 215 shown athinorama rows are pre-fix year-rollover artifacts with no retirement path

**Claim.** The 10-month rollover window only prevents new rollovers. 185 of 215 shown unmerged upcoming athinorama rows carry the rollover signature (start − created ≥ 301 days; e.g. 76 dated 2027-04 created 2026-04, Lena Lou dated 2027-09-17 while the live card says 1/10) and remain verified_athens; the build holds or hard-stops them but nothing retires them.

**Impact.** The largest source reaches publication with roughly 30 rows (215 shown minus 185 held/hard-stopped); 185 wrong-year rows inflate every DB-side count and health ratio, feed enrichment briefs with phantom dates, and will start publishing in 2027 when the 300-day rule stops firing (a 2026-04 row dated 2027-04-25 becomes publishable around 2027-02).

**Recommendation.** (1) One-time retirement pass for athinorama rows where start − created > 300 days and the url is absent from the current guide: set a durable marker (is_cancelled = 1 with dedup_reason 'rollover-artifact', or a new rollover_suspect column) after a dedup_merges-style snapshot; never silently delete. (2) Make retirement computed and recurring: scripts/decisions-queue.ts lists every isRolloverSuspect row (not only validator proposals) and the daily pipeline writes the per-source count into data/build-completeness.json. (3) Health check: alarm when (held + hard-stopped) / shown exceeds 50% for a source. (4) Keep selectPublishedPopulation as defence in depth; add a test asserting a retired row is excluded while a fresh same-URL row is not blocked by it.

**Evidence.**
- `sqlite3 -readonly data/events.db — shown unmerged upcoming athinorama rows by month | count | rollover signature` — 2026-10|27|0; 2026-11|12|3; 2026-12|16|15; 2027-02|24|24; 2027-03|12|12; 2027-04|76|76; 2027-06|11|11; 2027-07|32|32; total suspects 185 of 215
- `src/utils/event-lifecycle.ts:285-291 and logs/pipeline-2026-10-05.log:1681` — return (start - created) / 86_400_000 > 300; ... Held back 92 athinorama rows dated >300 days after first scrape (rollover suspects)
- `sqlite3 -readonly event_concerns join on the 185 suspects; config/enrichment-gate-rules.yml:32-33` — date-conflict-or-unparseable|91 ... tier: A0 (hard-stop, excluded before the hold count — inference: 92 + 91 ≈ 185)
- `live guide cross-check and sqlite3 row c4429e78c6b1dabd; docs/DECISIONS-QUEUE.md:10-12` — card 1/10 vs DB 2027-09-17T21:15:00[verified_athens] — Lena Lou, created 2026-09-20; queue: 'Proposed date corrections (1) — never auto-applied'

*Reported by:* source-athinorama.

### S04 [high] more.com: hard cap of 20 pages × 2 categories ingests ~5% of the catalogue although the listing already carries the full structured catalogue

**Claim.** scrapeMore stops after 20 event pages per category although the listings expose ~750 events; the first 20 links are document order (promo slider, default popularity), so the same ~40 events are re-scraped daily. Every listing item is a schema.org/Event <article> with url, ISO dates, venue, addressLocality/Region and per-date area tokens — a complete Attica-filterable catalogue in one HTTP 200 request.

**Impact.** Roughly 712 of ~752 events listed daily by Greece's primary ticketing platform are never ingested (5.3% coverage; 2% of the 2,000 the config expects); ticketed concerts and theatre runs only more.com carries are absent from the site; the daily run spends 33 s re-fetching 40 known pages and discards the listing's image and genre data.

**Recommendation.** Rewrite scrapeMore listing-first: fetch each category listing once (plain curl, HTTP/1.1, browser UA — verified HTTP 200, not behind queue-it), parse <article itemtype="http://schema.org/Event"> blocks with a tolerant HTML/microdata parser (not whole-page regex), expand per-date tokens venueGroupId<id>d<yyyymmdd> / city<id>d<yyyymmdd> / area<id>d<yyyymmdd>, keep area1 dates, map genre classes (musicrock, musicrebetiki, ...) to genres, carry itemprop=image to image_url, set ticket_url to the absolute event URL. Remove the 20-per-category cap; fetch event pages only for items whose data-code+date is new or stale, ordered by soonest start and rate-limited (~1 req/s). Log listing items vs ingested rows per run so a future cap or regex break is visible. Save listing and event bodies under tests/fixtures/more/.

**Evidence.**
- `scripts/scrape-all.ts:247, 275-276` — const categories = ['music', 'theatre']; ... // Process first 20 events per category (to avoid rate limits) ... if (count >= 20) break;
- `logs/pipeline-2026-09-25.log:1014-1025` — Found 394 music events ... Processed 20 music events, extracted 20 valid / Found 358 theatre events ... Processed 20 theatre events, extracted 40 valid
- `sqlite3 -readonly data/events.db scrape_stats (source='more', 2026-09-16..25); config/scrape-list.json:14-19` — events_found 40, 40, 40, 40, 40, 39, 40, 40, 40, 40 on ten consecutive days (events_new 0); config "expected_events": 2000
- `empirical: first <article> in https://www.more.com/gr-el/tickets/music/ (2026-10-05); attribute census` — <article itemtype="http://schema.org/Event" class="... city1229d20270625 area1d20270625" data-code="evg_..."><meta itemprop="startDate" content="2027-06-25T12:00"> — 470 items

*Reported by:* source-more.

### S05 [high] more.com whole-page regexes serialize runs and tours one row per day and flatten prices; 74% of rows are re-rows of 121 URLs

**Claim.** scrapeMore takes every YYYY-MM-DD in the page, keeps the first future one, pairs it with the first "venue-name" match anywhere in the HTML and emits one row with no end_date; multi-date runs and tours mint a new (title|date|venue) id each day. The price regex keeps a range's first number, 0 reads as no price, and `today` is computed in UTC.

**Impact.** Athens theatre runs appear as a single next-performance date with no run end (feeds the F2b presumed-running problem on record); tours inject one non-Athens row per day the filter can only hide; row volume is ~4× the real event count; price ranges show only their minimum; the date-venue pairing is correct only by page ordering (inference).

**Recommendation.** Parse the bookingPanel.data = {...} JSON on the event page instead of regexes: iterate events[] (day, event-date, event-end-date, venueId, prices, isSoldout, isBookingActive), join venueId to venues[] (venue-name, venue-city, venue-address), keep performances whose venue-city is in the Attica set, and emit one row per Athens performance or one run row with start_date/end_date per the run-end convention (src/utils/run-end-token.ts). Key the id on more.com's data-code/eventId + date + venueId so re-scrapes update rather than multiply. Take min/max from each prices string into price_amount/price_range; treat 0€ as 'open' only when isBookingActive confirms; compute today with DateTime.now().setZone('Europe/Athens').toISODate(); drop the JSON-LD fallback. Fixture test from the saved sadam2026 body: one Athens row (Universe - Multivenue, 2026-10-24), zero Thessaloniki rows, price range 18–20.

**Evidence.**
- `scripts/scrape-all.ts:297-304, 337-352` — venueMatch = eventHtml.match(/"venue-name":"([^"]+)"/) ... dateMatches = eventHtml.match(/\b(202[5-7]-\d{2}-\d{2})\b/g) ... startDate = futureDates[0] (no end_date)
- `sqlite3 -readonly data/events.db (url='.../theater/oikogeneia-tsekme-kalokairini-periodeia/')` — 29 rows, 25 distinct venues: 2026-07-02 ΔΙΠΑΕ ΣΕΡΡΩΝ; 07-06 Ξάνθη; 07-13 Κατερίνη; 07-18 Λευκάδα; 08-09 Κηποθέατρο Ν. Καζαντζάκης — all unverified
- `sqlite3 -readonly data/events.db (source='more.com')` — rows in URLs with >1 row: 909 of 1231; 121 such URLs; top o-katafantasian-asthenis 38 rows/32 venues; end_date NULL 1214/1231; price_amount = 0: 12
- `empirical sadam2026 body (bookingPanel.data) vs scripts/scrape-all.ts:248, 312-315` — events[]{day,venueId,prices:"18€ - 20€"} + venues[]{venue-city}; scraper: /"prices":"[^"]*?(\d+)€/ and today = new Date().toISOString().split('T')[0]

*Reported by:* source-more.

### S06 [high] No Attica filter at ingest for more.com; NATIONWIDE_SOURCES lists only cometogether, so more.com (and ticketservices) 'Πολλαπλοί Χώροι' rows pass through

**Claim.** scrapeMore ingests whatever the nationwide listing carries and discards the city/area tokens it already has; ~24% of listing items have no Attica date and 49% of more.com rows sit hidden as unverified. Only cometogether is in NATIONWIDE_SOURCES, so multi-city placeholder rows from more.com (and, latently, ticketservices) publish as pass_through.

**Impact.** A quarter of each more.com fetch budget goes to events that can never be shown; 603 rows (49%) are dead weight; venue name-collision leaks (3 recurrences) are structural because the scraper discards the city it has; multi-city placeholders from more.com publish without review even when a date is in Thessaloniki (ticketservices case latent: 0 current rows).

**Recommendation.** Filter at ingest using data more.com already gives: keep only listing items/dates carrying the area1 (Αττική) token or venue-city in {Αθήνα, Attica municipalities}; pass venue_address and city through ScrapedEvent to saveEvents so location-filter Step 1 (address blacklist) and the whitelist address check have input; for multi-city items emit only the Athens performance(s) instead of the placeholder venue. Add 'more.com' and 'ticketservices' to NATIONWIDE_SOURCES (src/quality/location-filter.ts:353) so bare 'Πολλαπλοί Χώροι' rows go to problematic review; in scrapeTicketServices split data-venues on '|' at ingest, keep the real venue segment and record the multi-venue flag separately. Pin with a fixture asserting a Thessaloniki-only date is dropped and a placeholder row lands in problematic.

**Evidence.**
- `empirical: parse of https://www.more.com/gr-el/tickets/music/ (2026-10-05); listing <article> for sadam2026` — articles 470, with Attica (area1) date 357, non-Attica only 113; sadam2026: PlayVenue 'Πολλαπλοι χωροι', addressRegion Αττική and Θεσσαλονίκη
- `sqlite3 -readonly data/events.db (source='more.com')` — location_status: unverified 603, verified_athens 618, pass_through 6; pass_through: 'The Gathering (NL) live in Greece|Πολλαπλοί Χώροι|2026-09-24'
- `src/quality/location-filter.ts:353-358` — const NATIONWIDE_SOURCES = ['cometogether']; ... if (event.source && NATIONWIDE_SOURCES.includes(event.source)) return { status: 'problematic' ...} else pass_through
- `docs/known-issues.md:348; ticketservices LiveConcerts listing fetched 2026-10-06` — Thessaloniki venue 'WE Πολυχώρος' ... leaking 3 more.com-sourced events as verified_athens (3rd recurrence); data-venues='ΚΥΤΤΑΡΟ LIVE|ΠΟΛΛΑΠΛΟΙ ΧΩΡΟΙ'

*Reported by:* source-more, source-ticketservices.

### S07 [high] more.com event pages are 302-to-queue-it with the body attached; the scraper survives only by never checking status

**Claim.** more.com event pages answer HTTP 302 Location: more.queue-it.net (safenet) but include the full page body; safeCurlText runs curl with --max-redirs 0 and no status check, and fetchWithCurl hardcodes status 200 for any non-empty body, so the scraper reads the body by accident. A body-less 302 or a queue HTML body degrades to 'no title match → continue' and a silent zero.

**Impact.** The per-page half of the more.com scraper depends on an undocumented quirk of more.com's queue-it integration; the day more.com serves a standard empty 302 or the queue page as body, yield drops to 0 with no typed error. Listing pages are not behind the queue (HTTP 200), another reason to make the listing the primary feed (S04).

**Recommendation.** Use safeCurlText's dumpHeaders (or safeCurlTextFollow's header split) in fetchWithCurl to capture the real status and Location; log a per-run counter of '302-with-body (queue-it safenet)' responses so the quirk is visible; detect queue-it/bot-wall bodies (Location host more.queue-it.net with a body under ~20 KB, or 'queue-it' markers without og:title) and throw a typed error instead of `continue`; make event-page fetches optional enrichment behind the listing feed (S04) so a queue change cannot zero the source. Pin with a fixture of a body-less 302 asserting the scraper rejects.

**Evidence.**
- `empirical: curl https://www.more.com/gr-el/tickets/music/sadam2026/ (2026-10-05, browser UA, --http1.1)` — HTTP/1.1 302 Moved Temporarily; Location: https://more.queue-it.net/?c=more&e=safenetprod2025...; size=116237; body has og:title and bookingPanel.data
- `src/utils/outbound-url.ts:362-367` — const args = [ 'curl', '-s', '--http1.1', '--proto', '=http,https', '--max-redirs', '0', '--max-filesize', String(maxBytes), '--max-time', String(seconds) ];
- `scripts/scrape-all.ts:225-231, 293-296` — if (text.length > 0) { return { ok: true, text: async () => text, status: 200 }; } ... const title = ...; if (!title) continue;
- `memory/reference_morecom_queueit_blocks_webfetch.md` — fetching any more.com-network ticket page ... returns a 302 to more.queue-it.net (safenet queue), or times out at 60s.

*Reported by:* source-more.

### S08 [high] ticketservices Athens area gate is a substring test; Heraklion, Larissa, Volos and Arcadia pass

**Claim.** scrapeTicketServices filters on `areaIds.includes('1')`, a JavaScript substring test, so any area id containing the digit 1 (16, 18, 19, 153) is treated as Athens. The live listing contains exactly such areas and the DB carries the accumulated non-Athens rows, mopped up only downstream by filter-athens-only or left in the unverified queue.

**Impact.** Every daily run ingests non-Athens events (6 of 79 gate-passing events in today's listing, ~8%), each costing a Puppeteer page load (~3 s), a row, a location-filter sweep and often a human review slot; 358 ticketservices rows have been rejected post-hoc and 111 sit in unverified. A mis-whitelisted leaked venue shows on the site (rejected-locations.json: Circus Entertainment Hub wrongly whitelisted as Gazi).

**Recommendation.** In scrapeTicketServices stop regex-reading data-areaids as a substring: parse the two JSON literals the listing embeds once per run (var areas = {...}; var venues = {...}; valid JSON after the assignment prefix). Keep an event only if every id in data-areaids.split(',') equals '1' or venues[data-venueids].areaid === '1'; log the count and names of excluded events so the drop is visible. Carry venues[id].name and the numeric venue id forward (S14). Add a unit test with a synthetic listing fixture containing areaids '1', '16' and '1,2' asserting only area 1 survives; RED via mutation (revert to includes('1') and watch it fail).

**Evidence.**
- `scripts/scrape-all.ts:914-915` — // Only Athens area (area 1)  if (!areaIds.includes('1')) continue;
- `https://www.ticketservices.gr/en/LiveConcerts/ fetched 2026-10-06 (HTTP 200, windows-1253), inline script` — var areas = {1:{"name":"ATHENS"},2:{"name":"THESSALONIKI"},16:{"name":"HERAKLEION"},18:{"name":"LARISSA"},19:{"name":"VOLOS"},153:{"name":"ΚΟΛΛΙΝΕΣ ΑΡΚΑΔΙΑΣ"}}
- `same listing, distinct data-areaids on the 94 <li data-eventid> elements` — 73 × '1', 10 × '2', 2 × '19', 2 × '16', 1 × '18', 1 × '153' — the 16/18/19/153 pass: ΔΗΜΟΤΙΚΟ ΘΕΑΤΡΟ ΒΟΛΟΥ, CIRCUS HUB ΛΑΡΙΣΑ, ΗΡΑΚΛΕΙΟΥ, Κολλίνες
- `sqlite3 -readonly data/events.db — ticketservices non-verified venues; rejected_events; specs/s140-scraper-hygiene-followups.md:59` — KIPOTHEATRO «NIKOS KAZANTZAKIS» - HERAKLEION 7, Κολλίνες Αρκαδίας 5, ΦΟΡΤΕΤΖΑ - ΡΕΘΥΜΝΟ 3; rejected_events: 358; spec: 'Currently no city-filter gate'

*Reported by:* source-ticketservices.

### S09 [high] Stale generic whitelist canonicals rewrite venue_name: fake 'Concert #1 Baumstrasse' label and two hidden Gagarin 205 shows

**Claim.** 'Concert #1 Baumstrasse' does not come from ticketservices (listing says 'BAUMSTRASSE'; md5 with 'baumstrasse' reproduces the DB id): config/athens-venues.json has a stale canonical 'Concert #1 Baumstrasse' preceding the real 'Baumstrasse' entry and winning via findVenueConfig's 40%-overlap reverse-substring rule, after which filter-athens-only rewrites venue_name. The same mechanism turns 'Gagarin 205 Live Music Space' into the problematic placeholder 'Live Music Space'.

**Impact.** Six shown upcoming rows (18 all-time) display the fake venue 'Concert #1 Baumstrasse' with neighborhood 'Unknown'; two real Athens metal shows at Gagarin 205 (7 Oct and 30 Oct 2026) are hidden as 'problematic' and the correct venue string is destroyed in the DB, so a manual status fix would publish a placeholder venue. Any venue string containing a stale generic canonical is exposed.

**Recommendation.** (1) Delete the stale canonical entries 'Concert #1 Baumstrasse' (config/athens-venues.json:1159-1163) and 'Live Music Space' (:777-781); both already exist as variations of the correct records. Re-run bun run scripts/filter-athens-only.ts so the ~20 affected rows re-resolve (the rewrite is COALESCE-based, so rows need a re-sweep). (2) In findVenueConfig (src/quality/location-filter.ts:178-186) prefer exact canonical/variation matches across all entries before any substring heuristic so file order cannot decide; pin with two synthetic entries where the generic one precedes the specific one. (3) Add a config lint (tests or scripts/review-venues.ts) failing when a canonical_name also appears as another entry's variation. (4) Stop rewriting venue_name in filter-athens-only when the match came from the reverse-substring branch; record matched_venue separately.

**Evidence.**
- `config/athens-venues.json:1159-1163 and :1170-1178` — { "canonical_name": "Concert #1 Baumstrasse", "variations": [], "neighborhood": "Unknown" } … { "canonical_name": "Baumstrasse", "variations": ["BAUMSTRASSE", ...
- `config/athens-venues.json:777-787; config/rejected-locations.json problematic_entries` — { "canonical_name": "Live Music Space", "variations": [] } , { "canonical_name": "Gagarin 205", "variations": ["Gagarin 205 Live Music Space", ...; 'Generic placeholder'
- `src/quality/location-filter.ts:178-186 findVenueConfig; scripts/filter-athens-only.ts:229-233` — if (normalizedVenue.includes(canonicalNorm)) return venueConfig; ... canonicalNorm.includes(normalizedVenue)) return venueConfig; UPDATE events SET ... venue_name = COALESCE(?, venue_name)
- `ticketservices listing 2026-10-06; sqlite3 -readonly data/events.db upcoming rows with venue_name='Live Music Space'` — data-venues='BAUMSTRASSE' (md5 → DB id 0aba0a4875afe3d6); 85032c98e09659b6|MAYHEM...|2026-10-07|problematic; 1b4d8c03645bb56a|CORONER...|2026-10-30|problematic

*Reported by:* source-ticketservices.

### S10 [high] ticketservices per-event Puppeteer loop is unbounded (5.4–5.6 h runs), redundant with the static HTML, and swallows per-event failures

**Claim.** Each Athens event is loaded daily through Puppeteer with networkidle2 (~3 s/event; 19,335 s and 20,099 s runs recorded) with no protocolTimeout, per-event deadline or per-source budget, although the static page already carries per-show data-date/data-time, venue address and organiser price. Prices are min/max of every 'N€' in body text and every per-event error is caught silently.

**Impact.** On the worst days ticketservices alone consumed 5.4–5.6 h of the sequential daily pipeline (overlapping the next run on 2026-09-13) while reporting success=1; on normal days it is 2.5× slower than the next source (228 s/112 events) for data that is 95% unchanged; multi-date events get the first show's time; price spans may include non-ticket amounts (inference) and misses (12 vs 2 per run) are unexplained.

**Recommendation.** (1) Pass protocolTimeout: 30_000 to puppeteer.launch; wrap each per-event unit (goto + click + evaluate) in Promise.race against a 30 s deadline, abort the price phase after 5 consecutive timeouts, and in main() race source.scraper() against a per-source budget (e.g. 15 min) recording success=false reason 'timeout' in scrape_stats. (2) Restructure into stages: plain safeFetchResponse of /event/{id}/ decoded as windows-1253; emit one row per li[data-showid] with its own data-time; parse the venue block and maps link into venue_address (S15) and 'Γενική είσοδος NN€' as a provisional price; plain GET of the booking href for ids lacking price_range, Puppeteer only when that HTML has no prices. (3) Parse the structured per-zone price list instead of innerText; replace the empty catch (:1050) with a counter and one log line per failed id. (4) Test: injected never-resolving scraper records a timeout failure.

**Evidence.**
- `sqlite3 -readonly data/events.db — scrape_stats WHERE source='ticketservices' (scraped_at|events_found|duration_ms)` — 2026-09-08|106|20099570 ; 2026-09-07|109|19335128 ; 2026-09-13|102|5912647 ; 2026-09-22|111|3130064 ; 2026-09-25|112|228466
- `scripts/scrape-all.ts:955-960, 974-996; grep protocolTimeout|Promise.race|AbortSignal.timeout → no match` — puppeteer.launch({ headless: true, executablePath: CHROME_PATH, ... }) — no protocolTimeout; page.goto(..., { waitUntil: 'networkidle2', timeout: 15000 })
- `https://www.ticketservices.gr/event/15203/ static HTML via curl (HTTP 200, 67,774 bytes, 0.41 s)` — <li ... data-date='2026-10-10' data-time='21:30' data-showid='101390' data-venueid='1208'> ... <strong>BAUMSTRASSE</strong><br />Σερβίων 8, Αθήνα 104 41 ... Γενική είσοδος <strong>12€</strong>
- `scripts/scrape-all.ts:1000-1007, 1050; .claude/notes/ledger.md:201` — text.match(/(\d+)\s*€/g) ... if (p >= 5 && p <= 300) priceValues.push(p); ... } catch (err) { /* Skip on error */ } — ledger: 'TicketServices scraper hangs ... Add timeout per event'

*Reported by:* source-ticketservices.

### S11 [high] athinorama date logic is unobservable: range-artifact flag discarded, silent card/page skips have no counters, multi-hour scrapes leave no trace

**Claim.** parseTheaterDateRange returns startIsRangeArtifact but the caller destructures it away, so synthesized range starts are stored and rendered as show dates; cards dropped by the 10-month window, rolled dates and failed detail fetches are `continue`d with no count; per-run durations swung from 74 s to 9,553 s in September with no per-page timing or warning.

**Impact.** Nobody can tell from logs or DB whether an athinorama yield drop is a window artefact, a markup change or throttling; 14 of 32 running theatre rows render and get enriched with a synthesized start as if it were a premiere (the phantom-date class documented across 8+ enrichment sessions); a 2.6-hour scrape registered nothing.

**Recommendation.** (1) Add an AthinoramaRunStats record in scrapeAthinorama {cards_seen, cards_no_date, dropped_outside_window, rolled_to_next_year, range_artifact_starts, detail_fetch_failed, detail_fetch_ms_p95, ticket_links_found, time_found, price_found} incremented at each `continue` (:648-660, :704, :742) and logged as one JSON line plus stored in scrape_stats (new TEXT column detail_json). (2) Persist the flag: add start_is_range_artifact INTEGER (or time_source='range_start') from ScrapedEvent through the INSERT at :1456, and have templates/JSON-LD and enrichment briefs read it so a synthesized start is never rendered as a premiere; S02's ON CONFLICT guard consumes the same flag. (3) Record per-page fetch timing and emit a warning line when the detail phase exceeds a budget (e.g. 10 min).

**Evidence.**
- `scripts/scrape-all.ts:646; grep -rn startIsRangeArtifact (only :470-582 and tests)` — ({ startDate, endDate } = parseTheaterDateRange(card, now)); — the flag is never read, persisted or counted
- `scripts/scrape-all.ts:648-660, 704, 742-745` — if (endDate && endDate < today) continue; if (!startDate) continue; ... if (!eventHtml) continue; ... } catch (err) { /* Skip on error */ }
- `sqlite3 -readonly scrape_stats durations (s) for athinorama, Sept 2026; logs/pipeline-2026-09-07.log` — 09-01 74 | 09-06 5854 | 09-07 9553 | 09-08 7622 | 09-22 3649 | 09-25 91; log: 11 'The operation was aborted' attempts, 'Completed: 169 events in 9553.5s', no per-page timing
- `sqlite3 -readonly data/events.db running theatre rows (end_date >= today, shown, unmerged)` — 32 rows, 14 with start_date equal to their first-scrape day (synthesized range start indistinguishable from a printed premiere downstream)

*Reported by:* source-athinorama.

### S12 [medium] athinorama detail-page phase: 200+ sequential fetches per run, retries on 4xx, silent per-page failure, stale JSON-LD — while the music card already prints the time

**Claim.** Every run fetches every event page sequentially (203 on 2026-09-25) with a 15 s timeout, retrying any non-2xx including 404 with 2 s/4 s backoff; a failed page leaves the row without time/price/image and (via S02) is never backfilled. Theatre-page JSON-LD is stale (2024 dates/venue) so time patterns 2/4 can read a previous season; the music card itself prints the time.

**Impact.** A throttled day turns a 90 s scrape into hours (9,553 s on 2026-09-07) with no signal; dead pages cost ~21 s each; rows saved during a bad day permanently lack time/price/image; ~100 avoidable requests per run for music times increase rate-limiting exposure on the source the project depends on most; the doc misinforms maintainers.

**Recommendation.** (1) In the music branch (scripts/scrape-all.ts:654-660) parse the printed card time with the existing Greek π.μ./μ.μ. logic (extend patterns 5/6 to the text after </strong> in p.summary) and set event.time at card level; fetch the detail page only when price/image are still missing. (2) In fetchWithRetryAthinorama do not retry on 4xx (return null immediately); keep retries for 5xx/timeouts; stop the detail phase after N consecutive failures and record it. (3) Guard patterns 2/4 in extractTimeFromAthinoramaPage by requiring the JSON-LD/<time> year to equal the card's parsed year. (4) Correct docs/SCRAPING-PIPELINE.md:49-57 to the code's actual behaviour. (5) Fixtures: a card with 'Σάβ. 7.30 μ.μ.' → 19:30; a page with 2024 JSON-LD → null.

**Evidence.**
- `scripts/scrape-all.ts:373-396, 703-704, 742` — timeoutMs: 15_000 ... if (!response.ok) throw new Error(HTTP ${response.status}); delay = Math.pow(2, attempt) * 1000; fetchWithRetryAthinorama(event.url, 2); if (!eventHtml) continue;
- `logs/pipeline-2026-09-25.log:1033-1047` — Found 63 concert events / Found 140 theater events / ... 200/203 pages processed ... Found prices for 44/203 events / Found times for 194/203 events
- `live music guide card swallow_the_sun-10090970 (2026-10-06) vs scripts/scrape-all.ts:654` — <p class="summary"> <strong> 17/10 </strong>Σάβ. 7.30 μ.μ. </p> — time is on the card; the music branch reads only the <strong>DD/MM</strong>
- `live theofilos_sold-10081522 JSON-LD vs scrape-all.ts:429-435, 446-450; docs/SCRAPING-PIPELINE.md:49-57` — "startDate":"2024-07-05T00:00:00+03:00" location Παλαιό Πανεπιστήμιο (stale season); doc: '2-second delay ... 30-second timeout. Max 2 retries' — none match code

*Reported by:* source-athinorama.

### S13 [medium] more.com link regex and category list drop festival sub-events, multi-segment URLs and whole categories (dance, cinema, stand-up comedy)

**Claim.** The link regex admits only a single [a-z0-9-] slug after music|theatre|theater, so festival sub-events and venue/date sub-paths (e.g. Release Athens 2027 line-up pages) are never followed, and only two of more.com's ~10 categories are scraped; sports is excluded on purpose (S100) but dance, cinema and stand-up-comedy are simply absent.

**Impact.** Major Athens festival line-ups sold on more.com (Release Athens 2027 sub-events, Blend) and every ticketed dance, cinema and comedy event on the platform are invisible to the site, although the EventType union already has 'dance', 'cinema' and 'show'/'performance' slots for them.

**Recommendation.** Widen the slug pattern to any path under /gr-el/tickets/<category>/ (multi-segment allowed, Unicode-safe) and derive the type from the listing's category/genre classes via src/categorizer (url-category-patterns.json) rather than category === 'music' ? 'concert' : category. Add 'dance', 'cinema' and 'stand-up-comedy' to the category list (editorial decision for 'child' and 'museums'); keep '/tickets/sports/' in excludedUrlPatterns as the L2 guard. Pin with the saved listing fixture asserting the 15 multi-segment hrefs are discovered.

**Evidence.**
- `scripts/scrape-all.ts:247, 262` — const categories = ['music', 'theatre']; ... /href="(\/gr-el\/tickets\/(?:music|theatre|theater)\/[a-z0-9-]+\/)"/gi
- `empirical: multi-segment hrefs in the music listing (2026-10-05)` — 15 hrefs unmatched, e.g. /gr-el/tickets/music/festival/release-athens-2027/the-neighbourhood/, /gr-el/tickets/music/hawk-live-athina/21-11-2026/universe-multivenue/
- `empirical: top-level category hrefs in the more.com listing nav` — music, theatre, dance, cinema, stand-up-comedy, child, museums, sports, streaming, offers, new-events
- `.claude/notes/ledger.md:392; config/event-scope.json:38-42` — drop 'sports' from the categories array + URL regex; (L2) extend event-scope.json ... "excludedUrlPatterns": [ "/tickets/sports/", "productledhub.com", ...

*Reported by:* source-more.

### S14 [medium] ticketservices titles keep raw HTML entities and are hashed into event ids and public slugs; the merchant's stable ids are unused

**Claim.** scrapeTicketServices decodes only &lt;/&gt;/<br> and saveEvents bypasses decodeEventFields, so double-encoded titles ('Gy&amp;#246;rgy') are stored, hashed into md5(title|date|venue) ids and baked into published slugs. The listing's stable data-eventid/data-showid/data-venueids are ignored, so any title or venue edit — or a decoding fix — re-keys the row and ON CONFLICT(id) never sees the old one.

**Impact.** Public indexable URLs for at least two live events carry 'amp-246-rgy'/'quot' garbage; 17 of 91 upcoming rows have corrupted titles and the encoded venue 'ΘΕΑΤΡΟ NOŪS' cannot match the whitelist; because ids hash the encoded string, a naive decoding fix or any merchant title edit creates a duplicate row and orphans enrichment (no duplicates observed today — latent).

**Recommendation.** In one change so ids move once: (1) decode title and venue in scrapeTicketServices with a proper HTML-entity decoder applied twice (the source double-encodes &amp;#246;); (2) key rows as a deterministic hash of ticketservices|{data-eventid}|{data-showid or date} and store the merchant ids (event, venue, show) in columns; (3) migrate existing rows by matching (url, start_date) → new id in one transaction and update the import gate's existing-id check. Until then, decode in the slug generator and in the whitelist matcher input. Pin test: a title containing '&amp;#246;' is stored as 'ö'. Append a note at ledger.md:959 (institutional memory: append, never rewrite) that saveEvents bypasses decodeEventFields.

**Evidence.**
- `scripts/scrape-all.ts:921-922, 107-110, 932` — title: title.replace(/&lt;/g,'<').replace(/&gt;/g,'>')...; normalized = ${title.toLowerCase()}|${date}|${venue.toLowerCase()}; md5...substring(0,16)
- `src/db/database.ts:298 vs scripts/scrape-all.ts:1455-1476; grep decodeEventFields scripts/scrape-all.ts → no match` — event = decodeEventFields(event); // only inside upsertEvent — saveEvents bypasses it although .claude/notes/ledger.md:959 claims the chokepoint covers scrape-all sources
- `sqlite3 -readonly data/events.db — upcoming ticketservices titles with &amp;/&quot;/&#` — 17 of 91 rows, e.g. 1bd9b825bbe3a244|Sayings and Cracks &amp;#8211; Tribute to Gy&amp;#246;rgy Kurt&amp;#225;g; venue 'ΘΕΑΤΡΟ NO&amp;#362;S' (unverified)
- `dist/with-ticket-concert-this-month.html; md5 reproduction against generateEventId` — /events/1bd9b825-kpisn-sayings-and-cracks-amp-8211-tribute-to-gy-amp-246-rgy-kurt-a/; md5('omma &amp; γιάννης μήτσης|2026-10-10|baumstrasse')[0:16] = DB id

*Reported by:* source-ticketservices.

### S15 [medium] ticketservices scraper discards the page's real venue address; 'address drift' in the decisions queue is best explained by WebFetch summary confabulation

**Claim.** DECISIONS-QUEUE entries describing ticketservices pages rendering wrong street names (postal code intact, different street each read) match the documented failure mode of summarising WebFetch on this site, not a page defect: the raw HTML of event 15203 carries the correct address. The scraper never captures venue_address, so enrichment re-reads the page with the tool that confabulates (inference for 15116/14963).

**Impact.** Enrichment time is spent reconciling addresses the scraper could capture verbatim, and the queue records the merchant as unreliable when the unreliable component is the fetch tool; venue_address stays empty at ingest, so the location filter's address blacklist (Κρήτη, Θεσσαλονίκη in the address) has nothing to bite on for this source.

**Recommendation.** At ingest (stage 2 of the restructured scraper, S10) parse the venue block <strong>{venue}</strong><br />{street}, {city} {postcode} and the maps.app.goo.gl link into venue_address (or a venue_address_source column when the row already has one), add the field to ScrapedEvent and the INSERT, and pass it to checkLocation so city/postcode feed the address blacklist. In docs/enrichment-anti-patterns.md and the enrichment prompt state: 'ticketservices.gr: never take venue/address/price from a summarising WebFetch; use the literal read (r.jina.ai) or the scraped venue_address'. Re-verify 15116/14963 with a literal read before treating the merchant as the drift source.

**Evidence.**
- `docs/DECISIONS-QUEUE.md:36, 49, 51` — ticketservices.gr/event/15116/ renders Μικρός Κεραμεικός at 'Αριστοτέλους 13' ... a prior batch saw 'Kallidromiou 13'. Postal code survives, street name does not.
- `memory/reference_ticketservices_webfetch_confabulation.md` — plain WebFetch ... returned venue "Στέγη Ευαγγέλου, Μαυρομιχάλη 39" (nonexistent; real venue PLYFA, Korytsas 39) ... r.jina.ai returned the literal DOM text
- `https://www.ticketservices.gr/event/15203/ raw HTML fetched 2026-10-06` — <strong>BAUMSTRASSE</strong><br />Σερβίων 8, Αθήνα 104 41<br /> ... href="https://maps.app.goo.gl/sZFkuKWKjgq7ieP4A" (matches DB venue_address 'Servion 8')
- `scripts/scrape-all.ts:70-87, 1455-1462; .claude/notes/ledger.md:7027` — interface ScrapedEvent { ... } — no venue_address; INSERT column list has no venue_address; ledger: 'venue_address is blacklist input but empty ... ticketservices doesn't populate it'

*Reported by:* source-ticketservices.

### S16 [medium] athinorama cinema guide is not scraped although config, docs and a live cinema hub assume it; no recorded decision

**Claim.** scrapeAthinorama fetches only /music/guide and /theatre/guide; the dead config and the pipeline doc still list /cinema/guide; the site ships a cinema hub with time-variant pages while the DB holds 3 upcoming cinema rows (all onassis). No ledger decision records dropping cinema, so intent is unknown.

**Impact.** A published hub ('Κινηματογράφος στην Αθήνα') is backed by 3 events while the project's richest listings source for screenings is one guide URL away; the pipeline doc actively misinforms the next maintainer.

**Recommendation.** Decide explicitly and record it in .claude/notes/ledger.md § Decisions. If in scope: add { url: 'https://www.athinorama.gr/cinema/guide', type: 'cinema', hasDateRanges: <per fixture> } to the guides array (scripts/scrape-all.ts:602-605) after saving a live fixture and pinning its card/date format in tests/athinorama-cinema.test.ts (the card regex at :621 and date labels may differ). If out of scope: remove /cinema/guide from docs/SCRAPING-PIPELINE.md:49, mark config/scrape-list.json archived, and hide or re-source the cinema hub.

**Evidence.**
- `scripts/scrape-all.ts:602-605` — const guides = [ { url: 'https://www.athinorama.gr/music/guide', type: 'concert' }, { url: 'https://www.athinorama.gr/theatre/guide', type: 'theater' } ];
- `config/scrape-list.json:43-46; docs/SCRAPING-PIPELINE.md:49; docs/session-log.md:2998` — "https://www.athinorama.gr/cinema/guide" ... Pages scraped | /music/guide, /theatre/guide, /cinema/guide ... scrape-list.json has zero active consumers
- `sqlite3 -readonly data/events.db upcoming cinema rows by source; config/hub-pages.json:440-448; dist/ listing` — cinema|onassis|3 ... "slug": "cinema", "values": ["cinema", "screening"] ... dist/cinema.html, cinema-today.html, cinema-this-week.html exist
- `grep -n -i cinema .claude/notes/ledger.md` — no entry decides to exclude the athinorama cinema guide (matches concern-type vocabulary, badge colours and slug collisions only)

*Reported by:* source-athinorama.

### S17 [medium] scrape_stats never records events_new/events_updated, so a frozen source looked healthy for weeks

**Claim.** recordScrapeStats is called before saveEvents with hardcoded 0 for events_new and events_updated and is never updated afterwards, so ten consecutive 'found 40' more.com rows gave no sign the source created zero new rows; a scraper re-fetching the same items forever is indistinguishable from a healthy one.

**Impact.** The yield canary and health check can only reason about events_found; the frozen more.com (S04) and athinorama (S02) populations were invisible for weeks; operators reading the scoreboard see '40 events (same)' as good news.

**Recommendation.** Have saveEvents return per-source saved/updated counts (it already distinguishes new ids via existsStmt, scripts/scrape-all.ts:~1526) and write them with an UPDATE to the scrape_stats row after save, or move recordScrapeStats (:1811) after saveEvents. Have scripts/yield-canary.ts additionally trip when events_new has been 0 for N consecutive days on a source whose events_found is non-zero. Pin with a test asserting the stats row carries the save counts.

**Evidence.**
- `scripts/scrape-all.ts:1808-1811` — // Record stats to database (events_new/updated will be calculated after save) if (!dryRun) { recordScrapeStats(sourceId, events.length, 0, 0, duration, true, null); }
- `sqlite3 -readonly data/events.db scrape_stats (source='more', rows 2245..2335, 2026-09-16..25)` — events_found 40, events_new 0, events_updated 0, success 1 — every day
- `sqlite3 -readonly data/events.db — more.com created_at per day` — 2026-09-24 2, 09-23 3, 09-22 11, 09-21 2, 09-20 5, 09-19 5, 09-18 2 — real new rows exist but are never reflected in scrape_stats

*Reported by:* source-more.

### S18 [low] Neither scrapeMore nor the athinorama card parser is pinned by a running test

**Claim.** scrapeMore is referenced only at its definition and the SOURCES registry (not exported, no injectable fetch); scripts/__tests__/scrape-athinorama.test.ts is outside the explicit `bun run test` list and uses synthetic markup; no test exercises either scraper's live card regexes or the save/gate seam that froze the legacy rows (S02).

**Impact.** A markup change on more.com or athinorama (the site's largest source) passes the green suite; the identity/freeze defect (S02) and every more.com regex defect (S05, S13) can be re-introduced silently and would surface only as a yield drop days later.

**Recommendation.** Export scrapeMore with an injectable fetch (mirroring scrapeClubber(fetchFn) at scripts/scrape-all.ts:822); store the fetched bodies (more.com music listing, sadam2026 page, athinorama guide cards with and without a more.com anchor, a theatre page) under tests/fixtures/; move scripts/__tests__/scrape-athinorama.test.ts under tests/ (or add it to also_required). Write tests asserting: all 403 more.com listing links discovered (no cap), only Attica dates emitted, the Thessaloniki sadam2026 performance excluded, price range 18–20 captured, athinorama card time and ticket anchor extracted, and a same-URL re-scrape updates rather than being gate-skipped (in-memory sqlite). Use the mutation run as RED for these retrofitted pins.

**Evidence.**
- `grep -rn "scrapeMore" tests scripts src` — scripts/scrape-all.ts:244:async function scrapeMore() ... scripts/scrape-all.ts:1683: more: { name: 'More.com', scraper: scrapeMore } (no other references; not exported)
- `bash .github/scripts/test-report-check.sh --list (read-only)` — scripts/__tests__ entries: deploy-gate.test.ts, precommit-tsc.test.ts only — scrape-athinorama.test.ts absent
- `scripts/__tests__/scrape-athinorama.test.ts:16-17` — const card = (inner) => <h3><a href="/theater/123/show">Τίτλος</a></h3>${inner}<h4>... — synthetic markup, not the live <h2 class="item-title"> card
- `scripts/run-tests.sh:4-13` — passes the exact list .github/scripts/test-report-check.sh --list prints ... so bun runs those files and nothing else

*Reported by:* source-more, source-athinorama.

### R01 [high] cometogether discards __NEXT_DATA__ city/address; Athens membership decided by name-only matching

**Claim.** parseCometogetherListing regex-parses HTML cards and passes only the printed venue name, although the page's __NEXT_DATA__ JSON carries city, municipality, countryCode, formattedAddress and coordinates for 179 of 184 fixture events. Athens membership is decided by name matching alone: 69 of 115 upcoming rows are unverified (45+ provably non-Athens) and name collisions leaked non-Athens events as verified_athens.

**Impact.** 60% of cometogether's upcoming rows (69/115) await manual venue review, most provably non-Athens; every new nationwide venue name is a collision risk against the 356-entry name-only whitelist (two confirmed leaks to the live site); the hand-written blacklist in config/rejected-locations.json cites a city field the scraper never reads.

**Recommendation.** In scripts/scrape-cometogether.ts parse `<script id="__NEXT_DATA__">` (props.pageProps.data.events) first and build events from it: venue_name from newVenues[].venueName/customVenueName, plus venue_address = venueLocation.formattedAddress and location = city + municipality. Add optional venue_address/location to ScrapedEvent in scrape-all.ts and bind them in saveEvents so checkLocation's blacklist sees them. Reject at ingest (rejected_non_athens) when countryCode != 'GR' or municipality is outside Attica; auto-verify rows whose coordinates fall in the Attica bounding box. Keep the HTML-card parser as fallback; add fixture precondition tests asserting the JSON has >=100 events with venueLocation.city. Delete or address the 'Gustav'/'Gustav Athens' whitelist entries (no variations, neighborhood Unknown).

**Evidence.**
- `scripts/scrape-cometogether.ts:95-96,11-13` — const venueM = chunk.match(/<\/span><\/div><span[^>]*>([^<]{2,80})<\/span>/); const venue = venueM?.[1]… ?? 'TBA'; // Venue names pass through as printed
- `tests/fixtures/cometogether-listing.html __NEXT_DATA__ events[boxId=6125].newVenues[0].venueLocation` — "city": "Καλαμαριά", "municipality": "Θεσσαλονίκη", "formattedAddress": "Νικ. Πλαστήρα 3, Καλαμαριά 551 32, Ελλάδα", "countryCode": "GR"
- `sqlite3 -readonly data/events.db (upcoming cometogether by location_status) joined with fixture venue→city` — 115 upcoming|45 shown|69 unverified|1 problematic; unverified 'Soul' (16), 'Ελληνίς' (9), 'Rover' (7): Θεσσαλονίκη; 'Bras de Frères' (2): Χανιά
- `sqlite3 -readonly data/events.db row 8406db69feb81b33; docs/DECISIONS-QUEUE.md:24,41; config/rejected-locations.json:276-308` — Musketeer - Swedish Church - HAMBURG|Gustav Athens|verified_athens|2026-11-27; Larissa 'Circus Entertainment Hub' leaked until hand-blacklisted

*Reported by:* source-halfnote-megaron-cometogether.

### R02 [high] Onassis parser hard-codes 'Onassis Stegi', with-ticket and verified_athens although cards carry sub-venue and ISO dates

**Claim.** The whats-on card carries the venue in `p.mb3 > span > span` ('Onassis Ready', 'Αρχείο Καβάφη', 'Στέγη Ιδρύματος Ωνάση') and a `<time datetime="start/end">`, yet parseOnassisEvents ignores both, stamps every event Onassis Stegi / with-ticket, and scrapeOnassisAdapter forces location_status verified_athens, so Onassis Ready, Mandra, Cavafy Archive, AiR and ONX New York events are published at Syngrou 107.

**Impact.** Every Onassis row (34) is placed at Syngrou 107 regardless of real site; 5 venue-mismatch rows are queued for human correction, one a New York exhibition listable as verified_athens from 25 Sep to 4 Oct 2026. Readers get wrong addresses and a wrong price for open programs (Cavafy school visits are Δωρεάν); memory notes record repeated manual rework.

**Recommendation.** In parseOnassisEvents (scripts/scrape-onassis.ts:172-217) read `$card.find('p.mb3 span span').first().text().trim()` and set venue_name from it, mapping Greek labels to canonical names ('Στέγη Ιδρύματος Ωνάση' → Onassis Stegi) and adding config/athens-venues.json entries with verified addresses for Onassis Ready, Αρχείο Καβάφη, Onassis Mandra and Onassis AiR via pre-venue-check. Drop the hard-coded location_status at scripts/scrape-all.ts:1633 so unknown labels (Onassis ONX) land unverified and the location filter rejects New York. Prefer `$card.find('time').attr('datetime')` ('YYYY-MM-DD/YYYY-MM-DD') in parseOnassisDateRange. Stop stamping price_type: pass null unless a ticket indicator shows, or map 'Εκπαιδευτικό πρόγραμμα' to open. Extend scripts/__tests__/scrape-onassis.test.ts to assert venue_name for fixture cards 1 and 3 (RED first).

**Evidence.**
- `tests/fixtures/onassis-whats-on.html (card 1)` — <h3 class="mb3">Tilda Swinton – Ongoing</h3><p class="mb3"><span><span>Onassis Ready</span></span></p>…<time datetime="2026-05-17/2026-06-28">
- `scripts/scrape-onassis.ts:206-214` — events.push({ title, description: desc || 'Event at Onassis Stegi', start_date, end_date, url, venue_name: 'Onassis Stegi', price_type: 'with-ticket', …
- `scripts/scrape-all.ts:1627,1633 (scrapeOnassisAdapter)` — venue_name: e.venue_name || 'Onassis Stegi', ... location_status: 'verified_athens'
- `sqlite3 -readonly data/events.db (source='onassis'); docs/DECISIONS-QUEUE.md:30,39,42,44` — Onassis Stegi|34; with-ticket|34; verified_athens|34 … 6379dca39846c268 ONX.Exhibition.NY.2026 at 390 Broadway, New York — should be rejected as non-Athens

*Reported by:* source-puppeteer-trio.

### R03 [high] SNFCC invents start_date = today for dateless cards (one new row per day, no end_date) and stamps price 'open' unread

**Claim.** scrape-snfcc.ts falls back to today when a card has no parseable date and includes that date in the event id, so the same URL becomes a fresh row every scrape day with end_date NULL; running exhibitions vanish when scraping stops. All three extraction paths also hard-code price_type 'open' / 'Δωρεάν' without reading any price text.

**Impact.** 320 snfcc rows for 137 real URLs, 167 with an invented start date; Μαζί, Ορατές alone is 79 rows. Only 3 SNFCC rows are shown today although WATER (to 8 Nov) is running. Enrichment shipped two false 'one night only' claims off per-date rows; dedup and stats are polluted; the 'open' price is asserted, never observed (inference: usually true).

**Recommendation.** In scrape-snfcc.ts replace `parsedStart || today` (lines 344, 431, 515) with skip + console.log when no date parses, like scrape-onassis.ts:184. Read `dateEl?.getAttribute('datetime')` before textContent in the page.evaluate blocks (:279, :495); for cards without one, visit the /event/ page once per URL per run to read the date range. Build identity from the stable URL slug instead of title+date (ledger S162). Leave price_type/price_range null unless the card or page states 'Δωρεάν'/'Είσοδος ελεύθερη' or a price. Add a fixture test (tests/fixtures/snfcc-category.html) asserting a dateless card is skipped and a dated card keeps end_date; follow with a reviewed cleanup collapsing per-day duplicates by URL.

**Evidence.**
- `scripts/scrape-snfcc.ts:343-345,358` — const startDate = parsedStart || today; const endDate = parsedEnd; … id: generateEventId(item.title, startDate, 'ΚΠΙΣΝ'),
- `sqlite3 -readonly data/events.db (url = https://www.snfcc.org/event/ekthesi-fotografias-mazi-orates/)` — COUNT(DISTINCT start_date)=79, SUM(end_date IS NULL)=79, COUNT(*)=79; rows created 2026-05-26, 2026-05-27, 2026-05-28 …
- `sqlite3 -readonly data/events.db (source='snfcc')` — start_date day = created_at day: 167 of 320; exhibitions 119, 1 with end_date; 137 distinct URLs; price_type open|320; upcoming shown today 3
- `scripts/scrape-snfcc.ts:370-372 (repeated :450-452, :540-542) vs scripts/scrape-onassis.ts:184` — price_type: 'open', price_amount: 0, price_range: 'Δωρεάν' … vs Onassis: if (!start_date) return; // no usable date → skip (never fabricate)

*Reported by:* source-puppeteer-trio.

### R04 [high] Benaki scraper has never parsed a real exhibition; four hard-coded past exhibitions are written as verified_athens every run

**Claim.** scripts/scrape-benaki.ts injects four hard-coded, past-dated 'known exhibitions from research' whenever parsing yields nothing, and the adapter saves them as verified_athens on every daily run. In all 205 logged runs (2026-02-12 to 2026-10-06) the fallback fired — 176 times with the page loaded and selectors matching nothing — so the constant '4 events' hid total source failure from every monitor.

**Impact.** Benaki has contributed zero real events since the project started while every dashboard says healthy — the only alert paths (events_found 0 or >50% drop) cannot fire. Five invented rows (dates, 10:00 time, genres, generic URL) are re-asserted daily with verified_athens and needs_enrichment=1; the site's end_date filter hides them today (0 shown), but they were publishable until 2026-05-24 (inference).

**Recommendation.** Delete scripts/scrape-benaki.ts:187-234 and return [] with `log('WARN', SOURCE_ID, 'Scrape returned 0 events')`, mirroring scripts/scrape-onassis.ts:261-264. Extract the page.evaluate body into a pure parseBenakiEvents(html), spike the rendered HTML of the events search page into tests/fixtures/benaki-events.html, pick precise card/date selectors from it, and add scripts/__tests__/scrape-benaki.test.ts asserting the fixture precondition (>=N cards) and that an empty page yields []. Purge the five source='benaki' rows (e0c03e2c916f63aa, 15bdbd0190913030, 5864d4f58bcccd88, 8787e304dbc782c4, 580fe29c88b0d8f1) in a reviewed migration. Append a superseded note to ledger Decisions row .claude/notes/ledger.md:7242 pointing at row 116. In health-check.ts flag a source whose events_found is identical >=14 runs while all its rows are past-dated; record the failure in docs/known-issues.md (First seen 2026-02-12).

**Evidence.**
- `scripts/scrape-benaki.ts:187-199,126` — if (exhibitions.length === 0) { log(…, 'Adding known exhibitions from research'); … title: 'Grand Tour', start_date: '2025-10-01', end_date: '2026-03-29'
- `scripts/scrape-all.ts:1644-1657 (scrapeBenakiAdapter)` — time: '10:00', // Default opening time ... genres: JSON.stringify(['Art', 'History', 'Culture']), ... location_status: 'verified_athens'
- `shell loop over logs/pipeline-*.log; logs/pipeline-2026-09-25.log:1151-1153 (host run)` — fallback fired in 205 logs, 176 with no 'Failed to load page' WARN; every run 'Completed: 4 exhibitions'; host: Loading … / Adding known … / 4 in 3.0s
- `sqlite3 -readonly data/events.db (source='benaki'; scrape_stats)` — e0c03e2c916f63aa|Grand Tour|2025-10-01T10:00:00|2026-03-29|verified_athens|updated 2026-10-05 21:45:42 (+3 rows, dup 580fe29c88b0d8f1); stats 4|success=1 every row

*Reported by:* source-puppeteer-trio.

### R05 [high] RA scraper fetches one page of 100 and silently truncates in high season

**Claim.** scrapeResidentAdvisor hard-codes pageSize 100 / page 1 and never loops; pipeline logs show totalResults exceeding 100 in 72 of 193 logged RA runs (max 153), so up to 53 events per day were never ingested between February and June 2026. Nothing warns when totalResults > fetched.

**Impact.** In the March–June club season 11–53 RA events per daily run (up to 35% of the Athens listing) never reached the DB. Because the query filters listingDate >= today ascending (inference), the dropped tail is the furthest-out dates, so far-ahead events appear only once nearer ones expire. Dormant today (81 < 100); recurs next spring with no alert.

**Recommendation.** In scripts/scrape-all.ts scrapeResidentAdvisor, loop `page` while fetched < totalResults and data.length === pageSize (cap at e.g. 5 pages, 500ms between pages), and emit a WARN log plus a scrape_stats note when totalResults > fetched. Pin with a test that stubs fetch to return totalResults 153 across two pages and asserts 153 events (tests/scripts/, mirroring scrape-clubber-feed-guard.test.ts's injectable fetch pattern — add a `fetchFn` parameter to the RA function the way scrapeClubber has one).

**Evidence.**
- `scripts/scrape-all.ts:1156-1159` — filters: { areas: { eq: 549 }, listingDate: { gte: "${today}" } }, pageSize: 100, page: 1
- `scripts/scrape-all.ts:1191` — console.log(   Found ${raEvents.length} events (${result.data.eventListings.totalResults} total));
- `grep 'Found 100 events (' logs/pipeline-*.log (files by month)` — 3 2026-02 / 11 2026-03 / 20 2026-04 / 27 2026-05 / 11 2026-06 — 72 of 193 files with a 'Found .* total' line
- `logs/pipeline-2026-05-08.log:2234; logs/pipeline-2026-10-05.log:740` — Found 100 events (153 total) … 2026-10-05: Found 81 events (81 total)

*Reported by:* source-ra-clubber.

### R06 [high] door_only_venues substring rule overrides RA's advance-price evidence for 20% of upcoming RA rows

**Claim.** validate-ticket-urls.ts --generate stamps ticket_url_status='door_only' on any with-ticket event whose venue_name contains a door_only_venues substring, before looking at the source. 12 of 61 upcoming shown RA rows carry an RA-listed advance price (8–22 EUR) at Aux Club, IT Athens, Oddity or 'Bios Ρομάντσο' and are nevertheless rendered 'At the door' with no link.

**Impact.** 12/61 (20%) of upcoming shown RA events tell visitors to pay at the door with no link, although the RA page carries the advance price and, for RA-ticketed events, the checkout. The rule hits every 'Bios Ρομάντσο' row via the 'Bios' and 'Romantso' substrings (42 RA rows) and also suppresses the rule-4.5 'Find tickets → listing' fallback.

**Recommendation.** In scripts/validate-ticket-urls.ts generateMissingUrls, skip the door_only branch when the row carries source-stated advance pricing (price_amount IS NOT NULL, or source='residentadvisor' with a non-TBA cost); better, move the door-only decision to ingest where RA's cost/isTicketed are visible, and make config/ticketing-mapping.json door_only_venues an exact canonical-name match rather than a substring. Re-run --generate on the 20 affected rows after the change.

**Evidence.**
- `scripts/validate-ticket-urls.ts:296-305` — if (config.door_only_venues.some(v => event.venue_name.toLowerCase().includes(v.toLowerCase()))) { doorOnly++; … doorOnlyStmt.run(event.id);
- `config/ticketing-mapping.json:120-131` — "door_only_venues": [ "Stoa Athanaton", "Klimataria", "Kavouras", "Romantso", "Bios", "AUX Club", "IT Athens", "Oddity", "Death Disco", "AN Club" ]
- `sqlite3 -readonly: upcoming shown RA rows with ticket_url_status='door_only' AND price_amount IS NOT NULL` — 12 rows, e.g. 4dc6353e047a9d70|Urban Danja…|Aux Club|18.0 ; 14ea0fd574e4a894|UNITECHNO…|Oddity|22.0 ; 78f13fb844e2f565|MO'FI…|Bios Ρομάντσο|10.0
- `src/ticketing/cta.ts:117-120` — // D7 rule 4: door_only — no URL, fixed label. if (status === 'door_only') { return { kind: 'door', label: t.doorOnly, href: null };

*Reported by:* source-ra-clubber.

### R07 [medium] Megaron scraper hard-codes building venue and with-ticket and writes no end_date; the detail page has hall, price and date range but the only detail-page pass is skipped in the container

**Claim.** scrape-megaron.ts writes venue_name 'Μέγαρο Μουσικής Αθηνών', price_type 'with-ticket' and no end_date for every row, although the detail page labels ΑΙΘΟΥΣΑ (e.g. Δημήτρης Μητρόπουλος), ΤΙΜΕΣ ΕΙΣΙΤΗΡΙΩΝ ('Είσοδος ελεύθερη με ηλεκτρονική κράτηση' for lectures) and the full ΗΜΕΡΕΣ ΚΑΙ ΩΡΕΣ range. enrich-time.ts already fetches that page but the container's freshness-mode run skips it, so container-created rows also lack times.

**Impact.** 110 upcoming rows (second-largest shown source) all point visitors at the main entrance with four decision-queue concerns open for garden, courtyard and small-hall events; 14 'other'-typed lectures publish as paid with a 'Find tickets' CTA and a seller in JSON-LD; the two ANNEX M exhibitions vanish after 8 and 15 October; container-created rows add a growing set of time-less events.

**Recommendation.** Extend scripts/enrich-time.ts's megaron.gr detail-page pass with extractHallMegaron and a ΤΙΜΕΣ ΕΙΣΙΤΗΡΙΩΝ reader: 'Είσοδος ελεύθερη'/'Δωρεάν' → price_type 'open' (door_policy_note 'ηλεκτρονική κράτηση' when present), a '€' list → with-ticket with price_amount = minimum; set end_date = last date of ΗΜΕΡΕΣ ΚΑΙ ΩΡΕΣ for type='exhibition'. Store the hall in a sub-venue field or append it to venue_name, and add the halls (Χρήστος Λαμπράκης, Δημήτρης Μητρόπουλος, Νίκος Σκαλκώτας, Αλεξάνδρα Τριάντη, Banquet, Συνεδριακού, Διδασκαλίας, Κήπος, Υπηρεσιακή Αυλή) as variations under the Megaron entry in config/athens-venues.json. Add end_date to the Megaron ScrapedEvent/adapter. Once the guard is proxy-aware (infra bucket), run enrich-time in the container's freshness run (it is a network read, not AI enrichment). Fixture test from a saved detail page; re-run on the 110 stored rows.

**Evidence.**
- `scripts/scrape-megaron.ts:17-27,144-149` — interface ScrapedEvent { title; start_date; time; url; venue_name; type; price_type } … venue_name: 'Μέγαρο Μουσικής Αθηνών', … price_type: 'with-ticket'
- `WebFetch https://www.megaron.gr/event/to-meteoro-vima-tis-ellinikis-georgias-…/ (DB row f14787fd6a239b6f = with-ticket)` — ΑΙΘΟΥΣΑ: "Δημήτρης Μητρόπουλος" … ΤΙΜΕΣ ΕΙΣΙΤΗΡΙΩΝ: "Είσοδος ελεύθερη με ηλεκτρονική κράτηση (έως 2 ανά άτομο)" … 7.12.2026 - 19:00
- `sqlite3 -readonly data/events.db (upcoming megaron.gr)` — Μέγαρο Μουσικής Αθηνών|Ilisia|110; with-ticket|110 (type other 14); exhibition 2, no end_date 2 (ANNEX M); created 2026-10-05: 2 rows, time_source NULL 2
- `scripts/daily-automated.sh:1578-1585; logs/pipeline-2026-10-05.log:666; docs/DECISIONS-QUEUE.md:26,37,38,63` — if [[ "$PIPELINE_MODE" != "freshness" ]]; then … run_time_enrichment … fi / 'Pipeline mode: freshness' / open: Courtyard, Garden, Mitropoulos, Διδασκαλίας

*Reported by:* source-halfnote-megaron-cometogether.

### R08 [medium] cometogether ignores __NEXT_DATA__ minPrice, start/end and category: flat '€N' prices lost, all rows date-only, 105/172 typed 'other' and Temple venue-lock flips metal gigs to dj_set

**Claim.** parseCometogetherListing extracts price only from 'από €N' (flat '€35' → tba → with-ticket with no amount), hard-codes time '' and end_date null, and types from a 10-entry TYPE_BY_TAG map (105 of 172 fixture events → 'other'), although every __NEXT_DATA__ event carries minPrice/maxPrice, ISO start/end with timeZone, and category/subCategories such as music_metal.

**Impact.** Every shown cometogether row (45) renders without a start time and multi-day festivals keep only their first day, so a 5-day festival drops out of 'upcoming' after day one; 45% of cards lose their price (4 shown rows have none today); 'other' is the parser's majority output, so the Temple venue-lock flips live metal gigs to dj_set (23 upcoming rows).

**Recommendation.** In scripts/scrape-cometogether.ts read __NEXT_DATA__ (props.pageProps.data.events) and take price_amount = minPrice, price_range 'από €min' or '€min–€max', price_type 'open' when minPrice === 0 (fallback regex /(?:από\s*)?€\s*(\d+(?:[.,]\d+)?)/); time = start converted to Europe/Athens HH:MM with luxon, end_date = end's Athens date when it differs, time_source 'scraped_listing'; for isMaster bundles emit one row per dates[] entry. Map category/subCategories to EventType (music_metal/rock → concert; electronic/house/techno → dj_set; theater, cinema, workshop → same; sports → other) with TYPE_BY_TAG as fallback. Move 'Temple' from venue_type_map to mixed_venues in config/venue-categories.json (Megaron/Rabbithole precedent); retype 0c98a59ec89686db. Fixture tests: 4482 → price 35, 20:30 local, concert; 3662 → end 2026-09-21.

**Evidence.**
- `scripts/scrape-cometogether.ts:45,49-53,89,107-108` — match(/από\s*€\s*(\d+…)/); TYPE_BY_TAG = {Ηλεκτρονική, House, Techno, Συναυλία, Live, Ροκ, Ραπ, Θέατρο, Φεστιβάλ, Stand-up}; end_date: null, time: ''
- `tests/fixtures/cometogether-listing.html __NEXT_DATA__ events[boxId=4482] (Temple, card prints '€35')` — "minPrice": 35, "start": "2026-09-19T17:30:00.000Z", "end": "2026-09-19T20:45:00.000Z", "category": "music", "subCategories": ["music_metal"]
- `bun scratch probe over the fixture (parseCometogetherListing); scripts/enrich-time.ts:27` — parsed 172; price_type { with-ticket: 93, tba: 78, open: 1 }, flat € cards 78 → all tba; type { other: 105, dj_set: 37, concert: 30 }; cometogether unsupported
- `sqlite3 -readonly data/events.db (shown upcoming cometogether); row 0c98a59ec89686db; config/venue-categories.json:32-34` — date_only 45|with_time 0|has_end 0; with-ticket 44, no_amount 4; 'Into the Darkness of Blue … LIVE at Black Temple'|Temple|dj_set; "Temple": "dj_set"

*Reported by:* source-halfnote-megaron-cometogether.

### R09 [medium] RA GraphQL selection requests no isTicketed, genre or artist fields; rows are hard-coded type 'concert' / genres ['electronic'] with ticket_url NULL

**Claim.** scrapeResidentAdvisor requests only id/title/date/startTime/venue/contentUrl/cost/images, hard-codes type 'concert' and genres '["electronic"]', and the INSERT has no ticket_url column, so every RA row saves ticket_url NULL and one genre. dj_set is repaired only by categorizeEventSimple's source hint; RA-ticketed events are never promoted to 'Buy tickets' because no ingest-time signal exists.

**Impact.** All 57 with-ticket upcoming RA rows get the weaker 'Find tickets' label and the JSON-LD Offer never distinguishes RA-ticketed checkout from listing-only events; dj_set genre sub-pages (techno/house) cannot be populated from RA and lineups are reverse-engineered from titles; a dry-run or any writer bypassing categorizeEventSimple would publish club nights as concerts. The docs claim fields the scraper does not request.

**Recommendation.** Verify field names with ONE introspection query on the next run (inference: RA's Event exposes isTicketed, genres { name }, artists { name }), then extend the GraphQL selection in scrapeResidentAdvisor. Set type 'dj_set' at ingest (keep the categorizer's concert override for live bills) and write genres from the API, falling back to ['electronic']. When isTicketed is true write ticket_url = `https://ra.co${contentUrl}` with status 'direct'; otherwise leave NULL/'unresolved'. This needs ticket_url in ScrapedEvent and the saveEvents INSERT — tests/no-bypass.test.ts allowlists that write by line range (see scripts/scrape-all.ts:1696-1699), so adjust the range. Add a tests/scripts test asserting a stubbed RA event emits dj_set with genres. Fix docs/SCRAPING-PIPELINE.md:91.

**Evidence.**
- `scripts/scrape-all.ts:1162-1174` — event { id title date startTime venue { name id } contentUrl cost images { filename type } }
- `scripts/scrape-all.ts:1235-1236,1455-1462` — type: 'concert', genres: '["electronic"]', … INSERT columns: venue_name, url, price_type, price_amount, price_range, source, … ticket_url_status (no ticket_url)
- `config/venue-categories.json:181-184; sqlite3 -readonly upcoming shown RA rows by type` — "source_type_hints": { "clubber.gr": "dj_set", "residentadvisor": "dj_set" } … dj_set|60 ; concert|1 (HVOB live)
- `src/ticketing/cta.ts:50-60; docs/SCRAPING-PIPELINE.md:91` — BUY_TICKETS_STATUSES = ['direct','detail_page','venue_registry_direct','venue_registry','crossref','ai_discovered'] … docs: 'ticket link, …, genre tags' provided

*Reported by:* source-ra-clubber.

### R10 [medium] Megaron typing drift: 'Προβολή' category unmapped (screenings typed theater/concert) and genres ['Classical','Concert'] stamped on every row

**Claim.** categoryToType is an exact-match switch over the nine strings seen on 2026-05-14; the live listing now shows 'Προβολή' (screening), which falls to 'other' and is then title-typed, so six upcoming NT Live / Met Opera Live screenings are stored as theater or concert. scrapeMegaronAdapter also writes fixed genres ['Classical','Concert'] on all 110 rows, including 44 non-concert ones.

**Impact.** Six upcoming screenings carry the wrong breadcrumb, hub and Schema.org @type (TheaterEvent/MusicEvent instead of ScreeningEvent) and the predicted CMS drift happened silently because unmapped categories are not logged; 44 upcoming non-concert Megaron rows (lectures, workshops, theatre, exhibitions) publish classical/concert genres and wrong genre filters.

**Recommendation.** Add `case 'Προβολή': return 'cinema';` to categoryToType in scripts/scrape-megaron.ts with a test in scripts/__tests__/scrape-megaron.test.ts; count category strings hitting the default branch in parseMegaronListing and print them in the scrape summary (surface via health-check) so the next new category is visible the day it appears; retype the six rows. Make genres type-conditional in scrapeMegaronAdapter (scripts/scrape-all.ts:1671: concert → ['Classical'], theater → ['Theater'], workshop → ['Education'], other → [] or ['Talk']), mirroring the Onassis fix, and backfill with a one-shot UPDATE scoped to source='megaron.gr'.

**Evidence.**
- `scripts/scrape-megaron.ts:37,48-59` — Spike ground truth: specs/megaron-category-titles-spike.md (9 distinct strings observed 2026-05-14) … case 'Μουσική' … case 'Online': … default: return 'other';
- `WebFetch https://www.megaron.gr/el/events (card 3); sqlite3 -readonly data/events.db` — Title: "National Theatre Live: Οι επικίνδυνες σχέσεις" … Category: "Προβολή" … DB 7eed9f780e138971|theater; 98ae980ce4f9dcd0|concert|Così fan tutte (6 rows)
- `scripts/scrape-all.ts:1671; sqlite3 -readonly (upcoming megaron.gr genres × type)` — genres: JSON.stringify(['Classical', 'Concert']), … ["Classical","Concert"]|concert|66; other|14; workshop|14; theater|9; performance|3; exhibition|2; festival|2
- `.claude/notes/ledger.md:10944,114; grep Προβολ scripts/__tests__/scrape-megaron.test.ts (no matches)` — Re-spike megaron.gr periodically. The 9-string mapping is a snapshot of 2026-05-14 … (Onassis) wrong Schema.org genre on every non-exhibition Onassis event

*Reported by:* source-halfnote-megaron-cometogether.

### R11 [medium] SNFCC category pages mostly surface sidebar/widget cards, not the listing; six category crawls yielded 7 events on the last host run

**Claim.** On the last host run the Music category page returned 12 identical 'Χορογραφημένα Σιντριβάνια' cards and Cinema and Performances returned the same 7-item set of venue/tour/program links — the signature of a widget, not the category listing. After exclusions the six category pages contributed 7 events; the /ekdiloseis/ main page added 3 of 91 /event/ anchors (inference from log shape).

**Impact.** SNFCC's category pages (the only place the scraper learns the event type) are effectively not read, so most SNFCC events reach the DB only via the main page's keyword-typing fallback (scrape-snfcc.ts:520-526) or not at all; the site lists 3 SNFCC rows today. Confidence is moderate: the category page could not be fetched (snfcc.org returns Akamai 403 to curl).

**Recommendation.** Spike one category page's rendered HTML via Puppeteer on the Mac into tests/fixtures/snfcc-category.html and classify which container holds the listing versus the sidebar; anchor the selector on the listing container (and `a[href*="/event/"]` inside it) rather than the generic `.x-box`/`.item` classes, and extract `<time datetime>` where present. Pull the page.evaluate body into a pure parseSnfccCategory(html) for fixture tests, as S164 did for Onassis.

**Evidence.**
- `logs/pipeline-2026-09-25.log (SNFCC section)` — Scraping Music (moysiki)... Found 12 items for Music ; Excluded (title): Χορογραφημένα Σιντριβάνια στο Κανάλι... (x12)
- `logs/pipeline-2026-09-25.log (SNFCC section)` — Found 7 items for Cinema ; Excluded (url): Ξεναγήσεις … Φάρος → /venue/faros/ … Πύργος Βιβλίων … Κόμβος Βιωσιμότητας (same block for Performances)
- `logs/pipeline-2026-09-25.log (SNFCC section)` — Found 7 events from category pages ... Added 3 new events from main page (91 total found) ... Total: 10 events extracted
- `scripts/scrape-snfcc.ts:243-245,258-263` — waitForSelector('article, .x-box, .item, [class*="event"]') … selectors = ['li.item article.x-box a', 'article.x-box a', '.post-list-container .item a', …]

*Reported by:* source-puppeteer-trio.

### R12 [medium] Clubber.gr must stay quarantined: iCal endpoint hangs, RSS is editorial, and scrapeClubber hard-codes door_only on every row

**Claim.** Quarantined since 2026-08-11 after an sgcaptcha challenge; on 2026-10-06 the iCal endpoint did not answer (25 s, 0 bytes) while /feed/ returned HTTP 200 RSS with 10 editorial items and advertised a wp-json root. An alternative feed exists but is prose, not structured events, and the existing scrapeClubber would label every revived row door_only/with-ticket/'Door price'.

**Impact.** Lifting the quarantine now would reinstate a source that errors every run; electronic coverage rests on RA alone (promoter-submitted events only). A revival through the old scraper would re-introduce 'Door price / door_only' on ticketed club nights (147 of 206 historical clubber rows), and crossReferenceClubberPrices stays dead code meanwhile.

**Recommendation.** Keep the quarantine entry. Spend the next probe budget on (a) https://www.clubber.gr/wp-json/tribe/events/v1/events (The Events Calendar REST endpoint implied by ?ical=1 — inference, unprobed) and (b) https://www.clubber.gr/events/ HTML; if (a) answers JSON, write a new adapter mapping venue/start_date/cost and dropping the hard-coded door_only. If neither works, either parse /feed/ articles as a low-volume AI-extracted source ('CRITICAL: Do not fabricate') or retire clubber from src/config/active-source-ids.ts with a decisions-queue entry and remove crossReferenceClubberPrices. Un-quarantine only after a dry-run shows BEGIN:VCALENDAR or the new adapter yields rows.

**Evidence.**
- `curl probes 2026-10-06 05:47 UTC: https://www.clubber.gr/events/?ical=1 and https://www.clubber.gr/feed/` — ical=1: curl (28) timed out after 25003 ms, 0 bytes … /feed/: HTTP/2 200, application/rss+xml, server: cloudflare, link <…/wp-json/>, 10 <item>
- `config/quarantined-sources.json; sqlite3 -readonly scrape_stats source='clubber' latest` — "since": "2026-08-11", "reason": "sgcaptcha wall since 2026-07-29 (S222)…" … 2026-08-11|0|0|feed is not iCal: body lacks BEGIN:VCALENDAR (text/html
- `scripts/scrape-all.ts:868-877; sqlite3 -readonly clubber.gr rows by ticket_url_status` — type: 'concert', genres: '["electronic"]', price_type: 'with-ticket', ticket_url_status: 'door_only', price_range: 'Door price' … door_only|147 generated|58
- `scripts/scrape-all.ts:1831; scripts/daily-automated.sh:260 (--crossref)` — if (doCrossRef && clubberEvents.length > 0 && raEvents.length > 0) { await crossReferenceClubberPrices(…) } — dead while clubber is quarantined

*Reported by:* source-ra-clubber.

### R13 [medium] RA TBA price loop: 20 ra.co page fetches per run, 0 prices recovered in all 219 logged runs

**Claim.** After the GraphQL call the scraper fetches up to 20 ra.co event pages for TBA-cost events; on the host those pages return 403 and in the container the guarded fetch fails before leaving the network. Every error is swallowed and the log reports 'Found 0 additional prices' on all 219 runs that logged the step.

**Impact.** 20 outbound requests per run (7,300+/year) that never succeed, two misleading log lines per run, and a 403-prone pattern against a site that already blocks the project. The 12 TBA-priced upcoming rows are written as with-ticket with no amount, which offer-builder omits from JSON-LD, and templates say nothing instead of 'price TBA'.

**Recommendation.** Delete the loop at scripts/scrape-all.ts:1247-1293 (or gate it behind an opt-in flag) and log the TBA count once. If price recovery matters, do it through a path that works: a headless page with guardPageRequests via the egress proxy, or accept RA's `cost` as the sole RA price source and let crossref fill gaps. Keep the 'tba' → with-ticket normalisation but consider a 'tba' marker in price_range so templates can say 'price TBA'.

**Evidence.**
- `scripts/scrape-all.ts:1247-1259,1288` — // Fetch prices from event pages for TBA events (up to 20) … safeFetch(event.url, …); if (!pageResponse.ok) continue; … } catch (err) { /* Skip on error */ }
- `grep -h 'additional prices from event pages' logs/pipeline-*.log | sort | uniq -c` — 219    Found 0 additional prices from event pages
- `.claude/notes/ledger.md:8562` — RA.co HTTP 403 on detail pages — … fetches of ra.co/events/NNN and ra.co/clubs/NNN returned 403.
- `src/db/database.ts:77; sqlite3 -readonly upcoming shown RA rows with-ticket AND price_amount IS NULL` — if (value === 'tba') return 'with-ticket';  // sentinel from scraper-side price-discovery failure … 12 rows

*Reported by:* source-ra-clubber.

### R14 [medium] Onassis talks typed 'tech': Συζήτηση/Διάλεξη map to 'other' and the shared categorizer's Greek talk keywords take over

**Claim.** onassisCategoryToType returns 'other' for 'Συζήτηση' and 'Διάλεξη', which triggers the categorizeEventSimple fallback; config/categorization-keywords.json lists 'συζήτηση', 'ομιλία', 'διάλεξη' under tech.title_keywords, so Onassis conversations are published under the Tech category.

**Impact.** A fashion-designer conversation at a cultural centre is listed on the Tech hub (schema EducationEvent via config line 454) and is absent from the talks/performance surfaces readers would look at; any Onassis Διάλεξη/Συζήτηση will follow the same path.

**Recommendation.** In onassisCategoryToType map 'Συζήτηση' and 'Διάλεξη' to an explicit non-tech type ('other' is honest; the vocabulary has no 'talk') and make the categorizer fallback run only when the label was unmapped (track `mapped` separately from the returned 'other'). Separately, review whether 'συζήτηση'/'ομιλία'/'διάλεξη' belong in tech.title_keywords at all — they are generic Greek talk words, not tech signals; moving them to description-level or dropping them fixes the same mis-typing for every source. Add a unit test for the Bella Freud title expecting not 'tech'.

**Evidence.**
- `scripts/scrape-onassis.ts:85-87,190-199` — case 'Συζήτηση': case 'Διάλεξη': return 'other'; … if (type === 'other') { type = categorizeEventSimple({ ... currentType: 'other' }); }
- `config/categorization-keywords.json:296-321 (tech.title_keywords)` — "συζήτηση", "ομιλία", "διάλεξη", "ημερίδα", "πάνελ", "παρουσίαση βιβλίου"
- `sqlite3 -readonly data/events.db (upcoming shown onassis rows)` — c6e114c5d2289a00|Onassis Discussions: Η Bella Freud σε μια συζήτηση με την Αφροδίτη Παναγιωτάκου|tech|2026-12-15|with-ticket
- `sqlite3 -readonly data/events.db (source='onassis' type distribution)` — workshop|7 exhibition|7 cinema|7 concert|4 theater|3 other|3 festival|2 tech|1

*Reported by:* source-puppeteer-trio.

### R15 [low] cometogether.live is not a known merchant, so the JSON-LD Offer is omitted for every with-ticket cometogether row although the listing URL is the organiser's checkout

**Claim.** For cometogether rows ticket_url equals the cometogether.live event page (trusted by ticket-trust rule (b) as source domain), but classifySource returns 'unclassified' because cometogether.live is absent from config/ticket-source-classification.json, and unclassified → omit Offer; cometogether is the ticket seller (its /buytickets/ path is what robots.txt disallows), so this is the wrong lane.

**Impact.** 44 shown with-ticket cometogether rows publish no Schema.org Offer (no price, no seller) while the CTA correctly links the same URL; AI engines and rich results see them as unpriced.

**Recommendation.** Add 'cometogether.live' to known_merchants in config/ticket-source-classification.json (and a display name in hostToName); keep the OPEN_LISTING_SOURCES trust rule unchanged (listing URL must stay on cometogether.live).

**Evidence.**
- `config/ticket-source-classification.json:2-16` — "known_merchants": ["more.com", "megaron.gr", "ticketservices.gr", "ra.co", "viva.gr", "onassis.org"] … "venue_direct_only": ["halfnote.gr", "benaki.org"]
- `src/utils/ticket-source-classifier.ts:61-67,136-138` — if (knownMerchants.has(host)) return 'known_merchant'; … return 'unclassified'; … unclassified → omit Offer
- `sqlite3 -readonly data/events.db (shown upcoming cometogether)` — cometogether|generated|42|has_ticket_url 42|ticket_eq_url 39 (44 shown with-ticket rows)
- `src/ticketing/ticket-trust.ts:123-124,144-146; scripts/scrape-cometogether.ts:5-6` — cometogether: ['https://cometogether.live'], … OPEN_LISTING_SOURCES = new Set(['residentadvisor', 'ra', 'ra.co', 'cometogether', …]); robots: /buytickets/* disallowed

*Reported by:* source-halfnote-megaron-cometogether.

### R16 [low] 23:59 start times on 48% of upcoming RA rows are written as trusted scraped times

**Claim.** 29 of 61 upcoming shown RA rows (and 214 of 1,053 RA rows overall) have time_doors '23:59' with time_source 'scraped_listing'; no other source produces 23:59. The value clusters by venue (SMUT 10/10, Aux Club 6/6, IT Athens 6/8), which reads as a promoter placeholder for 'midnight / not set' (inference), and propagates into descriptions.

**Impact.** Half of the RA listing shows a 23:59 start that is at best a convention and at worst wrong, with a time_source that claims scraped confidence; enrichment prose repeats it.

**Recommendation.** In scrapeResidentAdvisor, when startTime ends in 23:59 (or 23:59:59) write time '' and tag the row (time_source 'ra_placeholder' or a note in description) so templates render 'late night' and the enrichment brief does not quote 23:59; confirm against RA's endTime/doors fields once the query is extended (R09). Verify the inference on 3–5 event pages via the egress-proxied browser before changing behaviour.

**Evidence.**
- `sqlite3 -readonly: upcoming shown RA rows by time_doors` — 23:59|29 ; 23:00|12 ; 23:30|4 ; 22:00|4 ; …
- `sqlite3 -readonly: SUM(time_doors='23:59') by source, upcoming; by venue, upcoming shown RA` — residentadvisor|29|80 ; athinorama.gr|0|250 ; megaron.gr|0|110 ; more.com|0|57 … SMUT Athens|10|10 ; IT Athens|6|8 ; Aux Club|6|6 ; Universe|3|4
- `scripts/scrape-all.ts:1200,1518-1519` — const time = e.startTime?.match(/T(\d{2}:\d{2})/)?.[1] || ''; … const timeSource = e.time ? 'scraped_listing' : null;
- `docs/session-log.md:7565` — RA descriptions still state "23:59" in prose (re-enrichment).

*Reported by:* source-ra-clubber.

### R17 [low] RA venue strings written verbatim: 'TBA - <hint>' creates 21 phantom venues, 'Bios Ρομάντσο' lands on a whitelist entry conflating two buildings, and RA's venue id is discarded

**Claim.** scrapeResidentAdvisor writes e.venue.name verbatim and discards the venue id it requests. 46 RA rows (13 problematic, 33 unverified) sit under 21 'TBA - …' pseudo-venues that feed generateEventId, and 42 rows at 'Bios Ρομάντσο' match a whitelist entry whose variations cover both Bios (Pireos 84, Gazi) and Romantso (Anaxagora 3-5, Omonoia) with neighborhood 'Psyri'.

**Impact.** TBA rows are correctly hidden but inflate the unverified venue review queue, and a later disclosed venue produces a new id instead of updating the row. Bios Ρομάντσο event pages show a Psyri neighbourhood with Romantso's address, enrichment briefs pull Bios's sensory profile, and any 'Bios' string from another source lands on the same entry.

**Recommendation.** In scrapeResidentAdvisor normalise `^TBA\b` venue strings to venue_name 'TBA', location_status 'problematic', keep the hint in description, and compute the id from title+date+'TBA' so a venue reveal updates the same row. Keep RA's venue id via a small config map (ra_venue_id → canonical name) for exact matching per the Tier-1 'exact match, not LIKE' rule. Rename config/athens-venues.json:298 to canonical 'Romantso', neighborhood 'Omonoia', address 'Anaxagora 3-5', drop 'Bios'/'BIOS' from its variations (merge with the entry at 2374) and give the 'Bios' entry at 2381 its Pireos 84 address. Run /project:pre-venue-check first.

**Evidence.**
- `scripts/scrape-all.ts:1167,1230,1241` — venue { name id } … id: generateEventId(e.title, date, e.venue.name), … venue_name: e.venue.name,
- `sqlite3 -readonly: RA rows with venue_name LIKE 'TBA%' by location_status and distinct strings` — problematic|13 ; unverified|33 — e.g. TBA - Secret Location|7 ; TBA - ATHarea|4 ; TBA - UPON REGISTRATION|2 ; TBA - Ελασιδών 6 , Γκάζι|1
- `config/athens-venues.json:298-307,2374-2384` — "canonical_name": "Bios Ρομάντσο", "variations": ["Bios","BIOS","Romantso",…], "neighborhood": "Psyri", "address": "Anaxagora 3…"; separate Romantso (Omonoia), Bios (Gazi)
- `sqlite3 -readonly RA rows venue 'Bios Ρομάντσο'; docs/DECISIONS-QUEUE.md:18` — Bios Ρομάντσο|verified_athens|42 … d7a85542649321b8 fuzzy-matches Bios (Pireos 84, Gazi) but romantso.gr event 404 confirms Romantso, Anaxagora 3-5

*Reported by:* source-ra-clubber.

### R18 [low] Half Note and Megaron compute 'today' in UTC, against the project's Europe/Athens rule

**Claim.** Both scrapers filter past events with new Date().toISOString().split('T')[0], which is the UTC date; CLAUDE.md requires Europe/Athens. With the pipeline at ~23:53 Athens (20:53 UTC) the dates coincide, so impact is latent, but a run between 00:00 and 03:00 Athens keeps the previous day's events.

**Impact.** Latent off-by-one-day on early-morning runs; no current data defect observed.

**Recommendation.** Replace both with DateTime.now().setZone('Europe/Athens').toISODate() (luxon is already a dependency).

**Evidence.**
- `scripts/scrape-all.ts:1073 (scrapeHalfNote)` — const today = new Date().toISOString().split('T')[0];
- `scripts/scrape-megaron.ts:113` — if (new Date(startDate) < new Date(new Date().toISOString().split('T')[0])) continue;
- `.claude/CLAUDE.md Tier 1` — Timezone — always Europe/Athens … const today = DateTime.now().setZone('Europe/Athens').toISODate();

*Reported by:* source-halfnote-megaron-cometogether.
