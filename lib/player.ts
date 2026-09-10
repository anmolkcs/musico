import { Platform } from "react-native";
import TrackPlayer, {
  AppKilledPlaybackBehavior,
  Capability,
  Event,
  State,
} from "react-native-track-player";
import YtCore from "../modules/yt-core";
import { artworkFor, Song } from "./types";
import { recordPlay, openDb } from "./db";
import { currentSong, useQueueStore } from "../store/queue";
import { useLibraryStore } from "../store/library";
import { nextIndex, prevIndex } from "./queue-logic";
import { getLocalPlayableUrl } from "./local-media";
import type { StreamResult } from "../modules/yt-core";

let playerReady = false;
let playbackServiceRegistered = false;

export async function setupPlayer(): Promise<boolean> {
  if (playerReady) return false;
  try {
    await TrackPlayer.setupPlayer({ autoHandleInterruptions: true });
  } catch (e: any) {
    if (e?.message?.includes("already been initialized") || e?.code === "player_already_initialized") {
      // already set up (hot reload)
    } else {
      throw e;
    }
  }
  await TrackPlayer.updateOptions({
    android: {
      appKilledPlaybackBehavior: AppKilledPlaybackBehavior.ContinuePlayback,
    },
    capabilities: [
      Capability.Play,
      Capability.Pause,
      Capability.SkipToNext,
      Capability.SkipToPrevious,
      Capability.SeekTo,
    ],
    compactCapabilities: [Capability.Play, Capability.Pause, Capability.SkipToNext, Capability.SkipToPrevious],
    progressUpdateEventInterval: 2,
  });
  playerReady = true;
  return true;
}

// ---- Stream resolution (TTL cache, deduped, bounded) ----

const STREAM_TTL_MS = 45 * 60 * 1000; // YouTube stream URLs stay valid ~6h; refresh well before
const STREAM_CACHE_MAX = 40;

const streamCache = new Map<string, { result: StreamResult; at: number }>();
const pendingResolves = new Map<string, Promise<StreamResult>>();

function cacheGet(videoId: string): StreamResult | null {
  const entry = streamCache.get(videoId);
  if (!entry) return null;
  if (Date.now() - entry.at > STREAM_TTL_MS) {
    streamCache.delete(videoId);
    return null;
  }
  return entry.result;
}

function cachePut(videoId: string, result: StreamResult) {
  if (streamCache.size >= STREAM_CACHE_MAX) {
    // evict the oldest entry
    const oldest = [...streamCache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) streamCache.delete(oldest[0]);
  }
  streamCache.set(videoId, { result, at: Date.now() });
}

export function invalidateStream(videoId: string) {
  streamCache.delete(videoId);
}

export async function resolveStream(videoId: string, { force = false } = {}): Promise<StreamResult> {
  if (!force) {
    const cached = cacheGet(videoId);
    if (cached && cached.streamUrl) return cached;
  }
  const pending = pendingResolves.get(videoId);
  if (pending) return pending;
  const p = YtCore.getStream(videoId)
    .then((result) => {
      if (result.streamUrl) cachePut(videoId, result);
      return result;
    })
    .finally(() => pendingResolves.delete(videoId));
  pendingResolves.set(videoId, p);
  return p;
}

async function getPlayableUrl(song: Song): Promise<{ url: string; format: string }> {
  const local = await getLocalPlayableUrl(song.id);
  if (local) return { url: local, format: "local" };
  const stream = await resolveStream(song.id);
  if (!stream.streamUrl) throw new Error("No playable audio stream for this track");
  return { url: stream.streamUrl, format: stream.format };
}

// ---- Queue engine ----

function queueInput() {
  const { songs, index, shuffle, repeat } = useQueueStore.getState();
  return { length: songs.length, index, shuffle, repeat };
}

function trackObject(song: Song, url: string, duration: number) {
  return {
    id: song.id,
    url,
    title: song.title,
    artist: song.artist || "Unknown artist",
    artwork: song.thumbnail || artworkFor(song.id),
    duration: duration > 0 ? duration : 0,
  };
}

