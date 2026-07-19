## Overview

Build a Run List Generator that turns Received samples into optimized, QC-interleaved OpenLab CDS sequences, extend Inventory to fully manage Instruments (with tray + method-folder config), and add a Method Groups configuration area. The existing `run_lists` / `run_list_items` module and `inventory_items` (with `instrument` category) will be extended — not replaced. The existing admin `instruments` table (used only by the Scheduler) stays untouched.

## Phase 1 — Inventory: Instruments as a first-class type

Extend, not duplicate. Instruments already exist as `inventory_items.category = 'instrument'`.

- Add instrument-specific fields to `inventory_items` (nullable, only used when `category='instrument'`):
  - `instrument_name` (unique when set) — display name like "Agilent 1290 #1"
  - `instrument_status` — enum (`active`, `maintenance`, `inactive`) — distinct from the generic `in_service/out_of_service/discarded` lifecycle status
  - `default_method_folder` (text, optional override of the global path)
  - `tray_config_id` (fk to tray configs — Phase 3)
- Add a filtered Instruments view under Inventory (`/inventory/instruments`) with Add / Edit / Deactivate / Reactivate / Delete, styled to match the existing inventory table (status badges, forms).
- Run List Generator queries only `instrument_status='active'` instruments.

## Phase 2 — Method Groups configuration

New admin area at `/admin/method-groups`.

- New table `method_groups`: name, temperature_c, priority (int, lower = higher), default_acquisition_method (text — `.amx` filename), default_processing_method, description, is_active.
- Seed the four defaults: Polar/Early (40°C, p1), General (40°C, p2), Hydrophobes (40°C, p3), GLP (50°C, p4).
- Acquisition Method picker lists `.amx` files from the sync folder. Use the existing `openlab-drive.functions.ts` / `openlab.functions.ts` pipeline. Handle empty/unreachable folder gracefully (show empty state + free-text fallback).
- Link samples to a Method Group: add `method_group_id` to `samples`. Populated from the sample's Acquisition Method or the compound's default; users can override in the review screen.

## Phase 3 — Multisampler / Tray configuration

New tables + admin UI (`/admin/trays`).

- `tray_configs` (name, notes, is_default) — global or per-instrument via `inventory_items.tray_config_id`.
- `tray_positions` (tray_config_id, position_code like `D1F-A1`, drawer, row, col, is_ref_vial, status: `available`/`reserved`/`out_of_service`).
- Seed generator: creates D1F, D2F, D3F, D4B × A1–F9 (54 each) + Ref 1–5.
- UI: grid view per drawer, click to toggle status; separate strip for Ref Vials.

## Phase 4 — Run List Generator: optimizer + review

New route `/run-lists/generate` (entry point next to existing Run Lists index).

**Input:** all samples in status `Received` (extends existing `listPrepFlaggedSamples` pattern to filter by status).

**Optimizer (`src/lib/run-lists/optimizer.ts`, pure fn, unit-testable):**
- Group samples by `method_group_id`.
- Sort groups by `priority` ASC, ties broken by `temperature_c` ASC.
- Merge Polar/Early + General into shared sequences only when it saves a run; enforce Polar/Early samples before General inside the merged sequence.
- Never place Hydrophobes or GLP immediately before a Polar/Early sequence (reorder sequence output, not individual samples).
- Cap 30 samples per sequence; split extras into follow-on sequences.
- QC insertion at fixed offsets: `NIB, ICB, ICV, [1-10], CCB-1, CCV-1, [11-20], CCB-2, CCV-2, [21-30], CCB-3, CCV-3`. For short sequences, keep the leading trio and insert CCB/CCV after every 10-sample block that exists.
- Vial assignment: pack drawer-by-drawer through `available` positions, skipping `reserved`/`out_of_service`; Ref Vials 1–5 reserved for NIB/ICB/CCB blanks per Method Group defaults.
- Produce a "why" trace per sample (group, priority, position rationale) shown in the review UI for transparency.

**Review screen:**
- Select Active instrument → optimizer proposes 1+ sequences.
- Show sequence table: order, sample name, method group badge, vial, injected QC rows highlighted, acquisition + processing method columns.
- Row actions: reorder (drag), remove, reassign vial (position picker showing tray occupancy).
- "Generate Sequence" button → persists as `run_lists` rows (status `draft` → `exported`).

## Phase 5 — OpenLab CDS CSV export

- Extend existing CSV export logic (in `run-lists.functions.ts` / `run-list-columns.functions.ts`) with a new export profile "OpenLab Sequence".
- Columns: Sample Name, Vial (D1F-A1 style), Sample Type (Sample/Blank/Standard mapped from NIB/ICB/ICV/CCB/CCV), Acquisition Method, Processing Method, Injection Volume (configurable default per run list), Data File.
- File naming: `YYYY-MM-DD_[Instrument Name]_Run##.csv`, auto-incrementing `##` per instrument per day (server-side counter query).
- Save to the same Google Drive sync location used elsewhere (`openlab-drive.functions.ts` push path) plus offer a download button.

## Phase 6 — Polish, guardrails, follow-ups

- Empty-state handling everywhere (no active instruments, no received samples, no method folder, empty method group).
- Permissions: instrument/method-group/tray admin restricted to `admin` role via existing `has_role`; generator open to `tech` and `reviewer`.
- Leave a stub `PrepListStub` component + TODO note where prep-list integration will hook in later.
- Docs: short in-app help panel on the generator explaining the priority + QC rules.

## Technical notes

- Migrations: one per phase (Phase 1 alter, Phase 2 create+seed, Phase 3 create+seed helper, Phase 4 samples alter + counters table for daily Run##).
- All new public tables get `GRANT` + RLS following project conventions (`authenticated` r/w scoped by `has_role`, `service_role` all).
- Optimizer is a pure module — no Supabase inside; server fn assembles inputs, calls optimizer, persists output. Keeps it testable and fast.
- Method folder scan reuses existing OpenLab integration; do not add a second Drive client.
- Sample→Method Group linkage: add nullable `method_group_id` on `samples`; auto-populate via a lightweight matcher on insert/update, user override supported in review.