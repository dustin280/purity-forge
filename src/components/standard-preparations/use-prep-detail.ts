import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  deleteStandardPreparation,
  getStandardPreparation,
  transitionStandardPreparation,
  updateStandardPreparation,
} from "@/lib/standard-preparations.functions";
import { recordStandardUsage, discardStandardPrep } from "@/lib/standard-preparations/prep-lifecycle.functions";
import { clearPrepDraft, prepValuesToPayload } from "@/components/standard-preparations/prep-form";
import { qk } from "@/lib/query-keys";

export function usePrepDetail(id: string) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const get = useServerFn(getStandardPreparation);
  const update = useServerFn(updateStandardPreparation);
  const del = useServerFn(deleteStandardPreparation);
  const transition = useServerFn(transitionStandardPreparation);
  const recordUsage = useServerFn(recordStandardUsage);
  const discard = useServerFn(discardStandardPrep);

  const query = useQuery({
    queryKey: qk.standardPreps.detail(id),
    queryFn: () => get({ data: { id } }),
  });

  const updateMut = useMutation({
    mutationFn: (patch: ReturnType<typeof prepValuesToPayload>) => update({ data: { id, patch } }),
    onSuccess: () => {
      clearPrepDraft(`sop-draft:edit:${id}`);
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: qk.standardPreps.detail(id) });
      qc.invalidateQueries({ queryKey: qk.standardPreps.all });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: () => del({ data: { id } }),
    onSuccess: () => {
      toast.success("Preparation deleted");
      navigate({ to: "/lab-logs/standard-preparations" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const transitionMut = useMutation({
    mutationFn: (args: { target: "reviewed" | "approved" | "draft"; actor_name: string }) =>
      transition({ data: { id, ...args } }),
    onSuccess: () => {
      toast.success("Status updated");
      qc.invalidateQueries({ queryKey: qk.standardPreps.detail(id) });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const recordUsageMut = useMutation({
    mutationFn: (args: { withdrawn_ml: number; actor_name: string; purpose?: string | null; notes?: string | null }) =>
      recordUsage({ data: { prep_id: id, ...args } }),
    onSuccess: (res) => {
      toast.success(`Recorded — ${res.volume_remaining_ml} mL remaining`);
      qc.invalidateQueries({ queryKey: qk.standardPreps.detail(id) });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const discardMut = useMutation({
    mutationFn: (args: { actor_name: string; reason?: string | null }) =>
      discard({ data: { prep_id: id, ...args } }),
    onSuccess: () => {
      toast.success("Preparation discarded");
      qc.invalidateQueries({ queryKey: qk.standardPreps.detail(id) });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return { query, updateMut, deleteMut, transitionMut, recordUsageMut, discardMut };
}