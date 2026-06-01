import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import type { TimesheetEntry, TimesheetProject } from "@/lib/timesheets.functions";

export interface EntryFormValues {
  entry_date: string;
  project: string;
  task_description: string;
  duration_hours: number;
  start_time: string | null;
  end_time: string | null;
  notes: string | null;
  user_name: string;
}

function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function hoursBetween(start: string, end: string): number | null {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  if ([sh, sm, eh, em].some((n) => Number.isNaN(n))) return null;
  const diff = (eh * 60 + em - (sh * 60 + sm)) / 60;
  return diff > 0 ? Number(diff.toFixed(2)) : null;
}

const OTHER = "__other__";

interface Props {
  defaultDate?: string;
  defaultUserName: string;
  projects: TimesheetProject[];
  initial?: TimesheetEntry | null;
  loading?: boolean;
  onSubmit: (v: EntryFormValues) => void;
  onCancel?: () => void;
  compact?: boolean;
}

export function EntryForm({
  defaultDate,
  defaultUserName,
  projects,
  initial,
  loading,
  onSubmit,
  onCancel,
  compact,
}: Props) {
  const activeProjects = projects.filter((p) => p.is_active);
  const initialProject = initial?.project ?? "";
  const projectInList = activeProjects.some((p) => p.name === initialProject);

  const [date, setDate] = useState(initial?.entry_date ?? defaultDate ?? todayISO());
  const [projectSelect, setProjectSelect] = useState(
    initialProject ? (projectInList ? initialProject : OTHER) : "",
  );
  const [projectCustom, setProjectCustom] = useState(
    initialProject && !projectInList ? initialProject : "",
  );
  const [task, setTask] = useState(initial?.task_description ?? "");
  const [duration, setDuration] = useState(
    initial?.duration_hours != null ? String(initial.duration_hours) : "",
  );
  const [start, setStart] = useState(initial?.start_time?.slice(0, 5) ?? "");
  const [end, setEnd] = useState(initial?.end_time?.slice(0, 5) ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");

  // Auto-compute duration when both times are set and duration is empty
  useEffect(() => {
    if (start && end) {
      const h = hoursBetween(start, end);
      if (h != null) setDuration(String(h));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start, end]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const project = projectSelect === OTHER ? projectCustom.trim() : projectSelect;
    if (!project) return toast.error("Please choose or enter a project");
    if (!task.trim()) return toast.error("Task description is required");
    const d = Number(duration);
    if (!Number.isFinite(d) || d <= 0 || d > 24)
      return toast.error("Duration must be between 0 and 24 hours");

    onSubmit({
      entry_date: date,
      project,
      task_description: task.trim(),
      duration_hours: d,
      start_time: start || null,
      end_time: end || null,
      notes: notes.trim() || null,
      user_name: defaultUserName || "Unknown",
    });
  };

  return (
    <Card>
      <CardHeader className={compact ? "pb-3" : undefined}>
        <CardTitle className="text-base">{initial ? "Edit entry" : "Add entry"}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="ts-date">Date</Label>
            <Input
              id="ts-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Project</Label>
            <Select value={projectSelect} onValueChange={setProjectSelect}>
              <SelectTrigger>
                <SelectValue placeholder="Select a project" />
              </SelectTrigger>
              <SelectContent>
                {activeProjects.map((p) => (
                  <SelectItem key={p.id} value={p.name}>
                    {p.name}
                  </SelectItem>
                ))}
                <SelectItem value={OTHER}>Other…</SelectItem>
              </SelectContent>
            </Select>
            {projectSelect === OTHER && (
              <Input
                placeholder="Enter project name"
                value={projectCustom}
                onChange={(e) => setProjectCustom(e.target.value)}
              />
            )}
          </div>
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="ts-task">Task description</Label>
            <Input
              id="ts-task"
              value={task}
              onChange={(e) => setTask(e.target.value)}
              placeholder="What did you work on?"
              required
            />
          </div>
          <div className="grid grid-cols-3 gap-2 sm:col-span-2">
            <div className="grid gap-1.5">
              <Label htmlFor="ts-start">Start (optional)</Label>
              <Input
                id="ts-start"
                type="time"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ts-end">End (optional)</Label>
              <Input
                id="ts-end"
                type="time"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ts-dur">Hours</Label>
              <Input
                id="ts-dur"
                type="number"
                step="0.25"
                min="0.01"
                max="24"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                placeholder="2.5"
                required
              />
            </div>
          </div>
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="ts-notes">Notes (optional)</Label>
            <Textarea
              id="ts-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" disabled={loading}>
              {loading ? "Saving…" : initial ? "Save changes" : "Add entry"}
            </Button>
            {onCancel && (
              <Button type="button" variant="ghost" onClick={onCancel}>
                Cancel
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}