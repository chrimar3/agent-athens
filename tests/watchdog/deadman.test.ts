import { describe, test, expect } from "bun:test";
import { classifyDeadman, type DeadmanInputs } from "../../src/watchdog/classifier";

const HOUR = 3_600_000;
const NOW = Date.parse("2026-06-29T12:00:00Z"); // fixed clock; pure fn, no Date.now()

// Base = everything healthy. Each test overrides only what it exercises.
function inputs(over: Partial<DeadmanInputs> = {}): DeadmanInputs {
  return {
    lastDeployMs: NOW - 2 * HOUR,
    lastEnrichMs: NOW - 2 * HOUR,
    pipelineHealthy: true,
    authPrecheckOk: true,
    nowMs: NOW,
    thresholds: { deployStaleHours: 36, enrichStaleHours: 36 },
    ...over,
  };
}

describe("classifyDeadman", () => {
  test("all signals fresh → OK", () => {
    expect(classifyDeadman(inputs()).status).toBe("OK");
  });

  test("auth corroboration null (log absent) does not flag when DB fresh → OK", () => {
    expect(classifyDeadman(inputs({ authPrecheckOk: null })).status).toBe("OK");
  });

  // Boundary: stale iff (now-ts)/h > threshold (strict >).
  test("deploy 35h old at 36h threshold → OK", () => {
    expect(classifyDeadman(inputs({ lastDeployMs: NOW - 35 * HOUR })).status).toBe("OK");
  });

  test("deploy exactly 36h old at 36h threshold → OK (strict >)", () => {
    expect(classifyDeadman(inputs({ lastDeployMs: NOW - 36 * HOUR })).status).toBe("OK");
  });

  test("deploy 37h old at 36h threshold → STALE_DEPLOY", () => {
    expect(classifyDeadman(inputs({ lastDeployMs: NOW - 37 * HOUR })).status).toBe("STALE_DEPLOY");
  });

  test("deploy fresh + enrich stale → STALE_ENRICH", () => {
    expect(classifyDeadman(inputs({ lastEnrichMs: NOW - 40 * HOUR })).status).toBe("STALE_ENRICH");
  });

  test("enrich fresh in DB but auth-precheck failing → STALE_ENRICH (auth corroborates)", () => {
    const r = classifyDeadman(inputs({ authPrecheckOk: false }));
    expect(r.status).toBe("STALE_ENRICH");
    expect(r.reasons.some((x) => /auth/i.test(x))).toBe(true);
  });

  test("deploy+enrich fresh, pipeline unhealthy → PIPELINE_FAIL", () => {
    expect(classifyDeadman(inputs({ pipelineHealthy: false })).status).toBe("PIPELINE_FAIL");
  });

  test("null deploy signal (missing) → STALE_DEPLOY", () => {
    expect(classifyDeadman(inputs({ lastDeployMs: null })).status).toBe("STALE_DEPLOY");
  });

  test("null enrich signal (missing) → STALE_ENRICH", () => {
    expect(classifyDeadman(inputs({ lastEnrichMs: null })).status).toBe("STALE_ENRICH");
  });

  // Outcome-first priority: a dark site (STALE_DEPLOY) headlines over enrich,
  // but reasons[] must name EVERY failing signal.
  test("multiple breaches → primary STALE_DEPLOY, reasons name all", () => {
    const r = classifyDeadman(
      inputs({ lastDeployMs: NOW - 50 * HOUR, lastEnrichMs: NOW - 50 * HOUR, pipelineHealthy: false }),
    );
    expect(r.status).toBe("STALE_DEPLOY");
    expect(r.reasons.length).toBeGreaterThanOrEqual(3);
    expect(r.reasons.join(" ")).toMatch(/deploy/i);
    expect(r.reasons.join(" ")).toMatch(/enrich/i);
    expect(r.reasons.join(" ")).toMatch(/pipeline/i);
  });

  test("stale reason names the stale-by duration in hours", () => {
    const r = classifyDeadman(inputs({ lastDeployMs: NOW - 48 * HOUR }));
    expect(r.reasons.join(" ")).toMatch(/48(\.0)?h/);
  });
});
