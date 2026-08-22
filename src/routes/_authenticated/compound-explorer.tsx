/**
 * Compound Explorer: browse the nc_compounds reference library, inspect
 * pre-computed 3D structures with residue highlighting, and load a
 * non-conformance scenario to see what changes structurally.
 */
import { useMemo, useState, useRef, useEffect, useCallback, lazy, Suspense } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Atom, Search, ShieldAlert, RotateCcw, Play, Pause } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { diffStructures, describeDiff } from "@/components/compound-explorer/structure-diff";
import { buildMorph } from "@/components/compound-explorer/morph";
const MoleculeViewer = lazy(() =>
  import("@/components/compound-explorer/molecule-viewer").then(m => ({ default: m.MoleculeViewer })),
);
import {
  listExplorerCompounds,
  getExplorerCompound,
  listCompoundScenarios,
  getVariantStructure,
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

/**
 * Postgres `numeric` can arrive as a string over the wire, so coerce before
 * formatting. Trimmed to 4 dp for the compact scenario list — the full-precision
 * value is still shown in the detail panel below.
 */
function formatMassDelta(v: number | string | null | undefined): string {
  if (v === null || v === undefined || v === "") return "";
  const n = Number(v);
  if (!Number.isFinite(n)) return "";
  return ` · ${n > 0 ? "+" : ""}${n.toFixed(4)} Da`;
}

function CompoundExplorer() {
  const list = useServerFn(listExplorerCompounds);
  const getOne = useServerFn(getExplorerCompound);
  const getScenarios = useServerFn(listCompoundScenarios);
  const getVariant = useServerFn(getVariantStructure);

  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeResidue, setActiveResidue] = useState<number | null>(null);
  const [focusKey, setFocusKey] = useState("none");
  const [scenarioId, setScenarioId] = useState<string | null>(null);

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

  const { data: scenarios = [] } = useQuery({
    queryKey: ["nc-explorer", "scenarios", selectedId],
    queryFn: () => getScenarios({ data: { compoundId: selectedId! } }),
    enabled: !!selectedId,
  });

  const { data: variant, isFetching: variantLoading } = useQuery({
    queryKey: ["nc-explorer", "variant", scenarioId],
    queryFn: () => getVariant({ data: { variantId: scenarioId! } }),
    enabled: !!scenarioId,
  });

  const nativeStructure = detail?.structure ?? null;
  const activeScenario = useMemo(
    () => scenarios.find(s => s.id === scenarioId) ?? null,
    [scenarios, scenarioId],
  );

  // The impurity structure supersedes the native one in the viewer once a
  // scenario is picked, but only after it has actually loaded — otherwise the
  // viewer would flash empty between the click and the fetch resolving.
  const shown = scenarioId && variant ? variant : nativeStructure;
  const residues = shown?.residues ?? [];

  const diff = useMemo(
    () => (scenarioId && variant ? diffStructures(nativeStructure, variant) : null),
    [scenarioId, variant, nativeStructure],
  );

  const morph = useMemo(
    () => (scenarioId && variant ? buildMorph(nativeStructure, variant) : null),
    [scenarioId, variant, nativeStructure],
  );

  const changeLines = useMemo(() => {
    if (!diff || !variant) return [];
    const byId = new Map(variant.atoms.map(a => [a.id, a.element]));
    return describeDiff(diff, id => byId.get(id));
  }, [diff, variant]);

  const highlighted = useMemo(() => {
    if (activeResidue === null) return new Set<number>();
    const r = residues.find(x => x.index === activeResidue);
    return new Set<number>(r?.atom_ids ?? []);
  }, [activeResidue, residues]);

  /* ---- transition playback -------------------------------------------- */
  /**
   * Progress lives in a ref, not state: the viewer samples it every frame, so
   * routing it through React would re-render a few hundred meshes per frame
   * for no reason. The slider is likewise driven by writing to its DOM node.
   */
  const progressRef = useRef(1);
  const sliderRef = useRef<HTMLInputElement>(null);
  const [playing, setPlaying] = useState(false);
  const TRANSITION_MS = 2600;

  const setProgress = useCallback((p: number) => {
    progressRef.current = p;
    if (sliderRef.current) sliderRef.current.value = String(p);
  }, []);

  useEffect(() => {
    if (!playing) return;
    let cancelled = false;
    let last = performance.now();
    let raf = 0;
    const step = (now: number) => {
      if (cancelled) return;
      const next = progressRef.current + (now - last) / TRANSITION_MS;
      last = now;
      if (next >= 1) {
        setProgress(1);
        setPlaying(false);
        return;
      }
      setProgress(next);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [playing, setProgress]);

  // Autoplay once a newly picked scenario's geometry has actually arrived.
  useEffect(() => {
    if (!morph) return;
    setProgress(0);
    setPlaying(true);
  }, [morph, setProgress]);

  const replay = () => {
    setProgress(0);
    setPlaying(true);
  };

  const resetToNative = () => {
    setPlaying(false);
    setProgress(1);
    setScenarioId(null);
    setActiveResidue(null);
  };

  const selectCompound = (id: string) => {
    setSelectedId(id);
    setActiveResidue(null);
    setFocusKey("none");
    setScenarioId(null);
  };

  const withStructure = scenarios.filter(s => s.has_structure);
  const withoutStructure = scenarios.filter(s => !s.has_structure);

  return (
    <div className="flex flex-col lg:flex-row h-[calc(100vh-3.5rem)] lg:h-screen">
      <aside
        className={`${selectedId ? "hidden lg:flex" : "flex"} w-full lg:w-72 shrink-0 border-r border-border flex-col min-h-0`}
      >
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
              onClick={() => selectCompound(c.id)}
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

      <main className={`${selectedId ? "flex" : "hidden lg:flex"} flex-1 min-w-0 min-h-0 flex-col`}>
        {!selectedId && (
          <div className="flex-1 grid place-items-center text-muted-foreground text-sm">
            Select a compound to view its 3D structure.
          </div>
        )}
        {selectedId && (
          <>
            <div className="px-5 py-3 border-b border-border flex items-center gap-3 flex-wrap">
              <Button
                size="icon"
                variant="ghost"
                className="lg:hidden -ml-2 shrink-0"
                onClick={() => {
                  setSelectedId(null);
                  resetToNative();
                }}
              >
                <ArrowLeft className="size-4" />
              </Button>
              <h1 className="text-lg font-semibold truncate">{detail?.compound?.name ?? "…"}</h1>
              {activeScenario ? (
                <Badge className="bg-[#ff2d55] hover:bg-[#ff2d55] text-white gap-1">
                  <ShieldAlert className="size-3" />
                  {activeScenario.impurity_code ?? "Impurity"}
                </Badge>
              ) : (
                <Badge variant="secondary">Native</Badge>
              )}
              {detail?.compound?.review_flag && !activeScenario && (
                <Badge variant="outline">{detail.compound.review_flag}</Badge>
              )}
              {shown && (
                <span className="text-xs text-muted-foreground ml-auto">
                  {shown.atoms.length} atoms · {shown.bonds.length} bonds
                </span>
              )}
            </div>

            <div className="flex-1 min-h-0 flex flex-col xl:flex-row">
              <div className="flex-1 min-h-[320px] relative bg-[#0b0f14]">
                {isFetching && !nativeStructure && (
                  <div className="absolute inset-0 grid place-items-center text-sm text-white/70">
                    Loading structure…
                  </div>
                )}
                {!isFetching && !nativeStructure && (
                  <div className="absolute inset-0 grid place-items-center text-sm text-white/70">
                    No 3D structure available for this compound.
                  </div>
                )}
                {shown && shown.atoms.length > 0 && (
                  <Suspense
                    fallback={
                      <div className="absolute inset-0 grid place-items-center text-sm text-white/70">
                        Loading viewer…
                      </div>
                    }
                  >
                    <MoleculeViewer
                      key={selectedId}
                      atoms={shown.atoms}
                      bonds={shown.bonds}
                      highlighted={highlighted}
                      focusKey={focusKey}
                      changed={diff?.highlight}
                      morph={morph}
                      progressRef={progressRef}
                    />
                  </Suspense>
                )}
                {activeScenario && (
                  <div className="absolute inset-x-3 bottom-3 flex flex-col gap-2">
                    {morph && (
                      <div className="rounded-md bg-black/55 backdrop-blur px-3 py-2 space-y-1.5">
                        <div className="flex items-center gap-2">
                          <Button
                            size="icon"
                            variant="secondary"
                            className="size-7 shrink-0"
                            onClick={() => (playing ? setPlaying(false) : replay())}
                            title={playing ? "Pause" : "Replay transition"}
                          >
                            {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
                          </Button>
                          <span className="text-[10px] uppercase tracking-wider text-white/60 w-11">
                            Native
                          </span>
                          <input
                            ref={sliderRef}
                            type="range"
                            min={0}
                            max={1}
                            step={0.001}
                            defaultValue={1}
                            onChange={e => {
                              setPlaying(false);
                              setProgress(Number(e.target.value));
                            }}
                            className="flex-1 h-1 accent-[#ff2d55] cursor-pointer"
                            aria-label="Transition progress from native to impurity"
                          />
                          <span className="text-[10px] uppercase tracking-wider text-white/60 w-12 text-right">
                            Impurity
                          </span>
                        </div>
                        {morph.mode === "crossfade" && (
                          <div className="text-[10px] text-amber-300/90 leading-snug">
                            Geometry was re-optimised for this variant, so the two forms share no
                            common frame — showing a dissolve between them rather than inventing
                            atom motion.
                          </div>
                        )}
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="secondary" onClick={resetToNative} className="gap-1.5">
                        <RotateCcw className="size-3.5" /> Back to native
                      </Button>
                      {variantLoading && <span className="text-xs text-white/70">Loading variant…</span>}
                    </div>
                  </div>
                )}
              </div>

              <div className="w-full xl:w-96 shrink-0 border-t xl:border-t-0 xl:border-l border-border overflow-y-auto p-4 space-y-4">
                {scenarios.length > 0 && (
                  <Card className="p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-sm font-semibold flex items-center gap-1.5">
                        <ShieldAlert className="size-4" /> Non-conformance
                      </div>
                      {activeScenario && (
                        <Button size="sm" variant="ghost" onClick={resetToNative}>
                          Clear
                        </Button>
                      )}
                    </div>
                    <div className="space-y-1">
                      {withStructure.map(s => (
                        <button
                          key={s.id}
                          onClick={() => {
                            setScenarioId(s.id);
                            setActiveResidue(null);
                          }}
                          className={`w-full text-left px-2.5 py-2 rounded-md text-xs border transition-colors ${
                            scenarioId === s.id
                              ? "border-[#ff2d55] bg-[#ff2d55]/10"
                              : "border-border hover:bg-muted"
                          }`}
                        >
                          <div className="font-medium">{s.name}</div>
                          <div className="text-muted-foreground mt-0.5">
                            {s.impurity_code}
                            {s.formula_delta ? ` · ${s.formula_delta}` : ""}
                            {formatMassDelta(s.mass_delta)}
                          </div>
                        </button>
                      ))}
                      {withoutStructure.length > 0 && (
                        <div className="pt-2 mt-1 border-t border-border/50">
                          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
                            No 3D model — reference only
                          </div>
                          {withoutStructure.map(s => (
                            <div
                              key={s.id}
                              className="px-2.5 py-1.5 text-xs text-muted-foreground"
                              title={s.structure_change ?? undefined}
                            >
                              <span className="font-medium">{s.name}</span>
                              {s.impurity_code ? ` · ${s.impurity_code}` : ""}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </Card>
                )}

                {activeScenario && (
                  <Card className="p-3 border-[#ff2d55]/40">
                    <div className="text-sm font-semibold mb-2">Structural change</div>
                    {diff ? (
                      <ul className="space-y-1 mb-3">
                        {changeLines.map((line, i) => (
                          <li key={i} className="text-xs flex items-start gap-1.5">
                            <span className="mt-1 size-1.5 rounded-full bg-[#ff2d55] shrink-0" />
                            <span>{line}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="text-xs text-muted-foreground mb-3">
                        {variantLoading ? "Loading…" : "Comparison unavailable."}
                      </div>
                    )}
                    {diff && diff.highlight.size > 0 && (
                      <div className="text-[11px] text-muted-foreground mb-3">
                        Highlighted in the viewer: {diff.highlight.size} affected atom
                        {diff.highlight.size > 1 ? "s" : ""}.
                      </div>
                    )}
                    <Prop label="Category" value={activeScenario.category} />
                    <Prop label="Evidence" value={activeScenario.evidence_level} />
                    <Prop label="Change" value={activeScenario.structure_change} />
                    <Prop label="Pathway" value={activeScenario.formation_pathway} />
                    <Prop label="Formula" value={activeScenario.molecular_formula} />
                    <Prop label="Formula Δ" value={activeScenario.formula_delta} />
                    <Prop label="Mass Δ" value={activeScenario.mass_delta} />
                    <Prop label="m/z (1+)" value={activeScenario.mz_1plus} />
                    <Prop label="m/z (2+)" value={activeScenario.mz_2plus} />
                    <Prop label="RP-HPLC" value={activeScenario.rp_hplc_behavior} />
                    <Prop label="DAD discriminator" value={activeScenario.dad_discriminator} />
                    <Prop label="LC-MS discriminator" value={activeScenario.lc_ms_discriminator} />
                    <Prop label="Likely trigger" value={activeScenario.likely_trigger} />
                    <Prop label="Notes" value={activeScenario.notes} />
                  </Card>
                )}

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
                  <div className="text-sm font-semibold mb-2">
                    Chemical properties
                    {activeScenario && (
                      <span className="font-normal text-muted-foreground"> · native form</span>
                    )}
                  </div>
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
