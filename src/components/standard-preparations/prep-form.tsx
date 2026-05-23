import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  type PrepFormValues,
  clearPrepDraft,
} from "./prep-form-logic";
import { usePrepForm } from "./use-prep-form";
import { PrepDetailsCard } from "./prep-details-card";
import { PrepCalculatorCard } from "./prep-calculator-card";
import { PrepStepsCard } from "./prep-steps-card";
import { PrepStorageCard } from "./prep-storage-card";

export {
  clearPrepDraft,
  emptyPrepValues,
  prepValuesToPayload,
} from "./prep-form-logic";
export type {
  PrepFormValues,
  TargetRow,
  ExpirationCode,
} from "./prep-form-logic";

interface Props {
  initial?: Partial<PrepFormValues>;
  defaultAnalystName: string;
  submitting?: boolean;
  submitLabel?: string;
  onSubmit: (values: PrepFormValues) => void;
  onCancel?: () => void;
  /**
   * If provided, form values are persisted to localStorage under this key and
   * restored on mount. Parent should call `clearPrepDraft(draftKey)` after a
   * successful save.
   */
  draftKey?: string;
  /**
   * Batch mode: the calculator's target rows are the standards. Hides the
   * single "Standard name" required field, shows a SYN ID preview column,
   * and the submit button reflects the row count.
   */
  batchMode?: boolean;
  /**
   * Prefix for SYN ID preview, e.g. "SYN_052026_JDS_". A "?" is appended
   * per row since the real counter is assigned server-side.
   */
  synPreviewPrefix?: string;
}

export function PrepForm({ initial, defaultAnalystName, submitting, submitLabel = "Save", onSubmit, onCancel, draftKey, batchMode = false, synPreviewPrefix }: Props) {
  const f = usePrepForm({ initial, defaultAnalystName, draftKey });
  const { v, hasDraft, dirtyRef, discardDraft } = f;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (batchMode) {
      const nonEmpty = v.targets.filter(t => t.name.trim() || t.target_concentration_mg_per_ml || t.target_volume_ml);
      if (nonEmpty.length === 0) {
        toast.error("Add at least one standard to the calculator before saving.");
        return;
      }
    }
    onSubmit(v);
  }

  function handleCancel() {
    if (!onCancel) return;
    if (dirtyRef.current && draftKey) {
      const ok = window.confirm("Discard unsaved preparation? Your changes will be lost.");
      if (!ok) return;
      clearPrepDraft(draftKey);
    }
    onCancel();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {hasDraft && draftKey && (
        <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs flex items-center justify-between gap-2">
          <span className="text-foreground">Restored unsaved draft. Your changes are auto-saved in this browser until you submit or discard.</span>
          <Button type="button" size="sm" variant="ghost" onClick={discardDraft}>Discard draft</Button>
        </div>
      )}
      <PrepDetailsCard f={f} batchMode={batchMode} />
      <PrepCalculatorCard f={f} batchMode={batchMode} synPreviewPrefix={synPreviewPrefix} />
      <PrepStepsCard f={f} />
      <PrepStorageCard f={f} />

      {batchMode && (
        <div className="text-xs text-muted-foreground -mt-2 px-1">
          Final SYN IDs are assigned in order on save. Each standard becomes its own line in the journal.
        </div>
      )}
      <div className="flex gap-2 justify-end">
        {onCancel && <Button type="button" variant="ghost" onClick={handleCancel}>Cancel</Button>}
        <Button type="submit" disabled={submitting}>
          {submitting
            ? "Saving…"
            : batchMode
              ? `Save ${v.targets.filter(t => t.name.trim() || t.target_concentration_mg_per_ml || t.target_volume_ml).length} standards to log`
              : submitLabel}
        </Button>
      </div>
    </form>
  );
}