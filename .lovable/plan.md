## Scope

Phase 1A only — master data for the method-driven Sample Preparation system. No calculation wizard, execution mode, or records yet (those are later phases). The existing dilution calculator moves under Sample Prep as "Quick Dilution" and stays fully functional. Seed only the 29 analytes; no placeholder methods.

## Navigation changes

Convert `/sample-prep` from a single page into a section with sub-pages, matching existing left-nav conventions:

- `/sample-prep` → **Prep Dashboard** (Phase 1A: simple counts of analytes/methods/equipment/solvents + link tiles; real KPIs land in later phases)
- `/sample-prep/quick-dilution` → existing DilutionSession UI, unchanged
- `/sample-prep/analytes`
- `/sample-prep/methods` (list) and `/sample-prep/methods/$id` (editor with tabs)
- `/sample-prep/equipment`
- `/sample-prep/vessels`
- `/sample-prep/solvents` (formulations + prepared lots)
- `/sample-prep/settings` (global calc thresholds: absolute min pipette µL default 10, preferred min default 20, max dilution steps, target level default 3)

Placeholder pages for **New Preparation** and **Preparation Records** exist in the nav but render an "Available in Phase 1B/1C" empty state so the structure is visible without over-promising. Sidebar item stays "Sample Prep"; the sub-pages appear on the Prep Dashboard and via a tab bar inside the section.

Permission gating follows existing role model: staff can view/create master data drafts; admin approves methods and edits calc thresholds. Uses the existing `user_roles` / `has_role` pattern.

## Database (single migration)

All tables in `public`, RLS on, GRANTs to `authenticated` + `service_role`, standard `id/created_at/updated_at` + `updated_at` trigger, `audit_trigger` attached where the spec calls for audit history. No changes to any existing table.

Core tables:

- `sp_analytes` — canonical name (unique CI), abbreviation, category, salt_form, cas, formula, molecular_weight, sequence, description, default_mass_unit, default_conc_unit, solubility_notes, stability_notes, storage_notes, handling_notes, is_active, created_by
- `sp_analyte_aliases` — analyte_id, alias (unique per analyte)
- `sp_methods` — analyte_id, code, name, method_type, intended_use, is_active
- `sp_method_revisions` — method_id, version, revision, status (`draft|under_review|approved|superseded|retired`), effective_date, superseded_date, created_by, reviewed_by, approved_by, approval_date, change_reason, and all chromatography fields (instrument_type, detector_type, wavelengths jsonb, reference_wavelength, bandwidth, flow_rate, column_name, column_manufacturer, column_part_number, stationary_phase, particle_size_um, column_dimensions, column_temp_c, autosampler_temp_c, injection_volume_ul, needle_wash, seal_wash, total_run_time_min, post_run_time_min, estimated_rt_min, rt_window_min, expected_peak_order, suitability_requirements, notes). Unique (method_id, version, revision).
- `sp_method_mobile_phases` — revision_id, channel (`A|B|C|D`), composition_text, initial_percent
- `sp_method_gradient_steps` — revision_id, ordinal, time_min, pct_a, pct_b, pct_c, pct_d, flow_rate, curve_type
- `sp_method_calibration_levels` — revision_id, level_number, standard_name, target_concentration (nullable — spec forbids seeding), concentration_unit, preparation_source, dilution_factor, replicate_count, include_in_calibration, weighting_model, regression_model, acceptance_notes, is_active
- `sp_method_prep_rules` — revision_id (1:1), default_target_level (default 3), default_sample_solvent_id, allowed_sample_solvent_ids uuid[], default_stock_concentration, preferred/min/max initial_reconstitution_volume, max_dilution_steps, preferred_final_volume, allowed_vial_size_ids uuid[], min/preferred/max pipette volumes, max_concentration_deviation_pct, allow_direct/serial/gravimetric/volumetric booleans, mixing/sonication/centrifugation/filtration instructions, filter_type, filter_pore_um, stability_notes, storage_temp_c, light_protection, max_hold_time, special_handling, safety_notes
- `sp_vessels` — name, nominal_capacity_ul, min_working_volume_ul, max_working_volume_ul, material, graduated bool, volumetric bool, reusable bool, is_active. Seed the four capacities the spec lists (1/2/5/10 mL) with blank working-volume fields for the lab to fill in.
- `sp_equipment` — equipment_id (text unique), equipment_type, manufacturer, model, serial_number, min_capacity, max_capacity, capacity_unit, preferred_min, preferred_max, resolution, accuracy, uncertainty, calibration_status, calibration_date, calibration_due_date, location, is_active, notes
- `sp_solvent_formulations` — name, internal_code (unique), version, storage_conditions, stability_period_days, approved_uses, status (`draft|approved|retired`), notes
- `sp_solvent_formulation_components` — formulation_id, component_name, percentage, percentage_basis (`v/v|w/v|w/w|molar`), notes; validation trigger ensures percentage sums to 100 when basis is v/v or w/v or w/w
- `sp_reagent_lots` — formulation_id, lot_number, preparation_date, expiration_date, prepared_by, final_volume, final_volume_unit, ph, review_status (`pending|approved|rejected`), notes
- `sp_reagent_lot_components` — reagent_lot_id, component_name, source_lot_number, actual_quantity, unit
- `sp_settings` — singleton row (`id bool primary key default true`): absolute_min_pipette_ul (10), preferred_min_pipette_ul (20), default_calibration_levels (6), default_target_level (3), max_dilution_steps (5)

