import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { createSample, listParameters } from "@/lib/lims.functions";
import { generateBatchId } from "@/lib/lims-utils";
import { qk } from "@/lib/query-keys";

export function useNewSampleForm() {
  const nav = useNavigate();
  const fn = useServerFn(createSample);
  const listParams = useServerFn(listParameters);
  const { data: allParams = [] } = useQuery({
    queryKey: qk.testParameters.list(),
    queryFn: () => listParams(),
  });
  const activeParams = allParams.filter(p => p.is_active);

  const [batch, setBatch] = useState(generateBatchId());
  const [client, setClient] = useState("");
  const [project, setProject] = useState("");
  const [receipt, setReceipt] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  function toggleParam(name: string) {
    setSelected(s => s.includes(name) ? s.filter(x => x !== name) : [...s, name]);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const s = await fn({ data: {
        batch_id: batch, client, project: project || null,
        receipt_date: receipt, notes: notes || null,
        parameters: selected,
      } });
      toast.success(`Sample ${s.batch_id} registered`);
      nav({ to: "/samples/$batchId", params: { batchId: s.batch_id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create sample");
    } finally { setBusy(false); }
  }

  function cancel() { nav({ to: "/samples" }); }

  return {
    activeParams,
    batch, setBatch, client, setClient, project, setProject,
    receipt, setReceipt, notes, setNotes, selected, busy,
    toggleParam, onSubmit, cancel,
  };
}