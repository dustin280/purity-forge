import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type SterilityData = {
  verdict: "pass" | "fail" | "inconclusive";
  method: string;
  media: string | null;
  notes: string | null;
};

export function SterilityFields({ onSave, busy }: { onSave: (data: SterilityData) => void; busy: boolean }) {
  const [verdict, setVerdict] = useState<SterilityData["verdict"]>("pass");
  const [method, setMethod] = useState("USP <71>");
  const [media, setMedia] = useState("");
  const [notes, setNotes] = useState("");

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted-foreground">Verdict</label>
          <Select value={verdict} onValueChange={v => setVerdict(v as SterilityData["verdict"])}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="pass">Pass</SelectItem>
              <SelectItem value="fail">Fail</SelectItem>
              <SelectItem value="inconclusive">Inconclusive</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Method</label>
          <Input value={method} onChange={e => setMethod(e.target.value)} placeholder="USP <71>" />
        </div>
      </div>
      <div>
        <label className="text-xs text-muted-foreground">Media</label>
        <Input value={media} onChange={e => setMedia(e.target.value)} placeholder="e.g. FTM / TSB" />
      </div>
      <div>
        <label className="text-xs text-muted-foreground">Notes</label>
        <Textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
      </div>
      <Button
        size="sm"
        disabled={busy || !method.trim()}
        onClick={() => onSave({ verdict, method: method.trim(), media: media.trim() || null, notes: notes.trim() || null })}
      >
        {busy ? "Saving…" : "Save Sterility Result"}
      </Button>
    </div>
  );
}
