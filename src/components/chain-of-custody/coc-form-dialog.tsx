/**
 * Create / edit dialog for a Chain of Custody record. The heavy lifting
 * (state, draft hydration, autosave, save mutation, attachment uploads)
 * lives in `use-coc-form`; this file is the dialog shell + the per-field
 * renderer that maps a CocField definition to an input control.
 */
import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { AttachmentsSection } from "./attachments-section";
import { MultiselectField } from "./coc-multiselect-field";
import { CocLineItemsSection } from "./coc-line-items-section";
import { useCocForm } from "./use-coc-form";
import { ClientPicker } from "./client-picker";
import { nowDatetimeInput, toDateInput, toLocalDatetimeInput } from "@/lib/date-input";
import type { CocField } from "./types";

export function CocFormDialog({ open, onOpenChange, recordId, resumeDraftId, initialFile }: {
  open: boolean; onOpenChange: (v: boolean) => void; recordId: string | null;
  resumeDraftId: string | null;
  initialFile?: File | null;
}) {
  const f = useCocForm({ open, recordId, resumeDraftId, onOpenChange, initialFile: initialFile ?? null });
  const {
    activeFields, activeParams, attachments,
    values, setValuesDirty,
    lineItems, setLineItemsDirty,
    pendingFiles, setPendingFiles, setIsDirty,
    pendingByLine, setPendingByLine,
    saveMut, attemptClose,
    openExistingAttachment, deleteExistingAttachment,
    registerNewClient, setRegisterNewClient, applyClient,
  } = f;

  function renderField(field: CocField) {
    if (field.field_type === "multiselect") {
      const selected = (values[field.field_key] as string[]) ?? [];
      function toggleParam(name: string) {
        setValuesDirty(prev => {
          const arr = new Set((prev[field.field_key] as string[]) ?? []);
          if (arr.has(name)) arr.delete(name); else arr.add(name);
          return { ...prev, [field.field_key]: Array.from(arr) };
        });
      }
      return (
        <MultiselectField
          fieldKey={field.field_key}
          selected={selected}
          options={activeParams}
          onToggle={toggleParam}
        />
      );
    }
    const v = (values[field.field_key] as string) ?? "";
    const set = (val: string) => setValuesDirty(prev => ({ ...prev, [field.field_key]: val }));
    if (field.field_key === "sample_id") {
      return (
        <Input
          id={field.field_key}
          value={v}
          readOnly
          placeholder={v ? "" : "Generating…"}
          className="font-mono bg-muted/40"
        />
      );
    }
    const common = {
      id: field.field_key,
      value: v,
      placeholder: field.placeholder ?? "",
      required: field.is_required,
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(e.target.value),
    };
    if (field.field_type === "textarea") return <Textarea rows={3} {...common} />;
    const typeMap: Record<string, string> = {
      text: "text", number: "number", date: "date",
      datetime: "datetime-local", email: "email", tel: "tel",
    };
    if (field.field_type === "datetime") {
      return (
        <div className="flex gap-2">
          <Input
            {...common}
            type="datetime-local"
            value={toLocalDatetimeInput(v)}
            onChange={(e) => set(e.target.value)}
          />
          <Button type="button" variant="outline" size="sm" onClick={() => set(nowDatetimeInput())}>
            Now
          </Button>
        </div>
      );
    }
    if (field.field_type === "date") {
      return <Input {...common} type="date" value={toDateInput(v)} onChange={(e) => set(e.target.value)} />;
    }
    return <Input type={typeMap[field.field_type] ?? "text"} {...common} />;
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) attemptClose(); else onOpenChange(true); }}>
      <DialogContent
        className="max-w-3xl max-h-[90vh] overflow-y-auto"
        onEscapeKeyDown={(e) => { e.preventDefault(); attemptClose(); }}
        onPointerDownOutside={(e) => { e.preventDefault(); attemptClose(); }}
        onInteractOutside={(e) => { e.preventDefault(); attemptClose(); }}
      >
        <DialogHeader>
          <DialogTitle>{recordId ? "Edit Sample Receipt" : "New Sample Receipt"}</DialogTitle>
          <DialogDescription className="sr-only">
            {recordId ? "Edit an existing sample receipt record" : "Create a new sample receipt record"}
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => { e.preventDefault(); saveMut.mutate(); }}
          className="grid gap-4 py-2 sm:grid-cols-2"
        >
          {activeFields
            // Hide the legacy header-level "requested_tests" multiselect — it's now per row.
            .filter(field => field.field_key !== "requested_tests")
            .map(field => (
              <React.Fragment key={field.id}>
                {field.field_key === "client_company" && (
                  <ClientPicker
                    selectedCompany={(values.client_company as string) ?? ""}
                    onPick={applyClient}
                    registerNewClient={registerNewClient}
                    onToggleRegister={setRegisterNewClient}
                  />
                )}
                <div className={field.field_type === "textarea" || field.field_type === "multiselect" ? "sm:col-span-2" : ""}>
                  <Label htmlFor={field.field_key} className="text-xs">
                    {field.label}{field.is_required && <span className="text-destructive ml-0.5">*</span>}
                  </Label>
                  <div className="mt-1">{renderField(field)}</div>
                </div>
                {field.field_key === "packaging_condition" && (
                  <AttachmentsSection
                    attachments={attachments}
                    pendingFiles={pendingFiles}
                    onAddFiles={(files) => { setIsDirty(true); setPendingFiles(prev => [...prev, ...files]); }}
                    onRemovePending={(idx) => { setIsDirty(true); setPendingFiles(prev => prev.filter((_, i) => i !== idx)); }}
                    onDeleteExisting={deleteExistingAttachment}
                    onOpenExisting={openExistingAttachment}
                  />
                )}
              </React.Fragment>
            ))}

          <CocLineItemsSection
            recordId={recordId}
            lineItems={lineItems}
            setLineItemsDirty={setLineItemsDirty}
            activeParams={activeParams}
            pendingByLine={pendingByLine}
            setPendingByLine={setPendingByLine}
            setIsDirty={setIsDirty}
          />

          <DialogFooter className="sm:col-span-2 mt-2">
            <Button type="button" variant="outline" onClick={attemptClose}>Cancel</Button>
            <Button type="submit" disabled={saveMut.isPending}>
              {saveMut.isPending ? "Saving…" : recordId ? "Save changes" : "Submit & stage samples"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
