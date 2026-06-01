import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  createTimesheetEntry,
  createTimesheetProject,
  deleteTimesheetEntry,
  deleteTimesheetProject,
  listTimesheetEntries,
  listTimesheetProjects,
  updateTimesheetEntry,
  updateTimesheetProject,
  type TimesheetEntry,
} from "@/lib/timesheets.functions";
import { qk } from "@/lib/query-keys";

export interface TimesheetFilters {
  from?: string;
  to?: string;
  project?: string;
  q?: string;
  mineOnly?: boolean;
}

export function useTimesheetEntries(filters: TimesheetFilters = {}) {
  const list = useServerFn(listTimesheetEntries);
  return useQuery({
    queryKey: qk.timesheets.list(filters),
    queryFn: () => list({ data: filters }),
  });
}

export function useTimesheetMutations() {
  const qc = useQueryClient();
  const create = useServerFn(createTimesheetEntry);
  const update = useServerFn(updateTimesheetEntry);
  const del = useServerFn(deleteTimesheetEntry);

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: qk.timesheets.all });

  return {
    createMut: useMutation({
      mutationFn: (data: Parameters<typeof create>[0]["data"]) => create({ data }),
      onSuccess: () => {
        toast.success("Entry added");
        invalidate();
      },
      onError: (e: Error) => toast.error(e.message),
    }),
    updateMut: useMutation({
      mutationFn: (data: Parameters<typeof update>[0]["data"]) => update({ data }),
      onSuccess: () => {
        toast.success("Entry updated");
        invalidate();
      },
      onError: (e: Error) => toast.error(e.message),
    }),
    deleteMut: useMutation({
      mutationFn: (id: string) => del({ data: { id } }),
      onSuccess: () => {
        toast.success("Entry deleted");
        invalidate();
      },
      onError: (e: Error) => toast.error(e.message),
    }),
  };
}

export function useTimesheetProjects() {
  const list = useServerFn(listTimesheetProjects);
  return useQuery({
    queryKey: qk.timesheets.projects(),
    queryFn: () => list(),
  });
}

export function useTimesheetProjectMutations() {
  const qc = useQueryClient();
  const create = useServerFn(createTimesheetProject);
  const update = useServerFn(updateTimesheetProject);
  const del = useServerFn(deleteTimesheetProject);
  const invalidate = () =>
    qc.invalidateQueries({ queryKey: qk.timesheets.projects() });

  return {
    createMut: useMutation({
      mutationFn: (data: Parameters<typeof create>[0]["data"]) => create({ data }),
      onSuccess: () => {
        toast.success("Project added");
        invalidate();
      },
      onError: (e: Error) => toast.error(e.message),
    }),
    updateMut: useMutation({
      mutationFn: (data: Parameters<typeof update>[0]["data"]) => update({ data }),
      onSuccess: () => invalidate(),
      onError: (e: Error) => toast.error(e.message),
    }),
    deleteMut: useMutation({
      mutationFn: (id: string) => del({ data: { id } }),
      onSuccess: () => {
        toast.success("Project removed");
        invalidate();
      },
      onError: (e: Error) => toast.error(e.message),
    }),
  };
}

/** Sum hours across entries. */
export function totalHours(entries: TimesheetEntry[]) {
  return entries.reduce((sum, e) => sum + Number(e.duration_hours || 0), 0);
}