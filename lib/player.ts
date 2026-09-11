import { Platform } from "react-native";
import TrackPlayer, {
  AppKilledPlaybackBehavior,
  Capability,
  Event,
  RepeatMode,
  State,
} from "react-native-track-player";
import YtCore from "../modules/yt-core";
import { artworkFor, Song } from "./types";
import { recordPlay, openDb } from "./db";
import { currentSong, useQueueStore } from "../store/queue";
import { useLibraryStore } from "../store/library";
import { nextIndex, prevIndex } from "./queue-logic";
import { getLocalPlayableUrl } from "./local-media";
import { createCommitLock } from "./commit-lock";
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
  await syncNativeRepeatMode();
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
//
// The whole queue lives in the native TrackPlayer, not just the current
// track. This is what keeps playback alive in the background: when a song
// ends, exoplayer advances to the next queue entry natively — no JS round
// trip (resolve stream → reset → add) at the moment of transition, which is
// exactly where background/locked-phone playback used to die.
//
// Upcoming tracks are added with a placeholder URL; the real stream URL is
// swapped in (remove + re-add) one or two tracks ahead of playback via
// ensureResolved(). If a placeholder ever does reach the player (JS
// suspended too long, resolve failure), the playback-error handler recovers.
//
// Concurrency: JS and the native player advance independently, and a
// playQueue attempt spends seconds resolving streams before it touches the
// player. Every native-queue mutation therefore runs through withQueueLock()
// and re-validates against the live store at execution time, and each
// playQueue attempt carries a generation: a superseded attempt abandons
// instead of committing (newest tap wins), and native playback events are
// ignored while a commit is pending, so the store and the native queue can
// never permanently describe different queues.

const UNRESOLVED_SCHEME = "musico://unresolved/";

let queueGeneration = 0;
// Generation of the playQueue attempt that has updated the store but not yet
// committed its queue to the player; null once store and player agree.
let pendingQueueGeneration: number | null = null;

// Serializes native-queue mutations; see lib/commit-lock.ts.
const withQueueLock = createCommitLock();

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

function unresolvedTrack(song: Song) {
  return trackObject(song, `${UNRESOLVED_SCHEME}${song.id}`, song.duration);
}

function queueInput() {
  const { songs, index, shuffle, repeat } = useQueueStore.getState();
  return { length: songs.length, index, shuffle, repeat };
}

function mapRepeatMode(repeat: "off" | "track" | "queue"): RepeatMode {
  return repeat === "queue" ? RepeatMode.Queue : repeat === "track" ? RepeatMode.Track : RepeatMode.Off;
}

async function syncNativeRepeatMode() {
  try {
    await TrackPlayer.setRepeatMode(mapRepeatMode(useQueueStore.getState().repeat));
  } catch {}
}

// One-shot retry bookkeeping for playback errors, keyed by video id
const errorRetried = new Set<string>();

/**
 * Swap the placeholder URL at `index` for a real stream. Only ever touches
 * upcoming tracks — the active track is reloaded via `load()` in the error
 * path instead, since removing the playing track would kill playback.
 *
 * Stream resolution happens outside the queue lock; the swap itself
 * re-validates everything under the lock (right track, still a placeholder,
 * still upcoming, queue not replaced), so a stale or superseded swap can
 * never corrupt the queue that replaced it.
 */
async function ensureResolved(index: number) {
  const generation = queueGeneration;
  const { songs } = useQueueStore.getState();
  const song = songs[index];
  if (!song) return;
  try {
    const track = await TrackPlayer.getTrack(index);
    if (!track || track.id !== song.id || !String(track.url).startsWith(UNRESOLVED_SCHEME)) return;
    const active = await TrackPlayer.getActiveTrackIndex();
    if (active !== undefined && index <= active) return;
    const { url, format } = await getPlayableUrl(song);
    if (generation !== queueGeneration) return;
    let duration = song.duration;
    if (format !== "local" && duration <= 0) {
      try {
        duration = (await resolveStream(song.id)).duration;
      } catch {}
      if (generation !== queueGeneration) return;
    }
    await withQueueLock(async () => {
      if (generation !== queueGeneration) return;
      // The player may have advanced or the queue been replaced while we
      // were resolving — re-check identity so we never remove the track
      // that is (now) playing or swap a song into the wrong slot.
      const nowActive = await TrackPlayer.getActiveTrackIndex();
      if (nowActive !== undefined && index <= nowActive) return;
      const latest = await TrackPlayer.getTrack(index);
      if (!latest || latest.id !== song.id || !String(latest.url).startsWith(UNRESOLVED_SCHEME)) return;
      await TrackPlayer.remove([index]);
      await TrackPlayer.add([trackObject(song, url, duration)], index);
    });
  } catch (e) {
    console.warn("stream resolve failed", song.id, e);
  }
}

