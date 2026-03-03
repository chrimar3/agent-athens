import { describe, test, expect } from "bun:test";
import { STRINGS } from "../strings";
import type { UIStrings } from "../strings";

describe("i18n strings parity", () => {
  const elKeys = Object.keys(STRINGS.el) as (keyof UIStrings)[];
  const enKeys = Object.keys(STRINGS.en) as (keyof UIStrings)[];

  test("both locales have the same top-level keys", () => {
    expect(elKeys.sort()).toEqual(enKeys.sort());
  });

  test("typeLabels have matching keys", () => {
    expect(Object.keys(STRINGS.el.typeLabels).sort())
      .toEqual(Object.keys(STRINGS.en.typeLabels).sort());
  });

  test("typeDiscoveryLabels have matching keys", () => {
    expect(Object.keys(STRINGS.el.typeDiscoveryLabels).sort())
      .toEqual(Object.keys(STRINGS.en.typeDiscoveryLabels).sort());
  });

  test("practicalLabels have matching keys", () => {
    expect(Object.keys(STRINGS.el.practicalLabels).sort())
      .toEqual(Object.keys(STRINGS.en.practicalLabels).sort());
  });

  test("doorPolicies have matching keys", () => {
    expect(Object.keys(STRINGS.el.doorPolicies).sort())
      .toEqual(Object.keys(STRINGS.en.doorPolicies).sort());
  });

  test("hub keys exist in both locales", () => {
    const hubKeys = ['hubOverview', 'hubDetailed', 'hubFaq', 'hubEventCount', 'hubColEvent', 'hubColVenue', 'hubColDate', 'hubColEntry', 'hubFreeEntry', 'hubTicketed'];
    for (const key of hubKeys) {
      expect(STRINGS.el).toHaveProperty(key);
      expect(STRINGS.en).toHaveProperty(key);
      expect((STRINGS.el as any)[key].length).toBeGreaterThan(0);
      expect((STRINGS.en as any)[key].length).toBeGreaterThan(0);
    }
  });

  test("no empty string values in either locale", () => {
    for (const locale of ['el', 'en'] as const) {
      for (const [key, value] of Object.entries(STRINGS[locale])) {
        if (typeof value === 'string') {
          expect(value.length).toBeGreaterThan(0);
        }
      }
    }
  });
});
