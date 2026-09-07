import * as SQLite from "expo-sqlite";
import { artworkFor, Playlist, Song, TrackRecord } from "./types";

let dbInstance: SQLite.SQLiteDatabase | null = null;

export async function openDb(): Promise<SQLite.SQLiteDatabase> {
  if (dbInstance) return dbInstance;
  const db = await SQLite.openDatabaseAsync("musico.db");
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS tracks (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      artist TEXT NOT NULL DEFAULT '',
      duration INTEGER NOT NULL DEFAULT 0,
      thumbnail TEXT NOT NULL DEFAULT '',
      liked INTEGER NOT NULL DEFAULT 0,
      likedAt INTEGER,
      playCount INTEGER NOT NULL DEFAULT 0,
      lastPlayedAt INTEGER,
      downloadStatus INTEGER NOT NULL DEFAULT 0,
      localPath TEXT
    );
    CREATE TABLE IF NOT EXISTS playlists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      createdAt INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS playlist_tracks (
      playlistId INTEGER NOT NULL,
      trackId TEXT NOT NULL,
      position INTEGER NOT NULL,
      addedAt INTEGER NOT NULL,
      PRIMARY KEY (playlistId, trackId)
    );
    CREATE TABLE IF NOT EXISTS history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trackId TEXT NOT NULL,
      playedAt INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS lyrics (
      trackId TEXT PRIMARY KEY NOT NULL,
      synced TEXT,
      plain TEXT,
      fetchedAt INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_history_playedAt ON history (playedAt DESC);
  `);
  dbInstance = db;
  return db;
}

function rowToTrack(row: any): TrackRecord {
  return {
    id: row.id,
    title: row.title,
    artist: row.artist,
    duration: row.duration,
    thumbnail: row.thumbnail || artworkFor(row.id),
    liked: !!row.liked,
    likedAt: row.likedAt ?? null,
    playCount: row.playCount ?? 0,
    lastPlayedAt: row.lastPlayedAt ?? null,
    downloadStatus: (row.downloadStatus ?? 0) as 0 | 1 | 2,
    localPath: row.localPath ?? null,
  };
}

export async function upsertTrack(db: SQLite.SQLiteDatabase, song: Song) {
  await db.runAsync(
    `INSERT INTO tracks (id, title, artist, duration, thumbnail)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       title = excluded.title,
       artist = CASE WHEN excluded.artist != '' THEN excluded.artist ELSE tracks.artist END,
       duration = CASE WHEN excluded.duration > 0 THEN excluded.duration ELSE tracks.duration END,
       thumbnail = CASE WHEN excluded.thumbnail != '' THEN excluded.thumbnail ELSE tracks.thumbnail END`,
    song.id,
    song.title,
    song.artist ?? "",
    Math.max(0, Math.round(song.duration ?? 0)),
    song.thumbnail ?? ""
  );
}

export async function getAllTracks(db: SQLite.SQLiteDatabase): Promise<TrackRecord[]> {
  const rows = await db.getAllAsync(
    `SELECT * FROM tracks ORDER BY COALESCE(lastPlayedAt, 0) DESC, title COLLATE NOCASE ASC`
  );
  return rows.map(rowToTrack);
}

export async function getLikedTracks(db: SQLite.SQLiteDatabase): Promise<TrackRecord[]> {
  const rows = await db.getAllAsync(`SELECT * FROM tracks WHERE liked = 1 ORDER BY likedAt DESC`);
  return rows.map(rowToTrack);
}

export async function getTrack(db: SQLite.SQLiteDatabase, id: string): Promise<TrackRecord | null> {
  const row = await db.getFirstAsync(`SELECT * FROM tracks WHERE id = ?`, id);
  return row ? rowToTrack(row) : null;
}

export async function setLiked(db: SQLite.SQLiteDatabase, id: string, liked: boolean) {
  await db.runAsync(`UPDATE tracks SET liked = ?, likedAt = ? WHERE id = ?`, liked ? 1 : 0, liked ? Date.now() : null, id);
}

export async function recordPlay(db: SQLite.SQLiteDatabase, song: Song) {
  await upsertTrack(db, song);
  const now = Date.now();
  await db.runAsync(
    `UPDATE tracks SET playCount = playCount + 1, lastPlayedAt = ? WHERE id = ?`,
    now,
    song.id
  );
  await db.runAsync(`INSERT INTO history (trackId, playedAt) VALUES (?, ?)`, song.id, now);
  await db.runAsync(
    `DELETE FROM history WHERE id NOT IN (SELECT id FROM history ORDER BY playedAt DESC LIMIT 500)`
  );
}

export async function getRecentTracks(db: SQLite.SQLiteDatabase, limit = 24): Promise<TrackRecord[]> {
  const rows = await db.getAllAsync(
    `SELECT t.* FROM tracks t
     WHERE t.lastPlayedAt IS NOT NULL
     ORDER BY t.lastPlayedAt DESC LIMIT ?`,
    limit
  );
  return rows.map(rowToTrack);
}

export async function getHistoryEntries(
  db: SQLite.SQLiteDatabase,
  limit = 100
): Promise<{ track: TrackRecord; playedAt: number }[]> {
  const rows = await db.getAllAsync(
    `SELECT h.playedAt, t.* FROM history h JOIN tracks t ON t.id = h.trackId
     ORDER BY h.playedAt DESC LIMIT ?`,
    limit
  );
  return rows.map((row: any) => ({ track: rowToTrack(row), playedAt: row.playedAt }));
}

export async function clearHistory(db: SQLite.SQLiteDatabase) {
  await db.runAsync(`DELETE FROM history`);
}

// ---- Playlists ----

export async function getPlaylists(db: SQLite.SQLiteDatabase): Promise<Playlist[]> {
  const rows = await db.getAllAsync<{ id: number; name: string; createdAt: number; count: number }>(
    `SELECT p.id, p.name, p.createdAt, COUNT(pt.trackId) AS count
     FROM playlists p LEFT JOIN playlist_tracks pt ON pt.playlistId = p.id
     GROUP BY p.id ORDER BY p.createdAt DESC`
  );
  return rows;
}

export async function createPlaylist(db: SQLite.SQLiteDatabase, name: string): Promise<number> {
  const result = await db.runAsync(`INSERT INTO playlists (name, createdAt) VALUES (?, ?)`, name, Date.now());
  return result.lastInsertRowId;
}

export async function renamePlaylist(db: SQLite.SQLiteDatabase, id: number, name: string) {
  await db.runAsync(`UPDATE playlists SET name = ? WHERE id = ?`, name, id);
}

export async function deletePlaylist(db: SQLite.SQLiteDatabase, id: number) {
  await db.runAsync(`DELETE FROM playlists WHERE id = ?`, id);
  await db.runAsync(`DELETE FROM playlist_tracks WHERE playlistId = ?`, id);
}

export async function addTrackToPlaylist(db: SQLite.SQLiteDatabase, playlistId: number, song: Song) {
  await upsertTrack(db, song);
  const row = await db.getFirstAsync<{ maxPos: number | null }>(
    `SELECT MAX(position) AS maxPos FROM playlist_tracks WHERE playlistId = ?`,
    playlistId
  );
  const pos = (row?.maxPos ?? -1) + 1;
  await db.runAsync(
    `INSERT OR IGNORE INTO playlist_tracks (playlistId, trackId, position, addedAt) VALUES (?, ?, ?, ?)`,
    playlistId,
    song.id,
    pos,
    Date.now()
  );
}

export async function removeTrackFromPlaylist(db: SQLite.SQLiteDatabase, playlistId: number, trackId: string) {
  await db.runAsync(`DELETE FROM playlist_tracks WHERE playlistId = ? AND trackId = ?`, playlistId, trackId);
}

export async function getPlaylist(db: SQLite.SQLiteDatabase, id: number): Promise<Playlist | null> {
  const row = await db.getFirstAsync<{ id: number; name: string; createdAt: number; count: number }>(
    `SELECT p.id, p.name, p.createdAt, COUNT(pt.trackId) AS count
     FROM playlists p LEFT JOIN playlist_tracks pt ON pt.playlistId = p.id
     WHERE p.id = ? GROUP BY p.id`,
    id
  );
  return row ?? null;
}

export async function getPlaylistTracks(db: SQLite.SQLiteDatabase, id: number): Promise<TrackRecord[]> {
  const rows = await db.getAllAsync(
    `SELECT t.* FROM playlist_tracks pt JOIN tracks t ON t.id = pt.trackId
     WHERE pt.playlistId = ? ORDER BY pt.position ASC`,
    id
  );
  return rows.map(rowToTrack);
}

// ---- Downloads ----

export async function setDownloadStatus(
  db: SQLite.SQLiteDatabase,
  id: string,
  status: 0 | 1 | 2,
  localPath: string | null = null
) {
  await db.runAsync(`UPDATE tracks SET downloadStatus = ?, localPath = ? WHERE id = ?`, status, localPath, id);
}

export async function getDownloadedTracks(db: SQLite.SQLiteDatabase): Promise<TrackRecord[]> {
  const rows = await db.getAllAsync(`SELECT * FROM tracks WHERE downloadStatus = 2 ORDER BY title COLLATE NOCASE`);
  return rows.map(rowToTrack);
}

// ---- Lyrics cache ----

export async function saveLyrics(
  db: SQLite.SQLiteDatabase,
  trackId: string,
  synced: string | null,
  plain: string | null
) {
  await db.runAsync(
    `INSERT OR REPLACE INTO lyrics (trackId, synced, plain, fetchedAt) VALUES (?, ?, ?, ?)`,
    trackId,
    synced,
    plain,
    Date.now()
  );
}

export async function getCachedLyrics(
  db: SQLite.SQLiteDatabase,
  trackId: string
): Promise<{ synced: string | null; plain: string | null } | null> {
  const row = await db.getFirstAsync<{ synced: string | null; plain: string | null }>(
    `SELECT synced, plain FROM lyrics WHERE trackId = ?`,
    trackId
  );
  return row ?? null;
}

// ---- Settings ----

export async function getSetting(db: SQLite.SQLiteDatabase, key: string): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string | null }>(`SELECT value FROM settings WHERE key = ?`, key);
  return row?.value ?? null;
}

export async function setSetting(db: SQLite.SQLiteDatabase, key: string, value: string) {
  await db.runAsync(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`, key, value);
}

// ---- Artists ----

export async function getArtists(db: SQLite.SQLiteDatabase): Promise<{ name: string; count: number }[]> {
  const rows = await db.getAllAsync<{ name: string; count: number }>(
    `SELECT artist AS name, COUNT(*) AS count FROM tracks
     WHERE artist != '' GROUP BY artist COLLATE NOCASE ORDER BY count DESC, name COLLATE NOCASE ASC`
  );
  return rows;
}

export async function getTracksByArtist(db: SQLite.SQLiteDatabase, name: string): Promise<TrackRecord[]> {
  const rows = await db.getAllAsync(
    `SELECT * FROM tracks WHERE artist = ? COLLATE NOCASE ORDER BY playCount DESC, title COLLATE NOCASE`,
    name
  );
  return rows.map(rowToTrack);
}