export async function playQueue(songs: Song[], startIndex: number, sourceName: string) {
  const generation = ++queueGeneration;
  // Until this attempt commits, the native player still holds the previous
  // queue while the store already describes this one — native playback
  // events are gated off for that window (cleared again in `finally` on
  // every exit path).
  pendingQueueGeneration = generation;
  useQueueStore.getState().setQueue(songs, startIndex, sourceName);
  errorRetried.clear();
  let committedIndex = -1;
  try {
    const song = songs[startIndex];
    const { url, format } = await getPlayableUrl(song);
    if (generation !== queueGeneration) return;
    let duration = song.duration;
    if (format !== "local" && duration <= 0) {
      try {
        duration = (await resolveStream(song.id)).duration;
      } catch {}
      if (generation !== queueGeneration) return;
    }
    await withQueueLock(async () => {
      // Newest tap wins: an attempt superseded while resolving its stream
      // must not clobber the queue that replaced it.
      if (generation !== queueGeneration) return;
      // Build from the live store, not the captured list: enqueues, removes
      // and reorders that happened while we were resolving are already
      // reflected there and must survive this commit.
      const { songs: liveSongs, index: liveIndex } = useQueueStore.getState();
      const startSong = liveSongs[liveIndex];
      if (!startSong || startSong.id !== song.id) return;
      await TrackPlayer.reset();
      await TrackPlayer.add(
        liveSongs.map((s, i) => (i === liveIndex ? trackObject(s, url, duration) : unresolvedTrack(s)))
      );
      if (liveIndex > 0) await TrackPlayer.skip(liveIndex);
      await TrackPlayer.play();
      // Store and native queue describe the same queue again.
      if (pendingQueueGeneration === generation) pendingQueueGeneration = null;
      committedIndex = liveIndex;
    });
  } finally {
    if (pendingQueueGeneration === generation) {
      // This attempt failed or was superseded without committing.
      pendingQueueGeneration = null;
    }
    if (generation === queueGeneration) {
      useQueueStore.getState().setLoading(false);
    }
  }
  if (committedIndex >= 0) {
    // Warm up the upcoming streams so native auto-advance never waits on JS.
    ensureResolved(committedIndex + 1);
    ensureResolved(committedIndex + 2);
  }
}

export async function playSingle(song: Song, sourceName = "song") {
  await playQueue([song], 0, sourceName);
}

/** Jump to any track in the queue (queue screen, manual skip, error recovery). */
export async function jumpTo(index: number) {
  const generation = queueGeneration;
  const { songs } = useQueueStore.getState();
  const song = songs[index];
  if (!song) return;
  errorRetried.delete(song.id);
  await ensureResolved(index);
  let jumped = false;
  await withQueueLock(async () => {
    // A queue commit is in flight: the native queue is about to be replaced,
    // so skipping inside it would target the wrong queue entirely.
    if (pendingQueueGeneration != null) return;
    // The queue may have been replaced while the stream resolved; skip only
    // if the slot still holds the song the user tapped.
    if (generation !== queueGeneration) return;
    const { songs: liveSongs } = useQueueStore.getState();
    const target = liveSongs[index];
    if (!target || target.id !== song.id) return;
    await TrackPlayer.skip(index);
    await TrackPlayer.play();
    jumped = true;
  });
  if (jumped) ensureResolved(index + 1);
}

