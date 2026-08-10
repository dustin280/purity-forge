/**
 * Shared "release a sample from the instrument" logic. Plain function, not
 * a server fn -- always called from inside an already-authenticated
 * request (sample status updates, the space-crunch warning dialog's bulk
 * action). Safe to call unconditionally: no-op if the sample has no
 * active instrument location.
 */
export async function releaseSampleFromInstrument(
  supabase: any,
  sampleId: string,
): Promise<void> {
  const { data: loc, error: findErr } = await supabase
    .from("sample_locations")
    .select("id, tray_position_id")
    .eq("sample_id", sampleId)
    .eq("location_type", "instrument")
    .eq("status", "active")
    .maybeSingle();
  if (findErr) throw findErr;
  if (!loc) return;

  const stamp = new Date().toISOString();
  const { error: updErr } = await supabase
    .from("sample_locations")
    .update({ status: "removed", removed_at: stamp })
    .eq("id", loc.id);
  if (updErr) throw updErr;

  if (loc.tray_position_id) {
    const { error: posErr } = await supabase
      .from("tray_positions")
      .update({ status: "available" })
      .eq("id", loc.tray_position_id);
    if (posErr) throw posErr;
  }
}
