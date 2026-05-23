import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { listCocFields, listCocRecords, deleteCocRecord } from "@/lib/lims.functions";
import { qk } from "@/lib/query-keys";
import type { CocField, CocRecord } from "./types";

/**
 * Bundles the CoC records + fields queries with the delete mutation. Keeps
 * the route file focused on dialog wiring instead of query plumbing.
 */
export function useCocRecords() {
  const qc = useQueryClient();
  const listRecords = useServerFn(listCocRecords);
  const listFields = useServerFn(listCocFields);
  const del = useServerFn(deleteCocRecord);

  const { data: records = [], isLoading } = useQuery({
    queryKey: qk.cocRecords.list(),
    queryFn: () => listRecords() as Promise<CocRecord[]>,
  });
  const { data: fields = [] } = useQuery({
    queryKey: qk.cocFields.list(),
    queryFn: () => listFields() as Promise<CocField[]>,
  });

  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => { toast.success("Record deleted"); qc.invalidateQueries({ queryKey: qk.cocRecords.list() }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to delete"),
  });

  function deleteWithConfirm(r: CocRecord) {
    if (confirm(`Delete record ${r.sample_id}?`)) delMut.mutate(r.id);
  }

  return { records, fields, isLoading, deleteWithConfirm };
}