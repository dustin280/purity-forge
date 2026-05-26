import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, FileDown, Pencil, Search } from "lucide-react";
import { downloadJournalPdf } from "@/lib/journal-pdf";
import type { LabJournalEntry } from "@/lib/lab-journal.functions";
import { MarkdownView } from "./markdown-view";
import { CombinedExportDialog } from "./combined-export-dialog";

function fmt(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export interface EntriesListProps {
  rows: LabJournalEntry[];
  loading: boolean;
  onEdit: (entry: LabJournalEntry) => void;
  defaultAuthor: string;
}

export function EntriesList({
  rows,
  loading,
  onEdit,
  defaultAuthor,
}: EntriesListProps) {
  const [q, setQ] = useState("");
  const [tag, setTag] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) for (const t of r.tags ?? []) set.add(t);
    return [...set].sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (tag && !(r.tags ?? []).includes(tag)) return false;
      if (!term) return true;
      return (
        (r.title ?? "").toLowerCase().includes(term) ||
        (r.body ?? "").toLowerCase().includes(term) ||
        (r.tags ?? []).some((t) => t.toLowerCase().includes(term))
      );
    });
  }, [rows, q, tag]);

  return (
    <div className="rounded-lg border bg-card">
      <div className="p-4 border-b flex items-center gap-2 flex-wrap">
        <div className="font-semibold flex-1 min-w-32">Past entries</div>
        <CombinedExportDialog
          entries={rows}
          allTags={allTags}
          defaultAuthor={defaultAuthor}
        />
        <select
          value={tag}
          onChange={(e) => setTag(e.target.value)}
          className="h-9 rounded-md border bg-background px-2 text-sm"
        >
          <option value="">All tags</option>
          {allTags.map((t) => (
            <option key={t} value={t}>
              #{t}
            </option>
          ))}
        </select>
        <div className="relative w-full max-w-xs">
          <Search className="size-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search title, body, or tag…"
            className="pl-7"
          />
        </div>
      </div>

      {loading ? (
        <div className="p-6 text-sm text-muted-foreground">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="p-6 text-sm text-muted-foreground">
          {rows.length === 0
            ? "No entries yet. Write your first one above."
            : "No matches."}
        </div>
      ) : (
        <ul className="divide-y">
          {filtered.map((r) => {
            const snippet =
              (r.body || "").replace(/\s+/g, " ").trim().slice(0, 180) || "—";
            const isOpen = !!expanded[r.id];
            return (
              <li key={r.id} className="p-4">
                <div className="flex items-start gap-3">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="px-1 -ml-1 shrink-0"
                    onClick={() =>
                      setExpanded((s) => ({ ...s, [r.id]: !s[r.id] }))
                    }
                    aria-label={isOpen ? "Collapse" : "Expand"}
                  >
                    {isOpen ? (
                      <ChevronDown className="size-4" />
                    ) : (
                      <ChevronRight className="size-4" />
                    )}
                  </Button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <div className="font-medium truncate">
                        {r.title || "Untitled entry"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {fmt(r.entry_at)}
                      </div>
                    </div>
                    {!isOpen && (
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                        {snippet}
                      </p>
                    )}
                    {(r.tags ?? []).length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {(r.tags ?? []).map((t) => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => setTag(t)}
                            className="inline-block"
                          >
                            <Badge
                              variant={tag === t ? "default" : "secondary"}
                              className="font-normal cursor-pointer"
                            >
                              #{t}
                            </Badge>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        downloadJournalPdf({
                          user_name: r.user_name,
                          entry_at: r.entry_at,
                          title: r.title,
                          body: r.body,
                          tags: r.tags ?? [],
                        })
                      }
                    >
                      <FileDown className="size-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => onEdit(r)}>
                      <Pencil className="size-4" />
                    </Button>
                  </div>
                </div>
                {isOpen && (
                  <div className="mt-3 ml-7 rounded-md border bg-background p-4">
                    <MarkdownView source={r.body || ""} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}