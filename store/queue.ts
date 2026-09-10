import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Song } from "../lib/types";

export type RepeatMode = "off" | "track" | "queue";

type QueueState = {
  songs: Song[];
  index: number;
  shuffle: boolean;
  repeat: RepeatMode;
  sourceName: string;
  loading: boolean;
  loadToken: number;
  setQueue: (songs: Song[], index: number, sourceName: string) => void;
  setIndex: (index: number) => void;
  setLoading: (loading: boolean) => void;
  setShuffle: (shuffle: boolean) => void;
  setRepeat: (repeat: RepeatMode) => void;
  bumpLoadToken: () => void;
  insertNext: (song: Song) => void;
};

export const useQueueStore = create<QueueState>((set) => ({
  persist(
    (set) => ({
      songs: [],
      index: 0,
      shuffle: false,
      repeat: "off",
      sourceName: "",
      loading: false,
      loadToken: 0,
      setQueue: (songs, index, sourceName) => set({ songs, index, sourceName, loading: true }),
      setIndex: (index) => set({ index }),
      setLoading: (loading) => set({ loading }),
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
    }),
    {
      name: "musico-queue",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        songs: state.songs,
        index: state.index,
        shuffle: state.shuffle,
        repeat: state.repeat,
        sourceName: state.sourceName,
      }),
    }
  )
);

export async function hydrateQueueStore() {
  await useQueueStore.persist.rehydrate();
}

export function currentSong(): Song | null {
  const { songs, index } = useQueueStore.getState();
  return songs[index] ?? null;
}
