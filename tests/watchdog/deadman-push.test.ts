/**
 * Outcome 3 — an alert must reach the operator off-machine.
 *
 * Layer 4: ntfy.sh push (no auth, no stored secret — the unguessable topic
 * name is the only access control). Pins:
 *   (a) the { ok, skipped, detail } contract shared with sendEmail,
 *   (b) fault isolation — sendPush NEVER throws/rejects, so a push failure
 *       cannot crash or silence the other delivery layers,
 *   (c) DEADMAN_DRY_RUN=1 skips the send entirely,
 *   (d) config comes from config/monitoring.json's `push` block,
 *   (e) the topic is unguessable and no config secrets leak into the request.
 *
 * All network is a captured stub — no live calls to ntfy.sh.
 */
import { describe, test, expect, afterEach } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sendPush, type MonitoringConfig } from "../../scripts/deadman-watchdog";

const ROOT = join(import.meta.dir, "..", "..");

function cfg(pushOver: Record<string, unknown> | null = {}): MonitoringConfig {
  return {
    deploy_stale_hours: 36,
    enrich_stale_hours: 36,
    pipeline_health_labels: [],
    notify: { enabled: false },
    email: { enabled: false, recipient: "operator-secret@example.com", msmtp_account: "gmail" },
    ...(pushOver === null
      ? {}
      : { push: { enabled: true, server: "https://ntfy.example", topic: "agentathens-deadman-feedfacefeedfacefeedfacefeedface", ...pushOver } }),
  } as MonitoringConfig;
}

/** fetch stub that records every call and returns the given status. */
function capture(status = 200) {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fn = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response("{}", { status });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

const savedDry = process.env.DEADMAN_DRY_RUN;
afterEach(() => {
  if (savedDry === undefined) delete process.env.DEADMAN_DRY_RUN;
  else process.env.DEADMAN_DRY_RUN = savedDry;
});

describe("sendPush — { ok, skipped, detail } contract", () => {
  test("successful 2xx post → { ok: true, skipped: false, detail: 'sent' }", async () => {
    const { fn } = capture(200);
    const r = await sendPush(cfg(), "Agent Athens DEADMAN: STALE_DEPLOY", "deploy 48h stale", fn);
    expect(r).toEqual({ ok: true, skipped: false, detail: "sent" });
  });

  test("posts to server/topic with the title and body — topic is the whole address", async () => {
    const { fn, calls } = capture(200);
    await sendPush(cfg(), "Agent Athens DEADMAN: SOURCE_DEAD", "source dead: clubber", fn);
    expect(calls.length).toBe(1);
    expect(calls[0].url).toBe("https://ntfy.example/agentathens-deadman-feedfacefeedfacefeedfacefeedface");
    expect(calls[0].init?.method).toBe("POST");
    expect(String(calls[0].init?.body)).toContain("source dead: clubber");
  });

  test("no config secrets leak into the request (recipient email must not appear)", async () => {
    const { fn, calls } = capture(200);
    await sendPush(cfg(), "Agent Athens DEADMAN: STALE_ENRICH", "enrich 40h stale", fn);
    const wire = JSON.stringify(calls);
    expect(wire.includes("operator-secret@example.com")).toBe(false);
  });

  test("non-2xx response → ok:false, skipped:false, detail names the HTTP status", async () => {
    const { fn } = capture(507);
    const r = await sendPush(cfg(), "t", "b", fn);
    expect(r.ok).toBe(false);
    expect(r.skipped).toBe(false);
    expect(r.detail).toMatch(/507/);
  });
});

describe("sendPush — fault isolation (a push failure cannot crash other layers)", () => {
  test("rejecting fetch resolves (never rejects) with ok:false and a usable detail", async () => {
    const fn = (async () => {
      throw new Error("getaddrinfo ENOTFOUND ntfy.example");
    }) as unknown as typeof fetch;
    const r = await sendPush(cfg(), "t", "b", fn);
    expect(r.ok).toBe(false);
    expect(r.skipped).toBe(false);
    expect(r.detail).toMatch(/ENOTFOUND/);
  });

  test("synchronously-throwing fetch still resolves with ok:false", async () => {
    const fn = (() => {
      throw new Error("sync boom");
    }) as unknown as typeof fetch;
    const r = await sendPush(cfg(), "t", "b", fn);
    expect(r.ok).toBe(false);
    expect(r.detail).toMatch(/sync boom/);
  });
});

describe("sendPush — skip conditions", () => {
  test("push disabled in config → skipped, fetch never called", async () => {
    const { fn, calls } = capture(200);
    const r = await sendPush(cfg({ enabled: false }), "t", "b", fn);
    expect(r.ok).toBe(false);
    expect(r.skipped).toBe(true);
    expect(calls.length).toBe(0);
  });

  test("push block absent entirely → skipped (older configs must not crash)", async () => {
    const { fn, calls } = capture(200);
    const r = await sendPush(cfg(null), "t", "b", fn);
    expect(r.skipped).toBe(true);
    expect(calls.length).toBe(0);
  });

  test("blank topic → skipped, fetch never called", async () => {
    const { fn, calls } = capture(200);
    const r = await sendPush(cfg({ topic: "  " }), "t", "b", fn);
    expect(r.skipped).toBe(true);
    expect(calls.length).toBe(0);
  });

  test("DEADMAN_DRY_RUN=1 → skipped, fetch never called", async () => {
    process.env.DEADMAN_DRY_RUN = "1";
    const { fn, calls } = capture(200);
    const r = await sendPush(cfg(), "t", "b", fn);
    expect(r.ok).toBe(false);
    expect(r.skipped).toBe(true);
    expect(r.detail).toMatch(/dry.?run/i);
    expect(calls.length).toBe(0);
  });
});

describe("config/monitoring.json push block", () => {
  const raw = JSON.parse(readFileSync(join(ROOT, "config", "monitoring.json"), "utf-8"));

  test("push block exists, enabled, pointing at ntfy.sh", () => {
    expect(raw.push).toBeDefined();
    expect(raw.push.enabled).toBe(true);
    expect(raw.push.server).toBe("https://ntfy.sh");
  });

  test("topic is unguessable: prefixed + 32 hex chars of entropy (128 bits)", () => {
    expect(raw.push.topic).toMatch(/^agentathens-deadman-[0-9a-f]{32}$/);
  });

  test("email block is untouched: enabled, gmail account, confirmed-correct recipient", () => {
    // Outcome 3 explicitly forbids "fixing" email — pin it so this change cannot drift it.
    expect(raw.email).toEqual({ enabled: true, recipient: "cmaragre@gmail.com", msmtp_account: "gmail" });
  });
});
