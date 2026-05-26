import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  listMobilePhasePreps,
  createMobilePhasePrep,
  deleteMobilePhasePrep,
  getMobilePhasePrep,
  listMobilePhaseReagents,
  createMobilePhaseReagent,
  updateMobilePhaseReagent,
  deleteMobilePhaseReagent,
} from "@/lib/mobile-phase.functions";
import { qk } from "@/lib/query-keys";
import type { PrepSide } from "@/lib/mobile-phase-instructions";

export type CreatePrepPayload = {
  prepared_at: string;
  user_name: string;
  user_initials: string;
  lot_number: string;
  total_volume: number;
  total_volume_unit: "mL" | "L";
  prep_a: PrepSide;
  prep_b: PrepSide;
};

export function useMobilePhasePreps() {
  const qc = useQueryClient();
  const list = useServerFn(listMobilePhasePreps);
  const create = useServerFn(createMobilePhasePrep);
  const del = useServerFn(deleteMobilePhasePrep);

  const query = useQuery({ queryKey: qk.mobilePhase.list(), queryFn: () => list() });

  const createMut = useMutation({
    mutationFn: (p: CreatePrepPayload) => create({ data: p }),
    onSuccess: () => {
      toast.success("Mobile phase prep saved");
      qc.invalidateQueries({ queryKey: qk.mobilePhase.all });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: qk.mobilePhase.all });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return { query, createMut, deleteMut };
}

export function useMobilePhasePrep(id: string) {
  const get = useServerFn(getMobilePhasePrep);
  return useQuery({
    queryKey: qk.mobilePhase.detail(id),
    queryFn: () => get({ data: { id } }),
  });
}

export function useMobilePhaseReagents() {
  const list = useServerFn(listMobilePhaseReagents);
  return useQuery({ queryKey: qk.mobilePhase.reagents(), queryFn: () => list() });
}

export function useMobilePhaseReagentMutations() {
  const qc = useQueryClient();
  const create = useServerFn(createMobilePhaseReagent);
  const update = useServerFn(updateMobilePhaseReagent);
  const del = useServerFn(deleteMobilePhaseReagent);
  const invalidate = () => qc.invalidateQueries({ queryKey: qk.mobilePhase.reagents() });

  return {
    createMut: useMutation({
      mutationFn: (v: { name: string; kinds: ("solvent" | "modifier" | "diluent")[]; sort_order?: number }) =>
        create({ data: { ...v, is_active: true, sort_order: v.sort_order ?? 0 } }),
      onSuccess: () => { toast.success("Reagent added"); invalidate(); },
      onError: (e: Error) => toast.error(e.message),
    }),
    updateMut: useMutation({
      mutationFn: (v: { id: string; name?: string; kinds?: ("solvent" | "modifier" | "diluent")[]; is_active?: boolean; sort_order?: number }) =>
        update({ data: v }),
      onSuccess: invalidate,
      onError: (e: Error) => toast.error(e.message),
    }),
    deleteMut: useMutation({
      mutationFn: (id: string) => del({ data: { id } }),
      onSuccess: () => { toast.success("Removed"); invalidate(); },
      onError: (e: Error) => toast.error(e.message),
    }),
  };
}