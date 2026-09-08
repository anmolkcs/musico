import TrackPlayer, { Event, State } from "react-native-track-player";
import { artworkFor } from "./types";
import { currentSong } from "../store/queue";
import { playNext, playPrevious, togglePlayPause } from "./player";

// Web-only OS media integration (hardware media keys, browser media HUD) via
// the standard MediaSession API. On native this is handled by
// react-native-track-player's Remote* events, which don't exist on web.

export function setupMediaSession() {
  if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
  const mediaSession = navigator.mediaSession;

  mediaSession.setActionHandler("play", () => {
    togglePlayPause().catch(() => {});
  });
  mediaSession.setActionHandler("pause", () => {
    togglePlayPause().catch(() => {});
  });
  mediaSession.setActionHandler("previoustrack", () => {
    playPrevious().catch(() => {});
  });
  mediaSession.setActionHandler("nexttrack", () => {
    playNext(false).catch(() => {});
  });
  try {
    mediaSession.setActionHandler("seekto", (details) => {
      if (details.seekTime != null) TrackPlayer.seekTo(details.seekTime).catch(() => {});
    });
  } catch {}

  TrackPlayer.addEventListener(Event.PlaybackActiveTrackChanged, () => {
    const song = currentSong();
    if (!song) return;
    mediaSession.metadata = new MediaMetadata({
      title: song.title,
      artist: song.artist || "Unknown artist",
      album: "Musico",
      artwork: [{ src: song.thumbnail || artworkFor(song.id), sizes: "480x360", type: "image/jpeg" }],
    });
  });

  TrackPlayer.addEventListener(Event.PlaybackState, (event) => {
    switch (event.state) {
      case State.Playing:
        mediaSession.playbackState = "playing";
        break;
      case State.Paused:
      case State.Ended:
      case State.Stopped:
        mediaSession.playbackState = "paused";
        break;
      case State.Buffering:
      case State.Loading:
      case State.Connecting:
        break;
      default:
        mediaSession.playbackState = "none";
    }
  });
}
