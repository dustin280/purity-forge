import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Pencil, Trash2 } from "lucide-react";
import type { TimesheetEntry, TimesheetProject } from "@/lib/timesheets.functions";
import { EntryForm } from "./entry-form";
import { useTimesheetMutations } from "./use-timesheets";

interface Props {
  rows: TimesheetEntry[];
  projects: TimesheetProject[];
  currentUserId: string | null;
  isAdmin: boolean;
  isLoading?: boolean;
  defaultUserName: string;
}

export function EntriesTable({
  rows,
  projects,
  currentUserId,
  isAdmin,
  isLoading,
  defaultUserName,
}: Props) {
  const [editing, setEditing] = useState<TimesheetEntry | null>(null);
  const [deleting, setDeleting] = useState<TimesheetEntry | null>(null);
  const { updateMut, deleteMut } = useTimesheetMutations();

  const canEdit = (e: TimesheetEntry) => isAdmin || e.user_id === currentUserId;

  if (isLoading) {
    return <div className="text-sm text-muted-foreground py-8 text-center">Loading…</div>;
  }
  if (rows.length === 0) {
    return (
      <div className="text-sm text-muted-foreground py-8 text-center border rounded-md">
        No entries found.
      </div>
    );
  }

  return (
    <>
      {/* Desktop table */}
      <div className="hidden md:block border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Project</TableHead>
              <TableHead>Task</TableHead>
              <TableHead>Start</TableHead>
              <TableHead>End</TableHead>
              <TableHead className="text-right">Hours</TableHead>
              <TableHead className="w-[100px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="whitespace-nowrap">{r.entry_date}</TableCell>
                <TableCell className="whitespace-nowrap">{r.user_name}</TableCell>
                <TableCell>{r.project}</TableCell>
                <TableCell>
                  <div className="font-medium">{r.task_description}</div>
                  {r.notes && (
                    <div className="text-xs text-muted-foreground mt-0.5">{r.notes}</div>
                  )}
                </TableCell>
                <TableCell>{r.start_time?.slice(0, 5) ?? "—"}</TableCell>
                <TableCell>{r.end_time?.slice(0, 5) ?? "—"}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {Number(r.duration_hours).toFixed(2)}
                </TableCell>
                <TableCell>
                  {canEdit(r) && (
                    <div className="flex gap-1 justify-end">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setEditing(r)}
                        aria-label="Edit"
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleting(r)}
                        aria-label="Delete"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden grid gap-2">
        {rows.map((r) => (
          <div key={r.id} className="border rounded-md p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-xs text-muted-foreground">
                  {r.entry_date} · {r.user_name}
                </div>
                <div className="font-medium">{r.project}</div>
                <div className="text-sm mt-0.5">{r.task_description}</div>
                {r.notes && (
                  <div className="text-xs text-muted-foreground mt-1">{r.notes}</div>
                )}
                {(r.start_time || r.end_time) && (
                  <div className="text-xs text-muted-foreground mt-1">
                    {r.start_time?.slice(0, 5) ?? "—"} – {r.end_time?.slice(0, 5) ?? "—"}
                  </div>
                )}
              </div>
              <div className="text-right shrink-0">
                <div className="font-semibold tabular-nums">
                  {Number(r.duration_hours).toFixed(2)}h
                </div>
                {canEdit(r) && (
                  <div className="flex gap-1 mt-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setEditing(r)}
                      aria-label="Edit"
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleting(r)}
                      aria-label="Delete"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit entry</DialogTitle>
          </DialogHeader>
          {editing && (
            <EntryForm
              defaultUserName={defaultUserName}
              projects={projects}
              initial={editing}
              loading={updateMut.isPending}
              onCancel={() => setEditing(null)}
              onSubmit={(v) =>
                updateMut.mutate(
                  { id: editing.id, ...v },
                  { onSuccess: () => setEditing(null) },
                )
              }
            />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(v) => !v && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this entry?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting && (
                <>
                  {deleting.entry_date} · {deleting.project} ·{" "}
                  {Number(deleting.duration_hours).toFixed(2)}h
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleting) {
                  deleteMut.mutate(deleting.id, {
                    onSuccess: () => setDeleting(null),
                  });
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}