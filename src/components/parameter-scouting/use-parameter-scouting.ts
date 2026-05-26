import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  createParameterScoutingLog,
  deleteParameterScoutingLog,
  listParameterScoutingLogs,
  updateParameterScoutingLog,
  type GradientStep,
  type RunListItem,
} from "@/lib/parameter-scouting.functions";
import {
  listCompounds,
  createCompound,
  type Compound,
} from "@/lib/compounds.functions";
import { qk } from "@/lib/query-keys";

export type ScoutingPayload = {
  run_at: string;
  user_name: string;
  flow_rate_ml_per_min: number | null;
  temperature_c: number | null;
  mobile_phase_a: string;
  mobile_phase_b: string;
  sample_diluent: string | null;
  comments: string | null;
  gradient: GradientStep[];
  run_list: RunListItem[];
};

export function useParameterScouting() {
  const qc = useQueryClient();
  const list = useServerFn(listParameterScoutingLogs);
  const create = useServerFn(createParameterScoutingLog);
  const update = useServerFn(updateParameterScoutingLog);
  const del = useServerFn(deleteParameterScoutingLog);
  const fetchCompounds = useServerFn(listCompounds);
  const addCompound = useServerFn(createCompound);

  const query = useQuery({
    queryKey: qk.parameterScouting.list(),
    queryFn: () => list(),
  });

  const compoundsQuery = useQuery({
    queryKey: qk.compounds.list(),
    queryFn: () => fetchCompounds(),
  });

  const createCompoundMut = useMutation({
    mutationFn: (name: string) => addCompound({ data: { name } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.compounds.all });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createMut = useMutation({
    mutationFn: (payload: ScoutingPayload) => create({ data: payload }),
    onSuccess: () => {
      toast.success("Entry saved");
      qc.invalidateQueries({ queryKey: qk.parameterScouting.all });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMut = useMutation({
    mutationFn: (payload: ScoutingPayload & { id: string }) =>
      update({ data: payload }),
    onSuccess: () => {
      toast.success("Entry updated");
      qc.invalidateQueries({ queryKey: qk.parameterScouting.all });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: qk.parameterScouting.all });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return {
    query,
    compoundsQuery,
    createCompoundMut,
    createMut,
    updateMut,
    deleteMut,
  };
}

export type { Compound };