## Add a sequence selector to the Run List Generator

Right now `/run-lists/generate` renders every proposed sequence as its own card, each with its own "Generate Sequence CSV" button. When the optimizer proposes 3–4 sequences you have to eyeball them and click one — there's no way to say "only pull Sequence 1" up front.

### Change

In `src/routes/_authenticated/run-lists/generate.tsx`, add a compact selector bar that appears after `Analyze & propose` returns results:

- A row of toggle-style chips (one per proposed sequence) labeled `Seq 1`, `Seq 2`, … with the group / sample count underneath.
- Default: only the first sequence selected.
- "Select all" / "Select none" links on the right.
- Below the chips, only the checked sequences render their full table cards.
- Each visible card keeps its existing "Generate Sequence CSV" button (single-file download).
- When more than one is selected, also show a top-level **"Download selected (N)"** button that saves each CSV in turn (same server call per sequence, one file per download).

### Technical notes

- Selection state: `const [selected, setSelected] = useState<Set<number>>(new Set([1]))`, keyed by `seq.index`. Reset to `new Set([1])` inside `previewMut.onSuccess`.
- Filter `sequences` by `selected.has(seq.index)` before rendering the cards.
- Bulk download loops the existing `save` server fn per selected sequence, awaits each, and triggers the blob download the same way `saveMut.onSuccess` already does — reuse that download helper by extracting it into a small local function.
- No server-side / optimizer / schema changes; purely a UI addition.

### Out of scope

- Reordering sequences, editing rows within a sequence, or persisting the selection across navigations (URL search params) — none of that was asked for.