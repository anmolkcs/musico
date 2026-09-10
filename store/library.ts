import { create } from "zustand";
import { openDb } from "../lib/db";
import {
  createPlaylist,
  deletePlaylist,
  getArtists,
  getAllTracks,
  getDownloadedTracks,
  getHistoryCount,
  getLikedTracks,
  getPlaylists,
  getRecentTracks,
  getSetting,
  renamePlaylist,
  setLiked,
  setSetting,
  updatePlaylistDetails,
  upsertTrack,
} from "../lib/db";
import { Playlist, Song, TrackRecord } from "../lib/types";
import { AccentTheme } from "../lib/theme";

type LibraryState = {
  ready: boolean;
  theme: "dark" | "light" | null; // null = follow the system setting
  accentTheme: AccentTheme;
  profileName: string;
  songs: TrackRecord[];
  liked: TrackRecord[];
  recent: TrackRecord[];
  playlists: Playlist[];
  artists: { name: string; count: number }[];
  downloads: TrackRecord[];
  historyCount: number;
  hydrate: () => Promise<void>;
  refresh: () => Promise<void>;
  toggleTheme: (current: "dark" | "light") => Promise<void>;
  setAccentTheme: (accent: AccentTheme) => Promise<void>;
  setProfileName: (name: string) => Promise<void>;
  like: (song: Song, liked: boolean) => Promise<void>;
  newPlaylist: (name: string) => Promise<number>;
  rename: (id: number, name: string) => Promise<void>;
  updateDetails: (id: number, details: { name?: string; description?: string; coverUri?: string | null }) => Promise<void>;
  removePlaylist: (id: number) => Promise<void>;
};

async function loadAll() {
  const db = await openDb();
  const results = await Promise.allSettled([
    getAllTracks(db),
    getLikedTracks(db),
    getRecentTracks(db, 24),
    getPlaylists(db),
    getArtists(db),
    getDownloadedTracks(db),
    getHistoryCount(db),
  ]);
  const value = <T,>(index: number, fallback: T) =>
    results[index].status === "fulfilled" ? results[index].value as T : fallback;
  return {
    songs: value(0, []),
    liked: value(1, []),
    recent: value(2, []),
    playlists: value(3, []),
    artists: value(4, []),
    downloads: value(5, []),
    historyCount: value(6, 0),
  };
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  ready: false,
  theme: null,
  accentTheme: "ruby",
  profileName: "",
  songs: [],
  liked: [],
  recent: [],
  playlists: [],
  artists: [],
  downloads: [],
  historyCount: 0,

  hydrate: async () => {
    const db = await openDb();
    const stored = await getSetting(db, "theme");
    const storedAccent = await getSetting(db, "accentTheme");
    const profileName = (await getSetting(db, "profileName")) ?? "";
    const theme = stored === "light" || stored === "dark" ? stored : null;
    const accentTheme: AccentTheme =
      storedAccent === "ocean" || storedAccent === "emerald" || storedAccent === "violet" || storedAccent === "amber"
        ? storedAccent
        : "ruby";
    const data = await loadAll();
    set({ ready: true, theme, accentTheme, profileName, ...data });
  },

  refresh: async () => {
    const data = await loadAll();
    set(data);
  },

  toggleTheme: async (current) => {
    const next = current === "dark" ? "light" : "dark";
    set({ theme: next });
    const db = await openDb();
    await setSetting(db, "theme", next);
  },

  setAccentTheme: async (accent) => {
    set({ accentTheme: accent });
    const db = await openDb();
    await setSetting(db, "accentTheme", accent);
  },

  setProfileName: async (name) => {
    const profileName = name.trim().slice(0, 40);
    set({ profileName });
    const db = await openDb();
    await setSetting(db, "profileName", profileName);
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

  updateDetails: async (id, details) => {
    const db = await openDb();
    await updatePlaylistDetails(db, id, details);
    await get().refresh();
  },

  removePlaylist: async (id) => {
    const db = await openDb();
    await deletePlaylist(db, id);
    await get().refresh();
  },
}));
