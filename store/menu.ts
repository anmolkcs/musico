import { create } from "zustand";
import { Song } from "../lib/types";

export type MenuContext = {
  playlistId?: number; // when opened from a playlist: allow "remove from playlist"
  onRemoveFromPlaylist?: () => void;
};

type MenuState = {
  track: Song | null;
  context: MenuContext;
  open: (track: Song, context?: MenuContext) => void;
  close: () => void;
};

export const useTrackMenu = create<MenuState>((set) => ({
  track: null,
  context: {},
  open: (track, context = {}) => set({ track, context }),
  close: () => set({ track: null, context: {} }),
}));
