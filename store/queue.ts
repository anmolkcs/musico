import { create } from "zustand";
import { Song } from "../lib/types";

export type RepeatMode = "off" | "track" | "queue";

type QueueState = {
  songs: Song[];
  // Original order the queue was created in; shuffle reorders `songs` but
  // un-shuffling restores the upcoming tracks from here.
  baseSongs: Song[];
  index: number;
  shuffle: boolean;
  repeat: RepeatMode;
  sourceName: string;
  loading: boolean;
  setQueue: (songs: Song[], index: number, sourceName: string) => void;
  setSongs: (songs: Song[]) => void;
  setIndex: (index: number) => void;
  setLoading: (loading: boolean) => void;
  setShuffle: (shuffle: boolean) => void;
  setRepeat: (repeat: RepeatMode) => void;
  insertSongAt: (song: Song, index: number) => void;
  appendSong: (song: Song) => void;
  removeSongAt: (index: number) => void;
  moveSong: (from: number, to: number) => void;
};

export const useQueueStore = create<QueueState>((set) => ({
  songs: [],
  baseSongs: [],
  index: 0,
  shuffle: false,
  repeat: "off",
  sourceName: "",
  loading: false,
  setQueue: (songs, index, sourceName) =>
    set({ songs, baseSongs: [...songs], index, sourceName, loading: true }),
  setSongs: (songs) => set({ songs }),
  setIndex: (index) => set({ index }),
  setLoading: (loading) => set({ loading }),
  setShuffle: (shuffle) => set({ shuffle }),
  setRepeat: (repeat) => set({ repeat }),
  insertSongAt: (song, index) =>
    set((s) => {
      if (s.songs.length === 0) return { songs: [song], baseSongs: [song], index: 0 };
      const songs = [...s.songs];
      songs.splice(index, 0, song);
      return { songs, index: index <= s.index ? s.index + 1 : s.index };
    }),
  appendSong: (song) => set((s) => ({ songs: [...s.songs, song] })),
  removeSongAt: (index) =>
    set((s) => ({
      songs: s.songs.filter((_, i) => i !== index),
      index: index < s.index ? s.index - 1 : s.index,
    })),
  moveSong: (from, to) =>
    set((s) => {
      if (from === to || from < 0 || to < 0 || from >= s.songs.length) return {};
      const songs = [...s.songs];
      const [moved] = songs.splice(from, 1);
      songs.splice(to, 0, moved);
      // Keep store index pointing at the same playing track after the shift.
      let index = s.index;
      if (from < index && to >= index) index -= 1;
      else if (from > index && to <= index) index += 1;
      return { songs, index };
    }),
}));

export function currentSong(): Song | null {
  const { songs, index } = useQueueStore.getState();
  return songs[index] ?? null;
}
