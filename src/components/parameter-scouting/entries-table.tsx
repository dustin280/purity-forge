import { FlaskConical, Pencil, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { ParameterScoutingRow } from "@/lib/parameter-scouting.functions";

function gradientSummary(g: ParameterScoutingRow["gradient"]) {
  if (!g || g.length === 0) return "—";
  const first = g[0];
  const last = g[g.length - 1];
  return `${g.length} step${g.length === 1 ? "" : "s"}, ${first.percent_b}→${last.percent_b}% B`;
}

interface EntriesTableProps {
  rows: ParameterScoutingRow[];
  isLoading: boolean;
  currentUserId: string | null;
  isAdmin: boolean;
  deleteLoading: boolean;
  onEdit: (row: ParameterScoutingRow) => void;
  onDelete: (id: string) => void;
}

export function EntriesTable({
  rows,
  isLoading,
  currentUserId,
  isAdmin,
  deleteLoading,
  onEdit,
  onDelete,
}: EntriesTableProps) {
  return (
    <Card className="overflow-hidden">
      <div className="px-5 py-3 border-b text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Scouting entries
      </div>
      {isLoading ? (
        <div className="p-8 text-sm text-muted-foreground text-center">
          Loading…
        </div>
      ) : rows.length === 0 ? (
        <div className="p-10 text-center">
          <FlaskConical className="size-8 mx-auto text-muted-foreground mb-2" />
          <div className="text-sm text-muted-foreground">No entries yet.</div>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-4 py-2">Date / Time</th>
                <th className="text-left font-medium px-4 py-2">User</th>
                <th className="text-right font-medium px-4 py-2">Compounds</th>
                <th className="text-right font-medium px-4 py-2">Flow</th>
                <th className="text-right font-medium px-4 py-2">Temp</th>
                <th className="text-left font-medium px-4 py-2">Gradient</th>
                <th className="w-24" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => {
                const canEdit = isAdmin || r.created_by === currentUserId;
                return (
                  <tr key={r.id}>
                    <td className="px-4 py-2 whitespace-nowrap">
                      {new Date(r.run_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">{r.user_name}</td>
                    <td className="px-4 py-2 text-right font-mono">
                      {r.run_list?.length ?? 0}
                    </td>
                    <td className="px-4 py-2 text-right font-mono">
                      {r.flow_rate_ml_per_min ?? "—"}
                      {r.flow_rate_ml_per_min !== null && (
                        <span className="text-muted-foreground"> mL/min</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right font-mono">
                      {r.temperature_c ?? "—"}
                      {r.temperature_c !== null && (
                        <span className="text-muted-foreground"> °C</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {gradientSummary(r.gradient)}
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap text-right">
                      {canEdit && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-7"
                          onClick={() => onEdit(r)}
                        >
                          <Pencil className="size-4" />
                        </Button>
                      )}
                      {canEdit && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-7 text-destructive"
                          disabled={deleteLoading}
                          onClick={() => {
                            if (confirm("Delete this entry?")) onDelete(r.id);
                          }}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}