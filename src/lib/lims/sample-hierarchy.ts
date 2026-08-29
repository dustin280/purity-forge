/**
 * Shared vocabulary for the three-level sample hierarchy:
 *
 *   level 1  SYX-000010        shipment      (chain_of_custody_records.sample_id)
 *   level 2  SYX-000010-01     product/lot   (sample_lots)
 *   level 3  SYX-000010-01-03  one vial      (samples), assigned to one test
 *
 * Pure functions only -- no I/O -- so both the intake write path
 * (coc-intake.functions.ts) and the pending-order receive path
 * (pending-orders/index.tsx) derive ids, appearance strings, and partner
 * test tags exactly the same way instead of each re-deriving them.
 */
import type { Database } from "@/integrations/supabase/types";

export type TestType = Database["public"]["Enums"]["test_type"];

// ---------- IDs ----------

const pad2 = (n: number) => String(n).padStart(2, "0");

/** "SYX-000010" + 1 -> "SYX-000010-01" */
export function lotCode(shipmentId: string, lotNo: number): string {
  return `${shipmentId}-${pad2(lotNo)}`;
}

/** "SYX-000010" + 1 + 3 -> "SYX-000010-01-03" */
export function vialBatchId(shipmentId: string, lotNo: number, vialNo: number): string {
  return `${lotCode(shipmentId, lotNo)}-${pad2(vialNo)}`;
}

// ---------- Appearance ----------

/**
 * Solids get a texture; liquids are just liquid, so they carry colour only.
 * "Other" lets an analyst type a texture we haven't listed rather than
 * forcing a bad fit.
 */
export const APPEARANCE_TEXTURES = ["Cake", "Powder", "Other"] as const;
export type AppearanceTexture = (typeof APPEARANCE_TEXTURES)[number];

/** White first: nearly every peptide the lab sees is a white cake. */
export const APPEARANCE_COLORS = [
  "White", "Off-white", "Yellow", "Tan/Beige", "Blue",
  "Red", "Pink", "Green", "Clear", "Other",
] as const;
export type AppearanceColor = (typeof APPEARANCE_COLORS)[number];

/**
 * Builds the human appearance string ("White cake", "Blue powder", "Clear
 * liquid") that gets mirrored onto samples.physical_description. The
 * partner export returns that column verbatim as its `appearance` field, so
 * this composition is what keeps their payload identical to the free-text
 * values analysts used to type by hand.
 */
export function composeAppearance(
  physicalForm: string | null | undefined,
  color: string | null | undefined,
  texture: string | null | undefined,
  textureOther?: string | null,
): string {
  const c = (color ?? "").trim();
  const isLiquid = physicalForm === "liquid";
  const rawTexture = texture === "Other" ? (textureOther ?? "").trim() : (texture ?? "").trim();
  const t = isLiquid ? "liquid" : rawTexture.toLowerCase();
  if (!c && !t) return "";
  if (!t) return c;
  if (!c) return t.charAt(0).toUpperCase() + t.slice(1);
  return `${c} ${t}`;
}

// ---------- Partner test tagging ----------

/**
 * The partner flags a vial's test two independent ways at once: a suffix on
 * the lot ("...-EN") and a bracket tag on the product name
 * ("... [Endotoxin (LAL) vial]"). Both are checked -- lot suffix first,
 * since it's the more structured of the two -- so a vial is typed correctly
 * even if one signal is missing. Returns null for an untagged vial, which
 * by their convention is the main purity/conformity vial.
 */
export function partnerTestType(lotBatch: string | null | undefined, productName?: string | null): TestType | null {
  const lot = (lotBatch ?? "").trim().toUpperCase();
  const suffix = lot.match(/-(EN|ST|HM)$/);
  if (suffix) {
    if (suffix[1] === "EN") return "endotoxin";
    if (suffix[1] === "ST") return "sterility";
    return "heavy_metals";
  }
  const name = (productName ?? "").toLowerCase();
  if (/\[[^\]]*endotoxin[^\]]*\]/.test(name)) return "endotoxin";
  if (/\[[^\]]*sterility[^\]]*\]/.test(name)) return "sterility";
  if (/\[[^\]]*heavy\s*metal[^\]]*\]/.test(name)) return "heavy_metals";
  return null;
}

/** Strips the partner's per-vial test suffix to get the product's base lot. */
export function baseLot(lotBatch: string | null | undefined): string {
  return (lotBatch ?? "").trim().replace(/-(EN|ST|HM)$/i, "");
}

/** Strips a trailing "[... vial]" tag from a partner product name. */
export function stripVialTag(productName: string | null | undefined): string {
  return (productName ?? "").replace(/\s*\[[^\]]*\]\s*$/, "").trim();
}

export const TEST_TYPE_LABEL: Record<TestType, string> = {
  purity: "Purity",
  sterility: "Sterility",
  endotoxin: "Endotoxin",
  heavy_metals: "Heavy Metals",
};

/** Short tag shown on a vial row / matches the partner's own -EN/-ST/-HM shorthand. */
export const TEST_TYPE_SHORT: Record<TestType, string> = {
  purity: "PUR",
  sterility: "ST",
  endotoxin: "EN",
  heavy_metals: "HM",
};
