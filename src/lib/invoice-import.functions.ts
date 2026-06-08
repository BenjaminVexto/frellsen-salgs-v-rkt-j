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
};

export type ImportInvoicePayload = {
  monthly: MonthlyRow[];
  topProducts: TopProductRow[];
};

export type InvoiceImportJobStatus = {
  id: string;
  status: "queued" | "running" | "completed" | "failed";
  total_monthly: number;
  total_top: number;
  saved_monthly: number;
  saved_top: number;
  locations_matched: number;
  unmatched_delivery_nos: string[];
  error_message: string | null;
  updated_at: string;
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

export const startInvoiceImportJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: ImportInvoicePayload) => {
    if (!input || !Array.isArray(input.monthly) || !Array.isArray(input.topProducts)) {
      throw new Error("Ugyldig payload");
    }
    return input;
  })
  .handler(async ({ data, context }): Promise<{ jobId: string }> => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Generate the job id up-front so we can name the storage object after it.
    const jobId = crypto.randomUUID();
    const payloadPath = `${context.userId}/${jobId}.json`;

    // Upload payload to Storage instead of stuffing ~10-20 MB jsonb into Postgres
    // (which trips the statement timeout on large invoice journals).
    const json = JSON.stringify(data);
    const { error: uploadErr } = await supabaseAdmin.storage
      .from("invoice-imports")
      .upload(payloadPath, json, {
        contentType: "application/json",
        upsert: true,
      });
    if (uploadErr) throw new Error("Kunne ikke uploade payload: " + uploadErr.message);

    const { error: insErr } = await supabaseAdmin
      .from("invoice_import_jobs")
      .insert({
        id: jobId,
        user_id: context.userId,
        status: "queued",
        total_monthly: data.monthly.length,
        total_top: data.topProducts.length,
        payload_path: payloadPath,
      } as any);
    if (insErr) throw new Error(insErr.message);

    // Fire-and-forget kick-off of the background worker.
    const { getRequestHost } = await import("@tanstack/react-start/server");
    const host = getRequestHost();
    const proto = host.includes("localhost") ? "http" : "https";
    const url = `${proto}://${host}/api/public/hooks/process-invoice-import`;
    const secret = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-cron-secret": secret },
      body: JSON.stringify({ jobId }),
    }).catch((e) => console.error("[invoice-import] kick-off failed", e));

    return { jobId };
  });

export const getInvoiceImportJobStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { jobId: string }) => {
    if (!input?.jobId) throw new Error("jobId mangler");
    return input;
  })
  .handler(async ({ data, context }): Promise<InvoiceImportJobStatus> => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("invoice_import_jobs")
      .select(
        "id, status, total_monthly, total_top, saved_monthly, saved_top, locations_matched, unmatched_delivery_nos, error_message, updated_at",
      )
      .eq("id", data.jobId)
      .maybeSingle();
    if (error || !row) throw new Error(error?.message ?? "Job ikke fundet");
    return {
      ...(row as any),
      unmatched_delivery_nos: Array.isArray((row as any).unmatched_delivery_nos)
        ? ((row as any).unmatched_delivery_nos as string[])
        : [],
    };
  });

/** Kept for backwards compat in case anything still imports it. */
export type ImportInvoiceResult = {
  monthlyUpserted: number;
  topProductsUpserted: number;
  locationsMatched: number;
  deliveryNosWithoutMatch: string[];
};
