import { describe, test, expect } from "bun:test";
import { localeUrl } from "../locale-url";

describe("localeUrl", () => {
  test("default locale returns path without prefix", () => {
    expect(localeUrl("this-weekend")).toBe("/this-weekend/");
  });

  test("explicit 'en' locale matches default behavior", () => {
    expect(localeUrl("this-weekend", "en")).toBe("/this-weekend/");
  });

  test("non-default locale prefixes with locale code", () => {
    expect(localeUrl("this-weekend", "el")).toBe("/el/this-weekend/");
  });

  test("empty path returns locale root: '/' for default", () => {
    expect(localeUrl("")).toBe("/");
  });

  test("empty path returns '/${locale}/' for non-default", () => {
    expect(localeUrl("", "el")).toBe("/el/");
  });

  test("defensive normalization: leading/trailing slashes are stripped", () => {
    expect(localeUrl("/this-weekend/")).toBe("/this-weekend/");
    expect(localeUrl("/this-weekend", "el")).toBe("/el/this-weekend/");
  });
});
