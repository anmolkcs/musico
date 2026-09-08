import { create } from "zustand";
import { openDb, setDownloadStatus, upsertTrack } from "./db";
import { Song } from "./types";
import { resolveStream } from "./player";
import { useLibraryStore } from "../store/library";
import { deleteLocalAudio, getLocalAudio, putLocalAudio } from "./media-store.web";

// Web counterpart of lib/downloads.ts. There is no resumable-download API in
// the browser, so tracks are fetched with a ReadableStream (for progress) and
// stored as Blobs in IndexedDB; playback resolves them to object URLs via
// lib/local-media.web.

type DownloadStatus = "queued" | "downloading" | "done" | "error";

export type DownloadInfo = {
  song: Song;
  status: DownloadStatus;
  progress: number; // 0..1
  localPath?: string;
  error?: string;
};

const controllers = new Map<string, AbortController>();
const attempts = new Map<string, number>();
const cancelled = new Set<number>();

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
    // Downloads that were in-flight when the tab closed can't resume; reset
    // their status and drop blobs that no longer match a "done" track.
    const db = await openDb();
    await db.runAsync(`UPDATE tracks SET downloadStatus = 0 WHERE downloadStatus = 1`).catch(() => {});
    try {
      const doneRows = await db.getAllAsync<{ id: string; localPath: string | null }>(
        `SELECT id, localPath FROM tracks WHERE downloadStatus = 2`
      );
      for (const row of doneRows) {
        const stored = await getLocalAudio(row.id).catch(() => null);
        if (!stored) await setDownloadStatus(db, row.id, 0, null);
      }
    } catch {}
  },

  start: async (song) => {
    if (get().items[song.id]?.status === "downloading") return;
    const attempt = (attempts.get(song.id) ?? 0) + 1;
    attempts.set(song.id, attempt);
    set((state) => ({
      items: {
        ...state.items,
        [song.id]: { song, status: "downloading", progress: 0 },
      },
    }));
    cancelled.delete(attempt);
    const controller = new AbortController();
    controllers.set(song.id, controller);
    const db = await openDb();
    const assertCurrent = () => {
      if (attempts.get(song.id) !== attempt || cancelled.has(attempt)) {
        throw new Error("Download cancelled");
      }
    };
    try {
      assertCurrent();
      await upsertTrack(db, song);
      await setDownloadStatus(db, song.id, 1);
      const stream = await resolveStream(song.id);
      assertCurrent();
      if (!stream.streamUrl) throw new Error("Could not resolve audio stream");

      const response = await fetch(stream.streamUrl, { signal: controller.signal });
      assertCurrent();
      if (!response.ok && response.status !== 206) {
        throw new Error(`Download failed (HTTP ${response.status})`);
      }
      const total = Number(response.headers.get("content-length") ?? 0);
      let blob: Blob;
      if (response.body && typeof response.body.getReader === "function") {
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let written = 0;
        let lastUpdate = 0;
        for (;;) {
          const { done, value } = await reader.read();
          assertCurrent();
          if (done) break;
          if (value) {
            chunks.push(value);
            written += value.byteLength;
            const now = Date.now();
            if (total > 0 && now - lastUpdate > 250) {
              lastUpdate = now;
              const p = written / total;
              set((state) => {
                const item = state.items[song.id];
                if (!item || item.status !== "downloading") return state;
                return {
                  items: { ...state.items, [song.id]: { ...item, progress: Math.min(1, p) } },
                };
              });
            }
          }
        }
        blob = new Blob(chunks as BlobPart[], {
          type: stream.mimeType || response.headers.get("content-type") || "audio/mp4",
        });
      } else {
        blob = await response.blob();
      }
      assertCurrent();

      await putLocalAudio(song.id, blob, stream.format || "m4a");
      const localPath = `idb://musico-media/${song.id}.${stream.format || "m4a"}`;
      await setDownloadStatus(db, song.id, 2, localPath);
      set((state) => ({
        items: {
          ...state.items,
          [song.id]: { song, status: "done", progress: 1, localPath },
        },
      }));
      useLibraryStore.getState().refresh().catch(() => {});
    } catch (e: any) {
      if (attempts.get(song.id) !== attempt) return;
      const wasCancelled = cancelled.has(attempt);
      await deleteLocalAudio(song.id).catch(() => {});
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
      if (attempts.get(song.id) === attempt) {
        controllers.delete(song.id);
        cancelled.delete(attempt);
      }
    }
  },

  cancel: async (videoId) => {
    const attempt = attempts.get(videoId);
    if (attempt !== undefined) cancelled.add(attempt);
    controllers.get(videoId)?.abort();
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
    await deleteLocalAudio(videoId).catch(() => {});
    await setDownloadStatus(db, videoId, 0, null);
    set((state) => {
      const next = { ...state.items };
      delete next[videoId];
      return { items: next };
    });
    useLibraryStore.getState().refresh().catch(() => {});
  },
}));
