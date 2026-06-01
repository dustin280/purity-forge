import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
  useTimesheetProjects,
  useTimesheetProjectMutations,
} from "@/components/timesheets/use-timesheets";

export const Route = createFileRoute("/_authenticated/admin/timesheet-projects")({
  component: TimesheetProjectsAdmin,
});

function TimesheetProjectsAdmin() {
  const { role } = useAuth();
  const isAdmin = role === "admin";
  const { data: projects = [], isLoading } = useTimesheetProjects();
  const { createMut, updateMut, deleteMut } = useTimesheetProjectMutations();
  const [name, setName] = useState("");

  if (!isAdmin) {
    return (
      <div className="p-8 text-sm text-muted-foreground">
        Admins only.
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-3xl">
      <Link to="/admin">
        <Button variant="ghost" size="sm" className="-ml-2 mb-2">
          <ArrowLeft className="size-4 mr-1" /> Back to Admin
        </Button>
      </Link>
      <div className="mb-6">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
          Admin
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-1">
          Timesheet projects
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage the project options shown in the Timesheets dropdown.
        </p>
      </div>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="text-base">Add project</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="flex gap-2 items-end"
            onSubmit={(e) => {
              e.preventDefault();
              if (!name.trim()) return;
              createMut.mutate(
                { name: name.trim() },
                { onSuccess: () => setName("") },
              );
            }}
          >
            <div className="grid gap-1.5 flex-1">
              <Label htmlFor="proj-name">Name</Label>
              <Input
                id="proj-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Stability Studies"
              />
            </div>
            <Button type="submit" disabled={createMut.isPending}>
              {createMut.isPending ? "Adding…" : "Add"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Project</TableHead>
              <TableHead className="w-[120px]">Sort</TableHead>
              <TableHead className="w-[100px]">Active</TableHead>
              <TableHead className="w-[100px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            )}
            {!isLoading && projects.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  No projects yet.
                </TableCell>
              </TableRow>
            )}
            {projects.map((p) => (
              <TableRow key={p.id}>
                <TableCell>
                  <Input
                    defaultValue={p.name}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v && v !== p.name) updateMut.mutate({ id: p.id, name: v });
                    }}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    defaultValue={p.sort_order}
                    onBlur={(e) => {
                      const v = Number(e.target.value);
                      if (Number.isFinite(v) && v !== p.sort_order)
                        updateMut.mutate({ id: p.id, sort_order: v });
                    }}
                  />
                </TableCell>
                <TableCell>
                  <Checkbox
                    checked={p.is_active}
                    onCheckedChange={(c) =>
                      updateMut.mutate({ id: p.id, is_active: Boolean(c) })
                    }
                  />
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (confirm(`Delete project "${p.name}"?`)) deleteMut.mutate(p.id);
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