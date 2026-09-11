import { beforeEach, describe, expect, it, vi } from "vitest";
import { enqueueNext, jumpTo, playQueue, PlaybackService, setupPlayer } from "../lib/player";
import { useQueueStore } from "../store/queue";
import type { Song } from "../lib/types";

// Regression tests for the queue/commit races in lib/player.ts: overlapping
// playQueue calls, stale stream swaps, and native playback events arriving
// while a commit is pending. The native boundary (react-native-track-player,
// the yt-core extractor, the database, local media) is replaced with an
// in-memory stub so the real player logic runs against a deterministic
// fake player.

const h = vi.hoisted(() => {
  const streamResult = (videoId: string) => ({
    videoId,
    title: `t-${videoId}`,
    artist: "Artist",
    duration: 100,
    thumbnail: "",
    streamUrl: `https://stream/${videoId}`,
    format: "m4a",
    mimeType: "audio/mp4",
    bitrate: 128000,
  });
  const state = {
    resetCount: 0,
    queue: [] as { id: string; url: string }[],
    activeIndex: 0,
    listeners: {} as Record<string, ((event: any) => void)[]>,
    streamResolver: (videoId: string) => Promise.resolve(streamResult(videoId)),
    recordPlays: [] as string[],
  };
  const emit = (event: string, payload: any) => {
    for (const handler of state.listeners[event] ?? []) handler(payload);
  };
  const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
  return { state, emit, flush, streamResult };
});

vi.mock("react-native", () => ({
  Platform: { OS: "android", select: (options: { android: unknown }) => options.android },
}));

vi.mock("react-native-track-player", () => {
  const state = h.state;
  const TrackPlayer = {
    async setupPlayer() {},
    async updateOptions() {},
    async setRepeatMode() {},
    async reset() {
      state.resetCount += 1;
      state.queue = [];
      state.activeIndex = 0;
    },
    async add(tracks: { id: string; url: string }[], insertBeforeIndex?: number) {
      const at = insertBeforeIndex == null ? state.queue.length : Math.min(insertBeforeIndex, state.queue.length);
      state.queue.splice(at, 0, ...tracks);
    },
    async remove(indexes: number[]) {
      for (const index of [...indexes].sort((a, b) => b - a)) state.queue.splice(index, 1);
    },
    async move(from: number, to: number) {
      const [moved] = state.queue.splice(from, 1);
      if (moved) state.queue.splice(to, 0, moved);
    },
    async removeUpcomingTracks() {
      state.queue = state.queue.slice(0, state.activeIndex + 1);
    },
    async skip(index: number) {
      if (index < 0 || index >= state.queue.length) throw new Error(`skip out of bounds: ${index}`);
      state.activeIndex = index;
    },
    async load(track: { id: string; url: string }) {
      state.queue[state.activeIndex] = track;
    },
    async play() {},
    async pause() {},
    async seekTo() {},
    async getPosition() {
      return 0;
    },
    async getTrack(index: number) {
      return state.queue[index] ?? null;
    },
    async getActiveTrackIndex() {
      return state.activeIndex < state.queue.length ? state.activeIndex : undefined;
    },
    async getPlaybackState() {
      return { state: 0 };
    },
    addEventListener(event: string, handler: (event: any) => void) {
      (state.listeners[event] ??= []).push(handler);
    },
  };
  return {
    default: TrackPlayer,
    AppKilledPlaybackBehavior: { ContinuePlayback: "continue" },
    Capability: { Play: "play", Pause: "pause", SkipToNext: "next", SkipToPrevious: "prev", SeekTo: "seek" },
    Event: {
      RemotePlay: "remotePlay",
      RemotePause: "remotePause",
      RemoteNext: "remoteNext",
      RemotePrevious: "remotePrevious",
      RemoteSeek: "remoteSeek",
      RemoteDuck: "remoteDuck",
      PlaybackActiveTrackChanged: "activeTrackChanged",
      PlaybackQueueEnded: "queueEnded",
      PlaybackProgressUpdated: "progressUpdated",
      PlaybackError: "playbackError",
      PlayerError: "playerError",
    },
    RepeatMode: { Off: 0, Track: 1, Queue: 2 },
    State: { None: 0, Ready: 1, Playing: 2, Paused: 3, Stopped: 4, Error: 5, Loading: 6, Buffering: 7, Ended: 8 },
  };
});

vi.mock("../modules/yt-core", () => ({
  default: {
    async search() {
      return { query: "", filter: "", items: [] };
    },
    getStream: (videoId: string) => h.state.streamResolver(videoId),
  },
}));

vi.mock("../lib/db", () => {
  const noop = async () => {};
  return {
    openDb: async () => ({}),
    recordPlay: async (_db: unknown, song: { id: string }) => {
      h.state.recordPlays.push(song.id);
    },
    getAllTracks: async () => [],
    getLikedTracks: async () => [],
    getRecentTracks: async () => [],
    getPlaylists: async () => [],
    getArtists: async () => [],
    getDownloadedTracks: async () => [],
    getHistoryCount: async () => 0,
    getSetting: async () => null,
    createPlaylist: noop,
    deletePlaylist: noop,
    renamePlaylist: noop,
    setLiked: noop,
    setSetting: noop,
    updatePlaylistDetails: noop,
    upsertTrack: noop,
  };
});

vi.mock("../lib/local-media", () => ({
  getLocalPlayableUrl: async () => null,
}));

