/**
 * Assigns/releases a sample's physical storage location (fridge, freezer,
 * or incubator tray) — the sample_locations rows this writes are the same
 * table/lifecycle the instrument-tray system already uses (see
 * src/lib/run-lists/vial-release.functions.ts), just with storage_slot_id
 * instead of tray_position_id and location_type "fridge"/"freezer"/
 * "incubator" instead of "instrument".
 *
 * Fridge/freezer assignment deliberately has no auto-release: unlike an
 * instrument position (freed the moment a run finishes), the physical vial
 * stays in the fridge/freezer indefinitely after approval — it's only
 * pulled when an analyst manually releases it (about to be disposed) via
 * the Sample Info tab, same "release now, dispose later after the
 * retention window" two-step the Sample Disposal Log already expects.
 * Incubator assignment is the opposite: the vial/plate comes out of the
 * incubator the moment its result is read out, so that release is
 * automatic (see saveNonchromResult in nonchrom-results.functions.ts).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { StorageUnitType } from "@/lib/storage-units.functions";

export interface StorageAssignResult {
  ok: boolean;
  reason?: string;
  storage_slot_id?: string;
  location?: string;
}

type FoundSlot = { unitId: string; unitName: string; slotId: string; slotLabel: string };

async function findAvailableSlot(
  supabase: SupabaseClient,
  unitType: StorageUnitType,
): Promise<FoundSlot | null> {
  const { data: units } = await supabase
    .from("storage_units")
    .select("id, name")
    .eq("unit_type", unitType)
    .eq("is_active", true)
    .order("name");
  return findAvailableSlotInUnits(supabase, (units ?? []).map((u) => ({ id: u.id, name: u.name })));
}

/** Same lookup as findAvailableSlot, but restricted to a caller-provided
 * list of units (in the given order) rather than "every active unit of a
 * type" — used when the analyst has explicitly chosen which physical
 * incubator(s) they're using (see assignSlotFromUnitList). */
async function findAvailableSlotInUnits(
  supabase: SupabaseClient,
  units: Array<{ id: string; name: string }>,
): Promise<FoundSlot | null> {
  for (const unit of units) {
    const { data: slot } = await supabase
      .from("storage_slots")
      .select("id, label")
      .eq("storage_unit_id", unit.id)
      .eq("status", "available")
      .order("tray_number")
      .limit(1)
      .maybeSingle();
    if (slot) return { unitId: unit.id, unitName: unit.name, slotId: slot.id, slotLabel: slot.label };
  }
  return null;
}

/** Marks a found slot occupied and records the sample_locations row —
 * shared tail for both assignSlotForSample and assignSlotFromUnitList. */
async function occupySlot(
  supabase: SupabaseClient,
  sampleId: string,
  unitType: StorageUnitType,
  found: FoundSlot,
  tag?: string,
): Promise<StorageAssignResult> {
  const { error: slotErr } = await supabase
    .from("storage_slots").update({ status: "occupied" }).eq("id", found.slotId);
  if (slotErr) return { ok: false, reason: slotErr.message };

  const location = `${found.unitName} / ${found.slotLabel}`;
  const { error: locErr } = await supabase.from("sample_locations").insert({
    sample_id: sampleId, location_type: unitType, location,
    storage_slot_id: found.slotId, status: "active", notes: tag ?? null,
  });
  if (locErr) return { ok: false, reason: locErr.message };
  return { ok: true, storage_slot_id: found.slotId, location };
}

/** Core assignment primitive — finds the next open tray of the given unit
 * type, marks it occupied, and records the sample_locations row. Never
 * throws; callers decide how to surface a miss.
 *
 * `tag` distinguishes multiple concurrent locations of the same type for
 * one sample — needed for incubator placement, since a sample can have
 * both a sterility and an endotoxin test incubating at once (in the same
 * or different incubators). Fridge/freezer callers omit it: a sample has
 * exactly one physical vial, so it can only be in one fridge/freezer tray
 * at a time. Stored in the existing free-text `notes` column rather than a
 * new one. */
