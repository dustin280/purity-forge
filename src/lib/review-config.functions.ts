/**
 * Global toggle for whether an analyst may review their own result. Read
 * by the Results tab (results-tab.tsx) to decide whether the self-review
 * block on the "Review" button applies; written only by admins.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getReviewConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("review_config")
      .select("allow_self_review")
      .eq("id", true)
      .maybeSingle();
    if (error) throw error;
    return { allow_self_review: data?.allow_self_review ?? false };
  });

export const updateReviewConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ allow_self_review: z.boolean() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("review_config")
      .update(data)
      .eq("id", true);
    if (error) throw error;
    return { ok: true };
  });
