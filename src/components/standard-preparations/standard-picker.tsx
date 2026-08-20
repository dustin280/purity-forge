import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Search, FlaskConical } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { searchApprovedStandardsUnexpired } from "@/lib/standard-preparations/prep-working.functions";
import type { ConcUnit } from "./solid-flow/types";

export interface PickedStandard {
  id: string;
  syn_id: string | null;
  standard_name: string;
  final_concentration_value: number;
  final_concentration_unit: ConcUnit;
  final_volume_ml: number;
  /** Null on rows created before volume tracking existed — treat as fully
   * available (falls back to final_volume_ml at every use site). */
  volume_remaining_ml: number | null;
  expiration_date: string | null;
  material_receipt_id: string | null;
  ref_material_name: string | null;
  ref_lot: string | null;
  ref_purity_percent: number | null;
  ref_molecular_weight: number | null;
  ref_receipt_date: string | null;
}

interface Props {
  placeholder?: string;
  onPick: (s: PickedStandard) => void;
}

/**
 * Picks an approved, unexpired primary standard as the source for a Working
 * Standard dilution. Structurally mirrors material-receipt-picker.tsx.
 */
export function StandardPicker({ placeholder = "Search standard name or SYX ID…", onPick }: Props) {
  const [q, setQ] = useState("");
  const search = useServerFn(searchApprovedStandardsUnexpired);
  const { data: rows = [], isFetching } = useQuery({
    queryKey: ["approved-standards-unexpired", q],
    queryFn: () => search({ data: { q: q.trim() || null, limit: 20 } }) as Promise<PickedStandard[]>,
  });

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder={placeholder}
          className="pl-8"
        />
      </div>
      <Card className="p-1 max-h-64 overflow-auto">
        {isFetching && rows.length === 0 && (
          <div className="p-3 text-xs text-muted-foreground">Searching…</div>
        )}
        {!isFetching && rows.length === 0 && (
          <div className="p-3 text-xs text-muted-foreground">
            No approved, unexpired primary standards found.
          </div>
        )}
        {rows.map((s: PickedStandard) => (
          <button
            type="button"
            key={s.id}
            onClick={() => onPick(s)}
            className="w-full text-left p-2 rounded-md hover:bg-accent focus:bg-accent focus:outline-none flex items-start gap-2"
          >
            <FlaskConical className="size-4 mt-0.5 text-muted-foreground shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium truncate">{s.standard_name}</div>
              <div className="text-[11px] text-muted-foreground truncate">
                {s.syn_id || "—"} · {s.final_concentration_value} {s.final_concentration_unit} · {s.volume_remaining_ml ?? s.final_volume_ml} of {s.final_volume_ml} mL left
              </div>
              <div className="text-[11px] text-muted-foreground">
                {s.expiration_date ? `Expires ${s.expiration_date}` : "No expiration recorded"}
                {s.ref_material_name ? ` · ${s.ref_material_name}` : ""}
              </div>
            </div>
          </button>
        ))}
      </Card>
    </div>
  );
}