export async function assignSlotForSample(
  supabase: SupabaseClient,
  sampleId: string,
  unitType: StorageUnitType,
  tag?: string,
): Promise<StorageAssignResult> {
  try {
    const found = await findAvailableSlot(supabase, unitType);
    if (!found) return { ok: false, reason: `no available ${unitType} slot` };
    let dupQuery = supabase
      .from("sample_locations")
      .select("id")
      .eq("sample_id", sampleId)
      .eq("location_type", unitType)
      .eq("status", "active");
    dupQuery = tag ? dupQuery.eq("notes", tag) : dupQuery.is("notes", null);
    const { data: prior } = await dupQuery.maybeSingle();
    if (prior) return { ok: false, reason: `sample already has an active ${unitType} location` };

    return await occupySlot(supabase, sampleId, unitType, found, tag);
  } catch (e) {
    return { ok: false, reason: (e as Error).message };
  }
}

/** Same as assignSlotForSample, but only considers the caller-specified
 * incubator units (in the given order) instead of every active unit of the
 * type — used by createAnalysisBatch, where the analyst picks which
 * physical incubator(s) they're actually using rather than having the
 * software silently choose. Always tagged (a batch's incubator placement is
 * always per-test, same reasoning as assignSlotForSample's tag param). */
export async function assignSlotFromUnitList(
  supabase: SupabaseClient,
  sampleId: string,
  unitType: StorageUnitType,
  unitIds: string[],
  tag: string,
): Promise<StorageAssignResult> {
  try {
    const { data: units } = await supabase
      .from("storage_units").select("id, name").in("id", unitIds).eq("is_active", true);
    const ordered = unitIds
      .map((id) => (units ?? []).find((u) => u.id === id))
      .filter((u): u is { id: string; name: string } => !!u);
    const found = await findAvailableSlotInUnits(supabase, ordered);
    if (!found) return { ok: false, reason: `no available ${unitType} slot in the selected unit(s)` };

    const { data: prior } = await supabase
      .from("sample_locations").select("id")
      .eq("sample_id", sampleId).eq("location_type", unitType).eq("status", "active").eq("notes", tag)
      .maybeSingle();
    if (prior) return { ok: false, reason: `sample already has an active ${unitType} location` };

    return await occupySlot(supabase, sampleId, unitType, found, tag);
  } catch (e) {
    return { ok: false, reason: (e as Error).message };
  }
}

/** Closes a sample's active location of the given type (and `tag`, see
 * above) and frees its slot. Safe to call unconditionally — no-op if
 * there's no matching active location, same shape as
 * releaseSampleFromInstrument. */
export async function releaseSlotForSample(
  supabase: SupabaseClient,
  sampleId: string,
  unitType: StorageUnitType,
  tag?: string,
): Promise<void> {
  let query = supabase
    .from("sample_locations")
    .select("id, storage_slot_id")
    .eq("sample_id", sampleId)
    .eq("location_type", unitType)
    .eq("status", "active");
  query = tag ? query.eq("notes", tag) : query.is("notes", null);
  const { data: loc } = await query.maybeSingle();
  if (!loc) return;
  await supabase.from("sample_locations")
    .update({ status: "removed", removed_at: new Date().toISOString() })
    .eq("id", loc.id);
  if (loc.storage_slot_id) {
    await supabase.from("storage_slots").update({ status: "available" }).eq("id", loc.storage_slot_id);
  }
}

/** Best-effort hook fired for every newly-received sample right after
 * submitCocWithSamples inserts them — same call-site shape as
 * syncVialPhotosForNewSamples (never throws, logs failures server-side
 * only, never blocks intake). Solid and capsule samples go to a freezer,
 * liquid samples go to a fridge (confirmed with Dustin). Samples with no
 * physical_form, or whose target unit type has no available tray, are
 * silently skipped — pick up with the manual "Assign" action on the
 * sample's Info tab. Sequential rather than parallel so two samples in the
 * same intake batch can't race for the same open tray. */
