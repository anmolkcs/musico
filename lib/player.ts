import TrackPlayer, {
  AppKilledPlaybackBehavior,
  Capability,
  Event,
  State,
} from "react-native-track-player";
import YtCore from "../modules/yt-core";
import { artworkFor, Song } from "./types";
import { getTrack, recordPlay } from "./db";
import { openDb } from "./db";
import { currentSong, useQueueStore } from "../store/queue";
import { StreamResult } from "../modules/yt-core";

let playerReady = false;

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

// ---- Stream resolution (cached, deduped) ----

const streamCache = new Map<string, StreamResult>();
const pendingResolves = new Map<string, Promise<StreamResult>>();

export async function resolveStream(videoId: string): Promise<StreamResult> {
  const cached = streamCache.get(videoId);
  if (cached && cached.streamUrl) return cached;
  const pending = pendingResolves.get(videoId);
  if (pending) return pending;
  const p = YtCore.getStream(videoId)
    .then((result) => {
      if (result.streamUrl) streamCache.set(videoId, result);
      return result;
    })
    .finally(() => pendingResolves.delete(videoId));
  pendingResolves.set(videoId, p);
  return p;
}

async function getPlayableUrl(song: Song): Promise<{ url: string; format: string }> {
  const db = await openDb();
  const track = await getTrack(db, song.id);
  if (track?.downloadStatus === 2 && track.localPath) {
    return { url: track.localPath, format: "local" };
  }
  const stream = await resolveStream(song.id);
  if (!stream.streamUrl) throw new Error("No playable audio stream for this track");
  return { url: stream.streamUrl, format: stream.format };
}

// ---- Queue engine ----

function nextIndexFor(auto: boolean): number {
  const { songs, index, shuffle, repeat } = useQueueStore.getState();
  if (songs.length === 0) return -1;
  if (shuffle && songs.length > 1) {
    let next = index;
    while (next === index) next = Math.floor(Math.random() * songs.length);
    return next;
  }
  if (index + 1 < songs.length) return index + 1;
  // end of queue
  if (repeat === "queue") return 0;
  if (repeat === "off" && auto) return -1;
  return index; // manual next at end without queue repeat: restart current
}

function prevIndexFor(): number {
  const { songs, index } = useQueueStore.getState();
  if (songs.length === 0) return -1;
  if (index - 1 >= 0) return index - 1;
  return songs.length - 1;
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

export async function loadIndex(index: number, opts: { autoPlay?: boolean } = {}) {
  const { autoPlay = true } = opts;
  const { songs } = useQueueStore.getState();
  const song = songs[index];
  if (!song) return;
  const seq = ++loadSeq;
  useQueueStore.getState().setIndex(index);
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
    // history bookkeeping
    openDb()
      .then((db) => recordPlay(db, song.id).catch(() => {}))
      .catch(() => {});
  } catch (e) {
    if (seq !== loadSeq) return;
    console.warn("loadIndex failed", song.id, e);
    throw e;
  }
}

export async function playQueue(songs: Song[], startIndex: number, sourceName: string) {
  useQueueStore.getState().setQueue(songs, startIndex, sourceName);
  await loadIndex(startIndex);
}

export async function playSingle(song: Song, sourceName = "song") {
  await playQueue([song], 0, sourceName);
}

export async function playNext(auto = false) {
  const idx = nextIndexFor(auto);
  if (idx < 0) {
    await TrackPlayer.pause();
    return;
  }
  try {
    await loadIndex(idx);
  } catch {
    // Try to skip past broken tracks, bounded to queue length
    const { songs } = useQueueStore.getState();
    let attempts = 0;
    let cur = idx;
    while (attempts < Math.min(songs.length, 5)) {
      cur = nextIndexFor(true);
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
  const idx = prevIndexFor();
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
  try {
    await loadIndex(index);
  } catch {}
}

export async function togglePlayPause() {
  const state = await TrackPlayer.getPlaybackState();
  if (state.state === State.Playing) {
    await TrackPlayer.pause();
  } else if (state.state === State.Paused) {
    await TrackPlayer.play();
  }
}

export async function playFromStart() {
  const song = currentSong();
  if (!song) return;
  try {
    await loadIndex(useQueueStore.getState().index);
  } catch {}
}

// Prefetch the next stream URL so skips feel instant
export function prefetchNext() {
  const { songs, index, shuffle, repeat } = useQueueStore.getState();
  if (songs.length < 2) return;
  let next = index + 1;
  if (next >= songs.length) {
    if (repeat === "queue") next = 0;
    else return;
  }
  const song = songs[next];
  if (song) resolveStream(song.id).catch(() => {});
}

// ---- Playback service (registered in root layout) ----

export async function PlaybackService() {
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
  TrackPlayer.addEventListener(Event.PlaybackQueueEnded, async (event) => {
    const { repeat } = useQueueStore.getState();
    const song = currentSong();
    if (!song) return;
    if (repeat === "track") {
      await loadIndex(useQueueStore.getState().index);
    } else {
      await playNext(true);
    }
  });
  TrackPlayer.addEventListener(Event.PlaybackActiveTrackChanged, () => {
    prefetchNext();
  });
}
