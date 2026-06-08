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

export type ResolvedMonthlyRow = MonthlyRow & {
  location_id: string | null;
  company_id: string | null;
};

export type ResolvedTopProductRow = TopProductRow & {
  location_id: string | null;
};

const BATCH = 500;

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error || !data) throw new Error("Kun administratorer kan importere salgsdata");
}

async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  const delays = [200, 600, 1800];
  let lastErr: any;
  for (let i = 0; i <= delays.length; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (i === delays.length) break;
      await new Promise((r) => setTimeout(r, delays[i]));
    }
  }
  throw new Error(`${label}: ${lastErr?.message ?? "ukendt fejl"}`);
}

export const startInvoiceImportJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { totalMonthly: number; totalTop: number }) => {
    if (!input || typeof input.totalMonthly !== "number" || typeof input.totalTop !== "number") {
      throw new Error("Ugyldig input");
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
      status: "running",
      total_monthly: data.totalMonthly,
      total_top: data.totalTop,
      saved_monthly: 0,
      saved_top: 0,
      locations_matched: 0,
      unmatched_delivery_nos: [],
      payload: {},
    } as any);
    if (error) throw new Error(error.message);
    return { jobId };
  });

export const resolveDeliveryNos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { jobId: string; deliveryNos: string[] }) => {
    if (!input?.jobId || !Array.isArray(input.deliveryNos)) throw new Error("Ugyldig input");
    return input;
  })
  .handler(async ({ data, context }): Promise<{
    map: Record<string, { location_id: string; company_id: string }>;
    unmatched: string[];
  }> => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const uniq = Array.from(new Set(data.deliveryNos.filter(Boolean)));
    const map: Record<string, { location_id: string; company_id: string }> = {};

    // Slice into safe IN-list chunks
    const SLICE = 500;
    for (let i = 0; i < uniq.length; i += SLICE) {
      const slice = uniq.slice(i, i + SLICE);
      const { data: rows, error } = await supabaseAdmin
        .from("locations")
        .select("id, company_id, visma_delivery_no")
        .in("visma_delivery_no", slice);
      if (error) throw new Error(error.message);
      for (const r of rows ?? []) {
        const k = (r as any).visma_delivery_no as string;
        if (k && !map[k]) {
          map[k] = { location_id: (r as any).id, company_id: (r as any).company_id };
        }
      }
    }

    const unmatched = uniq.filter((d) => !map[d]);

    await supabaseAdmin
      .from("invoice_import_jobs")
      .update({
        locations_matched: Object.keys(map).length,
        unmatched_delivery_nos: unmatched.slice(0, 200),
      } as any)
      .eq("id", data.jobId);

    return { map, unmatched };
  });

export const uploadSalesMonthlyChunk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { jobId: string; rows: ResolvedMonthlyRow[] }) => {
    if (!input?.jobId || !Array.isArray(input.rows)) throw new Error("Ugyldig input");
    if (input.rows.length > 2500) throw new Error("Chunk for stor");
    return input;
  })
  .handler(async ({ data, context }): Promise<{ saved: number }> => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let saved = 0;
    for (let i = 0; i < data.rows.length; i += BATCH) {
      const batch = data.rows.slice(i, i + BATCH);
      await withRetry(async () => {
        const { error } = await supabaseAdmin
          .from("sales_monthly")
          .upsert(batch as any, { onConflict: "visma_delivery_no,period,product_group_1" });
        if (error) throw error;
      }, "sales_monthly upsert");
      saved += batch.length;
    }

    // Increment progress
    const { data: cur } = await supabaseAdmin
      .from("invoice_import_jobs")
      .select("saved_monthly")
      .eq("id", data.jobId)
      .maybeSingle();
    await supabaseAdmin
      .from("invoice_import_jobs")
      .update({ saved_monthly: ((cur as any)?.saved_monthly ?? 0) + saved } as any)
      .eq("id", data.jobId);

    return { saved };
  });

export const uploadSalesTopProductsChunk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { jobId: string; rows: ResolvedTopProductRow[] }) => {
    if (!input?.jobId || !Array.isArray(input.rows)) throw new Error("Ugyldig input");
    if (input.rows.length > 2500) throw new Error("Chunk for stor");
    return input;
  })
  .handler(async ({ data, context }): Promise<{ saved: number }> => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let saved = 0;
    for (let i = 0; i < data.rows.length; i += BATCH) {
      const batch = data.rows.slice(i, i + BATCH);
      await withRetry(async () => {
        const { error } = await supabaseAdmin
          .from("sales_top_products")
          .upsert(batch as any, { onConflict: "visma_delivery_no,varenr" });
        if (error) throw error;
      }, "sales_top_products upsert");
      saved += batch.length;
    }

    const { data: cur } = await supabaseAdmin
      .from("invoice_import_jobs")
      .select("saved_top")
      .eq("id", data.jobId)
      .maybeSingle();
    await supabaseAdmin
      .from("invoice_import_jobs")
      .update({ saved_top: ((cur as any)?.saved_top ?? 0) + saved } as any)
      .eq("id", data.jobId);

    return { saved };
  });

export const finalizeInvoiceImportJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { jobId: string; status: "completed" | "failed"; errorMessage?: string }) => {
    if (!input?.jobId || (input.status !== "completed" && input.status !== "failed")) {
      throw new Error("Ugyldig input");
    }
    return input;
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("invoice_import_jobs")
      .update({
        status: data.status,
        error_message: data.errorMessage ?? null,
      } as any)
      .eq("id", data.jobId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
