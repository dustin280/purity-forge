import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  createBackpressureLog,
  deleteBackpressureLog,
  listBackpressureLogs,
} from "@/lib/daily-backpressure.functions";
import { qk } from "@/lib/query-keys";

type CreatePayload = {
  reading_at: string;
  user_name: string;
  instrument: string;
  backpressure: number;
  backpressure_unit: string;
  notes: string | null;
};

export function useBackpressure() {
  const qc = useQueryClient();
  const list = useServerFn(listBackpressureLogs);
  const create = useServerFn(createBackpressureLog);
  const del = useServerFn(deleteBackpressureLog);

  const query = useQuery({ queryKey: qk.backpressure.list(), queryFn: () => list() });

  const createMut = useMutation({
    mutationFn: (payload: CreatePayload) => create({ data: payload }),
    onSuccess: () => {
      toast.success("Reading logged");
      qc.invalidateQueries({ queryKey: qk.backpressure.list() });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: qk.backpressure.list() });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return { query, createMut, deleteMut };
}