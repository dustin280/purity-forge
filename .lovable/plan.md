
## Parameter Scouting Log

A new lab log under **Logs → Parameter Scouting Log** for capturing HPLC method scouting conditions and the compound run list.

### Database (one migration)

Two new tables, RLS modeled on `daily_backpressure_logs` (any tech/reviewer/admin can read/write; admin or creator can delete/update):

- `parameter_scouting_logs`
  - `run_at` (date/time, defaults now)
  - `user_id`, `user_name`
  - `flow_rate_ml_per_min` (numeric)
  - `temperature_c` (numeric)
  - `mobile_phase_a` (text, default `"H2O + 0.1% TFA"`)
  - `mobile_phase_b` (text, default `"ACN + 0.1% TFA"`)
  - `sample_diluent` (text)
  - `comments` (text)
  - `gradient` (jsonb: `[{ time_min, percent_a, percent_b }]`)
  - `run_list` (jsonb: `[{ parameter_id, name, concentration_mg_per_l }]`)
  - `created_by`, timestamps

Storing `run_list` and `gradient` as JSON keeps the schema tight (matches how `preparation_steps` is stored on standard preps). No child tables needed since rows are bounded (≤400 compounds, gradient typically <20 rows) and are always read with the parent.

### Compounds source

The Run List picker queries `test_parameters` (the existing admin "Parameters" list). Each row stores `parameter_id` + denormalized `name` snapshot so historical logs still read correctly if a parameter is renamed/deactivated.

### UI

**Route:** `/lab-logs/parameter-scouting` (added as a 4th card in `lab-logs/index.tsx`).

**Page layout:**
- Top: "New entry" form card (collapsible / always-visible like Daily Backpressure).
- Below: table of saved entries with Edit button per row.

**Form fields:**
- Date/time (datetime-local, defaults now) — read-only display of user name from session.
- Flow Rate (mL/min), Temperature (°C) — number inputs, units locked.
- Mobile Phase A / B — text inputs prefilled with the TFA defaults, editable.
- **Gradient editor** — small table with columns Time (min) | %A | %B | × ; "+ Add step" button. Auto-fill %B = 100 − %A on edit (still editable).
- **Run List** — repeating row of `[Compound select][Concentration mg/L][×]`, with "+ Add compound" button. Compound select is a searchable dropdown (Command/Popover) of active `test_parameters`. Supports up to 400 rows.
- Sample Diluent (text), Comments (textarea).
- Save / Cancel buttons.

**Saved entries table** (`readings-table` style):
Columns: Date, User, # compounds, Flow, Temp, Gradient summary (e.g. "5 steps, 5→95% B"), Actions (Edit, Delete for admin/creator). Clicking Edit reopens the form pre-populated.

### Code structure

- `supabase/migrations/<ts>_parameter_scouting.sql` — table + RLS.
- `src/lib/parameter-scouting.functions.ts` — `listParameterScoutingLogs`, `createParameterScoutingLog`, `updateParameterScoutingLog`, `deleteParameterScoutingLog` (all `createServerFn` + `requireSupabaseAuth`).
- `src/components/parameter-scouting/`
  - `types.ts` (RunListItem, GradientStep, FormValues)
  - `use-parameter-scouting.ts` (list + mutations via TanStack Query)
  - `scouting-form.tsx` (the form card)
  - `gradient-editor.tsx`
  - `run-list-editor.tsx` (with compound combobox)
  - `compound-picker.tsx` (reuses `test_parameters` lookup; new server fn `listTestParameters` if not already exposed)
  - `entries-table.tsx`
- `src/routes/_authenticated/lab-logs/parameter-scouting/index.tsx`
- Update `src/routes/_authenticated/lab-logs/index.tsx` to add the new card with a `FlaskRound`/`Beaker` icon.

### Out of scope

- No PDF export, no review/approval workflow, no batch/group, no attachments — kept "simple save/edit" per your answer. Easy to layer on later if needed.

### Verification

After build: create an entry with 3 compounds + 5-step gradient, save, confirm it appears in the table, edit it, confirm changes persist, delete as admin.