export async function assignStorageForNewSamples(
  supabase: SupabaseClient,
  samples: Array<{ id: string; batch_id: string; physical_form: string | null }>,
): Promise<void> {
  try {
    for (const s of samples) {
      if (!s.physical_form) continue;
      const unitType: StorageUnitType = s.physical_form === "liquid" ? "fridge" : "freezer";
      const res = await assignSlotForSample(supabase, s.id, unitType);
      if (!res.ok) {
        console.error(`assignStorageForNewSamples: ${s.batch_id} skipped — ${res.reason}`);
      }
    }
  } catch (e) {
    console.error("assignStorageForNewSamples failed", e);
  }
}

export const assignSampleStorage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    sampleId: z.string().uuid(),
    unitType: z.enum(["fridge", "freezer"]),
  }).parse(d))
  .handler(async ({ context, data }) => assignSlotForSample(context.supabase, data.sampleId, data.unitType));

export const moveSampleStorage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    sampleId: z.string().uuid(),
    newSlotId: z.string().uuid(),
  }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: newSlot, error: slotErr } = await context.supabase
      .from("storage_slots")
      .select("id, label, status, storage_unit_id, storage_units(name, unit_type)")
      .eq("id", data.newSlotId)
      .maybeSingle();
    if (slotErr) throw slotErr;
    if (!newSlot) throw new Error("Target tray not found");
    if (newSlot.status !== "available") throw new Error("Target tray is not available");
    const unit = newSlot.storage_units as unknown as { name: string; unit_type: StorageUnitType } | null;
    if (!unit) throw new Error("Target tray's storage unit not found");

    await releaseSlotForSample(context.supabase, data.sampleId, unit.unit_type);

    const { error: occErr } = await context.supabase
      .from("storage_slots").update({ status: "occupied" }).eq("id", newSlot.id);
    if (occErr) throw occErr;
    const location = `${unit.name} / ${newSlot.label}`;
    const { error: locErr } = await context.supabase.from("sample_locations").insert({
      sample_id: data.sampleId, location_type: unit.unit_type, location,
      storage_slot_id: newSlot.id, status: "active",
    });
    if (locErr) throw locErr;
    return { ok: true, location };
  });

export const releaseSampleStorage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    sampleId: z.string().uuid(),
    unitType: z.enum(["fridge", "freezer"]),
  }).parse(d))
  .handler(async ({ context, data }) => {
    await releaseSlotForSample(context.supabase, data.sampleId, data.unitType);
    return { ok: true };
  });

export const listSampleStorageLocations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ sampleId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: rows, error } = await context.supabase
      .from("sample_locations")
      .select("id, location_type, location, status, assigned_at, removed_at")
      .eq("sample_id", data.sampleId)
      .in("location_type", ["fridge", "freezer"])
      .order("assigned_at", { ascending: false });
    if (error) throw error;
    return rows ?? [];
  });

// --- Incubator placement for sterility/endotoxin tests ---------------------
// Tagged by testId (see the `tag` param on assignSlotForSample/
// releaseSlotForSample above) so a sample's sterility and endotoxin tests
// can incubate concurrently without colliding.

export const placeSampleInIncubator = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ testId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: test, error } = await context.supabase
      .from("tests").select("sample_id").eq("id", data.testId).maybeSingle();
    if (error) throw error;
    if (!test) throw new Error("Test not found");
    return assignSlotForSample(context.supabase, test.sample_id, "incubator", data.testId);
  });

export const getTestIncubatorLocation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ testId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase
      .from("sample_locations")
      .select("id, location, assigned_at")
      .eq("notes", data.testId)
      .eq("location_type", "incubator")
      .eq("status", "active")
      .maybeSingle();
    if (error) throw error;
    return row ?? null;
  });
