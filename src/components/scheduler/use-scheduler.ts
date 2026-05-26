import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  listInstruments,
  adminUpsertInstrument,
  adminDeleteInstrument,
  type Instrument,
} from "@/lib/instruments.functions";
import {
  listBookings,
  createBooking,
  updateBooking,
  deleteBooking,
  type InstrumentBooking,
} from "@/lib/instrument-bookings.functions";
import { qk } from "@/lib/query-keys";

export function useInstruments() {
  const qc = useQueryClient();
  const list = useServerFn(listInstruments);
  const upsert = useServerFn(adminUpsertInstrument);
  const del = useServerFn(adminDeleteInstrument);

  const query = useQuery({
    queryKey: qk.instruments.list(),
    queryFn: () => list(),
  });

  const upsertMut = useMutation({
    mutationFn: (payload: {
      id?: string;
      name: string;
      location?: string | null;
      notes?: string | null;
      is_active?: boolean;
    }) => upsert({ data: payload }),
    onSuccess: () => {
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: qk.instruments.all });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: qk.instruments.all });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return { query, upsertMut, deleteMut };
}

export function useBookings(
  fromISO: string,
  toISO: string,
  instrumentId: string | null,
) {
  const qc = useQueryClient();
  const list = useServerFn(listBookings);
  const create = useServerFn(createBooking);
  const update = useServerFn(updateBooking);
  const del = useServerFn(deleteBooking);

  const query = useQuery({
    queryKey: qk.instrumentBookings.list(fromISO, toISO, instrumentId),
    queryFn: () =>
      list({ data: { from: fromISO, to: toISO, instrumentId } }),
  });

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: qk.instrumentBookings.all });

  const createMut = useMutation({
    mutationFn: (payload: {
      instrument_id: string;
      user_name: string;
      starts_at: string;
      ends_at: string;
      purpose: string;
      notes?: string | null;
    }) => create({ data: payload }),
    onSuccess: () => {
      toast.success("Booking saved");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMut = useMutation({
    mutationFn: (payload: {
      id: string;
      instrument_id?: string;
      starts_at?: string;
      ends_at?: string;
      purpose?: string;
      notes?: string | null;
    }) => update({ data: payload }),
    onSuccess: () => {
      toast.success("Booking updated");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      toast.success("Booking deleted");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return { query, createMut, updateMut, deleteMut };
}

export type { Instrument, InstrumentBooking };

/** Stable hue per instrument id, derived from a tiny string hash. */
export function instrumentHue(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) >>> 0;
  }
  return h % 360;
}