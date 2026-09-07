import { create } from "zustand";
import { openDb } from "../lib/db";
import {
  createPlaylist,
  deletePlaylist,
  getArtists,
  getAllTracks,
  getDownloadedTracks,
  getLikedTracks,
  getPlaylists,
  getRecentTracks,
  getSetting,
  renamePlaylist,
  setLiked,
  setSetting,
  upsertTrack,
} from "../lib/db";
import { Playlist, Song, TrackRecord } from "../lib/types";

type LibraryState = {
  ready: boolean;
  theme: "dark" | "light";
  songs: TrackRecord[];
  liked: TrackRecord[];
  recent: TrackRecord[];
  playlists: Playlist[];
  artists: { name: string; count: number }[];
  downloads: TrackRecord[];
  hydrate: () => Promise<void>;
  refresh: () => Promise<void>;
  toggleTheme: () => Promise<void>;
  like: (song: Song, liked: boolean) => Promise<void>;
  newPlaylist: (name: string) => Promise<number>;
  rename: (id: number, name: string) => Promise<void>;
  removePlaylist: (id: number) => Promise<void>;
};

async function loadAll() {
  const db = await openDb();
  const [songs, liked, recent, playlists, artists, downloads] = await Promise.all([
    getAllTracks(db),
    getLikedTracks(db),
    getRecentTracks(db, 24),
    getPlaylists(db),
    getArtists(db),
    getDownloadedTracks(db),
  ]);
  return { songs, liked, recent, playlists, artists, downloads };
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  ready: false,
  theme: "dark",
  songs: [],
  liked: [],
  recent: [],
  playlists: [],
  artists: [],
  downloads: [],

  hydrate: async () => {
    const db = await openDb();
    const theme = (await getSetting(db, "theme")) === "light" ? "light" : "dark";
    const data = await loadAll();
    set({ ready: true, theme, ...data });
  },

  refresh: async () => {
    const data = await loadAll();
    set(data);
  },

  toggleTheme: async () => {
    const next = get().theme === "dark" ? "light" : "dark";
    set({ theme: next });
    const db = await openDb();
    await setSetting(db, "theme", next);
  },

  like: async (song, liked) => {
    const db = await openDb();
    await upsertTrack(db, song);
    await setLiked(db, song.id, liked);
    await get().refresh();
  },

  newPlaylist: async (name) => {
    const db = await openDb();
    const id = await createPlaylist(db, name);
    await get().refresh();
    return id;
  },

  rename: async (id, name) => {
    const db = await openDb();
    await renamePlaylist(db, id, name);
    await get().refresh();
  },

  removePlaylist: async (id) => {
    const db = await openDb();
    await deletePlaylist(db, id);
    await get().refresh();
  },
}));
