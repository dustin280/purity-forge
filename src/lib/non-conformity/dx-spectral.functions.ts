/**
 * Pulls real per-peak DAD spectral fingerprints out of a resolved .dx file
 * (see dx-link.functions.ts) for the Non-Conformity evaluation engine.
 * Reuses the same Drive-fetch/unzip/manifest-parse pattern as the rest of
 * this feature. Never throws — any failure (missing file, unparseable
 * channel) degrades to "no spectral data for this peak", matching the
 * engine's existing fallback-to-proxy-scoring design.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import JSZip from "jszip";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { driveDownload } from "@/lib/lab-logs/drive-results.functions";
import {
  parseInjectionManifest,
  parseAgilentChDelta,
  type AgilentTrace,
} from "@/lib/lab-logs/agilent-trace";
import { buildFingerprintAtRt, type SpectralFingerprint } from "./spectral";

const DAD_WAVELENGTH_RE = /Sig=(\d+)/;

async function loadDadChannels(
  zip: JSZip,
): Promise<{ wavelengthNm: number; trace: AgilentTrace }[]> {
  const acmdFile = zip.file("injection.acmd");
  if (!acmdFile) return [];
  const manifest = parseInjectionManifest(await acmdFile.async("text"));
  const dadAbsorbanceSignals = manifest.signals.filter(
    (s) => s.device === "DAD" && DAD_WAVELENGTH_RE.test(s.desc),
  );

  const channels: { wavelengthNm: number; trace: AgilentTrace }[] = [];
  for (const signal of dadAbsorbanceSignals) {
    const match = signal.desc.match(DAD_WAVELENGTH_RE);
    if (!match) continue;
    const chFile = zip.file(`${signal.traceId}.CH`);
    if (!chFile) continue;
    try {
      const trace = parseAgilentChDelta(await chFile.async("arraybuffer"));
      if (trace.rt.length > 0) channels.push({ wavelengthNm: Number(match[1]), trace });
    } catch {
      // Unparseable channel — skip it, best-effort only.
    }
  }
  return channels;
}

const extractInput = z.object({
  dx_file_id: z.string().min(1),
  peaks: z.array(z.object({ peak_id: z.string(), rt: z.number() })).min(1),
});

export interface SpectralExtraction {
  wavelengths_found: number[];
  fingerprints: Record<string, SpectralFingerprint | null>;
}

export const extractSpectralData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => extractInput.parse(d))
  .handler(async ({ data }): Promise<SpectralExtraction> => {
    try {
      const bytes = await driveDownload(data.dx_file_id);
      const zip = await JSZip.loadAsync(bytes);
      const channels = await loadDadChannels(zip);
      if (channels.length === 0) return { wavelengths_found: [], fingerprints: {} };

      const fingerprints: Record<string, SpectralFingerprint | null> = {};
      for (const p of data.peaks) {
        fingerprints[p.peak_id] = buildFingerprintAtRt(channels, p.rt);
      }
      return {
        wavelengths_found: channels.map((c) => c.wavelengthNm).sort((a, b) => a - b),
        fingerprints,
      };
    } catch {
      // Best-effort only — resolution failures must never block an evaluation.
      return { wavelengths_found: [], fingerprints: {} };
    }
  });
