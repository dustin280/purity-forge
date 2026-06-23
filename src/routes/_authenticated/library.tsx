/**
 * Library: searchable / filterable reference catalog of peptides,
 * bioregulators, SARMs and related compounds. Admins can add items
 * individually or via CSV upload (append + dedupe by CAS#/Name).
 * Selected rows can be viewed or printed in a landscape-friendly layout.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Upload, Printer, Eye, Trash2, Search, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/hooks/use-auth";
import {
  listLibraryItems, createLibraryItem, deleteLibraryItem, bulkUploadLibraryItems,
  type LibraryItem,
} from "@/lib/library.functions";

export const Route = createFileRoute("/_authenticated/library")({
  component: LibraryPage,
});

const FIELDS: Array<{ key: keyof LibraryItem; label: string }> = [
  { key: "category", label: "Category" },
  { key: "names", label: "Name(s)" },
  { key: "cas_number", label: "CAS#" },
  { key: "molecular_weight", label: "Molecular Weight" },
  { key: "molecular_size", label: "Molecular Size" },
  { key: "size_basis", label: "Size Basis" },
  { key: "chemical_formula", label: "Chemical Formula" },
  { key: "sequence", label: "Sequence / Composition" },
  { key: "salt_form", label: "Salt / Form" },
  { key: "termini_modifications", label: "Termini / Modifications" },
  { key: "notes", label: "Research / Application Notes" },
  { key: "confidence", label: "Confidence" },
  { key: "ambiguity_notes", label: "Notes on Ambiguity" },
  { key: "source_url", label: "Source URL" },
];

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') { inQ = false; }
      else cur += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ",") { row.push(cur); cur = ""; }
      else if (c === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
      else if (c === "\r") { /* skip */ }
      else cur += c;
    }
  }
  if (cur.length || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim() !== ""));
}

const CSV_HEADER_MAP: Record<string, keyof LibraryItem> = {
  "category": "category",
  "name(s)": "names",
  "names": "names",
  "name": "names",
  "cas#": "cas_number",
  "cas number": "cas_number",
  "cas": "cas_number",
  "molecular weight": "molecular_weight",
  "molecular size": "molecular_size",
  "size basis": "size_basis",
  "chemical formula": "chemical_formula",
  "abbreviated amino acid composition / sequence": "sequence",
  "sequence": "sequence",
  "salt/form / disambiguation": "salt_form",
  "salt/form": "salt_form",
  "salt form": "salt_form",
  "termini / modifications": "termini_modifications",
  "termini/modifications": "termini_modifications",
  "common research/application notes": "notes",
  "notes": "notes",
  "confidence": "confidence",
  "notes on ambiguity": "ambiguity_notes",
  "primary source url": "source_url",
  "source url": "source_url",
};

