import { test, expect } from "bun:test";

// Throwaway: proves the required `ci` check fails on a failing test. Never merge.
test("agent-layer verify: this test is meant to fail", () => {
  expect(1).toBe(2);
});
