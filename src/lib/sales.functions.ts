import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SalesMonthlyRow, TopProductRow } from "./sales-utils";

async function isAdminUser(supabase: any, userId: string): Promise<boolean> {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  return !!data;
}

function stripContribution(rows: any[]): SalesMonthlyRow[] {
  return rows.map((r) => ({
    visma_delivery_no: r.visma_delivery_no,
    location_id: r.location_id,
    company_id: r.company_id,
    period: r.period,
    product_group_1: r.product_group_1,
    revenue: Number(r.revenue) || 0,
    quantity: Number(r.quantity) || 0,
    contribution: null,
    order_count: r.order_count ?? 0,
  }));
}

function withContribution(rows: any[]): SalesMonthlyRow[] {
  return rows.map((r) => ({
    visma_delivery_no: r.visma_delivery_no,
    location_id: r.location_id,
    company_id: r.company_id,
    period: r.period,
    product_group_1: r.product_group_1,
    revenue: Number(r.revenue) || 0,
    quantity: Number(r.quantity) || 0,
    contribution: Number(r.contribution) || 0,
    order_count: r.order_count ?? 0,
  }));
}

export const getSalesForCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string }) => {
    if (!input?.companyId) throw new Error("companyId krævet");
    return input;
  })
  .handler(async ({ data, context }): Promise<{ rows: SalesMonthlyRow[]; isAdmin: boolean }> => {
    const isAdmin = await isAdminUser(context.supabase, context.userId);
    const { data: rows, error } = await context.supabase
      .from("sales_monthly")
      .select("visma_delivery_no, location_id, company_id, period, product_group_1, revenue, quantity, contribution, order_count")
      .eq("company_id", data.companyId)
      .order("period", { ascending: true });
    if (error) throw error;
    return {
      rows: isAdmin ? withContribution(rows ?? []) : stripContribution(rows ?? []),
      isAdmin,
    };
  });

export const getSalesForLocation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { locationId: string }) => {
    if (!input?.locationId) throw new Error("locationId krævet");
    return input;
  })
  .handler(async ({ data, context }): Promise<{ rows: SalesMonthlyRow[]; topProducts: TopProductRow[]; isAdmin: boolean }> => {
    const isAdmin = await isAdminUser(context.supabase, context.userId);
    const [monthlyRes, topRes] = await Promise.all([
      context.supabase
        .from("sales_monthly")
        .select("visma_delivery_no, location_id, company_id, period, product_group_1, revenue, quantity, contribution, order_count")
        .eq("location_id", data.locationId)
        .order("period", { ascending: true }),
      context.supabase
        .from("sales_top_products")
        .select("visma_delivery_no, location_id, varenr, description, revenue, quantity")
        .eq("location_id", data.locationId)
        .order("revenue", { ascending: false })
        .limit(15),
    ]);
    if (monthlyRes.error) throw monthlyRes.error;
    if (topRes.error) throw topRes.error;
    return {
      rows: isAdmin ? withContribution(monthlyRes.data ?? []) : stripContribution(monthlyRes.data ?? []),
      topProducts: (topRes.data ?? []).map((t: any) => ({
        visma_delivery_no: t.visma_delivery_no,
        location_id: t.location_id,
        varenr: t.varenr,
        description: t.description,
        revenue: Number(t.revenue) || 0,
        quantity: Number(t.quantity) || 0,
      })),
      isAdmin,
    };
  });

export const getLocationSalesSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { locationIds: string[] }) => {
    if (!Array.isArray(input?.locationIds)) throw new Error("locationIds krævet");
    return input;
  })
  .handler(async ({ data, context }): Promise<Record<string, { revenue12m: number; lastPeriod: string | null }>> => {
    if (data.locationIds.length === 0) return {};
    const cutoff = new Date();
    cutoff.setUTCMonth(cutoff.getUTCMonth() - 12);
    cutoff.setUTCDate(1);
    const cutoffStr = `${cutoff.getUTCFullYear()}-${String(cutoff.getUTCMonth() + 1).padStart(2, "0")}-01`;

    const out: Record<string, { revenue12m: number; lastPeriod: string | null }> = {};
    for (let i = 0; i < data.locationIds.length; i += 200) {
      const slice = data.locationIds.slice(i, i + 200);
      const { data: rows, error } = await context.supabase
        .from("sales_monthly")
        .select("location_id, period, revenue")
        .in("location_id", slice)
        .gte("period", cutoffStr);
      if (error) throw error;
      (rows ?? []).forEach((r: any) => {
        if (!r.location_id) return;
        const cur = out[r.location_id] ?? { revenue12m: 0, lastPeriod: null };
        const rev = Number(r.revenue) || 0;
        cur.revenue12m += rev;
        if (rev > 0 && (!cur.lastPeriod || r.period > cur.lastPeriod)) cur.lastPeriod = r.period;
        out[r.location_id] = cur;
      });
    }
    return out;
  });

// --- Seller dashboard ---

async function getSellerCompanyIds(supabase: any, userId: string): Promise<string[]> {
  const ids = new Set<string>();
  const [{ data: assigned }, { data: assignments }, { data: opps }] = await Promise.all([
    supabase.from("companies").select("id").eq("assigned_to", userId),
    supabase.from("contact_list_assignments").select("company_id").eq("assigned_to", userId),
    supabase.from("sales_opportunities").select("company_id").eq("assigned_to", userId),
  ]);
  (assigned ?? []).forEach((r: any) => r.id && ids.add(r.id));
  (assignments ?? []).forEach((r: any) => r.company_id && ids.add(r.company_id));
  (opps ?? []).forEach((r: any) => r.company_id && ids.add(r.company_id));
  return Array.from(ids);
}

