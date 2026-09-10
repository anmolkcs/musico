import { Platform } from "react-native";
import TrackPlayer, {
  AppKilledPlaybackBehavior,
  Capability,
  Event,
  RepeatMode as NativeRepeatMode,
  State,
} from "react-native-track-player";
import YtCore from "../modules/yt-core";
import { artworkFor, Song } from "./types";
import { recordPlay, openDb } from "./db";
import { currentSong, hydrateQueueStore, RepeatMode, useQueueStore } from "../store/queue";
import { useLibraryStore } from "../store/library";
import { nextIndex, prevIndex } from "./queue-logic";
import { getLocalPlayableUrl } from "./local-media";
import type { StreamResult } from "../modules/yt-core";

let playerReady = false;
let playbackServiceRegistered = false;
let queueSyncSeq = 0;

async function applyRepeatMode(repeat: RepeatMode) {
  const nativeMode =
    repeat === "track"
      ? NativeRepeatMode.Track
      : repeat === "queue"
        ? NativeRepeatMode.Queue
        : NativeRepeatMode.Off;
  await TrackPlayer.setRepeatMode(nativeMode);
}

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

  await hydrateQueueStore().catch(() => {});
  const { songs, index, repeat } = useQueueStore.getState();
  await applyRepeatMode(repeat).catch(() => {});
  const nativeQueue = await TrackPlayer.getQueue().catch(() => []);
  if (songs.length > 0 && nativeQueue.length === 0) {
    await syncNativeQueueFromStore(index, { autoPlay: false }).catch(() => {});
  }

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

async function getPlayableUrl(song: Song, { forceStream = false } = {}): Promise<{ url: string; format: string }> {
  const local = await getLocalPlayableUrl(song.id);
  if (local) return { url: local, format: "local" };
  const stream = await resolveStream(song.id, { force: forceStream });
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

function shuffledUpcomingIndices(length: number, current: number) {
  const indices = Array.from({ length }, (_, i) => i).filter((i) => i !== current);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return indices;
}

async function resolveTrack(song: Song, opts: { forceStream?: boolean } = {}) {
  const { url, format } = await getPlayableUrl(song, opts);
  let duration = song.duration;
  if (format !== "local" && duration <= 0) {
    try {
      const meta = await resolveStream(song.id);
      duration = meta.duration;
    } catch {}
  }
  return trackObject(song, url, duration);
}

async function syncNativeQueueFromStore(startIndex: number, opts: { autoPlay?: boolean; forceCurrent?: boolean } = {}) {
  const { autoPlay = true, forceCurrent = false } = opts;
  const { songs, shuffle } = useQueueStore.getState();
  if (!songs[startIndex]) {
    useQueueStore.getState().setLoading(false);
    return;
  }
  const seq = ++queueSyncSeq;
  useQueueStore.getState().setLoading(true);

  try {
    const current = songs[startIndex];
    const currentTrack = await resolveTrack(current, { forceStream: forceCurrent });
    if (seq !== queueSyncSeq) return;

    const upcomingIndices = shuffle
      ? shuffledUpcomingIndices(songs.length, startIndex)
      : Array.from({ length: songs.length - startIndex - 1 }, (_, i) => startIndex + i + 1);

    const upcomingTracks = (
      await Promise.all(
        upcomingIndices.map(async (idx) => {
          try {
            const track = await resolveTrack(songs[idx]);
            return { idx, track };
          } catch {
            return null;
          }
        })
      )
    ).filter((entry): entry is { idx: number; track: ReturnType<typeof trackObject> } => entry != null);

    if (seq !== queueSyncSeq) return;

    await TrackPlayer.reset();
    if (seq !== queueSyncSeq) return;
    await TrackPlayer.add([currentTrack, ...upcomingTracks.map((t) => t.track)]);
    useQueueStore.getState().setIndex(startIndex);
    if (autoPlay) await TrackPlayer.play();
    recordedTrackIds.delete(current.id);
  } finally {
    if (seq === queueSyncSeq) useQueueStore.getState().setLoading(false);
  }
}

async function refreshUpcomingQueue(activeStoreIndex: number) {
  const { songs, shuffle } = useQueueStore.getState();
  if (!songs[activeStoreIndex]) return;

  const upcomingIndices = shuffle
    ? shuffledUpcomingIndices(songs.length, activeStoreIndex)
    : Array.from({ length: songs.length - activeStoreIndex - 1 }, (_, i) => activeStoreIndex + i + 1);

  await TrackPlayer.removeUpcomingTracks();
  if (upcomingIndices.length === 0) return;

  const upcomingTracks = (
    await Promise.all(
      upcomingIndices.map(async (idx) => {
        try {
          const track = await resolveTrack(songs[idx]);
          return track;
        } catch {
          return null;
        }
      })
    )
  ).filter((track): track is ReturnType<typeof trackObject> => track != null);

  if (upcomingTracks.length > 0) {
    await TrackPlayer.add(upcomingTracks);
  }
}

export async function loadIndex(index: number, opts: { autoPlay?: boolean } = {}) {
  await syncNativeQueueFromStore(index, opts);
}

export async function playQueue(songs: Song[], startIndex: number, sourceName: string) {
  useQueueStore.getState().setQueue(songs, startIndex, sourceName);
  errorRetried.clear();
  await syncNativeQueueFromStore(startIndex, { autoPlay: true });
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
    await jumpTo(idx);
  } catch {
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
    await jumpTo(idx);
  } catch {}
}

