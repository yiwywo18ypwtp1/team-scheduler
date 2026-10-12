import { describe, expect, it } from "vitest";
import { canonicalTimeZone } from "./time-zones";
import { isValidTimeZone } from "./zoned";

describe("canonicalTimeZone", () => {
  it("maps legacy names reported by browsers to current ones", () => {
    expect(canonicalTimeZone("Asia/Calcutta")).toBe("Asia/Kolkata");
    expect(canonicalTimeZone("Europe/Kiev")).toBe("Europe/Kyiv");
  });

  it("keeps current names as they are", () => {
    expect(canonicalTimeZone("America/New_York")).toBe("America/New_York");
  });

  it("only maps to zones the runtime knows", () => {
    for (const zone of ["Asia/Kolkata", "Europe/Kyiv", "Asia/Ho_Chi_Minh", "America/Nuuk"]) {
      expect(isValidTimeZone(canonicalTimeZone(zone))).toBe(true);
    }
  });
});
