import { describe, expect, it } from "vitest";
import { addDays, jstDateString, recentDateStrings } from "../date";

describe("jstDateString", () => {
  it("converts a UTC instant just before midnight JST to the correct JST date", () => {
    // 2026-07-05T14:59:59Z = 2026-07-05T23:59:59+09:00
    expect(jstDateString(new Date("2026-07-05T14:59:59Z"))).toBe("2026-07-05");
  });

  it("converts a UTC instant just after midnight JST to the next JST date", () => {
    // 2026-07-05T15:00:00Z = 2026-07-06T00:00:00+09:00
    expect(jstDateString(new Date("2026-07-05T15:00:00Z"))).toBe("2026-07-06");
  });
});

describe("addDays", () => {
  it("adds positive days across a month boundary", () => {
    expect(addDays("2026-06-29", 3)).toBe("2026-07-02");
  });

  it("subtracts days across a year boundary", () => {
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  });
});

describe("recentDateStrings", () => {
  it("returns the requested number of dates, oldest first, ending at the given date", () => {
    expect(recentDateStrings(3, "2026-07-06")).toEqual(["2026-07-04", "2026-07-05", "2026-07-06"]);
  });
});
