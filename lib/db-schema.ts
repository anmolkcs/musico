/** Shared database schema for all platforms (native SQLite and the web adapter). */
export const SCHEMA_SQL = `
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
    createdAt INTEGER NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    coverUri TEXT NOT NULL DEFAULT ''
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
  CREATE TABLE IF NOT EXISTS artist_details (
    name TEXT PRIMARY KEY NOT NULL,
    data TEXT NOT NULL,
    fetchedAt INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_history_playedAt ON history (playedAt DESC);
`;
