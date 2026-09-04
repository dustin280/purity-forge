import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  createBackpressureLog,
  deleteBackpressureLog,
  listBackpressureLogs,
  type BackpressureListFilters,
} from "@/lib/daily-backpressure.functions";
import { qk } from "@/lib/query-keys";

type CreatePayload = {
  reading_at: string;
  user_name: string;
  instrument: string;
  backpressure: number;
  backpressure_unit: string;
  notes: string | null;
  injections_count: number | null;
  mobile_phase: string | null;
  flow_rate: number | null;
  flow_rate_unit: string | null;
  column_temp: number | null;
  column_temp_unit: string | null;
  column_name: string | null;
};

/** Rows for one date range (null = nothing to fetch yet), plus create/delete. */
export function useBackpressure(filters: BackpressureListFilters | null) {
  const qc = useQueryClient();
  const list = useServerFn(listBackpressureLogs);
  const create = useServerFn(createBackpressureLog);
  const del = useServerFn(deleteBackpressureLog);

  const query = useQuery({
    queryKey: qk.backpressure.list(filters),
    queryFn: () => {
      if (!filters) throw new Error("Pick a date range");
      return list({ data: filters });
    },
    enabled: filters !== null,
  });

  const createMut = useMutation({
    mutationFn: (payload: CreatePayload) => create({ data: payload }),
    onSuccess: () => {
      toast.success("Reading logged");
      qc.invalidateQueries({ queryKey: qk.backpressure.all });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: qk.backpressure.all });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return { query, createMut, deleteMut };
}
