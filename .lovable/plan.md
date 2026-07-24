## Phase 1B — Method-Driven New Preparation Wizard

Phase 1A shipped the master-data foundation (analytes, methods + revisions, calibration, prep rules, vessels, equipment, solvents, settings). Phase 1B activates `/sample-prep/new` as a **guided calculation wizard** that turns an approved method revision + a sample into an executable prep plan. Bench execution, review/approve, and records land in Phase 1C.

### Scope

- Only approved `sp_method_revisions` are selectable.
- Calculates: stock reconstitution, dilution chain (direct or serial), aliquot volumes, target level check against calibration.
- Respects `sp_settings` thresholds (absolute/preferred min pipette µL, max dilution steps) and revision `sp_method_prep_rules` (volumes, allowed vessels/solvents).
- Suggests vessels from `sp_vessels` and equipment (balance/pipette) from `sp_equipment` by capacity range.
- Output: printable prep sheet (steps, target level, calibration context, chosen vessels/equipment). No DB write yet — session state only, with "Copy to clipboard" + "Print". Persistence + review workflow = Phase 1C.

### Wizard steps (single route, stateful stepper)

1. **Method + Analyte** — pick approved method revision (filtered by analyte, method type, active).
2. **Sample context** — analyte confirmation, source form (lyophilized / solution), source concentration + purity, available mass or volume.
3. **Target** — pick calibration level (default = revision `default_target_level`), override target concentration + final volume within prep-rule bounds.
4. **Solvent + vessels** — solvent formulation (constrained by allowed list), vessel per stage (constrained by allowed sizes + working-volume range).
5. **Review** — computed plan: reconstitution, dilution chain, aliquots, equipment recommendations, warnings. Print / copy.

### Calculation engine

New pure module `src/lib/sample-prep/prep-engine.ts`:

- `planPreparation(input): PrepPlan` — deterministic, no I/O.
- Reuses serial-dilution logic already in `src/lib/sample-prep/dilution.ts` (whole-number per-step factors, ≥ min pipette µL) but respects revision-specific `min/preferred/max_pipette_ul` and `max_dilution_steps`.
- Returns typed steps (`reconstitute`, `dilute`, `aliquot`), warnings (`below-min-pipette`, `exceeds-max-steps`, `outside-vessel-working-volume`, `target-outside-calibration-range`), and equipment suggestions.

### Files

- New: `src/lib/sample-prep/prep-engine.ts` + unit-test-friendly pure functions.
- New: `src/lib/sample-prep/wizard.functions.ts` — read-only server fns: `listApprovedRevisionsForAnalyte`, `getRevisionForPrep` (revision + mobile phases + gradient + calibration + prep rules + allowed vessels/solvents/equipment).
- New: `src/components/sample-prep/wizard/` — `Stepper`, `StepMethod`, `StepSample`, `StepTarget`, `StepSolventVessels`, `StepReview`, `PrepPlanView`.
- Replace: `src/routes/_authenticated/sample-prep/new.tsx` (currently placeholder) with the wizard host.
- Modified: `src/routes/_authenticated/sample-prep/index.tsx` — dashboard "New Preparation" tile links to `/sample-prep/new`.

### Explicitly out of scope this phase

- Persisting preparation records (Phase 1C — `sp_preparation_records` table + review/approve + PDF).
- Bench execution mode with lot capture and actual-vs-target reconciliation (Phase 1C).
- Run-list linkage (Phase 1D).
- Any change to existing tables or Phase 1A UI beyond the dashboard tile.

### Technical notes

- No migration this phase; all Phase 1A tables suffice.
- All server fns use `requireSupabaseAuth`, read-only, RLS as the user.
- Wizard state kept in a `useReducer` with `sessionStorage` autosave keyed by `sample-prep-wizard-draft` so refresh doesn't wipe work; cleared on "Start over".
