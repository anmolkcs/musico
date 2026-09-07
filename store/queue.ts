import { create } from "zustand";
import { Song } from "../lib/types";

export type RepeatMode = "off" | "track" | "queue";

type QueueState = {
  songs: Song[];
  index: number;
  shuffle: boolean;
  repeat: RepeatMode;
  sourceName: string;
  loadToken: number;
  setQueue: (songs: Song[], index: number, sourceName: string) => void;
  setIndex: (index: number) => void;
  setShuffle: (shuffle: boolean) => void;
  setRepeat: (repeat: RepeatMode) => void;
  bumpLoadToken: () => void;
  insertNext: (song: Song) => void;
};

export const useQueueStore = create<QueueState>((set) => ({
  songs: [],
  index: 0,
  shuffle: false,
  repeat: "off",
  sourceName: "",
  loadToken: 0,
  setQueue: (songs, index, sourceName) => set({ songs, index, sourceName }),
  setIndex: (index) => set({ index }),
  setShuffle: (shuffle) => set({ shuffle }),
  setRepeat: (repeat) => set({ repeat }),
  bumpLoadToken: () => set((s) => ({ loadToken: s.loadToken + 1 })),
  insertNext: (song) =>
    set((s) => {
      if (s.songs.length === 0) return { songs: [song], index: 0 };
      const songs = [...s.songs];
      songs.splice(s.index + 1, 0, song);
      return { songs };
    }),
}));

export function currentSong(): Song | null {
  const { songs, index } = useQueueStore.getState();
  return songs[index] ?? null;
}
