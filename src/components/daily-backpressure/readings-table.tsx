import { Gauge, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { BackpressureRow } from "@/lib/daily-backpressure.functions";

interface ReadingsTableProps {
  rows: BackpressureRow[];
  isLoading: boolean;
  isAdmin: boolean;
  deleteLoading: boolean;
  onDelete: (id: string) => void;
}

export function ReadingsTable({
  rows,
  isLoading,
  isAdmin,
  deleteLoading,
  onDelete,
}: ReadingsTableProps) {
  return (
    <Card className="overflow-hidden">
      <div className="px-5 py-3 border-b text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Recent Readings
      </div>
      {isLoading ? (
        <div className="p-8 text-sm text-muted-foreground text-center">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="p-10 text-center">
          <Gauge className="size-8 mx-auto text-muted-foreground mb-2" />
          <div className="text-sm text-muted-foreground">No readings logged yet.</div>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-4 py-2">Date / Time</th>
                <th className="text-left font-medium px-4 py-2">User</th>
                <th className="text-left font-medium px-4 py-2">Instrument</th>
                <th className="text-right font-medium px-4 py-2">Backpressure</th>
                <th className="text-left font-medium px-4 py-2">Notes</th>
                {isAdmin && <th className="w-10" />}
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2 whitespace-nowrap">
                    {new Date(r.reading_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">{r.user_name}</td>
                  <td className="px-4 py-2">{r.instrument}</td>
                  <td className="px-4 py-2 text-right font-mono">
                    {r.backpressure}{" "}
                    <span className="text-muted-foreground">{r.backpressure_unit}</span>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">{r.notes ?? "—"}</td>
                  {isAdmin && (
                    <td className="px-2 py-2">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-7 text-destructive"
                        disabled={deleteLoading}
                        onClick={() => {
                          if (confirm("Delete this reading?")) onDelete(r.id);
                        }}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
