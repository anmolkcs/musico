import { afterEach, describe, expect, it, vi } from "vitest";
import {
  _resetSaavnCache,
  cacheKey,
  fetchSaavnArtwork,
  normalizeTitle,
  scoreResult,
  upscaleSaavnImage,
} from "../lib/saavn-art";

function mockSearch(results: unknown[]) {
  return vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ results }) }))
  );
}

describe("upscaleSaavnImage", () => {
  it("swaps dash sizes for 500x500 and passes unknown shapes through", () => {
    expect(upscaleSaavnImage("https://c.saavncdn.com/077/x-150x150.jpg")).toBe(
      "https://c.saavncdn.com/077/x-500x500.jpg"
    );
    // Underscore artist paths are not song art — never manufacture a URL.
    expect(upscaleSaavnImage("https://c.saavncdn.com/artists/y_50x50.jpg")).toBe(
      "https://c.saavncdn.com/artists/y_50x50.jpg"
    );
  });
});

describe("cacheKey", () => {
  it("normalizes noise so suffix variants share one entry", () => {
    expect(cacheKey("Blinding Lights (Official Video)", "The Weeknd")).toBe(
      cacheKey("Blinding Lights", "The Weeknd")
    );
  });
});

describe("normalizeTitle", () => {
  it("strips YouTube suffixes and brackets", () => {
    expect(normalizeTitle("Blinding Lights (Official Video)")).toEqual(["blinding", "lights"]);
    expect(normalizeTitle("Tum Hi Ho - Lyrics | Arijit Singh")).toEqual(["tum", "hi", "ho", "arijit", "singh"]);
  });
});

describe("scoreResult", () => {
  it("scores exact matches highest and rejects mismatches", () => {
    const exact = scoreResult("Blinding Lights", "The Weeknd", {
      title: "Blinding Lights",
      subtitle: "The Weeknd - After Hours",
      type: "song",
    });
    const remix = scoreResult("Blinding Lights", "The Weeknd", {
      title: "Blinding Lights (Major Lazer Remix)",
      subtitle: "The Weeknd",
      type: "song",
    });
    // Extra non-bracketed tokens score below the exact title.
    const edition = scoreResult("Blinding Lights", "The Weeknd", {
      title: "Blinding Lights Major Lazer Remix Edition",
      subtitle: "The Weeknd",
      type: "song",
    });
    const other = scoreResult("Blinding Lights", "The Weeknd", {
      title: "Save Your Tears",
      subtitle: "The Weeknd",
      type: "song",
    });
    expect(exact).toBeGreaterThanOrEqual(remix);
    expect(exact).toBeGreaterThan(edition);
    expect(remix).toBeGreaterThan(0);
    expect(other).toBe(0);
  });

  it("requires artist evidence for short titles", () => {
    expect(
      scoreResult("Lights", "", { title: "Blinding Lights", subtitle: "The Weeknd", type: "song" })
    ).toBe(0);
    expect(
      scoreResult("Blinding Lights", "", { title: "Blinding Lights", subtitle: "The Weeknd", type: "song" })
    ).toBe(0);
    expect(
      scoreResult("Blinding Lights", "The Weeknd", { title: "Blinding Lights", subtitle: "The Weeknd", type: "song" })
    ).toBeGreaterThan(0);
  });

  it("rejects confident mismatches below the absolute cutoff", () => {
    // Half the title + full artist bonus must not clear the bar.
    expect(
      scoreResult("Blinding Tears", "The Weeknd", {
        title: "Blinding Lights",
        subtitle: "The Weeknd - After Hours",
        type: "song",
      })
    ).toBe(0);
  });

  it("rejects wrong editions by duration when both are known", () => {
    const live = { title: "Blinding Lights", subtitle: "The Weeknd", type: "song", more_info: { duration: "420" } };
    expect(scoreResult("Blinding Lights", "The Weeknd", live, 200)).toBe(0);
    expect(scoreResult("Blinding Lights", "The Weeknd", live)).toBeGreaterThan(0);
    const studio = { title: "Blinding Lights", subtitle: "The Weeknd", type: "song", more_info: { duration: "203" } };
    expect(scoreResult("Blinding Lights", "The Weeknd", studio, 200)).toBeGreaterThan(0);
  });
});

