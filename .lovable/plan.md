# Mobile Phase Prep Log

A new lab log for documenting Mobile Phase A and B preparations, with calculated step-by-step instructions persisted as part of the record.

## Scope (Phase 1)

- New route under **Lab Logs**: `/lab-logs/mobile-phase`
- List of recent prep records with date, user initials, A/B summary, lot number
- "New Prep" form with live calculation + generated instructions
- Admin page to manage the **Mobile Phase Reagents** dropdown list (solvents, modifiers, diluents)
- Each saved record stores the auto-generated **Preparation** text verbatim

Phase 2 (added to ToDo, not built now): pH measurement, degassing/sonication checks, expiration tracking, label printing, linking preps to sample runs, reviewer/approver workflow, PDF export.

## Form fields

Top of form:
- **Date prepared** (date picker, defaults today)
- **User initials** (text, 2-4 chars, defaults from profile)
- **Total volume** (number + unit: mL / L)
- **Lot / tracking number** (text, auto-suggested format `MP-YYYYMMDD-###` but editable)

A/B toggles:
- **Prepare Mobile Phase A** (switch, on by default)
- **Prepare Mobile Phase B** (switch, on by default)
- At least one must be on. Each enabled side shows its own card:

Per side (A and B), inside the card:
- **Solvent** (dropdown from admin list, e.g. ACN, MeOH, IPA, Ethanol, HPLC Water, Low TOC Reagent Water)
- **Solvent %** (number 0–100)
- **Diluent** (dropdown from admin list — same reagent list, filtered to solvents)
- *(Diluent % = 100 − solvent % − modifier %, shown read-only)*
- **Modifier** (dropdown from admin list, e.g. TFA, Formic Acid; "(none)" option)
- **Modifier %** (number, 0–5, shown only when modifier ≠ none)
- **Notes** (optional textarea)

## Live calculation panel ("Preparation")

Renders below the form and updates as the user types. Saved as plain text on the record.

Example output for `1 L of MP-A = 95% HPLC Water + 5% ACN + 0.1% TFA`:

```text
Mobile Phase A — Total volume: 1000.0 mL
  1. Measure 950.0 mL HPLC Water (95%) into a clean graduated cylinder.
  2. Add 50.0 mL Acetonitrile (5%).
  3. Add 1.00 mL Trifluoroacetic Acid (0.1%).
  4. Mix thoroughly. Degas before use.
  Lot: MP-20260526-001  |  Prepared: 2026-05-26 by JS
```

A and B sections are concatenated. Total percentages per side must sum to 100 (validation error if not). Volumes:
- `solvent_volume = total * solvent_pct/100`
- `modifier_volume = total * modifier_pct/100`
- `diluent_volume = total - solvent_volume - modifier_volume`

The generated text is what's saved in the `preparation` column — re-rendering on the detail page reads this saved text, not recomputed values (so historical accuracy is preserved even if the template changes).

## Database

New tables:

**`mobile_phase_reagents`** (admin-managed lookup)
- `name`, `kind` (`solvent` | `modifier` | `diluent` — kind is an array so e.g. ACN can be both solvent & diluent), `is_active`, `sort_order`

**`mobile_phase_prep_logs`**
- `log_number` (auto `MP-YYYYMMDD-###` via new counter table + function, mirrors `next_material_receipt_number`)
- `prepared_at` (timestamptz), `user_id`, `user_name`, `user_initials`
- `lot_number`
- `total_volume`, `total_volume_unit` (`mL` | `L`)
- `prep_a` (jsonb: `{enabled, solvent, solvent_pct, modifier, modifier_pct, diluent, notes}`)
- `prep_b` (jsonb: same shape)
- `preparation` (text — the generated instructions, saved verbatim)
- `created_by`, `created_at`, `updated_at`

**`mobile_phase_prep_counters`** (`day`, `last_seq`) for the log_number generator.

RLS mirrors `daily_backpressure_logs`: all authenticated can SELECT; tech/reviewer/admin INSERT; owner or admin UPDATE; admin DELETE. Reagents table: all SELECT, admin write.

## UI files

- `src/routes/_authenticated/lab-logs/mobile-phase/index.tsx` — list + "New prep" button
- `src/routes/_authenticated/lab-logs/mobile-phase/new.tsx` — form
- `src/routes/_authenticated/lab-logs/mobile-phase/$id.tsx` — detail (shows saved Preparation)
- `src/components/mobile-phase/prep-form.tsx` — A/B cards + live calc
- `src/components/mobile-phase/prep-preview.tsx` — renders generated instructions
- `src/components/mobile-phase/use-mobile-phase.ts` — queries/mutations
- `src/lib/mobile-phase.functions.ts` — server fns (list/get/create/update/delete + reagents CRUD)
- `src/lib/mobile-phase-instructions.ts` — pure function `buildPreparation(record): string` used by both form preview and server (consistent output)
- `src/routes/_authenticated/admin/mobile-phase-reagents.tsx` — admin CRUD for reagent list

Sidebar: add "Mobile Phase Prep" entry under the existing Lab Logs section. Admin sidebar: add "Mobile Phase Reagents".

## Seed reagents

Inserted in the migration:
- Solvents: Acetonitrile (ACN), Methanol, Ethanol, Isopropyl Alcohol (IPA), HPLC Water, Low TOC Reagent Water
- Modifiers: Trifluoroacetic Acid (TFA), Formic Acid (FA)
- Diluents: HPLC Water, Low TOC Reagent Water (also kind-tagged as solvent)

## Validation

- Volume > 0
- Initials required, ≤ 4 chars
- For each enabled side: solvent_pct + modifier_pct ≤ 100; solvent required; modifier_pct required only if modifier selected
- Lot number required, ≤ 64 chars

## ToDo (Phase 2 — not built now)

Tracked as a project todo:
- pH adjustment & measurement fields
- Expiration / shelf life + auto-flagging
- Link prep records to sample runs / sequences
- Reviewer/approver workflow (like standard preparations)
- Label/PDF printing
- Attachments (photos of bottle/label)
- Reagent lot tracking via Material Receipts linkage
