import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Upload } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { updateOpenLabSettings } from "@/lib/openlab.functions";
import { supabase } from "@/integrations/supabase/client";
import { useOpenLabSettings } from "./use-openlab";

const BUCKET = "openlab-cds";

export function SettingsCard() {
  const { role } = useAuth();
  const { data } = useOpenLabSettings();
  const qc = useQueryClient();
  const update = useServerFn(updateOpenLabSettings);
  const fileInput = useRef<HTMLInputElement | null>(null);

  const [path, setPath] = useState("");
  const [prefix, setPrefix] = useState("default/");
  const [notes, setNotes] = useState("");
  const [uploadKind, setUploadKind] = useState<"Methods" | "Sequences">("Sequences");
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!data?.settings) return;
    setPath(data.settings.project_folder_path ?? "");
    setPrefix(data.settings.storage_prefix ?? "default/");
    setNotes(data.settings.notes ?? "");
  }, [data?.settings]);

  const save = useMutation({
    mutationFn: () =>
      update({
        data: {
          project_folder_path: path,
          storage_prefix: prefix,
          notes: notes || null,
        },
      }),
    onSuccess: () => {
      toast.success("Settings saved");
      qc.invalidateQueries({ queryKey: ["openlab"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Save failed"),
  });

  const canEdit = role === "admin";

  async function handleUpload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    try {
      const norm = prefix.endsWith("/") ? prefix : `${prefix}/`;
      for (const file of Array.from(files)) {
        const path = `${norm}${uploadKind}/${file.name}`;
        const { error } = await supabase.storage
          .from(BUCKET)
          .upload(path, file, { upsert: true, contentType: file.type || undefined });
        if (error) throw error;
      }
      toast.success(`Uploaded ${files.length} file(s) to ${uploadKind}/`);
    } catch (e: any) {
      toast.error(e?.message ?? "Upload failed");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Settings</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Project folder path (display)</Label>
            <Input
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="\\LAB-PC-01\OpenLabData\Projects\HPLC-DAD"
              disabled={!canEdit}
            />
          </div>
          <div className="space-y-2">
            <Label>Storage prefix</Label>
            <Input
              value={prefix}
              onChange={(e) => setPrefix(e.target.value)}
              placeholder="default/"
              disabled={!canEdit}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label>Notes</Label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            disabled={!canEdit}
          />
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              Save settings
            </Button>
          </div>
        )}

        {canEdit && (
          <div className="border-t pt-4 space-y-3">
            <div className="font-medium text-sm">Upload snapshot files</div>
            <p className="text-xs text-muted-foreground">
              Drop method descriptor files or sequence CSVs here. Files land under{" "}
              <span className="font-mono">{prefix}{uploadKind}/</span>. After upload, run
              "Sync now" from the status card to refresh the index.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-md border overflow-hidden text-sm">
                {(["Sequences", "Methods"] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setUploadKind(k)}
                    className={`px-3 py-1.5 ${
                      uploadKind === k
                        ? "bg-primary text-primary-foreground"
                        : "bg-background"
                    }`}
                  >
                    {k}
                  </button>
                ))}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInput.current?.click()}
                disabled={uploading}
              >
                <Upload className="size-4 mr-2" />
                {uploading ? "Uploading…" : "Choose files"}
              </Button>
              <input
                ref={fileInput}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => handleUpload(e.target.files)}
              />
            </div>
          </div>
        )}

        <div className="border-t pt-4 text-xs text-muted-foreground space-y-2">
          <div className="font-medium text-foreground">Keeping the snapshot fresh</div>
          <p>
            On the OpenLab CDS PC, schedule a one-line Windows task to copy
            <span className="font-mono"> Methods\</span> and{" "}
            <span className="font-mono">Sequences\</span> into a shared folder, then use a
            small uploader (or this panel) to push them into the{" "}
            <span className="font-mono">{BUCKET}</span> bucket. A native Windows agent
            that streams changes is planned for Phase 2.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}