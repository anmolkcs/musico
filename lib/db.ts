import { MusicoDb, openDb } from "./sqlite";
import { artworkFor, Playlist, Song, TrackRecord } from "./types";

export { openDb };

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

export async function upsertTrack(db: MusicoDb, song: Song) {
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

export async function getAllTracks(db: MusicoDb): Promise<TrackRecord[]> {
  const rows = await db.getAllAsync(
    `SELECT * FROM tracks ORDER BY COALESCE(lastPlayedAt, 0) DESC, title COLLATE NOCASE ASC`
  );
  return rows.map(rowToTrack);
}

export async function getLikedTracks(db: MusicoDb): Promise<TrackRecord[]> {
  const rows = await db.getAllAsync(`SELECT * FROM tracks WHERE liked = 1 ORDER BY likedAt DESC`);
  return rows.map(rowToTrack);
}

export async function getTrack(db: MusicoDb, id: string): Promise<TrackRecord | null> {
  const row = await db.getFirstAsync(`SELECT * FROM tracks WHERE id = ?`, id);
  return row ? rowToTrack(row) : null;
}

export async function setLiked(db: MusicoDb, id: string, liked: boolean) {
  await db.runAsync(`UPDATE tracks SET liked = ?, likedAt = ? WHERE id = ?`, liked ? 1 : 0, liked ? Date.now() : null, id);
}

export async function recordPlay(db: MusicoDb, song: Song) {
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

export async function getRecentTracks(db: MusicoDb, limit = 24): Promise<TrackRecord[]> {
  const rows = await db.getAllAsync(
    `SELECT t.* FROM tracks t
     WHERE t.lastPlayedAt IS NOT NULL
     ORDER BY t.lastPlayedAt DESC LIMIT ?`,
    limit
  );
  return rows.map(rowToTrack);
}

export async function getHistoryCount(db: MusicoDb): Promise<number> {
  const row = await db.getFirstAsync<{ count: number }>(`SELECT COUNT(*) AS count FROM history`);
  return row?.count ?? 0;
}

export async function getHistoryEntries(
  db: MusicoDb,
  limit = 100
): Promise<{ track: TrackRecord; playedAt: number }[]> {
  const rows = await db.getAllAsync(
    `SELECT h.playedAt, t.* FROM history h JOIN tracks t ON t.id = h.trackId
     ORDER BY h.playedAt DESC LIMIT ?`,
    limit
  );
  return rows.map((row: any) => ({ track: rowToTrack(row), playedAt: row.playedAt }));
}

export async function clearHistory(db: MusicoDb) {
  await db.runAsync(`DELETE FROM history`);
}

// ---- Playlists ----

export async function getPlaylists(db: MusicoDb): Promise<Playlist[]> {
  const rows = await db.getAllAsync<{ id: number; name: string; createdAt: number; count: number }>(
    `SELECT p.id, p.name, p.createdAt, COUNT(pt.trackId) AS count
     FROM playlists p LEFT JOIN playlist_tracks pt ON pt.playlistId = p.id
     GROUP BY p.id ORDER BY p.createdAt DESC`
  );
  return rows;
}

export async function createPlaylist(db: MusicoDb, name: string): Promise<number> {
  const result = await db.runAsync(`INSERT INTO playlists (name, createdAt) VALUES (?, ?)`, name, Date.now());
  return result.lastInsertRowId;
}

export async function renamePlaylist(db: MusicoDb, id: number, name: string) {
  await db.runAsync(`UPDATE playlists SET name = ? WHERE id = ?`, name, id);
}

export async function deletePlaylist(db: MusicoDb, id: number) {
  await db.runAsync(`DELETE FROM playlists WHERE id = ?`, id);
  await db.runAsync(`DELETE FROM playlist_tracks WHERE playlistId = ?`, id);
}

export async function addTrackToPlaylist(db: MusicoDb, playlistId: number, song: Song) {
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

export async function removeTrackFromPlaylist(db: MusicoDb, playlistId: number, trackId: string) {
  await db.runAsync(`DELETE FROM playlist_tracks WHERE playlistId = ? AND trackId = ?`, playlistId, trackId);
}

/**
 * Adds many tracks atomically. If any insert fails the whole batch is
 * rolled back, so callers never leave a half-filled playlist behind.
 */
export async function addTracksToPlaylist(db: MusicoDb, playlistId: number, songs: Song[]) {
  await db.execAsync("BEGIN");
  try {
    for (const song of songs) {
      await addTrackToPlaylist(db, playlistId, song);
    }
    await db.execAsync("COMMIT");
  } catch (e) {
    try {
      await db.execAsync("ROLLBACK");
    } catch {
      // Rollback itself failed; surface the original error.
    }
    throw e;
  }
}

export async function getPlaylist(db: MusicoDb, id: number): Promise<Playlist | null> {
  const row = await db.getFirstAsync<{ id: number; name: string; createdAt: number; count: number }>(
    `SELECT p.id, p.name, p.createdAt, COUNT(pt.trackId) AS count
     FROM playlists p LEFT JOIN playlist_tracks pt ON pt.playlistId = p.id
     WHERE p.id = ? GROUP BY p.id`,
    id
  );
  return row ?? null;
}

export async function getPlaylistTracks(db: MusicoDb, id: number): Promise<TrackRecord[]> {
  const rows = await db.getAllAsync(
    `SELECT t.* FROM playlist_tracks pt JOIN tracks t ON t.id = pt.trackId
     WHERE pt.playlistId = ? ORDER BY pt.position ASC`,
    id
  );
  return rows.map(rowToTrack);
}

// ---- Downloads ----

export async function setDownloadStatus(
  db: MusicoDb,
  id: string,
  status: 0 | 1 | 2,
  localPath: string | null = null
) {
  await db.runAsync(`UPDATE tracks SET downloadStatus = ?, localPath = ? WHERE id = ?`, status, localPath, id);
}

export async function getDownloadedTracks(db: MusicoDb): Promise<TrackRecord[]> {
  const rows = await db.getAllAsync(`SELECT * FROM tracks WHERE downloadStatus = 2 ORDER BY title COLLATE NOCASE`);
  return rows.map(rowToTrack);
}

// ---- Lyrics cache ----

export async function saveLyrics(
  db: MusicoDb,
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
  db: MusicoDb,
  trackId: string
): Promise<{ synced: string | null; plain: string | null } | null> {
  const row = await db.getFirstAsync<{ synced: string | null; plain: string | null }>(
    `SELECT synced, plain FROM lyrics WHERE trackId = ?`,
    trackId
  );
  return row ?? null;
}

/** Age in ms of the cached lyrics row (null when uncached). */
export async function getLyricsCacheAge(db: MusicoDb, trackId: string): Promise<number | null> {
  const row = await db.getFirstAsync<{ fetchedAt: number }>(
    `SELECT fetchedAt FROM lyrics WHERE trackId = ?`,
    trackId
  );
  return row ? Date.now() - row.fetchedAt : null;
}

// ---- Settings ----

export async function getSetting(db: MusicoDb, key: string): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string | null }>(`SELECT value FROM settings WHERE key = ?`, key);
  return row?.value ?? null;
}

export async function setSetting(db: MusicoDb, key: string, value: string) {
  await db.runAsync(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`, key, value);
}

export async function getCachedArtistDetails(
  db: MusicoDb,
  name: string
): Promise<{ data: string; fetchedAt: number } | null> {
  return db.getFirstAsync<{ data: string; fetchedAt: number }>(
    `SELECT data, fetchedAt FROM artist_details WHERE name = ? COLLATE NOCASE`,
    name
  );
}

export async function saveArtistDetails(db: MusicoDb, name: string, data: string) {
  await db.runAsync(
    `INSERT OR REPLACE INTO artist_details (name, data, fetchedAt) VALUES (?, ?, ?)`,
    name,
    data,
    Date.now()
  );
}

// ---- Artists ----

export async function getArtists(db: MusicoDb): Promise<{ name: string; count: number }[]> {
  const rows = await db.getAllAsync<{ name: string; count: number }>(
    `SELECT artist AS name, COUNT(*) AS count FROM tracks
     WHERE artist != '' GROUP BY artist COLLATE NOCASE ORDER BY count DESC, name COLLATE NOCASE ASC`
  );
  return rows;
}

export async function getTracksByArtist(db: MusicoDb, name: string): Promise<TrackRecord[]> {
  const rows = await db.getAllAsync(
    `SELECT * FROM tracks WHERE artist = ? COLLATE NOCASE ORDER BY playCount DESC, title COLLATE NOCASE`,
    name
  );
  return rows.map(rowToTrack);
}
