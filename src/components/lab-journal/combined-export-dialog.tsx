import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FileDown } from "lucide-react";
import { downloadCombinedJournalPdf } from "@/lib/journal-pdf";
import type { LabJournalEntry } from "@/lib/lab-journal.functions";

export interface CombinedExportDialogProps {
  entries: LabJournalEntry[];
  allTags: string[];
  defaultAuthor: string;
}

export function CombinedExportDialog({
  entries,
  allTags,
  defaultAuthor,
}: CombinedExportDialogProps) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [tag, setTag] = useState("");

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      const t = e.entry_at.slice(0, 10);
      if (from && t < from) return false;
      if (to && t > to) return false;
      if (tag && !(e.tags ?? []).includes(tag)) return false;
      return true;
    });
  }, [entries, from, to, tag]);

  const run = () => {
    if (!filtered.length) return;
    // Oldest first in the combined doc
    const ordered = [...filtered].sort((a, b) =>
      a.entry_at.localeCompare(b.entry_at),
    );
    downloadCombinedJournalPdf({
      author: defaultAuthor,
      from: from || null,
      to: to || null,
      tag: tag || null,
      entries: ordered.map((e) => ({
        entry_number: e.entry_number,
        user_name: e.user_name,
        entry_at: e.entry_at,
        title: e.title,
        body: e.body,
        tags: e.tags ?? [],
      })),
    });
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <FileDown className="size-4 mr-1" /> Export combined PDF
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export combined PDF</DialogTitle>
          <DialogDescription className="sr-only">
            Choose a date range to export multiple journal entries as one PDF
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cmb-from">From</Label>
              <Input
                id="cmb-from"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cmb-to">To</Label>
              <Input
                id="cmb-to"
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cmb-tag">Tag (optional)</Label>
            <select
              id="cmb-tag"
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              className="w-full h-9 rounded-md border bg-background px-2 text-sm"
            >
              <option value="">All tags</option>
              {allTags.map((t) => (
                <option key={t} value={t}>
                  #{t}
                </option>
              ))}
            </select>
          </div>
          <div className="text-xs text-muted-foreground">
            {filtered.length} entr{filtered.length === 1 ? "y" : "ies"} match.
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={run} disabled={filtered.length === 0}>
            <FileDown className="size-4 mr-1" /> Download
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}