import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

export type DigestKey =
  | "digest_samples_received" | "digest_samples_due" | "digest_due_today"
  | "digest_sterility_readout" | "digest_endotoxin_due" | "digest_heavy_metals";

type Row = { id: string; name: string; email: string | null; is_active: boolean } & Record<DigestKey, boolean>;

const CATEGORIES: Array<{ key: DigestKey; label: string }> = [
  { key: "digest_due_today", label: "Due Today" },
  { key: "digest_samples_received", label: "Received" },
  { key: "digest_samples_due", label: "Samples Due" },
  { key: "digest_sterility_readout", label: "Sterility" },
  { key: "digest_endotoxin_due", label: "Endotoxin" },
  { key: "digest_heavy_metals", label: "Heavy Metals" },
];

/**
 * Per-recipient checkbox grid for the daily digest's six categories.
 * Reuses notification_recipients rows rather than a separate recipient
 * concept -- add/remove a person on the Notifications page, subscribe them
 * to digest categories here.
 */
export function DigestSubscriptionsList({
  rows, isLoading, onUpdate,
}: {
  rows: Row[];
  isLoading: boolean;
  onUpdate: (id: string, patch: Partial<Record<DigestKey, boolean>>) => void;
}) {
  const [filter, setFilter] = useState("");
  const filtered = rows.filter((r) => r.name.toLowerCase().includes(filter.toLowerCase()));

  return (
    <Card className="border-border overflow-hidden">
      <div className="p-3 border-b border-border">
        <Input
          placeholder={`Filter ${rows.length} recipients…`}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="h-8"
        />
      </div>
      {isLoading ? (
        <div className="p-6 text-sm text-muted-foreground">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="p-6 text-sm text-muted-foreground">
          No recipients match. Add people on the Notifications page.
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {filtered.map((r) => (
            <li key={r.id} className="px-4 py-3">
              <div className={`text-sm font-medium ${r.is_active ? "" : "text-muted-foreground line-through"}`}>
                {r.name}
              </div>
              <div className="text-xs text-muted-foreground mb-2">{r.email ?? "No email on file"}</div>
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                {CATEGORIES.map((c) => (
                  <label key={c.key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    {c.label}
                    <Switch
                      checked={r[c.key]}
                      disabled={!r.email}
                      onCheckedChange={(v) => onUpdate(r.id, { [c.key]: v })}
                    />
                  </label>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
