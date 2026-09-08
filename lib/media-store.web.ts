// IndexedDB blob store for downloaded audio on web. Web-only module: consumed
// by lib/local-media.web.ts and lib/downloads.web.ts.

export type StoredAudio = {
  id: string;
  blob: Blob;
  ext: string;
  savedAt: number;
};

const IDB_NAME = "musico-media";
const IDB_STORE = "audio";

function idbOpen(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(IDB_STORE)) {
        request.result.createObjectStore(IDB_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function requestDone<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function putLocalAudio(id: string, blob: Blob, ext: string): Promise<void> {
  const conn = await idbOpen();
  try {
    const store = conn.transaction(IDB_STORE, "readwrite").objectStore(IDB_STORE);
    const record: StoredAudio = { id, blob, ext, savedAt: Date.now() };
    store.put(record);
    await txDone(store.transaction);
  } finally {
    conn.close();
  }
}

export async function getLocalAudio(id: string): Promise<StoredAudio | null> {
  const conn = await idbOpen();
  try {
    const store = conn.transaction(IDB_STORE, "readonly").objectStore(IDB_STORE);
    const result = await requestDone(store.get(id) as IDBRequest<StoredAudio | undefined>);
    return result ?? null;
  } finally {
    conn.close();
  }
}

export async function deleteLocalAudio(id: string): Promise<void> {
  const conn = await idbOpen();
  try {
    const store = conn.transaction(IDB_STORE, "readwrite").objectStore(IDB_STORE);
    store.delete(id);
    await txDone(store.transaction);
  } finally {
    conn.close();
  }
}

export async function hasLocalAudio(id: string): Promise<boolean> {
  return (await getLocalAudio(id)) !== null;
}
