import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  listKnowledgeDocs,
  deleteKnowledgeDoc,
  ingestKnowledgeDoc,
  type KnowledgeDoc,
} from "@/lib/knowledge-base.functions";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BookMarked, Trash2, Upload } from "lucide-react";

export const Route = createFileRoute("/_authenticated/maintenance/knowledge-base")({
  component: KnowledgeBasePage,
});

const SCOPE_LABEL: Record<KnowledgeDoc["agent_scope"], string> = {
  both: "Both agents",
  column_advisor: "Column Advisor only",
  troubleshooting: "Troubleshooting only",
};

function KnowledgeBasePage() {
  const { role } = useAuth();
  const isAdmin = role === "admin";
  const qc = useQueryClient();

  const { data: docs = [], isLoading } = useQuery({
    queryKey: ["ai-knowledge-docs"],
    queryFn: () => listKnowledgeDocs(),
  });

  const del = useMutation({
    mutationFn: (id: string) => deleteKnowledgeDoc({ data: { id } }),
    onSuccess: () => {
      toast.success("Document removed");
      qc.invalidateQueries({ queryKey: ["ai-knowledge-docs"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Delete failed"),
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl space-y-6">
      <div>
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Maintenance</div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-1 flex items-center gap-2">
          <BookMarked className="size-6" /> AI Knowledge Base
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Reference documents the Column Advisor and Troubleshooting agents can search before answering.
          Both agents check this library first, cite the source doc + page, and fall back to the web
          only when nothing here fits.
        </p>
      </div>

      {isAdmin && <IngestForm />}

      <Card className="p-0 overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div className="font-semibold">
            Uploaded documents{" "}
            <span className="text-muted-foreground font-normal">({docs.length})</span>
          </div>
        </div>
        {isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">Loading…</div>
        ) : docs.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">
            No documents yet. {isAdmin ? "Add one above." : "Ask an admin to add reference material."}
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {docs.map(d => (
              <li key={d.id} className="p-4 flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{d.title}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {d.source_filename ?? "—"} · {d.chunk_count} chunks
                    {d.page_count ? ` · ${d.page_count} pages` : ""} ·{" "}
                    {new Date(d.created_at).toLocaleDateString()}
                  </div>
                </div>
                <Badge variant="secondary">{SCOPE_LABEL[d.agent_scope]}</Badge>
                {isAdmin && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      if (confirm(`Delete "${d.title}"? This cannot be undone.`)) del.mutate(d.id);
                    }}
                    disabled={del.isPending}
                    className="text-destructive"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function IngestForm() {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [filename, setFilename] = useState("");
  const [scope, setScope] = useState<KnowledgeDoc["agent_scope"]>("both");
  const [text, setText] = useState("");
  const [pages, setPages] = useState("");

  const ingest = useMutation({
    mutationFn: () =>
      ingestKnowledgeDoc({
        data: {
          title: title.trim(),
          source_filename: filename.trim() || undefined,
          agent_scope: scope,
          page_count: pages ? Number(pages) : undefined,
          text,
        },
      }),
    onSuccess: (r) => {
      toast.success(`Added — indexed ${r.chunk_count} chunks`);
      setTitle("");
      setFilename("");
      setText("");
      setPages("");
      setScope("both");
      qc.invalidateQueries({ queryKey: ["ai-knowledge-docs"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Ingest failed"),
  });

  const disabled = !title.trim() || text.trim().length < 10 || ingest.isPending;

  return (
    <Card className="p-5 space-y-4">
      <div>
        <div className="font-semibold flex items-center gap-2">
          <Upload className="size-4" /> Add a reference document
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Paste the extracted text from a PDF (vendor guide, application note, troubleshooting handbook).
          I usually run this for you after parsing your uploaded PDF, but admins can add text here directly.
        </p>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <Label>Title</Label>
          <Input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="e.g. Agilent HPLC Troubleshooting Guide 2023"
          />
        </div>
        <div>
          <Label>Source filename (optional)</Label>
          <Input
            value={filename}
            onChange={e => setFilename(e.target.value)}
            placeholder="agilent-hplc-troubleshooting.pdf"
          />
        </div>
        <div>
          <Label>Agent scope</Label>
          <Select value={scope} onValueChange={v => setScope(v as KnowledgeDoc["agent_scope"])}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="both">Both agents</SelectItem>
              <SelectItem value="column_advisor">Column Advisor only</SelectItem>
              <SelectItem value="troubleshooting">Troubleshooting only</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Page count (optional)</Label>
          <Input
            type="number"
            min={1}
            value={pages}
            onChange={e => setPages(e.target.value.replace(/\D/g, ""))}
            placeholder="e.g. 240"
          />
        </div>
      </div>
      <div>
        <Label>Document text (markdown or plain text)</Label>
        <Textarea
          value={text}
          onChange={e => setText(e.target.value)}
          rows={10}
          placeholder="Paste the full extracted text here…"
          className="font-mono text-xs"
        />
        <div className="text-[11px] text-muted-foreground mt-1">
          {text.length.toLocaleString()} chars — will be split into ~1200-char chunks and embedded with google/gemini-embedding-2.
        </div>
      </div>
      <div className="flex justify-end">
        <Button onClick={() => ingest.mutate()} disabled={disabled}>
          {ingest.isPending ? "Indexing…" : "Add to knowledge base"}
        </Button>
      </div>
    </Card>
  );
}