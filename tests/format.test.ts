import { describe, expect, it } from "vitest";
import { formatDuration, extFor, timeAgo } from "../lib/format";

describe("formatDuration", () => {
  it("formats minutes and seconds", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(65)).toBe("1:05");
    expect(formatDuration(202)).toBe("3:22");
  });

  it("formats hours", () => {
    expect(formatDuration(3600)).toBe("1:00:00");
    expect(formatDuration(3723)).toBe("1:02:03");
  });

  it("handles missing / invalid values", () => {
    expect(formatDuration(null)).toBe("--:--");
    expect(formatDuration(undefined)).toBe("--:--");
    expect(formatDuration(-5)).toBe("--:--");
    expect(formatDuration(Infinity)).toBe("--:--");
    expect(formatDuration(NaN)).toBe("--:--");
  });

  it("floors fractional seconds", () => {
    expect(formatDuration(65.9)).toBe("1:05");
  });
});

describe("extFor", () => {
  it("maps known containers", () => {
    expect(extFor("m4a")).toBe("m4a");
    expect(extFor("webm")).toBe("webm");
    expect(extFor("webma")).toBe("webm");
    expect(extFor("opus")).toBe("ogg");
    expect(extFor("ogg")).toBe("ogg");
  });

  it("defaults to m4a for unknown formats", () => {
    expect(extFor("mp3")).toBe("m4a");
    expect(extFor("")).toBe("m4a");
  });
});

describe("timeAgo", () => {
  const now = Date.parse("2026-09-08T12:00:00Z");

  it("describes recent timestamps", () => {
    expect(timeAgo(now - 30_000, now)).toBe("just now");
    expect(timeAgo(now - 5 * 60_000, now)).toBe("5m ago");
    expect(timeAgo(now - 3 * 3_600_000, now)).toBe("3h ago");
    expect(timeAgo(now - 2 * 86_400_000, now)).toBe("2d ago");
  });

  it("falls back to a date string for old timestamps", () => {
    const old = Date.parse("2026-01-01T00:00:00Z");
    expect(timeAgo(old, now)).toBe(new Date(old).toLocaleDateString());
  });
});
