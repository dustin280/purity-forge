/**
 * Renders AI SDK v5 tool-call parts (searchWeb, scrapePage, lookupCatalog,
 * proposeCatalogAddition) inline within a chat message. The catalog-add
 * proposal renders an approval card that calls createHplcColumn on click.
 */
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Globe, FileText, BookOpen, PlusCircle, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createHplcColumn } from "@/lib/hplc-columns.functions";

type ToolPart = {
  type: string;
  state?: string;
  input?: unknown;
  output?: unknown;
};

export function ToolCallView({ part }: { part: ToolPart }) {
  const name = part.type.replace(/^tool-/, "");
  const running = part.state === "input-streaming" || part.state === "input-available" || part.state === "executing";

  if (name === "searchWeb") {
    const input = part.input as { query?: string } | undefined;
    const output = part.output as { ok?: boolean; hits?: Array<{ url: string; title?: string }>; error?: string } | undefined;
    return (
      <ToolFrame icon={<Globe className="size-3.5" />} label={running ? "Searching the web…" : "Web search"}>
        {input?.query && <div className="text-xs text-muted-foreground italic">"{input.query}"</div>}
        {output?.error && <div className="text-xs text-destructive">{output.error}</div>}
        {output?.hits && (
          <ul className="text-xs space-y-0.5 mt-1">
            {output.hits.slice(0, 5).map((h, i) => (
              <li key={i}>
                <a href={h.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
                  {h.title || h.url} <ExternalLink className="size-3" />
                </a>
              </li>
            ))}
          </ul>
        )}
      </ToolFrame>
    );
  }

  if (name === "scrapePage") {
    const input = part.input as { url?: string } | undefined;
    const output = part.output as { ok?: boolean; page?: { title?: string; url?: string }; error?: string } | undefined;
    return (
      <ToolFrame icon={<FileText className="size-3.5" />} label={running ? "Reading page…" : "Read page"}>
        {input?.url && (
          <a href={input.url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline inline-flex items-center gap-1">
            {output?.page?.title || input.url} <ExternalLink className="size-3" />
          </a>
        )}
        {output?.error && <div className="text-xs text-destructive">{output.error}</div>}
      </ToolFrame>
    );
  }

  if (name === "lookupCatalog") {
    const input = part.input as { partNumber?: string } | undefined;
    const output = part.output as { found?: boolean; label?: string; values?: { make?: string; model?: string } } | undefined;
    return (
      <ToolFrame icon={<BookOpen className="size-3.5" />} label="Catalog lookup">
        <div className="text-xs text-muted-foreground">
          {input?.partNumber}
          {output?.found
            ? <> → <span className="text-foreground">{output.values?.make} {output.values?.model}</span> <span className="opacity-70">({output.label})</span></>
            : output && <> → <span className="text-foreground">not in saved catalog</span></>}
        </div>
      </ToolFrame>
    );
  }

  if (name === "proposeCatalogAddition") {
    const output = part.output as
      | { status?: string; name?: string; partNumber?: string; vendor?: string; description?: string; sourceUrl?: string }
      | undefined;
    if (!output) {
      return (
        <ToolFrame icon={<PlusCircle className="size-3.5" />} label="Preparing catalog addition…">
          <Loader2 className="size-3 animate-spin text-muted-foreground" />
        </ToolFrame>
      );
    }
    return <CatalogAdditionCard initial={output} />;
  }

  return (
    <ToolFrame icon={<Loader2 className="size-3.5" />} label={name}>
      {running && <Loader2 className="size-3 animate-spin text-muted-foreground" />}
    </ToolFrame>
  );
}

function ToolFrame({ icon, label, children }: { icon: React.ReactNode; label: string; children?: React.ReactNode }) {
  return (
    <div className="my-2 rounded-md border bg-muted/30 px-2 py-1.5">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function CatalogAdditionCard({
  initial,
}: {
  initial: { name?: string; partNumber?: string; vendor?: string; description?: string; sourceUrl?: string };
}) {
  const [name, setName] = useState(initial.name ?? "");
  const [partNumber, setPartNumber] = useState(initial.partNumber ?? "");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const addColumn = useServerFn(createHplcColumn);

  if (dismissed) return null;

  const onApprove = async () => {
    if (!name.trim() || !partNumber.trim()) return;
    setSaving(true);
    try {
      await addColumn({ data: { name: `${initial.vendor ? `${initial.vendor} ` : ""}${name}`.trim(), part_number: partNumber } });
      setSaved(true);
      toast.success("Added to catalog");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="my-2 rounded-md border border-primary/40 bg-primary/5 p-3">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-primary mb-2">
        <PlusCircle className="size-3.5" /> Add to saved catalog
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs">Vendor / Name</Label>
          <Input value={name} onChange={e => setName(e.target.value)} disabled={saved || saving} className="h-8" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Part number</Label>
          <Input value={partNumber} onChange={e => setPartNumber(e.target.value)} disabled={saved || saving} className="h-8 font-mono" />
        </div>
      </div>
      {initial.description && <div className="mt-2 text-xs text-muted-foreground">{initial.description}</div>}
      {initial.sourceUrl && (
        <a href={initial.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline">
          source <ExternalLink className="size-3" />
        </a>
      )}
      <div className="mt-3 flex gap-2">
        {saved ? (
          <div className="text-xs text-primary">Saved to catalog ✓</div>
        ) : (
          <>
            <Button size="sm" onClick={onApprove} disabled={saving || !name.trim() || !partNumber.trim()}>
              {saving ? <Loader2 className="size-3 animate-spin mr-1" /> : <PlusCircle className="size-3.5 mr-1" />}
              Add to catalog
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setDismissed(true)} disabled={saving}>Dismiss</Button>
          </>
        )}
      </div>
    </div>
  );
}

export function renderMessageParts(parts: Array<{ type: string } & Record<string, unknown>>) {
  return parts.map((p, i) => {
    if (p.type === "text") return null;
    if (typeof p.type === "string" && p.type.startsWith("tool-")) {
      return <ToolCallView key={i} part={p as ToolPart} />;
    }
    return null;
  });
}