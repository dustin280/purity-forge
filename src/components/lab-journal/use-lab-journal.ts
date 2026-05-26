import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  createLabJournalEntry,
  deleteLabJournalEntry,
  listLabJournalEntries,
  updateLabJournalEntry,
  type LabJournalEntry,
} from "@/lib/lab-journal.functions";
import { qk } from "@/lib/query-keys";

export type CreatePayload = {
  entry_at: string;
  user_name: string;
  title: string | null;
  body: string;
  tags?: string[];
};

export type UpdatePayload = {
  id: string;
  entry_at?: string;
  title?: string | null;
  body?: string;
  tags?: string[];
};

export function useLabJournal() {
  const qc = useQueryClient();
  const list = useServerFn(listLabJournalEntries);
  const create = useServerFn(createLabJournalEntry);
  const update = useServerFn(updateLabJournalEntry);
  const del = useServerFn(deleteLabJournalEntry);

  const query = useQuery({
    queryKey: qk.labJournal.list(),
    queryFn: () => list(),
  });

  const createMut = useMutation({
    mutationFn: (payload: CreatePayload) => create({ data: payload }),
    onSuccess: () => {
      toast.success("Entry saved");
      qc.invalidateQueries({ queryKey: qk.labJournal.all });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMut = useMutation({
    mutationFn: (payload: UpdatePayload) => update({ data: payload }),
    onSuccess: () => {
      toast.success("Entry updated");
      qc.invalidateQueries({ queryKey: qk.labJournal.all });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: qk.labJournal.all });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return { query, createMut, updateMut, deleteMut };
}

export type { LabJournalEntry };