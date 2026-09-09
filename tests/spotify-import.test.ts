import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchSpotifyCollection, parseSpotifyInput } from "../lib/spotify-import";

describe("parseSpotifyInput", () => {
  it("parses playlist links", () => {
    expect(parseSpotifyInput("https://open.spotify.com/playlist/37i9dQZEVXbMDoHDwVN2tF?si=abc")).toEqual({
      kind: "playlist",
      id: "37i9dQZEVXbMDoHDwVN2tF",
    });
  });

  it("parses album and track links", () => {
    expect(parseSpotifyInput("https://open.spotify.com/album/4aawyAB9vmqN3uQ7FjRGTx")).toEqual({
      kind: "album",
      id: "4aawyAB9vmqN3uQ7FjRGTx",
    });
    expect(parseSpotifyInput("https://open.spotify.com/track/11dFghVXANMlKmJXsNCbNl")).toEqual({
      kind: "track",
      id: "11dFghVXANMlKmJXsNCbNl",
    });
  });

  it("parses spotify: URIs and localized links", () => {
    expect(parseSpotifyInput("spotify:playlist:37i9dQZEVXbMDoHDwVN2tF")).toEqual({
      kind: "playlist",
      id: "37i9dQZEVXbMDoHDwVN2tF",
    });
    expect(parseSpotifyInput("https://open.spotify.com/intl-de/playlist/37i9dQZEVXbMDoHDwVN2tF")).toEqual({
      kind: "playlist",
      id: "37i9dQZEVXbMDoHDwVN2tF",
    });
  });

  it("rejects non-spotify input", () => {
    expect(parseSpotifyInput("hello world")).toBeNull();
    expect(parseSpotifyInput("https://youtube.com/watch?v=abc")).toBeNull();
    expect(parseSpotifyInput("")).toBeNull();
  });

  it("rejects bare IDs (ambiguous kind)", () => {
    expect(() => parseSpotifyInput("37i9dQZEVXbMDoHDwVN2tF")).toThrow(/full Spotify link/);
  });
});

function embedHtml(entity: unknown): string {
  const json = JSON.stringify({ props: { pageProps: { state: { data: { entity } } } } });
  return `<html><body><script id="__NEXT_DATA__" type="application/json">${json}</script></body></html>`;
}

function mockFetch(html: string, status = 200) {
  return vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: status >= 200 && status < 300, status, text: async () => html }))
  );
}

describe("fetchSpotifyCollection", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("parses a playlist tracklist", async () => {
    mockFetch(
      embedHtml({
        type: "playlist",
        name: "Test Mix",
        trackList: [
          { title: "Song A", subtitle: "Artist A" },
          { title: "Song B", artists: [{ name: "Artist B1" }, { name: "Artist B2" }] },
          { title: "", subtitle: "No title" },
        ],
      })
    );
    const col = await fetchSpotifyCollection("https://open.spotify.com/playlist/37i9dQZEVXbMDoHDwVN2tF");
    expect(col.name).toBe("Test Mix");
    expect(col.tracks).toEqual([
      { title: "Song A", artist: "Artist A" },
      { title: "Song B", artist: "Artist B1, Artist B2" },
    ]);
  });

  it("parses a single track link", async () => {
    mockFetch(embedHtml({ type: "track", name: "Lone Song", subtitle: "Solo Artist" }));
    const col = await fetchSpotifyCollection("https://open.spotify.com/track/11dFghVXANMlKmJXsNCbNl");
    expect(col.tracks).toEqual([{ title: "Lone Song", artist: "Solo Artist" }]);
  });

  it("throws a friendly error on 404", async () => {
    mockFetch("not found", 404);
    await expect(
      fetchSpotifyCollection("https://open.spotify.com/playlist/37i9dQZEVXbMDoHDwVN2tF")
    ).rejects.toThrow(/public/);
  });

  it("throws when the page has no readable data", async () => {
    mockFetch("<html><body>no json here</body></html>");
    await expect(
      fetchSpotifyCollection("https://open.spotify.com/playlist/37i9dQZEVXbMDoHDwVN2tF")
    ).rejects.toThrow(/Couldn't read/);
  });

  it("throws when the collection is empty", async () => {
    mockFetch(embedHtml({ type: "playlist", name: "Empty", trackList: [] }));
    await expect(
      fetchSpotifyCollection("https://open.spotify.com/playlist/37i9dQZEVXbMDoHDwVN2tF")
    ).rejects.toThrow(/No tracks found/);
  });

  it("rejects garbage input before fetching", async () => {
    const spy = vi.fn(async () => ({ ok: true, status: 200, text: async () => "" }));
    vi.stubGlobal("fetch", spy);
    await expect(fetchSpotifyCollection("hello world")).rejects.toThrow(/doesn't look like/);
    expect(spy).not.toHaveBeenCalled();
  });
});
