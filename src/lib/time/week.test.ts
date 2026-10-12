import { describe, expect, it } from "vitest";
import { firstDayOfWeek, localeFromAcceptLanguage } from "./week";

describe("firstDayOfWeek", () => {
  it.each([
    ["en-US", 0],
    ["uk-UA", 1],
    ["de-DE", 1],
    ["ar-EG", 6],
  ])("%s starts on %i", (locale, day) => {
    expect(firstDayOfWeek(locale)).toBe(day);
  });

  it("falls back to Monday", () => {
    expect(firstDayOfWeek(undefined)).toBe(1);
    expect(firstDayOfWeek("not a locale!")).toBe(1);
  });
});

describe("localeFromAcceptLanguage", () => {
  it("takes the first preference", () => {
    expect(localeFromAcceptLanguage("uk-UA,uk;q=0.9,en;q=0.8")).toBe("uk-UA");
    expect(localeFromAcceptLanguage("*")).toBeUndefined();
    expect(localeFromAcceptLanguage(null)).toBeUndefined();
  });
});
