import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type MonthlyRow = {
  visma_delivery_no: string;
  period: string; // YYYY-MM-01
  product_group_1: string;
  revenue: number;
  quantity: number;
  contribution: number;
  order_count: number;
};

export type TopProductRow = {
  visma_delivery_no: string;
  varenr: string;
  description: string;
  revenue: number;
  quantity: number;
  contribution: number;
  product_group_1: string;
};

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error || !data) throw new Error("Kun administratorer kan importere salgsdata");
}

/**
 * Browseren uploader fakturafilen til invoice-uploads bucket og kalder denne
 * fn for at lægge jobbet i pending-kø. pg_cron-workeren parser og upserter.
 */
export const enqueueInvoiceImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { filePath: string }) => {
    if (!input?.filePath || typeof input.filePath !== "string") {
      throw new Error("filePath mangler");
    }
    return input;
  })
  .handler(async ({ data, context }): Promise<{ jobId: string }> => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const jobId = crypto.randomUUID();
    const { error } = await supabaseAdmin.from("invoice_import_jobs").insert({
      id: jobId,
      user_id: context.userId,
      status: "queued",
      phase: "uploaded",
      file_path: data.filePath,
      total_monthly: 0,
      total_top: 0,
      saved_monthly: 0,
      saved_top: 0,
      locations_matched: 0,
      unmatched_delivery_nos: [],
      payload: {},
      attempts: 0,
    } as any);
    if (error) throw new Error(error.message);
    return { jobId };
  });
