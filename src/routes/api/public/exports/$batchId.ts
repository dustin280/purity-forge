import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

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
        if (sample.status !== "approved") {
          return new Response(JSON.stringify({ error: "Sample not approved", status: sample.status }), {
            status: 409, headers: { "Content-Type": "application/json" },
          });
        }
        const { data: tests } = await supabaseAdmin.from("tests").select("*").eq("sample_id", sample.id);
        const testIds = (tests ?? []).map(t => t.id);
        const results = testIds.length
          ? (await supabaseAdmin.from("results").select("*").in("test_id", testIds)).data ?? []
          : [];

        // uuid -> display name, same precedence as profileDisplayName (src/hooks/use-auth.tsx):
        // first+last name, then full_name, then email.
        const userIds = Array.from(new Set(
          results.flatMap(r => [r.analyst_id, r.reviewer_id]).filter((id): id is string => !!id)
        ));
        const profiles = userIds.length
          ? (await supabaseAdmin.from("profiles").select("id,full_name,first_name,last_name,email").in("id", userIds)).data ?? []
          : [];
        const nameById = new Map(profiles.map(p => {
          const fl = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
          return [p.id, fl || p.full_name || p.email || null] as const;
        }));

        const extras: Record<string, unknown> = {};
        if (cfg.include_lcs) extras.lcs_recovery = null;
        if (cfg.include_ccv) extras.ccv_recovery = null;
        if (cfg.include_method_blank) extras.method_blank_spectra = null;
        if (cfg.include_calibration) extras.calibration_data = null;

        const payload = {
          batch_id: sample.batch_id,
          client: sample.client,
          project: sample.project,
          receipt_date: sample.receipt_date,
          status: sample.status,
          notes: sample.notes,
          tests: (tests ?? []).map(t => ({
            id: t.id,
            method_name: t.method_name,
            instrument: t.instrument,
            parameters: t.parameters,
            results: results.filter(r => r.test_id === t.id).map(r => ({
              purity_percentage: r.purity_percentage,
              peak_details: r.peak_details,
              analysis_date: r.analysis_date,
              analyst_id: r.analyst_id,
              analyst_name: r.analyst_id ? nameById.get(r.analyst_id) ?? null : null,
              reviewer_id: r.reviewer_id,
              reviewer_name: r.reviewer_id ? nameById.get(r.reviewer_id) ?? null : null,
              approved_at: r.approved_at,
              chromatogram_png: r.chromatogram_image,
              appearance: sample.physical_description ?? null,
              uv_conf_match: r.uv_conf_match ?? null,
              wavelength_nm: r.wavelength_nm ?? null,
              report_metadata: r.report_metadata ?? null,
            })),
          })),
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