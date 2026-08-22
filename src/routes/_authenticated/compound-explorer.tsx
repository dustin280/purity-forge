/**
 * Compound Explorer: browse the nc_compounds reference library and inspect
 * pre-computed 3D structures with residue highlighting and chemical properties.
 */
import { useMemo, useState, lazy, Suspense } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Atom, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { MoleculeViewer } from "@/components/compound-explorer/molecule-viewer";
import {
  listExplorerCompounds,
  getExplorerCompound,
} from "@/lib/nc-structures.functions";

export const Route = createFileRoute("/_authenticated/compound-explorer")({
  component: CompoundExplorer,
});

function Prop({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="grid grid-cols-[9rem_1fr] gap-2 py-1 text-sm border-b border-border/50 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="break-words">{value}</span>
    </div>
  );
}

function CompoundExplorer() {
  const list = useServerFn(listExplorerCompounds);
  const getOne = useServerFn(getExplorerCompound);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeResidue, setActiveResidue] = useState<number | null>(null);
  const [focusKey, setFocusKey] = useState("none");

  const { data: compounds = [], isLoading } = useQuery({
    queryKey: ["nc-explorer", "list"],
    queryFn: () => list(),
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return compounds;
    return compounds.filter(
      c => c.name.toLowerCase().includes(q) || (c.class ?? "").toLowerCase().includes(q),
    );
  }, [compounds, search]);

  const { data: detail, isFetching } = useQuery({
    queryKey: ["nc-explorer", "detail", selectedId],
    queryFn: () => getOne({ data: { id: selectedId! } }),
    enabled: !!selectedId,
  });

  const structure = detail?.structure ?? null;
  const residues = structure?.residues ?? [];

  const highlighted = useMemo(() => {
    if (activeResidue === null) return new Set<number>();
    const r = residues.find(x => x.index === activeResidue);
    return new Set<number>(r?.atom_ids ?? []);
  }, [activeResidue, residues]);

  return (
    <div className="flex h-[calc(100vh-3.5rem)] lg:h-screen">
      <aside className="w-72 shrink-0 border-r border-border flex flex-col">
        <div className="p-4 border-b border-border space-y-3">
          <div className="flex items-center gap-2 font-semibold">
            <Atom className="size-4" /> Compound Explorer
          </div>
          <div className="relative">
            <Search className="size-4 absolute left-2 top-2.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search name or class"
              className="pl-8"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {isLoading && <div className="p-3 text-sm text-muted-foreground">Loading…</div>}
          {!isLoading && filtered.length === 0 && (
            <div className="p-3 text-sm text-muted-foreground">No compounds match.</div>
          )}
          {filtered.map(c => (
            <button
              key={c.id}
              onClick={() => {
                setSelectedId(c.id);
                setActiveResidue(null);
                setFocusKey("none");
              }}
              className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                selectedId === c.id ? "bg-accent text-accent-foreground" : "hover:bg-muted"
              }`}
            >
              <div className="font-medium truncate">{c.name}</div>
              <div className="text-xs text-muted-foreground truncate">
                {c.class ?? "—"}
                {c.molecular_formula ? ` · ${c.molecular_formula}` : ""}
              </div>
            </button>
          ))}
        </div>
      </aside>

      <main className="flex-1 min-w-0 flex flex-col">
        {!selectedId && (
          <div className="flex-1 grid place-items-center text-muted-foreground text-sm">
            Select a compound to view its 3D structure.
          </div>
        )}
        {selectedId && (
          <>
            <div className="px-5 py-3 border-b border-border flex items-center gap-3">
              <h1 className="text-lg font-semibold truncate">{detail?.compound?.name ?? "…"}</h1>
              {detail?.compound?.class && <Badge variant="secondary">{detail.compound.class}</Badge>}
              {detail?.compound?.review_flag && (
                <Badge variant="outline">{detail.compound.review_flag}</Badge>
              )}
              {structure && (
                <span className="text-xs text-muted-foreground ml-auto">
                  {structure.atoms.length} atoms · {structure.bonds.length} bonds
                </span>
              )}
            </div>

            <div className="flex-1 min-h-0 flex flex-col xl:flex-row">
              <div className="flex-1 min-h-[320px] relative bg-[#0b0f14]">
                {isFetching && !structure && (
                  <div className="absolute inset-0 grid place-items-center text-sm text-white/70">
                    Loading structure…
                  </div>
                )}
                {!isFetching && !structure && (
                  <div className="absolute inset-0 grid place-items-center text-sm text-white/70">
                    No 3D structure available for this compound.
                  </div>
                )}
                {structure && structure.atoms.length > 0 && (
                  <MoleculeViewer
                    key={selectedId}
                    atoms={structure.atoms}
                    bonds={structure.bonds}
                    highlighted={highlighted}
                    focusKey={focusKey}
                  />
                )}
              </div>

              <div className="w-full xl:w-96 shrink-0 border-t xl:border-t-0 xl:border-l border-border overflow-y-auto p-4 space-y-4">
                {residues.length > 0 && (
                  <Card className="p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-sm font-semibold">Residues</div>
                      {activeResidue !== null && (
                        <Button size="sm" variant="ghost" onClick={() => setActiveResidue(null)}>
                          Clear
                        </Button>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {residues.map(r => (
                        <button
                          key={r.index}
                          onClick={() => {
                            setActiveResidue(r.index);
                            setFocusKey(`${r.index}-${Date.now()}`);
                          }}
                          className={`px-2 py-1 rounded-md text-xs border transition-colors ${
                            activeResidue === r.index
                              ? "bg-primary text-primary-foreground border-primary"
                              : "border-border hover:bg-muted"
                          }`}
                          title={`${r.atom_ids.length} atoms`}
                        >
                          {r.index + 1} · {r.code}
                        </button>
                      ))}
                    </div>
                  </Card>
                )}

                <Card className="p-3">
                  <div className="text-sm font-semibold mb-2">Chemical properties</div>
                  <Prop label="Molecular formula" value={detail?.compound?.molecular_formula} />
                  <Prop label="Monoisotopic mass" value={detail?.compound?.monoisotopic_mass} />
                  <Prop label="m/z (1+)" value={detail?.compound?.mz_1plus} />
                  <Prop label="m/z (2+)" value={detail?.compound?.mz_2plus} />
                  <Prop label="CAS number" value={detail?.compound?.cas_number} />
                  <Prop label="Class" value={detail?.compound?.class} />
                  <Prop label="Sequence" value={detail?.compound?.sequence_composition} />
                  <Prop label="AA composition" value={detail?.compound?.amino_acid_composition} />
                  <Prop label="Key chromophores" value={detail?.compound?.key_chromophores} />
                  <Prop label="DAD primary" value={detail?.compound?.dad_primary} />
                  <Prop label="DAD secondary" value={detail?.compound?.dad_secondary} />
                  <Prop label="DAD guidance" value={detail?.compound?.dad_guidance} />
                  <Prop label="Form notes" value={detail?.compound?.form_notes} />
                  <Prop label="Review flag" value={detail?.compound?.review_flag} />
                  <Prop label="Source" value={detail?.compound?.source_url} />
                </Card>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
