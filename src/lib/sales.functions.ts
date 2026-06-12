import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { parseProductGroup, type SalesMonthlyRow, type TopProductRow } from "./sales-utils";
import { getCompaniesSuppliedByOthers } from "./relations.functions";

const SALES_COLS_BASE = "visma_delivery_no, location_id, company_id, period, product_group_1, revenue, quantity, order_count";
const SALES_COLS_ADMIN = SALES_COLS_BASE + ", contribution";


async function isAdminUser(supabase: any, userId: string): Promise<boolean> {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  return !!data;
}

const SALES_PAGE_SIZE = 1000;

async function fetchAllSalesMonthlyRows(
  queryPage: (from: number, to: number) => PromiseLike<{ data: any[] | null; error: any }>,
): Promise<any[]> {

  const rows: any[] = [];
  for (let from = 0; ; from += SALES_PAGE_SIZE) {
    const to = from + SALES_PAGE_SIZE - 1;
    const { data, error } = await queryPage(from, to);
    if (error) throw error;
    const page = data ?? [];
    rows.push(...page);
    if (page.length < SALES_PAGE_SIZE) break;
  }
  return rows;
}

/**
 * Fetch all rows for an `.in(column, ids)` query — chunks the id list to avoid
 * URL-length limits AND paginates each chunk to bypass the 1000-row PostgREST cap.
 */
