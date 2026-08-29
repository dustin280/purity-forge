import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ArrowUp, ArrowDown, Trash2 } from "lucide-react";
import { TYPE_OPTIONS, type CocField, type FieldType } from "./types";

export function FieldRow({
  f,
  idx,
  total,
  onMove,
  onUpdate,
  onDelete,
}: {
  f: CocField;
  idx: number;
  total: number;
  onMove: (idx: number, dir: -1 | 1) => void;
  onUpdate: (id: string, patch: Partial<CocField>) => void;
  onDelete: (id: string, label: string) => void;
}) {
  return (
    <li className="grid grid-cols-1 sm:grid-cols-[auto_1fr_auto_auto_auto_auto_auto] items-center gap-3 px-4 py-2.5">
      <div className="flex flex-col">
        <Button size="icon" variant="ghost" className="size-6"
          disabled={idx === 0} onClick={() => onMove(idx, -1)}>
          <ArrowUp className="size-3" />
        </Button>
        <Button size="icon" variant="ghost" className="size-6"
          disabled={idx === total - 1} onClick={() => onMove(idx, 1)}>
          <ArrowDown className="size-3" />
        </Button>
      </div>
      <div className="min-w-0">
        <Input
          defaultValue={f.label}
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v && v !== f.label) onUpdate(f.id, { label: v });
          }}
          className={`h-8 ${f.is_active ? "" : "text-muted-foreground line-through"}`}
        />
        <div className="text-[10px] text-muted-foreground mt-0.5 font-mono truncate">{f.field_key}</div>
      </div>
      <Select value={f.field_type} onValueChange={(v) => onUpdate(f.id, { field_type: v as FieldType })}>
        <SelectTrigger className="h-8 w-[130px]"><SelectValue /></SelectTrigger>
        <SelectContent>
          {TYPE_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {f.field_type === "multiselect" ? (
        <div className="w-[150px]" />
      ) : (
        <div className="w-[150px]">
          <Input
            defaultValue={f.default_value ?? ""}
            placeholder="Default value"
            title="Pre-fills this field on a new receipt. Leave blank for none."
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v !== (f.default_value ?? "")) onUpdate(f.id, { default_value: v || null });
            }}
            className="h-8 text-xs"
          />
        </div>
      )}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Switch checked={f.is_required}
          onCheckedChange={(v) => onUpdate(f.id, { is_required: v })} />
        <span>Req</span>
      </div>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Switch checked={f.is_active}
          onCheckedChange={(v) => onUpdate(f.id, { is_active: v })} />
        <span>Active</span>
      </div>
      <Button size="icon" variant="ghost"
        onClick={() => onDelete(f.id, f.label)}
        className="text-muted-foreground hover:text-destructive">
        <Trash2 className="size-4" />
      </Button>
    </li>
  );
}