describe("fetchSaavnArtwork", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    _resetSaavnCache();
  });

  it("returns the upscaled best match", async () => {
    mockSearch([
      { title: "Blinding Lights (Remix)", subtitle: "Someone Else", type: "song", image: "https://c.saavncdn.com/1/x-150x150.jpg" },
      { title: "Blinding Lights", subtitle: "The Weeknd - After Hours", type: "song", image: "https://c.saavncdn.com/077/After-Hours-150x150.jpg" },
    ]);
    await expect(fetchSaavnArtwork("Blinding Lights", "The Weeknd")).resolves.toBe(
      "https://c.saavncdn.com/077/After-Hours-500x500.jpg"
    );
  });

  it("returns null when nothing matches or the request fails", async () => {
    mockSearch([{ title: "Unrelated Song", subtitle: "Nobody", type: "song", image: "https://c.saavncdn.com/1/x-150x150.jpg" }]);
    await expect(fetchSaavnArtwork("Blinding Lights", "The Weeknd")).resolves.toBeNull();

    vi.unstubAllGlobals();
    _resetSaavnCache();
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: 503, status: 503, json: async () => ({}) })));
    await expect(fetchSaavnArtwork("Blinding Lights", "The Weeknd")).resolves.toBeNull();
  });

  it("caches results and dedupes in-flight requests", async () => {
    const spy = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        results: [{ title: "Blinding Lights", subtitle: "The Weeknd", type: "song", image: "https://c.saavncdn.com/1/x-150x150.jpg" }],
      }),
    }));
    vi.stubGlobal("fetch", spy);
    const [a, b] = await Promise.all([
      fetchSaavnArtwork("Blinding Lights", "The Weeknd"),
      fetchSaavnArtwork("Blinding Lights", "The Weeknd"),
    ]);
    expect(a).toBe(b);
    expect(spy).toHaveBeenCalledTimes(1);
    await fetchSaavnArtwork("Blinding Lights", "The Weeknd");
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("never caches transient errors — the next call retries", async () => {
    const spy = vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) }));
    vi.stubGlobal("fetch", spy);
    await expect(fetchSaavnArtwork("Blinding Lights", "The Weeknd")).resolves.toBeNull();
    await expect(fetchSaavnArtwork("Blinding Lights", "The Weeknd")).resolves.toBeNull();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("never caches aborts — the next call retries", async () => {
    const spy = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        results: [{ title: "Blinding Lights", subtitle: "The Weeknd", type: "song", image: "https://c.saavncdn.com/1/x-150x150.jpg" }],
      }),
    }));
    vi.stubGlobal("fetch", spy);
    const controller = new AbortController();
    controller.abort();
    await expect(fetchSaavnArtwork("Blinding Lights", "The Weeknd", 0, controller.signal)).resolves.toBeNull();
    await expect(fetchSaavnArtwork("Blinding Lights", "The Weeknd")).resolves.toContain("500x500");
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("expires definitive no-matches so later calls retry", async () => {
    vi.useFakeTimers();
    try {
      const spy = vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ results: [] }),
      }));
      vi.stubGlobal("fetch", spy);
      await expect(fetchSaavnArtwork("Blinding Lights", "The Weeknd")).resolves.toBeNull();
      await expect(fetchSaavnArtwork("Blinding Lights", "The Weeknd")).resolves.toBeNull();
      expect(spy).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(11 * 60_000);
      await expect(fetchSaavnArtwork("Blinding Lights", "The Weeknd")).resolves.toBeNull();
      expect(spy).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects non-Saavn and non-song images", async () => {
    mockSearch([
      { title: "Blinding Lights", subtitle: "The Weeknd", type: "song", image: "https://i.ytimg.com/vi/abc/hqdefault.jpg" },
      { title: "Blinding Lights", subtitle: "The Weeknd", type: "album", image: "https://c.saavncdn.com/1/x-150x150.jpg" },
    ]);
    await expect(fetchSaavnArtwork("Blinding Lights", "The Weeknd")).resolves.toBeNull();
  });

  it("evicts oldest entries past the cap", async () => {
    const spy = vi.fn(async (url: any) => {
      const q = new URL(String(url)).searchParams.get("q") ?? "song";
      return {
        ok: true,
        status: 200,
        json: async () => ({
          results: [{ title: q, subtitle: q, type: "song", image: "https://c.saavncdn.com/9/x-150x150.jpg" }],
        }),
      };
    });
    vi.stubGlobal("fetch", spy);
    await fetchSaavnArtwork("Evict Zero", "Singer");
    for (let i = 1; i <= 300; i++) {
      await fetchSaavnArtwork(`Evict Song ${i}`, "Singer");
    }
    expect(spy).toHaveBeenCalledTimes(301);
    // The first entry was evicted — fetching it again hits the network.
    await fetchSaavnArtwork("Evict Zero", "Singer");
    expect(spy).toHaveBeenCalledTimes(302);
  });
});
