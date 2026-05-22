import { useState, type FormEvent } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { TYPE_OPTIONS, type FieldType } from "./types";

export function AddFieldForm({
  onAdd,
  adding,
}: {
  onAdd: (payload: { field_key: string; label: string; field_type: FieldType; is_required: boolean }) => void;
  adding: boolean;
}) {
  const [newKey, setNewKey] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newType, setNewType] = useState<FieldType>("text");
  const [newRequired, setNewRequired] = useState(false);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const key = newKey.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");
    const label = newLabel.trim();
    if (!key || !label) {
      toast.error("Key and label are required");
      return;
    }
    onAdd({ field_key: key, label, field_type: newType, is_required: newRequired });
    setNewKey("");
    setNewLabel("");
    setNewType("text");
    setNewRequired(false);
  }

  return (
    <Card className="p-5 border-border mb-4">
      <form onSubmit={handleSubmit} className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label className="text-xs">Field key</Label>
          <Input
            className="mt-1"
            placeholder="e.g. courier_name"
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            maxLength={64}
          />
          <div className="text-[10px] text-muted-foreground mt-1">Lowercase, no spaces. Used as the storage key.</div>
        </div>
        <div>
          <Label className="text-xs">Label</Label>
          <Input
            className="mt-1"
            placeholder="e.g. Courier Name"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            maxLength={255}
          />
        </div>
        <div>
          <Label className="text-xs">Type</Label>
          <Select value={newType} onValueChange={(v) => setNewType(v as FieldType)}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              {TYPE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end gap-3">
          <div className="flex items-center gap-2 flex-1">
            <Switch id="new-req" checked={newRequired} onCheckedChange={setNewRequired} />
            <Label htmlFor="new-req" className="text-xs">Required</Label>
          </div>
          <Button type="submit" disabled={adding}>
            <Plus className="size-4 mr-1" /> Add field
          </Button>
        </div>
      </form>
    </Card>
  );
}
