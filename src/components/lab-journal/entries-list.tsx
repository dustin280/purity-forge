import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FileDown, Pencil, Search } from "lucide-react";
import { downloadJournalPdf } from "@/lib/journal-pdf";
import type { LabJournalEntry } from "@/lib/lab-journal.functions";

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
}

export function EntriesList({ rows, loading, onEdit }: EntriesListProps) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter(
      (r) =>
        (r.title ?? "").toLowerCase().includes(term) ||
        (r.body ?? "").toLowerCase().includes(term),
    );
  }, [rows, q]);

  return (
    <div className="rounded-lg border bg-card">
      <div className="p-4 border-b flex items-center gap-2">
        <div className="font-semibold flex-1">Past entries</div>
        <div className="relative w-full max-w-xs">
          <Search className="size-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search title or body…"
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
            return (
              <li key={r.id} className="p-4 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <div className="font-medium truncate">
                      {r.title || "Untitled entry"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {fmt(r.entry_at)}
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                    {snippet}
                  </p>
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
                      })
                    }
                  >
                    <FileDown className="size-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => onEdit(r)}>
                    <Pencil className="size-4" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}