RLS policies:
- SELECT for all authenticated on every table.
- INSERT/UPDATE for authenticated, but methods/analytes/equipment/solvents that are `status='approved'` require admin to modify (enforced via `has_role(auth.uid(),'admin')` in policy `WITH CHECK`).
- DELETE only for admin, and only when there are no dependent records (enforced via FK RESTRICT — spec forbids hard-deleting analytes/methods with history, so UI uses deactivate).
- `audit_trigger` attached to analytes, method_revisions, calibration_levels, prep_rules, equipment, solvent_formulations, settings — reuses existing `public.audit_log`.

Stage 2 readiness on `sp_method_revisions` and future preparation tables: none required yet since prep tables don't exist. Future prep tables will carry nullable `run_list_id`, `run_list_item_id`, `sequence_id`, `analytical_result_id`, `batch_id`; noted in the migration comment so Phase 1C follows through.

Seed data (in same migration): the 29 analytes from the spec inserted into `sp_analytes` with canonical names exactly as listed, `is_active=true`, everything else null. Distinct records for BPC-157 Acetate vs BPC-157 free form, TB500 vs Thymosin Beta 4, Melanotan I vs II — no aliases collapsed. Also seeds `sp_settings` singleton and the four vessel sizes.

## Server functions

New files under `src/lib/sample-prep/`, each `*.functions.ts`, all `.middleware([requireSupabaseAuth])`, all input-validated with zod:

- `analytes.functions.ts` — list, get, create, update, deactivate, addAlias, removeAlias
- `methods.functions.ts` — listMethods, getMethod (with active revision), createMethod, createRevision (clones prior), updateRevision (draft only), setRevisionStatus (draft→under_review→approved; approved requires admin; approving supersedes the prior approved revision atomically), listRevisions
- `method-mobile-phases.functions.ts` / `method-gradient.functions.ts` / `method-calibration.functions.ts` / `method-prep-rules.functions.ts` — CRUD scoped to a revision; block writes when revision.status ≠ 'draft'. Calibration write validates target_level ∈ [1, level_count].
- `equipment.functions.ts`, `vessels.functions.ts`, `solvents.functions.ts` (formulations + components + lots), `settings.functions.ts` (get/update singleton, admin-only update)

All admin-gated mutations call `has_role` via `context.supabase` (not `supabaseAdmin`).

## UI components

New folder `src/components/sample-prep/master-data/` with shared table + form primitives to avoid rewriting per page. Uses existing shadcn Card/Table/Dialog/Form/Tabs/Button/Input/Select patterns — same look as Clients, Inventory, Library.

Route pages (thin, delegate to components):

- `sample-prep.tsx` → dashboard shell with tab bar linking the sub-pages and simple counts
- `sample-prep/quick-dilution.tsx` → renders existing `<DilutionSession />` (move of current page body, no logic change)
- `sample-prep/analytes.tsx` → searchable/filterable table + create/edit dialog + alias manager + activate/deactivate
- `sample-prep/methods.tsx` → list with filters (analyte, status, method type, column, active revision)
- `sample-prep/methods.$id.tsx` → tabbed editor: **General · Chromatography · Gradient · Calibration · Sample Preparation · Suitability · Revision History**. Gradient tab has add/remove/reorder rows with live 100% validation and a small area/line chart preview (reuse existing recharts). Calibration tab always shows 6 rows by default, allows changing count, requires explicit target-level selection when count ≠ 6, Level 3 highlighted, target concentrations left blank until entered. Sample Preparation tab surfaces prep rules and reiterates the selected target level + concentration.
- `sample-prep/equipment.tsx`, `sample-prep/vessels.tsx`, `sample-prep/solvents.tsx` (formulations list → drill-in for components + lots), `sample-prep/settings.tsx` (admin-only form)

Placeholder pages for `new` and `records` render an empty state with a "Coming in the next phase" note so the nav feels complete without misleading users.

## Sidebar

Existing `SidebarNav` entry `{ to: "/sample-prep", label: "Sample Prep", icon: Beaker }` stays unchanged; sub-pages are reached via the in-page tab bar and dashboard tiles. This keeps the sidebar diff to zero and matches the way Maintenance/Admin sub-pages already work.

## Explicitly out of scope this phase

- Calculation service / New Preparation wizard (Phase 1B)
- Bench execution mode, preparation records, review/approve workflow, PDF (Phase 1C)
- Run-list linkage tables (Phase 1D — will add nullable FKs to the not-yet-created `sp_preparation_records` table)
- Any change to existing tables, existing routes other than `sample-prep.tsx`, sidebar, or dilution calculator behaviour

## Files touched

- New migration (single call) creating all `sp_*` tables + policies + grants + audit triggers + seeds
- New: `src/lib/sample-prep/*.functions.ts` (7 files above)
- New: `src/components/sample-prep/master-data/*` shared table/form primitives + one component per master-data type
- New: `src/routes/_authenticated/sample-prep/` folder with `quick-dilution.tsx`, `analytes.tsx`, `methods.tsx`, `methods.$id.tsx`, `equipment.tsx`, `vessels.tsx`, `solvents.tsx`, `settings.tsx`, `new.tsx` (placeholder), `records.tsx` (placeholder)
- Modified: `src/routes/_authenticated/sample-prep.tsx` — becomes the dashboard shell; the current `<DilutionSession />` render moves into `sample-prep/quick-dilution.tsx`
- `src/lib/sample-prep/dilution.ts`, `src/components/sample-prep/dilution-*.tsx` — untouched

After this phase you'll have all master data managed in-app, ready for me to plug the calculation engine into in a follow-up plan without redoing anything.