const song = (id: string): Song => ({ id, title: `Song ${id}`, artist: "Artist", duration: 100, thumbnail: "" });

const deferred = () => {
  let resolve!: (value: unknown) => void;
  const promise = new Promise<any>((r) => (resolve = r));
  return { promise, resolve };
};

beforeEach(() => {
  h.state.resetCount = 0;
  h.state.queue = [];
  h.state.activeIndex = 0;
  h.state.recordPlays = [];
  h.state.streamResolver = (videoId: string) => Promise.resolve(h.streamResult(videoId));
  useQueueStore.getState().setQueue([], 0, "");
  useQueueStore.getState().setLoading(false);
});

describe("overlapping playQueue calls", () => {
  it("commits only the newest tapped queue, even when the old attempt resolves last", async () => {
    const slow = deferred();
    h.state.streamResolver = (videoId: string) =>
      videoId === "r1a" ? slow.promise : Promise.resolve(h.streamResult(videoId));

    const first = playQueue([song("r1a")], 0, "first");
    const second = playQueue([song("r1b")], 0, "second");
    slow.resolve(h.streamResult("r1a"));
    await Promise.all([first, second]);

    expect(h.state.resetCount).toBe(1);
    expect(h.state.queue.map((t) => t.id)).toEqual(["r1b"]);
    expect(useQueueStore.getState().songs.map((s) => s.id)).toEqual(["r1b"]);
    expect(useQueueStore.getState().index).toBe(0);
    expect(useQueueStore.getState().loading).toBe(false);
  });

  it("picks up songs enqueued while a queue is still resolving", async () => {
    const slow = deferred();
    h.state.streamResolver = (videoId: string) =>
      videoId === "r4a" ? slow.promise : Promise.resolve(h.streamResult(videoId));

    const committing = playQueue([song("r4a")], 0, "test");
    await h.flush();
    await enqueueNext(song("r4b"));
    expect(useQueueStore.getState().songs.map((s) => s.id)).toEqual(["r4a", "r4b"]);

    slow.resolve(h.streamResult("r4a"));
    await committing;
    await h.flush();

    expect(h.state.queue.map((t) => t.id)).toEqual(["r4a", "r4b"]);
    expect(h.state.queue[1].url).toBe("https://stream/r4b");
  });
});

describe("ensureResolved races", () => {
  it("swaps a placeholder for the resolved stream in the current queue", async () => {
    const slow = deferred();
    h.state.streamResolver = (videoId: string) =>
      videoId === "r3b" ? slow.promise : Promise.resolve(h.streamResult(videoId));

    await playQueue([song("r3a"), song("r3b")], 0, "test");
    expect(h.state.queue[1].url.startsWith("musico://unresolved/")).toBe(true);

    slow.resolve(h.streamResult("r3b"));
    await h.flush();

    expect(h.state.queue.map((t) => t.id)).toEqual(["r3a", "r3b"]);
    expect(h.state.queue[1].url).toBe("https://stream/r3b");
    expect(h.state.activeIndex).toBe(0);
  });

  it("does not let a stale swap corrupt the queue that replaced it", async () => {
    const slow = deferred();
    h.state.streamResolver = (videoId: string) =>
      videoId === "r2b" ? slow.promise : Promise.resolve(h.streamResult(videoId));

    const first = playQueue([song("r2a"), song("r2b")], 0, "first");
    await h.flush(); // commit done; the warm-up is parked on r2b's stream
    const second = playQueue([song("r2c")], 0, "second");
    await Promise.all([first, second]);
    slow.resolve(h.streamResult("r2b"));
    await h.flush();

    expect(h.state.resetCount).toBe(2);
    expect(h.state.queue.map((t) => t.id)).toEqual(["r2c"]);
    expect(h.state.queue[0].url).toBe("https://stream/r2c");
    expect(useQueueStore.getState().songs.map((s) => s.id)).toEqual(["r2c"]);
  });
});

describe("jumpTo during a pending commit", () => {
  it("does not skip inside the queue being replaced, and works after the commit", async () => {
    const slow = deferred();
    h.state.streamResolver = (videoId: string) =>
      videoId === "r5a" ? slow.promise : Promise.resolve(h.streamResult(videoId));

    const committing = playQueue([song("r5a"), song("r5b")], 0, "test");
    await h.flush();
    const jump = jumpTo(1); // queue screen tap while the queue is still resolving
    slow.resolve(h.streamResult("r5a"));
    await Promise.all([committing, jump]);

    expect(h.state.queue.map((t) => t.id)).toEqual(["r5a", "r5b"]);
    expect(h.state.activeIndex).toBe(0);

    await jumpTo(1);
    expect(h.state.activeIndex).toBe(1);
  });
});

describe("native playback events", () => {
  it("ignores active-track events from the replaced queue, applies live ones", async () => {
    await setupPlayer();
    await PlaybackService();

    const slow = deferred();
    h.state.streamResolver = (videoId: string) =>
      videoId === "r6a" ? slow.promise : Promise.resolve(h.streamResult(videoId));

    const committing = playQueue([song("r6a"), song("r6b")], 0, "test");
    await h.flush();
    h.emit("activeTrackChanged", { index: 5, track: { id: "from-old-queue" } });
    expect(useQueueStore.getState().index).toBe(0);

    slow.resolve(h.streamResult("r6a"));
    await committing;
    h.emit("activeTrackChanged", { index: 1, track: { id: "r6b" } });
    expect(useQueueStore.getState().index).toBe(1);
  });
});
