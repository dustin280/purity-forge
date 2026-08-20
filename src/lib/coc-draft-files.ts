/**
 * IndexedDB-backed persistence for a CoC draft's pending (not-yet-uploaded)
 * attachment files. localStorage (used for the rest of a draft — see
 * coc-drafts.ts) can't hold File/Blob data reliably: quota is tiny (a few
 * MB shared across the whole origin) and photos from a phone camera blow
 * through that fast. IndexedDB stores File objects natively (no base64
 * encoding needed) with a much larger quota, so a draft's attached photos
 * actually survive being closed and resumed.
 */
const DB_NAME = "coc-draft-files";
const STORE = "files";

export type DraftFiles = {
  pendingFiles: File[];
  pendingByLine: Record<number, File[]>;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveDraftFiles(draftId: string, files: DraftFiles): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(files, draftId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    /* best-effort, same tolerance as the localStorage draft it accompanies */
  }
}

export async function getDraftFiles(draftId: string): Promise<DraftFiles | null> {
  if (typeof indexedDB === "undefined") return null;
  try {
    const db = await openDb();
    const result = await new Promise<DraftFiles | null>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(draftId);
      req.onsuccess = () => resolve((req.result as DraftFiles | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return result;
  } catch {
    return null;
  }
}

export async function deleteDraftFiles(draftId: string): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(draftId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    /* ignore */
  }
}