export async function playNext(auto = false) {
  // A pending commit owns the player; acting on the old native queue would
  // be undone the moment the new queue lands.
  if (pendingQueueGeneration != null) return;
  const idx = nextIndex(queueInput(), auto);
  if (idx < 0) {
    await TrackPlayer.pause();
    return;
  }
  if (idx === useQueueStore.getState().index) {
    // Manual next on the last track without queue repeat restarts current.
    await TrackPlayer.seekTo(0);
    await TrackPlayer.play();
    return;
  }
  await jumpTo(idx);
}

export async function playPrevious() {
  if (pendingQueueGeneration != null) return; // a pending commit owns the player
  const position = await TrackPlayer.getPosition();
  if (position > 4) {
    await TrackPlayer.seekTo(0);
    return;
  }
  const idx = prevIndex(queueInput());
  if (idx < 0) return;
  if (idx === useQueueStore.getState().index) {
    await TrackPlayer.seekTo(0);
    return;
  }
  await jumpTo(idx);
}

function shuffleArray<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Rebuild the upcoming part of the native queue for the new shuffle state.
 * History (tracks before the current one) keeps its order; only what comes
 * next is reordered, in both the store and the native queue.
 */
async function rebuildUpcoming(shuffled: boolean) {
  const generation = queueGeneration;
  await withQueueLock(async () => {
    if (generation !== queueGeneration) return;
    // The active track may have advanced (or the queue been replaced) while
    // this rebuild waited for the lock — redo the split from live state.
    const { songs, index: liveIndex, baseSongs } = useQueueStore.getState();
    const played = songs.slice(0, liveIndex + 1);
    const playedIds = new Set(played.map((s) => s.id));
    const upcoming = shuffled
      ? shuffleArray(songs.slice(liveIndex + 1))
      : baseSongs.filter((s) => !playedIds.has(s.id));
    await TrackPlayer.removeUpcomingTracks();
    if (upcoming.length > 0) {
      await TrackPlayer.add(upcoming.map(unresolvedTrack));
    }
    useQueueStore.getState().setSongs([...played, ...upcoming]);
  });
  // No-ops safely (id re-validation) if the queue moved on meanwhile.
  ensureResolved(useQueueStore.getState().index + 1);
}

export async function toggleShuffle() {
  const { shuffle, setShuffle } = useQueueStore.getState();
  const next = !shuffle;
  setShuffle(next);
  try {
    await rebuildUpcoming(next);
  } catch (e) {
    console.warn("shuffle rebuild failed", e);
  }
}

export function cycleRepeat() {
  const { repeat, setRepeat } = useQueueStore.getState();
  setRepeat(repeat === "off" ? "queue" : repeat === "queue" ? "track" : "off");
  // track/queue repeat is enforced natively so it survives backgrounding;
  // only the UI next/prev buttons apply the store's repeat logic.
  syncNativeRepeatMode();
}

// ---- Queue editing (queue screen / track menu) ----

export async function enqueueNext(song: Song) {
  const { songs } = useQueueStore.getState();
  if (songs.length === 0) {
    await playQueue([song], 0, "queue");
    return;
  }
  await withQueueLock(async () => {
    // Insert next to whatever is playing now — the live index, not the one
    // captured on entry, in case playback advanced while we waited.
    const insertAt = useQueueStore.getState().index + 1;
    await TrackPlayer.add([unresolvedTrack(song)], insertAt);
    useQueueStore.getState().insertSongAt(song, insertAt);
  });
  ensureResolved(useQueueStore.getState().index + 1);
}

export async function enqueueLast(song: Song) {
  const { songs } = useQueueStore.getState();
  if (songs.length === 0) {
    await playQueue([song], 0, "queue");
    return;
  }
  await withQueueLock(async () => {
    await TrackPlayer.add([unresolvedTrack(song)]);
    useQueueStore.getState().appendSong(song);
  });
}

export async function removeFromQueue(index: number) {
  await withQueueLock(async () => {
    const { index: active, songs } = useQueueStore.getState();
    if (index <= active || index >= songs.length) return;
    // Native first: if TrackPlayer.remove throws, the store is untouched
    // and the two never diverge silently. The store update cannot fail.
    await TrackPlayer.remove([index]);
    useQueueStore.getState().removeSongAt(index);
  });
}

