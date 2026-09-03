import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

export interface StreamOption {
  name: string;
  units: string;
  label: string | null;
}

export const DEFAULT_STREAMS = ["DAD1A", "PMP1B_Pressure"];

export function isDadSignal(name: string): boolean {
  return /^DAD1[A-H]$/.test(name);
}

export function streamDisplayName(name: string, label: string | null | undefined): string {
  const base = name
    .replace(/^PMP1[A-Z]_/, "")
    .replace(/^THM1[A-Z]_/, "")
    .replace(/^WPS1[A-Z]_/, "")
    .replace(/^DAD1[T-V]_/, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2");
  if (isDadSignal(name)) return label ? `${name} · ${label}` : name;
  return label ? `${base} · ${label}` : base;
}

function groupOf(name: string): "Detector" | "Pump" | "Temperatures" | "Other" {
  if (isDadSignal(name)) return "Detector";
  if (name.startsWith("PMP1")) return "Pump";
  if (/Temp/i.test(name)) return "Temperatures";
  return "Other";
}

export function StreamPicker({
  options,
  selected,
  onChange,
}: {
  options: StreamOption[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const groups = new Map<string, StreamOption[]>();
  for (const o of options) {
    const g = groupOf(o.name);
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(o);
  }
  const order = ["Detector", "Pump", "Temperatures", "Other"];

  function toggle(name: string, on: boolean) {
    onChange(on ? [...selected, name] : selected.filter((s) => s !== name));
  }

  if (options.length === 0) {
    return <div className="text-xs text-muted-foreground">No streams reported yet.</div>;
  }

  return (
    <div className="flex flex-wrap gap-x-6 gap-y-3">
      {order
        .filter((g) => groups.has(g))
        .map((g) => (
          <div key={g}>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">
              {g}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {groups.get(g)!.map((o) => {
                const id = `stream-${o.name}`;
                return (
                  <div key={o.name} className="flex items-center gap-1.5">
                    <Checkbox
                      id={id}
                      checked={selected.includes(o.name)}
                      onCheckedChange={(v) => toggle(o.name, v === true)}
                    />
                    <Label htmlFor={id} className="text-xs font-normal cursor-pointer">
                      {streamDisplayName(o.name, o.label)}
                      {o.units ? <span className="text-muted-foreground"> ({o.units})</span> : null}
                    </Label>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
    </div>
  );
}
