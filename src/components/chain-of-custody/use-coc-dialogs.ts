import { useState } from "react";
import type { CocDraft } from "@/lib/coc-drafts";

/**
 * Local UI state for the CoC page dialogs: which record is being edited,
 * which draft is being resumed, and which record is being viewed. Exposes
 * stable handlers that keep the form-dialog open/close logic in one place.
 */
export function useCocDialogs() {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [resumeDraftId, setResumeDraftId] = useState<string | null>(null);

  function openNew() { setEditingId(null); setResumeDraftId(null); setOpen(true); }
  function openEdit(id: string) { setEditingId(id); setResumeDraftId(null); setOpen(true); }
  function openDraft(d: CocDraft) {
    setEditingId(d.recordId);
    setResumeDraftId(d.draftId);
    setOpen(true);
  }

  return {
    open, setOpen, editingId, viewingId, resumeDraftId,
    setViewingId, openNew, openEdit, openDraft,
  };
}