export const getMyMonthlySales = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ revenue: number; companies: number; period: string }> => {
    const companyIds = await getSellerCompanyIds(context.supabase, context.userId);
    const d = new Date();
    const period = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
    if (!companyIds.length) return { revenue: 0, companies: 0, period };

    let revenue = 0;
    const compsWithSales = new Set<string>();
    for (let i = 0; i < companyIds.length; i += 200) {
      const slice = companyIds.slice(i, i + 200);
      const { data, error } = await context.supabase
        .from("sales_monthly")
        .select("company_id, revenue")
        .in("company_id", slice)
        .eq("period", period);
      if (error) throw error;
      (data ?? []).forEach((r: any) => {
        revenue += Number(r.revenue) || 0;
        if (r.company_id) compsWithSales.add(r.company_id);
      });
    }
    return { revenue, companies: compsWithSales.size, period };
  });

export const getMyNewActivitiesCount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ count: number }> => {
    const d = new Date();
    const monthStart = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
    const { count, error } = await context.supabase
      .from("activities")
      .select("id", { count: "exact", head: true })
      .eq("created_by", context.userId)
      .gte("created_at", monthStart);
    if (error) throw error;
    return { count: count ?? 0 };
  });

export type ChurningCustomer = {
  company_id: string;
  company_name: string;
  daysSinceLastPurchase: number;
  monthlyAverageRevenue: number;
  monthsWithPurchases: number;
};

export const getMyChurningCustomers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ customers: ChurningCustomer[]; hasData: boolean }> => {
    const companyIds = await getSellerCompanyIds(context.supabase, context.userId);
    if (!companyIds.length) return { customers: [], hasData: false };

    // Fetch all sales for these companies (last 24 months)
    const cutoff = new Date();
    cutoff.setUTCMonth(cutoff.getUTCMonth() - 24);
    cutoff.setUTCDate(1);
    const cutoffStr = `${cutoff.getUTCFullYear()}-${String(cutoff.getUTCMonth() + 1).padStart(2, "0")}-01`;

    type Row = { company_id: string; period: string; revenue: number };
    const rows: Row[] = [];
    for (let i = 0; i < companyIds.length; i += 200) {
      const slice = companyIds.slice(i, i + 200);
      const { data, error } = await context.supabase
        .from("sales_monthly")
        .select("company_id, period, revenue")
        .in("company_id", slice)
        .gte("period", cutoffStr);
      if (error) throw error;
      (data ?? []).forEach((r: any) => {
        if (r.company_id) rows.push({ company_id: r.company_id, period: r.period, revenue: Number(r.revenue) || 0 });
      });
    }
    if (!rows.length) return { customers: [], hasData: false };

    // Group by company
    type Acc = { periods: Set<string>; lastPeriod: string | null; totalRevenue: number };
    const byCompany = new Map<string, Acc>();
    for (const r of rows) {
      const acc = byCompany.get(r.company_id) ?? { periods: new Set(), lastPeriod: null, totalRevenue: 0 };
      if (r.revenue > 0) {
        acc.periods.add(r.period);
        acc.totalRevenue += r.revenue;
        if (!acc.lastPeriod || r.period > acc.lastPeriod) acc.lastPeriod = r.period;
      }
      byCompany.set(r.company_id, acc);
    }

    // Filter: had >=3 months of purchases, and last purchase >60 days ago
    const cutoffDays = 60;
    const now = Date.now();
    const candidates: { company_id: string; daysSinceLastPurchase: number; monthsWithPurchases: number; monthlyAverageRevenue: number }[] = [];
    byCompany.forEach((acc, company_id) => {
      if (!acc.lastPeriod || acc.periods.size < 3) return;
      const last = new Date(acc.lastPeriod + "T00:00:00Z").getTime();
      const days = Math.floor((now - last) / 86400000);
      // last purchase month already passed by 60+ days; check at month-end
      const monthEnd = new Date(acc.lastPeriod + "T00:00:00Z");
      monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1);
      const daysSinceMonthEnd = Math.floor((now - monthEnd.getTime()) / 86400000);
      if (daysSinceMonthEnd < cutoffDays) return;
      candidates.push({
        company_id,
        daysSinceLastPurchase: days,
        monthsWithPurchases: acc.periods.size,
        monthlyAverageRevenue: acc.totalRevenue / acc.periods.size,
      });
    });

    candidates.sort((a, b) => b.monthlyAverageRevenue - a.monthlyAverageRevenue);
    const top = candidates.slice(0, 10);
    if (!top.length) return { customers: [], hasData: true };

    const { data: comps, error: compErr } = await context.supabase
      .from("companies")
      .select("id, name")
      .in("id", top.map((c) => c.company_id));
    if (compErr) throw compErr;
    const nameMap = new Map<string, string>();
    (comps ?? []).forEach((c: any) => nameMap.set(c.id, c.name));

    return {
      customers: top.map((c) => ({
        company_id: c.company_id,
        company_name: nameMap.get(c.company_id) ?? "Ukendt",
        daysSinceLastPurchase: c.daysSinceLastPurchase,
        monthlyAverageRevenue: c.monthlyAverageRevenue,
        monthsWithPurchases: c.monthsWithPurchases,
      })),
      hasData: true,
    };
  });
