import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { verifyPartnerRequest } from "@/lib/partner-webhook-auth.server";

/**
 * Canonical compound registry for partner-side name matching (Wayne's
 * intake portal) -- same auth pattern as the other /api/public endpoints.
 * Lets their system resolve market/shorthand names (e.g. "RETA", "KLOW")
 * to the exact identity purity-forge uses, instead of guessing from
 * free-text product names at order time.
 *
 * POST registers a new compound or blend when either side encounters one
 * we don't have yet. Signed like order intake (x-signature, not x-api-key)
 * since it writes data. New rows land with is_active=false -- invisible to
 * the lab's own intake picker and to this same GET -- until reviewed and
 * activated from the Compounds admin page.
 */

const createCompoundSchema = z.object({
  name: z.string().min(1).max(160).trim(),
  is_blend: z.boolean().default(false),
  cas_number: z.string().max(200).trim().nullable().optional(),
  molecular_formula: z.string().max(500).trim().nullable().optional(),
  aliases: z.array(z.string().max(100).trim()).max(50).optional(),
  components: z
    .array(
      z.object({
        name: z.string().min(1).max(160).trim(),
        amount_value: z.number().nullable().optional(),
        amount_unit: z.string().max(20).trim().nullable().optional(),
      }),
    )
    .max(20)
    .optional(),
});

export const Route = createFileRoute("/api/public/compounds/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const apiKey = request.headers.get("x-api-key");
        const { data: cfg } = await supabaseAdmin
          .from("export_config").select("*").limit(1).maybeSingle();
        if (!cfg || !cfg.is_active) return new Response("Export disabled", { status: 403 });
        if (!apiKey || apiKey !== cfg.api_key) return new Response("Unauthorized", { status: 401 });

        const { data: compounds, error } = await supabaseAdmin
          .from("compounds")
          .select("id, name, aliases, cas_number, molecular_formula, is_blend, is_active")
          .order("name", { ascending: true });
        if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { "Content-Type": "application/json" } });

        const { data: blendRows, error: blendErr } = await supabaseAdmin
          .from("compound_blend_components")
          .select("blend_id, nominal_amount_value, nominal_amount_unit, sort_order, compound:compounds!compound_blend_components_component_id_fkey(name)")
          .order("sort_order", { ascending: true });
        if (blendErr) return new Response(JSON.stringify({ error: blendErr.message }), { status: 500, headers: { "Content-Type": "application/json" } });

        const componentsByBlend = new Map<string, Array<{ name: string; amount_value: number | null; amount_unit: string | null }>>();
        for (const row of blendRows ?? []) {
          const list = componentsByBlend.get(row.blend_id) ?? [];
          list.push({
            name: (row.compound as unknown as { name: string } | null)?.name ?? "",
            amount_value: row.nominal_amount_value,
            amount_unit: row.nominal_amount_unit,
          });
          componentsByBlend.set(row.blend_id, list);
        }

        const result = (compounds ?? []).map((c) => ({
          id: c.id,
          name: c.name,
          aliases: c.aliases ?? [],
          cas_number: c.cas_number,
          molecular_formula: c.molecular_formula,
          is_blend: c.is_blend,
          is_active: c.is_active,
          blend_components: c.is_blend ? (componentsByBlend.get(c.id) ?? []) : undefined,
        }));

        return new Response(JSON.stringify({
          compounds: result,
          generated_at: new Date().toISOString(),
        }), {
          status: 200,
          headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
        });
      },

      POST: async ({ request }) => {
        const rawBody = await request.text();
        const signature = request.headers.get("x-signature");
        const matched = await verifyPartnerRequest(rawBody, signature);
        if (!matched) return new Response("Invalid signature", { status: 401 });

        let json: unknown;
        try {
          json = JSON.parse(rawBody);
        } catch {
          return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        const parsed = createCompoundSchema.safeParse(json);
        if (!parsed.success) {
          return new Response(
            JSON.stringify({ error: "validation_error", issues: parsed.error.issues.slice(0, 10) }),
            { status: 400, headers: { "Content-Type": "application/json" } },
          );
        }
        const p = parsed.data;

        // Idempotent by name: repeated submissions of the same compound just
        // return the existing row rather than erroring or duplicating.
        const { data: existing, error: lookupErr } = await supabaseAdmin
          .from("compounds")
          .select("id, name, is_active, is_blend")
          .ilike("name", p.name)
          .maybeSingle();
        if (lookupErr) {
          return new Response(JSON.stringify({ error: lookupErr.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (existing) {
          return new Response(
            JSON.stringify({ ok: true, status: "existing", id: existing.id, name: existing.name, is_active: existing.is_active }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }

        // Blend components must already exist as their own compounds -- we
        // never silently create a nested unknown. Resolved case-insensitively
        // since partner-side casing can't be relied on to match ours.
        let componentRows: Array<{ component_id: string; nominal_amount_value: number | null; nominal_amount_unit: string | null; sort_order: number }> = [];
        if (p.is_blend) {
          if (!p.components || p.components.length === 0) {
            return new Response(JSON.stringify({ error: "blend_requires_components" }), {
              status: 400,
              headers: { "Content-Type": "application/json" },
            });
          }
          const missing: string[] = [];
          for (let i = 0; i < p.components.length; i++) {
            const comp = p.components[i];
            const { data: found, error: findErr } = await supabaseAdmin
              .from("compounds")
              .select("id")
              .ilike("name", comp.name)
              .maybeSingle();
            if (findErr) {
              return new Response(JSON.stringify({ error: findErr.message }), {
                status: 500,
                headers: { "Content-Type": "application/json" },
              });
            }
            if (!found) {
              missing.push(comp.name);
              continue;
            }
            componentRows.push({
              component_id: found.id as string,
              nominal_amount_value: comp.amount_value ?? null,
              nominal_amount_unit: comp.amount_unit ?? null,
              sort_order: i,
            });
          }
          if (missing.length > 0) {
            return new Response(
              JSON.stringify({ error: "unknown_components", missing_component_names: missing }),
              { status: 422, headers: { "Content-Type": "application/json" } },
            );
          }
        }

        const { data: created, error: insertErr } = await supabaseAdmin
          .from("compounds")
          .insert({
            name: p.name,
            is_blend: p.is_blend,
            is_active: false,
            cas_number: p.cas_number ?? null,
            molecular_formula: p.molecular_formula ?? null,
            aliases: p.aliases && p.aliases.length ? p.aliases : null,
          })
          .select("id, name, is_active, is_blend")
          .single();
        if (insertErr) {
          return new Response(JSON.stringify({ error: insertErr.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        if (p.is_blend && componentRows.length > 0) {
          const { error: componentsErr } = await supabaseAdmin
            .from("compound_blend_components")
            .insert(componentRows.map((c) => ({ ...c, blend_id: created.id })));
          if (componentsErr) {
            // Best-effort cleanup so a partial blend doesn't linger as a
            // component-less "blend" row.
            await supabaseAdmin.from("compounds").delete().eq("id", created.id);
            return new Response(JSON.stringify({ error: componentsErr.message }), {
              status: 500,
              headers: { "Content-Type": "application/json" },
            });
          }
        }

        return new Response(
          JSON.stringify({ ok: true, status: "pending_review", id: created.id, name: created.name, is_active: created.is_active }),
          { status: 201, headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});
