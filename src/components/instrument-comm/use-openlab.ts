import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  getOpenLabMethod,
  getOpenLabSequence,
  getOpenLabSettings,
  listOpenLabMethods,
  listOpenLabSequences,
  listOpenLabReports,
} from "@/lib/openlab.functions";
import { qk } from "@/lib/query-keys";

export function useOpenLabSettings() {
  const fn = useServerFn(getOpenLabSettings);
  return useQuery({ queryKey: qk.openlab.settings, queryFn: () => fn() });
}
export function useOpenLabMethods(instrumentId?: string | null) {
  const fn = useServerFn(listOpenLabMethods);
  return useQuery({
    queryKey: [...qk.openlab.methods, instrumentId ?? null],
    queryFn: () => fn({ data: instrumentId ? { instrument_id: instrumentId } : {} }),
  });
}
export function useOpenLabSequences(instrumentId?: string | null) {
  const fn = useServerFn(listOpenLabSequences);
  return useQuery({
    queryKey: [...qk.openlab.sequences, instrumentId ?? null],
    queryFn: () => fn({ data: instrumentId ? { instrument_id: instrumentId } : {} }),
  });
}
export function useOpenLabMethod(name: string | null) {
  const fn = useServerFn(getOpenLabMethod);
  return useQuery({
    queryKey: qk.openlab.method(name ?? ""),
    queryFn: () => fn({ data: { name: name! } }),
    enabled: !!name,
  });
}
export function useOpenLabSequence(name: string | null) {
  const fn = useServerFn(getOpenLabSequence);
  return useQuery({
    queryKey: qk.openlab.sequence(name ?? ""),
    queryFn: () => fn({ data: { name: name! } }),
    enabled: !!name,
  });
}
export function useOpenLabReports() {
  const fn = useServerFn(listOpenLabReports);
  return useQuery({ queryKey: qk.openlab.reports, queryFn: () => fn() });
}