let loadSeq = 0;
// One-shot retry bookkeeping for playback errors, keyed by video id
const errorRetried = new Set<string>();

export async function loadIndex(index: number, opts: { autoPlay?: boolean } = {}) {
  const { autoPlay = true } = opts;
  const { songs } = useQueueStore.getState();
  const song = songs[index];
  if (!song) {
    useQueueStore.getState().setLoading(false);
    return;
  }
  const seq = ++loadSeq;
  useQueueStore.getState().setIndex(index);
  useQueueStore.getState().setLoading(true);
  try {
    const { url, format } = await getPlayableUrl(song);
    if (seq !== loadSeq) return; // superseded by a newer request
    let duration = song.duration;
    if (format !== "local" && duration <= 0) {
      try {
        const meta = await resolveStream(song.id);
        duration = meta.duration;
      } catch {}
    }
    await TrackPlayer.reset();
    if (seq !== loadSeq) return;
    await TrackPlayer.add([trackObject(song, url, duration)]);
    if (autoPlay) await TrackPlayer.play();
    // a fresh load of this track can count as a play again once confirmed
    recordedTrackIds.delete(song.id);
  } catch (e) {
    if (seq !== loadSeq) return;
    console.warn("loadIndex failed", song.id, e);
    throw e;
  } finally {
    if (seq === loadSeq) useQueueStore.getState().setLoading(false);
  }
}

export async function playQueue(songs: Song[], startIndex: number, sourceName: string) {
  useQueueStore.getState().setQueue(songs, startIndex, sourceName);
  errorRetried.clear();
  await loadIndex(startIndex);
}

export async function playSingle(song: Song, sourceName = "song") {
  await playQueue([song], 0, sourceName);
}

export async function playNext(auto = false) {
  const idx = nextIndex(queueInput(), auto);
  if (idx < 0) {
    await TrackPlayer.pause();
    return;
  }
  try {
    await loadIndex(idx);
  } catch {
    // Skip past broken tracks, bounded so we don't spin through the whole queue
    let attempts = 0;
    while (attempts < 5) {
      const cur = nextIndex(queueInput(), true);
      if (cur < 0) break;
      try {
        await loadIndex(cur);
        return;
      } catch {}
      attempts++;
    }
    await TrackPlayer.pause();
  }
}

export async function playPrevious() {
  const position = await TrackPlayer.getProgress().then((p) => p.position);
  if (position > 4) {
    await TrackPlayer.seekTo(0);
    return;
  }
  const idx = prevIndex(queueInput());
  if (idx < 0) return;
  try {
    await loadIndex(idx);
  } catch {}
}

export async function toggleShuffle() {
  const { shuffle, setShuffle } = useQueueStore.getState();
  setShuffle(!shuffle);
}

export function cycleRepeat() {
  const { repeat, setRepeat } = useQueueStore.getState();
  setRepeat(repeat === "off" ? "queue" : repeat === "queue" ? "track" : "off");
}

export async function jumpTo(index: number) {
  const song = useQueueStore.getState().songs[index];
  if (song) errorRetried.delete(song.id);
  try {
    await loadIndex(index);
  } catch {}
}

export async function togglePlayPause() {
  const state = await TrackPlayer.getPlaybackState();
  if (state.state === State.Playing) {
    await TrackPlayer.pause();
  } else if (
    state.state === State.Paused ||
    state.state === State.Ready ||
    state.state === State.Buffering ||
    state.state === State.Loading ||
    state.state === State.Ended ||
    state.state === State.Stopped
  ) {
    await TrackPlayer.play();
  }
}

// ---- Play accounting ----
// A play is counted after 10s of confirmed playback progress (not on load),
// and the library store refresh is throttled.

const PLAY_THRESHOLD_SECONDS = 10;
const recordedTrackIds = new Set<string>();
const recordingTrackIds = new Set<string>();
let lastLibraryRefresh = 0;

