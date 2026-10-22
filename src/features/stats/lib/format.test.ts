import { describe, it, expect } from "vitest";
import { formatHour, formatNumber, formatWeek, localDate } from "./format";

/** ICU puts narrow and non-breaking spaces between the parts. */
const plain = (text: string) => text.replace(/\s/g, " ");

describe("format", () => {
  it("reads a date as local midnight", () => {
    expect(localDate("2026-10-05")).toEqual(new Date(2026, 9, 5));
  });

  it("formats a week as one range", () => {
    expect(plain(formatWeek({ start: "2026-10-12", end: "2026-10-18" }, "en"))).toBe("Oct 12 – 18");
  });

  it("follows the locale's clock and digit grouping", () => {
    expect(formatHour(23, "ru")).toBe("23:00");
    expect(plain(formatHour(23, "en"))).toBe("11:00 PM");
    expect(formatNumber(3766, "en")).toBe("3,766");
  });
});