function LibraryPage() {
  const { role } = useAuth();
  const isAdmin = role === "admin";
  const qc = useQueryClient();
  const list = useServerFn(listLibraryItems);
  const create = useServerFn(createLibraryItem);
  const del = useServerFn(deleteLibraryItem);
  const bulk = useServerFn(bulkUploadLibraryItems);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["library", "list"],
    queryFn: () => list(),
  });

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("__all");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [viewing, setViewing] = useState<LibraryItem | null>(null);
  const [printRows, setPrintRows] = useState<LibraryItem[] | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const i of items) if (i.category) set.add(i.category);
    return Array.from(set).sort();
  }, [items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter(i => {
      if (category !== "__all" && i.category !== category) return false;
      if (!q) return true;
      return [i.names, i.cas_number, i.chemical_formula, i.sequence, i.category, i.notes]
        .filter(Boolean)
        .some(v => String(v).toLowerCase().includes(q));
    });
  }, [items, search, category]);

  const allFilteredSelected = filtered.length > 0 && filtered.every(i => selected[i.id]);
  const selectedCount = filtered.filter(i => selected[i.id]).length;
  const selectedRows = items.filter(i => selected[i.id]);

  function toggleAll() {
    const next = { ...selected };
    if (allFilteredSelected) for (const i of filtered) delete next[i.id];
    else for (const i of filtered) next[i.id] = true;
    setSelected(next);
  }

  function doPrint(rows: LibraryItem[]) {
    if (rows.length === 0) return;
    setPrintRows(rows);
    setTimeout(() => { window.print(); }, 50);
  }

  const deleteMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["library"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const createMut = useMutation({
    mutationFn: (data: Record<string, string | null>) =>
      create({ data } as never),
    onSuccess: () => {
      toast.success("Item added");
      qc.invalidateQueries({ queryKey: ["library"] });
      setAddOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const uploadMut = useMutation({
    mutationFn: (rows: Array<Record<string, string | null>>) =>
      bulk({ data: { rows } } as never),
    onSuccess: (res) => {
      toast.success(`${res.inserted} added · ${res.skipped} skipped (duplicates)`);
      qc.invalidateQueries({ queryKey: ["library"] });
      setUploadOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-[1600px] mx-auto">
      <style>{`@media print { @page { size: landscape; margin: 0.4in; } }`}</style>
      <div className="print-hide flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Library</h1>
          <p className="text-sm text-muted-foreground">
            Reference catalog of peptides, bioregulators, SARMs and related compounds.
          </p>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setUploadOpen(true)}>
              <Upload className="size-4 mr-2" /> Upload CSV
            </Button>
            <Button onClick={() => setAddOpen(true)}>
              <Plus className="size-4 mr-2" /> Add item
            </Button>
          </div>
        )}
      </div>

      <Card className="print-hide">
        <CardContent className="p-3 flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="size-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Search by name, CAS#, formula, sequence…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">All categories</SelectItem>
              {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="ml-auto flex gap-2">
            <Button
              variant="outline"
              disabled={selectedCount === 0}
              onClick={() => {
                if (selectedRows.length === 1) setViewing(selectedRows[0]);
                else if (selectedRows.length > 1) setViewing(selectedRows[0]); // open first; print covers many
              }}
            >
              <Eye className="size-4 mr-2" /> View ({selectedCount})
            </Button>
            <Button
              variant="outline"
              disabled={selectedCount === 0}
              onClick={() => doPrint(selectedRows)}
            >
              <Printer className="size-4 mr-2" /> Print selected
            </Button>
            <Button variant="ghost" onClick={() => doPrint(filtered)} disabled={filtered.length === 0}>
              Print all (filtered)
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="print-hide">
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={allFilteredSelected}
                    onCheckedChange={toggleAll}
                    aria-label="Select all filtered"
                  />
                </TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Name(s)</TableHead>
                <TableHead>CAS#</TableHead>
                <TableHead>MW</TableHead>
                <TableHead>Formula</TableHead>
                <TableHead>Sequence</TableHead>
                <TableHead>Confidence</TableHead>
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
              )}
              {!isLoading && filtered.length === 0 && (
                <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">No items match.</TableCell></TableRow>
              )}
              {filtered.map(item => (
                <TableRow key={item.id} className="cursor-pointer" onClick={() => setViewing(item)}>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={!!selected[item.id]}
                      onCheckedChange={(v) => setSelected(s => ({ ...s, [item.id]: !!v }))}
                    />
                  </TableCell>
                  <TableCell className="text-xs">{item.category}</TableCell>
                  <TableCell className="font-medium">{item.names}</TableCell>
                  <TableCell className="text-xs font-mono">{item.cas_number}</TableCell>
                  <TableCell className="text-xs">{item.molecular_weight}</TableCell>
                  <TableCell className="text-xs font-mono">{item.chemical_formula}</TableCell>
                  <TableCell className="text-xs font-mono max-w-[260px] truncate">{item.sequence}</TableCell>
                  <TableCell className="text-xs">{item.confidence?.split(" - ")[0]}</TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    {isAdmin && (
                      <Button size="icon" variant="ghost"
                        onClick={() => { if (confirm(`Delete "${item.names}"?`)) deleteMut.mutate(item.id); }}>
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Print area (hidden on screen, visible on print) */}
      <div className="print-area hidden">
        <h1 style={{ fontSize: "14pt", marginBottom: "6pt" }}>Library — Reference Items</h1>
        <p style={{ fontSize: "9pt", marginBottom: "8pt" }}>
          {(printRows ?? selectedRows).length} item(s) · printed {new Date().toLocaleString()}
        </p>
        <table>
          <thead>
            <tr>
              <th>Category</th><th>Name(s)</th><th>CAS#</th><th>MW</th>
              <th>Formula</th><th>Sequence</th><th>Salt/Form</th>
              <th>Termini/Mods</th><th>Notes</th><th>Confidence</th>
            </tr>
          </thead>
          <tbody>
            {(printRows ?? selectedRows).map(i => (
              <tr key={i.id}>
                <td>{i.category}</td>
                <td>{i.names}</td>
                <td>{i.cas_number}</td>
                <td>{i.molecular_weight}</td>
                <td>{i.chemical_formula}</td>
                <td>{i.sequence}</td>
                <td>{i.salt_form}</td>
                <td>{i.termini_modifications}</td>
                <td>{i.notes}</td>
                <td>{i.confidence}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ViewDialog item={viewing} onClose={() => setViewing(null)} />
      <AddDialog open={addOpen} onClose={() => setAddOpen(false)} onSubmit={createMut.mutate} submitting={createMut.isPending} />
      <UploadDialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onSubmit={uploadMut.mutate}
        submitting={uploadMut.isPending}
      />
    </div>
  );
}

function ViewDialog({ item, onClose }: { item: LibraryItem | null; onClose: () => void }) {
  return (
    <Dialog open={!!item} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{item?.names}</DialogTitle>
          <DialogDescription>{item?.category}</DialogDescription>
        </DialogHeader>
        {item && (
          <div className="space-y-3 text-sm">
            {FIELDS.filter(f => f.key !== "names" && f.key !== "category").map(f => {
              const v = item[f.key] as string | null;
              if (!v) return null;
              return (
                <div key={f.key} className="grid grid-cols-[180px_1fr] gap-2">
                  <div className="text-muted-foreground">{f.label}</div>
                  <div className="font-mono text-xs break-words">
                    {f.key === "source_url" ? (
                      <a href={v} target="_blank" rel="noreferrer" className="text-primary inline-flex items-center gap-1">
                        {v} <ExternalLink className="size-3" />
                      </a>
                    ) : v}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function AddDialog({
  open, onClose, onSubmit, submitting,
}: {
  open: boolean; onClose: () => void;
  onSubmit: (d: Record<string, string | null>) => void; submitting: boolean;
}) {
  const [form, setForm] = useState<Record<string, string>>({});
  function set(k: string, v: string) { setForm(s => ({ ...s, [k]: v })); }
  function submit() {
    if (!form.names?.trim()) { toast.error("Name is required"); return; }
    const out: Record<string, string | null> = {};
    for (const f of FIELDS) {
      const v = form[f.key as string]?.trim();
      out[f.key as string] = v ? v : null;
    }
    onSubmit(out);
  }
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Add Library Item</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {FIELDS.map(f => (
            <div key={f.key} className={f.key === "names" || f.key === "notes" || f.key === "ambiguity_notes" ? "md:col-span-2" : ""}>
              <Label className="text-xs">{f.label}{f.key === "names" && " *"}</Label>
              <Input value={form[f.key as string] ?? ""} onChange={(e) => set(f.key as string, e.target.value)} />
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={submitting}>{submitting ? "Saving…" : "Add"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UploadDialog({
  open, onClose, onSubmit, submitting,
}: {
  open: boolean; onClose: () => void;
  onSubmit: (rows: Array<Record<string, string | null>>) => void; submitting: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<Array<Record<string, string | null>> | null>(null);
  const [filename, setFilename] = useState<string>("");

  async function onFile(f: File) {
    setFilename(f.name);
    const text = await f.text();
    const grid = parseCsv(text);
    if (grid.length < 2) { toast.error("CSV is empty"); return; }
    const headers = grid[0].map(h => h.trim().toLowerCase());
    const rows: Array<Record<string, string | null>> = [];
    for (let r = 1; r < grid.length; r++) {
      const row = grid[r];
      const obj: Record<string, string | null> = {};
      for (let c = 0; c < headers.length; c++) {
        const key = CSV_HEADER_MAP[headers[c]];
        if (!key) continue;
        const v = (row[c] ?? "").trim();
        if (v && v.toUpperCase() !== "N/A") obj[key as string] = v;
      }
      if (obj.names) rows.push(obj);
    }
    if (rows.length === 0) { toast.error("No rows with a Name column found"); return; }
    setParsed(rows);
  }

  function submit() { if (parsed) onSubmit(parsed); }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload CSV</DialogTitle>
          <DialogDescription>
            Headers must match the standard library columns (Category, Name(s), CAS#, …).
            Rows with a duplicate CAS# or Name will be skipped.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
          />
          {filename && (
            <div className="text-sm text-muted-foreground">
              {filename}: {parsed?.length ?? 0} row(s) parsed
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={!parsed || submitting}>
            {submitting ? "Uploading…" : "Upload"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}