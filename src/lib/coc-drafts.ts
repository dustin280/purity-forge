const STORAGE_KEY = "coc-drafts:v1";

export type CocDraft = {
  draftId: string;
  /** If editing an existing record, the id; null for new CoC drafts */
  recordId: string | null;
  values: Record<string, string | string[]>;
  lineItems: unknown[];
  /** Names of files queued for upload; binary data is not persisted */
  pendingFileNames: string[];
  updatedAt: string;
  /** Short human summary for the drafts list */
  summary: string;
};

type DraftMap = Record<string, CocDraft>;

function safeRead(): DraftMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const obj = JSON.parse(raw);
    return obj && typeof obj === "object" ? (obj as DraftMap) : {};
  } catch {
    return {};
  }
}

function safeWrite(map: DraftMap) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
    window.dispatchEvent(new Event("coc-drafts-changed"));
  } catch {
    /* quota or serialization failure — ignore */
  }
}

export function listCocDrafts(): CocDraft[] {
  const map = safeRead();
  return Object.values(map).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

export function getCocDraft(draftId: string): CocDraft | null {
  return safeRead()[draftId] ?? null;
}

export function saveCocDraft(draft: CocDraft) {
  const map = safeRead();
  map[draft.draftId] = draft;
  safeWrite(map);
}

export function deleteCocDraft(draftId: string) {
  const map = safeRead();
  if (draftId in map) {
    delete map[draftId];
    safeWrite(map);
  }
}

export function newDraftId(prefix = "draft"): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${rand}`;
}

/** Subscribe to draft changes across tabs and within this tab. */
export function subscribeCocDrafts(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onStorage = (e: StorageEvent) => { if (e.key === STORAGE_KEY) cb(); };
  const onLocal = () => cb();
  window.addEventListener("storage", onStorage);
  window.addEventListener("coc-drafts-changed", onLocal);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("coc-drafts-changed", onLocal);
  };
}