async function fetchAllInChunks(
  ids: string[],
  chunkSize: number,
  queryPage: (slice: string[], from: number, to: number) => PromiseLike<{ data: any[] | null; error: any }>,
): Promise<any[]> {
  const rows: any[] = [];
  for (let i = 0; i < ids.length; i += chunkSize) {
    const slice = ids.slice(i, i + chunkSize);
    for (let from = 0; ; from += SALES_PAGE_SIZE) {
      const to = from + SALES_PAGE_SIZE - 1;
      const { data, error } = await queryPage(slice, from, to);
      if (error) throw error;
      const page = data ?? [];
      rows.push(...page);
      if (page.length < SALES_PAGE_SIZE) break;
    }
  }
  return rows;
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
  .handler(async ({ data, context }): Promise<{ rows: SalesMonthlyRow[]; isAdmin: boolean; hasActiveEquipment: boolean }> => {
    const isAdmin = await isAdminUser(context.supabase, context.userId);
    const salesClient = isAdmin ? supabaseAdmin : context.supabase;
    const cols = isAdmin ? SALES_COLS_ADMIN : SALES_COLS_BASE;
    const [rows, companyRes] = await Promise.all([
      fetchAllSalesMonthlyRows(async (from, to) => {
        return await salesClient
          .from("sales_monthly")
          .select(cols)
          .eq("company_id", data.companyId)
          .order("period", { ascending: true })
          .order("visma_delivery_no", { ascending: true })
          .order("product_group_1", { ascending: true })
          .range(from, to);
      }),
      context.supabase
        .from("companies")
        .select("has_active_equipment")
        .eq("id", data.companyId)
        .maybeSingle(),
    ]);
    return {
      rows: isAdmin ? withContribution(rows ?? []) : stripContribution(rows ?? []),
      isAdmin,
      hasActiveEquipment: !!(companyRes.data as any)?.has_active_equipment,
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
    const salesClient = isAdmin ? supabaseAdmin : context.supabase;
    const cols = isAdmin ? SALES_COLS_ADMIN : SALES_COLS_BASE;
    const topCols = isAdmin
      ? "visma_delivery_no, location_id, varenr, description, revenue, quantity, contribution"
      : "visma_delivery_no, location_id, varenr, description, revenue, quantity";
    const [monthlyRes, topRes] = await Promise.all([
      fetchAllSalesMonthlyRows(async (from, to) => {
        return await salesClient
          .from("sales_monthly")
          .select(cols)
          .eq("location_id", data.locationId)
          .order("period", { ascending: true })
          .order("visma_delivery_no", { ascending: true })
          .order("product_group_1", { ascending: true })
          .range(from, to);
      }),
      salesClient
        .from("sales_top_products")
        .select(topCols)
        .eq("location_id", data.locationId)
        .order("revenue", { ascending: false })
        .limit(15),
    ]);
    if (topRes.error) throw topRes.error;
    return {
      rows: isAdmin ? withContribution(monthlyRes ?? []) : stripContribution(monthlyRes ?? []),
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

export type CategoryTopProduct = {
  varenr: string;
  description: string;
  revenue: number;
  quantity: number;
  contribution: number | null;
};

export const getTopProductsForCompanyCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; categoryLabel: string }) => {
    if (!input?.companyId || !input?.categoryLabel) throw new Error("input krævet");
    return input;
  })
  .handler(async ({ data, context }): Promise<{ topProducts: CategoryTopProduct[]; isAdmin: boolean }> => {
    const isAdmin = await isAdminUser(context.supabase, context.userId);
    const { data: locs, error: lerr } = await context.supabase
      .from("locations")
      .select("id")
      .eq("company_id", data.companyId);
    if (lerr) throw lerr;
    const locIds = (locs ?? []).map((l: any) => l.id).filter(Boolean);
    if (!locIds.length) return { topProducts: [], isAdmin };

    const rows = await fetchAllInChunks(locIds, 100, (slice, from, to) =>
      context.supabase
        .from("sales_top_products")
        .select("varenr, description, revenue, quantity, contribution, product_group_1")
        .in("location_id", slice)
        .range(from, to),
    );


    const target = data.categoryLabel;
    const filtered = rows.filter((r) => parseProductGroup(r.product_group_1) === target);

    const map = new Map<string, { varenr: string; description: string; revenue: number; quantity: number; contribution: number }>();
    for (const r of filtered) {
      const cur = map.get(r.varenr) ?? { varenr: r.varenr, description: r.description ?? "", revenue: 0, quantity: 0, contribution: 0 };
      cur.revenue += Number(r.revenue) || 0;
      cur.quantity += Number(r.quantity) || 0;
      cur.contribution += Number(r.contribution) || 0;
      if (!cur.description && r.description) cur.description = r.description;
      map.set(r.varenr, cur);
    }
    const top = Array.from(map.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10)
      .map((t) => ({
        varenr: t.varenr,
        description: t.description,
        revenue: t.revenue,
        quantity: t.quantity,
        contribution: isAdmin ? t.contribution : null,
      }));
    return { topProducts: top, isAdmin };
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
    const rows = await fetchAllInChunks(data.locationIds, 100, (slice, from, to) =>
      context.supabase
        .from("sales_monthly")
        .select("location_id, period, revenue")
        .in("location_id", slice)
        .gte("period", cutoffStr)
        .range(from, to),
    );
    rows.forEach((r: any) => {
      if (!r.location_id) return;
      const cur = out[r.location_id] ?? { revenue12m: 0, lastPeriod: null };
      const rev = Number(r.revenue) || 0;
      cur.revenue12m += rev;
      if (rev > 0 && (!cur.lastPeriod || r.period > cur.lastPeriod)) cur.lastPeriod = r.period;
      out[r.location_id] = cur;
    });
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
  .handler(async ({ context }): Promise<{
    revenue: number;
    companies: number;
    period: string;
    revenueLastYear: number;
    periodLastYear: string;
    comparisonMode: "full_month";
  }> => {
    const companyIds = await getSellerCompanyIds(context.supabase, context.userId);
    const d = new Date();
    const period = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
    const periodLastYear = `${d.getUTCFullYear() - 1}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
    if (!companyIds.length) {
      return { revenue: 0, companies: 0, period, revenueLastYear: 0, periodLastYear, comparisonMode: "full_month" };
    }

    let revenue = 0;
    let revenueLastYear = 0;
    const compsWithSales = new Set<string>();
    const rows = await fetchAllInChunks(companyIds, 100, (slice, from, to) =>
      context.supabase
        .from("sales_monthly")
        .select("company_id, period, revenue")
        .in("company_id", slice)
        .in("period", [period, periodLastYear])
        .range(from, to),
    );
    rows.forEach((r: any) => {
      const rev = Number(r.revenue) || 0;
      if (r.period === period) {
        revenue += rev;
        if (r.company_id) compsWithSales.add(r.company_id);
      } else if (r.period === periodLastYear) {
        revenueLastYear += rev;
      }
    });

    return {
      revenue,
      companies: compsWithSales.size,
      period,
      revenueLastYear,
      periodLastYear,
      comparisonMode: "full_month",
    };
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

    const cutoff = new Date();
    cutoff.setUTCMonth(cutoff.getUTCMonth() - 24);
    cutoff.setUTCDate(1);
    const cutoffStr = `${cutoff.getUTCFullYear()}-${String(cutoff.getUTCMonth() + 1).padStart(2, "0")}-01`;

    type Row = { company_id: string; period: string; revenue: number };
    const rawRows = await fetchAllInChunks(companyIds, 100, (slice, from, to) =>
      context.supabase
        .from("sales_monthly")
        .select("company_id, period, revenue")
        .in("company_id", slice)
        .gte("period", cutoffStr)
        .range(from, to),
    );
    const rows: Row[] = rawRows
      .filter((r: any) => r.company_id)
      .map((r: any) => ({ company_id: r.company_id, period: r.period, revenue: Number(r.revenue) || 0 }));

    if (!rows.length) return { customers: [], hasData: false };

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

    const cutoffDays = 60;
    const now = Date.now();
    const candidates: { company_id: string; lastPeriod: string; daysSinceLastPurchase: number; monthsWithPurchases: number; monthlyAverageRevenue: number }[] = [];
    byCompany.forEach((acc, company_id) => {
      if (!acc.lastPeriod || acc.periods.size < 3) return;
      const last = new Date(acc.lastPeriod + "T00:00:00Z").getTime();
      const days = Math.floor((now - last) / 86400000);
      const monthEnd = new Date(acc.lastPeriod + "T00:00:00Z");
      monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1);
      const daysSinceMonthEnd = Math.floor((now - monthEnd.getTime()) / 86400000);
      if (daysSinceMonthEnd < cutoffDays) return;
      candidates.push({
        company_id,
        lastPeriod: acc.lastPeriod,
        daysSinceLastPurchase: days,
        monthsWithPurchases: acc.periods.size,
        monthlyAverageRevenue: acc.totalRevenue / acc.periods.size,
      });
    });

    if (!candidates.length) return { customers: [], hasData: true };

    // Filter out dismissed (reset rule: any consumable purchase after dismissal ignores it)
    const candIds = candidates.map((c) => c.company_id);
    const { data: dismissals } = await context.supabase
      .from("churn_dismissals")
      .select("company_id, reason, snooze_user_id, snooze_until, created_at")
      .in("company_id", candIds);

    const today = new Date().toISOString().slice(0, 10);
    const dismissedSet = new Set<string>();
    for (const cand of candidates) {
      const lastEndDate = new Date(cand.lastPeriod + "T00:00:00Z");
      lastEndDate.setUTCMonth(lastEndDate.getUTCMonth() + 1);
      const lastEndMs = lastEndDate.getTime();
      const relevant = (dismissals ?? []).filter(
        (d: any) =>
          d.company_id === cand.company_id &&
          new Date(d.created_at).getTime() >= lastEndMs,
      );
      for (const d of relevant) {
        if (d.reason === "paused") {
          if (d.snooze_user_id === context.userId && d.snooze_until && d.snooze_until >= today) {
            dismissedSet.add(cand.company_id);
            break;
          }
        } else {
          dismissedSet.add(cand.company_id);
          break;
        }
      }
    }

    // Exclude companies that are supplied via another company (kantine-mønster)
    const suppliedSet = await getCompaniesSuppliedByOthers(context.supabase, candIds);

    const filtered = candidates.filter(
      (c) => !dismissedSet.has(c.company_id) && !suppliedSet.has(c.company_id),
    );
    filtered.sort((a, b) => b.monthlyAverageRevenue - a.monthlyAverageRevenue);
    const top = filtered.slice(0, 10);
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

type DismissReason = "lost_competitor" | "lost_tender" | "closed" | "paused";

export const dismissChurningCustomer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      company_id: string;
      reason: DismissReason;
      competitor_id?: string | null;
      expected_date?: string | null;
      snooze_days?: number | null;
      notes?: string | null;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const payload: any = {
      company_id: data.company_id,
      reason: data.reason,
      created_by: userId,
      notes: data.notes ?? null,
    };

    if (data.reason === "lost_competitor" || data.reason === "lost_tender") {
      if (!data.competitor_id) throw new Error("Konkurrent skal vælges");
      payload.competitor_id = data.competitor_id;
      payload.expected_date = data.expected_date ?? null;

      const noteText =
        data.reason === "lost_tender"
          ? `Tabt udbud${data.notes ? ` — ${data.notes}` : ""}`
          : `Tabt til konkurrent${data.notes ? ` — ${data.notes}` : ""}`;

      const { data: existing } = await supabase
        .from("competitor_assignments")
        .select("id")
        .eq("company_id", data.company_id)
        .eq("competitor_id", data.competitor_id)
        .maybeSingle();

      if (existing) {
        await supabase
          .from("competitor_assignments")
          .update({
            contract_expires_at: data.expected_date ?? null,
            notes: noteText,
          })
          .eq("id", existing.id);
      } else {
        await supabase.from("competitor_assignments").insert({
          company_id: data.company_id,
          competitor_id: data.competitor_id,
          contract_expires_at: data.expected_date ?? null,
          registered_by: userId,
          notes: noteText,
        });
      }
    } else if (data.reason === "paused") {
      const days = data.snooze_days ?? 30;
      const until = new Date();
      until.setDate(until.getDate() + days);
      payload.snooze_user_id = userId;
      payload.snooze_until = until.toISOString().slice(0, 10);
    }

    const { error } = await supabase.from("churn_dismissals").insert(payload);
    if (error) throw error;
    return { ok: true };
  });

export const listCompetitorsForSelect = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("competitors")
      .select("id, name")
      .order("name", { ascending: true });
    if (error) throw error;
    return { competitors: (data ?? []) as { id: string; name: string }[] };
  });
