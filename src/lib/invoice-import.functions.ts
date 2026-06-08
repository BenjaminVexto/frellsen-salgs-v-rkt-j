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

export type ImportInvoiceResult = {
  monthlyUpserted: number;
  topProductsUpserted: number;
  locationsMatched: number;
  deliveryNosWithoutMatch: string[];
};

export const upsertInvoiceAggregates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: ImportInvoicePayload) => {
    if (!input || !Array.isArray(input.monthly) || !Array.isArray(input.topProducts)) {
      throw new Error("Ugyldig payload");
    }
    return input;
  })
  .handler(async ({ data, context }): Promise<ImportInvoiceResult> => {
    // Admin gate
    const { data: roleRow, error: roleErr } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (roleErr || !roleRow) throw new Error("Kun administratorer kan importere salgsdata");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Build delivery_no -> {location_id, company_id} map
    const deliveryNos = Array.from(
      new Set(
        [
          ...data.monthly.map((m) => m.visma_delivery_no),
          ...data.topProducts.map((t) => t.visma_delivery_no),
        ].filter(Boolean),
      ),
    );

    const lookup = new Map<string, { location_id: string; company_id: string | null }>();
    for (let i = 0; i < deliveryNos.length; i += 500) {
      const slice = deliveryNos.slice(i, i + 500);
      const { data: locs, error } = await supabaseAdmin
        .from("locations")
        .select("id, company_id, visma_delivery_no")
        .in("visma_delivery_no", slice);
      if (error) throw error;
      (locs ?? []).forEach((l: any) => {
        if (l.visma_delivery_no && !lookup.has(l.visma_delivery_no)) {
          lookup.set(l.visma_delivery_no, {
            location_id: l.id,
            company_id: l.company_id ?? null,
          });
        }
      });
    }

    const unmatched = new Set<string>();
    deliveryNos.forEach((d) => {
      if (!lookup.has(d)) unmatched.add(d);
    });

    // --- sales_monthly upsert ---
    const monthlyRows = data.monthly
      .map((m) => {
        const hit = lookup.get(m.visma_delivery_no);
        if (!hit) return null;
        return {
          visma_delivery_no: m.visma_delivery_no,
          period: m.period,
          product_group_1: m.product_group_1,
          revenue: m.revenue,
          quantity: m.quantity,
          contribution: m.contribution,
          order_count: m.order_count,
          location_id: hit.location_id,
          company_id: hit.company_id,
          updated_at: new Date().toISOString(),
        };
      })
      .filter(Boolean) as any[];

    let monthlyUpserted = 0;
    for (let i = 0; i < monthlyRows.length; i += 500) {
      const chunk = monthlyRows.slice(i, i + 500);
      const { error } = await supabaseAdmin
        .from("sales_monthly")
        .upsert(chunk, { onConflict: "visma_delivery_no,period,product_group_1" });
      if (error) throw error;
      monthlyUpserted += chunk.length;
    }

    // --- sales_top_products: delete then insert for affected delivery_nos ---
    const affectedDeliveries = Array.from(
      new Set(data.topProducts.map((t) => t.visma_delivery_no).filter((d) => lookup.has(d))),
    );

    for (let i = 0; i < affectedDeliveries.length; i += 500) {
      const slice = affectedDeliveries.slice(i, i + 500);
      const { error } = await supabaseAdmin
        .from("sales_top_products")
        .delete()
        .in("visma_delivery_no", slice);
      if (error) throw error;
    }

    const topRows = data.topProducts
      .map((t) => {
        const hit = lookup.get(t.visma_delivery_no);
        if (!hit) return null;
        return {
          visma_delivery_no: t.visma_delivery_no,
          varenr: t.varenr,
          description: t.description,
          revenue: t.revenue,
          quantity: t.quantity,
          location_id: hit.location_id,
          updated_at: new Date().toISOString(),
        };
      })
      .filter(Boolean) as any[];

    let topProductsUpserted = 0;
    for (let i = 0; i < topRows.length; i += 500) {
      const chunk = topRows.slice(i, i + 500);
      const { error } = await supabaseAdmin
        .from("sales_top_products")
        .upsert(chunk, { onConflict: "visma_delivery_no,varenr" });
      if (error) throw error;
      topProductsUpserted += chunk.length;
    }

    return {
      monthlyUpserted,
      topProductsUpserted,
      locationsMatched: deliveryNos.length - unmatched.size,
      deliveryNosWithoutMatch: Array.from(unmatched).slice(0, 50),
    };
  });
