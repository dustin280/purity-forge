import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const imageSchema = z.object({
  data_url: z.string().min(32).max(12_000_000),
  name: z.string().max(300).optional(),
});

export const scannedReceiptSchema = z.object({
  material_type: z.enum(["controlled", "uncontrolled"]).nullable().optional(),
  material_name: z.string().nullable().optional(),
  manufacturer: z.string().nullable().optional(),
  supplier: z.string().nullable().optional(),
  manufacturer_lot: z.string().nullable().optional(),
  catalog_number: z.string().nullable().optional(),
  quantity: z.number().nullable().optional(),
  unit: z.string().nullable().optional(),
  expiry_date: z.string().nullable().optional(),
  po_number: z.string().nullable().optional(),
  invoice_number: z.string().nullable().optional(),
  invoice_date: z.string().nullable().optional(),
  unit_price: z.number().nullable().optional(),
  total_price: z.number().nullable().optional(),
  tax_amount: z.number().nullable().optional(),
  shipping_cost: z.number().nullable().optional(),
  currency: z.string().nullable().optional(),
  freight_tracking_number: z.string().nullable().optional(),
  container_details: z.string().nullable().optional(),
  purity_percent: z.number().nullable().optional(),
  storage_location: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  confidence: z.number().nullable().optional(),
  summary: z.string().nullable().optional(),
});

export type ScannedReceipt = z.infer<typeof scannedReceiptSchema>;

const SYSTEM_PROMPT = `You extract structured material-receipt data from photos of invoices, packing slips, chemical container labels, CoAs and shipping boxes for a pharmaceutical analytical lab.

Return ONLY a JSON object (no markdown fences) with these keys, using null when the value is not visible:
material_type ("controlled" for chemicals/reagents/reference standards/solvents that need lot tracking, "uncontrolled" for consumables, glassware, parts, office/lab supplies),
material_name, manufacturer, supplier, manufacturer_lot, catalog_number,
quantity (number), unit (e.g. g, mg, mL, L, ea, box),
expiry_date (YYYY-MM-DD), po_number, invoice_number, invoice_date (YYYY-MM-DD),
unit_price, total_price, tax_amount, shipping_cost, currency (ISO code, default USD when a $ amount is present),
freight_tracking_number, container_details (container type/size/seal condition),
purity_percent (number), storage_location (e.g. "2-8 C", "Room temp"),
notes (anything else useful, short),
confidence (0-1 overall), summary (one short sentence about what was scanned).

Never invent values. Numbers must be plain numbers without currency symbols or units.`;

export const scanMaterialReceipt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ images: z.array(imageSchema).min(1).max(4) }).parse(d),
  )
  .handler(async ({ data }) => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("AI is not configured for this project.");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: "Extract the material receipt fields from these images." },
              ...data.images.map((i) => ({
                type: "image_url" as const,
                image_url: { url: i.data_url },
              })),
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      if (res.status === 429) throw new Error("AI rate limit reached — wait a moment and scan again.");
      if (res.status === 402) throw new Error("AI credits are exhausted for this workspace. Add credits to keep scanning.");
      if (res.status === 403) throw new Error("AI access is blocked for this workspace.");
      throw new Error(`Scan failed (${res.status}): ${body.slice(0, 300)}`);
    }

    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const raw = json.choices?.[0]?.message?.content ?? "";
    const cleaned = raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start === -1 || end === -1) throw new Error("The scan did not return readable data. Try a clearer photo.");
    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      throw new Error("The scan did not return readable data. Try a clearer photo.");
    }
    const result = scannedReceiptSchema.safeParse(parsed);
    if (!result.success) return {} as ScannedReceipt;
    return result.data;
  });
