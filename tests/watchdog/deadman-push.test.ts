/**
 * Outcome 3 — an alert must reach the operator off-machine.
 *
 * Layer 4: ntfy.sh push (no auth — the unguessable topic name is the only
 * access control, so the topic is a secret and lives outside the repo). Pins:
 *   (a) the { ok, skipped, detail } contract shared with sendEmail,
 *   (b) fault isolation — sendPush NEVER throws/rejects, so a push failure
 *       cannot crash or silence the other delivery layers,
 *   (c) DEADMAN_DRY_RUN=1 skips the send entirely,
 *   (d) enabled/server come from config/monitoring.json's `push` block; the
 *       TOPIC comes from $AGENTATHENS_NTFY_TOPIC or an untracked file
 *       (~/.config/agentathens/ntfy-topic), never from the tracked config,
 *   (e) no config secrets leak into the request, and the tracked config holds
 *       no topic.
 *
 * All network is a captured stub — no live calls to ntfy.sh.
 */
import { describe, test, expect, beforeEach, afterEach, afterAll } from "bun:test";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { sendPush, resolvePushTopic, type MonitoringConfig } from "../../scripts/deadman-watchdog";

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
      : { push: { enabled: true, server: "https://ntfy.example", ...pushOver } }),
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

const TOPIC = "agentathens-deadman-feedfacefeedfacefeedfacefeedface";
const ENV_KEYS = ["DEADMAN_DRY_RUN", "AGENTATHENS_NTFY_TOPIC", "AGENTATHENS_NTFY_TOPIC_FILE"] as const;
const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
const work = mkdtempSync(join(tmpdir(), "aa-deadman-push-"));
// Never read the operator's real ~/.config file from a test: every test points
// the topic file at a path inside the temp dir (absent unless a test writes it).
const topicFile = join(work, "ntfy-topic");
beforeEach(() => {
  process.env.AGENTATHENS_NTFY_TOPIC = TOPIC;
  process.env.AGENTATHENS_NTFY_TOPIC_FILE = topicFile;
  rmSync(topicFile, { force: true });
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});
afterAll(() => rmSync(work, { recursive: true, force: true }));

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
    process.env.AGENTATHENS_NTFY_TOPIC = "  ";
    const { fn, calls } = capture(200);
    const r = await sendPush(cfg(), "t", "b", fn);
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

describe("push topic — read from env or an untracked file, never the tracked config", () => {
  test("topic from $AGENTATHENS_NTFY_TOPIC is the whole address", async () => {
    const { fn, calls } = capture(200);
    const r = await sendPush(cfg(), "t", "b", fn);
    expect(r.ok).toBe(true);
    expect(calls[0].url).toBe(`https://ntfy.example/${TOPIC}`);
  });

  test("env unset → topic read (trimmed) from the topic file", async () => {
    delete process.env.AGENTATHENS_NTFY_TOPIC;
    writeFileSync(topicFile, "agentathens-deadman-0123456789abcdef0123456789abcdef\n");
    const { fn, calls } = capture(200);
    const r = await sendPush(cfg(), "t", "b", fn);
    expect(r.ok).toBe(true);
    expect(calls[0].url).toBe("https://ntfy.example/agentathens-deadman-0123456789abcdef0123456789abcdef");
  });

  test("env wins over the file", () => {
    writeFileSync(topicFile, "agentathens-deadman-from-file\n");
    expect(resolvePushTopic()).toEqual({ topic: TOPIC });
  });

  test("neither env nor file → skipped, fetch never called, detail says where to put the topic", async () => {
    delete process.env.AGENTATHENS_NTFY_TOPIC;
    const { fn, calls } = capture(200);
    const r = await sendPush(cfg(), "t", "b", fn);
    expect(r.ok).toBe(false);
    expect(r.skipped).toBe(true);
    expect(r.detail).toContain("AGENTATHENS_NTFY_TOPIC");
    expect(r.detail).toContain(topicFile);
    expect(calls.length).toBe(0);
  });

  test("a topic left in the tracked config is ignored (not a fallback)", async () => {
    delete process.env.AGENTATHENS_NTFY_TOPIC;
    const { fn, calls } = capture(200);
    const r = await sendPush(cfg({ topic: "agentathens-deadman-legacy" }), "t", "b", fn);
    expect(r.skipped).toBe(true);
    expect(calls.length).toBe(0);
  });

  test("a topic that is not a bare ntfy name (path, query, spaces) → skipped, never sent", async () => {
    for (const bad of ["../x", "a/b", "a?b=c", "two words", "x".repeat(65)]) {
      process.env.AGENTATHENS_NTFY_TOPIC = bad;
      const { fn, calls } = capture(200);
      const r = await sendPush(cfg(), "t", "b", fn);
      expect(r.skipped).toBe(true);
      expect(r.detail).not.toContain(bad);
      expect(calls.length).toBe(0);
    }
  });
});

describe("config/monitoring.json push block", () => {
  const text = readFileSync(join(ROOT, "config", "monitoring.json"), "utf-8");
  const raw = JSON.parse(text);

  test("push block exists, enabled, pointing at ntfy.sh", () => {
    expect(raw.push).toBeDefined();
    expect(raw.push.enabled).toBe(true);
    expect(raw.push.server).toBe("https://ntfy.sh");
  });

  test("the tracked config carries no topic (it is the channel's only access control)", () => {
    expect(raw.push.topic).toBeUndefined();
    expect(text).not.toMatch(/agentathens-deadman-[0-9a-f]{8,}/);
  });

  test("email block is untouched: enabled, gmail account, confirmed-correct recipient", () => {
    // Outcome 3 explicitly forbids "fixing" email — pin it so this change cannot drift it.
    expect(raw.email).toEqual({ enabled: true, recipient: "cmaragre@gmail.com", msmtp_account: "gmail" });
  });
});
