/**
 * Edit an existing inventory item: top-level fields, service status, and
 * its sub-components. Reuses the shared FieldGrid used by the create page.
 */
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  getInventoryItem,
  updateInventoryItem,
  type InventoryCategory,
  type InventoryComponent,
  type InventoryItem,
} from "@/lib/inventory.functions";
import { qk } from "@/lib/query-keys";
import { FieldGrid, EMPTY, type FieldSet } from "@/components/inventory/field-grid";

export const Route = createFileRoute("/_authenticated/inventory/$id")({
  component: InventoryEdit,
});

const CAT_LABEL: Record<InventoryCategory, string> = {
  instrument: "Instrument",
  column: "Column",
  accessory: "Accessory",
  other: "Other",
};

function rowToField(r: InventoryItem | InventoryComponent): FieldSet {
  return {
    id: r.id,
    make: r.make ?? "",
    model: r.model ?? "",
    part_number: r.part_number ?? "",
    serial_number: r.serial_number ?? "",
    description: r.description ?? "",
    purchase_date: r.purchase_date ?? "",
    installation_date: r.installation_date ?? "",
    installer_initials: r.installer_initials ?? "",
    status: r.status,
    is_spare: r.is_spare,
  };
}

function InventoryEdit() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fetchItem = useServerFn(getInventoryItem);
  const update = useServerFn(updateInventoryItem);

  const { data, isLoading } = useQuery({
    queryKey: qk.inventory.detail(id),
    queryFn: () => fetchItem({ data: { id } }),
  });

  const [main, setMain] = useState<FieldSet>(EMPTY);
  const [components, setComponents] = useState<FieldSet[]>([]);

  useEffect(() => {
    if (!data) return;
    setMain(rowToField(data));
    setComponents((data.components ?? []).map(rowToField));
  }, [data]);

  const supportsComponents =
    data?.category === "instrument" || data?.category === "other";

  const mutation = useMutation({
    mutationFn: () => update({
      data: {
        id,
        ...main,
        components: supportsComponents ? components : [],
      },
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.inventory.all });
      toast.success("Inventory updated");
      navigate({ to: "/inventory" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  }
  if (!data) {
    return <div className="p-8 text-sm text-muted-foreground">Not found.</div>;
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-3xl">
      <Button asChild variant="ghost" size="sm" className="mb-3">
        <Link to="/inventory"><ArrowLeft className="size-4 mr-1" /> Back to inventory</Link>
      </Button>
      <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Edit inventory</h1>
      <p className="text-sm text-muted-foreground mt-1 mb-6">
        {CAT_LABEL[data.category]} · Update fields or change service status when this item is put in or taken out of service.
      </p>

      <form
        onSubmit={e => { e.preventDefault(); mutation.mutate(); }}
        className="space-y-6"
      >
        <Card className="p-4 sm:p-6 space-y-4">
          <FieldGrid value={main} onChange={setMain} idPrefix="main" />
        </Card>

        {supportsComponents && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Components</h2>
              <Button
                type="button" size="sm" variant="outline"
                onClick={() => setComponents(prev => [...prev, { ...EMPTY }])}
              >
                <Plus className="size-4 mr-1" /> Add component
              </Button>
            </div>
            {components.length === 0 && (
              <p className="text-sm text-muted-foreground">No components.</p>
            )}
            {components.map((c, idx) => (
              <Card key={c.id ?? `new-${idx}`} className="p-4 sm:p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium">Component {idx + 1}</div>
                  <Button
                    type="button" size="sm" variant="ghost"
                    onClick={() => setComponents(prev => prev.filter((_, i) => i !== idx))}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
                <FieldGrid
                  value={c}
                  onChange={v => setComponents(prev => prev.map((row, i) => (i === idx ? v : row)))}
                  idPrefix={`comp-${idx}`}
                />
              </Card>
            ))}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" asChild>
            <Link to="/inventory">Cancel</Link>
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </form>
    </div>
  );
}