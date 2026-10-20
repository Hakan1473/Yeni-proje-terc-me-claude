import type { ConversationRecord } from '../../shared/types';

/**
 * Conversations are stored in IndexedDB on this device only. IndexedDB has
 * no 5 MB ceiling (localStorage does) and does not block the main thread.
 */

const DB = 'tercuman';
const STORE = 'conversations';
const MAX_RECORDS = 50;

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T> | undefined): Promise<T | undefined> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = run(t.objectStore(STORE));
    t.oncomplete = () => resolve(req?.result);
    t.onerror = () => reject(t.error);
  });
}

export async function listConversations(): Promise<ConversationRecord[]> {
  try {
    const all = ((await tx('readonly', (s) => s.getAll())) ?? []) as ConversationRecord[];
    return all.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

export async function saveConversation(record: ConversationRecord): Promise<void> {
  try {
    await tx('readwrite', (s) => s.put(record));
    const all = await listConversations();
    for (const old of all.slice(MAX_RECORDS)) await deleteConversation(old.id);
  } catch {
    // storage unavailable: the conversation stays on screen only
  }
}

export async function deleteConversation(id: string): Promise<void> {
  try {
    await tx('readwrite', (s) => s.delete(id));
  } catch {
    // ignore
  }
}

export async function clearConversations(): Promise<void> {
  try {
    await tx('readwrite', (s) => s.clear());
  } catch {
    // ignore
  }
}

/** Remove conversations older than the retention window (0 = keep). */
export async function applyRetention(days: number): Promise<void> {
  if (!days) return;
  const cutoff = Date.now() - days * 86_400_000;
  for (const r of await listConversations()) if (r.updatedAt < cutoff) await deleteConversation(r.id);
}
