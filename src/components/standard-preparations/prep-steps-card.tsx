import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";
import { Field } from "./prep-form-field";
import type { UsePrepFormReturn } from "./use-prep-form";

export function PrepStepsCard({ f }: { f: UsePrepFormReturn }) {
  const { v, up, addStep, updateStep, removeStep } = f;
  return (
    <Card className="p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Preparation Steps</h2>
        <Button type="button" size="sm" variant="outline" onClick={addStep}>
          <Plus className="size-4 mr-1" /> Add step
        </Button>
      </div>
      <div className="space-y-2">
        {v.preparation_steps.map((step, idx) => (
          <div key={idx} className="grid grid-cols-12 gap-2 items-start">
            <div className="col-span-1 pt-2 text-center text-sm font-mono text-muted-foreground">{idx + 1}</div>
            <Textarea className="col-span-12 md:col-span-5" rows={2} value={step.description} onChange={e => updateStep(idx, { description: e.target.value })} placeholder="Step description" maxLength={2000} />
            <Input className="col-span-6 md:col-span-2" value={step.amount} onChange={e => updateStep(idx, { amount: e.target.value })} placeholder="Amount" maxLength={255} />
            <Input className="col-span-6 md:col-span-2" value={step.instrument_id} onChange={e => updateStep(idx, { instrument_id: e.target.value })} placeholder="Balance / pipette ID" maxLength={255} />
            <Input className="col-span-11 md:col-span-1" value={step.time} onChange={e => updateStep(idx, { time: e.target.value })} placeholder="Time" maxLength={255} />
            <Button type="button" size="icon" variant="ghost" onClick={() => removeStep(idx)} className="col-span-1 text-muted-foreground hover:text-destructive">
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
      </div>
      <Field label="Sonication / vortex / heating details">
        <Textarea value={v.mixing_details} onChange={e => up("mixing_details", e.target.value)} rows={2} maxLength={2000} placeholder="e.g. Vortex 30s, sonicate 5 min at 25 °C" />
      </Field>
    </Card>
  );
}