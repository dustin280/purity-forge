import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { AuditRow } from "./types";

export function DiffDialog({
  row, onClose,
}: {
  row: AuditRow | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>
            {row?.action} on {row?.table_name}
          </DialogTitle>
        </DialogHeader>
        {row ? (
          <div className="space-y-3">
            <div className="text-xs text-muted-foreground">
              {new Date(row.changed_at).toLocaleString()} · record {row.record_id ?? "—"}
            </div>
            {row.action === "UPDATE" && row.diff?.old && row.diff?.new ? (
              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <div className="text-xs font-semibold mb-1">Before</div>
                  <pre className="bg-muted rounded p-3 text-[11px] overflow-auto max-h-[60vh]">{JSON.stringify(row.diff.old, null, 2)}</pre>
                </div>
                <div>
                  <div className="text-xs font-semibold mb-1">After</div>
                  <pre className="bg-muted rounded p-3 text-[11px] overflow-auto max-h-[60vh]">{JSON.stringify(row.diff.new, null, 2)}</pre>
                </div>
              </div>
            ) : (
              <pre className="bg-muted rounded p-3 text-[11px] overflow-auto max-h-[70vh]">{JSON.stringify(row.diff, null, 2)}</pre>
            )}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}