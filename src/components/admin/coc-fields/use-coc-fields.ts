import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  listCocFields, createCocField, updateCocField, deleteCocField,
} from "@/lib/lims.functions";
import { qk } from "@/lib/query-keys";
import type { CocField, FieldType } from "./types";

/**
 * Bundles the CoC fields list query and add/update/delete/move mutations
 * with toast feedback and cross-key invalidation (records depend on fields).
 */
export function useCocFields() {
  const qc = useQueryClient();
  const list = useServerFn(listCocFields);
  const create = useServerFn(createCocField);
  const update = useServerFn(updateCocField);
  const del = useServerFn(deleteCocField);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: qk.cocFields.list(),
    queryFn: () => list() as Promise<CocField[]>,
  });
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: qk.cocFields.list() });
    qc.invalidateQueries({ queryKey: qk.cocRecords.list() });
  };

  const addMut = useMutation({
    mutationFn: (v: { field_key: string; label: string; field_type: FieldType; is_required: boolean }) =>
      create({ data: v }),
    onSuccess: () => { toast.success("Field added"); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to add"),
  });
  const updateMut = useMutation({
    mutationFn: (v: { id: string; label?: string; field_type?: FieldType; is_required?: boolean; is_active?: boolean; sort_order?: number }) =>
      update({ data: v }),
    onSuccess: invalidate,
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to update"),
  });
  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => { toast.success("Field removed"); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to delete"),
  });

  function handleAdd(payload: { field_key: string; label: string; field_type: FieldType; is_required: boolean }) {
    addMut.mutate(payload);
  }

  function move(idx: number, dir: -1 | 1) {
    const target = rows[idx + dir];
    const me = rows[idx];
    if (!target || !me) return;
    updateMut.mutate({ id: me.id, sort_order: target.sort_order });
    updateMut.mutate({ id: target.id, sort_order: me.sort_order });
  }

  function handleUpdate(id: string, patch: Partial<CocField>) {
    updateMut.mutate({ id, ...patch });
  }

  function handleDelete(id: string, label: string) {
    if (confirm(`Delete field "${label}"? Existing data is preserved but the field will disappear.`)) {
      delMut.mutate(id);
    }
  }

  return {
    rows, isLoading,
    adding: addMut.isPending,
    handleAdd, move, handleUpdate, handleDelete,
  };
}