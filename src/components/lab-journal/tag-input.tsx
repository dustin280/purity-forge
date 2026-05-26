import { useState, type KeyboardEvent } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";

export interface TagInputProps {
  value: string[];
  onChange: (next: string[]) => void;
  maxTags?: number;
  maxLen?: number;
  placeholder?: string;
}

function normalize(t: string) {
  return t.trim().replace(/^#+/, "").slice(0, 40);
}

export function TagInput({
  value,
  onChange,
  maxTags = 20,
  maxLen = 40,
  placeholder = "Add tag, press Enter…",
}: TagInputProps) {
  const [draft, setDraft] = useState("");

  const commit = (raw: string) => {
    const parts = raw
      .split(/[,\n]/)
      .map(normalize)
      .filter(Boolean);
    if (!parts.length) return;
    const next = [...value];
    for (const p of parts) {
      if (next.length >= maxTags) break;
      const t = p.slice(0, maxLen);
      if (!next.includes(t)) next.push(t);
    }
    onChange(next);
    setDraft("");
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commit(draft);
    } else if (e.key === "Backspace" && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  };

  const remove = (t: string) => onChange(value.filter((x) => x !== t));

  return (
    <div className="flex flex-wrap gap-1.5 items-center rounded-md border bg-background px-2 py-1.5 min-h-9 focus-within:ring-2 focus-within:ring-ring">
      {value.map((t) => (
        <Badge
          key={t}
          variant="secondary"
          className="gap-1 pl-2 pr-1 font-normal"
        >
          #{t}
          <button
            type="button"
            onClick={() => remove(t)}
            className="hover:text-destructive"
            aria-label={`Remove ${t}`}
          >
            <X className="size-3" />
          </button>
        </Badge>
      ))}
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKey}
        onBlur={() => draft && commit(draft)}
        placeholder={value.length >= maxTags ? "" : placeholder}
        disabled={value.length >= maxTags}
        maxLength={maxLen}
        className="flex-1 min-w-32 border-0 shadow-none px-1 h-7 focus-visible:ring-0"
      />
    </div>
  );
}