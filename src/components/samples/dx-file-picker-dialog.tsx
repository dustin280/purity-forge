/**
 * Lets an analyst browse the "Results" Drive folder (the same one the
 * hourly backpressure watcher scans) and pick a raw Agilent .dx instrument
 * file to link to a Non-Conformity evaluation. Shows the full parsed
 * manifest — every signal, plus a best-guess DAD channel probe — as the
 * preview before confirming, mirroring drive-report-picker-dialog.tsx's
 * browse → preview → confirm shape. Nothing is saved here; the caller
 * attaches the picked file's id to the evaluation when it saves.
 */
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { FileText, Folder, ChevronLeft, CheckCircle2, XCircle } from "lucide-react";
import {
  listDxFolders,
  listDxFilesInFolder,
  inspectDxFile,
  type DxInspection,
} from "@/lib/non-conformity/dx-link.functions";

export type PickedDxFile = {
  dx_file_id: string;
  dx_folder_id: string;
  manifest_sample_name: string | null;
  run_date_time: string | null;
};

export function DxFilePickerDialog({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onPick: (result: PickedDxFile) => void;
}) {
  const listFoldersFn = useServerFn(listDxFolders);
  const listFilesFn = useServerFn(listDxFilesInFolder);
  const inspectFn = useServerFn(inspectDxFile);

  const [folder, setFolder] = useState<{ id: string; name: string } | null>(null);
  const [q, setQ] = useState("");
  const [inspected, setInspected] = useState<DxInspection | null>(null);

  const {
    data: folders = [],
    isLoading: foldersLoading,
    error: foldersError,
  } = useQuery({
    queryKey: ["dx-folders"],
    queryFn: () => listFoldersFn(),
    enabled: open && !folder,
  });

  const { data: files = [], isLoading: filesLoading } = useQuery({
    queryKey: ["dx-files", folder?.id],
    queryFn: () => listFilesFn({ data: { folder_id: folder!.id } }),
    enabled: open && !!folder && !inspected,
  });

  const inspectMut = useMutation({
    mutationFn: (f: { id: string; name: string }) => inspectFn({ data: { file_id: f.id } }),
    onSuccess: (r) => setInspected(r),
    onError: (e: Error) => toast.error(e.message),
  });

  function reset() {
    setFolder(null);
    setQ("");
    setInspected(null);
  }

  function usePicked() {
    if (!inspected || !folder) return;
    onPick({
      dx_file_id: inspected.file_id,
      dx_folder_id: folder.id,
      manifest_sample_name: inspected.sample_name,
      run_date_time: inspected.run_date_time,
    });
    onOpenChange(false);
    reset();
  }

  const filteredFolders = folders.filter((f) => f.name.toLowerCase().includes(q.toLowerCase()));
  const filteredFiles = files.filter((f) => f.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) reset();
      }}
    >
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Browse Results Drive Folder</DialogTitle>
          <DialogDescription className="sr-only">
            Pick a raw .dx instrument file to link to this evaluation
          </DialogDescription>
        </DialogHeader>

        {!folder && !inspected && (
          <div className="space-y-3">
            <Input
              placeholder="Search run folders…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            {foldersError && (
              <p className="text-sm text-destructive">{(foldersError as Error).message}</p>
            )}
            {foldersLoading && <p className="text-sm text-muted-foreground">Loading folders…</p>}
            <div className="max-h-96 overflow-y-auto rounded-md border border-border divide-y divide-border">
              {filteredFolders.length === 0 && !foldersLoading && (
                <div className="p-4 text-sm text-muted-foreground">No matching run folders.</div>
              )}
              {filteredFolders.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => {
                    setFolder({ id: f.id, name: f.name });
                    setQ("");
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/40"
                >
                  <Folder className="size-4 text-muted-foreground shrink-0" />
                  <span className="truncate flex-1">{f.name}</span>
                  {f.modifiedTime && (
                    <span className="text-xs text-muted-foreground shrink-0">
                      {new Date(f.modifiedTime).toLocaleDateString()}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {folder && !inspected && (
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => {
                setFolder(null);
                setQ("");
              }}
              className="text-xs text-muted-foreground inline-flex items-center gap-1 hover:text-foreground"
            >
              <ChevronLeft className="size-3" /> {folder.name}
            </button>
            <Input
              placeholder="Search .dx files…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            {filesLoading && <p className="text-sm text-muted-foreground">Loading files…</p>}
            <div className="max-h-96 overflow-y-auto rounded-md border border-border divide-y divide-border">
              {filteredFiles.length === 0 && !filesLoading && (
                <div className="p-4 text-sm text-muted-foreground">
                  No .dx files in this folder.
                </div>
              )}
              {filteredFiles.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  disabled={inspectMut.isPending}
                  onClick={() => inspectMut.mutate({ id: f.id, name: f.name })}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/40 disabled:opacity-60"
                >
                  <FileText className="size-4 text-muted-foreground shrink-0" />
                  <span className="truncate flex-1 font-mono">{f.name}</span>
                </button>
              ))}
            </div>
            {inspectMut.isPending && (
              <p className="text-sm text-muted-foreground">Reading manifest…</p>
            )}
          </div>
        )}

        {inspected && (
          <div className="space-y-3">
            <div className="rounded-md border border-border p-3 space-y-1 text-sm">
              <div className="font-medium">
                {inspected.sample_name ?? "Sample name not found in manifest"}
              </div>
              <div className="text-xs text-muted-foreground">
                Run: {inspected.run_date_time ?? "—"} · Operator: {inspected.run_operator ?? "—"}
              </div>
              {inspected.acquisition_method && (
                <div className="text-xs text-muted-foreground">
                  Method: {inspected.acquisition_method}
                </div>
              )}
            </div>

            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                DAD channels found: {inspected.dad_guess.length}
              </div>
              {inspected.dad_guess.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No signal matched "DAD" in its device/channel name — see the full signal list
                  below.
                </p>
              )}
              <div className="space-y-1">
                {inspected.dad_guess.map((p, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 text-xs rounded border border-border px-2 py-1"
                  >
                    {p.ok ? (
                      <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0" />
                    ) : (
                      <XCircle className="size-3.5 text-destructive shrink-0" />
                    )}
                    <span className="font-mono">
                      {p.signal.device} / {p.signal.channel}
                    </span>
                    <span className="text-muted-foreground truncate flex-1">{p.signal.desc}</span>
                    {p.ok ? (
                      <span className="text-muted-foreground shrink-0">{p.pointCount} pts</span>
                    ) : (
                      <span className="text-destructive shrink-0 truncate max-w-[10rem]">
                        {p.error}
                      </span>
                    )}
                    {p.chDebug && (
                      <pre className="basis-full text-[10px] whitespace-pre-wrap break-all text-amber-500">
                        {JSON.stringify(p.chDebug, null, 1)}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground">
                All {inspected.signals.length} signals in this file
              </summary>
              <div className="mt-1 rounded border border-border divide-y divide-border font-mono">
                {inspected.signals.map((s, i) => (
                  <div key={i} className="flex items-center gap-2 px-2 py-1">
                    <Badge variant="outline" className="shrink-0">
                      {s.device}
                    </Badge>
                    <span className="truncate flex-1">
                      {s.channel} — {s.desc}
                    </span>
                    <span className="text-muted-foreground shrink-0">{s.units}</span>
                  </div>
                ))}
              </div>
            </details>

            <details className="text-xs" open>
              <summary className="cursor-pointer text-muted-foreground">
                All {inspected.zip_entries.length} files in this .dx archive
              </summary>
              <div className="mt-1 max-h-48 overflow-y-auto rounded border border-border divide-y divide-border font-mono">
                {inspected.zip_entries.map((name) => (
                  <div key={name} className="px-2 py-1 truncate">
                    {name}
                  </div>
                ))}
              </div>
            </details>
          </div>
        )}

        <DialogFooter>
          {inspected ? (
            <>
              <Button variant="outline" onClick={() => setInspected(null)}>
                Back to file list
              </Button>
              <Button onClick={usePicked}>Use this file</Button>
            </>
          ) : (
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
