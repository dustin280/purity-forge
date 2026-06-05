import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/hooks/use-auth";
import {
  deleteRunListColumn,
  listRunListColumns,
  upsertRunListColumn,
  type RunListColumnSource,
} from "@/lib/run-list-columns.functions";
import { qk } from "@/lib/query-keys";

export const Route = createFileRoute("/_authenticated/admin/run-list-columns")({
  component: RunListColumnsAdmin,
});

type UpsertInput = {
  id?: string;
  key: string;
  label: string;
  source: RunListColumnSource;
  default_value: string | null;
  sample_field: string | null;
  sort_order: number;
  is_active: boolean;
};

const SOURCES: { value: RunListColumnSource; label: string }[] = [
  { value: "literal", label: "Literal (default value)" },
  { value: "sample_field", label: "Sample field" },
  { value: "method", label: "Method (override or list)" },
  { value: "vial", label: "Vial position" },
  { value: "data_file_pattern", label: "Data file (pattern)" },
];

function RunListColumnsAdmin() {
  const { role } = useAuth();
  const isAdmin = role === "admin";
  const qc = useQueryClient();
  const list = useServerFn(listRunListColumns);
  const upsert = useServerFn(upsertRunListColumn);
  const del = useServerFn(deleteRunListColumn);

  const { data: columns = [], isLoading } = useQuery({
    queryKey: qk.runLists.columns(),
    queryFn: () => list(),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: qk.runLists.columns() });

  const upsertMut = useMutation({
    mutationFn: (d: UpsertInput) => upsert({ data: d }),
    onSuccess: () => invalidate(),
    onError: (e: Error) => toast.error(e.message),
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => { toast.success("Deleted"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const [key, setKey] = useState("");
  const [label, setLabel] = useState("");
  const [source, setSource] = useState<RunListColumnSource>("literal");
  const [defaultValue, setDefaultValue] = useState("");
  const [sampleField, setSampleField] = useState("");

  if (!isAdmin) {
    return <div className="p-8 text-sm text-muted-foreground">Admins only.</div>;
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl">
      <Link to="/admin">
        <Button variant="ghost" size="sm" className="-ml-2 mb-2">
          <ArrowLeft className="size-4 mr-1" /> Back to Admin
        </Button>
      </Link>
      <div className="mb-6">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Admin</div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-1">Run List Columns</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Columns exported in the OpenLab CDS sequence CSV. Order here is the column order in the file.
        </p>
      </div>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="text-base">Add column</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="grid sm:grid-cols-2 gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!key.trim() || !label.trim()) return;
              upsertMut.mutate(
                {
                  key: key.trim(),
                  label: label.trim(),
                  source,
                  default_value: defaultValue.trim() || null,
                  sample_field: source === "sample_field" ? (sampleField.trim() || null) : null,
                  sort_order: (columns[columns.length - 1]?.sort_order ?? 0) + 10,
                  is_active: true,
                },
                {
                  onSuccess: () => {
                    toast.success("Column added");
                    setKey(""); setLabel(""); setSource("literal"); setDefaultValue(""); setSampleField("");
                  },
                },
              );
            }}
          >
            <div className="grid gap-1.5">
              <Label htmlFor="rlc-key">CSV header (key)</Label>
              <Input id="rlc-key" value={key} onChange={(e) => setKey(e.target.value)} placeholder="e.g. Sample Name" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="rlc-label">Label</Label>
              <Input id="rlc-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Display label" />
            </div>
            <div className="grid gap-1.5">
              <Label>Source</Label>
              <Select value={source} onValueChange={(v) => setSource(v as RunListColumnSource)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SOURCES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="rlc-default">Default value</Label>
              <Input id="rlc-default" value={defaultValue} onChange={(e) => setDefaultValue(e.target.value)} placeholder="optional" />
            </div>
            {source === "sample_field" && (
              <div className="grid gap-1.5 sm:col-span-2">
                <Label htmlFor="rlc-field">Sample field</Label>
                <Input id="rlc-field" value={sampleField} onChange={(e) => setSampleField(e.target.value)} placeholder="e.g. batch_id, client, lot, compound" />
              </div>
            )}
            <div className="sm:col-span-2">
              <Button type="submit" disabled={upsertMut.isPending}>
                {upsertMut.isPending ? "Adding…" : "Add column"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[80px]">Order</TableHead>
              <TableHead>Key</TableHead>
              <TableHead>Label</TableHead>
              <TableHead className="w-[180px]">Source</TableHead>
              <TableHead>Default / Field</TableHead>
              <TableHead className="w-[80px]">Active</TableHead>
              <TableHead className="w-[80px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Loading…</TableCell></TableRow>
            )}
            {!isLoading && columns.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No columns yet.</TableCell></TableRow>
            )}
            {columns.map((c) => (
              <TableRow key={c.id}>
                <TableCell>
                  <Input
                    type="number"
                    defaultValue={c.sort_order}
                    className="w-20"
                    onBlur={(e) => {
                      const v = Number(e.target.value);
                      if (!Number.isNaN(v) && v !== c.sort_order) {
                        upsertMut.mutate({
                          id: c.id, key: c.key, label: c.label, source: c.source,
                          default_value: c.default_value, sample_field: c.sample_field,
                          sort_order: v, is_active: c.is_active,
                        });
                      }
                    }}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    defaultValue={c.key}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v && v !== c.key) upsertMut.mutate({
                        id: c.id, key: v, label: c.label, source: c.source,
                        default_value: c.default_value, sample_field: c.sample_field,
                        sort_order: c.sort_order, is_active: c.is_active,
                      });
                    }}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    defaultValue={c.label}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v && v !== c.label) upsertMut.mutate({
                        id: c.id, key: c.key, label: v, source: c.source,
                        default_value: c.default_value, sample_field: c.sample_field,
                        sort_order: c.sort_order, is_active: c.is_active,
                      });
                    }}
                  />
                </TableCell>
                <TableCell>
                  <Select
                    value={c.source}
                    onValueChange={(v) => upsertMut.mutate({
                      id: c.id, key: c.key, label: c.label, source: v as RunListColumnSource,
                      default_value: c.default_value, sample_field: c.sample_field,
                      sort_order: c.sort_order, is_active: c.is_active,
                    })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SOURCES.map((s) => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Input
                    defaultValue={c.source === "sample_field" ? (c.sample_field ?? "") : (c.default_value ?? "")}
                    placeholder={c.source === "sample_field" ? "sample field name" : "default value"}
                    onBlur={(e) => {
                      const v = e.target.value;
                      if (c.source === "sample_field") {
                        if ((v || null) !== c.sample_field) upsertMut.mutate({
                          id: c.id, key: c.key, label: c.label, source: c.source,
                          default_value: c.default_value, sample_field: v.trim() || null,
                          sort_order: c.sort_order, is_active: c.is_active,
                        });
                      } else {
                        if ((v || null) !== c.default_value) upsertMut.mutate({
                          id: c.id, key: c.key, label: c.label, source: c.source,
                          default_value: v.trim() || null, sample_field: c.sample_field,
                          sort_order: c.sort_order, is_active: c.is_active,
                        });
                      }
                    }}
                  />
                </TableCell>
                <TableCell>
                  <Checkbox
                    checked={c.is_active}
                    onCheckedChange={(v) => upsertMut.mutate({
                      id: c.id, key: c.key, label: c.label, source: c.source,
                      default_value: c.default_value, sample_field: c.sample_field,
                      sort_order: c.sort_order, is_active: Boolean(v),
                    })}
                  />
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (confirm(`Delete column "${c.key}"?`)) deleteMut.mutate(c.id);
                    }}
                  >
                    Delete
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}