export async function toggleShuffle() {
  const { shuffle, setShuffle, index } = useQueueStore.getState();
  setShuffle(!shuffle);
  await syncNativeQueueFromStore(index, { autoPlay: false });
}

export async function cycleRepeat() {
  const { repeat, setRepeat } = useQueueStore.getState();
  const next = repeat === "off" ? "queue" : repeat === "queue" ? "track" : "off";
  setRepeat(next);
  await applyRepeatMode(next);
}

export async function jumpTo(index: number) {
  const song = useQueueStore.getState().songs[index];
  if (song) errorRetried.delete(song.id);
  await syncNativeQueueFromStore(index, { autoPlay: true });
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

// Prefetch a few upcoming stream URLs so transitions stay instant.
export function prefetchNext() {
  const { songs, index, shuffle } = useQueueStore.getState();
  if (songs.length < 2) return;

  const candidates = shuffle
    ? shuffledUpcomingIndices(songs.length, index)
    : Array.from({ length: Math.min(3, songs.length - index - 1) }, (_, i) => index + i + 1);

  for (const idx of candidates.slice(0, 3)) {
    const song = songs[idx];
    if (song) resolveStream(song.id).catch(() => {});
  }
}

// ---- Playback error recovery ----

async function handlePlaybackError() {
  const song = currentSong();
  if (!song) return;
  invalidateStream(song.id);
  if (!errorRetried.has(song.id)) {
    errorRetried.add(song.id);
    try {
      await syncNativeQueueFromStore(useQueueStore.getState().index, { autoPlay: true, forceCurrent: true });
      return;
    } catch {}
  }
  await playNext(true);
}

// One-shot retry bookkeeping for playback errors, keyed by video id
const errorRetried = new Set<string>();

// ---- Playback service (registered in root layout) ----

export async function PlaybackService() {
  if (playbackServiceRegistered) return;
  playbackServiceRegistered = true;

  await hydrateQueueStore().catch(() => {});
  await applyRepeatMode(useQueueStore.getState().repeat).catch(() => {});

  if (Platform.OS === "web") {
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

  TrackPlayer.addEventListener(Event.PlaybackActiveTrackChanged, async (event: any) => {
    const trackId =
      typeof event?.track === "string"
        ? event.track
        : typeof event?.track?.id === "string"
          ? event.track.id
          : null;

    if (trackId) {
      const { songs } = useQueueStore.getState();
      const idx = songs.findIndex((s) => s.id === trackId);
      if (idx >= 0) {
        useQueueStore.getState().setIndex(idx);
        prefetchNext();
        await refreshUpcomingQueue(idx).catch(() => {});
        return;
      }
    }

    const current = currentSong();
    if (current) prefetchNext();
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
