import * as FileSystem from "expo-file-system/legacy";
import { create } from "zustand";
import { openDb, setDownloadStatus, upsertTrack } from "./db";
import { Song } from "./types";
import { resolveStream } from "./player";
import { extFor } from "./format";
import { useLibraryStore } from "../store/library";

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
// Cancellation is signalled explicitly instead of by matching error strings
const cancelled = new Set<string>();

type DownloadsState = {
  items: Record<string, DownloadInfo>;
  start: (song: Song) => Promise<void>;
  cancel: (videoId: string) => Promise<void>;
  remove: (videoId: string) => Promise<void>;
  resetStale: () => Promise<void>;
};

export const useDownloadsStore = create<DownloadsState>((set, get) => ({
  items: {},

  resetStale: async () => {
    // Downloads that were in-flight when the app was killed can't resume across
    // sessions; reset their status and delete the orphaned partial files.
    const db = await openDb();
    await db.runAsync(`UPDATE tracks SET downloadStatus = 0 WHERE downloadStatus = 1`);
    try {
      const doneIds = new Set(
        (await db.getAllAsync<{ id: string }>(`SELECT id FROM tracks WHERE downloadStatus = 2`)).map((r) => r.id)
      );
      const files = await FileSystem.readDirectoryAsync(downloadsDir).catch(() => [] as string[]);
      await Promise.all(
        files
          .filter((f) => !doneIds.has(f.replace(/\.[^.]+$/, "")))
          .map((f) => FileSystem.deleteAsync(`${downloadsDir}${f}`, { idempotent: true }).catch(() => {}))
      );
    } catch {}
  },

  start: async (song) => {
    if (get().items[song.id]?.status === "downloading") return;
    set((state) => ({
      items: {
        ...state.items,
        [song.id]: { song, status: "downloading", progress: 0 },
      },
    }));
    cancelled.delete(song.id);
    const db = await openDb();
    let fileUri = `${downloadsDir}${song.id}.m4a`;
    try {
      await upsertTrack(db, song);
      await setDownloadStatus(db, song.id, 1);
      const stream = await resolveStream(song.id);
      if (!stream.streamUrl) throw new Error("Could not resolve audio stream");
      await FileSystem.makeDirectoryAsync(downloadsDir, { intermediates: true }).catch(() => {});
      fileUri = `${downloadsDir}${song.id}.${extFor(stream.format)}`;
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
      set((state) => ({
        items: {
          ...state.items,
          [song.id]: { song, status: "done", progress: 1, localPath: result.uri },
        },
      }));
      useLibraryStore.getState().refresh().catch(() => {});
    } catch (e: any) {
      const wasCancelled = cancelled.has(song.id);
      // never leave a partial file behind
      await FileSystem.deleteAsync(fileUri, { idempotent: true }).catch(() => {});
      await setDownloadStatus(db, song.id, 0).catch(() => {});
      set((state) => {
        if (wasCancelled) {
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
      cancelled.delete(song.id);
    }
  },

  cancel: async (videoId) => {
    cancelled.add(videoId);
    const resumable = resumables.get(videoId);
    if (resumable) {
      await resumable.cancelAsync().catch(() => {});
    }
    // If nothing was in flight, drop the queued/errored entry ourselves
    set((state) => {
      const item = state.items[videoId];
      if (!item || item.status === "done") return state;
      const next = { ...state.items };
      delete next[videoId];
      return { items: next };
    });
  },

  remove: async (videoId) => {
    await get().cancel(videoId); // also stops an in-flight download
    const db = await openDb();
    const item = get().items[videoId];
    if (item?.localPath) {
      await FileSystem.deleteAsync(item.localPath, { idempotent: true }).catch(() => {});
    } else {
      // best effort: delete any file matching the id
      await FileSystem.readDirectoryAsync(downloadsDir)
        .then((files) =>
          Promise.all(
            files
              .filter((f) => f.startsWith(videoId))
              .map((f) => FileSystem.deleteAsync(`${downloadsDir}${f}`, { idempotent: true }).catch(() => {}))
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
    useLibraryStore.getState().refresh().catch(() => {});
  },
}));