export async function moveInQueue(from: number, to: number) {
  await withQueueLock(async () => {
    const { index: active, songs } = useQueueStore.getState();
    if (from <= active || to <= active || from >= songs.length || to >= songs.length) return;
    // Native first: if TrackPlayer.move throws, the store is untouched and
    // the two never diverge silently. The store update cannot fail.
    await TrackPlayer.move(from, to);
    useQueueStore.getState().moveSong(from, to);
  });
}

export async function clearUpcoming() {
  await withQueueLock(async () => {
    const { index, songs } = useQueueStore.getState();
    if (index + 1 >= songs.length) return; // nothing upcoming
    await TrackPlayer.removeUpcomingTracks();
    useQueueStore.getState().setSongs(songs.slice(0, index + 1));
  });
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

// ---- Playback error recovery ----

async function handlePlaybackError() {
  // An error fired by the previous queue while a new one is being committed
  // refers to tracks the player is about to discard — recovering it would
  // act on store data for a queue the player no longer holds.
  if (pendingQueueGeneration != null) return;
  const generation = queueGeneration;
  const { songs, index, shuffle, repeat } = useQueueStore.getState();
  const song = songs[index];
  if (!song) return;
  invalidateStream(song.id);
  if (!errorRetried.has(song.id)) {
    // First failure for this track: reload the active track with a fresh
    // stream without disturbing the rest of the queue.
    errorRetried.add(song.id);
    try {
      const { url, format } = await getPlayableUrl(song);
      let duration = song.duration;
      if (format !== "local" && duration <= 0) {
        try {
          duration = (await resolveStream(song.id)).duration;
        } catch {}
      }
      let recovered = false;
      await withQueueLock(async () => {
        // The queue may have been replaced while the stream resolved; only
        // reload if this error still belongs to the playing track.
        if (generation !== queueGeneration) return;
        if (useQueueStore.getState().songs[index]?.id !== song.id) return;
        await TrackPlayer.load(trackObject(song, url, duration));
        await TrackPlayer.play();
        recovered = true;
      });
      if (recovered) return;
      if (generation !== queueGeneration) return; // stale error — not ours to handle
    } catch {}
  }
  // Already retried (or reload failed): move on. Each track only gets one
  // retry, so a queue of broken tracks is walked through once, then stops.
  const idx = nextIndex({ length: songs.length, index, shuffle, repeat }, true);
  if (idx < 0 || idx === index) {
    await TrackPlayer.pause();
    return;
  }
  await jumpTo(idx);
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
  // The store index must mirror the native queue even when tracks advance
  // while the UI is closed (notification skips, background auto-advance),
  // otherwise the app and the player drift apart and the queue "gets messed
  // up". This event is the single source of truth for the active index.
  TrackPlayer.addEventListener(Event.PlaybackActiveTrackChanged, (event) => {
    const { index } = event;
    if (index == null || index < 0) return;
    // While a queue commit is pending, the native queue still reflects the
    // queue being replaced; letting its events through would drive the store
    // to indices of a queue that no longer exists.
    if (pendingQueueGeneration != null) return;
    // This event is the single source of truth for the active index, but
    // only for the queue the store knows: accept it when the store's song at
    // that index is the track that actually became active.
    const song = useQueueStore.getState().songs[index];
    const nativeId = event.track?.id;
    if (!song || (nativeId !== undefined && nativeId !== song.id)) return;
    useQueueStore.getState().setIndex(index);
    // Resolve upcoming streams well before the native layer reaches them.
    ensureResolved(index + 1);
    ensureResolved(index + 2);
  });
  TrackPlayer.addEventListener(Event.PlaybackQueueEnded, async () => {
    // Repeat "track"/"queue" are handled natively; reaching queue end means
    // repeat is off. Native stops on its own — just settle the UI state.
    if (!currentSong()) return;
    await withQueueLock(async () => {
      // By the time the lock is ours, a new queue may be committing — its
      // play() must not be muted by a pause meant for the old queue.
      if (pendingQueueGeneration != null) return;
      await TrackPlayer.pause();
    });
  });
  TrackPlayer.addEventListener(Event.PlaybackProgressUpdated, async (event) => {
    // Progress from the tail of a queue being replaced must not count plays
    // against the new queue already reflected in the store.
    if (pendingQueueGeneration != null) return;
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
