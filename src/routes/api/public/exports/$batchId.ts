import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { findVialPhotoDataUri } from "@/lib/lims/coc/vial-photo-drive-sync.functions";

export const Route = createFileRoute("/api/public/exports/$batchId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const apiKey = request.headers.get("x-api-key");
        const { data: cfg } = await supabaseAdmin.from("export_config").select("*").limit(1).maybeSingle();
        if (!cfg || !cfg.is_active) {
          return new Response("Export disabled", { status: 403 });
        }
        if (!apiKey || apiKey !== cfg.api_key) {
          return new Response("Unauthorized", { status: 401 });
        }
        // Look up by internal batch_id first, then by the partner/customer
        // lot number. Partner sites (synthesyx.com) poll this endpoint by the
        // lot they submitted via /api/public/orders/intake (samples[].lotBatch),
        // which the Sample Receipt flow stores in samples.lot — batch_id is
        // lab-internal and unknown to them.
        let { data: sample } = await supabaseAdmin.from("samples")
          .select("*").eq("batch_id", params.batchId).maybeSingle();
        if (!sample) {
          const { data: byLot } = await supabaseAdmin.from("samples")
            .select("*").eq("lot", params.batchId)
            .order("created_at", { ascending: false }).limit(1);
          sample = byLot?.[0] ?? null;
        }
        if (!sample) return new Response("Not found", { status: 404 });
        // No blanket "sample not approved" gate here anymore -- sterility/
        // endotoxin/heavy-metals results (including the day3/day7 sterility
        // checkpoints below) already have no in-app review step of their own
        // and are explicitly meant to reach the partner before the sample's
        // purity work is done. Purity itself stays gated per-result on
        // approved_at instead (see the "purity" branch below), so an
        // unreviewed purity number never leaks out just because sterility
        // finished first.
        const { data: tests } = await supabaseAdmin.from("tests").select("*").eq("sample_id", sample.id);
        const testIds = (tests ?? []).map(t => t.id);
        const results = testIds.length
          ? (await supabaseAdmin.from("results").select("*").in("test_id", testIds)).data ?? []
          : [];
        // Day 3 / Day 7 sterility preliminary checks — independent of and
        // prior to the final day-14 readout (which stays driven by
        // nonchrom_results below). "pending" until checked, then whichever
        // of no_growth/positive was recorded (see analysis-batches.functions.ts).
        const sterilityTestIds = (tests ?? []).filter(t => t.test_type === "sterility").map(t => t.id);
        const batchItemsByTestId = sterilityTestIds.length
          ? new Map(
              (await supabaseAdmin.from("analysis_batch_items")
                .select("test_id, day3_status, day7_status").in("test_id", sterilityTestIds)
              ).data?.map(r => [r.test_id, r]) ?? [],
            )
          : new Map<string, { day3_status: string; day7_status: string }>();
        const mapPreliminaryStatus = (s: string | undefined) =>
          s === "clear" ? "no_growth" : s === "turbid" ? "positive" : "pending";
        // Sterility/endotoxin/heavy-metals results — unlike purity, these
        // have no in-app review/approve step (Micro reviews sterility/
        // endotoxin independently before it reaches here; heavy metals is
        // an outsourced lab's already-reviewed report), so a test's status
        // is simply pending (flagged, nothing entered yet) vs available
        // (a result exists) — see nonchrom_results in the schema.
        const nonchromResults = testIds.length
          ? (await supabaseAdmin.from("nonchrom_results").select("*").in("test_id", testIds)
              .order("analysis_date", { ascending: false })).data ?? []
          : [];

        // uuid -> display name, same precedence as profileDisplayName (src/hooks/use-auth.tsx):
        // first+last name, then full_name, then email.
        const userIds = Array.from(new Set(
          [...results, ...nonchromResults]
            .flatMap(r => [r.analyst_id, r.reviewer_id])
            .filter((id): id is string => !!id)
        ));
        const profiles = userIds.length
          ? (await supabaseAdmin.from("profiles").select("id,full_name,first_name,last_name,email").in("id", userIds)).data ?? []
          : [];
        const nameById = new Map(profiles.map(p => {
          const fl = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
          return [p.id, fl || p.full_name || p.email || null] as const;
        }));

        // Purity results are the one thing still gated -- unlike sterility/
        // endotoxin/heavy-metals, purity has an explicit in-app review step,
        // so an unreviewed number must never reach the partner. Everything
        // downstream that reads "the" purity result (extras.calibration_data
        // and the purity branch of tests[] below) only ever sees approved
        // ones.
        const approvedPurityResults = results.filter(r => r.approved_at != null);
        // Newest approved purity result (by analysis_date) — calibration_data
        // is a per-injection concept, so extras.calibration_data mirrors
        // whichever result is currently "the" result for this sample,
        // same convention as the rest of extras being sample-level
        // convenience copies of what's already nested under tests[].
        const latestPurityResult = approvedPurityResults
          .slice()
          .sort((a, b) => +new Date(b.analysis_date) - +new Date(a.analysis_date))[0] ?? null;

        const extras: Record<string, unknown> = {};
        if (cfg.include_lcs) extras.lcs_recovery = null;
        if (cfg.include_ccv) extras.ccv_recovery = null;
        if (cfg.include_method_blank) extras.method_blank_spectra = null;
        if (cfg.include_calibration) extras.calibration_data = latestPurityResult?.calibration_data ?? null;

        // Vial intake photo — captured at Chain-of-Custody, synced to the
        // reports Drive folder as "${batch_id}.<ext>" (see
        // vial-photo-drive-sync.functions.ts). Looked up live rather than
        // stored on the sample row; a miss (no photo, or Drive hiccup)
        // returns null and must never fail the export.
        const vialPhoto = await findVialPhotoDataUri(supabaseAdmin, sample.batch_id);

        const payload = {
          batch_id: sample.batch_id,
          client: sample.client,
          project: sample.project,
          receipt_date: sample.receipt_date,
          status: sample.status,
          notes: sample.notes,
          vial_photo: vialPhoto,
          // test_type is the stable field to key off of (purity/sterility/
          // endotoxin/heavy_metals, never renamed once shipped) —
          // method_name stays free text and can be renamed anytime.
          tests: (tests ?? []).map(t => {
            if (t.test_type === "purity") {
              const approvedForTest = approvedPurityResults.filter(r => r.test_id === t.id);
              return {
                id: t.id,
                test_type: t.test_type,
                sub_id: t.sub_id,
                method_name: t.method_name,
                instrument: t.instrument,
                parameters: t.parameters,
                status: approvedForTest.length ? "available" : "pending",
                results: approvedForTest.map(r => ({
                  purity_percentage: r.purity_percentage,
                  peak_details: r.peak_details,
                  analysis_date: r.analysis_date,
                  analyst_id: r.analyst_id,
                  analyst_name: r.analyst_id ? nameById.get(r.analyst_id) ?? null : null,
                  reviewer_id: r.reviewer_id,
                  reviewer_name: r.reviewer_id ? nameById.get(r.reviewer_id) ?? null : null,
                  approved_at: r.approved_at,
                  chromatogram_png: r.chromatogram_image,
                  // calibration_png/calibration_data: unchanged shape, first/
                  // primary curve only -- do not remove or reshape, existing
                  // partner integration reads these two verbatim.
                  calibration_png: r.calibration_image,
                  calibration_data: r.calibration_data ?? null,
                  // Full per-compound set for blend reports (SUMMIT etc.) --
                  // additive field, absent/empty on older results and on
                  // single-compound reports where it'd just duplicate the
                  // two fields above.
                  calibration_curves: r.calibration_curves ?? null,
                  appearance: sample.physical_description ?? null,
                  uv_conf_match: r.uv_conf_match ?? null,
                  wavelength_nm: r.wavelength_nm ?? null,
                  report_metadata: r.report_metadata ?? null,
                })),
              };
            }
            // Sterility/endotoxin/heavy-metals: newest nonchrom_results row
            // for this test, if any. Attachments (e.g. a heavy-metals
            // sub-report) are intentionally not included here — deferred.
            const latest = nonchromResults.find(r => r.test_id === t.id) ?? null;
            const batchItem = t.test_type === "sterility" ? batchItemsByTestId.get(t.id) : undefined;
            return {
              id: t.id,
              test_type: t.test_type,
              sub_id: t.sub_id,
              method_name: t.method_name,
              instrument: t.instrument,
              parameters: t.parameters,
              status: latest ? "available" : "pending",
              ...(t.test_type === "sterility" ? {
                day3_result: mapPreliminaryStatus(batchItem?.day3_status),
                day7_result: mapPreliminaryStatus(batchItem?.day7_status),
              } : {}),
              results: latest ? [{
                data: latest.data,
                analysis_date: latest.analysis_date,
                analyst_id: latest.analyst_id,
                analyst_name: latest.analyst_id ? nameById.get(latest.analyst_id) ?? null : null,
              }] : [],
            };
          }),
          extras,
          generated_at: new Date().toISOString(),
        };

        return new Response(JSON.stringify(payload), {
          status: 200,
          headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
        });
      },
    },
  },
});