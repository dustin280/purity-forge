import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Trash2, Plus } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useInstruments, type Instrument } from "@/components/scheduler/use-scheduler";

export const Route = createFileRoute("/_authenticated/admin/instruments")({
  component: InstrumentsAdmin,
});

function InstrumentsAdmin() {
  const { role } = useAuth();
  const { query, upsertMut, deleteMut } = useInstruments();
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");

  if (role !== "admin") {
    return <div className="p-6 text-sm text-muted-foreground">Admin only.</div>;
  }

  const rows = query.data ?? [];

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    upsertMut.mutate(
      { name: name.trim(), location: location.trim() || null, notes: notes.trim() || null },
      {
        onSuccess: () => {
          setName(""); setLocation(""); setNotes("");
        },
      },
    );
  };

  return (
    <div className="p-6 md:p-8 max-w-4xl">
      <div className="mb-6">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Administration</div>
        <h1 className="text-3xl font-bold tracking-tight mt-1">Instruments</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage the list of instruments shown in the Scheduler.</p>
      </div>

      <Card className="p-4 mb-6">
        <form onSubmit={handleAdd} className="grid sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
          <div>
            <Label className="text-xs">Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} placeholder="e.g. Infinity III HPLC-DAD" />
          </div>
          <div>
            <Label className="text-xs">Location (optional)</Label>
            <Input value={location} onChange={(e) => setLocation(e.target.value)} maxLength={200} placeholder="e.g. Lab A, bench 3" />
          </div>
          <Button type="submit" disabled={upsertMut.isPending}>
            <Plus className="size-4 mr-1" /> Add
          </Button>
          <div className="sm:col-span-3">
            <Label className="text-xs">Notes (optional)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={500} />
          </div>
        </form>
      </Card>

      <Card className="divide-y divide-border">
        {query.isLoading && <div className="p-4 text-sm text-muted-foreground">Loading…</div>}
        {!query.isLoading && rows.length === 0 && (
          <div className="p-4 text-sm text-muted-foreground">No instruments yet.</div>
        )}
        {rows.map((r) => (
          <InstrumentRow key={r.id} row={r}
            onToggle={(v) => upsertMut.mutate({ id: r.id, name: r.name, location: r.location, notes: r.notes, is_active: v })}
            onRename={(newName) => upsertMut.mutate({ id: r.id, name: newName, location: r.location, notes: r.notes, is_active: r.is_active })}
            onDelete={() => deleteMut.mutate(r.id)}
            saving={upsertMut.isPending}
            deleting={deleteMut.isPending}
          />
        ))}
      </Card>
    </div>
  );
}

function InstrumentRow({
  row, onToggle, onRename, onDelete, saving, deleting,
}: {
  row: Instrument;
  onToggle: (v: boolean) => void;
  onRename: (name: string) => void;
  onDelete: () => void;
  saving: boolean;
  deleting: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(row.name);
  return (
    <div className="p-3 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        {editing ? (
          <div className="flex gap-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
            <Button size="sm" disabled={saving || !name.trim()} onClick={() => { onRename(name.trim()); setEditing(false); }}>Save</Button>
            <Button size="sm" variant="ghost" onClick={() => { setName(row.name); setEditing(false); }}>Cancel</Button>
          </div>
        ) : (
          <button type="button" className="text-left" onClick={() => setEditing(true)}>
            <div className="font-medium">{row.name}</div>
            {row.location && <div className="text-xs text-muted-foreground">{row.location}</div>}
          </button>
        )}
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>{row.is_active ? "Active" : "Inactive"}</span>
        <Switch checked={row.is_active} onCheckedChange={onToggle} />
      </div>
      <Button size="icon" variant="ghost" disabled={deleting} onClick={() => {
        if (confirm(`Delete "${row.name}"? This removes all its bookings.`)) onDelete();
      }}>
        <Trash2 className="size-4 text-destructive" />
      </Button>
    </div>
  );
}