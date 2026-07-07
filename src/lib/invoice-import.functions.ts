import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type MonthlyRow = {
  visma_delivery_no: string;
  period: string; // YYYY-MM-01
  product_group_1: string;
  revenue: number;
  quantity: number;
  contribution: number;
  weight_kg: number;
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
 * Slå mange delivery_nos op én gang fra klienten. Returnerer kun match —
 * unmatched udledes på klienten ved at sammenligne mod input.
 */
export const resolveDeliveryNos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { deliveryNos: string[] }) => {
    if (!Array.isArray(input?.deliveryNos)) throw new Error("deliveryNos skal være array");
    return input;
  })
  .handler(
    async ({
      data,
      context,
    }): Promise<{ map: Record<string, { location_id: string; company_id: string }> }> => {
      await assertAdmin(context.supabase, context.userId);
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const uniq = Array.from(new Set(data.deliveryNos.filter(Boolean)));
      const map: Record<string, { location_id: string; company_id: string }> = {};
      const SLICE = 500;
      for (let i = 0; i < uniq.length; i += SLICE) {
        const slice = uniq.slice(i, i + SLICE);
        const { data: rows, error } = await supabaseAdmin
          .from("locations")
          .select("id, company_id, visma_delivery_no")
          .in("visma_delivery_no", slice);
        if (error) throw new Error(error.message);
        for (const r of rows ?? []) {
          const k = r.visma_delivery_no as string;
          if (k && !map[k]) map[k] = { location_id: r.id, company_id: r.company_id };
        }
      }
      return { map };
    },
  );

/**
 * Browseren har allerede parset filen, opslået locations og uploadet
 * chunk-filer ({jobId}/monthly-N.json + top-N.json) til invoice-uploads.
 * Denne fn registrerer jobbet direkte i "monthly"-fasen — workeren downloader
 * én chunk pr. tick og laver kun de idempotente DB-upserts.
 */
export const enqueueInvoiceImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      jobId: string;
      totalMonthly: number;
      totalTop: number;
      locationsMatched: number;
      unmatched: string[];
    }) => {
      if (!input?.jobId) throw new Error("jobId mangler");
      return input;
    },
  )
  .handler(async ({ data, context }): Promise<{ jobId: string }> => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error } = await supabaseAdmin.from("invoice_import_jobs").insert({
      id: data.jobId,
      user_id: context.userId,
      status: "queued",
      phase: data.totalMonthly > 0 ? "monthly" : "top",
      file_path: null,
      aggregated_path: data.jobId, // chunk-prefix i invoice-uploads bucket
      total_monthly: data.totalMonthly,
      total_top: data.totalTop,
      saved_monthly: 0,
      saved_top: 0,
      locations_matched: data.locationsMatched,
      unmatched_delivery_nos: data.unmatched.slice(0, 500),
      payload: {},
      attempts: 0,
    } as any);
    if (error) throw new Error(error.message);
    return { jobId: data.jobId };
  });
