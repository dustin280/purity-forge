import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { TimesheetProject } from "@/lib/timesheets.functions";

const ALL = "__all__";

export interface FiltersValue {
  from: string;
  to: string;
  project: string;
  q: string;
  mineOnly: boolean;
}

interface Props {
  value: FiltersValue;
  onChange: (v: FiltersValue) => void;
  projects: TimesheetProject[];
  showMineToggle?: boolean;
  onReset?: () => void;
}

export function FiltersCard({ value, onChange, projects, showMineToggle, onReset }: Props) {
  const update = (patch: Partial<FiltersValue>) => onChange({ ...value, ...patch });

  return (
    <Card className="mb-4">
      <CardContent className="pt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="grid gap-1.5">
          <Label htmlFor="f-from">From</Label>
          <Input
            id="f-from"
            type="date"
            value={value.from}
            onChange={(e) => update({ from: e.target.value })}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="f-to">To</Label>
          <Input
            id="f-to"
            type="date"
            value={value.to}
            onChange={(e) => update({ to: e.target.value })}
          />
        </div>
        <div className="grid gap-1.5">
          <Label>Project</Label>
          <Select
            value={value.project || ALL}
            onValueChange={(v) => update({ project: v === ALL ? "" : v })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All projects</SelectItem>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.name}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="f-q">Search</Label>
          <Input
            id="f-q"
            value={value.q}
            onChange={(e) => update({ q: e.target.value })}
            placeholder="Task, project, notes…"
          />
        </div>
        <div className="flex items-end gap-3">
          {showMineToggle && (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={value.mineOnly}
                onCheckedChange={(c) => update({ mineOnly: Boolean(c) })}
              />
              Only mine
            </label>
          )}
          {onReset && (
            <Button variant="ghost" size="sm" onClick={onReset}>
              Reset
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}