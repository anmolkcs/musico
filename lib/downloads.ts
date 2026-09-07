import * as FileSystem from "expo-file-system/legacy";
import { create } from "zustand";
import { openDb, setDownloadStatus, upsertTrack } from "./db";
import { Song } from "./types";
import { resolveStream } from "./player";

type DownloadStatus = "queued" | "downloading" | "done" | "error";

export type DownloadInfo = {
  song: Song;
  status: DownloadStatus;
  progress: number; // 0..1
  localPath?: string;
  error?: string;
};

const downloadsDir = `${FileSystem.documentDirectory ?? ""}downloads/`;

const resumables = new Map<string, FileSystem.DownloadResumable>();

type DownloadsState = {
  items: Record<string, DownloadInfo>;
  start: (song: Song) => Promise<void>;
  cancel: (videoId: string) => Promise<void>;
  remove: (videoId: string) => Promise<void>;
  setFromDb: (info: DownloadInfo) => void;
  resetStale: () => Promise<void>;
};

function extFor(format: string): string {
  if (format === "webm" || format === "webma") return "webm";
  if (format === "ogg" || format === "opus") return "ogg";
  return "m4a";
}

export const useDownloadsStore = create<DownloadsState>((set, get) => ({
  items: {},

  setFromDb: (info) =>
    set((state) => ({ items: { ...state.items, [info.song.id]: info } })),

  resetStale: async () => {
    // Downloads that were in-flight when the app was killed are not resumable across sessions
    const db = await openDb();
    await db.runAsync(`UPDATE tracks SET downloadStatus = 0 WHERE downloadStatus = 1`);
  },

  start: async (song) => {
    if (get().items[song.id]?.status === "downloading") return;
    set((state) => ({
      items: {
        ...state.items,
        [song.id]: { song, status: "downloading", progress: 0 },
      },
    }));
    const db = await openDb();
    try {
      await upsertTrack(db, song);
      await setDownloadStatus(db, song.id, 1);
      const stream = await resolveStream(song.id);
      if (!stream.streamUrl) throw new Error("Could not resolve audio stream");
      await FileSystem.makeDirectoryAsync(downloadsDir, { intermediates: true }).catch(() => {});
      const fileUri = `${downloadsDir}${song.id}.${extFor(stream.format)}`;
      let lastUpdate = 0;
      const resumable = FileSystem.createDownloadResumable(
        stream.streamUrl,
        fileUri,
        {},
        (progress) => {
          const now = Date.now();
          if (now - lastUpdate < 250) return;
          lastUpdate = now;
          const total = progress.totalBytesExpectedToWrite ?? 0;
          const p = total > 0 ? progress.totalBytesWritten / total : 0;
          set((state) => {
            const item = state.items[song.id];
            if (!item || item.status !== "downloading") return state;
            return {
              items: { ...state.items, [song.id]: { ...item, progress: Math.min(1, p) } },
            };
          });
        }
      );
      resumables.set(song.id, resumable);
      const result = await resumable.downloadAsync();
      if (!result || (result.status !== 200 && result.status !== 206)) {
        throw new Error(`Download failed (HTTP ${result?.status ?? "unknown"})`);
      }
      await setDownloadStatus(db, song.id, 2, result.uri);
      const { useLibraryStore } = await import("../store/library");
      useLibraryStore.getState().refresh().catch(() => {});
      set((state) => ({
        items: {
          ...state.items,
          [song.id]: { song, status: "done", progress: 1, localPath: result.uri },
        },
      }));
    } catch (e: any) {
      const cancelled = e?.message?.toLowerCase().includes("cancel");
      await setDownloadStatus(db, song.id, 0).catch(() => {});
      set((state) => {
        const item = state.items[song.id];
        if (cancelled) {
          const next = { ...state.items };
          delete next[song.id];
          return { items: next };
        }
        return {
          items: {
            ...state.items,
            [song.id]: { song, status: "error", progress: 0, error: e?.message ?? "Download failed" },
          },
        };
      });
    } finally {
      resumables.delete(song.id);
    }
  },

  cancel: async (videoId) => {
    const resumable = resumables.get(videoId);
    if (resumable) {
      await resumable.cancelAsync().catch(() => {});
    }
  },

  remove: async (videoId) => {
    const db = await openDb();
    const item = get().items[videoId];
    if (item?.localPath) {
      await FileSystem.deleteAsync(item.localPath, { idempotent: true }).catch(() => {});
    } else {
      // best effort: delete any file matching the id
      await FileSystem.readDirectoryAsync(downloadsDir)
        .then((files) =>
          Promise.all(
            files.filter((f) => f.startsWith(videoId)).map((f) =>
              FileSystem.deleteAsync(`${downloadsDir}${f}`, { idempotent: true }).catch(() => {})
            )
          )
        )
        .catch(() => {});
    }
    await setDownloadStatus(db, videoId, 0, null);
    set((state) => {
      const next = { ...state.items };
      delete next[videoId];
      return { items: next };
    });
  },
}));
