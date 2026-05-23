type Tab = "info" | "results" | "coa";

export function SampleDetailTabs({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  return (
    <div className="flex gap-1 border-b border-border">
      {(["info", "results", "coa"] as const).map(t => (
        <button key={t} onClick={() => setTab(t)}
          className={`px-4 py-2 text-xs uppercase tracking-wider font-semibold border-b-2 -mb-px ${
            tab === t ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
          }`}>
          {t === "coa" ? "COA" : t}
        </button>
      ))}
    </div>
  );
}

export type { Tab as SampleDetailTab };