import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Upload, CloudDownload, Plug } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { updateOpenLabSettings } from "@/lib/openlab.functions";
import {
  updateDriveSettings,
  pullDriveSnapshot,
  testDriveFolder,
} from "@/lib/openlab-drive.functions";
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
  const [methodsFolderId, setMethodsFolderId] = useState("");
  const [sequencesFolderId, setSequencesFolderId] = useState("");

  const updateDrive = useServerFn(updateDriveSettings);
  const pullDrive = useServerFn(pullDriveSnapshot);
  const testDrive = useServerFn(testDriveFolder);

  useEffect(() => {
    if (!data?.settings) return;
    setPath(data.settings.project_folder_path ?? "");
    setPrefix(data.settings.storage_prefix ?? "default/");
    setNotes(data.settings.notes ?? "");
    setMethodsFolderId(data.settings.drive_methods_folder_id ?? "");
    setSequencesFolderId(data.settings.drive_sequences_folder_id ?? "");
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

  const saveDrive = useMutation({
    mutationFn: () =>
      updateDrive({
        data: {
          drive_methods_folder_id: methodsFolderId || null,
          drive_sequences_folder_id: sequencesFolderId || null,
        },
      }),
    onSuccess: () => {
      toast.success("Drive folders saved");
      qc.invalidateQueries({ queryKey: ["openlab"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Save failed"),
  });

  const pullMut = useMutation({
    mutationFn: () => pullDrive(),
    onSuccess: (r) => {
      toast.success(`Pulled ${r.methods} methods, ${r.sequences} sequences from Drive`);
      qc.invalidateQueries({ queryKey: ["openlab"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Drive pull failed"),
  });

  async function testFolder(kind: "Methods" | "Sequences") {
    try {
      const r = await testDrive({ data: { kind } });
      toast.success(
        `${kind}: ${r.count} file(s)` +
          (r.sample.length ? ` \u2014 ${r.sample.slice(0, 3).join(", ")}` : ""),
      );
    } catch (e: any) {
      toast.error(e?.message ?? "Test failed");
    }
  }

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

        {canEdit && (
          <div className="border-t pt-4 space-y-3">
            <div className="font-medium text-sm flex items-center gap-2">
              <Plug className="size-4" /> Google Drive sync (recommended)
            </div>
            <p className="text-xs text-muted-foreground">
              Install Google Drive for desktop on the OpenLab PC, sign in as the shared
              lab account, and mirror the OpenLab project folder. Paste the folder IDs
              for <span className="font-mono">Methods</span> and{" "}
              <span className="font-mono">Sequences</span> below (the ID is the last
              segment of <span className="font-mono">drive.google.com/drive/folders/&lt;ID&gt;</span>).
              Then click <span className="font-medium">Pull from Drive</span> to refresh
              the index. Run lists you send from LIMS land in the Sequences folder and
              appear on the PC within seconds.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Methods folder ID</Label>
                <div className="flex gap-2">
                  <Input
                    value={methodsFolderId}
                    onChange={(e) => setMethodsFolderId(e.target.value.trim())}
                    placeholder="1AbCdEf..."
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => testFolder("Methods")}
                    disabled={!methodsFolderId}
                  >
                    Test
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Sequences folder ID</Label>
                <div className="flex gap-2">
                  <Input
                    value={sequencesFolderId}
                    onChange={(e) => setSequencesFolderId(e.target.value.trim())}
                    placeholder="1XyZ..."
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => testFolder("Sequences")}
                    disabled={!sequencesFolderId}
                  >
                    Test
                  </Button>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => saveDrive.mutate()}
                disabled={saveDrive.isPending}
              >
                Save Drive folders
              </Button>
              <Button
                size="sm"
                onClick={() => pullMut.mutate()}
                disabled={
                  pullMut.isPending ||
                  (!methodsFolderId && !sequencesFolderId)
                }
              >
                <CloudDownload
                  className={`size-4 mr-2 ${pullMut.isPending ? "animate-pulse" : ""}`}
                />
                {pullMut.isPending ? "Pulling\u2026" : "Pull from Drive"}
              </Button>
            </div>
            <div className="text-xs text-muted-foreground">
              Last pull:{" "}
              {data?.settings?.drive_last_pulled_at
                ? new Date(data.settings.drive_last_pulled_at).toLocaleString()
                : "never"}
              {" \u00b7 "}Last push:{" "}
              {data?.settings?.drive_last_pushed_at
                ? new Date(data.settings.drive_last_pushed_at).toLocaleString()
                : "never"}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}