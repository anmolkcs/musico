import { describe, expect, it } from "vitest";
import { parseLrc, serializeLrc, activeLineIndex } from "../lib/lrc";

describe("parseLrc", () => {
  it("parses basic timestamps", () => {
    const lines = parseLrc("[01:05.20]Hello world");
    expect(lines).toEqual([{ time: 65.2, text: "Hello world" }]);
  });

  it("supports multiple stamps per line (repeated chorus)", () => {
    const lines = parseLrc("[00:10]Chorus[01:30]Chorus");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toEqual({ time: 10, text: "Chorus" });
    expect(lines[1]).toEqual({ time: 90, text: "Chorus" });
  });

  it("sorts output by time", () => {
    const lines = parseLrc("[00:30]B\n[00:10]A");
    expect(lines.map((l) => l.text)).toEqual(["A", "B"]);
  });

  it("ignores non-lyric metadata lines like [ar:]", () => {
    const lines = parseLrc("[ar:Avicii]\n[00:05]Song text");
    expect(lines).toEqual([{ time: 5, text: "Song text" }]);
  });

  it("handles comma fractional separator and 3-digit fractions", () => {
    const lines = parseLrc("[01:05,123]Hey");
    expect(lines[0].time).toBeCloseTo(65.123, 3);
  });

  it("returns empty array for empty input", () => {
    expect(parseLrc("")).toEqual([]);
  });
});

describe("serializeLrc", () => {
  it("round-trips through parseLrc", () => {
    const original = "[01:05.20]Hello world\n[02:00.00]Bye";
    const parsed = parseLrc(original);
    const reserialized = serializeLrc(parsed);
    expect(parseLrc(reserialized)).toEqual(parsed);
  });
});

describe("activeLineIndex", () => {
  const lines = [
    { time: 0, text: "a" },
    { time: 10, text: "b" },
    { time: 20, text: "c" },
  ];

  it("returns -1 before the first line", () => {
    expect(activeLineIndex([], 0)).toBe(-1);
  });

  it("tracks the current line with a small lead tolerance", () => {
    expect(activeLineIndex(lines, 9.5)).toBe(0);
    expect(activeLineIndex(lines, 10.2)).toBe(1);
    expect(activeLineIndex(lines, 100)).toBe(2);
  });
});
