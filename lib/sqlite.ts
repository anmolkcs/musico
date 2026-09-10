import * as SQLite from "expo-sqlite";
import { SCHEMA_SQL } from "./db-schema";

export type MusicoDb = SQLite.SQLiteDatabase;

/** Opens (once) and migrates the database; concurrent callers share the promise. */
export function openDb(): Promise<MusicoDb> {
  if (!dbPromise) dbPromise = initDb();
  return dbPromise;
}

async function initDb(): Promise<MusicoDb> {
  const db = await SQLite.openDatabaseAsync("musico.db");
  await db.execAsync(SCHEMA_SQL);
  const versionRow = await db.getFirstAsync<{ user_version: number }>("PRAGMA user_version");
  const version = versionRow?.user_version ?? 0;
  if (version < 1) {
    await db.execAsync("PRAGMA user_version = 1");
  }
  if (version < 2) {
    // Playlist covers + descriptions.
    const cols = await db.getAllAsync<{ name: string }>("PRAGMA table_info(playlists)");
    const names = new Set(cols.map((c) => c.name));
    if (!names.has("description")) {
      await db.execAsync("ALTER TABLE playlists ADD COLUMN description TEXT NOT NULL DEFAULT ''");
    }
    if (!names.has("coverUri")) {
      await db.execAsync("ALTER TABLE playlists ADD COLUMN coverUri TEXT NOT NULL DEFAULT ''");
    }
    await db.execAsync("PRAGMA user_version = 2");
  }
  return db;
}

let dbPromise: Promise<MusicoDb> | null = null;