function throttleRefresh() {
  const now = Date.now();
  if (now - lastLibraryRefresh < 20_000) return;
  lastLibraryRefresh = now;
  useLibraryStore.getState().refresh().catch(() => {});
}

async function recordConfirmedPlay(song: Song) {
  if (recordedTrackIds.has(song.id) || recordingTrackIds.has(song.id)) return;
  recordingTrackIds.add(song.id);
  try {
    const db = await openDb();
    await recordPlay(db, song);
    recordedTrackIds.add(song.id);
    if (recordedTrackIds.size > 500) recordedTrackIds.clear();
    throttleRefresh();
  } catch (error) {
    console.warn("record play failed", song.id, error);
  } finally {
    recordingTrackIds.delete(song.id);
  }
}

// Prefetch the next stream URL (shuffle-aware) so skips feel instant
export function prefetchNext() {
  const { songs, index, shuffle, repeat } = useQueueStore.getState();
  if (songs.length < 2) return;
  const next = nextIndex({ length: songs.length, index, shuffle, repeat }, true);
  if (next < 0) return;
  const song = songs[next];
  if (song) resolveStream(song.id).catch(() => {});
}

// ---- Playback error recovery ----

async function handlePlaybackError() {
  const song = currentSong();
  if (!song) return;
  invalidateStream(song.id);
  if (!errorRetried.has(song.id)) {
    // First failure for this track: re-resolve with a fresh URL and retry once
    errorRetried.add(song.id);
    try {
      await loadIndex(useQueueStore.getState().index);
      return;
    } catch {}
  }
  // Already retried (or reload failed): move on
  const { songs, index, shuffle, repeat } = useQueueStore.getState();
  const next = nextIndex({ length: songs.length, index, shuffle, repeat }, true);
  if (next === index) {
    // Auto-advance would replay the same broken track forever
    // (single-track queue with shuffle or repeat "track") — stop instead.
    await TrackPlayer.pause();
    return;
  }
  await playNext(true);
}

// ---- Playback service (registered in root layout) ----

export async function PlaybackService() {
  if (playbackServiceRegistered) return;
  playbackServiceRegistered = true;
  if (Platform.OS === "web") {
    // OS media keys / browser media HUD (native uses Remote* events instead)
    const { setupMediaSession } = await import("./web-media-session");
    setupMediaSession();
  }
  TrackPlayer.addEventListener(Event.RemotePlay, () => TrackPlayer.play());
  TrackPlayer.addEventListener(Event.RemotePause, () => TrackPlayer.pause());
  TrackPlayer.addEventListener(Event.RemoteNext, () => playNext(false));
  TrackPlayer.addEventListener(Event.RemotePrevious, () => playPrevious());
  TrackPlayer.addEventListener(Event.RemoteSeek, (event) => {
    TrackPlayer.seekTo(event.position);
  });
  TrackPlayer.addEventListener(Event.RemoteDuck, async (event) => {
    if (event.paused) {
      await TrackPlayer.pause();
    }
  });
  TrackPlayer.addEventListener(Event.PlaybackQueueEnded, async () => {
    const { repeat } = useQueueStore.getState();
    const song = currentSong();
    if (!song) return;
    if (repeat === "track") {
      try {
        await loadIndex(useQueueStore.getState().index);
      } catch {}
    } else {
      await playNext(true);
    }
  });
  TrackPlayer.addEventListener(Event.PlaybackActiveTrackChanged, () => {
    prefetchNext();
  });
  TrackPlayer.addEventListener(Event.PlaybackProgressUpdated, async (event) => {
    if (event.position >= PLAY_THRESHOLD_SECONDS) {
      const song = currentSong();
      if (song) await recordConfirmedPlay(song);
    }
  });
  TrackPlayer.addEventListener(Event.PlaybackError, async (event) => {
    console.warn("playback error", event.code, event.message);
    await handlePlaybackError();
  });
  TrackPlayer.addEventListener(Event.PlayerError, async (event: any) => {
    console.warn("player error", event?.code, event?.message);
    await handlePlaybackError();
  });
}
