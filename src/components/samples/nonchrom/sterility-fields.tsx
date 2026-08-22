import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type SterilityData = {
  ftm_result: "clear" | "turbid";
  tsb_result: "clear" | "turbid";
  method: string;
  notes: string | null;
};

// FTM and TSB are read independently — growth (turbidity) in either tube
// fails the sample, computed server-side in saveNonchromResult.
export function SterilityFields({ onSave, busy }: { onSave: (data: SterilityData) => void; busy: boolean }) {
  const [ftmResult, setFtmResult] = useState<SterilityData["ftm_result"]>("clear");
  const [tsbResult, setTsbResult] = useState<SterilityData["tsb_result"]>("clear");
  const [method, setMethod] = useState("USP <71>");
  const [notes, setNotes] = useState("");

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted-foreground">FTM tube</label>
          <Select value={ftmResult} onValueChange={v => setFtmResult(v as SterilityData["ftm_result"])}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="clear">Clear (no growth)</SelectItem>
              <SelectItem value="turbid">Turbid (growth)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">TSB tube</label>
          <Select value={tsbResult} onValueChange={v => setTsbResult(v as SterilityData["tsb_result"])}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="clear">Clear (no growth)</SelectItem>
              <SelectItem value="turbid">Turbid (growth)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <label className="text-xs text-muted-foreground">Method</label>
        <Input value={method} onChange={e => setMethod(e.target.value)} placeholder="USP <71>" />
      </div>
      <div>
        <label className="text-xs text-muted-foreground">Notes</label>
        <Textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
      </div>
      <Button
        size="sm"
        disabled={busy || !method.trim()}
        onClick={() => onSave({ ftm_result: ftmResult, tsb_result: tsbResult, method: method.trim(), notes: notes.trim() || null })}
      >
        {busy ? "Saving…" : "Save Sterility Result"}
      </Button>
    </div>
  );
}
