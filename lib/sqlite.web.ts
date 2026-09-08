import initSqlJs, { Database, SqlJsStatic } from "sql.js/dist/sql-asm.js";
import { SCHEMA_SQL } from "./db-schema";

// Web adapter behind the same openDb() contract as lib/sqlite.ts (expo-sqlite).
// SQLite runs fully in-memory via sql.js (the asm.js build, so no WASM asset or
// cross-origin-isolation headers are needed) and the database image is
// persisted to IndexedDB, debounced after write activity.

export type MusicoDb = {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, ...params: (string | number | null)[]): Promise<{ changes: number; lastInsertRowId: number }>;
  getAllAsync<T = Record<string, unknown>>(sql: string, ...params: (string | number | null)[]): Promise<T[]>;
  getFirstAsync<T = Record<string, unknown>>(sql: string, ...params: (string | number | null)[]): Promise<T | null>;
};

const DB_NAME = "musico.db";
const IDB_NAME = "musico-db";
const IDB_STORE = "sqlite";
const PERSIST_DEBOUNCE_MS = 400;

let dbPromise: Promise<MusicoDb> | null = null;

export function openDb(): Promise<MusicoDb> {
  if (!dbPromise) dbPromise = initDb();
  return dbPromise;
}

// ---- IndexedDB helpers ----

function idbOpen(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(IDB_STORE)) {
        request.result.createObjectStore(IDB_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function idbGet<T>(db: IDBDatabase, key: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readonly");
    const request = tx.objectStore(IDB_STORE).get(key);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error);
  });
}

function idbPut(db: IDBDatabase, key: string, value: Uint8Array): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ---- Persistence ----

let persistTimer: ReturnType<typeof setTimeout> | null = null;
let persisting: Promise<void> = Promise.resolve();

function schedulePersist(sqlDb: Database) {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    persisting = persisting
      .then(async () => {
        const idb = await idbOpen();
        await idbPut(idb, DB_NAME, sqlDb.export());
        idb.close();
      })
      .catch((e) => console.warn("sqlite persist failed", e));
  }, PERSIST_DEBOUNCE_MS);
}

// ---- Adapter ----

class WebSqliteDatabase implements MusicoDb {
  constructor(private readonly sqlDb: Database) {}

  async execAsync(sql: string): Promise<void> {
    this.sqlDb.exec(sql);
    schedulePersist(this.sqlDb);
  }

  async runAsync(sql: string, ...params: (string | number | null)[]) {
    const stmt = this.sqlDb.prepare(sql);
    try {
      if (params.length > 0) stmt.bind(params);
      stmt.step();
    } finally {
      stmt.free();
    }
    const changes = this.sqlDb.getRowsModified();
    const idRow = this.sqlDb.exec("SELECT last_insert_rowid() AS id");
    const lastInsertRowId = Number(idRow[0]?.values[0]?.[0] ?? 0);
    schedulePersist(this.sqlDb);
    return { changes, lastInsertRowId };
  }

  private query(sql: string, params: (string | number | null)[]): Record<string, unknown>[] {
    const stmt = this.sqlDb.prepare(sql);
    try {
      if (params.length > 0) stmt.bind(params);
      const rows: Record<string, unknown>[] = [];
      while (stmt.step()) {
        rows.push(stmt.getAsObject() as Record<string, unknown>);
      }
      return rows;
    } finally {
      stmt.free();
    }
  }

  async getAllAsync<T = Record<string, unknown>>(sql: string, ...params: (string | number | null)[]): Promise<T[]> {
    return this.query(sql, params) as T[];
  }

  async getFirstAsync<T = Record<string, unknown>>(sql: string, ...params: (string | number | null)[]): Promise<T | null> {
    const rows = this.query(sql, params);
    return (rows[0] as T) ?? null;
  }
}

async function initDb(): Promise<MusicoDb> {
  const SQL: SqlJsStatic = await initSqlJs();
  const idb = await idbOpen();
  const saved = await idbGet<Uint8Array>(idb, DB_NAME);
  idb.close();

  const sqlDb = saved ? new SQL.Database(saved) : new SQL.Database();
  if (!saved) {
    sqlDb.exec(SCHEMA_SQL);
    schedulePersist(sqlDb);
  } else {
    // Older images may predate the latest schema; idempotent migration.
    sqlDb.exec(SCHEMA_SQL);
  }

  // Flush pending state before the tab closes.
  if (typeof window !== "undefined") {
    window.addEventListener("pagehide", () => {
      try {
        const idb2 = idbOpen();
        idb2.then((conn) => idbPut(conn, DB_NAME, sqlDb.export()).then(() => conn.close())).catch(() => {});
      } catch {}
    });
  }

  return new WebSqliteDatabase(sqlDb);
}
